import { expect, test } from 'vitest'
import { chromaMask, dropKeyOutline, toChroma } from '../../src/lib/image/chroma.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'

// A 16 px torso of one skin color with a black outline ring, keyed green, with a 1 px strap painted across it. The rim
// guard must treat a light strap the same whatever the skin tone.
const w = 16
function strapKept(skin: number[]) {
  const B = makeImg(w, w)
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const ring = x === 2 || y === 2 || x === 13 || y === 13
    B.data.set(ring ? [10, 8, 8, 255] : [...skin, 255], (y * w + x) * 4)
  }
  const C = toChroma(B, 'green')
  for (let x = 3; x < 13; x++) C.data.set([112, 72, 40, 255], (9 * w + x) * 4) // brown strap at row 9
  const kept = dropKeyOutline(chromaMask(C, 'green'), B, C, 'green')
  let n = 0; for (let x = 3; x < 13; x++) n += kept[9 * w + x]
  return n
}

test('a thin strap over deep skin keeps as many px as over light skin', () => {
  const light = strapKept([224, 172, 130]), deep = strapKept([70, 44, 34]) // deep: mean RGB 49, under the old fixed 60
  expect(light).toBe(10)
  expect(deep).toBe(light)
})

// A light body (or dark clothing) with a vertical seam at x = 7, keyed green, the seam's generated px replaced by `out`.
function seamKept(fill: number[], seam: number[], out: number[]) {
  const B = makeImg(w, w) as Img
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) B.data.set([...(x === 7 ? seam : fill), 255], (y * w + x) * 4)
  const C = toChroma(B, 'green')
  for (let y = 3; y < 13; y++) C.data.set([...out, 255], (y * w + 7) * 4)
  const m = chromaMask(C, 'green'), kept = dropKeyOutline(m, B, C, 'green')
  let before = 0, after = 0; for (let y = 3; y < 13; y++) { before += m[y * w + 7]; after += kept[y * w + 7] }
  expect(before).toBe(10)
  return after
}

test('a provider-redrawn seam beside the key is still dropped', () => {
  expect(seamKept([224, 172, 130], [10, 8, 8], [48, 46, 11])).toBe(0) // near-black seam, olive redraw
  expect(seamKept([224, 172, 130], [40, 30, 30], [140, 150, 60])).toBe(0) // a lighter seam is still a line: the contrast test
  // dark clothing stays guarded against dark redraws (2026-11-07 review: 29,31,44 seam inside 50,56,70 shorts)
  expect(seamKept([50, 56, 70], [29, 31, 44], [48, 46, 11])).toBe(0)
  expect(seamKept([50, 56, 70], [50, 56, 70], [27, 40, 4])).toBe(0)
})
