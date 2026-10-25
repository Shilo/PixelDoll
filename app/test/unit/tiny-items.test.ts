import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { dirGate, extractCell, hiddenViews, itemQa, postProcess, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

// Posed frames drop components under 4 px (skeleton-v3 motion specks). An item made only of tiny parts (two 3 px earrings) used
// to lose every px in every posed frame and fail G4 everywhere; the floor now drops to the dressed keyframe's largest part.
const W = 32, GOLD = [230, 190, 40]
const put = (im: Img, x: number, y: number, c: number[]) => im.data.set([...c, 255], (y * W + x) * 4)
const rig: Rig = { cell: { w: W, h: W }, pivot: { x: 16, y: 31 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] }
const base = makeImg(W, W)
for (let y = 4; y < W; y++) for (let x = 10; x < 22; x++) put(base, x, y, [200, 150, 120])
const EARRINGS = [[10, 8], [10, 9], [11, 9], [21, 8], [21, 9], [20, 9]]
const draw = (im: Img, px: number[][], c = GOLD) => { for (const [x, y] of px) put(im, x, y, c) }
function posed(px: number[][]): CellOut {
  const out = toChroma(base, 'green'); draw(out, px)
  return extractCell({ key: 'walk/south/0', call: 1, base, out, route: 'green', band: { x: 0, y: 0, w: W, h: 12 }, posed: true, clip: true })
}
const keyframe = (px: number[][]) => { const k = makeImg(W, W); draw(k, px); return { south: k } }

test('an item made of 3 px parts keeps them when its keyframe has nothing bigger', () => {
  const c = posed(EARRINGS)
  postProcess(rig, slotOf('face_acc'), [c], keyframe(EARRINGS))
  expect(c.area).toBe(6)
})

test('3 px specks beside an item with bigger parts are still dropped', () => {
  const mask = [[12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2], [18, 2], [19, 2]] // an 8 px band
  const c = posed([...mask, [3, 20], [3, 21], [4, 21]])
  postProcess(rig, slotOf('face_acc'), [c], keyframe(mask))
  expect(c.area).toBe(8)
})

test('without a keyframe, or with an empty one, the 4 px floor stays', () => {
  for (const keys of [{}, keyframe([])]) {
    const c = posed(EARRINGS)
    postProcess(rig, slotOf('face_acc'), [c], keys)
    expect(c.area).toBe(0)
  }
})

// An item a view hides (glasses from behind, round 5) used to fail the dress call and every clip of that view (G4), paying for
// re-rolls that cannot draw it; for small accessories an empty view is now a review warning. Normal items keep the hard fail.
test('only small accessories may have an empty view', () => {
  const glasses = posed(EARRINGS), helmet = posed(Array.from({ length: 120 }, (_, i) => [10 + (i % 12), 4 + Math.floor(i / 12)]))
  const keys = { south: keyframe(EARRINGS).south, north: makeImg(W, W) }
  expect([...hiddenViews([glasses], keys)]).toEqual(['north'])
  expect(hiddenViews([helmet], keys).size).toBe(0)
  expect(hiddenViews([glasses], { south: keys.south }).size).toBe(0)
  // a fragment drawn in one view of three is a failed dress, not two hidden views
  expect(hiddenViews([glasses], { ...keys, east: makeImg(W, W) }).size).toBe(0)
})

test('a hidden view warns instead of failing G4', () => {
  const empty = (d: string, i: number) => ({ ...posed([]), key: `walk/${d}/${i}` })
  const cells = [empty('north', 0), empty('north', 1)]
  const plain = itemQa(rig, slotOf('face_acc'), 'green', cells, 0)
  expect([...plain.failCalls.values()].flat().some((m) => m.startsWith('G4 walk/north'))).toBe(true)
  const hidden = itemQa(rig, slotOf('face_acc'), 'green', cells, 0, undefined, 0, new Set(['north']))
  expect([...hidden.failCalls.values()].flat().some((m) => m.startsWith('G4'))).toBe(false)
  expect(hidden.warnings.some((m) => m.startsWith('G4 walk/north'))).toBe(true)
  // the item popping in on some frames of a hidden view still fails
  const popIn = itemQa(rig, slotOf('face_acc'), 'green', [...cells, empty('north', 2), { ...posed(EARRINGS), key: 'walk/north/3' }], 0, undefined, 0, new Set(['north']))
  expect([...popIn.failCalls.values()].flat().some((m) => m.startsWith('G4 walk/north'))).toBe(true)
})

test('H4 compares tiny parts instead of despecking them away', () => {
  const studs = [...EARRINGS, [13, 8], [13, 9], [14, 9], [18, 8], [18, 9], [17, 9]] // 12 px in 3 px parts: large enough for H4 to judge
  const c = posed(studs)
  postProcess(rig, slotOf('face_acc'), [c], keyframe(studs))
  expect(dirGate(slotOf('face_acc'), [c], keyframe(studs), rig).fails.size).toBe(0)
})

test('H4 judges a frame that grew past 12 px on a tiny keyframe', () => {
  const c = posed([...EARRINGS, ...Array.from({ length: 14 }, (_, i) => [12 + (i % 7), 3 + Math.floor(i / 7)])]) // a 14 px extra part
  postProcess(rig, slotOf('face_acc'), [c], keyframe(EARRINGS))
  expect(dirGate(slotOf('face_acc'), [c], keyframe(EARRINGS), rig).fails.size).toBe(1)
})

test('H4 does not judge a keyframe view under 12 px', () => {
  const c = posed(EARRINGS.map(([x, y]) => [x, y + 1])) // the same earrings 1 px lower
  postProcess(rig, slotOf('face_acc'), [c], keyframe(EARRINGS))
  expect(dirGate(slotOf('face_acc'), [c], keyframe(EARRINGS), rig).fails.size).toBe(0)
})
