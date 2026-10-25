import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { extractCell, g2Fails } from '../../src/lib/items/items.ts'

// Body renders keep detached effects (skeleton-v3 smoke beside the head; body QA reports them). The item's stand-in is posed from
// the rest view and never has them, so G2 read them as erased body px and failed every item on those frames (round 5).
const W = 32
const put = (im: Img, x: number, y: number, c: number[]) => im.data.set([...c, 255], (y * W + x) * 4)
const body = makeImg(W, W)
for (let y = 6; y < W; y++) for (let x = 10; x < 22; x++) put(body, x, y, [200, 150, 120])
const withSmoke = makeImg(W, W); withSmoke.data.set(body.data)
for (let y = 2; y < 6; y++) for (let x = 24; x < 28; x++) put(withSmoke, x, y, [150, 150, 160]) // 16 px, 2 px from the body
const helmet = (im: Img) => { for (let y = 6; y < 10; y++) for (let x = 10; x < 22; x++) put(im, x, y, [90, 90, 100]) }

test('detached body effects are not counted as erased body px', () => {
  const out = toChroma(body, 'green'); helmet(out)
  const c = extractCell({ key: 'idle/east/1', call: 1, base: withSmoke, out, route: 'green', band: { x: 0, y: 0, w: W, h: 12 }, posed: true, clip: true })
  expect(c.keyKept).toBe(1)
  expect(g2Fails(c)).toBe(false)
})

test('erased px of the body itself still count', () => {
  const out = toChroma(body, 'green'); helmet(out)
  for (let y = 20; y < 26; y++) for (let x = 10; x < 22; x++) out.data.fill(0, (y * W + x) * 4, (y * W + x) * 4 + 4)
  const c = extractCell({ key: 'idle/east/1', call: 1, base: withSmoke, out, route: 'green', band: { x: 0, y: 0, w: W, h: 12 }, posed: true, clip: true })
  expect(g2Fails(c)).toBe(true)
})
