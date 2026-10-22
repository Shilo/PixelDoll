import { expect, test } from 'vitest'
import { Queue } from '../../src/lib/pixellab/queue.ts'

test.each([NaN, Infinity, -Infinity])('nonfinite capacity %s preserves the valid paid scheduler limit', async (invalid) => {
  let posts = 0
  const q = new Queue({ locks: null, online: () => true, now: () => 1000,
    put: async () => {}, all: async () => [],
    api: async <T>(_key: string, method: string) => {
      if (method === 'POST') return { background_job_id: `synthetic-job-${++posts}` } as T
      return { status: 'processing' } as T
    },
  })
  q.setKey('synthetic-only')
  q.setConcurrency(2)
  q.setConcurrency(invalid)
  for (let seed = 0; seed < 8; seed++) await q.enqueue({ method: 'POST', path: '/synthetic-capacity-test', body: { seed } })
  await q.tick(); await q.tick(); await q.tick()
  expect(q.snapshot()).toMatchObject({ concurrency: 2, current: 2, counts: { running: 2, pending: 6 } })
  expect(posts).toBe(2)
})
