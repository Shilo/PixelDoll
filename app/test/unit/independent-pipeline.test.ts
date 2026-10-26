import { afterEach, expect, test, vi } from 'vitest'
import { assertCreatedDirections, createCharacter, creationDirections, estimate, genDirsOf, prepareRestViews } from '../../src/studio/create.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import { DIRECTIONS, type DirectionName, type Rig } from '../../src/lib/rig/rig.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { buildRig } from '../../src/lib/rig/freeze.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { normalize } from '../../src/lib/rig/normalize.ts'
import { authoredPoses, fromApi, hasAll, LABELS, toApi } from '../../src/lib/rig/poses.ts'
import { buildItem, planGens, planItem } from '../../src/lib/items/items.ts'
import type { Skeleton } from '../../src/lib/rig/skeleton.ts'
import fixture from '../fixtures/helmet-occlusion.json'

afterEach(() => vi.restoreAllMocks())
const options = { name: 'Fixture', description: 'fixture body', size: 48, seed: 741257 }
function rotations() {
  return DIRECTIONS.map((label, i) => {
    const img = makeImg(48, 48)
    for (let y = 8; y < 44; y++) for (let x = 20; x < 27; x++) img.data.set([50 + i * 20, 80, 110, 255], (y * 48 + x) * 4)
    img.data.set([220, i * 20, 20, 255], (12 * 48 + 18 + i % 3) * 4)
    return { label, img }
  })
}

test('omitted policy preserves legacy four/eight direction planning and prices', () => {
  expect(genDirsOf()).toEqual(['south', 'east', 'north'])
  expect(genDirsOf(8)).toEqual(['south', 'south-east', 'east', 'north-east', 'north'])
  for (const n of [4, 8] as const) expect(estimate(n)).toEqual(estimate(n, 'mirrored'))
})

test.each([[4, 2.25, 2.65, 5], [8, 2.25, 3.05, 5]] as const)('independent %i view costs include the draw, re-import and rest fallback of every original direction', (n, gens, maxGens, minutes) => {
  expect(genDirsOf(n, 'independent')).toEqual(n === 8 ? DIRECTIONS : ['south', 'east', 'north', 'west'])
  expect(estimate(n, 'independent')).toEqual({ gens, maxGens, minutes })
  const spec = { ...options, dirs: n, directionPolicy: 'independent' as const }
  expect(creationDirections(spec)).toEqual(genDirsOf(n, 'independent').map(id => ({ id })))
  expect(estimate(spec)).toEqual(estimate(n, 'independent'))
})

test('independent rest preparation keeps provider western pixels while legacy specs preserve old flips', () => {
  const rots = rotations(), original = structuredClone(rots)
  for (const dirs of [4, 8] as const) {
    const independent = prepareRestViews(rots, { ...options, dirs, directionPolicy: 'independent' }).rest
    const legacy = prepareRestViews(rots, { ...options, dirs }).rest
    for (const dir of genDirsOf(dirs, 'independent')) expect(independent[dir]).toEqual(normalize(rots.find((r) => r.label === dir)!.img, 64, 64).img)
    expect(independent.west).not.toEqual(flipH(independent.east))
    expect(legacy.west).toEqual(flipH(legacy.east))
    if (dirs === 8) {
      expect(legacy['south-west']).toEqual(flipH(legacy['south-east']))
      expect(independent['south-west']).not.toEqual(legacy['south-west'])
    }
  }
  expect(rots).toEqual(original)
  expect(() => prepareRestViews(rots.filter((r) => r.label !== 'west'), { ...options, dirs: 4, directionPolicy: 'independent' })).toThrow('no west view')
})

test.each([4, 8] as const)('freeze requires the exact %i requested independent rows instead of silently dropping directions', async (dirs) => {
  const rest = prepareRestViews(rotations(), { ...options, dirs, directionPolicy: 'independent' }).rest
  const rows = Object.fromEntries(genDirsOf(dirs, 'independent').map((d) => [d, [rest[d]]]))
  const built = await buildRig([{ id: 'idle', dirs: rows }, { id: 'walk', dirs: rows }], { mode: 'all' })
  expect(() => assertCreatedDirections(built.rig, dirs, 'independent')).not.toThrow()
  expect(built.rig.directions.every((d) => !d.mirrorOf)).toBe(true)
  const dropped = structuredClone(built.rig)
  dropped.directions.pop()
  expect(() => assertCreatedDirections(dropped, dirs, 'independent')).toThrow('requested direction')
  const wrong = structuredClone(built.rig)
  wrong.directions.find((d) => d.id === 'west')!.mirrorOf = 'east'
  expect(() => assertCreatedDirections(wrong, dirs, 'independent')).toThrow('direction policy')
  const duplicate = structuredClone(built.rig)
  duplicate.directions[0] = duplicate.directions[1]
  expect(() => assertCreatedDirections(duplicate, dirs, 'independent')).toThrow('requested direction')
})

test.each([4, 8] as const)('legacy %i direction freeze still keeps the original mirror links', async (dirs) => {
  const rest = prepareRestViews(rotations(), { ...options, dirs }).rest
  const rows = Object.fromEntries(genDirsOf(dirs).map((d) => [d, [rest[d]]]))
  const built = await buildRig([{ id: 'idle', dirs: rows }], { mode: dirs === 8 ? '8' : '4' })
  expect(() => assertCreatedDirections(built.rig, dirs)).not.toThrow()
  expect(built.rig.directions.find((d) => d.id === 'west')?.mirrorOf).toBe('east')
})

test('direction policy never puts n_directions=4 on the initial text-only v3 request, and can reuse the same base request', async () => {
  vi.spyOn(db, 'get').mockResolvedValue(undefined)
  const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue({ state: 'lost', error: 'synthetic stop before any API' } as JobRec)
  for (const directionPolicy of [undefined, 'mirrored', 'independent'] as const) for (const dirs of [4, 8] as const) {
    await expect(createCharacter({ ...options, dirs, directionPolicy })).rejects.toThrow('synthetic stop')
  }
  const requests = enqueue.mock.calls.map(([req]) => req)
  expect(requests).toHaveLength(6)
  for (const req of requests) {
    expect(req.path).toBe('/create-character-v3')
    expect(req.body).not.toHaveProperty('n_directions')
    expect(req).toEqual(requests[0])
  }
})

const swapLabel = (label: string) => label.startsWith('LEFT ') ? label.replace('LEFT ', 'RIGHT ') : label.startsWith('RIGHT ') ? label.replace('RIGHT ', 'LEFT ') : label
const travel = (poses: Skeleton[], label: string) => poses.slice(1).reduce((s, p, i) => s + Math.hypot(p[label].x - poses[i][label].x, p[label].y - poses[i][label].y), 0)
test.each(['west', 'south-west', 'north-west'] as DirectionName[])("%s authored slash drives anatomical right joints on that view's own rest pose", (dir) => {
  const east = fixture.rig.rest.east.keypoints
  const rest = fromApi(east.map((p) => ({ ...p, label: swapLabel(p.label), x: 1 - p.x })), { w: 64, h: 64 })
  const poses = authoredPoses('slash', rest, dir)
  expect(travel(poses, 'RIGHT ARM')).toBeGreaterThan(2 * travel(poses, 'LEFT ARM'))
  expect(poses.map((p) => toApi(p, { w: 64, h: 64 })).every(hasAll)).toBe(true)
  expect(Object.keys(rest).sort()).toEqual([...LABELS].sort())
})

test('eight independent held views obey 96px four-frame caps across three dressed batches', () => {
  const rig: Rig = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: DIRECTIONS.map((id) => ({ id })), baseItem: 'base', baseHash: 'sha256:test', animations: [{ id: 'idle', cells: 4, loop: true, frames: [] }, { id: 'walk', cells: 8, loop: true, frames: [] }] }
  const calls = planItem(rig, { anims: ['idle', 'walk'], dirs: DIRECTIONS, method: 'skel', slot: 'main_hand', key: 'green' })
  const dress = calls.filter((c) => c.kind === 'dress')
  expect(dress.map((c) => c.cells.length)).toEqual([4, 3, 1])
  expect(dress.map((c, i) => c.cells.length + Number(i > 0))).toEqual([4, 4, 2])
  expect(dress.flatMap((c) => c.cells)).toEqual(DIRECTIONS.map((d) => `rest/${d}/0`))
  expect(calls.filter((c) => c.kind === 'pose')).toHaveLength(16)
  expect(planGens(calls)).toBe(78)
})

test('new items describe independent rows truthfully while mirrored rigs keep flip metadata', async () => {
  for (const mirrored of [false, true]) {
    const rig: Rig = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: [{ id: 'east' }, { id: 'west', ...(mirrored ? { mirrorOf: 'east' as const } : {}) }], animations: [], baseItem: 'base', baseHash: 'sha256:test' }
    const { item } = await buildItem({ spec: { id: 'helmet', name: 'Helmet', slot: 'head', prompt: '', key: 'green', anims: [], dirs: [] }, rig, cells: [], route: 'green', provenance: [], qa: { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'pass', cells: {}, rerolls: 0 } })
    expect(item.mirror).toBe(mirrored ? 'flip' : 'generate')
  }
})
