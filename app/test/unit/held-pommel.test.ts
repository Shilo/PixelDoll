import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { extractCell, postProcess, slotOf } from '../../src/lib/items/items.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

// A held item's fist splits the pommel (or an axe haft's end) from the blade. The per-cell size floor (≥ max(4 px, 15 % of the
// largest piece)) used to run before the wrist rule and deleted it: 1,198 px on 115 of 240 stored S5 frames (2026-10-25).
// Held cells now get the floor after attachHeld, and pieces touching the gripping wrist zone are exempt.
const C = 96, pad = 16, W = 64, WRIST = { x: 30, y: 44 } // rig px; on the 96 canvas at (46, 60)
const kps = LABELS.map(label => ({ label, x: (label === 'RIGHT ARM' ? WRIST.x : 32) / W, y: (label === 'RIGHT ARM' ? WRIST.y : 32) / W }))
const rig: Rig = { cell: { w: W, h: W }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'east' }], rest: { east: { image: 'sha256:r', keypoints: kps } } as Rig['rest'], animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }], sources: { east: { keypoints: [kps] } } } as unknown as Rig['animations'][number]] }
const put = (im: Img, x: number, y: number, c: number[]) => im.data.set([...c, 255], (y * C + x) * 4)
function cell(extra: [number, number]) {
  const base = makeImg(C, C)
  for (let y = 30; y < 90; y++) for (let x = 38; x < 56; x++) put(base, x, y, [170, 170, 170])
  const out = toChroma(base, 'green')
  for (let i = 0; i < 25; i++) { put(out, 49 + i, 63 + i, [200, 200, 210]); put(out, 50 + i, 63 + i, [120, 120, 130]) } // blade from the fist down-right
  for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) put(out, extra[0] + x, extra[1] + y, [200, 160, 40]) // 6 px gold piece
  return extractCell({ key: 'walk/east/0', call: 0, base, out, route: 'green', band: { x: 0, y: 0, w: C, h: C }, posed: true, held: true })
}
const at = (c: ReturnType<typeof cell>, x: number, y: number) => c.mask[y * C + x]

test('a pommel split off by the fist survives', () => {
  const c = cell([43, 57]) // beside the wrist (46, 60), not touching the blade
  postProcess(rig, slotOf('main_hand'), [c], {}, pad)
  expect(at(c, 44, 58)).toBe(1)
  expect(at(c, 60, 74)).toBe(1)
})

test('a piece beside the blade 3-6 px from the wrist is exempt from the size floor (the measured 6 px radius)', () => {
  const c = cell([51, 59]) // 5.5 px from the wrist; within 3 px of the blade's start but not touching it
  postProcess(rig, slotOf('main_hand'), [c], {}, pad)
  expect(at(c, 52, 60)).toBe(1)
})

test('small pieces away from the wrist still get the size floor', () => {
  const tip = cell([77, 89]) // within 3 px of the blade tip, far from the wrist: a smear chip
  postProcess(rig, slotOf('main_hand'), [tip], {}, pad)
  expect(at(tip, 78, 90)).toBe(0)
  const far = cell([80, 30]) // detached, nowhere near
  postProcess(rig, slotOf('main_hand'), [far], {}, pad)
  expect(at(far, 81, 31)).toBe(0)
  expect(at(far, 60, 74)).toBe(1)
})
