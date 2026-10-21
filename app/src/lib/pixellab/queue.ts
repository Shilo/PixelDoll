// One job queue for every PixelLab call (architecture §9).
// Ledger rule: a record is persisted before submit, its background_job_ids right after, result PNGs the moment a job completes.
// A record with job ids is never resubmitted; reload resumes polling.
import { api as realApi, ApiError, errorText, isPolicy } from './client.ts';
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
  gens: number;
  usd: number;
}
export interface QueueSnapshot {
  jobs: JobRec[];
  paused: null | 'auth' | 'credits';
  concurrency: number;
  current: number;
  sessionGens: number;
  sessionUsd: number;
  counts: Record<'pending' | 'running' | 'failed' | 'done', number>;
}

export interface Deps {
  api: <T>(key: string, method: string, path: string, body?: unknown) => Promise<T>;
  put: (key: string, rec: JobRec) => Promise<void>;
  all: () => Promise<JobRec[]>;
  putBlob: (bytes: Uint8Array) => Promise<string>;
  getBlob: (sha: string) => Promise<Blob | undefined>;
  fetchBytes: (url: string) => Promise<Uint8Array>;
  now: () => number;
}

const POLL_MS = 5000;
const LOST_AFTER_MS = 120_000; // 404 on a job never seen completed, this long after submit -> lost

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

export class Queue {
  private recs = new Map<string, JobRec>();
  private busy = new Set<string>(); // rec ids / subjob ids with an op in flight
  private listeners = new Set<(s: QueueSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private streak = 0;
  private deps: Deps;
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
      all: () => db.all<JobRec>('jobs'),
      putBlob: (b) => db.putBlob(b),
      getBlob: db.getBlob,
      fetchBytes: async (url) => {
        const r = await fetch(url); // storage CDN: no auth header, ever
        if (!r.ok) throw new Error(`GET ${url} -> ${r.status}`);
        return new Uint8Array(await r.arrayBuffer());
      },
      now: Date.now,
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
    return { jobs, paused: this.paused, concurrency: this.concurrency, current: this.current, sessionGens: this.sessionGens, sessionUsd: this.sessionUsd, counts };
  }
  private emit() {
    const s = this.snapshot();
    for (const l of this.listeners) l(s);
  }
  private async save(r: JobRec) {
    await this.deps.put(r.id, r);
    this.emit();
  }

  // ---- lifecycle ----
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
    this.timer ??= setInterval(() => void this.tick(), 1000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  setKey(key: string) {
    this.key = key;
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
  async enqueue(req: Req, meta: { label?: string; tag?: string } = {}): Promise<JobRec> {
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
      if (seeded && r.state === 'done') return r; // ponytail: cache only seeded requests; unseeded = intentional re-roll
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
    await this.save(rec);
    return rec;
  }

  // ---- the loop ----
  async tick(): Promise<void> {
    const now = this.deps.now();
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
          if (s.remoteDone) ops.push(this.guard(s.id, () => this.download(r, s)));
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
    await this.save(r); // persisted before the request leaves
    const body = await mapDeep(r.params, (o) => {
      if (typeof o.$blob !== 'string') return undefined;
      const { $blob, ...rest } = o;
      return (async () => {
        const blob = await this.deps.getBlob($blob as string);
        if (!blob) throw new Error(`input blob ${$blob} missing`);
        return { ...rest, base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
      })();
    });
    try {
      const res = await this.deps.api<SubmitResponse>(this.key, r.method, r.endpoint, body ?? undefined);
      r.submittedAt = this.deps.now();
      r.response = strip(res);
      const ids = jobIdsOf(res);
      r.jobs = ids.map((id) => ({ id, status: 'submitted', done: false, results: [] }));
      if (ids.length) r.state = 'running';
      else this.finish(r, res.usage); // synchronous route (estimate-skeleton, balance)
      if (++this.streak >= 5 && this.current < this.concurrency) { this.current++; this.streak = 0; }
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, 'retry', String(e));
      r.error = err.message;
      this.streak = 0;
      if (err.kind === 'retry') {
        if (err.status === 429) this.current = Math.max(1, this.current - 1);
        r.state = 'queued';
        r.nextAt = this.deps.now() + backoff(r.attempts);
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
    s.lastPoll = this.deps.now();
    let job: Job;
    try {
      job = await this.deps.api<Job>(this.key, 'GET', `/background-jobs/${encodeURIComponent(s.id)}`);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
      if (e.kind === 'auth') this.paused = 'auth';
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
      s.remoteDone = true;
      s.pendingUrls = [];
      for (const im of jobImages(lr)) {
        if (im.url) s.pendingUrls.push({ label: im.label, url: im.url });
        else await this.saveResult(s, im.label, base64ToBytes(im.b64 ?? im.rgba!.b64), im.rgba);
      }
      await this.save(r); // inline images are safe now; URLs are persisted for download
      return this.download(r, s);
    }
    await this.save(r);
  }

  private async saveResult(s: SubJob, label: string, bytes: Uint8Array, rgba?: { w: number; h: number }) {
    // ponytail: rgba_bytes results are stored raw (type octet-stream); encode to PNG when a route actually returns them.
    const sha = await this.deps.putBlob(bytes);
    const size = rgba ? { w: rgba.w, h: rgba.h } : pngSize(bytes);
    s.results.push({ label, sha, ...size });
  }

  private async download(r: JobRec, s: SubJob) {
    while (s.pendingUrls?.length) {
      const { label, url } = s.pendingUrls[0];
      await this.saveResult(s, label, await this.deps.fetchBytes(url)); // throws -> retried next tick, URL stays persisted
      s.pendingUrls.shift();
      await this.save(r);
    }
    s.done = true;
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
    if (r.state === 'queued') {
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
  async clearFinished() {
    for (const r of [...this.recs.values()])
      if (r.state === 'done' || r.state === 'failed' || r.state === 'cancelled' || r.state === 'lost') {
        this.recs.delete(r.id);
        await db.del('jobs', r.id).catch(() => {});
      }
    this.emit();
  }
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
}
