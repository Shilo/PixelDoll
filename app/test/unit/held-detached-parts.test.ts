import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { postProcess, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

// A 64 px cell: torso columns 27-38, right wrist at (24, 34). Held pixels are painted brown, body pixels gray.
const w = 64, wrist = [24, 34]
const pose = LABELS.map(label => ({ label, x: (label === 'RIGHT ARM' ? wrist[0] : label === 'LEFT ARM' ? 40 : 32) / w, y: (label.endsWith('ARM') ? wrist[1] : 20) / w }))
const rig: Rig = {
  cell: { w, h: w }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }],
  animations: [{ id: 'walk', cells: 4, loop: true, frames: [], sources: { south: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: [pose, pose, pose, pose], provenance: [] } } }],
}
function cell(i: number, item: (x: number, y: number) => boolean, body: (x: number, y: number) => boolean): CellOut {
  const base = makeImg(w, w), layer = makeImg(w, w), mask = new Uint8Array(w * w)
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (body(x, y)) base.data.set([90, 90, 90, 255], p * 4)
    else if (item(x, y)) { mask[p] = 1; layer.data.set([150, 90, 40, 255], p * 4) }
  }
  return { key: `walk/south/${i}`, call: 0, base, input: base, out: layer, layer, mask, area: mask.reduce((s, v) => s + v, 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true }
}
const torso = (x: number, y: number) => x >= 27 && x <= 38 && y >= 10 && y < 60
// A spear held at the wrist, running right across the torso: the body hides its middle, its tip shows past the far side.
const spear = (x: number, y: number) => x >= 8 && x <= 50 && (y === 33 || y === 34)

test('a held object split by the body keeps the part beyond it', () => {
  const cells = [0, 1, 2, 3].map(i => cell(i, spear, torso)), before = cells.map(c => c.area)
  postProcess(rig, slotOf('main_hand'), cells, {})
  expect(cells.map(c => c.area)).toEqual(before)
})

test('a part separated from the object by open air is still removed', () => {
  // The same spear with no body between: its far part floats in open air, like a motion smear or an effect.
  const cells = [0, 1, 2, 3].map(i => cell(i, (x, y) => spear(x, y) && !(x >= 27 && x <= 38), (x, y) => torso(x, y) && y > 40))
  postProcess(rig, slotOf('main_hand'), cells, {})
  expect(cells.every(c => c.area === 38 && !c.mask[33 * w + 45])).toBe(true)
})

test('a tiny speck in open air is removed', () => {
  const cells = [0, 1, 2, 3].map(i => cell(i, (x, y) => spear(x, y) && x < 27 || (x === 55 && y === 10), () => false))
  postProcess(rig, slotOf('main_hand'), cells, {})
  expect(cells.every(c => !c.mask[10 * w + 55])).toBe(true)
})

test('a fleck too small to keep cannot pull a piece painted on the body into the held item', () => {
  // A 2 px fleck past the torso edge bridges to the spear; beside it sits a 15 px buckle painted on the hip (fully on the body).
  const fleck = (x: number, y: number) => (x === 39 || x === 40) && y === 45
  const buckle = (x: number, y: number) => x >= 34 && x <= 38 && y >= 44 && y <= 46
  const cells = [0, 1, 2, 3].map(i => cell(i, (x, y) => spear(x, y) && x < 27 || fleck(x, y) || buckle(x, y), (x, y) => torso(x, y) && !buckle(x, y)))
  for (const c of cells) for (let y = 44; y <= 46; y++) for (let x = 34; x <= 38; x++) c.base.data.set([90, 90, 90, 255], (y * w + x) * 4)
  postProcess(rig, slotOf('main_hand'), cells, {})
  expect(cells.every(c => !c.mask[45 * w + 36] && !c.mask[45 * w + 39])).toBe(true)
})
