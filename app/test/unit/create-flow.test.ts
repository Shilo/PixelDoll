import { afterEach, expect, test, vi } from 'vitest'
import { estimate, parallelGeneration, run } from '../../src/studio/create.ts'
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


test('creation estimate covers the draw, the re-import and the rest-joint fallback, and no animation', () => {
  for (const [directions, generated] of [[4, 3], [8, 5]] as const) {
    const cost = estimate(directions)
    expect(cost.gens).toBe(2.25) // draw 1 + ceil(48² × 8 / 65536), re-import 0.25
    expect(cost.maxGens).toBeCloseTo(cost.gens + generated * 0.1) // one standing-joint estimate per generated direction
  }
})


test('explicit generation seed identifies safe automatic-unsent recovery attempts', async () => {
  const record = { id: 'synthetic-done', state: 'done' } as JobRec
  const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue(record)
  await parallelGeneration([async (signal) => run({ method: 'POST', path: '/synthetic' }, 'test', 'test', true, true, signal)], 456)
  expect(enqueue.mock.calls[0][1]?.attempt).toBe(456)
})
