import { expect, test } from 'vitest'
import { chromaMask, dropKeyOutline, toChroma } from '../../src/lib/image/chroma.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'

// A 16 px torso of one skin color with a black outline ring, keyed green, with a 1 px strap painted across it. The rim
// guard must treat a strap the same whatever the skin tone.
const w = 16
function strapKept(skin: number[], strap = [112, 72, 40], key: 'green' | 'magenta' = 'green') {
  const B = makeImg(w, w)
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const ring = x === 2 || y === 2 || x === 13 || y === 13
    B.data.set(ring ? [10, 8, 8, 255] : [...skin, 255], (y * w + x) * 4)
  }
  const C = toChroma(B, key)
  for (let x = 3; x < 13; x++) C.data.set([...strap, 255], (9 * w + x) * 4) // strap at row 9
  const kept = dropKeyOutline(chromaMask(C, key), B, C, key)
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

test('a dark 1 px strap over deep skin is kept on the green key; scattered or key-leaning dark redraws are not', () => {
  const BLACK = [40, 34, 36], DEEP = [70, 44, 34]
  // before 2026-11-07 the deep body's midtone counted as outline under any dark px: 0 of 10 kept (LPC study: 32 % on coffee)
  expect(strapKept([224, 172, 130], BLACK)).toBe(10)
  expect(strapKept(DEEP, BLACK)).toBe(10)
  // a straight olive line still reads as a redraw (it leans toward the green key), and so do scattered dark px
  expect(strapKept(DEEP, [48, 46, 11])).toBe(0)
  const B = makeImg(w, w)
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) B.data.set([...DEEP, 255], (y * w + x) * 4)
  const C = toChroma(B, 'green'), dots = [[5, 6], [9, 9], [6, 11]]
  for (const [x, y] of dots) C.data.set([...BLACK, 255], (y * w + x) * 4)
  const kept = dropKeyOutline(chromaMask(C, 'green'), B, C, 'green')
  expect(dots.map(([x, y]) => kept[y * w + x])).toEqual([0, 0, 0])
  // redraw colors were measured on the green key only: other keys keep guarding every dark px over dark skin
  expect(strapKept(DEEP, BLACK, 'magenta')).toBe(0)
})

test('review cases: a shaded deep ramp, a diagonal strap, a short strap, and redraws that borrow item px', () => {
  const BLACK = [40, 34, 36], W = 16
  // a deep skin ramp in three shades (rows), none a line: a horizontal and a diagonal 1 px strap keep every px
  const ramp = [[86, 54, 40], [70, 44, 34], [58, 36, 28]]
  const run = (paint: (C: Img) => number[][], bodyAt = (y: number) => ramp[Math.floor((y - 2) / 4)]) => {
    const B = makeImg(W, W)
    for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) B.data.set([...bodyAt(y), 255], (y * W + x) * 4)
    const C = toChroma(B, 'green'), px = paint(C), kept = dropKeyOutline(chromaMask(C, 'green'), B, C, 'green')
    return px.map(([x, y]) => kept[y * W + x]).reduce((a, b) => a + b, 0)
  }
  const line = (pts: number[][], color = BLACK) => (C: Img) => { for (const [x, y] of pts) C.data.set([...color, 255], (y * W + x) * 4); return pts }
  expect(run(line(Array.from({ length: 10 }, (_, i) => [3 + i, 9])))).toBe(10)
  expect(run(line(Array.from({ length: 8 }, (_, i) => [4 + i, 4 + i])))).toBe(8)
  // a dark item shorter than the 4 px stroke reads like scattered redraw px (accepted cost)
  expect(run(line([[6, 9], [7, 9], [8, 9]]))).toBe(0)
  // two dark gray redraw px beside a light item: the one touching it stays (the guard keeps an item's own edge), but they can
  // no longer borrow the light px to form a stroke, so the other is dropped (2 kept before the stroke counted only dark px)
  expect(run((C) => { line([[4, 9], [5, 9]], [200, 180, 120])(C); return line([[6, 9], [7, 9]], [30, 30, 30])(C) })).toBe(1)
})
