import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import { attachImportedRig, rigReady, setupPlan } from '../../src/lib/rig/setup.ts'
import { LABELS, ACTIONS, authoredPoses, fromApi, hasAll } from '../../src/lib/rig/poses.ts'
import { cellHash, type Keypoint } from '../../src/lib/rig/rig.ts'
import { flipSkeleton } from '../../src/lib/rig/skeleton.ts'
import { paddedPoses, poseBatches, rawClip } from '../../src/lib/rig/clips.ts'
import { itemRoute, padOf, planItem } from '../../src/lib/items/items.ts'
import { baseCell, defaultMethod } from '../../src/lib/items/run.ts'
import { coverage } from '../../src/studio/itemRoute.ts'
import { Queue, type JobRec } from '../../src/lib/pixellab/queue.ts'

const pose = (dx = 0): Keypoint[] => LABELS.map((label, i) => ({ label, x: (25 + dx + i % 4) / 64, y: (12 + Math.floor(i / 4) * 8) / 64 }))
async function source() {
  const im = makeImg(64, 64)
  for (let y = 10; y < 60; y++) for (let x = 25; x < 38; x++) im.data.set([180, 100, 90, 255], (y * 64 + x) * 4)
  const png = await encodePngBytes(im)
  return (await readCharacterZip(await zip([
    { name: 'metadata.json', data: new TextEncoder().encode(JSON.stringify({ name: 'Red-haired hero', prompt: 'red hair, blue coat and boots', view: 'side' })) },
    ...['south', 'east', 'north', 'west'].map((dir) => ({ name: `rotations/${dir}.png`, data: png })),
    ...Array.from({ length: 16 }, (_, i) => ({ name: `animations/walk/south/frame_${i}.png`, data: png })),
    ...Array.from({ length: 2 }, (_, i) => ({ name: `animations/blink/south/frame_${i}.png`, data: png })),
  ]))).project
}

test('setup attaches measured poses, anchors, independent QA and provenance without repainting pixels', async () => {
  const project = await source(), original = structuredClone(project.manifest)
  const plan = await setupPlan(project)
  expect(plan.frames.size).toBe(1) // identical images reuse a cached estimate
  expect(plan.gens).toBe(0.35)
  const measurements = new Map([...plan.frames].map(([h]) => [h, pose()]))
  const result = await attachImportedRig(project, plan, measurements, [])
  expect(project.manifest).toEqual(original)
  expect(result.manifest.rig.baseHash).toBe(original.rig.baseHash)
  expect(result.manifest.items[0].layers).toEqual(original.items[0].layers)
  expect(result.manifest.rig.view).toBe('side')
  expect(result.manifest.rig.directions.every((d) => !d.mirrorOf)).toBe(true)
  expect(result.manifest.rig.rest?.west?.keypoints).toEqual(pose())
  const qa = result.rigQa as { clips: Record<string, { adherence: number | null }> }
  expect(qa.clips['walk/south'].adherence).toBeNull() // never self-score an estimated original as perfectly followed
  expect(result.skeletons['walk/south/15']).toBeDefined()
  expect(result.manifest.rig.anchors?.neck?.walk?.south).toHaveLength(16)
  expect(result.manifest.rig.anchors?.neck?.walk?.west).toBeUndefined() // preserve sparse coverage
  const rec = { id: 'rig-fixture', savedAt: '', manifest: result.manifest, character: { id: 'managed-fixture', looks: 'red hair, blue coat and boots' } }
  expect(rigReady(rec)).toBe(true)
  const ctx = { rec, project: { manifest: result.manifest, images: result.images } }, selected = coverage(ctx)
  expect(defaultMethod(ctx, selected)).toBe('skel')
  expect(padOf('main_hand', defaultMethod(ctx, selected))).toBe(16)
  const calls = planItem(result.manifest.rig, { ...selected, method: 'skel', slot: 'main_hand', key: 'green' })
  expect(calls.filter((c) => c.kind === 'pose').every((c) => c.cells.length <= 15)).toBe(true)
  expect(calls.filter((c) => c.kind === 'pose').flatMap((c) => c.cells)).toHaveLength(18)
  expect(calls.some((c) => c.kind === 'pose' && c.cells.some((k) => k.startsWith('rest/')))).toBe(false)
  expect(baseCell(ctx, 'walk/south/15')).toEqual(project.images.get(await cellHash([...plan.frames.values()][0])))
})

test('setup refuses missing or invalid measurements and rejects unsupported input before spending', async () => {
  const p = await source(), plan = await setupPlan(p)
  await expect(attachImportedRig(p, plan, new Map(), [])).rejects.toThrow('valid joints')
  const bad = pose(); bad[0].x = NaN
  expect(hasAll(bad)).toBe(false)
  p.manifest.rig.template = 'cat'
  await expect(setupPlan(p)).rejects.toThrow('humanoid')
  p.manifest.rig.template = 'mannequin'; p.manifest.rig.directions.pop()
  await expect(setupPlan(p)).rejects.toThrow('cardinal views')
})

test('skeleton batches cover every original frame once and obey PixelLab limits', () => {
  for (const n of [1, 2, 3, 15, 16, 29, 31, 120]) {
    const batches = poseBatches(n)
    expect(batches.flatMap((b) => Array.from({ length: b.count }, (_, i) => b.start + i))).toEqual(Array.from({ length: n }, (_, i) => i))
    for (const b of batches) expect(paddedPoses(Array.from({ length: b.count }, () => pose())).length).toBeGreaterThanOrEqual(3)
    expect(batches.every((b) => b.count <= 15)).toBe(true)
  }
  const request = itemRoute.pose({ keyframePngB64: 'fixture', rest: pose(), poses: [pose(), pose(1)], item: 'sword', slot: 'main_hand', key: 'green', anim: 'blink', dir: 'west', seed: 1, cell: { w: 64, h: 64 }, pad: 16, view: 'side' }).body as { view: string; keypoints: Keypoint[][] }
  expect(request.view).toBe('side')
  expect(request.keypoints).toHaveLength(3)
  expect((rawClip({ first: 'fixture', rest: pose(), keypoints: [pose(), pose(), pose()], description: 'existing coat', action: 'idle', dir: 'west', seed: 1, view: 'high top-down' }).body as { view: string }).view).toBe('high top-down')
})

test('independent western authored moves use reflected math on their own rest skeleton', () => {
  const west = fromApi(pose(3), { w: 64, h: 64 })
  const expected = ACTIONS.slash(flipSkeleton(west, 64), 'east').map((p) => flipSkeleton(p, 64))
  expect(authoredPoses('slash', west, 'west')).toEqual(expected)
  expect(authoredPoses('slash', west, 'west')).not.toEqual(ACTIONS.slash(west, 'south'))
})

test('repair keeps saved reference pixels and declares them fixed for compatible equipment', async () => {
  const p = await source(), plan = await setupPlan(p)
  const changed = structuredClone(plan.rest.south!)
  changed.data[1000] = 99
  const h = await cellHash(changed)
  p.images.set(h, changed)
  p.manifest.rig.rest = Object.fromEntries(p.manifest.rig.directions.map((d) => [d.id, { image: h, keypoints: pose() }]))
  const repair = await setupPlan(p, 'blink')
  expect(repair.fixedRest).toBe(true)
  expect(repair.rest.south).toEqual(changed)
})

test('reload-safe setup never replaces a lost or failed paid request', async () => {
  const records = new Map<string, JobRec>()
  let sent = 0
  const deps = { put: async (id: string, r: JobRec) => { records.set(id, structuredClone(r)) }, all: async () => [...records.values()].map((r) => structuredClone(r)), api: async <T>() => { sent++; return {} as T } }
  for (const state of ['lost', 'failed', 'cancelled'] as const) {
    const q = new Queue(deps), req = { method: 'POST' as const, path: '/estimate-skeleton', body: { fixture: state } }
    const prior = await q.enqueue(req)
    prior.state = state; await deps.put(prior.id, prior)
    const reload = new Queue(deps); await reload.load(); reload.key = 'test-only'
    expect((await reload.enqueue(req, { cache: true, resumeSafe: true })).id).toBe(prior.id)
    await reload.tick()
    expect(sent).toBe(0)
  }
})
