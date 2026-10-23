import { afterEach, expect, test, vi } from 'vitest'
import { Queue, queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { routes, type Req } from '../../src/lib/pixellab/routes.ts'
import { createCharacter, run, type CreateSpec } from '../../src/studio/create.ts'

afterEach(() => vi.restoreAllMocks())

async function interrupted(req: Req) {
  const records = new Map<string, JobRec>()
  const api = vi.fn(async () => ({}))
  const deps = {
    all: async () => [...records.values()].map(r => structuredClone(r)),
    put: async (id: string, r: JobRec) => { records.set(id, structuredClone(r)) },
    api: api as <T>() => Promise<T>, locks: null, online: () => true,
  }
  const original = new Queue(deps), posted = await original.enqueue(req)
  Object.assign(posted, { state: 'submitting', attempts: 1, requestStarted: true })
  await deps.put(posted.id, posted)
  const resumed = new Queue(deps)
  await resumed.load(); resumed.key = 'offline-test-only'
  expect(resumed.snapshot().jobs[0].state).toBe('lost')
  vi.spyOn(queue, 'enqueue').mockImplementation((request, meta) => resumed.enqueue(request, meta))
  vi.spyOn(queue, 'settled').mockImplementation(async id => {
    await resumed.tick()
    return resumed.snapshot().jobs.find(r => r.id === id)!
  })
  return { api, resumed, posted }
}

test('resuming the actual character pipeline never reposts an ambiguous initial generation', async () => {
  const spec: CreateSpec = { name: 'Resume', description: 'A calm human', size: 64, frame: 80, seed: 42, view: 'side', exactPrompt: true, directions: [{ id: 'east' }] }
  const req = routes.createCharacterV3({ description: spec.description, image_size: { width: 64, height: 64 }, view: 'side', template_id: 'mannequin', seed: 42, no_background: true })
  const h = await interrupted(req)
  await expect(createCharacter(spec)).rejects.toThrow(/lost.*without resending/)
  expect(h.api).not.toHaveBeenCalled()
  expect(h.resumed.snapshot().jobs.map(r => r.id)).toEqual([h.posted.id])
})

test.each(['/create-character-v3', '/characters/animations', '/animate-with-skeleton-v3'])('creator stage %s retains unknown submissions by default', async path => {
  const req: Req = { method: 'POST', path, body: { seed: 42 } }
  const h = await interrupted(req)
  await expect(run(req, 'Saved stage', 'studio-rig')).rejects.toThrow(/lost.*without resending/)
  expect(h.api).not.toHaveBeenCalled()
  expect(h.resumed.snapshot().jobs.map(r => r.id)).toEqual([h.posted.id])
})

test('a deliberately different seed remains a separate request', async () => {
  const req: Req = { method: 'POST', path: '/animate-with-skeleton-v3', body: { seed: 42 } }
  const h = await interrupted(req)
  await expect(run({ ...req, body: { seed: 42 + 7919 } }, 'Bounded quality reroll', 'studio-rig')).resolves.toMatchObject({ state: 'done' })
  expect(h.api).toHaveBeenCalledTimes(1)
  expect(h.resumed.snapshot().jobs).toHaveLength(2)
  expect(h.resumed.snapshot().jobs.find(r => r.id === h.posted.id)?.state).toBe('lost')
})

test('completed requests remain reusable without transport', async () => {
  const req: Req = { method: 'POST', path: '/create-character-v3', body: { seed: 42 } }
  const h = await interrupted(req)
  const saved = await h.resumed.enqueue(req, { resumeSafe: true })
  Object.assign(saved, { state: 'done', response: { character_id: 'saved-art' } })
  await expect(run(req, 'Cached base', 'studio-base')).resolves.toMatchObject({ id: h.posted.id, state: 'done' })
  expect(h.api).not.toHaveBeenCalled()
})

test('free character retrieval can explicitly retry a failed read', async () => {
  const req: Req = { method: 'GET', path: '/characters/saved-art' }
  const h = await interrupted(req)
  await expect(run(req, 'Read references', 'studio-base', true, false)).resolves.toMatchObject({ state: 'done' })
  expect(h.api).toHaveBeenCalledTimes(1)
})
