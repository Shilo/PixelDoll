import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { activityRequest, beginActivityCall, clearActivity, finishActivityCall, MAX_FOREGROUND_CALLS } from '../../src/lib/pixellab/activity.ts'
import { accountBalance } from './account-fixture.ts'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

beforeEach(() => clearActivity())
afterEach(() => { vi.unstubAllGlobals(); clearActivity() })

async function fixture(pendingPoll = false) {
  const restoreEntered = deferred<void>(), restoredBlob = deferred<Blob>(), pollEntered = deferred<void>(), pollResponse = deferred<Response>()
  const records = new Map<string, JobRec>()
  let blockRestoration = false
  const image = () => new Blob([new Uint8Array([1])])
  const q = new Queue({ locks: null, online: () => true, now: () => 1000,
    put: async (id, rec) => { records.set(id, structuredClone(rec)) },
    putBlob: async () => 'synthetic-image-hash',
    getBlob: async () => {
      if (!blockRestoration) return image()
      restoreEntered.resolve()
      return restoredBlob.promise
    },
  })
  q.setKey('synthetic-old-key')
  q.setBalance(accountBalance, q.key)
  const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST' && String(url).endsWith('/animate-with-skeleton-v3')) {
      return new Response('{"background_job_id":"synthetic-paid-job"}', { status: 200 })
    }
    expect(init?.method).toBe('GET')
    expect(String(url)).toMatch(/\/background-jobs\/synthetic-paid-job$/)
    pollEntered.resolve()
    if (pendingPoll) return pollResponse.promise
    return new Response('{"detail":"Invalid API key"}', { status: 401 })
  })
  vi.stubGlobal('fetch', transport)
  const record = await q.enqueue({ method: 'POST', path: '/animate-with-skeleton-v3',
    body: { image: { type: 'base64', base64: 'AQ==' }, seed: 1 } })
  await q.tick()
  expect(record.state).toBe('running')
  expect(transport).toHaveBeenCalledTimes(1)
  // Exercise the actual client restoration path after bounded Activity retention evicts its submission.
  for (let i = 0; i <= MAX_FOREGROUND_CALLS; i++) {
    const id = beginActivityCall('GET', '/synthetic-free-read')
    finishActivityCall(id, 200, true)
  }
  expect(activityRequest(record.id)).toBeUndefined()
  blockRestoration = true
  return { q, record, transport, restoreEntered: restoreEntered.promise, pollEntered: pollEntered.promise,
    release: () => restoredBlob.resolve(image()), pollResponse }
}

test.each(['replacement', 'same-key', 'forget', 'disconnect'] as const)('%s during Activity restoration prevents a stale poll', async transition => {
  const f = await fixture(), tick = f.q.tick()
  await f.restoreEntered
  if (transition === 'disconnect') f.q.disconnect()
  else {
    f.q.setKey('')
    if (transition !== 'forget') f.q.setKey(transition === 'same-key' ? 'synthetic-old-key' : 'synthetic-new-key')
  }
  f.release()
  await tick
  expect(f.transport).toHaveBeenCalledTimes(1) // Only the original stubbed submission; no stale GET.
  expect(f.q.snapshot().paused).toBeNull()
  expect(f.record.state).toBe('running')
  expect(f.record.jobs[0].id).toBe('synthetic-paid-job')
})

test.each(['auth', 'network'] as const)('an already invoked restored poll with stale %s cannot pause replacement credentials', async failure => {
  const f = await fixture(true), tick = f.q.tick()
  await f.restoreEntered
  f.release()
  await f.pollEntered
  f.q.setKey('')
  f.q.setKey('synthetic-new-key')
  if (failure === 'auth') f.pollResponse.resolve(new Response('{"detail":"Invalid API key"}', { status: 401 }))
  else f.pollResponse.reject(new TypeError('synthetic offline failure'))
  await tick
  expect(f.transport).toHaveBeenCalledTimes(2)
  expect(f.q.snapshot().paused).toBeNull()
  expect(f.record.state).toBe('running')
  expect(f.record.jobs[0].id).toBe('synthetic-paid-job')
})

function missingInputRecord(): JobRec {
  return { id: 'retained-missing-input', label: 'Finding joints', method: 'POST', endpoint: '/estimate-skeleton',
    params: { image: { type: 'base64', $blob: 'missing-image-hash' } }, inputs: ['missing-image-hash'],
    minimumTier: 1, requestHash: 'synthetic-request-hash', state: 'queued', attempts: 0,
    requestStarted: false, nextAt: 0, createdAt: 1000, jobs: [], gens: 0, usd: 0 }
}

test('loading a Tier 1 queued request with a missing stored input fails locally before account lookup', async () => {
  const record = missingInputRecord(), saved = new Map<string, JobRec>()
  const transport = vi.fn(() => { throw new Error('No network is needed to detect a missing stored input') })
  vi.stubGlobal('fetch', transport)
  const q = new Queue({ locks: null, online: () => true, all: async () => [structuredClone(record)],
    getBlob: async () => undefined, put: async (id, rec) => { saved.set(id, structuredClone(rec)) } })
  await q.load()
  q.setKey('synthetic-key')
  await q.tick()
  expect(transport).not.toHaveBeenCalled()
  expect(q.snapshot().jobs[0].state).toBe('failed')
  expect(q.snapshot().jobs[0].error).toMatch(/missing|unavailable/i)
  expect(saved.get(record.id)?.state).toBe('failed')
})

test('cancellation while checking a missing stored input remains cancelled', async () => {
  const record = missingInputRecord(), entered = deferred<void>(), lookup = deferred<Blob | undefined>()
  const transport = vi.fn(() => { throw new Error('A cancelled request must not fetch') })
  vi.stubGlobal('fetch', transport)
  const q = new Queue({ locks: null, online: () => true, all: async () => [structuredClone(record)],
    getBlob: async () => { entered.resolve(); return lookup.promise }, put: async () => {} })
  await q.load()
  q.setKey('synthetic-key')
  const tick = q.tick()
  await entered.promise
  await q.cancel(record.id)
  lookup.resolve(undefined)
  await tick
  expect(transport).not.toHaveBeenCalled()
  expect(q.snapshot().jobs[0].state).toBe('cancelled')
})

test.each([false, true])('disconnect while checking stored inputs stops the suspended tick (input present: %s)', async present => {
  const record = missingInputRecord(), entered = deferred<void>(), lookup = deferred<Blob | undefined>()
  const transport = vi.fn(() => { throw new Error('A released queue must not fetch') })
  vi.stubGlobal('fetch', transport)
  const save = vi.fn(async () => {})
  const q = new Queue({ locks: null, online: () => true, all: async () => [structuredClone(record)],
    getBlob: async () => { entered.resolve(); return lookup.promise }, put: save })
  await q.load()
  q.setKey('synthetic-key')
  const tick = q.tick()
  await entered.promise
  q.disconnect()
  lookup.resolve(present ? new Blob(['stored image']) : undefined)
  await tick
  expect(transport).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  expect(q.snapshot().jobs[0].state).toBe('queued')
})
