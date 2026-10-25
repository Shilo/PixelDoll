import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { expectPixels } from './pixels.ts'

test('expectPixels fails on one changed byte or a size change, like toEqual', () => {
  const a = makeImg(4, 4), b = makeImg(4, 4)
  expectPixels(a, b)
  b.data[37] = 1
  expect(() => expectPixels(a, b)).toThrow(/byte 37/)
  expect(() => expectPixels(a, makeImg(4, 5))).toThrow(/size/)
  expect(() => expectPixels(undefined, a)).toThrow()
  expect(() => expectPixels(a, null)).toThrow()
  expectPixels(null, null)
})
