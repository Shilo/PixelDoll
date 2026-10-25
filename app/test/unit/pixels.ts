import { expect } from 'vitest'
import type { Img } from '../../src/lib/image/png.ts'

/** Same check as toEqual on an Img, as one byte compare: toEqual walks typed arrays element by element (seconds per sheet). */
export function expectPixels(actual: Img | null | undefined, expected: Img | null | undefined, label = 'pixels') {
  if (!expected || !actual) return expect(actual, label).toEqual(expected) // empty cells are null
  expect([actual.w, actual.h], `${label} size`).toEqual([expected.w, expected.h])
  expectBytes(actual.data, expected.data, label)
}

export function expectBytes(actual: Uint8ClampedArray, expected: Uint8ClampedArray, label = 'bytes') {
  expect(actual.constructor, `${label} array type`).toBe(expected.constructor)
  const a = Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength), b = Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength)
  if (a.equals(b)) return
  const at = a.findIndex((v, i) => v !== b[i])
  expect.fail(`${label} differ at byte ${at < 0 ? Math.min(a.length, b.length) : at} (lengths ${a.length} and ${b.length})`)
}
