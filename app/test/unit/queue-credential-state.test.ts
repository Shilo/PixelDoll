import { expect, test } from 'vitest'
import { ApiError, classify } from '../../src/lib/pixellab/client.ts'
import { Queue, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { accountBalance } from './account-fixture.ts'
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
function fixture() {
  const records = new Map<string, JobRec>(), pending = deferred<unknown>(), entered = deferred<void>()
  let now = 1000, calls = 0
  const deps: Partial<Deps> = { locks: null, online: () => true, now: () => now,
    put: async (id, r) => { records.set(id, structuredClone(r)) }, get: async (id) => records.get(id), all: async () => [...records.values()],
    api: async <T>(_key: string, _method: string, path: string) => {
      if (path === '/balance' && q.paused !== 'offline') return accountBalance as T
      calls++; entered.resolve(); return await pending.promise as T
    },
  }
  const q = new Queue(deps); q.setKey('synthetic-key')
  return { q, deps, entered: entered.promise, pending, calls: () => calls, advance: () => { now += 60000 } }
}
const error = (status: number, body?: unknown) => new ApiError(status, classify(status, body), 'synthetic response', body)
test.each([401, 402, 0])('old submit HTTP%i cannot pause a replacement credential, including same-key Forget/reconnect', async (status) => {
  for (const sameKey of [false, true]) {
    const f = fixture(), record = await f.q.enqueue({ method: 'POST', path: '/estimate-skeleton', body: { seed: 1 } })
    const tick = f.q.tick(); await f.entered
    if (sameKey) f.q.setKey('')
    f.q.setKey(sameKey ? 'synthetic-key' : 'replacement-key')
    f.pending.reject(error(status, status === 0 ? { network: true } : undefined)); await tick
    expect(f.q.snapshot().paused).toBeNull(); expect(record.state).toBe(status === 0 ? 'lost' : 'queued'); expect(f.calls()).toBe(1)
  }
})
test.each([401, 402])('old submit HTTP%i with accepted IDs remains lost without pausing a new credential', async (status) => {
  const f = fixture(), record = await f.q.enqueue({ method: 'POST', path: '/estimate-skeleton', body: { seed: 1 } })
  const tick = f.q.tick(); await f.entered
  f.q.setKey(''); f.q.setKey('synthetic-key')
  f.pending.reject(error(status, { background_job_id: 'accepted-job' })); await tick
  expect(record.state).toBe('lost'); expect(f.q.snapshot().paused).toBeNull()
  f.advance(); await f.q.tick(); expect(f.calls()).toBe(1)
})
test.each([401, 0])('late poll HTTP%i retains its job without pausing the new credential', async (status) => {
  const f = fixture(), poll = deferred<unknown>(), entered = deferred<void>()
  const q = new Queue({ ...f.deps, api: async <T>(_key: string, method: string, path: string) => {
    if (path === '/balance') return accountBalance as T
    if (method === 'POST') return { background_job_id: 'paid-job' } as T
    entered.resolve(); return await poll.promise as T
  } }); q.setKey('synthetic-key')
  const record = await q.enqueue({ method: 'POST', path: '/characters/animations', body: { seed: 1 } }); await q.tick()
  const tick = q.tick(); await entered.promise
  q.setKey(''); q.setKey('synthetic-key')
  poll.reject(error(status, status === 0 ? { network: true } : undefined)); await tick
  expect(q.snapshot().paused).toBeNull(); expect(record.state).toBe('running')
  expect(record.jobs[0].id).toBe('paid-job'); expect(record.jobs[0].error).toBe('synthetic response')
})
test.each(['success', 'auth', 'credits', 'network'] as const)('late offline probe %s cannot change new credentials or release queued work', async (result) => {
  const f = fixture(); await f.q.enqueue({ method: 'POST', path: '/estimate-skeleton', body: { seed: 1 } })
  f.q.goOffline(); f.advance(); const tick = f.q.tick(); await f.entered
  f.q.setKey(''); f.q.setKey('synthetic-key')
  if (result === 'success') f.pending.resolve({})
  else f.pending.reject(error(result === 'auth' ? 401 : result === 'credits' ? 402 : 0, result === 'network' ? { network: true } : undefined))
  await tick
  expect(f.q.snapshot().paused).toBe('offline'); expect(f.calls()).toBe(1); expect(f.q.snapshot().jobs[0].state).toBe('queued')
})
test.each([401, 402])('current offline probe HTTP%i pauses for its actual credential instead of releasing paid work', async (status) => {
  const f = fixture(); await f.q.enqueue({ method: 'POST', path: '/estimate-skeleton', body: { seed: 1 } })
  f.q.goOffline(); f.advance(); const tick = f.q.tick(); await f.entered
  f.pending.reject(error(status)); await tick
  expect(f.q.snapshot().paused).toBe(status === 401 ? 'auth' : 'credits')
  expect(f.calls()).toBe(1); expect(f.q.snapshot().jobs[0].state).toBe('queued')
})
