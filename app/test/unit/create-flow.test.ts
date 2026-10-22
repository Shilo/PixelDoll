import { afterEach, expect, test, vi } from 'vitest'
import { CLIP_ATTEMPTS, estimate, parallelGeneration, run } from '../../src/studio/create.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'

function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }
afterEach(() => vi.restoreAllMocks())

test('first failed direction prevents a submitted sibling from starting follow-up work or progress', async () => {
  const sent = deferred<void>(), siblingFinished = deferred<void>(), failure = new Error('synthetic lost estimate')
  const calls: string[] = []
  const pending = parallelGeneration([
    async (signal) => {
      try {
        calls.push('already submitted')
        await sent.promise // represents an already sent paid request: it is allowed to finish
        signal.throwIfAborted()
        calls.push('follow-up estimate or reroll')
        return 'late'
      } finally { siblingFinished.resolve() }
    },
    async () => { throw failure },
  ])
  await expect(pending).rejects.toBe(failure)
  sent.resolve(); await siblingFinished.promise
  expect(calls).toEqual(['already submitted'])
  // A deliberate new attempt owns an independent scope.
  await expect(parallelGeneration([async (signal) => { signal.throwIfAborted(); return 'new attempt' }])).resolves.toEqual(['new attempt'])
})

test('aborting one direction consumer leaves shared cancellation to the queue and ignores its late result', async () => {
  const record = { id: 'synthetic-record', state: 'queued' } as JobRec
  const finished = deferred<JobRec>(), scope = new AbortController(), failure = new Error('sibling failed')
  const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue(record)
  vi.spyOn(queue, 'settled').mockReturnValue(finished.promise)
  const cancel = vi.spyOn(queue, 'cancel').mockResolvedValue()
  const result = run({ method: 'POST', path: '/synthetic', body: { seed: 1 } }, 'test', 'test', false, true, scope.signal)
  await Promise.resolve(); await Promise.resolve()
  scope.abort(failure)
  expect(enqueue.mock.calls[0][1]?.signal).toBe(scope.signal)
  expect(cancel).not.toHaveBeenCalled()
  finished.resolve({ ...record, state: 'done' })
  await expect(result).rejects.toBe(failure)
})


test('creation estimate covers every configured clip attempt and rest-joint fallback', () => {
  for (const [directions, generated, baseline, ceiling] of [[4, 3, 35.25, 57.15], [8, 5, 57.25, 93.75]] as const) {
    const cost = estimate(directions)
    expect(cost.gens).toBe(baseline)
    expect(cost.maxGens).toBe(ceiling)
    expect(cost.maxGens - cost.gens).toBeCloseTo(generated * ((CLIP_ATTEMPTS - 1) * ((3 + 4 * 0.1) + (3 + 8 * 0.1)) + 0.1))
    expect(Math.ceil(cost.maxGens / 5) * 5).toBe(directions === 4 ? 60 : 95)
  }
})


test('explicit generation seed identifies safe automatic-unsent recovery attempts', async () => {
  const record = { id: 'synthetic-done', state: 'done' } as JobRec
  const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue(record)
  await parallelGeneration([async (signal) => run({ method: 'POST', path: '/synthetic' }, 'test', 'test', true, true, signal)], 456)
  expect(enqueue.mock.calls[0][1]?.attempt).toBe(456)
})
