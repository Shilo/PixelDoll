import { accountBalance } from './account-fixture.ts'
import { expect, test } from 'vitest'
import { ApiError, classify, errorText } from '../../src/lib/pixellab/client.ts'
import { Queue, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'

function fixture(status: number, body?: unknown, endpoint = '/characters/animations', method: 'POST' | 'GET' = 'POST') {
  const records = new Map<string, JobRec>()
  let now = 1000, calls = 0
  const deps: Partial<Deps> = { locks: null, online: () => true, now: () => now,
    put: async (id, r) => { records.set(id, structuredClone(r)) }, get: async (id) => records.get(id),
    all: async () => [...records.values()].map((r) => structuredClone(r)),
    api: async <T>(_key: string, _method: string, path: string): Promise<T> => {
      if (path === '/balance') return accountBalance as T;
      if (++calls === 1) throw new ApiError(status, classify(status, body), `${method} ${endpoint} -> ${status}: ${errorText(body)}`, body)
      return { usage: { type: 'generations', generations: 0.1 } } as T
    },
  }
  const make = () => { const q = new Queue(deps); q.setKey('synthetic-key'); return q }
  return { make, calls: () => calls, advance: () => { now += 60000 }, request: { method, path: endpoint, body: method === 'POST' ? { seed: 123 } : undefined } }
}

test.each([423, 503, 529])('generic paid HTTP%i remains unknown after ticks and automatic reload recovery', async (status) => {
  const f = fixture(status, { detail: 'temporarily unavailable' }), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick()
  expect(record.state).toBe('lost')
  f.advance(); await q.tick()
  const reloaded = f.make(); await reloaded.load()
  expect((await reloaded.enqueue(f.request)).id).toBe(record.id)
  f.advance(); await reloaded.tick()
  expect(f.calls()).toBe(1)
})

test.each([423, 503, 529])('free GET HTTP%i remains retryable', async (status) => {
  const f = fixture(status, { detail: 'temporarily unavailable' }, '/characters/id', 'GET'), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick(); expect(record.state).toBe('queued')
  f.advance(); await q.tick()
  expect(record.state).toBe('done'); expect(f.calls()).toBe(2)
})

test('paid concurrency429 is retried after backoff', async () => {
  const f = fixture(429, { detail: 'Too many concurrent jobs' }), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick(); expect(record.state).toBe('queued')
  f.advance(); await q.tick()
  expect(record.state).toBe('done'); expect(f.calls()).toBe(2)
})

test('known exact animation no-job500 detail is retryable', async () => {
  const f = fixture(500, { detail: 'Failed to start any animation jobs' }), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick(); expect(record.state).toBe('queued')
  f.advance(); await q.tick()
  expect(record.state).toBe('done'); expect(f.calls()).toBe(2)
})

test.each([
  { status: 500, body: { detail: 'Failed to start any animation jobs' }, endpoint: '/animate-with-skeleton-v3' },
  { status: 503, body: { detail: 'Failed to start any animation jobs' } },
  { status: 529, body: { detail: 'Failed to start any animation jobs' } },
  { status: 500, body: { detail: 'Upstream said Failed to start any animation jobs' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs for some directions' } },
  { status: 500, body: { detail: 'Failed to start any other task' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', last_response: 'some jobs started' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', message: 'accepted one direction' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', error: 'One direction was accepted' } },
  { status: 500, body: { error: 'Failed to start any animation jobs', detail: 'One direction was accepted' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', last_response: { error: 'partial accepted', background_job_id: 'accepted-job' } } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', last_response: { error: 'One direction was accepted' } } },
  { status: 500, body: { last_response: { error: 'Failed to start any animation jobs' } } },
  { status: 429, body: { detail: 'Too many concurrent jobs', background_job_id: 'accepted-job' } },
  { status: 429, body: { detail: 'Too many concurrent jobs', background_job_ids: ['accepted-job'] } },
  { status: 429, body: { detail: 'Too many concurrent jobs', last_response: { background_job_id: 'accepted-job' } } },
  { status: 429, body: { detail: 'Too many concurrent jobs', last_response: { background_job_ids: ['accepted-job'] } } },
  { status: 500, body: { detail: 'Failed to start any animation jobs' + ' '.repeat(450) + 'but an upstream job was accepted' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', background_job_id: 'accepted-job' } },
  { status: 500, body: { detail: 'Failed to start any animation jobs', background_job_ids: ['accepted-job'] } },
])('uncertain or contradictory no-job wording never resends: %o', async ({ status, body, endpoint }) => {
  const f = fixture(status, body, endpoint), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick(); expect(record.state).toBe('lost')
  f.advance(); await q.tick()
  expect(f.calls()).toBe(1)
})


test.each([400, 401, 402, 422])('paid HTTP%i with job evidence is unknown across reconnect and reload, regardless of classification', async (status) => {
  const body = { detail: 'error after upstream acceptance', background_job_ids: ['accepted-job'] }
  const f = fixture(status, body), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick()
  expect(record.state).toBe('lost')
  expect(record.response).toEqual(body)
  if (status === 401 || status === 402) expect(q.snapshot().paused).toBe(status === 401 ? 'auth' : 'credits')
  q.resume(); f.advance(); await q.tick()
  const reloaded = f.make(); await reloaded.load()
  expect((await reloaded.enqueue(f.request)).id).toBe(record.id)
  await reloaded.tick()
  expect(f.calls()).toBe(1)
})

test.each([401, 402])('ordinary paid HTTP%i without job evidence still waits for authentication or credits', async (status) => {
  const f = fixture(status, { detail: status === 401 ? 'Invalid API token' : 'Insufficient credits' }), q = f.make()
  const record = await q.enqueue(f.request)
  await q.tick()
  expect(record.state).toBe('queued')
  expect(q.snapshot().paused).toBe(status === 401 ? 'auth' : 'credits')
  f.advance(); await q.tick(); expect(f.calls()).toBe(1)
  q.resume(); await q.tick()
  expect(record.state).toBe('done'); expect(f.calls()).toBe(2)
})
