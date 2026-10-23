import { expect, test, vi } from 'vitest';
import { Queue, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts';
import { ApiError, api, retryAfter } from '../../src/lib/pixellab/client.ts';
import { planCapacity } from '../../src/lib/pixellab/capacity.ts';
import type { Balance } from '../../src/lib/pixellab/routes.ts';

const balance = (tier = 3, status = 'active'): Balance => ({ credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status, plan: `Tier ${tier}: Pixel ${tier === 3 ? 'Architect' : 'Artisan'}`, generations: 1000, total: 10000 } });
function harness(tier = 3) {
  const store = new Map<string, JobRec>(), remote = new Set<string>(), posts: string[] = [];
  let now = 1000, external = 0, sequence = 0, reject: ApiError | undefined, completed = false, reads = 0;
  const limit = tier === 3 ? 20 : 10;
  const deps: Partial<Deps> = {
    now: () => now, locks: null, online: () => true,
    put: async (id, rec) => { store.set(id, structuredClone(rec)); }, get: async (id) => structuredClone(store.get(id)),
    all: async () => [...store.values()].map((r) => structuredClone(r)), del: async (id) => store.delete(id),
    api: async <T>(_key: string, method: string, path: string, body?: unknown): Promise<T> => {
      if (path === '/balance') { reads++; return balance(tier) as T; }
      if (method === 'POST') {
        posts.push(path);
        if (reject) throw reject;
        const slots = (body as { directions?: string[] } | undefined)?.directions?.length ?? 1;
        if (remote.size + external + slots > limit) throw new ApiError(429, 'retry', 'Concurrency limit reached');
        const ids = Array.from({ length: slots }, () => `j${++sequence}`);
        ids.forEach((id) => remote.add(id));
        return { background_job_ids: ids } as T;
      }
      if (completed) remote.delete(path.split('/').at(-1)!);
      return { status: completed ? 'cancelled' : 'processing' } as T;
    },
  };
  const q = new Queue(deps);
  q.setKey('offline-fixture');
  const enqueue = (n: number) => Promise.all(Array.from({ length: n }, () => q.enqueue({ method: 'POST', path: `/job-${++sequence}` })));
  return { q, deps, store, remote, posts, enqueue, advance: (ms = 61_000) => { now += ms; }, busy: (n: number) => { external = n; }, reject: (e?: ApiError) => { reject = e; }, complete: () => { completed = true; }, reads: () => reads };
}

test('plan detection is based on active plan names, never generation balances', () => {
  expect(planCapacity(balance(3)).limit).toBe(20);
  expect(planCapacity(balance(2)).limit).toBe(10);
  expect(planCapacity(balance(1)).limit).toBe(8);
  expect(planCapacity(balance(30)).limit).toBe(20);
  expect(planCapacity(balance(3, 'expired'))).toEqual({ limit: 1, plan: 'Free / Trial' });
  expect(planCapacity({ ...balance(), subscription: { ...balance().subscription, plan: 'Free trial' } }).limit).toBe(1);
  for (const plan of [null, undefined, 'Enterprise']) {
    expect(planCapacity({ ...balance(), subscription: { ...balance().subscription, plan } }).limit).toBe(3);
  }
});

test.each([2, 3])('Tier %i fills its ceiling and accounts for remote jobs until they finish', async (tier) => {
  const h = harness(tier), limit = tier === 3 ? 20 : 10;
  await h.enqueue(25); await h.q.tick();
  expect(h.q.concurrency).toBe(limit);
  expect(h.remote.size).toBe(limit);
  expect(h.posts).toHaveLength(limit);
  await h.q.tick(); expect(h.posts).toHaveLength(limit);
  h.complete();
  for (let n = 0; n < 6; n++) { h.advance(); await h.q.tick(); }
  expect(h.posts).toHaveLength(25);
});

test('external jobs cause a shared cooldown, then single probes refill all 20 slots', async () => {
  const h = harness(); h.busy(8); await h.enqueue(30); await h.q.tick();
  expect(h.remote.size).toBe(12);
  expect(h.q.snapshot().counts.failed).toBe(0);
  expect(h.q.capacityRetryAt).toBeGreaterThan(1000);
  const count = h.posts.length;
  await h.enqueue(5); await h.q.tick(); expect(h.posts).toHaveLength(count);
  // Account refreshes and Resume must not bypass the capacity deadline.
  h.q.setBalance(balance(), h.q.key); h.q.resume(); await h.q.tick(); expect(h.posts).toHaveLength(count);
  h.advance(); await h.q.tick(); expect(h.posts).toHaveLength(count + 1);
  h.busy(0); h.advance();
  for (let n = 0; n < 10; n++) { await h.q.tick(); h.advance(1000); }
  expect(h.remote.size).toBe(20);
  expect(h.q.current).toBe(20);
  expect(h.q.snapshot().counts.failed).toBe(0);
  // Already accepted requests are never submitted a second time.
  const accepted = [...h.store.values()].filter((r) => r.state === 'running');
  for (const r of accepted) expect(r.attempts).toBeGreaterThanOrEqual(1);
});

test('429/529 never exhaust a retry allowance, and honor Retry-After for every queued job', async () => {
  const h = harness(); h.reject(new ApiError(529, 'retry', 'Rate limit exceeded', undefined, 120_000));
  await h.enqueue(3); await h.q.tick();
  expect(h.q.capacityRetryAt).toBe(121_000);
  for (let n = 0; n < 12; n++) {
    const sent = h.posts.length; h.advance(119_000); await h.q.tick(); expect(h.posts).toHaveLength(sent);
    h.advance(1000); await h.q.tick(); expect(h.posts).toHaveLength(sent + 1);
  }
  expect(h.q.snapshot().counts.failed).toBe(0);
  expect(h.q.snapshot().counts.pending).toBe(3);
  h.reject(); h.advance(120_000); await h.q.tick();
  expect(h.remote.size).toBe(1);
});

test.each([0, 500, 502, 503, 504])('ambiguous paid outcome %i is never resent', async (status) => {
  const h = harness(); h.reject(new ApiError(status, 'retry', 'Unknown outcome'));
  await h.enqueue(1); await h.q.tick(); h.advance(); await h.q.tick();
  expect(h.posts).toHaveLength(1);
  expect(h.q.snapshot().jobs[0]?.state).toBe('lost');
});

test('a clearly refused start remains safely retryable', async () => {
  const h = harness(); h.reject(new ApiError(500, 'retry', 'Failed to start any animation jobs'));
  await h.enqueue(1); await h.q.tick();
  expect(h.q.snapshot().jobs[0]?.state).toBe('queued');
  h.reject(); h.advance(); await h.q.tick(); expect(h.remote.size).toBe(1);
});

test('reload retains the account cooldown and resumes accepted job ids without resubmission', async () => {
  const h = harness(); h.busy(20); await h.enqueue(2); await h.q.tick();
  const retryAt = h.q.capacityRetryAt, q2 = new Queue(h.deps);
  await q2.load(); q2.setKey('offline-fixture');
  await q2.enqueue({ method: 'POST', path: '/fresh-after-reload' });
  await q2.tick();
  expect(q2.capacityRetryAt).toBe(retryAt);
  expect(h.posts).toHaveLength(2);
  h.busy(0); h.advance(); await q2.tick();
  expect(h.remote.size).toBe(1);
  const q3 = new Queue(h.deps); q3.setKey('offline-fixture'); await q3.load();
  const accepted = q3.snapshot().jobs.find((r) => r.state === 'running')!;
  await q3.tick();
  expect(h.posts.filter((path) => path === accepted.endpoint)).toHaveLength(2); // refusal then acceptance only
});

test('multi-direction requests reserve one slot per direction and overlapping ticks cannot overfill', async () => {
  const h = harness(2);
  await h.q.enqueue({ method: 'POST', path: '/characters/animations', body: { directions: ['south', 'east', 'west', 'north'] } });
  await h.enqueue(15);
  await Promise.all([h.q.tick(), h.q.tick(), h.q.tick()]);
  expect(h.remote.size).toBe(10);
  expect(h.posts).toHaveLength(7);
});

test('account changes reject stale balance reads and re-detect without a manual cap', async () => {
  const h = harness(); h.q.setBalance(balance(), h.q.key); expect(h.q.concurrency).toBe(20);
  h.q.setKey('different-offline-fixture'); expect(h.q.concurrency).toBe(3);
  h.q.setBalance(balance(), 'offline-fixture'); expect(h.q.concurrency).toBe(3);
  h.q.setBalance(balance(2), h.q.key); expect(h.q.concurrency).toBe(10);
});

test('Retry-After parses seconds/dates and reaches the queue through ApiError', async () => {
  expect(retryAfter('120', 0)).toBe(120_000);
  expect(retryAfter('Thu, 01 Jan 1970 00:02:00 GMT', 0)).toBe(120_000);
  for (const value of [null, '', 'bad', '-1']) expect(retryAfter(value, Date.now())).toBeUndefined();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"detail":"busy"}', { status: 429, headers: { 'Retry-After': '120' } })));
  try { await expect(api('offline-fixture', 'POST', '/create-character-v3', {})).rejects.toMatchObject({ status: 429, retryAfterMs: 120_000 }); }
  finally { vi.unstubAllGlobals(); }
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('an unresolved recovery probe cannot overlap with another probe', async () => {
  const h = harness(); h.busy(20); await h.enqueue(3); await h.q.tick(); h.busy(0); h.advance();
  const gate = deferred<void>(); let calls = 0;
  // Recreate in production lifecycle order, then delay the real transport at the capacity probe.
  const q = new Queue({ ...h.deps, api: async <T>(key: string, method: string, path: string, body?: unknown): Promise<T> => {
    if (method === 'POST') { calls++; await gate.promise; }
    return h.deps.api!<T>(key, method, path, body);
  } });
  await q.load(); q.setKey('offline-fixture');
  const run = q.tick(); await vi.waitFor(() => expect(calls).toBe(1));
  h.advance(1000); await q.tick(); h.advance(1000); await q.tick();
  expect(calls).toBe(1);
  gate.resolve(); await run;
});

test.each([429, 401, 402, 0])('stale credential response %i cannot pause or throttle a new credential', async (status) => {
  const h = harness(), gate = deferred<never>(); let submitted = false;
  const q = new Queue({ ...h.deps, api: async <T>(_key: string, method: string): Promise<T> => {
    if (method === 'GET') return balance() as T;
    submitted = true; return gate.promise;
  } });
  q.setKey('old-fixture'); await q.enqueue({ method: 'POST', path: '/slow' });
  const run = q.tick(); await vi.waitFor(() => expect(submitted).toBe(true));
  q.setKey('new-fixture'); q.setBalance(balance(2), q.key);
  gate.reject(new ApiError(status, status === 401 ? 'auth' : status === 402 ? 'credits' : 'retry', 'old account response', { network: true }, 3_600_000));
  await run;
  expect(q.capacityRetryAt).toBe(0); expect(q.paused).toBeNull(); expect(q.concurrency).toBe(10);
});

test('slow periodic balance reads do not stop polls or submissions using a known ceiling', async () => {
  const h = harness(), gate = deferred<Balance>(); let polls = 0, reads = 0;
  const q = new Queue({ ...h.deps, api: async <T>(key: string, method: string, path: string, body?: unknown): Promise<T> => {
    if (path === '/balance') { reads++; return gate.promise as Promise<T>; }
    if (method === 'GET') polls++;
    return h.deps.api!<T>(key, method, path, body);
  } });
  q.setKey('fixture'); q.setBalance(balance(), q.key);
  await q.enqueue({ method: 'POST', path: '/one' }); await q.tick();
  await q.enqueue({ method: 'POST', path: '/two' }); h.advance();
  const run = q.tick(); await vi.waitFor(() => expect(reads).toBe(1));
  h.advance(6000); await q.tick();
  expect(polls).toBeGreaterThanOrEqual(2); expect(h.remote.size).toBe(2);
  gate.resolve(balance(2)); await run; await vi.waitFor(() => expect(q.concurrency).toBe(10));
});

test('short jobs recover full throughput after five accepted probes; another refusal resets the streak', async () => {
  const h = harness(); let refuse = true, posts = 0;
  const q = new Queue({ ...h.deps, api: async <T>(_key: string, method: string): Promise<T> => {
    if (method === 'GET') return balance() as T;
    posts++;
    if (refuse) { refuse = false; throw new ApiError(429, 'retry', 'Account full'); }
    return { usage: { type: 'generations', generations: 0.1 } } as T;
  } });
  q.setKey('fixture');
  for (let n = 0; n < 60; n++) await q.enqueue({ method: 'POST', path: `/short-${n}` });
  await q.tick();
  // The nineteen late successes from the initial burst must not count as accepted recovery probes.
  for (let n = 0; n < 4; n++) { h.advance(); const before = posts; await q.tick(); expect(posts).toBe(before + 1); }
  refuse = true; h.advance(); await q.tick();
  for (let n = 0; n < 5; n++) { h.advance(); const before = posts; await q.tick(); expect(posts).toBe(before + 1); }
  expect(q.current).toBe(20);
  const before = posts; await q.tick(); expect(posts).toBe(before + 20);
});
