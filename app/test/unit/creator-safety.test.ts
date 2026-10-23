import { expect, test } from 'vitest'
import { managedPose } from '../../src/studio/create.ts'
import { clipQa } from '../../src/lib/rig/clips.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import type { Keypoint } from '../../src/lib/rig/rig.ts'

const points = () => LABELS.map(label => ({ label, x: 0.5, y: 0.5 }))
const reference = () => Object.fromEntries(points().map(({ label, x, y }) => [label, { x, y }]))
const frame = () => {
  const image = makeImg(64, 64)
  for (let y = 10; y < 60; y++) for (let x = 25; x < 35; x++) image.data.set([100, 80, 60, 255], (y * 64 + x) * 4)
  return image
}

test('managed references preserve zero/boundary coordinates and canonical joint order without mutating the response', () => {
  const input = reference()
  input.NOSE = { x: 0, y: 1 }
  input.NECK = { x: 0.123456, y: 0.654321 }
  const output = managedPose(input)!
  expect(output.map(point => point.label)).toEqual(LABELS)
  expect(output[0]).toEqual({ label: 'NOSE', x: 0, y: 1 })
  expect(output[1]).toEqual({ label: 'NECK', x: 0.1235, y: 0.6543 })
  expect(input.NECK).toEqual({ x: 0.123456, y: 0.654321 })
})

test.each([undefined, null, '0.5', NaN, Infinity, -Infinity, -0.00001, 1.00001])('malformed managed x coordinate %s requests estimator fallback instead of coercion or clamping', x => {
  const input = reference()
  input.NOSE = { x, y: 0.5 } as unknown as { x: number; y: number }
  expect(managedPose(input)).toBeUndefined()
})

test('missing managed reference, joint or y coordinate requests estimator fallback', () => {
  expect(managedPose()).toBeUndefined()
  expect(managedPose({})).toBeUndefined()
  const missing = reference(); delete missing.NOSE
  expect(managedPose(missing)).toBeUndefined()
  const invalid = reference(); invalid.NOSE = { x: 0.5 } as { x: number; y: number }
  expect(managedPose(invalid)).toBeUndefined()
})

test('complete measurements of every nonempty frame pass the observation gate', () => {
  const rest = frame(), measured = [points(), points(), points()]
  expect(clipQa({ anim: 'walk', rest, frames: [rest, rest, rest], requested: measured, measured, stray: 0 }).fails).toEqual([])
})

test('one unmeasured output frame fails even when the other frames exactly match their requested poses', () => {
  const rest = frame(), requested = [points(), points(), points()]
  const result = clipQa({ anim: 'walk', rest, frames: [rest, rest, rest], requested, measured: [points(), undefined, points()], stray: 0 })
  // A mean over only the available arms must not masquerade as complete pose adherence.
  expect(result.adherence).toBeNull()
  expect(result.fails).toContain('missing or invalid frame joints')
})

test('entirely missing measurements are unscorable rather than infinite pose error', () => {
  const rest = frame(), requested = [points(), points(), points()]
  const result = clipQa({ anim: 'walk', rest, frames: [rest, rest, rest], requested, measured: [undefined, undefined, undefined], stray: 0 })
  expect(result.adherence).toBeNull()
  expect(result.fails).toContain('missing or invalid frame joints')
  expect(result.fails.some(failure => failure.includes('Infinity'))).toBe(false)
})

test('missing leg joints and out-of-range measurements fail independently of arm adherence', () => {
  const rest = frame(), requested = [points()]
  for (const measured of [points().filter(point => point.label !== 'LEFT LEG'), points().map(point => point.label === 'LEFT LEG' ? { ...point, y: 1.01 } : point)]) {
    const result = clipQa({ anim: 'walk', rest, frames: [rest], requested, measured: [measured], stray: 0 })
    expect(result.adherence).toBeNull()
    expect(result.fails).toContain('missing or invalid frame joints')
  }
})

test.each([2, 4])('a measurement count of %i cannot validate three output frames', count => {
  const rest = frame(), requested = [points(), points(), points()]
  const result = clipQa({ anim: 'walk', rest, frames: [rest, rest, rest], requested, measured: Array.from({ length: count }, points), stray: 0 })
  expect(result.adherence).toBeNull()
  expect(result.fails).toContain('missing or invalid frame joints')
})

test.each([0, 2, 4])('a requested pose count of %i cannot validate three output frames', count => {
  const rest = frame(), measured = [points(), points(), points()]
  const result = clipQa({ anim: 'walk', rest, frames: [rest, rest, rest], requested: Array.from({ length: count }, points), measured, stray: 0 })
  expect(result.adherence).toBeNull()
  expect(result.fails).toContain('requested pose count does not match frames')
})

test('empty animation art fails even if the estimator incorrectly claims perfectly matching joints', () => {
  const rest = frame(), measured = [points(), points(), points()]
  const result = clipQa({ anim: 'walk', rest, frames: [rest, makeImg(64, 64), rest], requested: measured, measured, stray: 0 })
  expect(result.adherence).toBe(0)
  expect(result.fails).toContain('empty animation frame')
  const empty = clipQa({ anim: 'walk', rest, frames: [], measured: [] as Keypoint[][], stray: 0 })
  expect(empty.fails).toContain('empty animation frame')
})
