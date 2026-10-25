import { expect, test, vi } from 'vitest';
import { accountTier, PLAN_JOB_LIMITS, planRestriction, requestTier } from '../../src/lib/pixellab/plans.ts';
import { planCapacity } from '../../src/lib/pixellab/capacity.ts';
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import type { Balance } from '../../src/lib/pixellab/routes.ts';

const balance = (plan: string | null, status = 'active'): Balance => ({ credits: { type: 'usd', usd: 100 }, subscription: { type: 'generations', status, plan, generations: 1000, total: 10000 } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
test.each([
  ['Free trial', 'trial', 0, 1], ['Free', 'active', 0, 1], ['Tier 0: Free', 'active', 0, 1],
  [null, 'none', 0, 1], ['Tier 3: Pixel Architect', 'expired', 0, 1],
  ['Tier 1: Pixel Apprentice', 'active', 1, 8], ['Tier 2: Pixel Artisan', 'active', 2, 10],
  ['Tier 3: Pixel Architect', 'active', 3, 20], ['Tier 4: Future plan', 'active', 4, 20],
  ['Tier 30: Future plan', 'active', 30, 20], ['Enterprise', 'enterprise', null, 3], [null, 'active', null, 3],
] as const)('plan %s / %s maps to tier %s and %s jobs', (plan, status, tier, jobs) => {
  expect(accountTier(balance(plan, status))).toBe(tier);
  expect(planCapacity(balance(plan, status)).limit).toBe(jobs);
});
test('all maintained concurrency values are declared in the named policy table', () => {
  expect(PLAN_JOB_LIMITS).toEqual({ freeTrial: 1, tier1: 8, tier2: 10, tier3Plus: 20, unknown: 3 });
});
test('paid feature checks do not reject allowed tools, reads, unknown plans, or credit-funded trial identity', () => {
  const free = balance('Free trial', 'trial');
  const req = (endpoint: string, params: unknown = null) => ({ method: 'POST' as const, endpoint, params });
  for (const endpoint of ['/create-character-v3', '/enhance-character-v3-prompt', '/edit-animation-v2', '/estimate-skeleton']) expect(planRestriction(free, req(endpoint))).toBeNull();
  for (const endpoint of ['/animate-with-skeleton-v3', '/animate-pixminimax', '/inpaint-v3', '/transfer-outfit-v2']) expect(planRestriction(free, req(endpoint))).toContain('Tier 1');
  expect(planRestriction(free, { ...req('/create-character-v3'), minimumTier: 1 })).toContain('No request sent');
  expect(planRestriction(free, { ...req('/create-character-v3'), tag: 'studio-base' })).toContain('Tier 1');
  expect(planRestriction(free, { ...req('/characters/id'), method: 'GET', minimumTier: 1 })).toBeNull();
  expect(planRestriction(balance('Enterprise', 'enterprise'), req('/inpaint-v3'))).toBeNull();
  expect(planRestriction(free, req('/characters/animations', { mode: 'v3' }))).toBeNull();
  expect(planRestriction(free, req('/characters/animations', { mode: 'pixminimax' }))).toContain('Tier 1');
  const large = req('/inpaint-v3', { inpainting_image: { size: { width: 512, height: 64 } } });
  expect(requestTier(large)).toBe(2);
  expect(planRestriction(balance('Tier 1: Pixel Apprentice'), large)).toContain('Tier 2');
  expect(planRestriction(balance('Tier 2: Pixel Artisan'), large)).toBeNull();
});

test('dependent workflows wait for an in-flight refresh while allowed operations and accepted polling continue', async () => {
  let now = 1000;
  const read = deferred<Balance>(), calls: string[] = [];
  const q = new Queue({ locks: null, now: () => now, online: () => true, all: async () => [], put: async () => {},
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      calls.push(`${method} ${path}`);
      if (path === '/balance') return await read.promise as T;
      return (method === 'POST' ? { background_job_id: 'accepted' } : { status: 'processing' }) as T;
    },
  });
  q.setKey('offline-fixture'); q.setBalance(balance('Tier 1: Pixel Apprentice'), q.key);
  await q.enqueue({ method: 'POST', path: '/edit-animation-v2', body: { seed: 1 } }); await q.tick();
  await q.enqueue({ method: 'POST', path: '/create-character-v3' }, { minimumTier: 1 });
  await q.enqueue({ method: 'POST', path: '/edit-animation-v2', body: { seed: 2 } });
  now = 62_000; await q.tick();
  expect(calls).toContain('GET /balance');
  expect(calls).toContain('GET /background-jobs/accepted');
  expect(calls.filter(c => c === 'POST /edit-animation-v2')).toHaveLength(2);
  expect(calls).not.toContain('POST /create-character-v3');
  expect(q.snapshot().jobs.find(r => r.minimumTier === 1)).toMatchObject({ state: 'queued', attempts: 0, waitingForPlan: expect.stringContaining('Checking') });
  read.resolve(balance('Free trial', 'trial')); await read.promise; await q.tick();
  await vi.waitFor(() => expect(q.concurrency).toBe(1)); // the capacity refresh finishes in the background
  expect(calls).not.toContain('POST /create-character-v3');
});

test.each([false, true])('plan refresh beginning during request persistence prevents transport (started marker: %s)', async (started) => {
  let now = 1000, held = false;
  const persisted = deferred<void>(), release = deferred<void>(), read = deferred<Balance>();
  const posts: string[] = [];
  const q = new Queue({ locks: null, now: () => now, online: () => true, all: async () => [],
    put: async (_id, rec) => {
      if (!held && rec.minimumTier === 1 && rec.state === 'submitting' && rec.requestStarted === started) {
        held = true; persisted.resolve(); await release.promise;
      }
    },
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return await read.promise as T;
      if (method === 'POST') posts.push(path);
      return {} as T;
    },
  });
  q.setKey('offline-fixture'); q.setBalance(balance('Tier 1: Pixel Apprentice'), q.key);
  await q.enqueue({ method: 'POST', path: '/create-character-v3' }, { minimumTier: 1 });
  const submitting = q.tick(); await persisted.promise;
  now = 62_000; await q.enqueue({ method: 'POST', path: '/edit-animation-v2' }); await q.tick();
  release.resolve(); await submitting;
  expect(posts).toEqual(['/edit-animation-v2']);
  expect(q.snapshot().jobs.find(r => r.minimumTier === 1)).toMatchObject({ state: 'queued', attempts: 0, requestStarted: false });
  read.resolve(balance('Free trial', 'trial'));
  await vi.waitFor(() => expect(q.concurrency).toBe(1)); await q.tick();
  expect(posts).toEqual(['/edit-animation-v2']);
});

test('failed initial account checks hold dependent spending and retry, while eligible tools remain available', async () => {
  let now = 1000, fail = true;
  const posts: string[] = [];
  const q = new Queue({ locks: null, now: () => now, online: () => true, all: async () => [], put: async () => {},
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') { if (fail) throw new Error('temporarily unavailable'); return balance('Tier 1: Pixel Apprentice') as T; }
      if (method === 'POST') posts.push(path);
      return {} as T;
    },
  });
  q.setKey('offline-fixture');
  await q.enqueue({ method: 'POST', path: '/create-character-v3' }, { minimumTier: 1 });
  await q.enqueue({ method: 'POST', path: '/edit-animation-v2' }); await q.tick();
  expect(posts).toEqual(['/edit-animation-v2']);
  expect(q.snapshot().jobs.find(r => r.minimumTier === 1)).toMatchObject({ attempts: 0, waitingForPlan: expect.stringContaining('Waiting to verify') });
  fail = false; now += 61_000; await q.tick(); await q.tick();
  expect(posts).toEqual(['/edit-animation-v2', '/create-character-v3']);
});

test.each([false, true])('cross-tab requirements strengthen the queued original (distinct duplicate: %s)', async (duplicate) => {
  const store = new Map<string, JobRec>(), posts: string[] = [];
  const deps = { locks: null, now: () => 62_000, online: () => true,
    all: async () => [...store.values()].map(r => structuredClone(r)),
    put: async (id: string, rec: JobRec) => { store.set(id, structuredClone(rec)); },
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (method === 'POST') posts.push(path);
      return balance('Free trial', 'trial') as T;
    },
  };
  const q = new Queue(deps); q.setKey('offline-fixture'); q.setBalance(balance('Free trial', 'trial'), q.key);
  const original = await q.enqueue({ method: 'POST', path: '/create-character-v3' });
  if (duplicate) store.set('follower-duplicate', { ...structuredClone(original), id: 'follower-duplicate', minimumTier: 1 });
  else {
    const follower = new Queue(deps); await follower.load();
    await follower.enqueue({ method: 'POST', path: '/create-character-v3' }, { minimumTier: 1 });
  }
  q.role = 'leader'; await q.tick();
  await vi.waitFor(() => expect(store.get(original.id)?.minimumTier).toBe(1));
  expect(posts).toEqual([]);
  expect(q.snapshot().jobs.find(r => r.id === original.id)).toMatchObject({ state: 'queued', attempts: 0, minimumTier: 1 });
  if (duplicate) expect(store.get('follower-duplicate')?.state).toBe('canceled');
});
test('free queues hold a whole character workflow before its first paid call, allow other calls, and resume after upgrade', async () => {
  const store = new Map<string, JobRec>(), posts: string[] = [];
  const q = new Queue({ locks: null, now: () => 1000, online: () => true,
    all: async () => [...store.values()], put: async (id, rec) => { store.set(id, structuredClone(rec)); },
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (method === 'GET') return balance('Free trial', 'trial') as T;
      posts.push(path); return {} as T;
    },
  });
  q.setKey('offline-fixture'); q.setBalance(balance('Free trial', 'trial'), q.key);
  const blocked = await q.enqueue({ method: 'POST', path: '/create-character-v3', body: { seed: 1 } }, { minimumTier: 1 });
  await q.enqueue({ method: 'POST', path: '/edit-animation-v2' });
  await q.tick();
  expect(posts).toEqual(['/edit-animation-v2']);
  expect(store.get(blocked.id)).toMatchObject({ state: 'queued', attempts: 0, waitingForPlan: expect.stringContaining('Tier 1') });
  expect(q.snapshot().counts.failed).toBe(0);
  q.setBalance(balance('Tier 1: Pixel Apprentice'), q.key); await q.tick();
  expect(posts).toEqual(['/edit-animation-v2', '/create-character-v3']);
  expect(store.get(blocked.id)).toMatchObject({ state: 'done', waitingForPlan: undefined });
});
