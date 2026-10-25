import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { chromaLayer, keyOutside, keyScore, KT, KEY_NAME, pickKey, switchTo, toChroma } from '../../src/lib/image/chroma.ts'
import { itemRoute } from '../../src/lib/items/items.ts'
import fixture from '../fixtures/stripes-keys.json'

// Round 2 (docs/research/generation-quality-round2-2026-10-25.md, arm Z): green + purple had no safe key. Purples score as magenta
// and blue key, so magenta removed the purple stripes while every gate passed. Azure (hue 210°, the green ramp rotated +90°)
// kept purple exactly on 6/6 dress sets. It is extracted as measured: rotate −90°, the green code, rotate the layer back.
function decode(im: { w: number; h: number; runs: number[][] }): Img {
  const out = makeImg(im.w, im.h)
  for (const [start, length, ...rgba] of im.runs) for (let p = start; p < start + length; p++) out.data.set(rgba, p * 4)
  return out
}
// independent reference rotation (HSV), as the round-2 harness used
function rot(r: number, g: number, b: number, deg: number): number[] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  if (!d) return [r, g, b]
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (((h * 60 + deg) % 360) + 360) % 360
  const x = d * (1 - Math.abs(((h / 60) % 2) - 1))
  const [R, G, B] = h < 60 ? [d, x, 0] : h < 120 ? [x, d, 0] : h < 180 ? [0, d, x] : h < 240 ? [0, x, d] : h < 300 ? [x, 0, d] : [d, 0, x]
  return [Math.round(R + mn), Math.round(G + mn), Math.round(B + mn)]
}
const rotate = (im: Img, deg: number): Img => { const d = new Uint8ClampedArray(im.data); for (let i = 0; i < d.length; i += 4) if (d[i + 3]) d.set(rot(d[i], d[i + 1], d[i + 2], deg), i); return { ...im, data: d } }
const purple = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d / mx < 0.3 || mx < 51) return false; const h = (mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; return h >= 250 && h <= 320 }

test('azure is picked only for green with purple, violet or indigo', () => {
  for (const p of ['a green and purple striped tunic', 'a green and violet mage hood', 'an emerald and indigo sash']) expect(pickKey(p)).toBe('azure')
  expect(pickKey('a green and pink jester hat')).toBe('blue')
  expect(pickKey('a green, purple and blue cloak')).toBe('magenta') // nothing is safe: the old fallback
  expect(pickKey('a steel helmet')).toBe('green')
  // purple-family words reach azure too (orchid 47, plum 45, grape 39 score as magenta key); "sky" only as a word
  for (const p of ['a green and plum cloak', 'a jade and orchid kimono', 'a green and grape tunic', 'a mint and lavender scarf', 'a dusky green and violet cloak']) expect(pickKey(p)).toBe('azure')
  expect(pickKey('a green and violet cape with a sky pattern')).toBe('magenta')
})

test('a G2 collision switches to the next key the prompt allows, in pickKey order', () => {
  expect(switchTo('an iron helmet', 'green')).toBe('magenta')
  expect(switchTo('a purple wizard hat', 'green')).toBe('azure') // green <-> magenta only could not switch at all
  expect(switchTo('a green hood', 'magenta')).toBe('blue')
  expect(switchTo('a green and purple striped tunic', 'azure')).toBeUndefined()
})

test('the azure ramp is the green ramp rotated to 210° and every step is key', () => {
  const B = makeImg(4, 4)
  for (let p = 0; p < 16; p++) B.data.set([200 - p * 8, 150 - p * 5, 120 - p * 4, 255], p * 4)
  const K = toChroma(B, 'azure'), G = toChroma(B, 'green')
  for (let p = 0; p < 16; p++) {
    const [r, g, b] = K.data.subarray(p * 4, p * 4 + 3)
    expect(Math.abs(g - (r + b) / 2)).toBeLessThanOrEqual(1)
    expect([r, g, b]).toEqual(rot(G.data[p * 4], G.data[p * 4 + 1], G.data[p * 4 + 2], 90))
    expect(keyScore('azure', r, g, b)).toBeGreaterThanOrEqual(KT)
  }
  for (const c of [[60, 160, 70], [80, 200, 120], [128, 0, 128], [138, 43, 226], [75, 0, 130], [230, 180, 140], [150, 150, 160], [220, 180, 60]]) expect(keyScore('azure', c[0], c[1], c[2])).toBeLessThan(KT)
})

test('real striped tunic: azure keeps the purple stripes exactly, magenta loses them', () => {
  const base = decode(fixture.base), az = decode(fixture.azure), mg = decode(fixture.magenta)
  const a = chromaLayer(az, 'azure', base), m = chromaLayer(mg, 'magenta', base)
  const ref = chromaLayer(rotate(az, -90), 'green', base)
  expect([...a.mask]).toEqual([...ref.mask]) // the measured method
  expect(keyOutside(base, az, 'azure', KT, a.mask)).toBe(0)
  let n = 0, kept = 0
  for (let p = 0; p < a.mask.length; p++) { const q = p * 4; if (az.data[q + 3] < 128 || !purple(az.data[q], az.data[q + 1], az.data[q + 2])) continue; n++; if (a.mask[p] && [0, 1, 2].every((c) => Math.abs(a.layer.data[q + c] - az.data[q + c]) <= 24)) kept++ }
  expect(n).toBeGreaterThan(20)
  expect(kept / n).toBeGreaterThanOrEqual(0.9)
  let mPurple = 0; for (let p = 0; p < m.mask.length; p++) { const q = p * 4; if (m.mask[p] && purple(m.layer.data[q], m.layer.data[q + 1], m.layer.data[q + 2])) mPurple++ }
  expect(mPurple).toBeLessThan(kept / 4)
})

test('requests name the azure key', () => {
  expect(KEY_NAME.azure).toBe('bright azure blue')
  const req = itemRoute.pose({ keyframePngB64: 'x', rest: [], poses: [[], [], []], item: 'a tunic', slot: 'torso_outer', key: 'azure', anim: 'walk', dir: 'south', seed: 1, cell: { w: 64, h: 64 } }) as { body: { description: string } }
  expect(req.body.description).toContain('solid bright azure blue mannequin')
})
