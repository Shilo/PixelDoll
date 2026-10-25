import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { dirGate, slotOf, type CellOut } from '../../src/lib/items/items.ts'

// Round 3 review (Codex F1): every posed clip is measured against its dressed keyframe's palette, in every slot, so a clip that
// drifts with the first pose call (the call-level G6 reference) is still reported
const im = (rgb: number[]) => { const o = makeImg(8, 8); for (let p = 18; p < 30; p++) o.data.set([...rgb, 255], p * 4); return o }
const cell = (layer: ReturnType<typeof makeImg>, key: string): CellOut => ({ key, call: 1, base: makeImg(8, 8), input: layer, out: layer, layer, mask: new Uint8Array(64).map((_, p) => (p >= 18 && p < 30 ? 1 : 0)), area: 12, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true })

test('a clip drawn in other colors than its dressed design warns in every slot, a matching one does not', () => {
  const keys = { east: im([200, 30, 30]) }
  for (const slot of ['feet', 'torso_outer', 'head', 'main_hand']) {
    expect(dirGate(slotOf(slot), [cell(im([30, 30, 200]), 'walk/east/0')], keys).warnings, slot).toContain('G6 walk/east: palette distance 170.0 to the dressed design')
    expect(dirGate(slotOf(slot), [cell(im([205, 30, 30]), 'walk/east/0')], keys).warnings.some((w) => w.startsWith('G6')), slot).toBe(false)
  }
})
