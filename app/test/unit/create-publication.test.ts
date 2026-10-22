import { afterEach, expect, test, vi } from 'vitest'
import { createCharacter, publishCreatedCharacter, type CreateSpec } from '../../src/studio/create.ts'
import * as db from '../../src/lib/store/db.ts'
import { queue } from '../../src/lib/pixellab/queue.ts'
import { sha256, stableStringify } from '../../src/lib/image/hash.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'

afterEach(() => vi.restoreAllMocks())
const spec: CreateSpec = { description: 'tan bald body', name: 'Original', seed: 741257, size: 48, dirs: 4, directionPolicy: 'independent', projectId: 'rig-attempt-unique' }
const fingerprint = (value: CreateSpec) => sha256(stableStringify({ ...value, projectId: undefined }))
function project(id: string, creationSpec: string): StoredProject {
  return { id, creationSpec, savedAt: 'original', origin: 'studio', manifest: { name: 'Customized later', rig: { baseHash: 'sha256:changed-by-new-move', animations: [{ id: 'slash' }] }, items: [{ id: 'base' }, { id: 'favorite-sword' }], presets: [{ id: 'outfit', items: { body: 'base', main_hand: 'favorite-sword' } }] } } as unknown as StoredProject
}

test('interrupted completion resumes its published project before any paid work, preserving later user edits', async () => {
  const saved = project(spec.projectId!, await fingerprint(spec)), before = structuredClone(saved)
  vi.spyOn(db, 'get').mockResolvedValue(saved)
  const enqueue = vi.spyOn(queue, 'enqueue')
  const put = vi.spyOn(db, 'putCharacter')
  await expect(createCharacter(spec)).resolves.toBe(saved.id)
  expect(saved).toEqual(before)
  expect(enqueue).not.toHaveBeenCalled()
  expect(put).not.toHaveBeenCalled()
})

test.each([{ seed: 741258 }, { name: 'Different' }, { directionPolicy: 'mirrored' as const }, { description: 'a different body' }])('a reused published identity with different intent rejects before enqueue: %o', async (change) => {
  const saved = project(spec.projectId!, await fingerprint(spec)), before = structuredClone(saved)
  vi.spyOn(db, 'get').mockResolvedValue(saved)
  const enqueue = vi.spyOn(queue, 'enqueue')
  await expect(createCharacter({ ...spec, ...change })).rejects.toThrow('another saved character')
  expect(saved).toEqual(before)
  expect(enqueue).not.toHaveBeenCalled()
})

test('new attempt publication never replaces a customized character with the same body hash', async () => {
  const old = project('rig-same-body-hash-prefix', 'old-attempt'), next = project(spec.projectId!, await fingerprint(spec))
  const records = new Map([[old.id, structuredClone(old)]])
  const put = vi.spyOn(db, 'putCharacter').mockImplementation(async (id, rec) => {
    if (records.has(id)) throw new Error('ConstraintError')
    records.set(id, structuredClone(rec as StoredProject))
  })
  await expect(publishCreatedCharacter(next, new Map())).resolves.toBe(next.id)
  expect(records.size).toBe(2)
  expect(records.get(old.id)).toEqual(old)
  expect(put.mock.calls[0][0]).toBe(spec.projectId)
})

test('concurrent same-attempt completion keeps the published winner and customized state byte-for-byte', async () => {
  const marker = await fingerprint(spec), first = project(spec.projectId!, marker), second = structuredClone(first)
  first.manifest.name = 'First completion'
  second.manifest.name = 'Delayed completion'
  const records = new Map<string, StoredProject>()
  let entered = 0, release!: () => void, both!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const ready = new Promise<void>((resolve) => { both = resolve })
  vi.spyOn(db, 'get').mockImplementation(async (_store, id) => records.get(id))
  vi.spyOn(db, 'putCharacter').mockImplementation(async (id, rec) => {
    if (++entered === 2) both()
    await gate
    // An IndexedDB objectStore.add atomically inserts or rejects; the losing transaction never puts over the winner.
    if (records.has(id)) throw new Error('ConstraintError')
    const customized = structuredClone(rec as StoredProject)
    customized.manifest.items.push({ id: 'accepted-during-completion' } as StoredProject['manifest']['items'][number])
    records.set(id, customized)
  })
  const results = [publishCreatedCharacter(first, new Map()), publishCreatedCharacter(second, new Map())]
  await ready; release()
  await expect(Promise.all(results)).resolves.toEqual([spec.projectId, spec.projectId])
  expect(records.size).toBe(1)
  expect(records.get(spec.projectId!)!.manifest.name).toBe('First completion')
  expect(records.get(spec.projectId!)!.manifest.items.at(-1)?.id).toBe('accepted-during-completion')
})

test('storage failure cannot report a character saved and image publication stays in the insert transaction', async () => {
  const error = new Error('QuotaExceededError'), next = project(spec.projectId!, await fingerprint(spec))
  vi.spyOn(db, 'get').mockResolvedValue(undefined)
  const put = vi.spyOn(db, 'putCharacter').mockRejectedValue(error)
  const loosePut = vi.spyOn(db, 'put')
  const image = makeImg(64, 64); image.data.set([100, 120, 90, 255], 0)
  const hash = await cellHash(image)
  await expect(publishCreatedCharacter(next, new Map([[hash, image]]))).rejects.toBe(error)
  expect(put).toHaveBeenCalledOnce()
  expect(put.mock.calls[0][2].get(hash.slice(7))).toBeInstanceOf(Blob)
  expect(loosePut).not.toHaveBeenCalled()
})
