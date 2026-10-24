import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { StoredProject } from '../../src/lib/store/project.ts'
import type { Keypoint } from '../../src/lib/rig/rig.ts'
import type { Req } from '../../src/lib/pixellab/routes.ts'

const state = vi.hoisted(() => ({
  projects: new Map<string, StoredProject>(), blobs: new Map<string, Blob>(), requests: [] as Req[],
  estimate: [] as Keypoint[], output: '', empty: '', first: 'valid', rawCount: 0,
}))
vi.mock('../../src/lib/store/db.ts', () => ({
  get: async (_store: string, id: string) => structuredClone(state.projects.get(id)),
  getBlob: async (id: string) => state.blobs.get(id),
  put: async (store: string, id: string, value: unknown) => {
    if (store === 'blobs') state.blobs.set(id, value as Blob)
    else state.projects.set(id, structuredClone(value as StoredProject))
  },
  update: async (_store: string, id: string, update: (record: StoredProject | undefined) => StoredProject) => {
    state.projects.set(id, structuredClone(update(structuredClone(state.projects.get(id)))))
  },
  updateCharacter: async (id: string, images: Map<string, Blob>, update: (record: StoredProject | undefined) => StoredProject) => {
    const next = update(structuredClone(state.projects.get(id)))
    for (const [hash, image] of images) state.blobs.set(hash, image)
    state.projects.set(id, structuredClone(next))
  },
}))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
  live: () => false,
  queue: {
    subscribe: (fn: (snapshot: { jobs: unknown[] }) => void) => { fn({ jobs: [] }); return () => {} },
    enqueue: async (request: Req) => {
      state.requests.push(structuredClone(request))
      const raw = request.path === '/animate-with-skeleton-v3'
      if (raw) state.rawCount++
      const count = raw && state.rawCount === 1 && state.first === 'wrong-count' ? 3 : 4
      const sha = raw && state.rawCount === 1 && state.first === 'empty' ? state.empty : state.output
      return {
        id: `offline-${state.requests.length}`, state: 'done', endpoint: request.path, params: request.body,
        requestHash: 'a'.repeat(64), createdAt: 0, gens: 0, usd: 0,
        response: request.path === '/estimate-skeleton' ? { keypoints: state.estimate } : {},
        jobs: raw ? [{ results: Array.from({ length: count }, (_, i) => ({ label: `${i}`, sha })) }] : [],
      }
    },
  },
}))

import { addMove } from '../../src/studio/create.ts'
import { equipmentFixture, bodyOnly } from './equipment-fixture.ts'
import { decodePng, makeImg, type Img } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'

const points = (x = 0.5): Keypoint[] => LABELS.map(label => ({ label, x, y: 0.5 }))
const image = (shift = 0, purple = false, hands = false) => {
  const im = makeImg(64, 64), color = purple ? [140, 20, 220, 255] : [180, 120, 90, 255]
  for (let y = 12 + shift; y < 55 + shift; y++) for (let x = 25; x < 35; x++) im.data.set(color, (y * 64 + x) * 4)
  if (hands) for (const x0 of [17, 39]) for (let y = 28; y < 32; y++) for (let x = x0; x < x0 + 4; x++) im.data.set(color, (y * 64 + x) * 4)
  return im
}
async function store(im: Img) {
  const hash = await cellHash(im)
  state.blobs.set(hash.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
  return hash
}
beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in quality-policy tests') }))
  state.projects.clear(); state.blobs.clear(); state.requests = []; state.estimate = points(); state.first = 'valid'; state.rawCount = 0
  const p = bodyOnly(await equipmentFixture()), m = p.manifest, hash = await store(image())
  state.output = hash.slice(7); state.empty = (await store(makeImg(64, 64))).slice(7)
  m.items[0].layers[0].cells = { rest: { south: [hash] } }
  m.rig.rest = { south: { image: hash, keypoints: points() } }
  m.rig.animations[0].sources = { south: { route: 'import', reference: hash, keypoints: [points()], provenance: [] } }
  state.projects.set('rig-quality', { id: 'rig-quality', savedAt: '', manifest: m, character: { id: 'saved-server-id', looks: 'A stylized humanoid' } })
})
afterEach(() => {
  try { expect(fetch).not.toHaveBeenCalled() } finally { vi.unstubAllGlobals() }
})
const add = () => addMove('rig-quality', { id: 'jump', action: 'idle', frames: 4, items: [], seed: 7 })

test('actual Add move keeps detached parts and observation differences without another paid drawing', async () => {
  const art = image(-3, true, true)
  state.output = (await store(art)).slice(7); state.estimate = points(0.65)
  const outcome = await add()
  expect.soft(outcome.warnings.join(' ')).toMatch(/estimated arm-joint difference/)
  expect.soft(outcome.warnings.join(' ')).toMatch(/disconnected pixels retained/)
  expect.soft(state.rawCount).toBe(1)
  const rec = state.projects.get('rig-quality')!
  const hash = rec.manifest.items[0].layers[0].cells!.jump!.south![0]!
  const saved = await decodePng(state.blobs.get(hash.slice(7))!)
  expect.soft(saved.data.every((value, index) => value === art.data[index])).toBe(true)
  const qa = (rec.rigQa as { clips: Record<string, { fails: string[]; warnings?: string[]; adherence: number | null; feetDrift: number; paletteFit: number }> }).clips['jump/south']
  expect.soft(qa.fails).toEqual([])
  expect.soft(qa.warnings?.length ?? 0).toBeGreaterThan(0)
  expect(qa.adherence).toBeGreaterThan(2)
  expect(qa.feetDrift).toBe(3)
  expect(qa.paletteFit).toBe(0)
  // Resuming a completed move surfaces the current clip notes, without drawing or replaying stale flattened notes.
  rec.rigQa = { ...(rec.rigQa as object), warnings: ['rest/north: stale historical warning'] }
  state.projects.set(rec.id, rec)
  const resumed = await add()
  expect(resumed.warnings).toEqual(outcome.warnings)
  expect(state.rawCount).toBe(1)
})

test.each(['wrong-count', 'empty'])('actual Add move retains one bounded retry for structurally invalid %s art', async first => {
  state.first = first
  await add()
  expect(state.rawCount).toBe(2)
  expect(state.requests.filter(r => r.path === '/estimate-skeleton')).toHaveLength(4)
  expect(state.projects.get('rig-quality')!.manifest.rig.animations.some(a => a.id === 'jump')).toBe(true)
})

test('actual Add move stops on invalid observation without redrawing or saving an incomplete rig', async () => {
  state.estimate = []
  await expect(add()).rejects.toThrow(/valid joints were not found/)
  expect(state.rawCount).toBe(1)
  expect(state.projects.get('rig-quality')!.manifest.rig.animations.some(a => a.id === 'jump')).toBe(false)
})
