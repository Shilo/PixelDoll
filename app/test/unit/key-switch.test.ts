import { expect, test, vi } from 'vitest'
import { rerollCall, type Draft } from '../../src/lib/items/run.ts'

vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { subscribe: () => () => {} } }))

// Color collisions are observations. Only an explicit player action may invalidate a paid batch; it never changes the key.
const draft = (): Draft => ({
  spec: { id: 'helmet', name: 'Helmet', slot: 'head', prompt: 'an iron helmet', key: 'green', anims: ['walk'], dirs: ['south', 'east'], method: 'skel' }, rigId: 'rig', log: [],
  calls: [
    { kind: 'dress', cells: ['rest/south/0'], seed: 1, recId: 'd1', old: [], rerolls: 0 },
    { kind: 'dress', cells: ['rest/east/0'], seed: 2, recId: 'd2', old: [], rerolls: 0 },
    { kind: 'pose', cells: ['walk/south/0'], seed: 3, recId: 'p1', old: [], rerolls: 0 },
    { kind: 'grid', cells: ['walk/east/0'], seed: 4, recId: 'g1', old: [], rerolls: 0 },
  ],
})

test('an explicit failed-pose retry invalidates only that batch and keeps its original key and paid history', () => {
  const d = draft(), other = structuredClone(d.calls.filter((_, i) => i !== 2))
  rerollCall(d, 2, 'player requested one additional attempt after G2')
  expect(d.spec.key).toBe('green')
  expect(d.calls[2]).toMatchObject({ kind: 'pose', recId: undefined, old: ['p1'], rerolls: 1 })
  expect(d.calls.filter((_, i) => i !== 2)).toEqual(other)
  expect(d.log).toHaveLength(1)
})

test('an explicit first-design retry invalidates dependent artwork without switching keys', () => {
  const d = draft()
  rerollCall(d, 0, 'player requested a new design after G3')
  expect(d.spec.key).toBe('green')
  expect(d.calls.map(c => c.recId)).toEqual([undefined, undefined, undefined, undefined])
  expect(d.calls.map(c => c.old)).toEqual([['d1'], ['d2'], ['p1'], ['g1']])
  expect(d.calls.map(c => c.rerolls)).toEqual([1, 0, 0, 0])
  expect(d.calls[3].kind).toBe('grid')
})

test('an explicit later dress retry invalidates only its dependent direction and preserves unrelated results', () => {
  const d = draft(), southDesign = structuredClone(d.calls[0]), southPose = structuredClone(d.calls[2])
  rerollCall(d, 1, 'player requested another east design')
  expect(d.calls[0]).toEqual(southDesign); expect(d.calls[2]).toEqual(southPose)
  expect(d.calls[1]).toMatchObject({ recId: undefined, old: ['d2'], rerolls: 1 })
  expect(d.calls[3]).toMatchObject({ kind: 'grid', recId: undefined, old: ['g1'], rerolls: 0 })
  expect(d.spec.key).toBe('green')
})

test('each additional grid invalidation requires a separate explicit action and retains every paid record', () => {
  const d = draft()
  rerollCall(d, 3, 'first player click')
  expect(d.calls[3]).toMatchObject({ kind: 'grid', old: ['g1'], rerolls: 1 })
  d.calls[3].recId = 'g2'
  rerollCall(d, 3, 'second player click')
  expect(d.calls[3]).toMatchObject({ kind: 'grid', recId: undefined, old: ['g1', 'g2'], rerolls: 2 })
  expect(d.log).toHaveLength(2); expect(d.spec.key).toBe('green')
})
