import { expect, test } from 'vitest'
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import type { Rig, DirectionName } from '../../src/lib/rig/rig.ts'
import fixture from '../fixtures/shield-occlusion.json'

function savedClip(clip: typeof fixture.clips[number]) {
  const w = clip.cell.w + 2 * clip.pad, h = clip.cell.h + 2 * clip.pad
  const rig: Rig = {
    cell: clip.cell, pivot: clip.pivot, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: clip.dir as DirectionName }],
    animations: [{ id: 'walk', cells: clip.frames.length, loop: true, frames: [], sources: {
      [clip.dir]: { route: 'skeleton-v3', reference: 'sha256:test', provenance: [], keypoints: clip.frames.map(f => LABELS.map(label => f.points.find(p => p.label === label) ?? { label, x: 0.5, y: 0.5 })) },
    } }],
  }
  const cells: CellOut[] = clip.frames.map((f, i) => {
    const layer = makeImg(w, h), base = makeImg(w, h), mask = new Uint8Array(w * h)
    for (const [start, n] of f.mask) for (let p = start; p < start + n; p++) { mask[p] = 1; layer.data.set([120, 70, 30, 255], p * 4) }
    for (const [start, n] of f.body) for (let p = start; p < start + n; p++) base.data.set([80, 80, 80, 255], p * 4)
    return { key: `walk/${clip.dir}/${i}`, call: 0, layer, base, mask, input: base, out: layer, area: mask.reduce((s, n) => s + n, 0), baseBand: f.baseBand, outBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true }
  })
  return { rig, cells, pad: clip.pad }
}

const failures = (q: ReturnType<typeof itemQa>) => [...q.failCalls.values()].flat()

test.each(fixture.clips)('saved shield walk: $id / $dir keeps unproven changes under review', clip => {
  const { rig, cells, pad } = savedClip(clip)
  const q = itemQa(rig, slotOf('off_hand'), 'green', cells, 0, undefined, pad)
  const gates = failures(q).map(s => s.split(' ')[0])
  expect(gates).toEqual(clip.id.endsWith('b14_ranger') ? ['G5'] : clip.dir === 'east' ? ['G9'] : [])
  expect(q.qa.status).toBe(gates.length ? 'fail' : 'warn')
  expect(q.warnings.some(s => s.startsWith('Occlusion walk/'))).toBe(true)
  // A review decision must not rewrite the exported pixels or hide the original high area CV.
  expect(q.qa.maxAreaCV).toBeGreaterThan(0.25)
})

test('body-free and unposed controls retain the saved size and rotation failures', () => {
  const { rig, cells, pad } = savedClip(fixture.clips[3])
  for (const c of cells) c.base.data.fill(0)
  const clear = itemQa(rig, slotOf('off_hand'), 'green', cells, 0, undefined, pad)
  expect(failures(clear).map(s => s.split(' ')[0])).toEqual(['G5', 'G9'])
  expect(clear.warnings).toEqual([])
  const untouched = savedClip(fixture.clips[3])
  for (const c of untouched.cells) c.posed = false
  const unposed = itemQa(untouched.rig, slotOf('off_hand'), 'green', untouched.cells, 0, undefined, pad)
  expect(failures(unposed).map(s => s.split(' ')[0])).toEqual(['G5', 'G9'])
  expect(unposed.warnings).toEqual([])
})

test('a dropped shield frame remains a hard presence failure even next to the body', () => {
  const { rig, cells, pad } = savedClip(fixture.clips[1])
  cells[2].mask.fill(0); cells[2].layer.data.fill(0); cells[2].area = 0
  const q = itemQa(rig, slotOf('off_hand'), 'green', cells, 0, undefined, pad)
  expect(failures(q).some(s => s.startsWith('G4'))).toBe(true)
  expect(q.qa.status).toBe('fail')
})

test('incidental body contact cannot excuse a clearly visible quarter turn', () => {
  const size = 24
  const points = ['LEFT ARM', 'LEFT ELBOW', 'RIGHT ARM', 'RIGHT ELBOW'].map(label => ({ label, x: (label.startsWith('LEFT') ? 9 : 19) / size, y: (label.endsWith('ARM') ? 12 : 8) / size }))
  const clip = { ...fixture.clips[0], cell: { w: size, h: size }, pad: 0, frames: [0, 1, 2].map(i => ({
    points, baseBand: 1, body: [[7 * size + 6, 1]],
    mask: Array.from({ length: i === 1 ? 7 : 11 }, (_, row) => [(i === 1 ? 9 + row : 7 + row) * size + (i === 1 ? 4 : 6), i === 1 ? 11 : 7]),
  })) }
  const { rig, cells, pad } = savedClip(clip)
  const q = itemQa(rig, slotOf('off_hand'), 'green', cells, 0, undefined, pad)
  expect(failures(q)).toEqual([expect.stringContaining('turns 90°')])
  expect(q.warnings).toEqual([])
})
