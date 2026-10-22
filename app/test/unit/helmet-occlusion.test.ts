import { expect, test } from 'vitest'
import { DESIGN, GREYISH, greyShare, dirGate, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'
import fixture from '../fixtures/helmet-occlusion.json'

function decode(im: { w: number; h: number; runs: number[][] }) {
  const out = makeImg(im.w, im.h)
  for (const [start, length, ...rgba] of im.runs) for (let p = start; p < start + length; p++) out.data.set(rgba, p * 4)
  return out
}
const rig = fixture.rig as unknown as Rig
const keys = { south: decode(fixture.keys.south), east: decode(fixture.keys.east), north: decode(fixture.keys.north) }
function cell(i = 0): CellOut {
  const c = fixture.cells[i], base = decode(c.base), layer = decode(c.layer), out = decode(c.out)
  return { ...c, base, layer, out, input: base, mask: Uint8Array.from({ length: layer.w * layer.h }, (_, p) => layer.data[p * 4 + 3] ? 1 : 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true }
}
const gate = (c: CellOut, r?: Rig) => dirGate(slotOf('head'), [c], keys, r)

test('a saved forearm-covered visor gets review instead of a false H4 retry', () => {
  const c = cell(), before = [...c.layer.data]
  expect(gate(c).fails.size).toBe(1)
  const q = gate(c, rig)
  expect(q.fails.size).toBe(0)
  expect(q.warnings).toEqual([expect.stringContaining('forearm may cover')])
  expect([...c.layer.data]).toEqual(before)
})

test.each([1, 2, 3])('saved deformed visor/streak case %i remains a hard failure', i => {
  const q = gate(cell(i), rig)
  expect(q.fails.size).toBe(1)
  expect(q.warnings).toEqual([])
})

test('unobserved arms, non-key pixels and missing rest poses cannot excuse the helmet', () => {
  const hidden = cell(); hidden.out.data.fill(0)
  expect(gate(hidden, rig).fails.size).toBe(1)
  const skin = cell()
  for (let p = 0; p < skin.mask.length; p++) if (!skin.mask[p] && skin.out.data[p * 4 + 3]) skin.out.data.set([180, 120, 90, 255], p * 4)
  expect(gate(skin, rig).fails.size).toBe(1)
  const incomplete = structuredClone(rig); delete incomplete.rest
  expect(gate(cell(), incomplete).fails.size).toBe(1)
})

test('a wrong-facing reference and an added blade stay hard failures', () => {
  expect(dirGate(slotOf('head'), [cell()], { ...keys, south: keys.north }, rig).fails.size).toBe(1)
  const extra = cell()
  for (let y = 5; y < 30; y++) for (let x = 39; x < 42; x++) { extra.layer.data.set([220, 220, 220, 255], (y * 64 + x) * 4); extra.mask[y * 64 + x] = 1; extra.area++ }
  expect(gate(extra, rig).fails.size).toBe(1)
})

test('an unrelated forearm cannot excuse extra parts through head alignment alone', () => {
  const c = cell(), K = makeImg(64, 64)
  c.layer = makeImg(64, 64); c.base = makeImg(64, 64); c.out = makeImg(64, 64); c.mask.fill(0)
  for (let y = 12; y <= 21; y++) for (let x = 25; x <= 34; x++) K.data.set([90, 90, 100, 255], (y * 64 + x) * 4)
  c.layer.data.set(K.data)
  for (let y = 22; y <= 51; y++) c.layer.data.set([90, 90, 100, 255], (y * 64 + 34) * 4)
  c.out.data.set(c.layer.data)
  for (let p = 0; p < c.mask.length; p++) c.mask[p] = c.layer.data[p * 4 + 3] ? 1 : 0
  c.area = 130
  for (let y = 39; y <= 41; y++) for (let x = 45; x <= 52; x++) { c.base.data.set([80, 80, 80, 255], (y * 64 + x) * 4); c.out.data.set([0, 200, 0, 255], (y * 64 + x) * 4) }
  const r = structuredClone(rig), pose = r.rest!.south!.keypoints!
  for (const p of pose) if (p.label.endsWith('ELBOW') || p.label.endsWith('ARM')) { p.x = (p.label.endsWith('ELBOW') ? 45 : 52) / 64; p.y = 40 / 64 }
  r.animations.find(a => a.id === 'slash')!.sources!.south!.keypoints![3] = structuredClone(pose)
  const q = dirGate(slotOf('head'), [c], { south: K }, r)
  expect(q.fails.size).toBe(1)
  expect(q.warnings).toEqual([])
})

test('the saved cape hem is already rejected by the design gate; clean views are preserved', () => {
  expect(GREYISH.test('red cape')).toBe(false)
  expect(greyShare(decode(fixture.capeKeys.north))).toBeCloseTo(0.1128, 4)
  expect(greyShare(decode(fixture.capeKeys.north))).toBeGreaterThan(DESIGN.grey)
  expect(greyShare(decode(fixture.capeKeys.south))).toBe(0)
  expect(greyShare(decode(fixture.capeKeys.east))).toBe(0)
})
