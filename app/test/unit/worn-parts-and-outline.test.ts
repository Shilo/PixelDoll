import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { grayShare, sizeFloor, type CellOut } from '../../src/lib/items/items.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

const w = 32
const paint = (im: Img, x0: number, y0: number, x1: number, y1: number, rgb: number[]) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) im.data.set([...rgb, 255], (y * w + x) * 4) }
const pose = LABELS.map(label => ({ label, x: 0.5, y: 0.5 }))
const rig: Rig = {
  cell: { w, h: w }, pivot: { x: 16, y: 30 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }],
  animations: [{ id: 'walk', cells: 1, loop: true, frames: [], sources: { south: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: [pose], provenance: [] } } }],
}
function posed(layer: Img): CellOut {
  const mask = new Uint8Array(w * w); for (let p = 0; p < mask.length; p++) mask[p] = layer.data[p * 4 + 3] ? 1 : 0
  const base = makeImg(w, w)
  return { key: 'walk/south/0', call: 1, base, input: base, out: layer, layer, mask, area: mask.reduce((s, v) => s + v, 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true }
}

test('a small part the dressed design has at that place survives the size cleanup; a stray speck does not', () => {
  // Cape body 12x14 = 168 px plus two 2x3 clasps (6 px, under 15 % of the cape) in the design; the posed frame adds a 2x3 smear.
  const keyframe = makeImg(w, w), frame = makeImg(w, w)
  for (const im of [keyframe, frame]) { paint(im, 10, 12, 21, 25, [150, 20, 20]); paint(im, 8, 6, 9, 8, [200, 160, 40]); paint(im, 22, 6, 23, 8, [200, 160, 40]) }
  paint(frame, 2, 28, 3, 30, [150, 20, 20])
  const c = posed(frame)
  sizeFloor([c], { south: keyframe }, rig)
  expect(c.mask[7 * w + 8]).toBe(1)
  expect(c.mask[7 * w + 22]).toBe(1)
  expect(c.mask[29 * w + 2]).toBe(0)
})

test('without the design to compare against, small parts follow the old size rule', () => {
  const frame = makeImg(w, w); paint(frame, 10, 12, 21, 25, [150, 20, 20]); paint(frame, 8, 6, 9, 8, [200, 160, 40])
  const c = posed(frame)
  sizeFloor([c], {})
  expect(c.mask[7 * w + 8]).toBe(0)
})

test('a black outline around a colorful design is not counted as gray smudges', () => {
  const outlined = makeImg(w, w); paint(outlined, 4, 4, 27, 27, [10, 10, 12]); paint(outlined, 5, 5, 26, 26, [40, 90, 220])
  expect(grayShare(outlined)).toBe(0)
  const smudged = makeImg(w, w); paint(smudged, 5, 5, 26, 26, [40, 90, 220]); paint(smudged, 5, 5, 26, 7, [120, 120, 120])
  expect(grayShare(smudged)).toBeGreaterThan(0.05)
})
