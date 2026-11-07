import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { toChroma, type Key } from '../../src/lib/image/chroma.ts'
import { extractCell } from '../../src/lib/items/items.ts'
import { measuredKeyCollision } from '../../src/lib/items/run.ts'
import { plainReason } from '../../src/studio/model.ts'

const w = 48
// A bare stand-in body: skin torso and legs with a darker outline, keyed to green the way the dress call sends it.
const body = makeImg(w, w)
for (let y = 6; y < 44; y++) for (let x = 16; x < 32; x++) body.data.set(x === 16 || x === 31 ? [70, 40, 30, 255] : [200, 150, 120, 255], (y * w + x) * 4)
function dressed(key: Key, paint: (x: number, y: number) => number[] | undefined): Img {
  const out = toChroma(body, key)
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) { const c = paint(x, y); if (c) out.data.set([...c, 255], (y * w + x) * 4) }
  return out
}
const torso = (ramp: number[][]) => (x: number, y: number) => x >= 15 && x <= 32 && y >= 14 && y <= 28 ? ramp[(x + y) % ramp.length] : undefined
function check(prompt: string, out: Img) {
  const cell = extractCell({ key: 'rest/south/0', call: 0, base: body, out, route: 'green', band: { x: 0, y: 0, w, h: w } })
  // the keyframe gates evaluateItem runs before this check (G4 when nothing survives extraction)
  const g1 = new Map<number, string>(cell.area ? [] : [[0, 'G4 keyframe rest/south/0: item missing']])
  return { key: measuredKeyCollision(prompt, 'green', [cell], [{ k: 0, key: 'rest/south/0', out }], g1), note: g1.get(0) ?? '' }
}

test('armor the model colors green without the word green is flagged, and Try again gets a measured key', () => {
  // olive-green shades lean toward the key; the brightest one matches it and is lost as background
  const r = check('goblin armor', dressed('green', torso([[90, 120, 80], [70, 100, 60], [120, 160, 60], [60, 140, 50]])))
  expect(r.key).toBe('magenta')
  expect(r.note).toMatch(/^K1 keyframe rest\/south\/0: \d+ % of the item's colors lean toward the bright green background, so parts may be missing$/)
  expect(plainReason(r.note)).toBe('Some of the item\'s colors are close to the bright green background, so parts may be missing')
})

test('an item clear of the key keeps its key and gets no note', () => {
  const r = check('a red tunic', dressed('green', torso([[150, 34, 38], [190, 50, 50], [110, 20, 25]])))
  expect(r).toEqual({ key: undefined, note: '' })
})

test('an item drawn entirely in the key color vanishes, and Try again still gets a measured key', () => {
  const r = check('goblin armor', dressed('green', torso([[60, 140, 50], [40, 110, 35], [90, 170, 70]])))
  expect(r.key).toBe('magenta')
  expect(r.note).toBe('G4 keyframe rest/south/0: item missing')
})

test('a very dark green-tinted shade does not count as near the key', () => {
  // black leather with a green cast: ratio scores look near-key, but no item color is lost
  const r = check('black leather armor', dressed('green', torso([[24, 49, 12], [30, 44, 22], [20, 38, 18]])))
  expect(r).toEqual({ key: undefined, note: '' })
})
