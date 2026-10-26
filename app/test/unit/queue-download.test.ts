import { expect, test } from 'vitest'
import { Queue, type Deps, type JobRec } from '../../src/lib/pixellab/queue.ts'

// A paid job that completes with a storage URL; the free GET /balance probe always answers.
function fixture(deps: Partial<Deps>) {
  const store = new Map<string, JobRec>()
  let t = 1000, probes = 0
  const q = new Queue({
    now: () => t, online: () => true, locks: null,
    put: async (k, r) => void store.set(k, structuredClone(r)), get: async (k) => structuredClone(store.get(k)), del: async (k) => void store.delete(k),
    all: async () => [...store.values()].map((r) => structuredClone(r)), putBlob: async () => 'x', getBlob: async () => undefined, fetchBytes: async () => new Uint8Array(),
    api: async <T>(_k: string, method: string, path: string): Promise<T> => {
      if (path === '/balance') { probes++; return {} as T }
      if (method === 'POST') return { background_job_id: 'j' } as T
      return { id: 'j', status: 'completed', created_at: '', last_response: { storage_urls: { east: 'https://x/e.png' } } } as T
    },
    ...deps,
  })
  q.key = 'k'
  const run = async (n: number) => { for (let i = 0; i < n; i++) { t += 1000; await q.tick() } }
  return { q, store, run, probes: () => probes }
}

test('a storage download that keeps throwing TypeError while online gives up instead of pausing forever', async () => {
  let fetches = 0
  const { q, store, run, probes } = fixture({ fetchBytes: async () => { fetches++; throw new TypeError('Failed to fetch') } })
  const r = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } })
  await run(900) // 15 minutes of 1 s ticks: probes and backoff between tries
  expect(store.get(r.id)?.state).toBe('failed')
  expect(store.get(r.id)?.error).toMatch(/Download manually: https:\/\/x\/e\.png/)
  expect(fetches).toBe(10)
  expect(probes()).toBeGreaterThan(0) // each TypeError still paused the queue until a probe got through
})

test('a download that fails while the browser is offline does not count as a try', async () => {
  let online = true, fetches = 0
  const { q, store, run } = fixture({ online: () => online, fetchBytes: async () => { fetches++; online = false; throw new TypeError('Failed to fetch') } })
  const r = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } })
  await run(5)
  expect(fetches).toBe(1)
  expect(q.paused).toBe('offline')
  expect(store.get(r.id)?.jobs[0].tries).toBeUndefined()
  expect(store.get(r.id)?.state).toBe('running')
})

test('Clear finished reports a failed delete and keeps the record listed', async () => {
  const { q, store } = fixture({ del: async () => { throw new Error('storage blocked') } })
  const r = await q.enqueue({ method: 'POST', path: '/x', body: { seed: 1 } })
  await q.cancel(r.id)
  await expect(q.clearFinished(() => false)).rejects.toThrow('storage blocked')
  expect(q.snapshot().jobs.map((j) => j.id)).toEqual([r.id])
  expect(store.has(r.id)).toBe(true)
})
