import { expect, test } from 'vitest';
import { Queue, requestIdentity, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts';
import { accountBalance } from './account-fixture.ts';

const request = { method: 'POST' as const, path: '/animate-with-skeleton-v3', body: { seed: 17 } };
const tags = ['m3', 'studio-move', 'studio-rig'];
function fixture() {
  const records = new Map<string, JobRec>(), calls: { method: string; path: string }[] = [];
  let now = 1000, online = true;
  const deps: Partial<Deps> = {
    locks: null, online: () => online, now: () => now,
    put: async (id, r) => { records.set(id, structuredClone(r)); },
    get: async id => { const r = records.get(id); return r && structuredClone(r); },
    all: async () => [...records.values()].map(r => structuredClone(r)),
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      calls.push({ method, path });
      return (method === 'POST' ? { background_job_id: 'accepted-job' } : path.startsWith('/background-jobs/') ? { id: 'accepted-job', status: 'processing' } : {}) as T;
    },
  };
  const make = () => { const q = new Queue(deps); q.setKey('synthetic-key'); return q; };
  return { records, calls, make, advance: () => { now += 60_000; }, offline: () => { online = false; }, online: () => { online = true; } };
}
async function legacy(tag: string, overrides: Partial<JobRec> = {}): Promise<JobRec> {
  const { requestHash } = await requestIdentity(request);
  return { id: 'legacy-generation', label: 'Retained generation', tag, method: 'POST', endpoint: request.path, params: request.body, inputs: [], requestHash,
    state: 'queued', attempts: 0, requestStarted: false, nextAt: 0, createdAt: 1000, jobs: [], gens: 0, usd: 0, ...overrides };
}

test.each(tags)('restored %s queued work without player consent fails before any POST, including after offline recovery', async tag => {
  const f = fixture(), r = await legacy(tag); f.records.set(r.id, r); f.offline();
  const q = f.make(); await q.load();
  expect(f.records.get(r.id)).toMatchObject({ state: 'failed', requestStarted: false, attempts: 0 });
  expect(f.records.get(r.id)!.error).toMatch(/review.*request a new attempt/i);
  expect(f.records.get(r.id)!.playerRequested).toBeUndefined();
  await q.tick(); f.online(); f.advance(); await q.tick();
  expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(0);
  expect(q.snapshot().counts.failed).toBe(1);
});

test('a newly queued unmarked generation is blocked by the shared work guard even while offline', async () => {
  const f = fixture(), q = f.make(); f.offline();
  const r = await q.enqueue(request, { tag: 'm3' }); await q.tick();
  expect(f.records.get(r.id)!.state).toBe('failed'); expect(f.calls).toHaveLength(0);
  f.online(); f.advance(); await q.tick();
  expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(0);
});

test.each(tags)('a fresh player-requested %s generation persists consent and submits exactly once across reload', async tag => {
  const f = fixture(), q = f.make(), r = await q.enqueue(request, { tag, playerRequested: true });
  expect(f.records.get(r.id)!.playerRequested).toBe(true);
  await q.tick(); expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  const resumed = f.make(); await resumed.load(); await resumed.tick(); await resumed.tick();
  expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  expect(f.calls.filter(c => c.path === '/background-jobs/accepted-job')).toHaveLength(1);
  expect(f.records.get(r.id)!.state).toBe('running');
});

test.each(['queued', 'submitting', 'running'] as const)('old %s records with accepted remote jobs only poll and never resend', async state => {
  const f = fixture(), r = await legacy('studio-rig', { state, attempts: 1, requestStarted: true, jobs: [{ id: 'accepted-job', status: 'processing', done: false, results: [] }] });
  f.records.set(r.id, r); const q = f.make(); await q.load(); await q.tick();
  expect(f.calls).toEqual([{ method: 'GET', path: '/background-jobs/accepted-job' }]);
  expect(f.records.get(r.id)!.state).toBe('running');
  expect(f.records.get(r.id)!.playerRequested).toBeUndefined();
});

test('a newly marked matching request cannot upgrade an old queued record into consent', async () => {
  const f = fixture(), q = f.make(), old = await q.enqueue(request, { tag: 'studio-move' });
  const matching = await q.enqueue(request, { tag: 'studio-move', playerRequested: true });
  expect(matching.id).toBe(old.id); expect(matching.state).toBe('failed'); expect(matching.playerRequested).toBeUndefined();
  await q.tick(); expect(f.calls).toHaveLength(0);
  const explicit = await q.enqueue({ ...request, body: { seed: 18 } }, { tag: 'studio-move', playerRequested: true });
  expect(explicit.id).not.toBe(old.id); await q.tick();
  expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  expect(f.records.get(old.id)!.state).toBe('failed');
});

test.each(['lost', 'failed', 'canceled', 'done'] as const)('current consent never replaces a matching old %s receipt automatically', async state => {
  const f = fixture(), r = await legacy('m3', { state, attempts: 1 }); f.records.set(r.id, r);
  const q = f.make(); await q.load();
  const reused = await q.enqueue(request, { tag: 'm3', playerRequested: true }); await q.tick();
  expect(reused.id).toBe(r.id); expect(reused.state).toBe(state); expect(reused.playerRequested).toBeUndefined();
  expect(f.calls).toHaveLength(0); expect(f.records.size).toBe(1);
});

test('leader adoption blocks an old follower generation while retaining newly requested work', async () => {
  const f = fixture(), leader = f.make(), follower = f.make();
  leader.role = 'leader'; follower.role = 'follower'; await leader.load();
  const old = await follower.enqueue(request, { tag: 'm3' }); await follower.tick();
  expect(f.records.get(old.id)!.state).toBe('queued'); expect(f.calls).toHaveLength(0);
  f.advance(); await leader.tick();
  expect(f.records.get(old.id)!.state).toBe('failed'); expect(f.calls).toHaveLength(0);
  const current = await follower.enqueue({ ...request, body: { seed: 19 } }, { tag: 'm3', playerRequested: true });
  f.advance(); await leader.tick();
  expect(f.records.get(current.id)).toMatchObject({ state: 'running', playerRequested: true });
  expect(f.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  expect(f.records.get(old.id)!.playerRequested).toBeUndefined();
});

test('leader adoption of an accepted follower job only polls its existing remote identity', async () => {
  const f = fixture(), q = f.make(); q.role = 'leader'; await q.load();
  const r = await legacy('studio-move', { jobs: [{ id: 'accepted-job', status: 'processing', done: false, results: [] }] });
  f.records.set(r.id, r); f.advance(); await q.tick();
  expect(f.calls).toEqual([{ method: 'GET', path: '/background-jobs/accepted-job' }]);
  expect(f.records.get(r.id)!.state).toBe('running');
});

test('legacy tagged GETs and unrelated POSTs retain their existing behavior', async () => {
  const f = fixture(), q = f.make();
  const read = await q.enqueue({ method: 'GET', path: '/characters/synthetic' }, { tag: 'm3' });
  await q.tick(); expect(f.records.get(read.id)!.state).toBe('done');
  await q.enqueue(request, { tag: 'equipment-fit:synthetic' }); await q.tick();
  expect(f.calls).toEqual([{ method: 'GET', path: '/characters/synthetic' }, { method: 'POST', path: request.path }]);
});
