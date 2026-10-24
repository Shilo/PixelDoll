import { expect, test } from 'vitest'
import { clipQa } from '../../src/lib/rig/clips.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { setupPlan } from '../../src/lib/rig/setup.ts'
import { equipmentFixture, bodyOnly } from './equipment-fixture.ts'

const pose = (dy = 0) => LABELS.map(label => ({ label, x: 0.5, y: 0.5 + dy / 64 }))
const frame = (bottom = 58, colour = [100, 80, 60], top = 10) => {
  const im = makeImg(64, 64)
  for (let y = top; y < bottom; y++) for (let x = 25; x < 35; x++) im.data.set([...colour, 255], (y * 64 + x) * 4)
  return im
}
const warnings = (qa: ReturnType<typeof clipQa>) => (qa as typeof qa & { warnings?: string[] }).warnings ?? []

test('requested foot lift is an observation, not a failed planted-foot assumption based on the move name', () => {
  const rest = frame(), frames = [rest, frame(48), rest], requested = [pose(), pose(-10), pose()]
  for (const anim of ['jump', 'dance', 'crouch', 'custom']) {
    const qa = clipQa({ anim, rest, frames, requested, measured: requested, stray: 0 })
    expect(qa.fails).toEqual([])
    expect(warnings(qa).join(' ')).toMatch(/silhouette bottom.*10 px/)
    expect(warnings(qa).join(' ')).not.toMatch(/feet drift|planted|ground line/)
  }
})

test('estimated pose mismatch, palette variation and border contact are retained review observations', () => {
  const rest = frame(), rendered = frame(58, [170, 150, 130], 0), measured = [pose(3)]
  const qa = clipQa({ anim: 'idle', rest, frames: [rendered], requested: [pose()], measured, stray: 0 })
  expect(qa.adherence).toBe(3)
  expect(qa.paletteFit).toBe(0); expect(qa.border).toBeGreaterThan(0)
  expect(qa.fails).toEqual([])
  expect(warnings(qa).join(' ')).toMatch(/estimated.*3\.0 px/)
  expect(warnings(qa).join(' ')).toMatch(/palette/)
  expect(warnings(qa).join(' ')).toMatch(/border/)
})

test('structural failures remain blocking independently of review observations', () => {
  const rest = frame(), qa = clipQa({ anim: 'jump', rest, frames: [makeImg(64, 64)], requested: [pose()], measured: [undefined], stray: 0 })
  expect(qa.fails).toContain('empty animation frame')
  expect(qa.fails).toContain('missing or invalid frame joints')
})

test('a fully contained body with little hat padding can be rigged without altering its artwork', async () => {
  const p = bodyOnly(await equipmentFixture()), im = frame(58, [100, 80, 60], 2), hash = await cellHash(im)
  p.images.set(hash, im)
  p.manifest.rig.directions = [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }]
  p.manifest.items[0].layers[0].cells = { rest: Object.fromEntries(p.manifest.rig.directions.map(d => [d.id, [hash]])) }
  const before = im.data.slice(), plan = await setupPlan(p)
  expect(plan.warnings.join(' ')).toMatch(/2 px.*(?:may|consider|padding)/)
  expect(im.data).toEqual(before)
})
