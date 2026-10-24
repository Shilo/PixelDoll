import { expect, test } from 'vitest'
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { acceptQa, mergeQa } from '../../src/lib/items/qa-summary.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import type { CellKey, Item, ItemQa } from '../../src/lib/store/manifest.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

const rig: Rig = { cell: { w: 8, h: 8 }, pivot: { x: 4, y: 7 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }, { id: 'east' }], animations: [] }
function cell(key: CellKey, bad = false, call = 0, color = 90): CellOut {
  const base = makeImg(8, 8), layer = makeImg(8, 8), mask = new Uint8Array(64)
  const points = bad ? [0] : [18, 19, 20, 26, 27, 28, 34, 35, 36]
  for (const p of points) { mask[p] = 1; layer.data.set([color, color, color, 255], p * 4) }
  return { key, call, base, input: base, out: layer, layer, mask, area: points.length, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: bad, offset: [0, 0], stray: bad ? 5 : 0, posed: true, keyKept: bad ? .8 : 1, keyOutside: bad ? .2 : 0 }
}
const check = (cells: CellOut[], retries = 0) => itemQa(rig, slotOf('head'), 'green', cells, retries)
function item(qa?: ItemQa): Item {
  return { id: 'helmet', name: 'Helmet', slot: 'head', status: 'accepted', mirror: 'flip', materials: [], prompt: '', baseHash: rig.baseHash, provenance: [], layers: [{ id: 'main', role: 'fg', z: 1, cells: { idle: { south: [null] } } }], ...(qa ? { qa } : {}) }
}
const initial = () => item(check([cell('idle/south/0')]).qa)
function merge(it: Item, cells: CellOut[], retries = 0) {
  const q = check(cells, retries).qa
  return { ...it, qa: mergeQa(it, q, q.cells) }
}

test('new move updates every scalar and replacement clears only its obsolete checks', () => {
  const start = initial(), before = structuredClone(start)
  const south = [cell('slash/south/0'), cell('slash/south/1', true)]
  const east = [cell('slash/east/0'), cell('slash/east/1', true)]
  const added = merge(start, [...south, ...east], 2)
  expect(added.qa).toMatchObject({ minKeyKept: .8, maxKeyOutside: .2, minAreaRatio: .2, maxAreaCV: .8, clipPx: 2, shiftedFrames: 2, strayPx: 10, rerolls: 2, status: 'fail' })
  const oneFixed = merge(JSON.parse(JSON.stringify(added)) as Item, south.map(c => cell(c.key as CellKey)))
  expect(oneFixed.qa).toMatchObject({ clipPx: 1, shiftedFrames: 1, strayPx: 5, status: 'fail', rerolls: 2 })
  expect(oneFixed.qa.clips!['slash/east']).toEqual(added.qa.clips!['slash/east'])
  const fixed = merge(oneFixed, east.map(c => cell(c.key as CellKey)))
  expect(fixed.qa).toMatchObject({ minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, clipPx: 0, shiftedFrames: 0, strayPx: 0, rerolls: 2, status: 'pass' })
  expect(start).toEqual(before)
  expect(merge(fixed, east.map(c => cell(c.key as CellKey))).qa).toEqual(fixed.qa)
})

test('a drifting clip cannot be diluted by a clean segment of the same paid call', () => {
  const q = check([cell('idle/south/0'), cell('walk/south/0', false, 1), cell('walk/east/0', false, 1, 120)])
  expect(q.paletteDist).toEqual([0, 15]) // original per-call retry gate stays unchanged
  expect(q.softCalls.size).toBe(0)
  expect(q.qa.maxPaletteDist).toBe(30)
  expect(q.qa.status).toBe('warn')
  expect(q.warnings).toContain('G6 walk/east: palette distance 30 to the design call')
  expect(q.qa.clips!['walk/east']).toMatchObject({ maxPaletteDist: 30, status: 'warn' })
  const added = merge(item(q.qa), [cell('slash/south/0')])
  expect(added.qa.maxPaletteDist).toBe(30)
  const replaced = merge(added, [cell('walk/east/0')])
  expect(replaced.qa.maxPaletteDist).toBe(0)
  expect(replaced.qa.status).toBe('pass')
})

test('acceptance and warning-only checks persist without reviving accepted failures', () => {
  const old = check([cell('idle/south/0', true)]).qa
  old.status = 'accepted'; old.clips!['idle/south'].status = 'accepted'
  expect(merge(item(old), [cell('slash/south/0')]).qa.status).toBe('accepted')
  const q = check([cell('slash/south/0')]).qa
  q.status = 'warn'; q.clips!['slash/south'].status = 'warn'
  expect(mergeQa(initial(), q, q.cells).status).toBe('warn')
})

test('accepting an exception does not leave clean clips permanently marked for review', () => {
  const raw = check([cell('idle/south/0'), cell('slash/south/0', true)]).qa, before = structuredClone(raw)
  const accepted = acceptQa(raw)
  expect(accepted.clips!['idle/south'].status).toBe('pass')
  expect(accepted.clips!['slash/south'].status).toBe('accepted')
  expect(merge(item(accepted), [cell('slash/south/0')]).qa.status).toBe('pass')
  expect(raw).toEqual(before)
})

test('legacy totals are conservative and non-clean until all older coverage is replaced', () => {
  const old = check([cell('idle/south/0', true)]).qa
  delete old.clips
  const added = merge(item(old), [cell('slash/south/0')])
  expect(added.qa.legacy?.clips).toEqual(['idle/south'])
  expect(added.qa).toMatchObject({ minKeyKept: .8, clipPx: 1, status: 'fail' })
  const fixed = merge(JSON.parse(JSON.stringify(added)) as Item, [cell('idle/south/0')])
  expect(fixed.qa.legacy).toBeUndefined()
  expect(fixed.qa).toMatchObject({ minKeyKept: 1, clipPx: 0, status: 'pass' })
  const cleanOld = check([cell('idle/south/0')]).qa; delete cleanOld.clips
  expect(merge(item(cleanOld), [cell('slash/south/0')]).qa.status).toBe('warn')
  const unknown = merge(item(), [cell('slash/south/0')])
  expect(unknown.qa.legacy).toEqual({ clips: ['idle/south'] })
  expect(unknown.qa.status).toBe('warn')
})

test('grip totals replace correctly and new cross-move hand switches cannot report clean', () => {
  const heldRig: Rig = { ...rig, anchors: { hand_r: { idle: { south: [[3, 3]] }, slash: { south: [[30, 3]] } }, hand_l: { idle: { south: [[30, 3]] }, slash: { south: [[3, 3]] } } } }
  const held = (key: CellKey) => itemQa(heldRig, slotOf('main_hand'), 'green', [cell(key)], 0).qa
  const old = item(held('idle/south/0')), next = held('slash/south/0')
  const mixed = mergeQa(old, next, next.cells)
  expect(mixed).toMatchObject({ grip: { R: 1, L: 1, amb: 0, none: 0 }, handedness: 'switched', status: 'fail' })
  heldRig.anchors!.hand_r!.slash!.south = [[3, 3]]; heldRig.anchors!.hand_l!.slash!.south = [[30, 3]]
  const clean = held('slash/south/0'), fixed = mergeQa(item(mixed), clean, clean.cells)
  expect(fixed).toMatchObject({ grip: { R: 2, L: 0, amb: 0, none: 0 }, handedness: 'ok', status: 'pass' })
  // Accepting a known wrong-hand exception must survive an unrelated clean addition.
  for (const s of Object.values(mixed.clips!)) s.status = 'accepted'
  mixed.status = 'accepted'
  heldRig.anchors!.hand_r!.idle!.east = [[3, 3]]; heldRig.anchors!.hand_l!.idle!.east = [[30, 3]]
  const addition = held('idle/east/0')
  expect(mergeQa(item(mixed), addition, addition.cells)).toMatchObject({ handedness: 'switched', status: 'accepted' })
})

test('mixed tracked and untracked held views explain their per-clip review warning', () => {
  const heldRig: Rig = { ...rig, anchors: { hand_r: { idle: { south: [[3, 3]] } }, hand_l: { idle: { south: [[30, 3]] } } } }
  const q = itemQa(heldRig, slotOf('main_hand'), 'green', [cell('idle/south/0'), cell('idle/east/0')], 0)
  expect(q.qa.status).toBe('warn')
  expect(q.qa.clips!['idle/south'].status).toBe('pass')
  expect(q.qa.clips!['idle/east'].status).toBe('warn')
  expect(q.warnings).toContain('G8 idle/east: hand positions are missing for 1 of 1 frames; set up the character’s pose rig and check this view')
})
