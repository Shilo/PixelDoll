import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { extractCell, postProcess, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

// Posed head items used to lose every px below the head band, so a coif, aventail or hood mantle was cut at the neck.
// Now detached px below the band are still trimmed at extraction, joined px go to postProcess, and only the dressed keyframe
// (extracted untrimmed) can keep them: exact keyframe px, no dilation, no consensus. Without a usable keyframe the band trim stays.
const W = 32, band = { x: 0, y: 0, w: W, h: 12 }, BROWN = [140, 90, 50]
const put = (im: Img, x: number, y: number, c: number[]) => im.data.set([...c, 255], (y * W + x) * 4)
const rig: Rig = { cell: { w: W, h: W }, pivot: { x: 16, y: 31 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 4, loop: true, frames: [0, 1, 2, 3].map(cell => ({ cell, ms: 100 })) }] }
const base = makeImg(W, W)
for (let y = 4; y < W; y++) for (let x = 10; x < 22; x++) put(base, x, y, x === 10 || x === 21 ? [30, 30, 30] : [170, 170, 170])
const hood = (im: Img, rows: number) => { for (let y = 2; y < 12 + rows; y++) for (let x = 9; x < 23; x++) put(im, x, y, BROWN) }
function frame(i: number, draw: (out: Img) => void): CellOut {
  const out = toChroma(base, 'green'); draw(out)
  return extractCell({ key: `walk/south/${i}`, call: 0, base, out, route: 'green', band, posed: true, clip: true })
}
const keyframe = (rows: number) => { const k = makeImg(W, W); hood(k, rows); return { south: k } }
const below = (c: CellOut) => c.mask.slice(12 * W).reduce((a, b) => a + b, 0)

test('detached px below the band are trimmed at extraction', () => {
  const c = frame(0, out => { hood(out, 0); for (let y = 20; y < 22; y++) for (let x = 12; x < 16; x++) put(out, x, y, BROWN) })
  expect(below(c)).toBe(0)
  expect(c.stray).toBeGreaterThan(0)
  expect(c.clipY).toBeUndefined()
})

test('a mantle the dressed keyframe has survives the head band', () => {
  const c = frame(0, out => hood(out, 4))
  expect(c.clipY).toBe(12)
  postProcess(rig, slotOf('head'), [c], keyframe(4))
  expect(below(c)).toBe(4 * 14)
  expect(c.clipY).toBeUndefined()
})

test('below the band, px just outside the keyframe are trimmed (no 2 px dilation)', () => {
  const c = frame(0, out => hood(out, 6))
  postProcess(rig, slotOf('head'), [c], keyframe(4))
  expect(below(c)).toBe(4 * 14)
})

test('a joined streak repeated in every frame is not kept by consensus', () => {
  const cs = [0, 1, 2, 3].map(i => frame(i, out => { hood(out, 0); for (let y = 12; y < 18; y++) put(out, 15, y, BROWN) }))
  postProcess(rig, slotOf('head'), cs, keyframe(0))
  for (const c of cs) expect(below(c)).toBe(0)
})

test('without a keyframe the band trim is the floor, also for slots without the keyframe trim', () => {
  const c = frame(0, out => hood(out, 4))
  postProcess(rig, slotOf('head'), [c], {})
  expect(below(c)).toBe(0)
  const t = frame(1, out => hood(out, 4))
  postProcess(rig, slotOf('torso_outer'), [t], keyframe(4))
  expect(below(t)).toBe(0)
})
