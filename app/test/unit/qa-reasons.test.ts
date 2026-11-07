import { expect, test } from 'vitest'
import { qaReasons } from '../../src/studio/model.ts'
import type { ItemQa, QaSummary } from '../../src/lib/store/manifest.ts'

const clean: QaSummary = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'pass' }
const qa = (clips: Record<string, Partial<QaSummary>>, routes: Record<string, 'posed' | 'ea2'>): ItemQa => {
  const parts = Object.fromEntries(Object.entries(clips).map(([k, v]) => [k, { ...clean, ...v }]))
  const all = Object.values(parts)
  return {
    ...clean, rerolls: 0,
    status: all.some((p) => p.status !== 'pass') ? 'warn' : 'pass',
    maxKeyOutside: Math.max(...all.map((p) => p.maxKeyOutside)), maxAreaCV: Math.max(...all.map((p) => p.maxAreaCV)),
    cells: Object.fromEntries(Object.entries(routes).map(([k, route]) => [k, { route, area: 10 }])) as ItemQa['cells'],
    clips: parts,
  }
}

test('a passing posed move does not list the stricter standing key-outside limit as a reason', () => {
  // 0.04 is inside the posed limit (0.05) but above the dressed-standing limit (0.02); another clip carries the warning.
  const q = qa({ 'walk/south': { maxKeyOutside: 0.04 }, 'default/south': { clipPx: 3, status: 'warn' } }, { 'walk/south/0': 'posed', 'default/south/0': 'ea2' })
  expect(qaReasons(q, false, false)).toEqual(['The item touches the frame edge (may be cut off)'])
})

test('key outside is judged against the limit the clip was gated with', () => {
  const posed = qa({ 'walk/south': { maxKeyOutside: 0.04, status: 'warn' } }, { 'walk/south/0': 'posed' })
  const standing = qa({ 'default/south': { maxKeyOutside: 0.04, status: 'warn' } }, { 'default/south/0': 'ea2' })
  expect(qaReasons(posed, false, false)).toEqual([])
  expect(qaReasons(standing, false, false)).toEqual(['Some body pixels were changed by the model'])
  // A skeleton item's dressed standing view is gated at the posed limit too, so it lists no G3 reason (challenge re-review).
  expect(qaReasons(standing, false, true)).toEqual([])
})

test('actions skip the size check, locomotion does not', () => {
  const slash = qa({ 'slash/east': { maxAreaCV: 0.3, status: 'warn' } }, { 'slash/east/0': 'posed' })
  const walk = qa({ 'walk/east': { maxAreaCV: 0.3, status: 'warn' } }, { 'walk/east/0': 'posed' })
  expect(qaReasons(slash, false, false)).toEqual([])
  expect(qaReasons(walk, false, false)).toEqual(['The item changes size between frames'])
})

test('reasons with the same plain wording are listed once', () => {
  const q = qa({ 'default/south': { minKeyKept: 0.9, maxKeyOutside: 0.1, status: 'fail' } }, { 'default/south/0': 'ea2' })
  expect(qaReasons(q, false, false)).toEqual(['Some body pixels were changed by the model'])
})
