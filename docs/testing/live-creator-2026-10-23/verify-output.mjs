// Offline verification of artifacts downloaded through the live Codex browser. No network or credentials.
// Node 24: node docs/testing/live-creator-2026-10-23/verify-output.mjs L01 <local-evidence-directory>
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { unzip } from '../../../app/src/lib/store/zip.ts'
import { decodePngBytes } from '../../../app/src/lib/image/pngraw.ts'
import { flipH } from '../../../app/src/lib/rig/mirror.ts'
import { opaqueBox } from '../../../app/src/lib/rig/normalize.ts'
import { hasAll, LABELS } from '../../../app/src/lib/rig/poses.ts'

const all = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
const cases = {
  L01: { body: 48, frame: 64, camera: 'side', seed: 424201, selected: ['east', 'west'], mirrors: { west: 'east' } },
  L02: { body: 64, frame: 80, camera: 'high top-down', seed: 0, selected: ['south', 'east', 'north', 'west'], mirrors: { west: 'east' } },
  L03: { body: 96, frame: 160, camera: 'low top-down', seed: 424203, selected: ['south-east', 'north-east', 'north-west', 'south-west'], mirrors: { 'north-west': 'north-east', 'south-west': 'south-east' } },
  L04: { body: 128, frame: 160, camera: 'high top-down', seed: 424204, selected: all, mirrors: {} },
  L05: { body: 32, frame: 48, camera: 'low top-down', selected: ['east'], mirrors: {} },
  L06: { body: 76, frame: 129, camera: 'side', seed: 424206, selected: ['east', 'west'], mirrors: { east: 'west' } },
}
const id = process.argv[2], expected = cases[id]
assert(expected, 'Choose L01–L06')
assert(process.argv[3], 'Pass the local evidence directory (kept outside Git)')
const path = suffix => resolve(process.argv[3], `${id}-${suffix}`)
const archive = await unzip(new Uint8Array(await readFile(path('output.pixeldoll.zip'))))
const manifest = JSON.parse(new TextDecoder().decode(archive.get('manifest.json')))
const project = JSON.parse(new TextDecoder().decode(archive.get('project.json')))
const activity = JSON.parse(await readFile(path('actual.json'), 'utf8'))
const planned = JSON.parse(await readFile(path('planned.json'), 'utf8'))
const attempts = activity.calls.filter(call => !call.restored && call.method === 'POST')
const actual = attempts.filter(call => call.status === 200)
const rejected = attempts.filter(call => call.status !== 200)
assert(actual.every(call => call.status === 200 && call.state === 'completed' && !call.usagePending), 'Every recorded actual POST must be successful and terminal')
assert.equal(new Set(actual.map(call => call.queueId)).size, actual.length, 'An accepted paid request must never be resent')
for (const refusal of rejected) {
  // Only this explicitly observed, uncharged rate refusal is accepted; new failure types require investigation.
  assert.equal(refusal.status, 429)
  assert.equal(refusal.state, 'failed'); assert.equal(refusal.costSource, 'free')
  assert.deepEqual(refusal.cost, { generations: 0, usd: 0 }); assert(!refusal.usagePending)
  const recovery = actual.find(call => call.queueId === refusal.queueId && call.endpoint === refusal.endpoint && call.startedAt >= refusal.finishedAt)
  assert(recovery, `Rate-refused request ${refusal.queueId} must recover before this case passes`)
  assert.deepEqual(recovery.body, refusal.body, 'A rate refusal must not change or redraw the requested payload')
}
const base = actual.find(call => call.endpoint === '/create-character-v3' && call.body.image_size)
const knownBase = { ...base.body }
if (expected.seed === undefined) { assert(!('seed' in planned.calls[0].body), 'Random seed is deferred until submission'); delete knownBase.seed }
assert.deepEqual(knownBase, planned.calls[0].body, 'Initial transmitted JSON must match the reviewed known fields')
assert.deepEqual(base.body.image_size, { width: expected.body, height: expected.body })
assert.equal(base.body.view, expected.camera)
if (expected.seed !== undefined) assert.equal(base.body.seed, expected.seed)
else assert(base.body.seed >= 1 && base.body.seed <= 2_000_000_000, 'Random seed uses the documented application range')
assert(Number.isSafeInteger(base.body.seed) && base.body.seed >= 0)
assert(!('name' in base.body) && !('projectId' in base.body))
assert.deepEqual(manifest.rig.cell, { w: expected.frame, h: expected.frame })
assert.equal(manifest.rig.view, expected.camera)
assert.deepEqual(manifest.rig.directions, expected.selected.map(id => expected.mirrors[id] ? { id, mirrorOf: expected.mirrors[id] } : { id }))
assert.deepEqual(Object.keys(manifest.rig.rest).sort(), [...all].sort())
assert.deepEqual(manifest.rig.animations.map(a => ({ id: a.id, cells: a.cells })), [{ id: 'idle', cells: 4 }, { id: 'walk', cells: 8 }])
const registration = actual.find(call => call.endpoint === '/create-character-v3' && call.body.reference_image)
assert.equal(registration.body.seed, base.body.seed)
for (const [key, value] of Object.entries(planned.calls.filter(call => call.path === '/create-character-v3')[1].body)) assert.deepEqual(registration.body[key], value, `Registration ${key}`)
assert.equal(registration.body.n_directions, 8)
assert.equal(Object.keys(registration.body.direction_images).length, 7)
const restImages = {}
for (const direction of all) {
  const rest = manifest.rig.rest[direction], stored = archive.get(`cells/${rest.image.slice(7)}.png`)
  assert(stored, `Saved original ${direction}`)
  const saved = await decodePngBytes(stored)
  const input = direction === 'south' ? registration.body.reference_image : registration.body.direction_images[direction]
  const registered = await decodePngBytes(Buffer.from(input.base64, 'base64'))
  assert.equal(saved.w, expected.frame); assert.equal(saved.h, expected.frame)
  assert.deepEqual(saved.data, registered.data, `${direction} original pixels must survive registration/export`)
  restImages[direction] = saved
}
const sources = expected.selected.filter(dir => !expected.mirrors[dir])
const raw = actual.filter(call => call.endpoint === '/animate-with-skeleton-v3')
assert.deepEqual([...new Set(raw.map(call => call.body.direction))].sort(), [...sources].sort())
for (const call of raw) {
  const matchingPlan = planned.calls.find(plan => plan.path === '/animate-with-skeleton-v3' && plan.body.direction === call.body.direction && plan.body.action === call.body.action)
  assert(matchingPlan)
  for (const [key, value] of Object.entries(matchingPlan.body).filter(([key]) => key !== 'seed')) assert.deepEqual(call.body[key], value, `Raw ${key}`)
  assert.equal(call.body.view, expected.camera)
  assert(hasAll(call.body.first_frame_keypoints))
  assert(call.body.keypoints.every(hasAll))
  assert.equal(call.body.keypoints.length, call.body.action === 'breathing idle' ? 4 : 8)
  assert([base.body.seed + 101, base.body.seed + 101 + 7919].includes(call.body.seed))
  const first = await decodePngBytes(Buffer.from(call.body.first_frame.base64, 'base64'))
  assert.equal(first.w, expected.frame); assert.equal(first.h, expected.frame)
  assert.deepEqual(first.data, restImages[call.body.direction].data, 'Raw poses use the selected original rest image')
}
const motions = actual.filter(call => call.endpoint === '/characters/animations')
assert.deepEqual(motions.map(call => call.body.directions[0]).sort(), [...sources].sort())
const characterRead = activity.calls.find(call => call.method === 'GET' && /^\/characters\/[^/]+$/.test(call.endpoint))
assert(characterRead)
for (const motion of motions) {
  const matchingPlan = planned.calls.find(plan => plan.path === '/characters/animations' && plan.body.directions[0] === motion.body.directions[0])
  assert(matchingPlan)
  for (const [key, value] of Object.entries(matchingPlan.body)) assert.deepEqual(motion.body[key], value, `Motion ${key}`)
  assert.equal(motion.body.character_id, characterRead.endpoint.split('/').pop())
  assert.equal(motion.body.mode, 'skeleton-v3'); assert.equal(motion.body.template_animation_id, 'walking-8-frames'); assert.equal(motion.body.seed, base.body.seed)
}
assert(actual.every(call => ['/create-character-v3', '/characters/animations', '/animate-with-skeleton-v3', '/estimate-skeleton'].includes(call.endpoint)), 'Creation uses only allowed V3 and estimation endpoints')
const report = { name: manifest.name, body: expected.body, cell: manifest.rig.cell, view: manifest.rig.view, seed: base.body.seed,
  directions: manifest.rig.directions, restViews: Object.keys(manifest.rig.rest), postAttemptCount: attempts.length, acceptedPostCount: actual.length,
  rateRefusedAttempts: rejected.map(call => ({ queueId: call.queueId, endpoint: call.endpoint, status: call.status, generations: call.cost.generations, recovered: true })),
  reportedGenerations: +actual.filter(call => call.costSource === 'reported').reduce((sum, call) => sum + call.cost.generations, 0).toFixed(2),
  reportedUsd: +actual.filter(call => call.costSource === 'reported').reduce((sum, call) => sum + call.cost.usd, 0).toFixed(4),
  unknownCostCount: actual.filter(call => call.costSource === 'unknown').length,
  warnings: project.rigQa?.warnings ?? [], skeletonCount: Object.keys(project.skeletons ?? {}).length, animations: [] }
for (const animation of manifest.rig.animations) {
  const sheetPath = `layers/body/base/main/${animation.id}.png`, bytes = archive.get(sheetPath)
  const image = await decodePngBytes(bytes), size = expected.frame
  assert.equal(image.w, size * animation.cells)
  assert.equal(image.h, size * expected.selected.length)
  const frames = {}
  for (const [row, direction] of expected.selected.entries()) {
    frames[direction] = []
    for (let index = 0; index < animation.cells; index++) {
      const frame = { w: size, h: size, data: new Uint8ClampedArray(size * size * 4) }
      for (let y = 0; y < size; y++) frame.data.set(image.data.subarray(((row * size + y) * image.w + index * size) * 4, ((row * size + y) * image.w + (index + 1) * size) * 4), y * size * 4)
      assert(opaqueBox(frame), `${animation.id}/${direction}/${index} must not be empty`)
      const skeleton = project.skeletons[`${animation.id}/${direction}/${index}`]
      assert(skeleton && LABELS.every(label => Number.isFinite(skeleton[label]?.x) && Number.isFinite(skeleton[label]?.y) && skeleton[label].x >= 0 && skeleton[label].x <= size && skeleton[label].y >= 0 && skeleton[label].y <= size), 'Every exported frame needs a complete measured skeleton')
      frames[direction].push(frame)
    }
  }
  for (const [target, source] of Object.entries(expected.mirrors)) for (let index = 0; index < animation.cells; index++) {
    assert.deepEqual(frames[target][index].data, flipH(frames[source][index]).data, `Exact mirror ${animation.id}/${target}/${index}`)
    const original = project.skeletons[`${animation.id}/${source}/${index}`], mirrored = project.skeletons[`${animation.id}/${target}/${index}`]
    for (const label of LABELS) { assert(Math.abs(mirrored[label].x - (size - original[label].x)) < 1e-6); assert.equal(mirrored[label].y, original[label].y) }
  }
  for (const source of sources) {
    const clip = animation.sources[source]
    assert.equal(clip.measured.length, animation.cells)
    assert(clip.measured.every(hasAll), 'Required output measurements must be complete')
  }
  report.animations.push({ id: animation.id, frames: animation.cells, sheet: { w: image.w, h: image.h }, allNonempty: true, allMeasurementsComplete: true, exactMirrorPairs: Object.keys(expected.mirrors).length })
  await writeFile(path(`${animation.id}.png`), bytes)
}
await writeFile(path('output-verification.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
