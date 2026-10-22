import { afterEach, expect, test, vi } from 'vitest'
import { addMove } from '../../src/studio/create.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import * as projects from '../../src/lib/store/project.ts'
import { base64ToBytes, makeImg } from '../../src/lib/image/png.ts'
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { cellHash, type Keypoint, type Rig } from '../../src/lib/rig/rig.ts'
import { LABELS, hasAll } from '../../src/lib/rig/poses.ts'
import { clipQa } from '../../src/lib/rig/clips.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'

afterEach(() => vi.restoreAllMocks())
const points = (): Keypoint[] => LABELS.map((label, i) => ({ label, x: 0.35 + i * 0.01, y: 0.3 + i * 0.015 }))
function body(warning = false, marker = 0) {
  const im = makeImg(64, 64)
  for (let y = warning ? 0 : 10; y < 60; y++) for (let x = 25; x < 39; x++) im.data.set(warning ? [30, 50, 220, 255] : [180, 140, 120, 255], (y * 64 + x) * 4)
  if (marker) im.data.set([marker, 140, 120, 255], (10 * 64 + 25) * 4)
  return im
}
async function fixture(validAttempts: boolean[]) {
  const rest = body(), hash = await cellHash(rest), k = points()
  const rig: Rig = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseHash: hash, baseItem: 'base', directions: [{ id: 'south' }], rest: { south: { image: hash, keypoints: k } }, animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }], sources: { south: { route: 'skeleton-v3', reference: hash, keypoints: [k], measured: [k], provenance: [] } } }] }
  const manifest: Manifest = { format: 'pixeldoll/1', name: 'Fixture', app: '', rig, items: [{ id: 'base', name: 'Body', slot: 'body', mirror: 'generate', status: 'accepted', prompt: '', materials: [], provenance: [], baseHash: hash, layers: [{ id: 'main', role: 'fg', z: 0, cells: { idle: { south: [hash] } } }] }], materials: [], slots: [{ id: 'body', z: 0, class: 'rigid' }], presets: [] }
  let saved: projects.StoredProject = { id: 'rig-measured', savedAt: 'original', manifest, character: { id: 'managed', looks: 'body' } }
  const original = structuredClone(saved), blobs = new Map<string, Blob>(), requested = new Map<number, Keypoint[]>(); let raws = 0
  vi.spyOn(projects, 'loadProject').mockImplementation(async () => { const rec = structuredClone(saved); return { rec, project: { manifest: rec.manifest, images: new Map([[hash, rest]]) } } })
  vi.spyOn(db, 'get').mockImplementation(async () => structuredClone(saved))
  vi.spyOn(db, 'getBlob').mockImplementation(async (id) => blobs.get(id))
  const put = vi.spyOn(db, 'put').mockResolvedValue(undefined)
  const update = vi.spyOn(db, 'update').mockImplementation(async (_store, _id, change) => { saved = change(structuredClone(saved)) as projects.StoredProject })
  vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
    if (req.path === '/animate-with-skeleton-v3') {
      const attempt = raws++, keypoints = (req.body as { keypoints: Keypoint[][] }).keypoints
      const frames = await Promise.all(keypoints.map(async (kp, i) => {
        const marker = 100 + attempt * 10 + i, sha = `raw-${attempt}-${i}`
        requested.set(marker, kp)
        blobs.set(sha, new Blob([(await encodePngBytes(body(validAttempts[attempt], marker))) as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
        return { label: String(i), sha }
      }))
      return { id: `raw-${attempt}`, state: 'done', params: req.body, endpoint: req.path, requestHash: 'test', createdAt: 0, gens: 3, usd: 0, jobs: [{ id: 'job', results: frames }] } as unknown as JobRec
    }
    if (req.path === '/estimate-skeleton') {
      const image = await decodePngBytes(base64ToBytes((req.body as { image: { base64: string } }).image.base64))
      const marker = image.data[(10 * 64 + 25) * 4], attempt = Math.floor((marker - 100) / 10)
      return { state: 'done', response: { keypoints: validAttempts[attempt] ? requested.get(marker) : [] }, jobs: [] } as unknown as JobRec
    }
    throw new Error(`Unexpected route ${req.path}`)
  })
  return { run: () => addMove(saved.id, { id: 'idle', action: 'idle', seed: 7, frames: 4, items: [], replace: true }), original, saved: () => saved, raws: () => raws, put, update }
}

test('two incomplete measurement candidates cannot replace a saved body or publish any cell', async () => {
  const f = await fixture([false, false])
  await expect(f.run()).rejects.toThrow('idle south: joints could not be measured on frame 0')
  expect(f.raws()).toBe(2); expect(f.put).not.toHaveBeenCalled(); expect(f.update).not.toHaveBeenCalled(); expect(f.saved()).toEqual(f.original)
})

test.each([{ valid: [false, true] }, { valid: [true, false] }])('a complete art-warning candidate wins over missing measurements regardless of attempt order: %o', async ({ valid }) => {
  // Complete candidate intentionally has two real artwork flags; incomplete candidate has only the old measurement flag.
  const qa = clipQa({ anim: 'idle', rest: body(), frames: [body(true)], requested: [points()], measured: [points()], stray: 0 })
  expect(qa.fails).toHaveLength(2)
  const f = await fixture(valid)
  await expect(f.run()).resolves.toBeUndefined()
  expect(f.raws()).toBe(2); expect(f.update).toHaveBeenCalledOnce()
  const saved = f.saved(), source = saved.manifest.rig.animations[0].sources!.south!
  expect(source.measured).toHaveLength(4); expect(source.measured!.every(hasAll)).toBe(true)
  expect(Object.keys(saved.skeletons!)).toHaveLength(4)
  expect((saved.rigQa as { warnings: string[] }).warnings).toEqual(expect.arrayContaining([expect.stringContaining('palette fit'), expect.stringContaining('cell border')]))
})
