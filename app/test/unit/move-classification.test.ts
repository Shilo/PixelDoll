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
