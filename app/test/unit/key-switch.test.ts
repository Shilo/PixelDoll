import { expect, test, vi } from 'vitest'
import { MAX_REROLLS, retry, type Draft } from '../../src/lib/items/run.ts'

vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { subscribe: () => () => {} } }))

// Round 3 review: a key/item color collision shows on the dressed keyframe as G3 (key px outside the body), never as G2 (key-
// colored item px count as kept). So only a design-call G3 switches key, at once; G2 and posed failures re-roll, then go to review.
const draft = (prompt = 'an iron helmet'): Draft => ({
  spec: { id: 'helmet', name: 'Helmet', slot: 'head', prompt, key: 'green', anims: ['walk'], dirs: ['south'], method: 'skel' }, rigId: 'rig', keySwitched: false, log: [],
  calls: [
    { kind: 'dress', cells: ['rest/south/0'], seed: 1, recId: 'd1', old: [], rerolls: 0 },
    { kind: 'pose', cells: ['walk/south/0'], seed: 2, recId: 'p1', old: [], rerolls: 0 },
    { kind: 'grid', cells: ['walk/south/1'], seed: 3, recId: 'g1', old: ['p2'], rerolls: MAX_REROLLS, fallback: { recId: 'p2', fails: 3 } },
  ],
})

test('a design-call G3 switches to the next allowed key at once and restarts every call on it', () => {
  const d = draft()
  expect(retry(d, 0, ['G2 keyframe rest/south/0 key kept 0.960 (9 px); G3 keyframe rest/south/0 key outside 0.050'])).toBe(true)
  expect(d.spec.key).toBe('magenta')
  expect(d.keySwitched).toBe(true)
  expect(d.calls.every((c) => !c.recId && c.rerolls === 0)).toBe(true)
  expect(d.calls[2]).toMatchObject({ kind: 'pose', old: ['p2', 'g1'] }) // the grid's kept pose roll used the old key
  expect(d.calls[2].fallback).toBeUndefined()
})

test('G2 and posed-frame failures re-roll on the same key, then go to review without a switch', () => {
  const d = draft()
  for (let i = 0; i < MAX_REROLLS; i++) expect(retry(d, 0, ['G2 keyframe rest/south/0 key kept 0.940 (20 px)'])).toBe(true)
  expect(retry(d, 0, ['G2 keyframe rest/south/0 key kept 0.940 (20 px)'])).toBe(false)
  for (let i = 0; i < MAX_REROLLS; i++) retry(d, 1, ['G3 walk/south/0 key outside 0.090'])
  expect(retry(d, 1, ['G3 walk/south/0 key outside 0.090'])).toBe(false)
  expect(d.spec.key).toBe('green')
  expect(d.keySwitched).toBe(false)
})

test('a collision with no other allowed key re-rolls instead, and a key switches only once', () => {
  const none = draft('a green, red, blue and purple banner') // every key collides: the magenta fallback has nowhere to go
  none.spec.key = 'magenta'
  expect(retry(none, 0, ['G3 keyframe rest/south/0 key outside 0.050'])).toBe(true)
  expect(none.spec.key).toBe('magenta')
  expect(none.calls[0].rerolls).toBe(1)
  const once = draft()
  retry(once, 0, ['G3 keyframe rest/south/0 key outside 0.050'])
  retry(once, 0, ['G3 keyframe rest/south/0 key outside 0.050'])
  expect(once.spec.key).toBe('magenta')
  expect(once.calls[0].rerolls).toBe(1)
})

test('re-rolling the design call drops every later call (their keyframes came from the old design)', () => {
  const d = draft()
  retry(d, 0, ['D1 keyframe rest/south/0: 30 % gray smudges in a colorful design'])
  expect(d.calls.map((c) => c.recId)).toEqual([undefined, undefined, undefined])
  expect(d.calls[1].old).toEqual(['p1'])
})
