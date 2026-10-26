import { afterEach, expect, test, vi } from 'vitest'
import { baseMoveSpecs, createCharacter, estimate, moveEstimate, type CreateSpec } from '../../src/studio/create.ts'
import { movePlan } from '../../src/studio/apiPlans.ts'
import { coverage } from '../../src/studio/itemRoute.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { DIRECTIONS, cellKeys, validateRig, type DirectionName, type Keypoint, type Sha256 } from '../../src/lib/rig/rig.ts'
import { rigReady } from '../../src/lib/rig/setup.ts'
import { planItem } from '../../src/lib/items/items.ts'
import type { RigCtx } from '../../src/lib/items/run.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { buildPresentation, resolveLive, resolvePreview } from '../../src/studio/experience/presentation.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'
import type { Project } from '../../src/lib/store/manifest.ts'

afterEach(() => vi.restoreAllMocks())
const points = (i: number): Keypoint[] => LABELS.map((label, k) => ({ label, x: 0.3 + k * 0.01 + i * 0.001, y: 0.3 + k * 0.02 }))

/** Runs createCharacter offline: draw, re-import and standing joints answer from memory; anything else is a test failure. */
async function create(spec: CreateSpec) {
  const view = (i: number) => { const im = makeImg(spec.size, spec.size); for (let y = 8; y < spec.size - 4; y++) for (let x = 18; x < 28; x++) im.data.set([60 + i * 20, 90, 120, 255], (y * spec.size + x) * 4); return im }
  const pngs = new Map(await Promise.all(DIRECTIONS.map(async (d, i) => [d, new Blob([(await encodePngBytes(view(i))) as Uint8Array<ArrayBuffer>], { type: 'image/png' })] as const)))
  const refs = Object.fromEntries(DIRECTIONS.map((d, i) => [d, { keypoints: Object.fromEntries(points(i).map(({ label, x, y }) => [label, { x, y }])) }]))
  vi.spyOn(db, 'get').mockResolvedValue(undefined)
  vi.spyOn(db, 'getBlob').mockImplementation(async (sha) => pngs.get(sha as DirectionName))
  vi.spyOn(db, 'askPersist').mockImplementation(() => {})
  let saved!: { rec: StoredProject; blobs: Map<string, Blob> }
  vi.spyOn(db, 'putCharacter').mockImplementation(async (_id, rec, blobs) => { saved = { rec: rec as StoredProject, blobs } })
  const done = (req: { path: string; body?: unknown }, extra: object) => ({ state: 'done', endpoint: req.path, params: req.body, requestHash: req.path, createdAt: 0, gens: 0, usd: 0, jobs: [], ...extra }) as unknown as JobRec
  const enqueue = vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
    if (req.path === '/create-character-v3' && !(req.body as { reference_image?: unknown }).reference_image)
      return done(req, { jobs: [{ results: DIRECTIONS.map((label) => ({ label, sha: label })) }] })
    if (req.path === '/create-character-v3') return done(req, { response: { character_id: 'managed' } })
    if (req.path === '/characters/managed') return done(req, { response: { skeletons: { '2d_references': refs } } })
    throw new Error(`Creation must not send ${req.path}`)
  })
  const views: { id: DirectionName; img: Img }[][] = []
  await createCharacter(spec, () => {}, (v) => views.push(v))
  const images = new Map<string, Img>(await Promise.all([...saved.blobs].map(async ([h, b]) => [`sha256:${h}`, await decodePngBytes(new Uint8Array(await b.arrayBuffer()))] as [string, Img])))
  const project: Project = { manifest: saved.rec.manifest, images }
  return { rec: saved.rec, project, views, paths: enqueue.mock.calls.map(([req]) => req.path) }
}

test('creation publishes a Default-only rig that items, moves, exports and live modes accept', async () => {
  const { rec, project, views, paths } = await create({ name: 'Default', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-default-first' })
  // two v3 creates and one free skeleton read: no animation, motion or estimate calls
  expect(paths).toEqual(['/create-character-v3', '/create-character-v3', '/characters/managed'])
  const rig = rec.manifest.rig, base = rec.manifest.items[0].layers[0]
  expect(rig.directions).toEqual([{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west', mirrorOf: 'east' }])
  expect(views).toHaveLength(1)
  expect(views[0].map((v) => v.id)).toEqual(rig.directions.map((d) => d.id))
  expect(rig.animations.map(({ sources: _, ...a }) => a)).toEqual([{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }])
  for (const d of ['south', 'east', 'north'] as const) {
    expect(rig.animations[0].sources![d]).toMatchObject({ motion: 'imported-rest', reference: rig.rest![d]!.image, keypoints: [rig.rest![d]!.keypoints] })
    expect(base.cells!.default![d]).toEqual([rig.rest![d]!.image]) // the cell is the standing view itself, so dressed views fit it
  }
  expect(rig.pivot).toEqual({ x: expect.any(Number), y: expect.any(Number) })
  expect(validateRig(rig, Object.fromEntries(cellKeys(rig).map((k) => { const [a, d, i] = k.split('/'); return [k, base.cells![a][d as DirectionName]![+i]!] })) as Record<string, Sha256>)).toEqual([])
  expect(Object.keys(rec.skeletons!).sort()).toEqual(cellKeys(rig).sort())
  expect(rigReady(rec)).toBe(true)
  // an item is dressed only: Default reuses the dressed standing view, nothing to pose yet
  const plan = planItem(rig, { ...coverage({ rec } as RigCtx), method: 'skel', key: 'green', slot: 'back' })
  expect(plan.map((c) => c.kind)).toEqual(['dress'])
  // live modes and Preview show the Default move while idle and walk are missing
  const a = buildPresentation(project)
  expect(resolveLive(a, { velocity: { x: 0, y: 0 } })).toMatchObject({ kind: 'animation', clip: 'default', direction: 'south' })
  expect(resolveLive(a, { velocity: { x: 1, y: 0 } })).toMatchObject({ kind: 'animation', clip: 'default', direction: 'east' })
  expect(resolvePreview(a, { clip: 'default', direction: 'west' })).toMatchObject({ kind: 'animation', clip: 'default', issue: null })
  // every exporter accepts a one-frame move
  const exported = await exportFiles(project, { engines: ['generic', 'godot', 'phaser', 'unity', 'aseprite', 'gdevelop'], baked: true })
  expect(exported.errors).toEqual([])
  expect(exported.entries.some((e) => e.name.includes('default'))).toBe(true)
})

test('"Add idle + walk" restores what creation used to make, at the old price', async () => {
  const { rec } = await create({ name: 'Default', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-default-moves' })
  const specs = baseMoveSpecs(rec.manifest, 7)
  expect(specs).toEqual([{ id: 'idle', action: 'idle', frames: 4, items: [], sharedItems: [], seed: 7 }, { id: 'walk', action: 'walk', frames: 8, items: [], sharedItems: [], seed: 7 }])
  // Creation + idle + walk = the pre-Default-first creation estimate (35.25 gens for Top-down 4).
  expect(estimate(4).gens + specs.reduce((n, s) => n + moveEstimate(rec.manifest, s).gens, 0)).toBeCloseTo(35.25)
  const calls = specs.flatMap((s) => movePlan(rec, s))
  expect(calls.filter((c) => c.path === '/animate-with-skeleton-v3')).toHaveLength(3 * 2)
  expect(calls.filter((c) => c.path === '/characters/animations')).toHaveLength(3)
  expect(calls.filter((c) => c.path === '/estimate-skeleton')).toHaveLength(3 * (4 + 8 + 8))
  // the same request shapes creation sent: no unarmed suffix (poseStyle), raw seed + 101
  expect(calls.filter((c) => c.path === '/animate-with-skeleton-v3').map((c) => (c.body as { action: string; seed: number }))).toEqual([...Array(3).fill({ action: 'breathing idle' }), ...Array(3).fill({ action: 'walking' })].map((b) => expect.objectContaining({ ...b, seed: 108 })))
  // existing moves are not offered again
  rec.manifest.rig.animations.push({ id: 'idle', cells: 4, loop: true, frames: [] })
  expect(baseMoveSpecs(rec.manifest).map((s) => s.id)).toEqual(['walk'])
})
