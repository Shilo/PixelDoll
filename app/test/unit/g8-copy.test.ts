import { expect, test } from 'vitest'
import { plainReason } from '../../src/studio/model.ts'

test.each([
  ['G8 idle/west: hand positions are missing for 4 of 4 frames; set up the character’s pose rig and check this view', 'Hand positions are unavailable; set up the pose rig and check this view (idle, west)'],
  ['G8 idle/west: grip side is unclear (0 right / 0 left frames); check that the item stays in the intended hand', 'The grip side is unclear; check the intended hand (idle, west)'],
  ['G8 idle/west: item is more than 6 px from both hands in 4 of 4 frames; check its grip', 'The grip could not be confirmed; inspect the item at the hand (idle, west)'],
  ['G8 idle/west: handedness not checked', 'Handedness could not be confirmed; inspect the intended hand (idle, west)'],
  ['G8 handedness not checked (no hand anchors: run skeletons in M2)', 'Handedness could not be confirmed; inspect the intended hand'],
  ['G8 grip contact not confirmed', 'The grip could not be confirmed; inspect the item at the hand'],
  ['G8 idle/west: held in the left hand (0 R / 4 L frames)', 'The item may be held in the wrong hand; check the intended hand (idle, west)'],
  ['G8 idle/west: held in the left hand, other clips right', 'The item may change hands between views; check the intended hand (idle, west)'],
  ['G8', 'The item may change hands between views; check the intended hand'],
])('G8 copy preserves the meaning and manual review of %s', (raw, expected) => {
  expect(plainReason(raw)).toBe(expected)
  expect(plainReason(raw)).not.toContain('The item switches hands')
})
