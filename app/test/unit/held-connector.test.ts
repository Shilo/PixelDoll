import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { heldParts } from '../../src/lib/items/items.ts'

// 2026-11-07 counter-review R1: a stylized flail (100 px handle, a 2 px chain link, a 20 px head) with 2 blank columns between
// each part, and the two negative controls the size floor was added for.
const W = 64
const rect = (m: Uint8Array, x: number, y: number, w: number, h: number) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) m[yy * W + xx] = 1 }
const body = (x0: number, x1: number): Img => { const b = makeImg(W, W); for (let y = 10; y < 60; y++) for (let x = x0; x <= x1; x++) b.data.set([180, 130, 100, 255], (y * W + x) * 4); return b }
const kept = (mask: Uint8Array, base: Img) => { const { comps, keep } = heldParts(mask, base); return comps.filter((_, i) => keep[i]).reduce((n, c) => n + c.length, 0) }

test('a thin link connects a held item to its off-body head, at two part sizes', () => {
  // gaps stay 2 px (the attachment distance is 3 px whatever the part size)
  for (const [hw, lh, hdw, hdh] of [[10, 2, 4, 5], [20, 4, 8, 10]]) {
    const m = new Uint8Array(W * W)
    rect(m, 4, 10, hw, hw) // handle
    const lx = 4 + hw + 2; rect(m, lx, 12, 1, lh) // link
    rect(m, lx + 3, 10, hdw, hdh) // head, off the body
    const total = m.reduce((a, b) => a + b, 0)
    expect(kept(m, body(50, 62)), `handle ${hw}`).toBe(total)
  }
})

test('without the link a detached head is still dropped', () => {
  const m = new Uint8Array(W * W)
  rect(m, 4, 10, 10, 10); rect(m, 19, 12, 4, 5)
  expect(kept(m, body(40, 60))).toBe(100)
})

test('a small fleck still cannot pull a buckle drawn on the body into the item', () => {
  const m = new Uint8Array(W * W)
  rect(m, 4, 10, 10, 10) // the item, off the body
  rect(m, 16, 14, 1, 2) // a fleck
  rect(m, 19, 12, 4, 5) // a buckle redrawn on the body (the body covers x 18 to 40)
  expect(kept(m, body(18, 40))).toBe(100)
})
