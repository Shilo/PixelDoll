import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { decisiveAction, isAction } from '../../src/lib/items/items.ts'
import { actionOf, moveWords } from '../../src/lib/rig/clips.ts'
import type { DirectionName, Rig } from '../../src/lib/rig/rig.ts'

const bench = (b: string) => JSON.parse(readFileSync(new URL(`../fixtures/bench/body${b}.json`, import.meta.url), 'utf8')).rig as Rig

test('move ids are read as whole words', () => {
  expect(moveWords('Walk_Cycle')).toEqual(['walk', 'cycle'])
  expect(moveWords('jogIn')).toEqual(['jog', 'in'])
  expect(actionOf('walk')).toBe('walking')
  expect(actionOf('run-slash')).toBe('running')
  expect(actionOf('rune-blast')).toBe('rune-blast') // was "running": "rune" contains "run"
  expect(actionOf('slash')).toBe('slash')
})

test('gait words count as locomotion; unknown and look-alike names stay actions', () => {
  for (const id of ['walk', 'idle', 'run', 'jog', 'sprint', 'stroll', 'march', 'trot', 'breathe', 'Walk_Cycle', 'slow-jog', 'walk2', 'idle2', 'walks-forward', 'runs']) expect(isAction(`${id}/south`), id).toBe(false)
  for (const id of ['slash', 'cast', 'hurt', 'death', 'dance', 'rune-blast', 'walkie-talkie', 'default', 'sneak']) expect(isAction(`${id}/south`), id).toBe(true)
  expect(actionOf('walk2')).toBe('walking') // as before: a digit suffix keeps the request text
})

test('only clearly large stored motion overrides a locomotion name, and no bench walk or idle reaches it', () => {
  for (const b of ['A', 'B', 'C', 'N']) {
    const rig = bench(b)
    for (const a of rig.animations) for (const dir of Object.keys(a.sources ?? {}) as DirectionName[]) {
      expect(decisiveAction(rig, a.id, dir), `${b} ${a.id}/${dir}`).toBe(a.id === 'slash')
    }
  }
  // An attack named like a gait is still judged as an action by its motion.
  const rig = bench('A'), slash = rig.animations.find(a => a.id === 'slash')!
  rig.animations.push({ ...slash, id: 'run-slash' })
  expect(isAction('run-slash/south', rig)).toBe(true)
  expect(isAction('run-slash/south')).toBe(false) // without the stored motion, only the name speaks
})

test('one estimate with swapped hands or a jump does not make a walk an action', () => {
  const rig = bench('A'), walk = rig.animations.find(a => a.id === 'walk')!, src = walk.sources!.south!
  const swap = (l: string) => l.replace(/^(RIGHT|LEFT)/, s => (s === 'RIGHT' ? 'LEFT' : 'RIGHT'))
  src.measured = src.keypoints!.map((f, i) => i === 3 ? f.map(p => ({ ...p, label: p.label.endsWith('ARM') ? swap(p.label) : p.label })) : f)
  expect(decisiveAction(rig, 'walk', 'south')).toBe(false)
  src.measured = src.keypoints!.map((f, i) => i === 3 ? f.map(p => ({ ...p, y: p.y - 0.3 })) : f) // the whole body lifted
  expect(decisiveAction(rig, 'walk', 'south')).toBe(false)
})

test('one bad joint estimate cannot make a walk an action (2026-11-07 review R2)', () => {
  const rig = bench('A'), walk = rig.animations.find(a => a.id === 'walk')!, src = walk.sources!.south!
  // one eye thrown to the corner of the frame in one frame
  src.measured = src.keypoints!.map((f, i) => i === 2 ? f.map(p => p.label === 'RIGHT EYE' ? { ...p, x: 0.95, y: 0.95 } : p) : f)
  expect(decisiveAction(rig, 'walk', 'south')).toBe(false)
  // the same eye wrong in every frame is still one joint
  src.measured = src.keypoints!.map(f => f.map(p => p.label === 'RIGHT EYE' ? { ...p, x: 0.95, y: 0.95 } : p))
  expect(decisiveAction(rig, 'walk', 'south')).toBe(false)
  // correlated bad estimates in two frames: both eyes in the corner, a wrist thrown above the head, a knee in the corner
  for (const bad of [(p: { label: string }) => /EYE/.test(p.label) ? { x: 0.95, y: 0.95 } : null, (p: { label: string }) => p.label === 'RIGHT ARM' ? { y: 0.02 } : null, (p: { label: string }) => p.label === 'RIGHT KNEE' ? { x: 0.02, y: 0.02 } : null]) {
    src.measured = src.keypoints!.map((f, i) => (i === 2 || i === 4 ? f.map(p => ({ ...p, ...(bad(p) ?? {}) })) : f))
    expect(decisiveAction(rig, 'walk', 'south')).toBe(false)
  }
})

test('one bad trunk estimate cannot make a walk an action either', () => {
  const rig = bench('A'), walk = rig.animations.find(a => a.id === 'walk')!, src = walk.sources!.south!
  const cases: ((p: { label: string; x: number; y: number }) => object | null)[] = [
    p => p.label === 'NECK' ? { x: p.x + 0.25 } : null, p => p.label === 'NECK' ? { x: 0.98, y: 0.5 } : null,
    p => p.label === 'RIGHT HIP' ? { x: p.x + 0.4 } : null, p => p.label === 'RIGHT HIP' ? { x: 0.98, y: 0.02 } : null,
  ]
  for (const bad of cases) {
    src.measured = src.keypoints!.map((f, i) => (i === 2 ? f.map(p => ({ ...p, ...(bad(p) ?? {}) })) : f))
    expect(decisiveAction(rig, 'walk', 'south')).toBe(false)
  }
})

test('a short slash named like a gait is still an action (4 of its 8 frames)', () => {
  const rig = bench('A'), slash = rig.animations.find(a => a.id === 'slash')!
  for (const pick of [[0, 2, 4, 6], [1, 3, 5, 7]]) {
    const src = slash.sources!.south!, take = <T,>(a?: T[]) => a && pick.map(i => a[i])
    rig.animations.push({ ...slash, id: 'run-slash', cells: 4, sources: { south: { ...src, keypoints: take(src.keypoints), ...(src.measured ? { measured: take(src.measured) } : {}) } } })
    expect(isAction('run-slash/south', rig), pick.join()).toBe(true)
    rig.animations.pop()
  }
})
