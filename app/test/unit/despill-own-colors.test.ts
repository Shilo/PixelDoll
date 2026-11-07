import { expect, test } from 'vitest'
import { despill, keyScore, KT } from '../../src/lib/image/chroma.ts'

const layer = (colors: number[][]) => ({ w: colors.length, h: 1, data: new Uint8ClampedArray(colors.flatMap((c) => [...c, 255])) })
const rgb = (im: { data: Uint8ClampedArray }) => Array.from({ length: im.data.length / 4 }, (_, i) => [...im.data.slice(i * 4, i * 4 + 3)])

test('green-leaning gear below the key score keeps its exact colors on the green key', () => {
  // A turquoise ramp and a jade trim with a dark outline: every color has a key excess but scores below the key.
  const gear = [[40, 170, 150], [30, 130, 115], [20, 100, 85], [70, 140, 100], [24, 30, 28]]
  for (const c of gear.slice(0, 4)) expect(keyScore('green', c[0], c[1], c[2])).toBeGreaterThan(0)
  for (const c of gear) expect(keyScore('green', c[0], c[1], c[2])).toBeLessThan(KT)
  expect(rgb(despill(layer(gear), 'green'))).toEqual(gear)
})

test('a tint that despills to near-gray still follows the steel-stays-gray rule', () => {
  // (120,136,120) is lightly tinted gray steel; with no gray core within reach it must not keep its green cast.
  const out = rgb(despill(layer([[150, 34, 38], [120, 136, 120]]), 'green'))[1]
  expect(Math.max(...out) - Math.min(...out)).toBeLessThan(16)
})
