import { expect, test } from 'vitest'
import { clipQa } from '../../src/lib/rig/clips.ts'
import type { Keypoint } from '../../src/lib/rig/rig.ts'
import { makeImg } from '../../src/lib/image/png.ts'

const kp = (lx: number, rx: number): Keypoint[] => [{ label: 'LEFT SHOULDER', x: lx, y: 0.3 }, { label: 'RIGHT SHOULDER', x: rx, y: 0.3 }] as Keypoint[]
test('a front or back clip whose shoulders narrow below half the standing width is reviewed', () => {
  const im = makeImg(8, 8); im.data.fill(255)
  const qa = (frames: Keypoint[][], dir = 'south') => clipQa({ anim: 'slash', rest: im, frames: frames.map(() => im), measured: frames, stray: 0, facing: { dir, rest: kp(0.6, 0.4) } }).warnings.filter((w) => w.startsWith('the body turns'))
  expect(qa([kp(0.6, 0.4), kp(0.58, 0.42)])).toEqual([])
  expect(qa([kp(0.6, 0.4), kp(0.52, 0.48)])).toEqual(['the body turns side-on or falls in frame 2 (shoulders down to 20 % of the standing width); check that it still faces south'])
  expect(qa([kp(0.6, 0.4), kp(0.51, 0.49), kp(0.45, 0.55)])).toEqual(['the body turns away in frames 2, 3 (its shoulders swap sides); check that it still faces south'])
  expect(qa([kp(0.51, 0.49)], 'east')).toEqual([])
})
