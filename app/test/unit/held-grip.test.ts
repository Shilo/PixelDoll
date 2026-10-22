import { expect, test } from 'vitest'
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { CellKey } from '../../src/lib/store/manifest.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

function cell(key: CellKey): CellOut {
  const base = makeImg(64, 64), layer = makeImg(64, 64), mask = new Uint8Array(4096)
  for (let y = 30; y < 33; y++) for (let x = 20; x < 23; x++) { const p = y * 64 + x; mask[p] = 1; layer.data.set([210, 160, 40, 255], p * 4) }
  return { key, call: 0, base, input: base, out: layer, layer, mask, area: 9, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true, keyKept: 1, keyOutside: 0 }
}
function rig(): Rig { return { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }, { id: 'east' }, { id: 'west' }], animations: [{ id: 'idle', cells: 2, loop: true, frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }] }], anchors: { hand_r: { idle: { south: [[21, 31], [21, 31]], west: [[21, 31], [21, 31]] } }, hand_l: { idle: { south: [[45, 31], [45, 31]], west: [[22, 31], [22, 31]] } } } } }
const check = (r: Rig, keys: CellKey[]) => itemQa(r, slotOf('main_hand'), 'green', keys.map(cell), 0)

test('valid overlapping requested wrists warn about ambiguity without claiming anchors are absent', () => {
  const r = rig()
  const pose = LABELS.map(label => ({ label, x: (label === 'LEFT ARM' ? 22 : 21) / 64, y: 31 / 64 }))
  r.animations[0].sources = { west: { route: 'skeleton-v3', reference: 'sha256:test', keypoints: [pose, pose], provenance: [] } }
  delete r.anchors
  const q = check(r, ['idle/west/0', 'idle/west/1'])
  expect(q.qa.status).toBe('warn'); expect(q.clips[0].hand).toBe('?')
  expect(q.qa.grip).toEqual({ R: 0, L: 0, amb: 2, none: 0 })
  expect(q.warnings).toEqual(['G8 idle/west: grip side is unclear (0 right / 0 left frames); check that the item stays in the intended hand'])
  expect(q.warnings.join()).not.toMatch(/missing|M2|switch/)
})

test('decided sibling cannot mask ambiguous and missing-position clip warnings', () => {
  const q = check(rig(), ['idle/south/0', 'idle/south/1', 'idle/west/0', 'idle/west/1', 'idle/east/0', 'idle/east/1'])
  expect(q.qa.status).toBe('warn'); expect(q.qa.clips!['idle/south'].status).toBe('pass')
  expect(q.qa.clips!['idle/west'].status).toBe('warn'); expect(q.qa.clips!['idle/east'].status).toBe('warn')
  expect(q.warnings).toEqual(expect.arrayContaining([expect.stringContaining('G8 idle/west: grip side is unclear'), expect.stringContaining('G8 idle/east: hand positions are missing for 2 of 2 frames')]))
  expect(q.warnings).toHaveLength(2)
})

test.each([undefined, [NaN, 31], [21, Infinity]] as const)('partial or nonfinite hand track %s remains reviewable without crashing', (invalid) => {
  const r = rig(); r.anchors!.hand_r!.idle!.south = [[21, 31], invalid as [number, number]]
  const q = check(r, ['idle/south/0', 'idle/south/1'])
  expect(q.qa.status).toBe('warn')
  expect(q.warnings).toEqual(['G8 idle/south: hand positions are missing for 1 of 2 frames; set up the character’s pose rig and check this view'])
})

test('detached art cannot become a confident hand vote merely because one far-away wrist is nearer', () => {
  const r = rig(); r.anchors!.hand_r!.idle!.south = [[40, 40], [40, 40]]; r.anchors!.hand_l!.idle!.south = [[55, 40], [55, 40]]
  const q = check(r, ['idle/south/0', 'idle/south/1'])
  expect(q.qa.status).toBe('warn'); expect(q.clips[0].hand).toBe('?'); expect(q.qa.handedness).toBeUndefined()
  expect(q.qa.grip).toEqual({ R: 0, L: 0, amb: 0, none: 2 })
  expect(q.warnings).toEqual(['G8 idle/south: item is more than 6 px from both hands in 2 of 2 frames; check its grip'])
})

test('existing right contact passes and actual opposite-hand contact still fails at unchanged margins', () => {
  const r = rig(), keys: CellKey[] = ['idle/south/0', 'idle/south/1']
  expect(check(r, keys).qa.status).toBe('pass')
  r.anchors!.hand_r!.idle!.south = [[45, 31], [45, 31]]; r.anchors!.hand_l!.idle!.south = [[21, 31], [21, 31]]
  const q = check(r, keys)
  expect(q.qa.status).toBe('fail'); expect(q.clips[0].hand).toBe('l')
  expect([...q.failCalls.values()].flat()).toContain('G8 idle/south: held in the left hand (0 R / 2 L frames)')
})
