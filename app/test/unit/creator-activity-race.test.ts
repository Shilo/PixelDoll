import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { get } from 'svelte/store'
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { apiActivity, clearActivity } from '../../src/lib/pixellab/activity.ts'

beforeEach(clearActivity)
afterEach(() => { vi.unstubAllGlobals(); clearActivity() })
const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

test('inspection between the durable submit marker and fetch never fabricates a failed request or duplicates the real POST', async () => {
  const records = new Map<string, JobRec>(), persistedMarker = deferred<void>(), releasePersistence = deferred<void>()
  const transportStarted = deferred<void>(), response = deferred<Response>()
  const fetchMock = vi.fn(async () => { transportStarted.resolve(); return response.promise })
  vi.stubGlobal('fetch', fetchMock)
  let markerHeld = false
  const queue = new Queue({
    put: async (id, record) => {
      records.set(id, structuredClone(record))
      if (!markerHeld && record.state === 'submitting' && record.requestStarted === true) {
        markerHeld = true; persistedMarker.resolve(); await releasePersistence.promise
      }
    },
    all: async () => [...records.values()].map(record => structuredClone(record)),
    get: async id => records.get(id),
    locks: null, online: () => true, now: () => 1000,
  })
  const body = { character_id: 'fixture-character', mode: 'skeleton-v3', template_animation_id: 'walking-8-frames', directions: ['east'], seed: 123 }
  const record = await queue.enqueue({ method: 'POST', path: '/characters/animations', body }, { activityScope: 'creator-race' })
  queue.setKey('offline-unit-test-credential')
  queue.setBalance({ credits: { type: 'usd', usd: 0 }, subscription: { type: 'generations', status: 'active', plan: 'Tier 3: fixture', generations: 1000, total: 1000 } }, queue.key)
  const ticking = queue.tick()
  try {
    await persistedMarker.promise
    expect(records.get(record.id)).toMatchObject({ state: 'submitting', attempts: 1, requestStarted: true })
    await queue.inspectActivity([record.id], 'creator-race')
    expect(get(apiActivity)).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()

    releasePersistence.resolve()
    await transportStarted.promise
    expect(get(apiActivity)).toMatchObject([{ method: 'POST', endpoint: '/characters/animations', queueId: record.id, state: 'pending', status: null, body }])
    await queue.inspectActivity([record.id], 'creator-race')
    expect(get(apiActivity)).toHaveLength(1)
    expect(get(apiActivity)[0].restored).toBeUndefined()

    response.resolve(Response.json({ usage: { type: 'generations', generations: 3 } }))
    await ticking
    await queue.inspectActivity([record.id], 'creator-race')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(get(apiActivity)).toMatchObject([{ method: 'POST', endpoint: '/characters/animations', queueId: record.id, state: 'completed', status: 200, cost: { generations: 3, usd: 0 } }])
    expect(get(apiActivity)[0].restored).toBeUndefined()
  } finally {
    releasePersistence.resolve()
    response.resolve(Response.json({ usage: { type: 'generations', generations: 3 } }))
    await ticking
  }
})

test('a genuinely interrupted submit still restores as unknown after reload, without sending it again', async () => {
  const record: JobRec = { id: 'interrupted-creator', label: 'Creator', method: 'POST', endpoint: '/characters/animations', params: { seed: 123 }, inputs: [], requestHash: 'fixture-hash', state: 'submitting', attempts: 1, requestStarted: true, nextAt: 0, createdAt: 1000, jobs: [], gens: 0, usd: 0 }
  const records = new Map([[record.id, record]]), fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const queue = new Queue({ all: async () => [...records.values()].map(value => structuredClone(value)), put: async (id, value) => { records.set(id, structuredClone(value)) }, locks: null, online: () => true })
  await queue.load()
  expect(records.get(record.id)?.state).toBe('lost')
  await queue.inspectActivity([record.id])
  expect(get(apiActivity)).toMatchObject([{ queueId: record.id, restored: true, status: null, state: 'failed', costSource: 'unknown' }])
  expect(fetchMock).not.toHaveBeenCalled()
})
