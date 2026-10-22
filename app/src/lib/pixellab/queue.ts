// One job queue for every PixelLab call (architecture §9).
// Ledger rule: a record is persisted before submit, its background_job_ids right after, result PNGs the moment a job completes.
// A record with job ids is never resubmitted; reload resumes polling. A paid POST without a clear "rejected" answer (network
// error, 500/502/504, timeout) is marked lost, never resent: the server may have created and charged the job.
// Cross-tab: only the tab holding the Web Lock "pixeldoll-queue" submits/polls (leader). Other tabs (followers) mirror the
// ledger: every save posts the record id on a same-origin BroadcastChannel and the other tabs read just that record (full
// re-read every 30 s as a fallback). The leader adopts records a follower wrote, dropping duplicates of its own requests.
// Only a leader marks orphaned `submitting` records lost, so another live tab's in-flight jobs are never touched.
// Credentials stay in the connected tab. BroadcastChannel is origin-wide (including sibling Pages sites), so it carries
// only ledger notifications and a credential-free forget signal; keys are never broadcast or accepted from messages.
import { api as realApi, ApiError, errorText, isNetwork, isPolicy, rejected } from './client.ts';
import { jobIdsOf, jobImages, type Job, type Req, type SubmitResponse, type Usage } from './routes.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { base64ToBytes, bytesToBase64, pngSize } from '../image/png.ts';
import * as db from '../store/db.ts';

export type RecState = 'queued' | 'submitting' | 'running' | 'done' | 'failed' | 'cancelled' | 'lost';
export interface Result { label: string; sha: string; w?: number; h?: number }
export interface SubJob {
  id: string; // background_job_id
  status: string; // remote status word
  done: boolean;
  remoteDone?: boolean; // completed remotely, downloads may still be pending
  usage?: Usage | null;
  progress?: number;
  queuePosition?: number;
  eta?: number;
  lastPoll?: number;
  tries?: number; // failed result downloads (backoff, give up after MAX_TRIES)
  pendingUrls?: { label: string; url: string }[];
  results: Result[];
  error?: string;
  policy?: boolean;
}
export interface JobRec {
  id: string;
  label: string;
  tag?: string;
  method: Req['method'];
  endpoint: string;
  params: unknown; // request body; images replaced by {$blob: sha256}; never the key
  inputs: string[]; // input blob hashes
  requestHash: string;
  state: RecState;
  attempts: number;
  nextAt: number;
  createdAt: number;
  submittedAt?: number;
  finishedAt?: number;
  response?: unknown; // submit response, long strings stripped
  jobs: SubJob[];
  error?: string;
  autoCancelledAttempts?: number[]; // known automatic pre-submit cancellation; only a distinct explicit attempt may reopen
  gens: number;
  usd: number;
}
export type Role = 'solo' | 'leader' | 'follower';
export interface QueueSnapshot {
  jobs: JobRec[];
  role: Role;
  paused: null | 'auth' | 'credits' | 'offline'; // offline (B15): browser offline or a request got no answer; nothing is sent
  concurrency: number;
  current: number;
  sessionGens: number;
  sessionUsd: number;
  counts: Record<'pending' | 'running' | 'failed' | 'done', number>;
}

export interface Deps {
  api: <T>(key: string, method: string, path: string, body?: unknown) => Promise<T>;
  put: (key: string, rec: JobRec) => Promise<void>;
  get: (key: string) => Promise<JobRec | undefined>;
  del: (key: string) => Promise<unknown>;
  all: () => Promise<JobRec[]>;
  putBlob: (bytes: Uint8Array) => Promise<string>;
  getBlob: (sha: string) => Promise<Blob | undefined>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  now: () => number;
  locks: Pick<LockManager, 'request'> | null; // Web Locks (null = single tab)
  online: () => boolean; // navigator.onLine
}

const POLL_MS = 5000, SYNC_MS = 1500, FULL_SYNC_MS = 30_000, MAX_TRIES = 10, MAX_PX = 2048, LOCK = 'pixeldoll-queue';
const LOST_AFTER_MS = 120_000;
const PROBE_MS = 15_000;
const NO_ANIMATION_JOBS = /^Failed to start any animation jobs[.!]?$/i;
/** An accepted job identifier contradicts a retryable status, including when wrapped in last_response. */
const hasJobEvidence = (value: unknown): boolean => {
  for (let body = value; body && typeof body === 'object'; body = (body as Record<string, unknown>).last_response) {
    const b = body as Record<string, unknown>;
    if (b.background_job_id != null && b.background_job_id !== '') return true;
    if (b.background_job_ids != null && (!Array.isArray(b.background_job_ids) || b.background_job_ids.length)) return true;
  }
  return false;
};
/** B15 observed a simple root refusal on this route; any additional payload makes the paid outcome uncertain. */
const noAnimationJobsStarted = (endpoint: string, error: ApiError): boolean => {
  if (endpoint !== '/characters/animations' || error.status !== 500) return false;
  if (typeof error.body === 'string') return NO_ANIMATION_JOBS.test(error.body.trim());
  if (!error.body || typeof error.body !== 'object' || Array.isArray(error.body)) return false;
  const messages = Object.entries(error.body);
  return messages.length > 0 && messages.every(([key, message]) => (key === 'detail' || key === 'error') && typeof message === 'string' && NO_ANIMATION_JOBS.test(message.trim()));
};

export const live = (r?: JobRec) => !!r && (r.state === 'queued' || r.state === 'submitting' || r.state === 'running');
const seededOf = (r: JobRec) => typeof (r.params as { seed?: unknown } | null)?.seed === 'number';
type Msg = { forget?: boolean; rec?: string; sync?: boolean };

export const backoff = (attempt: number, rnd = Math.random()) => Math.min(60_000, 2000 * 2 ** Math.max(0, attempt - 1)) * (0.5 + 0.5 * rnd);

const strip = (v: unknown): unknown =>
  typeof v === 'string' && v.length > 300 ? `<${v.length} chars>` : Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v;

const isB64 = (v: unknown): v is { type: 'base64'; base64: string } =>
  !!v && typeof v === 'object' && (v as { type?: unknown }).type === 'base64' && typeof (v as { base64?: unknown }).base64 === 'string';

async function mapDeep(v: unknown, fn: (o: Record<string, unknown>) => Promise<unknown> | undefined): Promise<unknown> {
  if (Array.isArray(v)) return Promise.all(v.map((x) => mapDeep(x, fn)));
  if (!v || typeof v !== 'object') return v;
  const r = fn(v as Record<string, unknown>);
  if (r) return r;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = await mapDeep(x, fn);
  return out;
}

/** setInterval that keeps ticking in background tabs (worker-driven); plain setInterval where Worker is missing (node). */
let ticker: Worker | null | undefined
const ticks = new Map<number, () => void>()
let nextTick = 0
function every(ms: number, fn: () => void): () => void {
  if (ticker === undefined) {
    try {
      ticker = new Worker(new URL('./ticker.worker.ts', import.meta.url), { type: 'module' })
      ticker.onmessage = (e: MessageEvent<number>) => ticks.get(e.data)?.()
    } catch { ticker = null }
  }
  if (!ticker) { const t = setInterval(fn, ms); return () => clearInterval(t) }
  const id = ++nextTick, w = ticker
  ticks.set(id, fn)
  w.postMessage({ id, ms })
  return () => { ticks.delete(id); w.postMessage({ id }) }
}

export class Queue {
  private recs = new Map<string, JobRec>();
  private busy = new Set<string>(); // rec ids / subjob ids with an op in flight
  private listeners = new Set<(s: QueueSnapshot) => void>();
  private timer: (() => void) | null = null;
  private streak = 0;
  private deps: Deps;
  private follower: (() => void) | null = null;
  private release: (() => void) | null = null;
  private connection: AbortController | null = null;
  private connectedOnce = false;
  private keyRevision = 0; // includes Forget/reconnect with the same value; never persisted
  private submitScopes = new Map<string, { signals: Map<AbortSignal, number | undefined>; unscoped: boolean }>(); // ephemeral consumers; never persisted
  private merged = 0;
  private probeAt = 0;
  private chan: BroadcastChannel | null = null;
  role: Role = 'solo';
  key = '';
  paused: QueueSnapshot['paused'] = null;
  concurrency = 3;
  current = 3;
  sessionGens = 0;
  sessionUsd = 0;

  constructor(deps: Partial<Deps> = {}) {
    this.deps = {
      api: realApi,
      put: (k, r) => db.put('jobs', k, r),
      get: (k) => db.get<JobRec>('jobs', k),
      del: (k) => db.del('jobs', k),
      all: () => db.all<JobRec>('jobs'),
      putBlob: (b) => db.putBlob(b),
      getBlob: db.getBlob,
      fetchBytes: async (url) => {
        const r = await fetch(url); // storage CDN: no auth header, ever
        if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      },
      now: Date.now,
      locks: globalThis.navigator?.locks ?? null,
      online: () => globalThis.navigator?.onLine ?? true,
      ...deps,
    };
  }

  // ---- store contract (Svelte `$queue`) ----
  subscribe(fn: (s: QueueSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }
  snapshot(): QueueSnapshot {
    const jobs = [...this.recs.values()].sort((a, b) => a.createdAt - b.createdAt).map((r) => ({ ...r, jobs: r.jobs.map((s) => ({ ...s, results: [...s.results] })) }));
    const counts = { pending: 0, running: 0, failed: 0, done: 0 };
    for (const r of jobs) {
      if (r.state === 'queued') counts.pending++;
      else if (r.state === 'submitting' || r.state === 'running') counts.running++;
      else if (r.state === 'done') counts.done++;
      else if (r.state === 'failed' || r.state === 'lost') counts.failed++;
    }
    return { jobs, role: this.role, paused: this.paused, concurrency: this.concurrency, current: this.current, sessionGens: this.sessionGens, sessionUsd: this.sessionUsd, counts };
  }
  private emit() {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }
  private async save(r: JobRec) {
    await this.deps.put(r.id, r);
    this.chan?.postMessage({ rec: r.id } satisfies Msg); // other tabs read just this record
    this.emit();
  }
  /** Resolves with the record once it is finished (done, failed, cancelled or lost). */
  settled(id: string): Promise<JobRec> {
    return new Promise((res) => {
      let done = false;
      const un = this.subscribe((s) => {
        const r = s.jobs.find((j) => j.id === id);
        if (!done && r && !live(r)) { done = true; res(r); queueMicrotask(() => un()); }
      });
    });
  }

  // ---- lifecycle ----
  /** Become the leader if no other tab is, else mirror the ledger until the leader's tab closes. */
  async connect() {
    this.connectedOnce = true;
    this.disconnect();
    const connection = new AbortController(), { signal } = connection;
    this.connection = connection;
    const locks = this.deps.locks;
    if (!locks) { await this.load(); if (!signal.aborted) this.start(); return; }
    if (typeof BroadcastChannel !== 'undefined') {
      this.chan = new BroadcastChannel(LOCK);
      this.chan.onmessage = (e: MessageEvent<Msg>) => {
        if (signal.aborted) return;
        const m = e.data ?? {};
        if (m.forget === true) this.setKey('', false);
        if (typeof m.rec === 'string') void this.pull(m.rec);
        if (m.sync && this.role === 'follower') void this.sync();
      };
    }
    await this.sync(); // the UI has the ledger at once, whoever leads
    if (signal.aborted) return;
    const hold = () => new Promise<void>((res) => {
      if (signal.aborted) return res();
      this.release = res;
      signal.addEventListener('abort', () => res(), { once: true });
    });
    let got: boolean;
    try {
      got = await new Promise<boolean>((res, reject) => {
        void locks.request(LOCK, { ifAvailable: true }, (lock) => {
          res(!!lock && !signal.aborted);
          return lock && !signal.aborted ? hold() : undefined;
        }).catch(reject);
      });
    } catch (e) { if (signal.aborted) return; throw e; }
    if (signal.aborted) return;
    if (got) return this.lead(connection);
    this.role = 'follower';
    this.follower = every(this.chan ? FULL_SYNC_MS : SYNC_MS, () => void this.sync());
    this.emit();
    void locks.request(LOCK, { signal }, async () => {
      if (signal.aborted) return;
      await this.lead(connection);
      if (!signal.aborted) return hold();
    }).catch((e) => { if (!signal.aborted) console.error('queue lock', e); });
  }
  private async lead(connection: AbortController) {
    if (connection.signal.aborted) return;
    this.follower?.();
    this.follower = null;
    this.role = 'leader';
    this.recs.clear();
    await this.load();
    if (!connection.signal.aborted) this.start();
  }
  /** Stop driving jobs and release/cancel this connection's lock; paid requests are never resent. */
  disconnect() {
    this.connection?.abort();
    this.connection = null;
    this.stop();
    this.follower?.();
    this.follower = null;
    this.release?.();
    this.release = null;
    this.chan?.close();
    this.chan = null;
  }
  /** Follower: replace the mirror with the stored ledger. */
  async sync() {
    this.recs = new Map((await this.deps.all()).map((r) => [r.id, r]));
    this.emit();
  }
  /** One record another tab saved: a follower mirrors it, the leader adopts it. */
  private async pull(id: string) {
    const r = await this.deps.get(id);
    if (!r) return;
    if (this.role === 'follower') { this.recs.set(id, r); this.emit(); }
    else if (this.role === 'leader' && this.adopt(r)) this.emit();
  }
  /** Leader: full re-read fallback (a missed channel message). */
  private async merge() {
    let changed = false;
    for (const r of await this.deps.all()) changed = this.adopt(r) || changed;
    if (changed) this.emit();
  }
  /** Leader: adopt a record another tab enqueued (unless it repeats a live or cached request of mine: R6 P1-1), or its cancel
   * of a still-queued record. */
  private adopt(r: JobRec): boolean {
    const mine = this.recs.get(r.id);
    if (!mine) {
      const dup = r.state === 'queued' && [...this.recs.values()].find((x) => x.requestHash === r.requestHash && (live(x) || (x.state === 'done' && seededOf(x))));
      this.recs.set(r.id, r);
      if (dup) {
        Object.assign(r, { state: 'cancelled', error: `duplicate of ${dup.id} (sent from two tabs)`, finishedAt: this.deps.now() });
        void this.save(r).catch((e) => console.error('queue', e));
      }
      return true;
    }
    if (mine.state === 'queued' && r.state === 'cancelled' && !this.busy.has(r.id)) { Object.assign(mine, { state: r.state, finishedAt: r.finishedAt }); return true; }
    return false;
  }
  async load() {
    for (const r of await this.deps.all()) {
      // Crashed between "submitting" and saving the job id: the server may have it. Never auto-resubmit.
      if (r.state === 'submitting') {
        r.state = 'lost';
        r.error = 'page closed during submit; the job may have run (check pixellab.ai). Not resubmitted.';
        await this.deps.put(r.id, r);
      }
      this.recs.set(r.id, r);
    }
    this.emit();
  }
  start() {
    this.timer ??= every(1000, () => void this.tick());
  }
  stop() {
    this.timer?.();
    this.timer = null;
  }
  /** Forget stops connected tabs without sharing credentials. A new key belongs only to this tab. */
  setKey(key: string, notifyForget = true) {
    this.keyRevision++;
    this.key = key;
    if (!key && notifyForget) this.chan?.postMessage({ forget: true } satisfies Msg);
    if (key && this.paused === 'auth') this.paused = null;
    this.emit();
  }
  resume() {
    this.paused = null;
    this.emit();
  }
  setConcurrency(n: number) {
    if (!Number.isFinite(n)) return; // preserve the last valid capacity; NaN would bypass the scheduler limit
    this.concurrency = this.current = Math.max(1, Math.min(8, Math.round(n)));
    this.emit();
  }

  // ---- enqueue ----
  // Identical request (same endpoint + params + input images, explicit seed) reuses the stored record instead of paying again.
  // Paid requests are resume-safe by default; a new seed expresses an intentional re-roll. meta.cache also reuses
  // unseeded done GET records (deterministic routes such as GET /characters).
  async enqueue(req: Req, meta: { label?: string; tag?: string; cache?: boolean; resumeSafe?: boolean; signal?: AbortSignal; attempt?: number } = {}): Promise<JobRec> {
    const connection = this.connection;
    const assertConnected = () => {
      meta.signal?.throwIfAborted(); // orchestration cancellation stops publication, never aborts a paid HTTP request
      if (this.connectedOnce && (!this.connection || this.connection !== connection)) throw new Error('Queue disconnected. Reload PixelDoll before starting more work.');
    };
    assertConnected();
    const inputs: string[] = [];
    const params = await mapDeep(req.body ?? null, (o) => {
      if (!isB64(o)) return undefined;
      return (async () => {
        const sha = await this.deps.putBlob(base64ToBytes(o.base64));
        inputs.push(sha);
        return { ...o, base64: undefined, $blob: sha };
      })();
    });
    const requestHash = await sha256(stableStringify({ method: req.method, endpoint: req.path, params }));
    assertConnected(); // obsolete async flows cannot publish another request during disconnect/HMR navigation
    const seeded = typeof (params as { seed?: unknown } | null)?.seed === 'number';
    // A resumed paid flow must never turn a terminal/unknown outcome into another submission. Explicit re-rolls change seed.
    const resumeSafe = meta.resumeSafe ?? req.method === 'POST';
    const matches = [...this.recs.values()].filter((r) => r.requestHash === requestHash).reverse().sort((a, b) => b.createdAt - a.createdAt);
    // Historical duplicates can exist from older versions. Prefer useful newer work before considering an old failure.
    const active = matches.find(live);
    if (active) {
      if (active.state !== 'running') this.observeScope(active.id, meta.signal, meta.attempt);
      return active;
    }
    const done = matches.find((r) => r.state === 'done');
    if (done && (seeded || meta.cache || resumeSafe)) return done;
    if (resumeSafe) {
      const terminal = matches.find((r) => !(r.state === 'cancelled' && Number.isSafeInteger(meta.attempt) && r.autoCancelledAttempts?.length && !r.autoCancelledAttempts.includes(meta.attempt!)));
      if (terminal) return terminal;
    }
    const now = this.deps.now();
    const rec: JobRec = {
      id: crypto.randomUUID(),
      label: meta.label ?? req.path,
      tag: meta.tag,
      method: req.method,
      endpoint: req.path,
      params,
      inputs,
      requestHash,
      state: 'queued',
      attempts: 0,
      nextAt: 0,
      createdAt: now,
      jobs: [],
      gens: 0,
      usd: 0,
    };
    this.recs.set(rec.id, rec);
    this.observeScope(rec.id, meta.signal, meta.attempt);
    await this.save(rec);
    return rec;
  }

  /** A deduplicated request may serve several flows. One failed consumer cannot cancel another consumer's work. */
  private observeScope(id: string, signal?: AbortSignal, attempt?: number) {
    let consumers = this.submitScopes.get(id);
    if (!consumers) this.submitScopes.set(id, consumers = { signals: new Map(), unscoped: false });
    if (!signal) { consumers.unscoped = true; return; }
    if (consumers.signals.has(signal)) return;
    consumers.signals.set(signal, Number.isSafeInteger(attempt) ? attempt : undefined);
    signal.addEventListener('abort', () => {
      if (this.flowAborted(id)) {
        const r = this.recs.get(id);
        if (r?.state === 'queued') r.autoCancelledAttempts = this.cancellationAttempts(id);
        void this.cancel(id, true).catch(() => {});
      }
    }, { once: true });
  }
  private flowAborted(id: string): boolean {
    const consumers = this.submitScopes.get(id);
    return !!consumers && !consumers.unscoped && consumers.signals.size > 0 && [...consumers.signals.keys()].every((s) => s.aborted);
  }
  private cancellationAttempts(id: string): number[] | undefined {
    const consumers = this.submitScopes.get(id), attempts = [...(consumers?.signals.values() ?? [])];
    return consumers && !consumers.unscoped && attempts.length && attempts.every((a) => a !== undefined)
      ? [...new Set(attempts as number[])] : undefined;
  }

  // ---- the loop ----
  /** B15: offline -> pause (nothing is sent, so no paid call can be lost to a dead connection); a request that got no
   * answer pauses too. Resume when the browser is online again and, for the leader, a free GET /balance gets through. */
  goOffline() {
    if (this.paused) return; // auth / credits stay the stronger reason
    this.paused = 'offline';
    this.probeAt = this.deps.now() + 3000;
    this.emit();
  }
  private async network(now: number): Promise<boolean> {
    if (!this.deps.online()) { this.goOffline(); return false; }
    if (this.paused !== 'offline') return true;
    if (this.role === 'follower' || !this.key) { this.resume(); return true; } // nothing to probe with: trust the browser
    if (now < this.probeAt) return false;
    this.probeAt = now + PROBE_MS;
    const credentialRevision = this.keyRevision;
    try { await this.deps.api(this.key, 'GET', '/balance'); } catch (e) {
      if (credentialRevision !== this.keyRevision) return false;
      if (isNetwork(e)) return false;
      if (e instanceof ApiError && (e.kind === 'auth' || e.kind === 'credits')) { this.paused = e.kind; this.emit(); return false; }
    }
    if (credentialRevision !== this.keyRevision) return false;
    if (this.paused === 'offline') this.resume();
    return true;
  }
  async tick(): Promise<void> {
    const connection = this.connection;
    const disconnected = () => this.connectedOnce && (!this.connection || this.connection !== connection || connection?.signal.aborted);
    if (disconnected()) return;
    const now = this.deps.now();
    if (!(await this.network(now)) || disconnected()) return;
    if (this.role === 'follower') return; // the leader tab submits and polls
    if (this.role === 'leader' && now - this.merged >= (this.chan ? FULL_SYNC_MS : SYNC_MS)) { this.merged = now; await this.merge(); }
    if (disconnected()) return; // a suspended tick cannot drive jobs after its lock/session was released
    const ops: Promise<void>[] = [];
    if (this.key && !this.paused) {
      let active = [...this.recs.values()].filter((r) => r.state === 'submitting' || r.state === 'running').length;
      for (const r of [...this.recs.values()].sort((a, b) => a.createdAt - b.createdAt)) {
        if (active >= this.current) break;
        if (r.state !== 'queued' || r.nextAt > now || this.busy.has(r.id)) continue;
        active++;
        ops.push(this.guard(r.id, () => this.submit(r)));
      }
    }
    if (this.key && this.paused !== 'auth')
      for (const r of this.recs.values()) {
        if (r.state !== 'running') continue;
        for (const s of r.jobs) {
          if (s.done || this.busy.has(s.id)) continue;
          if (s.remoteDone) { if (!s.tries || now - (s.lastPoll ?? 0) >= backoff(s.tries)) ops.push(this.guard(s.id, () => this.download(r, s))); }
          else if (!s.lastPoll || now - s.lastPoll >= POLL_MS) ops.push(this.guard(s.id, () => this.poll(r, s)));
        }
      }
    await Promise.all(ops);
  }
  private async guard(id: string, fn: () => Promise<void>) {
    this.busy.add(id);
    try { await fn(); } catch (e) { console.error('queue', e); } finally { this.busy.delete(id); }
  }

  private async submit(r: JobRec) {
    const connection = this.connection;
    let credentialRevision: number | undefined;
    r.state = 'submitting';
    r.attempts++;
    await this.save(r); // persisted before the request leaves
    try {
      const body = await mapDeep(r.params, (o) => { // inside the try: a missing input fails the record, never sticks it in `submitting`
        if (typeof o.$blob !== 'string') return undefined;
        const { $blob, ...rest } = o;
        return (async () => {
          const blob = await this.deps.getBlob($blob as string);
          if (!blob) throw new Error(`input image ${($blob as string).slice(0, 12)} missing from storage; nothing was sent`);
          return { ...rest, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
        })();
      });
      // Persisting and rehydrating inputs await storage. A released queue or failed sibling must not send afterward.
      if ((this.connectedOnce && (!this.connection || this.connection !== connection || connection?.signal.aborted)) || this.flowAborted(r.id)) {
        Object.assign(r, { state: 'cancelled', error: 'Request stopped before sending. No API request was made.', finishedAt: this.deps.now(), autoCancelledAttempts: this.cancellationAttempts(r.id) });
        this.submitScopes.delete(r.id);
        await this.save(r);
        return;
      }
      // Once invoked, HTTP may have left the browser. Scope cancellation never aborts it or changes uncertainty handling.
      r.submittedAt = this.deps.now();
      credentialRevision = this.keyRevision;
      const response = this.deps.api<SubmitResponse>(this.key, r.method, r.endpoint, body ?? undefined);
      this.emit(); // notify only after HTTP invocation; listeners cannot reopen the guarded pre-submit boundary
      const res = await response;
      r.response = strip(res);
      const ids = jobIdsOf(res);
      r.jobs = ids.map((id) => ({ id, status: 'submitted', done: false, results: [] }));
      if (ids.length) r.state = 'running';
      else this.finish(r, res.usage); // synchronous route (estimate-skeleton, balance)
      if (++this.streak >= 5 && this.current < this.concurrency) { this.current++; this.streak = 0; }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(-1, 'other', (e as Error)?.message ?? String(e));
      const currentCredential = credentialRevision === this.keyRevision;
      r.error = err.message;
      this.streak = 0;
      // refused before any job existed; B15 live: a 500 "Failed to start any animation jobs" (busy account) said so in words
      if (r.method === 'POST' && hasJobEvidence(err.body)) {
        // Accepted-job evidence outranks every error classification, including auth/credits that normally wait for reconnection.
        if (currentCredential && (err.kind === 'auth' || err.kind === 'credits')) this.paused = err.kind;
        r.state = 'lost';
        r.response = strip(err.body); // retain the known identifiers for manual review without resubmitting
        r.error = `PixelLab returned job evidence with an error (${err.message}). The request may have run and been charged; not resent.`;
        r.finishedAt = this.deps.now();
      } else if (err.kind === 'retry' && (r.method !== 'POST' || rejected(err.status) || noAnimationJobsStarted(r.endpoint, err))) {
        if (err.status === 429) this.current = Math.max(1, this.current - 1);
        r.state = 'queued';
        r.nextAt = this.deps.now() + backoff(r.attempts);
      } else if (err.kind === 'retry') { // R6 P1-3: the paid job may exist; resending could pay twice
        r.state = 'lost';
        r.error = `no clear answer from PixelLab (${err.message}). The job may have run and been charged (check pixellab.ai); not resent.`;
        r.finishedAt = this.deps.now();
        if (currentCredential && isNetwork(err)) this.goOffline(); // B15: stop here instead of losing the next queued job too
      } else if (err.kind === 'auth' || err.kind === 'credits') {
        if (currentCredential) this.paused = err.kind;
        r.state = 'queued';
      } else {
        r.state = 'failed';
        r.finishedAt = this.deps.now();
      }
    }
    if (r.state !== 'queued') this.submitScopes.delete(r.id);
    await this.save(r);
  }

  private async poll(r: JobRec, s: SubJob) {
    s.lastPoll = this.deps.now();
    let job: Job;
    const credentialRevision = this.keyRevision;
    try {
      job = await this.deps.api<Job>(this.key, 'GET', `/background-jobs/${encodeURIComponent(s.id)}`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.kind === 'auth') { s.error = e.message; if (credentialRevision === this.keyRevision) this.paused = 'auth'; }
      else if (isNetwork(e)) { s.error = e.message; if (credentialRevision === this.keyRevision) this.goOffline(); } // B15
      else if (e.kind === 'notfound' && this.deps.now() - (r.submittedAt ?? 0) > LOST_AFTER_MS) {
        s.done = true;
        s.status = 'lost';
        s.error = 'job not found (auto-deleted before results were saved; cost may be spent)';
        this.settle(r);
      } else s.error = e.message; // transient: poll again in 5 s, never resubmit
      return this.save(r);
    }
    const lr = job.last_response;
    s.status = job.status;
    s.progress = lr?.progress;
    s.queuePosition = lr?.queue_position;
    s.eta = lr?.estimated_wait_seconds;
    s.error = undefined;
    if (job.status === 'failed' || isPolicy(job)) {
      s.done = true;
      s.usage = job.usage;
      s.policy = isPolicy(job);
      s.error = errorText(job);
      this.settle(r);
    } else if (job.status === 'cancelled') {
      s.done = true;
      s.usage = job.usage;
      this.settle(r);
    } else if (job.status === 'completed') {
      s.usage = job.usage;
      const ims = jobImages(lr);
      try { // validate every inline image before anything counts as done (R6 P2-11)
        if (!ims.length) throw new Error('no images');
        for (const im of ims) if (!im.url) await this.saveResult(s, im.label, base64ToBytes(im.b64 ?? im.rgba?.b64 ?? ''), im.rgba);
      } catch (e) {
        Object.assign(s, { done: true, status: 'failed', results: [], error: `PixelLab sent a malformed result (${(e as Error).message}); the cost may be spent` });
        this.settle(r);
        return this.save(r);
      }
      s.remoteDone = true;
      s.pendingUrls = ims.filter((im) => im.url).map((im) => ({ label: im.label, url: im.url! }));
      await this.save(r); // inline images are safe now; URLs are persisted for download
      return this.download(r, s);
    }
    await this.save(r);
  }

  private async saveResult(s: SubJob, label: string, bytes: Uint8Array, rgba?: { w: number; h: number }) {
    // ponytail: rgba_bytes results are stored raw (type octet-stream); encode to PNG when a route actually returns them.
    const size = rgba ? (bytes.length === rgba.w * rgba.h * 4 ? { w: rgba.w, h: rgba.h } : null) : pngSize(bytes);
    if (!size || !(size.w > 0 && size.h > 0 && size.w <= MAX_PX && size.h <= MAX_PX)) throw new Error(`${label}: not a valid image`);
    const sha = await this.deps.putBlob(bytes);
    s.results.push({ label, sha, ...size });
  }

  private async download(r: JobRec, s: SubJob) {
    try {
      while (s.pendingUrls?.length) {
        const { label, url } = s.pendingUrls[0];
        await this.saveResult(s, label, await this.deps.fetchBytes(url));
        s.pendingUrls.shift();
        await this.save(r);
      }
    } catch (e) { // storage CDN error or bad bytes: back off (tick), give up after MAX_TRIES with the URLs kept (R6 P2-9)
      if (e instanceof TypeError || !this.deps.online()) { s.lastPoll = this.deps.now(); this.goOffline(); return this.save(r); } // B15: no connection is not a failed try
      s.tries = (s.tries ?? 0) + 1;
      s.lastPoll = this.deps.now();
      s.error = `result download failed ${s.tries}x: ${(e as Error).message}`;
      if (s.tries >= MAX_TRIES) {
        Object.assign(s, { done: true, status: 'failed', error: `${s.error}. Download manually: ${s.pendingUrls!.map((u) => u.url).join(' ')}` });
        this.settle(r);
      }
      return this.save(r);
    }
    s.done = true;
    s.error = undefined;
    this.settle(r);
    await this.save(r);
  }

  private settle(r: JobRec) {
    if (!r.jobs.every((s) => s.done)) return;
    const failed = r.jobs.filter((s) => s.error);
    if (failed.length) r.error = failed.map((s) => s.error).join(' | ');
    const cancelled = r.jobs.every((s) => s.status === 'cancelled');
    const lost = r.jobs.every((s) => s.status === 'lost');
    this.finish(r, null, cancelled ? 'cancelled' : lost ? 'lost' : failed.length === r.jobs.length ? 'failed' : 'done');
  }
  private finish(r: JobRec, usage?: Usage | null, state: RecState = 'done') {
    const usages = usage ? [usage] : r.jobs.map((s) => s.usage).filter((u): u is Usage => !!u);
    r.gens = usages.reduce((n, u) => n + (u.generations ?? 0), 0);
    r.usd = usages.reduce((n, u) => n + (u.usd ?? 0), 0);
    this.sessionGens += r.gens;
    this.sessionUsd += r.usd;
    r.state = state;
    r.finishedAt = this.deps.now();
  }

  // ---- user actions ----
  async cancel(id: string, queuedOnly = false) {
    const r = this.recs.get(id);
    if (!r || (queuedOnly && r.state !== 'queued')) return;
    if (!queuedOnly) delete r.autoCancelledAttempts; // an explicit user cancellation is never reopened by recovery
    if (this.role === 'follower' && r.state === 'running') { // the leader's next poll sees the cancel; never write its record
      for (const s of r.jobs.filter((s) => !s.done)) await this.deps.api(this.key, 'DELETE', `/background-jobs/${encodeURIComponent(s.id)}`).catch(() => {});
      return;
    }
    if (r.state === 'queued') {
      this.submitScopes.delete(r.id);
      r.state = 'cancelled';
      r.finishedAt = this.deps.now();
    } else if (r.state === 'running') {
      for (const s of r.jobs.filter((s) => !s.done && !s.remoteDone)) {
        try {
          await this.deps.api(this.key, 'DELETE', `/background-jobs/${encodeURIComponent(s.id)}`);
          s.done = true;
          s.status = 'cancelled';
        } catch (e) {
          s.error = (e as Error).message; // 400/409: already finished -> polling picks up the result
        }
      }
      this.settle(r);
    }
    await this.save(r);
  }
  /** Leader/solo: delete finished records unless `keep` says something still needs them (drafts re-read their calls, resumable
   * creates/moves re-attach through the request cache: R6 P1-2). Returns the number deleted. */
  async clearFinished(keep: (r: JobRec) => boolean): Promise<number> {
    if (this.role === 'follower') return 0; // the leader owns the ledger
    let n = 0;
    for (const r of [...this.recs.values()])
      if (!live(r) && !keep(r)) {
        this.recs.delete(r.id);
        await this.deps.del(r.id).catch(() => {});
        n++;
      }
    this.chan?.postMessage({ sync: true } satisfies Msg);
    this.emit();
    return n;
  }
  /** Nothing queued, submitting or running in this tab's view of the ledger. */
  idle = () => ![...this.recs.values()].some(live);
}

export const queue = new Queue();

// Fake API + in-memory store: persist-before-submit, 429 backoff, poll -> save, resume without resubmit, cache.
export async function selfTest() {
  const store = new Map<string, JobRec>(), blobs = new Map<string, Uint8Array>();
  let t = 1000, submits = 0, polls = 0, fail429 = 1;
  const pngB64 = bytesToBase64(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64]));
  const deps: Partial<Deps> = {
    now: () => t,
    put: async (k, r) => void store.set(k, structuredClone(r)),
    get: async (k) => structuredClone(store.get(k)),
    del: async (k) => store.delete(k),
    all: async () => [...store.values()].map((r) => structuredClone(r)),
    putBlob: async (b) => { const k = await sha256(b); blobs.set(k, b); return k; },
    getBlob: async (k) => (blobs.has(k) ? new Blob([blobs.get(k) as Uint8Array<ArrayBuffer>]) : undefined),
    fetchBytes: async () => base64ToBytes(pngB64),
    api: async <T>(_k: string, method: string, path: string, body?: unknown): Promise<T> => {
      if (method === 'POST') {
        const persisted = [...store.values()].find((r) => r.endpoint === path);
        console.assert(persisted?.state === 'submitting', 'ledger persisted before submit');
        console.assert((body as { image?: { base64?: string } }).image?.base64 === pngB64, 'input image rehydrated');
        if (fail429-- > 0) throw new ApiError(429, 'retry', 'busy');
        submits++;
        return { background_job_ids: ['j1', 'j2'] } as T;
      }
      polls++;
      const id = path.split('/').pop();
      if (polls < 3) return { id, status: 'processing', created_at: '', last_response: { queue_position: 2 } } as T;
      return (id === 'j1'
        ? { id, status: 'completed', created_at: '', usage: { type: 'generations', generations: 1.5 }, last_response: { direction: 'south', images: [{ type: 'base64', base64: pngB64 }] } }
        : { id, status: 'completed', created_at: '', usage: { type: 'generations', generations: 0.5 }, last_response: { storage_urls: { east: 'https://x/e.png' } } }) as T;
    },
  };
  const q = new Queue(deps);
  q.key = 'k';
  const req = { method: 'POST' as const, path: '/x', body: { image: { type: 'base64', base64: pngB64 }, seed: 1 } };
  const rec = await q.enqueue(req);
  console.assert(!JSON.stringify(store.get(rec.id)).includes(pngB64), 'ledger stores blob refs, not base64');
  await q.tick();
  console.assert(store.get(rec.id)?.state === 'queued' && q.current === 2 && store.get(rec.id)!.nextAt > t, '429 -> requeue with backoff, concurrency down');
  t += 60_000;
  await q.tick();
  console.assert(submits === 1 && store.get(rec.id)?.jobs.map((s) => s.id).join() === 'j1,j2', 'job ids persisted after submit');
  // reload mid-job: new queue resumes polling, never resubmits
  const q2 = new Queue(deps);
  q2.key = 'k';
  await q2.load();
  for (let i = 0; i < 4; i++) { t += POLL_MS; await q2.tick(); }
  const done = store.get(rec.id)!;
  console.assert(submits === 1, 'resume did not resubmit');
  console.assert(done.state === 'done' && done.gens === 2, `done with summed usage (${done.state}, ${done.gens})`);
  console.assert(done.jobs[0].results[0]?.label === 'south/0' && done.jobs[1].results[0]?.label === 'east' && done.jobs[1].results[0]?.w === 64, 'results saved (inline + url)');
  const again = await q2.enqueue(req);
  console.assert(again.id === rec.id && submits === 1, 'request-hash cache hit');
  console.assert(backoff(1, 1) === 2000 && backoff(10, 1) === 60000 && backoff(2, 0) === 2000, 'backoff');
  await robustTest();
  await offlineTest();
  await notStartedTest();
  await handoffTest();
  await disconnectedLockTest();
  await lockTest();
}

// B15 live: POST /characters/animations -> 500 "Failed to start any animation jobs" is a refusal: resent, not lost.
async function notStartedTest() {
  const store = new Map<string, JobRec>();
  let t = 1000, posts = 0;
  const q = new Queue({
    now: () => t, online: () => true,
    put: async (k, r) => void store.set(k, structuredClone(r)), get: async (k) => structuredClone(store.get(k)), del: async (k) => store.delete(k),
    all: async () => [...store.values()].map((r) => structuredClone(r)), putBlob: async () => 'x', getBlob: async () => undefined, fetchBytes: async () => new Uint8Array(),
    api: async <T>(_k: string, method: string): Promise<T> => {
      if (method === 'POST' && ++posts === 1) throw new ApiError(500, 'retry', 'POST /characters/animations -> 500: Failed to start any animation jobs', { detail: 'Failed to start any animation jobs' });
      return (method === 'POST' ? { background_job_ids: ['j'] } : { id: 'j', status: 'processing', created_at: '' }) as T;
    },
  });
  q.key = 'k';
  const r = await q.enqueue({ method: 'POST', path: '/characters/animations', body: { seed: 1 } });
  await q.tick();
  console.assert(store.get(r.id)?.state === 'queued', `not started: requeued (${store.get(r.id)?.state})`);
  t += 60_000; await q.tick();
  console.assert(store.get(r.id)?.state === 'running' && posts === 2, `then resent once (${store.get(r.id)?.state} ${posts})`);
}

// B15: offline -> nothing is sent (no paid POST can be lost), a request with no answer pauses the queue, a free GET /balance
// probe resumes it once PixelLab answers again.
async function offlineTest() {
  const store = new Map<string, JobRec>();
  let t = 1000, online = false, net = false, posts = 0, probes = 0;
  const q = new Queue({
    now: () => t, online: () => online,
    put: async (k, r) => void store.set(k, structuredClone(r)), get: async (k) => structuredClone(store.get(k)), del: async (k) => store.delete(k),
    all: async () => [...store.values()].map((r) => structuredClone(r)), putBlob: async () => 'x', getBlob: async () => undefined, fetchBytes: async () => new Uint8Array(),
    api: async <T>(_k: string, method: string, path: string): Promise<T> => {
      if (net) throw new ApiError(0, 'retry', 'network error: Failed to fetch', { network: true });
      if (path === '/balance') { probes++; return {} as T; }
      if (method === 'POST') { posts++; return { background_job_id: `j${posts}` } as T; }
      return { id: 'j', status: 'processing', created_at: '' } as T;
    },
  });
  q.key = 'k';
  const a = await q.enqueue({ method: 'POST', path: '/a', body: { seed: 1 } });
  await q.tick();
  console.assert(q.paused === 'offline' && posts === 0 && store.get(a.id)?.state === 'queued', 'browser offline: paused, nothing sent');
  online = true; t += 1000;
  await q.tick();
  console.assert(q.paused === 'offline' && probes === 0, 'probe waits a few seconds');
  t += 3000;
  await q.tick();
  console.assert(!q.paused && probes === 1 && posts === 1 && store.get(a.id)?.state === 'running', `online again: probe, resume, submit (${q.paused} ${probes} ${posts})`);
  net = true; t += POLL_MS;
  await q.tick(); // the poll gets no answer
  const b = await q.enqueue({ method: 'POST', path: '/b', body: { seed: 2 } });
  t += 1000; await q.tick();
  console.assert(q.paused === 'offline' && posts === 1 && store.get(b.id)?.state === 'queued' && store.get(a.id)?.state === 'running', 'no answer: paused, next job kept queued, running job kept');
  t += PROBE_MS; await q.tick();
  console.assert(q.paused === 'offline', 'a probe without an answer stays offline');
  net = false; t += PROBE_MS; await q.tick();
  console.assert(!q.paused && posts === 2, `answer again: resumed (${q.paused} ${posts})`);
}

// B13 (R6 P1-2, P1-3, P2-9, P2-10, P2-11): uncertain POSTs are never resent, refusals are; a missing input fails at once;
// a failing download backs off and gives up; a malformed result never becomes done; Clear finished keeps what callers need.
async function robustTest() {
  const store = new Map<string, JobRec>(), blobs = new Map<string, Uint8Array>(), posts: Record<string, number> = {};
  let t = 1000, gets = 0, fetches = 0;
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64]);
  const q = new Queue({
    now: () => t,
    put: async (k, r) => void store.set(k, structuredClone(r)),
    get: async (k) => structuredClone(store.get(k)),
    del: async (k) => store.delete(k),
    all: async () => [...store.values()].map((r) => structuredClone(r)),
    putBlob: async (b) => { const k = await sha256(b); blobs.set(k, b); return k; },
    getBlob: async (k) => (blobs.has(k) ? new Blob([blobs.get(k) as Uint8Array<ArrayBuffer>]) : undefined),
    fetchBytes: async () => { fetches++; throw new Error('GET https://x/e.png -> 403'); },
    api: async <T>(_k: string, method: string, path: string): Promise<T> => {
      if (method === 'GET' && path.startsWith('/characters/')) { gets++; if (gets === 1) throw new ApiError(0, 'retry', 'network error: reset'); return {} as T; }
      if (method === 'GET') { // polls: j-url completes with a storage URL, j-bad with a broken inline image
        const id = path.split('/').pop();
        if (id === 'j') return { id, status: 'processing', created_at: '' } as T;
        return (id === 'j-url'
          ? { id, status: 'completed', created_at: '', last_response: { storage_urls: { east: 'https://x/e.png' } } }
          : { id, status: 'completed', created_at: '', last_response: { images: [{ type: 'base64' }] } }) as T;
      }
      posts[path] = (posts[path] ?? 0) + 1;
      if (path === '/net') throw new ApiError(0, 'retry', 'network error: Failed to fetch');
      if (path === '/gw') throw new ApiError(502, 'retry', 'POST /gw -> 502');
      if (path === '/busy' && posts[path] === 1) throw new ApiError(503, 'retry', 'POST /busy -> 503');
      return { background_job_id: path === '/url' ? 'j-url' : path === '/bad' ? 'j-bad' : 'j' } as T;
    },
  });
  q.key = 'k';
  const run = async (n: number, dt = 1000) => { for (let i = 0; i < n; i++) { t += dt; await q.tick(); } };
  const net = await q.enqueue({ method: 'POST', path: '/net', body: { seed: 1 } });
  const gw = await q.enqueue({ method: 'POST', path: '/gw', body: { seed: 1 } });
  const busy = await q.enqueue({ method: 'POST', path: '/busy', body: { seed: 1 } });
  const ch = await q.enqueue({ method: 'GET', path: '/characters/c1' });
  const img = await q.enqueue({ method: 'POST', path: '/img', body: { image: { type: 'base64', base64: bytesToBase64(png) }, seed: 1 } });
  blobs.clear(); // the input image vanished (cleared site data, GC bug)
  await run(1);
  await run(70, 1000);
  const st = (r: JobRec) => store.get(r.id)!;
  console.assert(st(net).state === 'lost' && st(gw).state === 'lost' && posts['/net'] === 1 && posts['/gw'] === 1, `network error / 502 on a paid POST: lost, sent once (${st(net).state} ${posts['/net']}, ${st(gw).state} ${posts['/gw']})`);
  console.assert(/may have run/.test(st(net).error ?? ''), 'lost says the job may have run');
  console.assert(st(busy).state === 'lost' && posts['/busy'] === 1, `generic 503 is uncertain and never resent (${st(busy).state} ${posts['/busy']})`);
  console.assert(st(ch).state === 'done' && gets === 2, `GET retries after a network error (${st(ch).state} ${gets})`);
  console.assert(st(img).state === 'failed' && !posts['/img'] && /missing/.test(st(img).error ?? ''), `missing input image: failed, nothing sent (${st(img).state})`);

  const url = await q.enqueue({ method: 'POST', path: '/url', body: { seed: 2 } });
  const bad = await q.enqueue({ method: 'POST', path: '/bad', body: { seed: 2 } });
  await run(600); // 10 minutes of 1 s ticks
  console.assert(st(url).state === 'failed' && fetches === MAX_TRIES && /Download manually: https:\/\/x\/e.png/.test(st(url).error ?? ''), `failing download backs off and gives up (${st(url).state}, ${fetches} GETs)`);
  console.assert(st(bad).state === 'failed' && !st(bad).jobs[0].results.length && /malformed/.test(st(bad).error ?? ''), `malformed result is not done (${st(bad).state})`);

  const keep = new Set([url.id]);
  const n = await q.clearFinished((r) => keep.has(r.id));
  console.assert(store.has(url.id) && !store.has(bad.id) && !store.has(busy.id) && n === 6, `clear finished keeps referenced records and removes terminal unknowns (${n})`);
}

/** A minimal Web Locks stand-in: one holder, FIFO waiters, ifAvailable. */
function fakeLocks(): Pick<LockManager, 'request'> {
  let held = false;
  const waiters: (() => void)[] = [];
  const grant = async (cb: LockGrantedCallback<unknown>) => { held = true; try { return await cb({ name: LOCK, mode: 'exclusive' }); } finally { held = false; waiters.shift()?.(); } };
  return {
    request: ((_name: string, a: LockOptions | LockGrantedCallback<unknown>, b?: LockGrantedCallback<unknown>) => {
      const [opts, cb] = typeof a === 'function' ? [{} as LockOptions, a] : [a, b!];
      if (opts.ifAvailable && opts.signal) return Promise.reject(new DOMException('signal and ifAvailable cannot be combined', 'NotSupportedError'));
      if (!held) return grant(cb);
      if (opts.ifAvailable) return Promise.resolve(cb(null));
      return new Promise<unknown>((res) => waiters.push(() => res(grant(cb))));
    }) as LockManager['request'],
  };
}

// Two tabs on one ledger: one leader submits, the follower never submits, never marks the leader's in-flight jobs lost, and
// takes over (and only then cleans up orphans) when the leader's tab goes away.
async function lockTest() {
  const store = new Map<string, JobRec>(), locks = fakeLocks(), tick = () => new Promise((r) => setTimeout(r, 0));
  let t = 1000, submits = 0;
  const deps: Partial<Deps> = {
    now: () => t, locks,
    put: async (k, r) => void store.set(k, structuredClone(r)),
    get: async (k) => structuredClone(store.get(k)),
    del: async (k) => store.delete(k),
    all: async () => [...store.values()].map((r) => structuredClone(r)),
    putBlob: async () => 'x', getBlob: async () => undefined, fetchBytes: async () => new Uint8Array(),
    api: async <T>(_k: string, method: string, path: string): Promise<T> => {
      if (method === 'POST' && path === '/hang') return new Promise<T>(() => {}); // in flight forever
      if (method === 'POST') { submits++; return { background_job_id: `j${submits}` } as T; }
      return { id: 'j', status: 'processing', created_at: '' } as T;
    },
  };
  const a = new Queue(deps), b = new Queue(deps);
  await a.connect();
  await b.connect();
  console.assert(a.role === 'leader' && b.role === 'follower' && b.snapshot().role === 'follower', `roles ${a.role}/${b.role}`);
  const spy = new BroadcastChannel(LOCK), heard: unknown[] = [];
  spy.onmessage = (e) => heard.push(e.data);
  b.setKey('synthetic-follower-token');
  await new Promise((r) => setTimeout(r, 20));
  console.assert(a.key === '' && b.key === 'synthetic-follower-token', 'typed key stays private to the connected tab');
  console.assert(!JSON.stringify(heard).includes('synthetic-follower-token'), 'an origin-wide listener never receives typed credentials');
  spy.postMessage({ key: 'synthetic-injected-token' }); // old or malicious same-origin sender
  spy.postMessage({ ask: true });
  await new Promise((r) => setTimeout(r, 20));
  console.assert(a.key === '' && b.key === 'synthetic-follower-token', 'credential injection and key requests are ignored');
  a.setKey('k');
  a.paused = 'auth';
  b.setKey('synthetic-replacement-token');
  await new Promise((r) => setTimeout(r, 20));
  console.assert(a.key === 'k' && a.paused === 'auth', 'a follower cannot replace a rejected leader credential');
  console.assert(!JSON.stringify(heard).includes('synthetic-replacement-token'), 'replacement credentials are never broadcast');
  b.setKey('');
  for (let i = 0; i < 20 && a.key; i++) await new Promise((r) => setTimeout(r, 5));
  console.assert(a.key === '', 'credential-free Forget signal stops the leader');
  console.assert(!heard.some((m) => typeof (m as Record<string, unknown>).key === 'string'), 'queue notifications never contain a key');
  spy.close();
  a.setKey('k'); b.setKey('k');
  const hang = await a.enqueue({ method: 'POST', path: '/hang', body: { seed: 1 } });
  void a.tick();
  await tick();
  console.assert(store.get(hang.id)?.state === 'submitting', 'leader submit in flight');
  const c = new Queue(deps); // a third tab opening now must not rewrite it to lost
  await c.connect();
  console.assert(c.role === 'follower' && store.get(hang.id)?.state === 'submitting', 'follower load keeps the in-flight record');
  const fromB = await b.enqueue({ method: 'POST', path: '/x', body: { seed: 2 } });
  const dupB = await b.enqueue({ method: 'POST', path: '/x', body: { seed: 2 } });
  t += 60_000;
  await b.tick();
  console.assert(submits === 0 && dupB.id === fromB.id, 'follower never submits; same request = same record');
  await a.tick();
  console.assert(submits === 1 && store.get(fromB.id)?.state === 'running', `leader merged and submitted the follower's job once (${submits})`);
  await b.sync();
  console.assert(b.snapshot().jobs.find((r) => r.id === fromB.id)?.state === 'running', 'follower mirror sees the state');
  // R6 P1-1: the same seeded request from both tabs before either saw the other's record -> one POST
  const dupReq = { method: 'POST' as const, path: '/dup', body: { seed: 42 } };
  const mineA = await a.enqueue(dupReq), fromB2 = { ...structuredClone(store.get(mineA.id)!), id: 'twin' }; // B wrote its copy before it saw A's
  store.set(fromB2.id, fromB2);
  t += 31_000;
  await a.tick(); // full re-read fallback adopts the twin
  console.assert(mineA.id !== fromB2.id && store.get(fromB2.id)?.state === 'cancelled' && /duplicate/.test(store.get(fromB2.id)?.error ?? '') && submits === 2, `leader drops the other tab's duplicate (${store.get(fromB2.id)?.state}, ${submits} POSTs)`);
  await new Promise((r) => setTimeout(r, 10));
  console.assert(b.snapshot().jobs.find((r) => r.id === mineA.id)?.state === 'running', 'follower mirror follows the leader by record id (no full re-read)');
  a.disconnect(); // leader tab closed
  await tick(); await tick(); await tick();
  console.assert(b.role === 'leader' && c.role === 'follower', `next tab takes over (${b.role}, ${c.role})`);
  console.assert(store.get(hang.id)?.state === 'lost', 'orphaned submit is marked lost only by the new leader');
  b.disconnect(); c.disconnect();
}


// A keyless leader cannot borrow a follower key; closing it lets that follower resume safely with its own key.
async function handoffTest() {
  const store = new Map<string, JobRec>(), locks = fakeLocks(), tick = () => new Promise((r) => setTimeout(r, 0));
  let t = 1000, posts = 0, usedKey = '';
  const deps: Partial<Deps> = {
    locks, now: () => t,
    put: async (k, r) => void store.set(k, structuredClone(r)), get: async (k) => structuredClone(store.get(k)),
    all: async () => [...store.values()].map((r) => structuredClone(r)),
    api: async <T>(key: string): Promise<T> => { posts++; usedKey = key; return { usage: { type: 'generations', generations: 0.1 } } as T; },
  };
  const a = new Queue(deps), b = new Queue(deps);
  await a.connect(); await b.connect();
  b.setKey('synthetic-private-handoff-key');
  const rec = await b.enqueue({ method: 'POST', path: '/handoff', body: { seed: 123 } });
  t += FULL_SYNC_MS + 1;
  await a.tick(); await b.tick();
  console.assert(posts === 0 && a.key === '' && store.get(rec.id)?.state === 'queued', 'keyless leader leaves follower work queued without borrowing its key');
  a.disconnect();
  await tick(); await tick(); await tick();
  await b.tick(); await b.tick();
  console.assert(b.role === 'leader' && posts === 1 && usedKey === 'synthetic-private-handoff-key' && store.get(rec.id)?.state === 'done', 'connected follower takes over and submits its queued work exactly once with its own key');
  b.disconnect();
}

// A follower disconnected while waiting for the Web Lock must never become an active queue later (HMR/remount).
async function disconnectedLockTest() {
  const locks = fakeLocks(), tick = () => new Promise((r) => setTimeout(r, 0));
  const deps: Partial<Deps> = { locks, all: async () => [], put: async () => {}, now: () => 1000 };
  const a = new Queue(deps), b = new Queue(deps), c = new Queue(deps);
  await a.connect(); await b.connect(); await c.connect();
  b.disconnect();
  a.disconnect();
  for (let i = 0; i < 6; i++) await tick();
  console.assert(b.role === 'follower' && c.role === 'leader', 'disconnected follower skips lock takeover; next live tab becomes leader');
  c.disconnect();
  // Disconnect during the asynchronous ledger load must also prevent restarting the ticker.
  let finish!: () => void;
  const slow = new Queue({ ...deps, locks: null, all: () => new Promise((res) => { finish = () => res([]); }) });
  let starts = 0;
  slow.start = () => { starts++; };
  const pending = slow.connect();
  slow.disconnect(); finish(); await pending;
  console.assert(starts === 0, 'disconnect during ledger load never restarts the queue timer');
}
