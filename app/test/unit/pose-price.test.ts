import { expect, test } from 'vitest'
import { poseCallGens, poseGensFor } from '../../src/lib/rig/clips.ts'

// Round 4 measured 3 gens for a 12-frame pose call; two estimates still charged 4 above 8 frames.
test('one pose price everywhere', () => {
  expect([1, 3, 4, 8, 12, 13, 15].map(poseCallGens)).toEqual([2, 2, 3, 3, 3, 4, 4])
  expect(poseGensFor(12)).toBe(3)
  expect(poseGensFor(16)).toBe(6)
})
