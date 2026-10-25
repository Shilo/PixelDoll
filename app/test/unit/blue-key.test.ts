import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { chromaLayer, keyOutside, keyScore, KT, pickKey, toChroma, despill, KEY_NAME } from '../../src/lib/image/chroma.ts'
import { extractCell, itemRoute } from '../../src/lib/items/items.ts'
import fixture from '../fixtures/jester-keys.json'

// Campaign 2026-10-25 (docs/research/generation-quality-campaign-2026-10-25.md, arm K): a prompt naming both a green and a
// red/pink/purple hue had no safe key. pickKey fell back to magenta and keyed out the pink parts (G3 fails on every frame; blind
// judges preferred the blue key 3/4 on body A and it passed every gate on body B). Blue is used only when green and magenta collide.
function decode(im: { w: number; h: number; runs: number[][] }): Img {
  const out = makeImg(im.w, im.h)
  for (const [start, length, ...rgba] of im.runs) for (let p = start; p < start + length; p++) out.data.set(rgba, p * 4)
  return out
}
const pinkGreen = (L: Img) => { let pink = 0, green = 0; for (let i = 0; i < L.data.length; i += 4) { if (!L.data[i + 3]) continue; const [r, g, b] = L.data.subarray(i, i + 3); if (r > g + 40 && b > g) pink++; if (g > r + 30 && g > b + 30) green++ } return { pink, green } }

test('blue is picked only when green and magenta both collide', () => {
  expect(pickKey('a green and pink jester hat')).toBe('blue')
  expect(pickKey('a red and green holly tunic')).toBe('blue')
  expect(pickKey('an emerald cloak')).toBe('magenta')
  expect(pickKey('a navy and emerald scarf')).toBe('magenta')
  expect(pickKey('a red cape')).toBe('green')
  expect(pickKey('a blue and red banner')).toBe('green')
  expect(pickKey('a red, green and blue harlequin hat')).toBe('magenta') // nothing is safe: the old behavior
})

// round 2 added azure for exactly these prompts (azure-key.test.ts); blue must still never be picked for them
test('purple shades score as blue key, so green-and-purple items never get blue', () => {
  for (const c of [[138, 43, 226], [75, 0, 130], [90, 40, 140]]) expect(keyScore('blue', c[0], c[1], c[2])).toBeGreaterThanOrEqual(KT) // blueviolet, indigo, dark purple
  for (const p of ['a green and violet robe', 'a green and purple wizard hat', 'an emerald and indigo sash']) expect(pickKey(p)).toBe('azure')
})

test('the blue ramp is key and common item colors are not', () => {
  const B = makeImg(4, 4)
  for (let p = 0; p < 16; p++) B.data.set([200 - p * 8, 150 - p * 5, 120 - p * 4, 255], p * 4)
  const K = toChroma(B, 'blue')
  for (let p = 0; p < 16; p++) expect(keyScore('blue', K.data[p * 4], K.data[p * 4 + 1], K.data[p * 4 + 2])).toBeGreaterThanOrEqual(KT)
  for (const c of [[230, 90, 160], [60, 160, 70], [170, 120, 60], [20, 20, 22], [220, 200, 60]]) expect(keyScore('blue', c[0], c[1], c[2])).toBeLessThan(KT)
  // round 3: a tinted px first loses the key excess and snaps to a clean color within 40; the blue-tinted pink edge is 80 from
  // the core, so the luminance rule decides as before and it snaps to the item's own core color, like the near-core px
  const spill = despill({ w: 3, h: 1, data: new Uint8ClampedArray([230, 90, 160, 255, 150, 80, 200, 255, 195, 88, 225, 255]) }, 'blue')
  expect([...spill.data.slice(4, 7)]).toEqual([230, 90, 160])
  expect([...spill.data.slice(8, 11)]).toEqual([230, 90, 160])
  // lightly tinted blue-gray steel de-spilled to gray never takes a saturated item color (steel turned purple on azure)
  const steel = despill({ w: 2, h: 1, data: new Uint8ClampedArray([120, 40, 160, 255, 100, 108, 135, 255]) }, 'azure')
  expect(Math.max(...steel.data.slice(4, 7)) - Math.min(...steel.data.slice(4, 7))).toBeLessThan(16)
})

test('real jester outputs: magenta keys out the pink half, blue keeps both colors', () => {
  const base = decode(fixture.base), mOut = decode(fixture.magenta), bOut = decode(fixture.blue)
  const m = chromaLayer(mOut, 'magenta', base), b = chromaLayer(bOut, 'blue', base)
  expect(keyOutside(base, mOut, 'magenta', KT, m.mask)).toBeGreaterThan(0.1)
  expect(keyOutside(base, bOut, 'blue', KT, b.mask)).toBe(0)
  const pm = pinkGreen(m.layer), pb = pinkGreen(b.layer)
  expect(pb.pink).toBeGreaterThan(40)
  expect(pb.green).toBeGreaterThan(40)
  expect(pm.pink).toBeLessThan(pb.pink / 2)
})

test('blue extraction equals the measured one: the green code on G/B-swapped channels', () => {
  const swap = (im: Img): Img => { const d = new Uint8ClampedArray(im.data); for (let i = 0; i < d.length; i += 4) { d[i + 1] = im.data[i + 2]; d[i + 2] = im.data[i + 1] } return { ...im, data: d } }
  const base = decode(fixture.base), out = decode(fixture.blue)
  const blue = chromaLayer(out, 'blue', base), green = chromaLayer(swap(out), 'green', base)
  expect([...blue.mask]).toEqual([...green.mask])
  expect([...blue.layer.data]).toEqual([...swap(green.layer).data])
  for (const posed of [false, true]) {
    const band = { x: 0, y: 0, w: base.w, h: base.h }
    const b = extractCell({ key: 'rest/south/0', call: 0, base, out, route: 'blue', band, posed }), g = extractCell({ key: 'rest/south/0', call: 0, base, out: swap(out), route: 'green', band, posed })
    expect([b.area, b.keyKept, b.keyLost, b.keyOutside, b.specks, b.pinholes, b.stray, b.outBand]).toEqual([g.area, g.keyKept, g.keyLost, g.keyOutside, g.specks, g.pinholes, g.stray, g.outBand])
    expect([...b.mask]).toEqual([...g.mask])
  }
})

test('requests name the blue key', () => {
  expect(KEY_NAME.blue).toBe('bright blue')
  const req = itemRoute.pose({ keyframePngB64: 'x', rest: [], poses: [[], [], []], item: 'a jester hat', slot: 'head', key: 'blue', anim: 'walk', dir: 'south', seed: 1, cell: { w: 64, h: 64 } }) as { body: { description: string } }
  expect(req.body.description).toContain('solid bright blue mannequin')
})
