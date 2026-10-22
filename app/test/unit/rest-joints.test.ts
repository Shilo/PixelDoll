import { afterEach, expect, test, vi } from 'vitest'
import { checkedKeypoints, createCharacter, joints, managedRestKeypoints } from '../../src/studio/create.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { DIRECTIONS, type Keypoint } from '../../src/lib/rig/rig.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'

afterEach(() => vi.restoreAllMocks())
const valid = (): Keypoint[] => LABELS.map((label, i) => ({ label, x: 0.25 + i * 0.01, y: 0.3 + i * 0.02 }))
const reference = (points = valid()) => ({ keypoints: Object.fromEntries(points.map(({ label, x, y }) => [label, { x, y }])) })

test('valid normalized measurements can be reordered and rounded without mutating the originals', () => {
  const raw = valid().reverse(), before = structuredClone(raw)
  raw[0].x = 0.99996
  before[0].x = raw[0].x
  const out = checkedKeypoints(raw)!
  expect(out.map((p) => p.label)).toEqual(LABELS)
  expect(out.find((p) => p.label === raw[0].label)?.x).toBe(1)
  expect(raw).toEqual(before)
})

test.each([null, '0.5', NaN, Infinity, -Infinity, -0.00004, 1.00004, 32])('unrounded invalid coordinate %s is rejected in both measurement and managed-reference paths', (bad) => {
  const raw = valid() as unknown as { label: string; x: unknown; y: unknown }[]
  raw[0].x = bad
  expect(checkedKeypoints(raw)).toBeUndefined()
  const ref = reference()
  ;(ref.keypoints[LABELS[0]] as { x: unknown }).x = bad
  expect(() => managedRestKeypoints({ east: ref }, ['south', 'east'])).toThrow('east')
})

test.each([
  () => [...valid(), valid()[0]],
  () => [...valid().slice(1), valid()[1]],
  () => valid().map((p, i) => i ? p : { ...p, label: 'UNKNOWN' }),
  () => valid().slice(1),
])('raw estimator cannot hide duplicate, unknown, extra or missing labels through reordering', (make) => {
  expect(checkedKeypoints(make())).toBeUndefined()
})

test('wholly absent managed references keep the explicit fallback, present incomplete references fail preflight', () => {
  expect(managedRestKeypoints(undefined, ['south', 'east'])).toEqual({})
  expect(managedRestKeypoints(null, ['south', 'east'])).toEqual({})
  for (const unavailable of [null, undefined, {}, { keypoints: null }, { keypoints: undefined }]) expect(managedRestKeypoints({ east: unavailable }, ['south', 'east'])).toEqual({})
  for (const root of ['bad', []]) expect(() => managedRestKeypoints(root, ['south', 'east'])).toThrow('south')
  expect(managedRestKeypoints({ east: reference() }, ['south', 'east']).south).toBeUndefined()
  for (const ref of ['bad', [], { keypoints: {} }, { keypoints: [] }, { keypoints: 'bad' }, reference(valid().slice(1))])
    expect(() => managedRestKeypoints({ east: ref }, ['south', 'east'])).toThrow('east')
  const malformedJoint = reference(); (malformedJoint.keypoints as Record<string, unknown>)['RIGHT ARM'] = null
  expect(() => managedRestKeypoints({ east: malformedJoint }, ['south', 'east'])).toThrow('east')
})

test('joints validates actual raw API output before rounding a just-outside coordinate into range', async () => {
  const raw = valid(); raw[0].x = 1.00004
  const enqueue = vi.spyOn(queue, 'enqueue').mockResolvedValue({ state: 'done', response: { keypoints: raw } } as JobRec)
  await expect(joints(makeImg(64, 64))).resolves.toBeUndefined()
  expect(enqueue).toHaveBeenCalledOnce()
  expect(enqueue.mock.calls[0][0].path).toBe('/estimate-skeleton')
})

test.each(['bad-east', 'missing-south', 'null-skeletons', 'null-references'] as const)('present references are checked before the bounded missing-view fallback: %s', async (mode) => {
  const invalidEast = mode === 'bad-east'
  vi.spyOn(db, 'get').mockResolvedValue(undefined)
  const im = makeImg(48, 48)
  for (let y = 8; y < 44; y++) for (let x = 20; x < 27; x++) im.data.set([170, 120, 90, 255], (y * 48 + x) * 4)
  const blob = new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
  vi.spyOn(db, 'getBlob').mockResolvedValue(blob)
  const east = reference(); if (invalidEast) east.keypoints['RIGHT ARM'].x = 1.00004
  const refs = { east, north: reference(), west: reference() } // south is absent but must not trigger an estimate before east is checked
  const skeletons = mode === 'null-skeletons' ? null : { '2d_references': mode === 'null-references' ? null : refs }
  const enqueue = vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
    if (req.path === '/create-character-v3' && !(req.body as { reference_image?: unknown }).reference_image)
      return { state: 'done', jobs: [{ results: DIRECTIONS.map((label) => ({ label, sha: label })) }] } as JobRec
    if (req.path === '/create-character-v3') return { state: 'done', response: { character_id: 'managed-fixture' }, jobs: [] } as unknown as JobRec
    if (req.path === '/characters/managed-fixture') return { state: 'done', response: { skeletons }, jobs: [] } as unknown as JobRec
    if (req.path === '/estimate-skeleton') { const raw = valid(); raw[0].x = 1.00004; return { state: 'done', response: { keypoints: raw }, jobs: [] } as unknown as JobRec }
    throw new Error('Unexpected paid request after bad managed joints')
  })
  await expect(createCharacter({ name: 'Fixture', description: 'body', seed: 1, size: 48, dirs: 4, directionPolicy: 'independent', projectId: 'rig-rest-validation' })).rejects.toThrow(invalidEast ? 'east' : 'south')
  expect(enqueue.mock.calls.map(([r]) => r.path)).toEqual(['/create-character-v3', '/create-character-v3', '/characters/managed-fixture', ...(!invalidEast ? ['/estimate-skeleton'] : [])])
})
