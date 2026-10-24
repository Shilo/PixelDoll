import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import type { CellKey } from '../../src/lib/store/manifest.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

const rig: Rig = { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }], animations: ['idle', 'walk', 'slash'].map(id => ({ id, cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] })) }
function cell(anim: string, edge: number): CellOut {
  const layer = makeImg(64, 64), base = makeImg(64, 64), mask = new Uint8Array(4096)
  for (let y = 12; y < 17; y++) for (let x = edge; x < edge + 4; x++) { mask[y * 64 + x] = 1; layer.data.set([90, 90, 100, 255], (y * 64 + x) * 4) }
  return { key: `${anim}/south/0` as CellKey, call: 0, base, input: base, out: layer, layer, mask, area: 20, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true }
}
test.each(['idle', 'walk', 'slash'])('contained %s equipment touching the border needs framing review, not a paid retry', anim => {
  const edge = cell(anim, 0), before = edge.layer.data.slice()
  const q = itemQa(rig, slotOf('head'), 'none', [edge], 0)
  expect(q.failCalls.size).toBe(0)
  expect(q.qa.status).toBe('warn'); expect(q.qa.clipPx).toBe(5)
  expect(q.warnings.join(' ')).toMatch(/border.*(?:review|check)/)
  expect(q.warnings.join(' ')).not.toMatch(/\(clipped\)/)
  expect(edge.layer.data).toEqual(before)
  const inset = itemQa(rig, slotOf('head'), 'none', [cell(anim, 1)], 0)
  expect(inset.qa.clipPx).toBe(0); expect(inset.failCalls.size).toBe(0)
})
