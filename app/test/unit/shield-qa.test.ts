import { expect, test } from 'vitest'
import { axisOf, itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

const size = 24
const pose = LABELS.map(label => ({
  label,
  x: (label.startsWith('LEFT') ? 9 : 19) / size,
  y: (label.endsWith('ARM') ? 12 : 8) / size,
}))
const rig: Rig = {
  cell: { w: size, h: size }, pivot: { x: 12, y: 23 }, baseItem: 'base', baseHash: 'sha256:test',
  directions: [{ id: 'south' }],
  animations: [{ id: 'walk', cells: 3, loop: true, frames: [], sources: { south: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: [pose, pose, pose], provenance: [] } } }],
}
function cell(i: number, shape: (x: number, y: number) => boolean): CellOut {
  const layer = makeImg(size, size), mask = new Uint8Array(size * size)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!shape(x - 9, y - 12)) continue
    mask[y * size + x] = 1
    layer.data.set([120, 70, 30, 255], (y * size + x) * 4)
  }
  return {
    key: `walk/south/${i}`, call: 0, base: makeImg(size, size), input: layer, out: layer, layer, mask,
    area: mask.reduce((a, b) => a + b, 0), outBand: 0, baseBand: 0, specks: 0, pinholes: 0,
    shifted: false, offset: [0, 0], stray: 0, posed: true,
  }
}
const rotationFailures = (cells: CellOut[]) => [...itemQa(rig, slotOf('off_hand'), 'green', cells, 0).failCalls.values()].flat().filter(s => s.startsWith('G9'))

test('round shields tolerate a pixel of width/height variation without a false quarter turn', () => {
  const cells = [0, 1, 2].map(i => cell(i, (x, y) => i === 1 ? x >= -3 && x < 3 && y >= -2 && y <= 2 : x >= -2 && x <= 2 && y >= -3 && y < 3))
  expect(rotationFailures(cells)).toEqual([])
  expect(axisOf(cells[0].mask, size)).toBeNull()
})

test('round shields still fail a large shape change when an angle cannot describe them', () => {
  const cells = [0, 1, 2].map(i => cell(i, (x, y) => i === 1 ? x * x + y * y >= 10 && x * x + y * y <= 20 : x * x + y * y <= 9))
  expect(rotationFailures(cells)).toEqual([expect.stringContaining('shape jump')])
})

test('elongated held items still fail a quarter turn against a stationary forearm', () => {
  const cells = [0, 1, 2].map(i => cell(i, (x, y) => i === 1 ? Math.abs(x) <= 5 && Math.abs(y) <= 1 : Math.abs(x) <= 1 && Math.abs(y) <= 5))
  expect(rotationFailures(cells)).toEqual([expect.stringContaining('turns 90°')])
})

test.each([2, 3, 5])('a %i-pixel half-length held item may rotate with its forearm', half => {
  const movingRig = structuredClone(rig)
  movingRig.animations[0].sources!.south!.keypoints![1] = pose.map(p => p.label === 'LEFT ELBOW' ? { ...p, x: 5 / size, y: 12 / size } : p)
  const cells = [0, 1, 2].map(i => cell(i, (x, y) => i === 1 ? y === 0 && Math.abs(x) <= half : x === 0 && Math.abs(y) <= half))
  expect([...itemQa(movingRig, slotOf('off_hand'), 'green', cells, 0).failCalls.values()].flat()).toEqual([])
})
