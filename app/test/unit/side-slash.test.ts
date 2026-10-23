import { expect, test } from 'vitest'
import { authoredPoses, ACTIONS, LABELS } from '../../src/lib/rig/poses.ts'
import type { Skeleton } from '../../src/lib/rig/skeleton.ts'

const points = (dir: 'east' | 'west'): Skeleton => {
  const p: Skeleton = Object.fromEntries(LABELS.map(l => [l, { x: 32, y: 30, z: 0 }]))
  const side = dir === 'east'
    ? { NOSE: [37.52,21.96], NECK: [31.51,28.81], 'RIGHT SHOULDER': [28.99,29.04], 'RIGHT ELBOW': [28.88,36.90], 'RIGHT ARM': [31.90,43.64], 'LEFT SHOULDER': [34.04,28.59], 'LEFT ELBOW': [33.70,34.76], 'LEFT ARM': [35.39,39.26] }
    : { NOSE: [26.18,21.96], NECK: [32.13,28.65], 'RIGHT SHOULDER': [29.55,28.47], 'RIGHT ELBOW': [29.88,34.54], 'RIGHT ARM': [28.42,39.26], 'LEFT SHOULDER': [34.71,28.81], 'LEFT ELBOW': [35.05,36.56], 'LEFT ARM': [32.24,43.19] }
  for (const [label, [x,y]] of Object.entries(side)) p[label] = { x,y,z:0 }
  return p
}
const dist = (a: {x:number;y:number}, b: {x:number;y:number}) => Math.hypot(a.x-b.x,a.y-b.y)

test.each(['east','west'] as const)('%s Slash has a visible high guard, separate passive wrist and unchanged neutral endpoints', dir => {
  const rest = points(dir), frames = authoredPoses('slash', rest, dir, 64, 'visible-side-v1'), facing = dir === 'east' ? 1 : -1
  expect(frames).toHaveLength(8)
  for (const i of [0,7]) for (const label of LABELS) { expect(frames[i][label].x).toBeCloseTo(rest[label].x,10); expect(frames[i][label].y).toBeCloseTo(rest[label].y,10) }
  for (const i of [1,2]) {
    expect(facing*(frames[i]['RIGHT ARM'].x-rest.NOSE.x)).toBeGreaterThan(1)
    expect(dist(frames[i]['RIGHT ARM'],frames[i]['LEFT ARM'])).toBeGreaterThan(15)
  }
  const rightTravel = Math.max(...frames.map(f => dist(f['RIGHT ARM'],rest['RIGHT ARM'])))
  const leftTravel = Math.max(...frames.map(f => dist(f['LEFT ARM'],rest['LEFT ARM'])))
  expect(rightTravel).toBeGreaterThan(2*leftTravel)
})

test.each(['east','west'] as const)('%s Slash preserves both arm bone lengths and the frozen body foundation', dir => {
  const rest = points(dir)
  for (const f of authoredPoses('slash',rest,dir,64,'visible-side-v1')) {
    for (const side of ['RIGHT','LEFT']) {
      for (const [a,b] of [['SHOULDER','ELBOW'],['ELBOW','ARM']]) expect(dist(f[`${side} ${a}`],f[`${side} ${b}`])).toBeCloseTo(dist(rest[`${side} ${a}`],rest[`${side} ${b}`]),10)
    }
    for (const label of LABELS.filter(l => !/SHOULDER|ELBOW|ARM/.test(l))) expect(f[label]).toEqual(rest[label])
    for (const p of Object.values(f)) { expect(Number.isFinite(p.x)&&Number.isFinite(p.y)).toBe(true); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(64); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(64) }
  }
})

// Persisted older move intents must retain their original request pose arrays.
test('unversioned moves retain legacy requests while the new style only changes side Slash', () => {
  const rest=points('east')
  expect(authoredPoses('slash',rest,'east')).toEqual(ACTIONS.slash(rest,'east'))
  expect(authoredPoses('slash',rest,'east',64,'visible-side-v1')).not.toEqual(ACTIONS.slash(rest,'east'))
  for(const dir of ['south','north','south-east','north-east'] as const) expect(authoredPoses('slash',rest,dir,64,'visible-side-v1')).toEqual(authoredPoses('slash',rest,dir))
  expect(authoredPoses('hurt',rest,'east',64,'visible-side-v1')).toEqual(authoredPoses('hurt',rest,'east'))
})
