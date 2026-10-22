import { expect, test } from 'vitest'
import { adherence, ARMS, hasAll, LABELS } from '../../src/lib/rig/poses.ts'
import { clipQa } from '../../src/lib/rig/clips.ts'
import { cutGrid, packGrid } from '../../src/lib/items/items.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import type { Skeleton } from '../../src/lib/rig/skeleton.ts'

const skeleton = (): Skeleton => Object.fromEntries(ARMS.map((l) => [l, { x: 20, y: 20, z: 0 }]))

test('pose adherence cannot pass by silently omitting missing frames or joints', () => {
  const p = skeleton()
  expect(adherence([p, p], [p, undefined])).toBe(Infinity)
  expect(adherence([p, p], [p])).toBe(Infinity)
  const partial = skeleton()
  delete partial['LEFT ARM']
  expect(adherence([p, p], [p, partial])).toBe(Infinity)
  partial['LEFT ARM'] = { x: NaN, y: 20, z: 0 }
  expect(adherence([p], [partial])).toBe(Infinity)
  expect(adherence([p, p], [p, p])).toBe(0)
})

test('freeze gate reports incomplete pose observations as a failure', () => {
  const rest = makeImg(64, 64)
  rest.data.set([100, 100, 100, 255], (32 * 64 + 32) * 4)
  const poses = [0, 1].map(() => LABELS.map((label) => ({ label, x: 0.5, y: 0.5 })))
  const qa = clipQa({ anim: 'idle', rest, frames: [rest, rest], requested: poses, measured: [poses[0], undefined], stray: 0 })
  expect(qa.fails).toContain('pose measurements incomplete')
})

test('joint sets reject duplicate, unknown, nonfinite and conflicting observations', () => {
  const valid = LABELS.map((label) => ({ label, x: 0.5, y: 0.5 }))
  expect(hasAll(valid)).toBe(true)
  expect(hasAll([...valid, { ...valid[0], x: NaN }])).toBe(false)
  expect(hasAll([...valid.slice(0, -1), valid[0]])).toBe(false)
  expect(hasAll([...valid.slice(0, -1), { label: 'UNKNOWN', x: 0.5, y: 0.5 }])).toBe(false)
  expect(hasAll(valid.map((k, i) => i ? k : { ...k, x: Infinity }))).toBe(false)
})


test('grid extraction rejects cropped or rearranged API layouts before reading cells', () => {
  const cell = makeImg(64, 64)
  cell.data.set([255, 0, 0, 255], 0)
  const grid = packGrid(Array.from({ length: 8 }, () => cell), Array.from({ length: 8 }, () => null)).image
  expect(cutGrid(grid, 8, 64, 64)).toHaveLength(8)
  expect(() => cutGrid(makeImg(128, 256), 8, 64, 64)).toThrow('does not match')
  expect(() => cutGrid(makeImg(256, 64), 8, 64, 64)).toThrow('does not match')
  expect(() => cutGrid(makeImg(256, 129), 8, 64, 64)).toThrow('does not match')
})
