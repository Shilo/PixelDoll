import { accountBalance } from './account-fixture.ts'
import { expect, test } from 'vitest'
import { Queue, upgraded, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { ApiError } from '../../src/lib/pixellab/client.ts'

function fixture(status: number) {
  const records = new Map<string, JobRec>()
  let posts = 0
  const deps: Partial<Deps> = {
    locks: null, online: () => true, now: () => 1000,
    put: async (id, r) => { records.set(id, structuredClone(r)) }, get: async (id) => structuredClone(records.get(id)),
    all: async () => [...records.values()].map((r) => structuredClone(r)),
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      posts++
      if (posts === 1) throw new ApiError(status, status === 422 ? 'invalid' : 'retry', 'synthetic outcome')
      return { usage: { type: 'generations', generations: 1 } } as T
    },
  }
  const make = () => { const q = new Queue(deps); q.setKey('synthetic-key'); return q }
  return { records, make, posts: () => posts }
}
const request = { method: 'POST' as const, path: '/create-character-v3', body: { description: 'synthetic', seed: 123 } }

for (const status of [0, 500, 422]) test(`automatic paid flow resume cannot resend terminal status ${status}`, async () => {
  const f = fixture(status), initial = f.make()
  const old = await initial.enqueue(request)
  await initial.tick()
  const resumed = f.make()
  await resumed.load()
  expect((await resumed.enqueue(request)).id).toBe(old.id)
  await resumed.tick()
  expect(f.posts()).toBe(1)
  const reroll = await resumed.enqueue({ ...request, body: { ...request.body, seed: 124 } })
  expect(reroll.id).not.toBe(old.id)
  await resumed.tick()
  expect(f.posts()).toBe(2)
})

test('records saved with the previous canceled state and field names load and still block a resend', async () => {
  const f = fixture(500), q = f.make()
  const old = await q.enqueue(request)
  await q.tick()
  f.records.set(old.id, { ...f.records.get(old.id)!, state: 'cancelled', autoCancelledAttempts: [1] } as unknown as JobRec)
  const resumed = f.make(); await resumed.load()
  const saved = f.records.get(old.id) as JobRec & { autoCancelledAttempts?: number[] }
  expect(saved.state).toBe('canceled'); expect(saved.autoCanceledAttempts).toEqual([1]); expect(saved.autoCancelledAttempts).toBeUndefined()
  expect((await resumed.enqueue(request)).id).toBe(old.id)
  await resumed.tick()
  expect(f.posts()).toBe(1)
})
test('a cancel written by an older tab is read with the current state name', () => {
  const r = { state: 'cancelled' } as unknown as JobRec
  expect(upgraded(r)).toBe(true); expect(r.state).toBe('canceled'); expect(upgraded(r)).toBe(false)
})
test('historical old lost records cannot hide a newer queued or successful request during resume', async () => {
  const f = fixture(500), q = f.make()
  const old = await q.enqueue(request)
  await q.tick()
  // An explicit request reproduces a duplicate ledger created by an older app version.
  const newer = await q.enqueue(request, { resumeSafe: false })
  expect(newer.id).not.toBe(old.id)
  expect((await q.enqueue(request, { resumeSafe: true })).id).toBe(newer.id)
  await q.tick()
  expect(f.records.get(newer.id)?.state).toBe('done')
  const resumed = f.make(); await resumed.load()
  expect((await resumed.enqueue(request, { resumeSafe: true })).id).toBe(newer.id)
  await resumed.tick()
  expect(f.posts()).toBe(2)
})


test('a disconnected Studio queue rejects obsolete flows; reconnect permits new work', async () => {
  const f = fixture(500), q = f.make()
  await q.connect()
  q.disconnect()
  await expect(q.enqueue(request)).rejects.toThrow('Queue disconnected')
  expect(f.records.size).toBe(0)
  await q.connect()
  expect((await q.enqueue(request)).state).toBe('queued')
  q.disconnect()
})

test('disconnect during input storage prevents the old flow publishing a request after reconnect', async () => {
  const records = new Map<string, JobRec>()
  let finish!: (hash: string) => void, entered!: () => void
  const storing = new Promise<void>((resolve) => { entered = resolve })
  const q = new Queue({ locks: null, all: async () => [],
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    putBlob: () => new Promise<string>((resolve) => { finish = resolve; entered() }),
  })
  await q.connect()
  const pending = q.enqueue({ ...request, body: { ...request.body, image: { type: 'base64', base64: 'AQ==' } } })
  await storing // disconnect while the image is being stored
  q.disconnect()
  await q.connect()
  finish('synthetic-image-hash')
  await expect(pending).rejects.toThrow('Queue disconnected')
  expect(records.size).toBe(0)
  q.disconnect()
})


for (const phase of ['network', 'merge'] as const) test(`a tick suspended in ${phase} cannot submit after disconnect`, async () => {
  const records = new Map<string, JobRec>()
  let now = 1000, posts = 0, hold = false, finish!: () => void, entered!: () => void
  const waiting = new Promise<void>((resolve) => { entered = resolve })
  const release = new Promise<void>((resolve) => { finish = resolve })
  const q = new Queue({ locks: null, online: () => true, now: () => now,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    all: async () => { if (phase === 'merge' && hold) { entered(); await release }; return [...records.values()].map((r) => structuredClone(r)) },
    api: async <T>(_key: string, method: string): Promise<T> => {
      if (method === 'GET' && phase === 'network' && hold) { entered(); await release }
      if (method === 'POST') posts++
      return { usage: { type: 'generations', generations: 1 } } as T
    },
  })
  await q.connect()
  q.setKey('synthetic-key')
  const queued = await q.enqueue(request)
  if (phase === 'network') q.goOffline()
  else q.role = 'leader'
  now += 60_000; hold = true
  const pending = q.tick()
  await waiting
  q.disconnect()
  finish(); await pending
  expect(posts).toBe(0)
  expect(records.get(queued.id)?.state).toBe('queued')
  // An obsolete queue must remain inert on any later ticker callback too.
  await q.tick()
  expect(posts).toBe(0)
})


test('aborted orchestration cannot publish a request after asynchronous image storage', async () => {
  const records = new Map<string, JobRec>(), scope = new AbortController()
  let finish!: (hash: string) => void, entered!: () => void
  const preparing = new Promise<void>((resolve) => { entered = resolve })
  const q = new Queue({ locks: null, all: async () => [],
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    putBlob: () => new Promise<string>((resolve) => { finish = resolve; entered() }),
  })
  const pending = q.enqueue({ ...request, body: { ...request.body, image: { type: 'base64', base64: 'AQ==' } } }, { signal: scope.signal })
  await preparing
  scope.abort(new Error('sibling failed'))
  finish('synthetic-image-hash')
  await expect(pending).rejects.toThrow('sibling failed')
  expect(records.size).toBe(0)
})

test('queued-only cancellation never sends DELETE for an already submitted paid request', async () => {
  const records = new Map<string, JobRec>(), methods: string[] = []
  const q = new Queue({ locks: null, online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    all: async () => [...records.values()].map((r) => structuredClone(r)),
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      methods.push(method)
      return (method === 'POST' ? { background_job_id: 'synthetic-job' } : { id: 'synthetic-job', status: 'processing', created_at: '' }) as T
    },
  })
  q.setKey('synthetic-key')
  const record = await q.enqueue(request)
  await q.tick()
  expect(record.state).toBe('running')
  await q.cancel(record.id, true)
  expect(record.state).toBe('running')
  expect(methods).not.toContain('DELETE')
})


test('disconnect during submitting persistence prevents HTTP leaving the old queue', async () => {
  const records = new Map<string, JobRec>()
  let posts = 0, entered!: () => void, finish!: () => void
  const preparing = new Promise<void>((resolve) => { entered = resolve })
  const release = new Promise<void>((resolve) => { finish = resolve })
  const q = new Queue({ locks: null, all: async () => [], online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)); if (r.state === 'submitting') { entered(); await release } },
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T; posts++; return {} as T },
  })
  await q.connect(); q.setKey('synthetic-key')
  const record = await q.enqueue(request)
  const pending = q.tick()
  await preparing
  q.disconnect(); finish(); await pending
  expect(posts).toBe(0)
  expect(records.get(record.id)?.state).toBe('canceled')
  expect(records.get(record.id)?.error).toContain('No API request was made')
  expect(record.submittedAt).toBeUndefined()
})

test('failed sibling during submitting image rehydration prevents the paid POST', async () => {
  const records = new Map<string, JobRec>(), scope = new AbortController(), original = new AbortController()
  let posts = 0, entered!: () => void, finish!: (blob: Blob) => void
  const preparing = new Promise<void>((resolve) => { entered = resolve })
  const q = new Queue({ locks: null, all: async () => [], online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    putBlob: async () => 'synthetic-image-hash',
    getBlob: () => new Promise<Blob>((resolve) => { finish = resolve; entered() }),
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T; posts++; return {} as T },
  })
  q.setKey('synthetic-key')
  const imageRequest = { ...request, body: { ...request.body, image: { type: 'base64', base64: 'AQ==' } } }
  const record = await q.enqueue(imageRequest, { signal: original.signal })
  const pending = q.tick()
  await preparing
  // Recovery may attach to an existing record while its input preflight is already suspended.
  expect((await q.enqueue(imageRequest, { signal: scope.signal })).id).toBe(record.id)
  original.abort(new Error('first consumer failed')); scope.abort(new Error('sibling failed')); finish(new Blob([new Uint8Array([1])]))
  await pending
  expect(posts).toBe(0)
  expect(records.get(record.id)?.state).toBe('canceled')
})

test('scope cancellation after HTTP invocation preserves the paid job response and never sends DELETE', async () => {
  const records = new Map<string, JobRec>(), scope = new AbortController(), methods: string[] = []
  let entered!: () => void, finish!: (value: { background_job_id: string }) => void
  const sent = new Promise<void>((resolve) => { entered = resolve })
  const q = new Queue({ locks: null, all: async () => [], online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      methods.push(method); entered()
      return await new Promise<T>((resolve) => { finish = resolve as typeof finish })
    },
  })
  q.setKey('synthetic-key')
  const record = await q.enqueue(request, { signal: scope.signal })
  const pending = q.tick()
  await sent
  scope.abort(new Error('sibling failed')); await q.cancel(record.id, true)
  finish({ background_job_id: 'synthetic-job' }); await pending
  expect(methods).toEqual(['POST'])
  expect(records.get(record.id)?.state).toBe('running')
  expect(records.get(record.id)?.jobs[0].id).toBe('synthetic-job')
})


test('one failed scoped consumer cannot cancel a shared queued request still needed by another scope', async () => {
  const records = new Map<string, JobRec>(), a = new AbortController(), b = new AbortController()
  let posts = 0
  const q = new Queue({ locks: null, online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T; posts++; return { usage: { type: 'generations', generations: 0.1 } } as T },
  })
  q.setKey('synthetic-key')
  const shared = await q.enqueue(request, { signal: a.signal })
  expect((await q.enqueue(request, { signal: b.signal })).id).toBe(shared.id)
  a.abort(new Error('flow A failed'))
  expect(shared.state).toBe('queued')
  await q.tick()
  expect(posts).toBe(1)
  expect(shared.state).toBe('done')
})

test('all scoped consumers failing cancels a shared queued request without a POST', async () => {
  const a = new AbortController(), b = new AbortController()
  let posts = 0
  const q = new Queue({ locks: null, online: () => true, put: async () => {},
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T; posts++; return {} as T },
  })
  q.setKey('synthetic-key')
  const shared = await q.enqueue(request, { signal: a.signal })
  await q.enqueue(request, { signal: b.signal })
  a.abort(); b.abort()
  await q.tick()
  expect(posts).toBe(0)
  expect(shared.state).toBe('canceled')
})

test('a live unscoped consumer pins shared work when a scoped consumer fails', async () => {
  let posts = 0
  const scope = new AbortController(), q = new Queue({ locks: null, online: () => true, put: async () => {},
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T; posts++; return { usage: { type: 'generations', generations: 0.1 } } as T },
  })
  q.setKey('synthetic-key')
  const shared = await q.enqueue(request)
  await q.enqueue(request, { signal: scope.signal })
  scope.abort()
  await q.tick()
  expect(posts).toBe(1)
  expect(shared.state).toBe('done')
})

test('scoped recovery can adopt a historical queued record with no live in-memory consumer', async () => {
  const f = fixture(500), original = f.make(), saved = await original.enqueue(request)
  const recovered = f.make(); await recovered.load()
  const scope = new AbortController()
  expect((await recovered.enqueue(request, { signal: scope.signal })).id).toBe(saved.id)
  scope.abort()
  await recovered.tick()
  expect(f.posts()).toBe(0)
  expect(f.records.get(saved.id)?.state).toBe('canceled')
})


test('a new explicit attempt can recover automatic unsent cancellation; the same attempt cannot', async () => {
  const records = new Map<string, JobRec>(), firstScope = new AbortController()
  let posts = 0
  const deps: Partial<Deps> = { locks: null, online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    all: async () => [...records.values()].map((r) => structuredClone(r)),
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T; posts++; return { usage: { type: 'generations', generations: 0.1 } } as T },
  }
  const original = new Queue(deps); original.setKey('synthetic-key')
  const canceled = await original.enqueue(request, { signal: firstScope.signal, attempt: 123 })
  firstScope.abort()
  const recovered = new Queue(deps); recovered.setKey('synthetic-key'); await recovered.load()
  expect((await recovered.enqueue(request, { signal: new AbortController().signal, attempt: 123 })).id).toBe(canceled.id)
  await recovered.tick(); expect(posts).toBe(0)
  const next = await recovered.enqueue(request, { signal: new AbortController().signal, attempt: 124 })
  expect(next.id).not.toBe(canceled.id)
  await recovered.tick(); expect(posts).toBe(1)
})

test('distinct explicit attempts cannot reopen a user cancellation or uncertain paid outcome', async () => {
  const f = fixture(500), q = f.make(), scope = new AbortController()
  const canceled = await q.enqueue(request, { signal: scope.signal, attempt: 123 })
  await q.cancel(canceled.id) // deliberate user intent, distinct from failed-sibling cleanup
  expect((await q.enqueue(request, { signal: new AbortController().signal, attempt: 124 })).id).toBe(canceled.id)
  const other = { ...request, body: { ...request.body, seed: 125 } }
  const lost = await q.enqueue(other, { signal: new AbortController().signal, attempt: 125 })
  await q.tick(); expect(lost.state).toBe('lost')
  expect((await q.enqueue(other, { signal: new AbortController().signal, attempt: 126 })).id).toBe(lost.id)
})


test('automatic shared cancellation remembers every failed attempt across reload', async () => {
  const records = new Map<string, JobRec>(), a = new AbortController(), b = new AbortController()
  const deps: Partial<Deps> = { locks: null,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    all: async () => [...records.values()].map((r) => structuredClone(r)),
  }
  const original = new Queue(deps)
  const shared = await original.enqueue(request, { signal: a.signal, attempt: 1 })
  await original.enqueue(request, { signal: b.signal, attempt: 2 })
  a.abort(); b.abort()
  expect(records.get(shared.id)?.autoCanceledAttempts?.sort()).toEqual([1, 2])
  const recovered = new Queue(deps); await recovered.load()
  for (const attempt of [1, 2]) expect((await recovered.enqueue(request, { signal: new AbortController().signal, attempt })).id).toBe(shared.id)
  expect((await recovered.enqueue(request, { signal: new AbortController().signal, attempt: 3 })).id).not.toBe(shared.id)
})


test('synchronous requests publish their HTTP start while pending and retain the full duration', async () => {
  let now = 1000, posts = 0, sent!: () => void, finish!: (response: { usage: { type: 'generations'; generations: number } }) => void
  const entered = new Promise<void>((resolve) => { sent = resolve })
  const records = new Map<string, JobRec>()
  const q = new Queue({ locks: null, now: () => now, online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      posts++; sent()
      return await new Promise<T>((resolve) => { finish = resolve as typeof finish })
    },
  })
  q.setKey('synthetic-key')
  const snapshots: JobRec[] = []
  const un = q.subscribe((s) => { const r = s.jobs[0]; if (r) snapshots.push(r) })
  const record = await q.enqueue({ method: 'POST', path: '/estimate-skeleton', body: { image: 'synthetic' } })
  const pending = q.tick()
  await entered
  expect(snapshots.at(-1)).toMatchObject({ state: 'submitting', submittedAt: 1000 })
  expect(posts).toBe(1)
  now += 240000
  finish({ usage: { type: 'generations', generations: 0.1 } })
  await pending
  const saved = records.get(record.id)!
  expect(saved).toMatchObject({ state: 'done', submittedAt: 1000, finishedAt: 241000 })
  expect(saved.finishedAt! - saved.submittedAt!).toBe(240000)
  expect(posts).toBe(1)
  un()
})

test('submission-start notification occurs after HTTP invocation even when a subscriber disconnects', async () => {
  let posts = 0, finished!: (response: { background_job_id: string }) => void, sent!: () => void
  const polls: string[] = []
  const entered = new Promise<void>((resolve) => { sent = resolve })
  const records = new Map<string, JobRec>()
  const deps: Partial<Deps> = { locks: null, all: async () => [...records.values()].map(r => structuredClone(r)), online: () => true,
    put: async (id, r) => { records.set(id, structuredClone(r)) },
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      if (method === 'GET') { polls.push(path); return { id: 'already-sent-job', status: 'processing', created_at: '' } as T }
      posts++; sent(); return await new Promise<T>((resolve) => { finished = resolve as typeof finished }) },
  }
  const q = new Queue(deps)
  await q.connect(); q.setKey('synthetic-key')
  const un = q.subscribe((s) => { if (s.jobs.some((r) => r.state === 'submitting' && r.submittedAt !== undefined)) { expect(posts).toBe(1); q.disconnect() } })
  const record = await q.enqueue(request)
  const pending = q.tick()
  await entered
  finished({ background_job_id: 'already-sent-job' })
  await pending
  expect(posts).toBe(1)
  expect(record.state).toBe('running')
  expect(record.jobs[0].id).toBe('already-sent-job')
  expect(records.get(record.id)?.jobs[0].id).toBe('already-sent-job')
  const resumed = new Queue(deps)
  await resumed.load()
  expect((await resumed.enqueue(request)).id).toBe(record.id)
  expect(resumed.snapshot().jobs[0]).toMatchObject({ state: 'running', jobs: [{ id: 'already-sent-job' }] })
  resumed.setKey('synthetic-key')
  await resumed.tick()
  expect(polls).toEqual(['/background-jobs/already-sent-job'])
  expect(records.get(record.id)).toMatchObject({ state: 'running', jobs: [{ id: 'already-sent-job', status: 'processing' }] })
  expect(posts).toBe(1)
  un(); q.disconnect()
})

test('an interrupted HTTP submission without a durable receipt stays lost across repeated queue restarts', async () => {
  const records = new Map<string, JobRec>()
  let posts = 0, sent!: () => void
  const entered = new Promise<void>(resolve => { sent = resolve })
  const deps: Partial<Deps> = { locks: null, online: () => true,
    all: async () => [...records.values()].map(r => structuredClone(r)),
    put: async (id, record) => { records.set(id, structuredClone(record)) },
    api: async <T>(_key: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      expect(method).toBe('POST'); posts++; sent()
      return new Promise<T>(() => {}) // The crashed renderer never receives the server's acceptance or rejection.
    },
  }
  const original = new Queue(deps); original.setKey('synthetic-key')
  const record = await original.enqueue(request)
  void original.tick()
  await entered
  expect(records.get(record.id)).toMatchObject({ state: 'submitting', requestStarted: true, jobs: [] })
  for (let restart = 0; restart < 2; restart++) {
    const resumed = new Queue(deps); resumed.setKey('synthetic-key'); await resumed.load()
    expect((await resumed.enqueue(request)).id).toBe(record.id)
    await resumed.tick()
    expect(records.get(record.id)).toMatchObject({ state: 'lost', jobs: [] })
    expect(records.get(record.id)?.error).toContain('Not resubmitted')
    expect(posts).toBe(1)
  }
})
