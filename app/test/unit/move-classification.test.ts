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

test('one detached trunk, face or limb joint cannot make a walk an action (2026-11-07 session counter-review F1)', () => {
  // A lone joint whose own chain to the trunk looks plausible still stretches the bones to its children: the neck below the
  // hips, the nose, an elbow or a knee thrown away from its wrist or ankle, or one hip moving the hip center.
  for (const b of ['A', 'B', 'C', 'N']) {
    const rig = bench(b), walk = rig.animations.find(a => a.id === 'walk')!
    for (const dir of Object.keys(walk.sources ?? {}) as DirectionName[]) {
      const src = walk.sources![dir]!, base = src.measured ?? src.keypoints!
      for (const label of ['NECK', 'NOSE', 'RIGHT ELBOW', 'LEFT ELBOW', 'RIGHT KNEE', 'LEFT KNEE', 'RIGHT HIP', 'LEFT HIP'])
        for (let x = 0.025; x < 1; x += 0.05) for (let y = 0.025; y < 1; y += 0.05) {
          src.measured = base.map((f, i) => (i === 1 ? f.map(p => (p.label === label ? { ...p, x, y } : p)) : f))
          expect(decisiveAction(rig, 'walk', dir), `${b} ${dir} ${label} (${x.toFixed(3)}, ${y.toFixed(3)})`).toBe(false)
        }
      src.measured = base === src.keypoints ? undefined : base
    }
  }
})

test('one detached hip cannot lean a walk into an action (review of the F1 correction)', () => {
  // A stored 64 px import walk (spikes/api/out/user-import-review-2026-10-27, south-east, frame 0): moving only the left hip
  // shifts the hip center so the neck and shoulders seem to lean 41 degrees about it, while every bone stays under the limit.
  const kp = (rows: [string, number, number][]) => rows.map(([label, x, y]) => ({ label, x, y }))
  const rest = kp([['NOSE', 0.56, 0.306], ['NECK', 0.489, 0.399], ['RIGHT SHOULDER', 0.419, 0.408], ['RIGHT ELBOW', 0.388, 0.511], ['RIGHT ARM', 0.413, 0.599], ['LEFT SHOULDER', 0.56, 0.39], ['LEFT ELBOW', 0.585, 0.495], ['LEFT ARM', 0.601, 0.577], ['RIGHT HIP', 0.47, 0.579], ['RIGHT KNEE', 0.451, 0.706], ['RIGHT LEG', 0.428, 0.811], ['LEFT HIP', 0.549, 0.576], ['LEFT KNEE', 0.556, 0.699], ['LEFT LEG', 0.558, 0.791], ['RIGHT EYE', 0.524, 0.281], ['LEFT EYE', 0.578, 0.281], ['RIGHT EAR', 0.444, 0.274], ['LEFT EAR', 0.544, 0.269]])
  const frame = kp([['NOSE', 0.603, 0.313], ['NECK', 0.526, 0.403], ['RIGHT SHOULDER', 0.444, 0.404], ['RIGHT ELBOW', 0.378, 0.468], ['RIGHT ARM', 0.357, 0.565], ['LEFT SHOULDER', 0.607, 0.403], ['LEFT ELBOW', 0.637, 0.485], ['LEFT ARM', 0.683, 0.543], ['RIGHT HIP', 0.494, 0.584], ['RIGHT KNEE', 0.532, 0.711], ['RIGHT LEG', 0.551, 0.82], ['LEFT HIP', 0.56, 0.586], ['LEFT KNEE', 0.482, 0.686], ['LEFT LEG', 0.432, 0.74], ['RIGHT EYE', 0.56, 0.285], ['LEFT EYE', 0.626, 0.285], ['RIGHT EAR', 0.477, 0.276], ['LEFT EAR', 0.592, 0.274]])
  const rig = (measured: typeof frame) => ({ cell: { w: 64, h: 64 }, rest: { 'south-east': { keypoints: rest } }, animations: [{ id: 'walking', sources: { 'south-east': { measured: [measured] } } }] }) as unknown as Rig
  expect(decisiveAction(rig(frame), 'walking', 'south-east')).toBe(false)
  expect(decisiveAction(rig(frame.map(p => (p.label === 'LEFT HIP' ? { ...p, x: 0.34, y: 0.54 } : p))), 'walking', 'south-east')).toBe(false)
  // the lean itself still decides when the whole upper body tips: the shoulders, neck and head turned 60 degrees about the hips
  const hips = [(0.494 + 0.56) / 2, 0.585], turn = (x: number, y: number) => { const c = Math.cos(Math.PI / 3), s = Math.sin(Math.PI / 3), dx = x - hips[0], dy = y - hips[1]; return { x: hips[0] + dx * c - dy * s, y: hips[1] + dx * s + dy * c } }
  const upper = /NOSE|NECK|SHOULDER|ELBOW|ARM|EYE|EAR/
  expect(decisiveAction(rig(frame.map(p => (upper.test(p.label) ? { ...p, ...turn(p.x, p.y) } : p))), 'walking', 'south-east')).toBe(true)
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
