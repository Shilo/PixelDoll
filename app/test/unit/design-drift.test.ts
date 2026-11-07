import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { dirGate, GATES, itemQa, paletteDistance, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { withH4 } from '../../src/lib/items/run.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

// Round 3 review (Codex F1): every posed frame is measured against its dressed keyframe's palette, in every slot, so a clip that
// drifts with the first pose call (the call-level G6 reference) is still reported
const points = [18, 19, 20, 26, 27, 28, 34, 35, 36, 42, 43, 44]
const im = (rgb: number[]) => { const o = makeImg(8, 8); for (const p of points) o.data.set([...rgb, 255], p * 4); return o }
const cell = (layer: ReturnType<typeof makeImg>, key: string): CellOut => ({ key, call: 1, base: makeImg(8, 8), input: layer, out: layer, layer, mask: new Uint8Array(64).map((_, p) => Number(points.includes(p))), area: 12, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true })

test('a clip drawn in other colors than its dressed design warns in every slot, a matching one does not', () => {
  const keys = { east: im([200, 30, 30]) }
  for (const slot of ['feet', 'torso_outer', 'head', 'main_hand']) {
    expect(dirGate(slotOf(slot), [cell(im([30, 30, 200]), 'walk/east/0')], keys).warnings, slot).toContain('G6 walk/east/0: palette distance 170.0 to the dressed design')
    expect(dirGate(slotOf(slot), [cell(im([205, 30, 30]), 'walk/east/0')], keys).warnings.some((w) => w.startsWith('G6')), slot).toBe(false)
  }
})

test('one recolored frame warns even when seven matching frames dilute its clip average in every slot class', () => {
  const keys = { east: im([200, 30, 30]) }
  const cells = Array.from({ length: 8 }, (_, i) => cell(im([i === 5 ? 220 : 200, 30, 30]), `walk/east/${i}`))
  const before = structuredClone({ keys, cells })
  expect(paletteDistance([0xc81e1e], cells.map(c => c.layer))).toBe(2.5)
  expect(paletteDistance([0xc81e1e], [cells[5].layer])).toBeGreaterThan(GATES.paletteDist)
  for (const slot of ['body', 'feet', 'torso_outer', 'head', 'main_hand']) {
    const q = dirGate(slotOf(slot), cells, keys)
    expect(q.warnings, slot).toEqual(['G6 walk/east/5: palette distance 20.0 to the dressed design'])
    expect(q.maxPaletteDist, slot).toBe(20)
    expect(q.fails.size, slot).toBe(0)
  }
  expect({ keys, cells }).toEqual(before)
})

test('standing palette checks use the frame direction and ignore unposed, empty and unreferenced cells', () => {
  const keys = { east: im([200, 30, 30]), north: im([30, 30, 200]) }
  const cells = [cell(im([200, 30, 30]), 'walk/east/0'), cell(im([30, 30, 200]), 'walk/north/0'),
    { ...cell(im([220, 30, 30]), 'walk/east/1'), posed: false },
    { ...cell(makeImg(8, 8), 'walk/east/2'), area: 0, mask: new Uint8Array(64) },
    cell(im([1, 2, 3]), 'walk/south/0')]
  const q = dirGate(slotOf('feet'), cells, keys)
  expect(q.warnings).toEqual([])
  expect(q.maxPaletteDist).toBe(0)
})

test('standing frame drift updates the overall and corresponding clip maximum without changing pixels', () => {
  const rig: Rig = { cell: { w: 8, h: 8 }, pivot: { x: 4, y: 7 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'east' }, { id: 'north' }], animations: [] }
  const slot = slotOf('head'), keys = { east: im([200, 30, 30]), north: im([30, 30, 200]) }
  const cells = [...Array.from({ length: 8 }, (_, i) => cell(im([i === 5 ? 220 : 200, 30, 30]), `walk/east/${i}`)), cell(im([30, 30, 200]), 'walk/north/0')]
  const before = structuredClone({ rig, keys, cells }), qa = itemQa(rig, slot, 'green', cells, 0)
  expect(qa.qa).toMatchObject({ status: 'pass', maxPaletteDist: 0 })
  const q = withH4(qa, slot, cells, keys, rig)
  expect(q.warnings).toEqual(['G6 walk/east/5: palette distance 20.0 to the dressed design'])
  expect(q.failCalls.size).toBe(0)
  expect(q.qa).toMatchObject({ status: 'warn', maxPaletteDist: 20 })
  expect(q.qa.clips!['walk/east']).toMatchObject({ status: 'warn', maxPaletteDist: 20 })
  expect(q.qa.clips!['walk/north']).toMatchObject({ status: 'pass', maxPaletteDist: 0 })
  expect({ rig, keys, cells }).toEqual(before)
})

test('standing palette warnings compare the same rounded distance that their summaries report', () => {
  for (const extra of [1, 2]) {
    const standing = makeImg(8, 8), layer = makeImg(8, 8), mask = new Uint8Array(64)
    let n = 0
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= 5; x++) {
      const p = y * 8 + x
      standing.data.set([200, 30, 30, 255], p * 4)
      layer.data.set([n++ < extra ? 216 : 215, 30, 30, 255], p * 4)
      mask[p] = 1
    }
    const q = dirGate(slotOf('feet'), [{ ...cell(layer, 'walk/east/0'), area: 25, mask }], { east: standing })
    expect(q.maxPaletteDist).toBe(extra === 1 ? 15 : 15.1)
    expect(q.warnings).toEqual(extra === 1 ? [] : ['G6 walk/east/0: palette distance 15.1 to the dressed design'])
  }
})
