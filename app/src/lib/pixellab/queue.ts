// One job queue for every PixelLab call (architecture §9).
// Ledger rule: a record is persisted before submit, its background_job_ids right after, result PNGs the moment a job completes.
// A record with job ids is never resubmitted; reload resumes polling. A paid POST without a clear "rejected" answer (network
// error, 500/502/504, timeout) is marked lost, never resent: the server may have created and charged the job.
// Cross-tab: only the tab holding the Web Lock "pixeldoll-queue" submits/polls (leader). Other tabs (followers) mirror the
// ledger: every save posts the record id on a same-origin BroadcastChannel and the other tabs read just that record (full
// re-read every 30 s as a fallback). The leader adopts records a follower wrote, dropping duplicates of its own requests.
// Only a leader marks orphaned `submitting` records lost, so another live tab's in-flight jobs are never touched.
// The key stays in memory. It crosses tabs only when the user types it (or forgets it) in a follower tab: that tab posts it
// to the leader. Nobody answers "ask for the key" messages, so another page on the same origin cannot pull it (R6 P1-4).
import { api as realApi, ApiError, errorText, isNetwork, isPolicy, rejected } from './client.ts';
import { jobIdsOf, jobImages, type Job, type Req, type SubmitResponse, type Usage } from './routes.ts';
import { sha256, stableStringify } from '../image/hash.ts';
import { base64ToBytes, bytesToBase64, pngSize } from '../image/png.ts';
import * as db from '../store/db.ts';
import { activityRequest, beginActivityCall, finishActivityCall, restoreActivityRequest, type ActivityContext } from './activity.ts';

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
  activityScope?: string;
  method: Req['method'];
  endpoint: string;
  params: unknown; // request body; images replaced by {$blob: sha256}; never the key
  inputs: string[]; // input blob hashes
  requestHash: string;
  state: RecState;
  attempts: number;
  requestStarted?: boolean; // persisted immediately before transport; false means preparation never reached a request
  nextAt: number;
  createdAt: number;
  submittedAt?: number;
  finishedAt?: number;
  response?: unknown; // submit response, long strings stripped
  jobs: SubJob[];
  error?: string;
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
  api: <T>(key: string, method: string, path: string, body?: unknown, signal?: AbortSignal, context?: ActivityContext) => Promise<T>;
  put: (key: string, rec: JobRec) => Promise<void>;
  get: (key: string) => Promise<JobRec | undefined>;
  del: (key: string) => Promise<unknown>;
  all: () => Promise<JobRec[]>;
  putBlob: (bytes: Uint8Array) => Promise<string>;
  getBlob: (sha: string) => Promise<Blob | undefined>;
  fetchBytes: (url: string, context?: ActivityContext) => Promise<Uint8Array>;
  now: () => number;
  locks: Pick<LockManager, 'request'> | null; // Web Locks (null = single tab)
  online: () => boolean; // navigator.onLine
}

const POLL_MS = 5000, SYNC_MS = 1500, FULL_SYNC_MS = 30_000, MAX_TRIES = 10, MAX_PX = 2048, LOCK = 'pixeldoll-queue';
const LOST_AFTER_MS = 120_000;
const PROBE_MS = 15_000;
const NOT_STARTED = /failed to start any/i; // offline: a free GET /balance this often until PixelLab answers again // 404 on a job never seen completed, this long after submit -> lost

export const live = (r?: JobRec) => !!r && (r.state === 'queued' || r.state === 'submitting' || r.state === 'running');
const seededOf = (r: JobRec) => typeof (r.params as { seed?: unknown } | null)?.seed === 'number';
type Msg = { key?: string; rec?: string; sync?: boolean };

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
  private merged = 0;
  private probeAt = 0;
  private chan: BroadcastChannel | null = null;
  private activityInspection = new Map<string, Promise<void>>();
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
      fetchBytes: async (url, context) => {
        const id = beginActivityCall('GET', url, undefined, context, 'download');
        let status: number | null = null;
        try {
          const r = await fetch(url); // storage CDN: no auth header, ever
          status = r.status;
          if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
          const bytes = new Uint8Array(await r.arrayBuffer());
          finishActivityCall(id, status, true);
          return bytes;
        } catch (e) { finishActivityCall(id, status, false); throw e; }
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
    const locks = this.deps.locks;
    if (!locks) { await this.load(); this.start(); return; }
    if (typeof BroadcastChannel !== 'undefined') {
      this.chan = new BroadcastChannel(LOCK);
      this.chan.onmessage = (e: MessageEvent<Msg>) => {
        const m = e.data ?? {};
        // a key typed (or forgotten: '') in a follower tab; adopted when the leader has none or PixelLab rejected its own
        if (typeof m.key === 'string' && this.role === 'leader' && (!m.key || !this.key || this.paused === 'auth')) this.setKey(m.key, false);
        if (typeof m.rec === 'string') void this.pull(m.rec);
        if (m.sync && this.role === 'follower') void this.sync();
      };
    }
    await this.sync(); // the UI has the ledger at once, whoever leads
    const hold = () => new Promise<void>((res) => (this.release = res));
    const got = await new Promise<boolean>((res) => void locks.request(LOCK, { ifAvailable: true }, (lock) => { res(!!lock); return lock ? hold() : undefined; }));
    if (got) return this.lead();
    this.role = 'follower';
    this.follower = every(this.chan ? FULL_SYNC_MS : SYNC_MS, () => void this.sync());
    this.emit();
    void locks.request(LOCK, async () => { await this.lead(); return hold(); });
  }
  private async lead() {
    this.follower?.();
    this.follower = null;
    this.role = 'leader';
    this.recs.clear();
    await this.load();
    this.start();
  }
  /** Stop working and hand the lock to the next tab (tests, HMR). */
  disconnect() {
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
  /** Inspect mirrored/persisted submissions without making requests or eagerly decoding every saved input. */
  async inspectActivity(ids: string[], activityScope?: string): Promise<void> {
    const selected = new Set(ids);
    for (const rec of this.recs.values()) {
      if ((selected.has(rec.id) || activityScope && rec.activityScope === activityScope) && this.wasRequested(rec)) await this.restoreActivity(rec);
    }
  }
  private wasRequested(r: JobRec) { return r.attempts > 0 && r.requestStarted !== false && !/nothing was sent/i.test(r.error ?? ''); }
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
        r.state = r.requestStarted === false ? 'failed' : 'lost';
        r.error = r.requestStarted === false ? 'page closed before request preparation finished; nothing was sent.' : 'page closed during submit; the job may have run (check pixellab.ai). Not resubmitted.';
        await this.deps.put(r.id, r);
      }
      this.recs.set(r.id, r);
    }
    // Reattach known remote jobs before polling, so reported usage belongs to their original paid submission.
    if (this.deps.api === realApi) for (const r of [...this.recs.values()].filter((r) => this.wasRequested(r)).sort((a, b) => a.createdAt - b.createdAt).slice(-200)) await this.restoreActivity(r);
    this.emit();
  }
  private async restoreActivity(r: JobRec) {
    const pending = this.activityInspection.get(r.id);
    if (pending) await pending;
    const task = this.restoreActivityRecord(r);
    this.activityInspection.set(r.id, task);
    try { await task; } finally { if (this.activityInspection.get(r.id) === task) this.activityInspection.delete(r.id); }
  }
  private async restoreActivityRecord(r: JobRec) {
    const existing = activityRequest(r.id);
    if (existing && !existing.restored) return;
    let body = existing ? existing.body : r.params;
    let bodyUnavailable = existing?.bodyUnavailable ?? false;
    if (!existing) try {
      body = await mapDeep(r.params, (o) => typeof o.$blob === 'string' ? (async () => {
        const blob = await this.deps.getBlob(o.$blob as string);
        if (!blob) throw new Error('stored input unavailable');
        const { $blob: _, ...rest } = o;
        return { ...rest, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
      })() : undefined);
    } catch { bodyUnavailable = true; }
    // A sync may have supplied newer remote usage while the original PNG was being read.
    const current = this.recs.get(r.id) ?? r;
    if (!this.wasRequested(current)) return;
    restoreActivityRequest({ queueId: current.id, queueTag: current.tag, activityScope: current.activityScope, label: current.label, method: current.method, endpoint: current.endpoint, body,
      bodyUnavailable,
      startedAt: current.submittedAt ?? current.createdAt, state: current.jobs.length || current.state === 'done' ? 'completed' : 'failed',
      jobs: current.jobs, usage: (current.response as { usage?: unknown } | undefined)?.usage });
  }
  start() {
    this.timer ??= every(1000, () => void this.tick());
  }
  stop() {
    this.timer?.();
    this.timer = null;
  }
  /** `share`: the user typed (or forgot, '') the key in this follower tab, so the leader gets it too. */
  setKey(key: string, share = true) {
    this.key = key;
    if (share && this.role === 'follower') this.chan?.postMessage({ key } satisfies Msg);
    if (key && this.paused === 'auth') this.paused = null;
    this.emit();
  }
  resume() {
    this.paused = null;
    this.emit();
  }
  setConcurrency(n: number) {
    this.concurrency = this.current = Math.max(1, Math.min(8, Math.round(n)));
    this.emit();
  }

  // ---- enqueue ----
  // Identical request (same endpoint + params + input images, explicit seed) reuses the stored record instead of paying again.
  // meta.cache: also reuse unseeded done records (deterministic routes: estimate-skeleton, GET /characters).
  async enqueue(req: Req, meta: { label?: string; tag?: string; activityScope?: string; cache?: boolean; resumeSafe?: boolean } = {}): Promise<JobRec> {
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
    const seeded = typeof (params as { seed?: unknown } | null)?.seed === 'number';
    for (const r of this.recs.values()) {
      if (r.requestHash !== requestHash) continue;
      if (r.state === 'queued' || r.state === 'submitting' || r.state === 'running') return r; // double click
      if ((seeded || meta.cache) && r.state === 'done') return r; // ponytail: cache only seeded requests; unseeded = intentional re-roll
      // Resuming a multi-step paid flow must never turn a terminal/unknown outcome into another submission.
      if (meta.resumeSafe) return r;
    }
    const now = this.deps.now();
    const rec: JobRec = {
      id: crypto.randomUUID(),
      label: meta.label ?? req.path,
      tag: meta.tag,
      activityScope: meta.activityScope,
      method: req.method,
      endpoint: req.path,
      params,
      inputs,
      requestHash,
      state: 'queued',
      attempts: 0,
      requestStarted: false,
      nextAt: 0,
      createdAt: now,
      jobs: [],
      gens: 0,
      usd: 0,
    };
    this.recs.set(rec.id, rec);
    await this.save(rec);
    return rec;
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
    try { await this.deps.api(this.key, 'GET', '/balance', undefined, undefined, { label: 'Connection recovery', background: true }); } catch (e) { if (isNetwork(e)) return false; } // any answer = back online
    if (this.paused === 'offline') this.resume();
    return true;
  }
  async tick(): Promise<void> {
    const now = this.deps.now();
    if (!(await this.network(now))) return;
    if (this.role === 'follower') return; // the leader tab submits and polls
    if (this.role === 'leader' && now - this.merged >= (this.chan ? FULL_SYNC_MS : SYNC_MS)) { this.merged = now; await this.merge(); }
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
    r.state = 'submitting';
    r.attempts++;
    r.requestStarted = false;
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
      r.requestStarted = true;
      try { await this.save(r); } // a crash from this point has an unknown transport outcome; never auto-resubmit it
      catch { r.requestStarted = false; throw new Error('request could not be saved; nothing was sent'); }
      const res = await this.deps.api<SubmitResponse>(this.key, r.method, r.endpoint, body ?? undefined, undefined, { queueId: r.id, queueTag: r.tag, activityScope: r.activityScope, label: r.label });
      r.submittedAt = this.deps.now();
      r.response = strip(res);
      const ids = jobIdsOf(res);
      r.jobs = ids.map((id) => ({ id, status: 'submitted', done: false, results: [] }));
      if (ids.length) r.state = 'running';
      else this.finish(r, res.usage); // synchronous route (estimate-skeleton, balance)
      if (++this.streak >= 5 && this.current < this.concurrency) { this.current++; this.streak = 0; }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(-1, 'other', (e as Error)?.message ?? String(e));
      if (err.message === 'no API key set') r.requestStarted = false; // client guard rejected before fetch
      r.error = err.message;
      this.streak = 0;
      // refused before any job existed; B15 live: a 500 "Failed to start any animation jobs" (busy account) said so in words
      if (err.kind === 'retry' && (r.method !== 'POST' || rejected(err.status) || NOT_STARTED.test(err.message))) {
        if (err.status === 429) this.current = Math.max(1, this.current - 1);
        r.state = 'queued';
        r.nextAt = this.deps.now() + backoff(r.attempts);
      } else if (err.kind === 'retry') { // R6 P1-3: the paid job may exist; resending could pay twice
        r.state = 'lost';
        r.error = `no clear answer from PixelLab (${err.message}). The job may have run and been charged (check pixellab.ai); not resent.`;
        r.finishedAt = this.deps.now();
        if (isNetwork(err)) this.goOffline(); // B15: stop here instead of losing the next queued job too
      } else if (err.kind === 'auth' || err.kind === 'credits') {
        this.paused = err.kind;
        r.state = 'queued';
      } else {
        r.state = 'failed';
        r.finishedAt = this.deps.now();
      }
    }
    await this.save(r);
  }

  private async poll(r: JobRec, s: SubJob) {
    if (this.deps.api === realApi) await this.restoreActivity(r);
    s.lastPoll = this.deps.now();
    let job: Job;
    try {
      job = await this.deps.api<Job>(this.key, 'GET', `/background-jobs/${encodeURIComponent(s.id)}`, undefined, undefined, { queueId: r.id, queueTag: r.tag, activityScope: r.activityScope, label: r.label, background: true });
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.kind === 'auth') this.paused = 'auth';
      else if (isNetwork(e)) { s.error = e.message; this.goOffline(); } // B15
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
        await this.saveResult(s, label, await this.deps.fetchBytes(url, { queueId: r.id, queueTag: r.tag, activityScope: r.activityScope, label: `${r.label} · ${label}`, background: true }));
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
  async cancel(id: string) {
    const r = this.recs.get(id);
    if (!r) return;
    if (this.role === 'follower' && r.state === 'running') { // the leader's next poll sees the cancel; never write its record
      for (const s of r.jobs.filter((s) => !s.done)) await this.deps.api(this.key, 'DELETE', `/background-jobs/${encodeURIComponent(s.id)}`, undefined, undefined, { queueId: r.id, queueTag: r.tag, activityScope: r.activityScope, label: `Stop ${r.label}`, background: false }).catch(() => {});
      return;
    }
    if (r.state === 'queued') {
      r.state = 'cancelled';
      r.finishedAt = this.deps.now();
    } else if (r.state === 'running') {
      for (const s of r.jobs.filter((s) => !s.done && !s.remoteDone)) {
        try {
          await this.deps.api(this.key, 'DELETE', `/background-jobs/${encodeURIComponent(s.id)}`, undefined, undefined, { queueId: r.id, queueTag: r.tag, activityScope: r.activityScope, label: `Stop ${r.label}`, background: false });
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
      if (method === 'POST' && ++posts === 1) throw new ApiError(500, 'retry', 'POST /characters/animations -> 500: Failed to start any animation jobs');
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
  console.assert(st(busy).state === 'running' && posts['/busy'] === 2, `503 (refused) is resent (${st(busy).state} ${posts['/busy']})`);
  console.assert(st(ch).state === 'done' && gets === 2, `GET retries after a network error (${st(ch).state} ${gets})`);
  console.assert(st(img).state === 'failed' && !posts['/img'] && /missing/.test(st(img).error ?? ''), `missing input image: failed, nothing sent (${st(img).state})`);

  const url = await q.enqueue({ method: 'POST', path: '/url', body: { seed: 2 } });
  const bad = await q.enqueue({ method: 'POST', path: '/bad', body: { seed: 2 } });
  await run(600); // 10 minutes of 1 s ticks
  console.assert(st(url).state === 'failed' && fetches === MAX_TRIES && /Download manually: https:\/\/x\/e.png/.test(st(url).error ?? ''), `failing download backs off and gives up (${st(url).state}, ${fetches} GETs)`);
  console.assert(st(bad).state === 'failed' && !st(bad).jobs[0].results.length && /malformed/.test(st(bad).error ?? ''), `malformed result is not done (${st(bad).state})`);

  const keep = new Set([url.id]);
  const n = await q.clearFinished((r) => keep.has(r.id));
  console.assert(store.has(url.id) && !store.has(bad.id) && store.has(busy.id) && n === 5, `clear finished keeps referenced and live records (${n})`);
}

/** A minimal Web Locks stand-in: one holder, FIFO waiters, ifAvailable. */
function fakeLocks(): Pick<LockManager, 'request'> {
  let held = false;
  const waiters: (() => void)[] = [];
  const grant = async (cb: LockGrantedCallback<unknown>) => { held = true; try { return await cb({ name: LOCK, mode: 'exclusive' }); } finally { held = false; waiters.shift()?.(); } };
  return {
    request: ((_name: string, a: LockOptions | LockGrantedCallback<unknown>, b?: LockGrantedCallback<unknown>) => {
      const [opts, cb] = typeof a === 'function' ? [{} as LockOptions, a] : [a, b!];
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
  b.setKey('k'); // key entered in the follower tab reaches the leader
  for (let i = 0; i < 20 && !a.key; i++) await new Promise((r) => setTimeout(r, 5));
  console.assert(a.key === 'k', 'leader adopts the key from a follower tab');
  const spy = new BroadcastChannel(LOCK), heard: unknown[] = []; // R6 P1-4: another same-origin page asks for the key
  spy.onmessage = (e) => heard.push(e.data);
  spy.postMessage({ ask: true });
  await new Promise((r) => setTimeout(r, 20));
  console.assert(!heard.some((m) => typeof (m as Msg).key === 'string'), 'nobody hands the key to an ask');
  spy.close();
  a.paused = 'auth'; // R6 P2-8: the leader's key was rejected, the user types a new one in the follower tab
  b.setKey('k2');
  for (let i = 0; i < 20 && a.key !== 'k2'; i++) await new Promise((r) => setTimeout(r, 5));
  console.assert(a.key === 'k2' && !a.paused, 'leader paused on auth adopts the new key');
  b.setKey('');
  for (let i = 0; i < 20 && a.key; i++) await new Promise((r) => setTimeout(r, 5));
  console.assert(a.key === '', 'Forget key in a follower tab stops the leader');
  a.setKey('k'); b.setKey('k', false);
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
