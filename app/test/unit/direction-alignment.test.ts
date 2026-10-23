import { expect, test, vi } from 'vitest'
import { alignCharacter, planAlignment, shiftMotionPoses } from '../../src/lib/rig/align.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { baseHashOf, cellHash, cellKey, cellKeys, ANCHORS } from '../../src/lib/rig/rig.ts'
import { validate } from '../../src/lib/export/generic.ts'
import { moveDirs } from '../../src/lib/dress/dress.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { bakedFrame, cellImg, composeCell } from '../../src/lib/compose/compose.ts'
import { restStamp } from '../../src/lib/equipment/design.ts'
import { targetStamp } from '../../src/lib/equipment/copy.ts'
import { targetAudit } from '../../src/lib/equipment/compatibility.ts'
import { H, box, points, makeAlignmentFixture as fixture } from '../fixtures/direction-alignment.ts'
const shifted = (im: Img, dy: number): Img => {
  const out = makeImg(im.w, im.h)
  for (let y = 0; y < im.h; y++) if (y + dy >= 0 && y + dy < im.h) out.data.set(im.data.subarray(y * im.w * 4, (y + 1) * im.w * 4), (y + dy) * im.w * 4)
  return out
}

test('partial alignment QA uses the retained pivot when the south baseline is left unchanged', async () => {
  const { project, record } = await fixture()
  project.manifest.rig.pivot.y = 58
  const result = await alignCharacter(project, record, { north: 3 })
  const warnings = (result.record.rigQa as { warnings: string[] }).warnings
  expect(result.project.manifest.rig.pivot.y).toBe(58)
  expect(warnings).toContain('idle/south: ground line is 2 px below the shared pivot')
  expect(warnings.some(w => w.startsWith('idle/north: ground line'))).toBe(false)
})

test.each(['absent', 'null'] as const)('supported sparse animation rows stay %s during alignment', async kind => {
  const { project, record } = await fixture(), m = project.manifest
  const cells = m.items[0].layers[0].cells!.jump!
  if (kind === 'absent') delete cells.north
  else cells.north = [null, null]
  delete m.rig.animations.find(a => a.id === 'jump')!.sources!.north
  const empty = await cellHash(makeImg(64, 64))
  const hashes = Object.fromEntries(cellKeys(m.rig).map(key => {
    const [anim, dir, index] = key.split('/')
    return [key, m.items[0].layers[0].cells![anim][dir as 'south' | 'north']?.[+index] ?? empty]
  }))
  m.rig.baseHash = await baseHashOf(m.rig, hashes)
  for (const item of m.items) item.baseHash = m.rig.baseHash
  expect(validate(project)).toEqual([])
  expect(moveDirs(m, 'jump')).toEqual(['south'])
  const result = await alignCharacter(project, record, { north: 5 })
  expect(result.project.manifest.items[0].layers[0].cells!.jump!.north).toEqual(cells.north)
  expect(moveDirs(result.project.manifest, 'jump')).toEqual(['south'])
  expect(validate(result.project)).toEqual([])
})

test('an absent idle direction uses its saved standing reference, but a partial idle remains invalid', async () => {
  const { project, record } = await fixture(true), body = project.manifest.items[0].layers[0]
  delete body.cells!.idle!.north
  delete project.manifest.rig.animations[0].sources!.north
  expect(planAlignment(project).offsets.north).toBe(5)
  const result = await alignCharacter(project, record, { north: 5 })
  expect(result.project.manifest.items[0].layers[0].cells!.idle!.north).toBeUndefined()
  const partial = await alignCharacter(project, record, { east: 5, west: 5 })
  expect((partial.record.rigQa as { warnings: string[] }).warnings).toContain('rest/north: ground line is 5 px above the shared pivot')
  body.cells!.idle!.north = [project.manifest.rig.rest!.north!.image, null]
  await expect(alignCharacter(project, record, { north: 5 })).rejects.toThrow(/missing|empty/)
})

test('a partially missing action row is rejected instead of being treated as an absent direction', async () => {
  const { project, record } = await fixture()
  project.manifest.items[0].layers[0].cells!.jump!.north![1] = null
  await expect(alignCharacter(project, record, { north: 5 })).rejects.toThrow(/missing|empty/)
})

test('a constant direction correction preserves every animation, layer, rig coordinate, colour and source record', async () => {
  const { project, record } = await fixture(), before = structuredClone(record), originalPixels = new Map([...project.images].map(([h, im]) => [h, im.data.slice()]))
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Alignment must never call a service'))
  try {
    const plan = planAlignment(project)
    expect(plan.errors).toEqual([]); expect(plan.offsets.north).toBe(5)
    const aligned = await alignCharacter(project, record, { north: 5 }), m = aligned.project.manifest
    expect(m.rig.pivot).toEqual(project.manifest.rig.pivot)
    expect(m.items[1].layers[1].pivot).toEqual({ x: 48, y: 76 })
    for (const a of m.rig.animations) for (const d of m.rig.directions) for (let i = 0; i < a.cells; i++) {
      const dy = d.id === 'north' ? 5 : 0
      for (let item = 0; item < m.items.length; item++) for (let li = 0; li < m.items[item].layers.length; li++) {
        const old = cellImg(project, project.manifest.items[item].layers[li], a.id, d.id, i), next = cellImg(aligned.project, m.items[item].layers[li], a.id, d.id, i)
        if (!old) expect(next).toBeNull(); else expect(next!.data).toEqual(shifted(old, dy).data)
      }
      const key = cellKey(a.id, d.id, i)
      for (const label of LABELS) expect(aligned.record.skeletons![key][label]).toEqual({ ...record.skeletons![key][label], y: record.skeletons![key][label].y + dy })
      for (const anchor of ANCHORS) expect(m.rig.anchors![anchor]![a.id][d.id]![i]).toEqual([30, project.manifest.rig.anchors![anchor]![a.id][d.id]![i][1] + dy])
      const frame = bakedFrame(m), oldComposite = composeCell(project, m.presets[0].items, a.id, d.id, i, frame), nextComposite = composeCell(aligned.project, m.presets[0].items, a.id, d.id, i, frame)
      expect(nextComposite.data).toEqual(shifted(oldComposite, dy).data)
      const oldSource = project.manifest.rig.animations.find(x => x.id === a.id)!.sources![d.id]!, source = a.sources![d.id]!
      expect(source.reference).toBe(m.rig.rest![d.id]!.image)
      for (const field of ['keypoints', 'measured'] as const) for (let j = 0; j < LABELS.length; j++) expect(source[field]![i][j]).toEqual({ ...oldSource[field]![i][j], y: oldSource[field]![i][j].y + dy / 64 })
    }
    expect(m.rig.baseHash).not.toBe(project.manifest.rig.baseHash)
    expect(m.items.every(it => it.baseHash === m.rig.baseHash)).toBe(true)
    expect(m.items[1].coverage).toEqual(project.manifest.items[1].coverage)
    expect(m.items[1].design!.snapshot).toEqual(project.manifest.items[1].design!.snapshot)
    expect(m.items[1].design!.dressedStamp).toBe(restStamp(m))
    expect(m.items[1].design!.targetStamp).toBe(targetStamp(m, 'head'))
    expect(m.items[1].design!.targetAudit).toBe(await targetAudit(aligned.project))
    expect(aligned.record.character!.id).toBe('server-character')
    expect(aligned.record.character!.motionOffsets?.north).toBe(5)
    expect(aligned.record.rigQa).toMatchObject({ clips: { 'walk/north': { adherence: 3, fails: ['arms 3.0 px off the requested pose'] } } })
    const newRest = m.rig.rest!.north!, oldRest = project.manifest.rig.rest!.north!
    expect(aligned.project.images.get(newRest.image)!.data).toEqual(shifted(project.images.get(oldRest.image)!, 5).data)
    expect(newRest.keypoints).toEqual(oldRest.keypoints.map(p => ({ ...p, y: p.y + 5 / 64 })))
    expect(aligned.project.images.get(m.items[1].dressed!.north!)!.data).toEqual(shifted(project.images.get(project.manifest.items[1].dressed!.north!)!, 5).data)
    expect(record).toEqual(before)
    for (const [hash, pixels] of originalPixels) expect(project.images.get(hash)!.data).toEqual(pixels)
    expect(fetchSpy).not.toHaveBeenCalled()
  } finally { fetchSpy.mockRestore() }
})

test('stale body hashes and unqualified dressed references are never promoted by alignment', async () => {
  const { project, record } = await fixture(), gear = project.manifest.items[1]
  gear.baseHash = H; gear.status = 'stale'; gear.design!.dressedStamp = 'old-invalid-stamp'
  const result = await alignCharacter(project, record, { north: 5 })
  expect(result.project.manifest.items[1].baseHash).toBe(H)
  expect(result.project.manifest.items[1].status).toBe('stale')
  expect(result.project.manifest.items[1].design!.dressedStamp).not.toBe(restStamp(result.project.manifest))
})

test('shared image hashes are translated per direction rather than globally', async () => {
  const { project, record } = await fixture(), l = project.manifest.items[1].layers[1]
  l.cells!.idle!.north = [...l.cells!.idle!.south!]
  const result = await alignCharacter(project, record, { north: 5 }), next = result.project.manifest.items[1].layers[1]
  expect(next.cells!.idle!.south).toEqual(l.cells!.idle!.south)
  expect(next.cells!.idle!.north![0]).not.toBe(next.cells!.idle!.south![0])
})

test('mirrored directions form one correction group and cannot receive different offsets', async () => {
  const { project, record } = await fixture(true), plan = planAlignment(project)
  expect(plan.groups.some(g => g.id === 'east' && g.offset === 5 && g.directions.includes('west'))).toBe(true)
  await expect(alignCharacter(project, record, { east: 5, west: 0 })).rejects.toThrow()
  const result = await alignCharacter(project, record, { east: 5, west: 5 })
  expect(result.offsets).toMatchObject({ east: 5, west: 5 })
  for (const a of result.project.manifest.rig.animations) for (let i = 0; i < a.cells; i++) {
    const l = result.project.manifest.items[0].layers[0]
    expect(cellImg(result.project, l, a.id, 'west', i)!.data).toEqual(flipH(cellImg(result.project, l, a.id, 'east', i)!).data)
  }
})

test.each([1.5, NaN, Infinity, -Infinity, 100, -100])('invalid correction %s is rejected without mutation', async offset => {
  const { project, record } = await fixture(), before = structuredClone(record)
  await expect(alignCharacter(project, record, { north: offset })).rejects.toThrow()
  expect(record).toEqual(before)
})

test('unknown directions and a changing standing baseline cannot be silently aligned', async () => {
  const { project, record } = await fixture()
  await expect(alignCharacter(project, record, { west: 5 })).rejects.toThrow()
  const image = box(64, 57), hash = await cellHash(image); project.images.set(hash, image)
  project.manifest.items[0].layers[0].cells!.idle!.north![1] = hash
  expect(planAlignment(project).errors.length).toBeGreaterThan(0)
  await expect(alignCharacter(project, record, { north: 5 })).rejects.toThrow()
})

test.each(['unequipped gear', 'jump body', 'dressed reference', 'rest joint', 'requested joint', 'measured joint', 'skeleton', 'anchor'] as const)('clipping in %s blocks the complete copy', async kind => {
  const { project, record } = await fixture(), m = project.manifest
  const edge = box(64, 64, [200, 0, 0], 20, 1), hash = await cellHash(edge); project.images.set(hash, edge)
  if (kind === 'unequipped gear') { m.presets[0].items.head = null; m.items[1].layers[0].cells!.walk!.north![0] = hash }
  if (kind === 'jump body') m.items[0].layers[0].cells!.jump!.north![0] = hash
  if (kind === 'dressed reference') m.items[1].dressed!.north = hash
  if (kind === 'rest joint') m.rig.rest!.north!.keypoints[0].y = 1
  if (kind === 'requested joint') m.rig.animations[1].sources!.north!.keypoints![0][0].y = 1
  if (kind === 'measured joint') m.rig.animations[1].sources!.north!.measured![0][0].y = 1
  if (kind === 'skeleton') record.skeletons!['jump/north/0'].NOSE.y = 64
  if (kind === 'anchor') m.rig.anchors!.head!.jump!.north![0][1] = 63
  await expect(alignCharacter(project, record, { north: 5 })).rejects.toThrow()
})

test('managed motion mapping adds the stored correction once, preserves labels and x, and rejects clipping', () => {
  const input = [points(55), points(54)], before = structuredClone(input), output = shiftMotionPoses(input, 5, 64)
  expect(output).toEqual(input.map(pose => pose.map(p => ({ ...p, y: p.y + 5 / 64 }))))
  expect(input).toEqual(before)
  expect(shiftMotionPoses(output, 0, 64)).toEqual(output)
  expect(() => shiftMotionPoses([[{ label: 'NOSE', x: 0.5, y: 0.99 }]], 5, 64)).toThrow()
  expect(() => shiftMotionPoses(input, NaN, 64)).toThrow()
})

test('upward alignment also rejects clipping at the top of an unequipped layer', async () => {
  const { project, record } = await fixture(), m = project.manifest, standing = box(64, 63), top = box(64, 1, [0, 0, 255], 20, 1)
  const standingHash = await cellHash(standing), topHash = await cellHash(top)
  project.images.set(standingHash, standing); project.images.set(topHash, top)
  m.items[0].layers[0].cells!.idle!.north = [standingHash, standingHash]
  m.items[1].layers[0].cells!.walk!.north![0] = topHash; m.presets[0].items.head = null
  expect(planAlignment(project).offsets.north).toBe(-3)
  await expect(alignCharacter(project, record, { north: -3 })).rejects.toThrow()
})

test('managed motion corrections accumulate while preserving other directions', async () => {
  const { project, record } = await fixture()
  record.character!.motionOffsets = { north: 2, south: -1 }
  const result = await alignCharacter(project, record, { north: 5 })
  expect(result.record.character!.motionOffsets).toMatchObject({ north: 7, south: -1 })
  expect(record.character!.motionOffsets).toEqual({ north: 2, south: -1 })
})
