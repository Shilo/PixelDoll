import { afterEach, expect, test, vi } from 'vitest'
import { api } from '../../src/lib/pixellab/client.ts'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

for (const [method, path, timeout] of [
  ['POST', '/estimate-skeleton', 600_000],
  ['POST', '/create-character-v3', 120_000],
  ['POST', '/animate-with-skeleton-v3', 120_000],
  ['GET', '/balance', 120_000],
  ['GET', '/background-jobs/synthetic', 120_000],
] as const) test(`${method} ${path} selects its bounded HTTP timeout without retries`, async () => {
  const signal = new AbortController().signal
  const timer = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  await api('synthetic-test-key', method, path)
  expect(timer).toHaveBeenCalledExactlyOnceWith(timeout)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1].signal).toBe(signal)
})
