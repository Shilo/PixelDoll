import { expect, test } from 'vitest'
import { validate } from '../../src/lib/export/generic.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { projectEntries, readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import type { ItemPaletteRepair, Project } from '../../src/lib/store/manifest.ts'
const before = `sha256:${'1'.repeat(64)}` as const, after = `sha256:${'2'.repeat(64)}` as const
const lineage = (): ItemPaletteRepair => ({ version: 'neutral-owned-v1', materialId: 'removed_metal', anim: 'removed_move', dir: 'north-west', frames: [{ cell: 4096, changedPixels: 1, layers: [{ id: 'fg', before, after }] }] })
async function project(): Promise<Project> {
  const im = makeImg(64, 64); im.data.set([120, 100, 80, 255], (32 * 64 + 32) * 4)
  const hash = await cellHash(im)
  return { images: new Map([[hash, im]]), manifest: {
    format: 'pixeldoll/1', name: 'Lineage test', app: 'PixelDoll', materials: [],
    rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: hash, directions: [{ id: 'south' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] },
    slots: [{ id: 'body', z: 10, class: 'base' }],
    items: [{ id: 'base', name: 'Base', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt: '', provenance: [], baseHash: hash, layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [hash] } } }] }],
    presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }],
  } }
}
test('historical edits survive editable ZIP after moves/materials/source blobs are removed', async () => {
  const p = await project(); p.manifest.items[0].paletteRepairs = [lineage()]
  expect(validate(p)).toEqual([])
  const imported = await readCharacterZip(await zip(await projectEntries(p)))
  expect(imported.project.manifest.items[0].paletteRepairs).toEqual([lineage()])
  expect(imported.project.images.size).toBe(1)
})
test('legacy projects and empty optional history remain compatible', async () => {
  const p = await project(); expect(validate(p)).toEqual([])
  p.manifest.items[0].paletteRepairs = []; expect(validate(p)).toEqual([])
})
const frame = (extra: object) => [{ ...lineage(), frames: [{ ...lineage().frames[0], ...extra }] }]
const layer = (extra: object) => frame({ layers: [{ ...lineage().frames[0].layers[0], ...extra }] })
const invalid: [string, unknown][] = [
  ['not array', {}], ['null', null], ['too much history', Array.from({ length: 1001 }, lineage)], ['null record', [null]],
  ['unknown policy', [{ ...lineage(), version: 'anything' }]], ['unsafe material', [{ ...lineage(), materialId: '../secret' }]], ['unsafe move', [{ ...lineage(), anim: 'a/b' }]], ['bad direction', [{ ...lineage(), dir: 'sideways' }]],
  ['missing frames', [{ ...lineage(), frames: null }]], ['empty frames', [{ ...lineage(), frames: [] }]], ['too many frames', [{ ...lineage(), frames: Array.from({ length: 1001 }, () => lineage().frames[0]) }]],
  ['fractional cell', frame({ cell: 0.5 })], ['negative cell', frame({ cell: -1 })], ['unsafe integer cell', frame({ cell: Number.MAX_SAFE_INTEGER + 1 })], ['duplicate cell', [{ ...lineage(), frames: [lineage().frames[0], lineage().frames[0]] }]],
  ['zero changes', frame({ changedPixels: 0 })], ['fractional changes', frame({ changedPixels: 1.5 })], ['excess pixel changes', frame({ changedPixels: 65_537 })],
  ['missing layers', frame({ layers: null })], ['empty layers', frame({ layers: [] })], ['too many layers', frame({ layers: Array.from({ length: 4 }, () => lineage().frames[0].layers[0]) })], ['duplicate layer', frame({ layers: [lineage().frames[0].layers[0], lineage().frames[0].layers[0]] })],
  ['invalid layer', layer({ id: 'escape' })], ['invalid before hash', layer({ before: 'sha256:bad' })], ['invalid after hash', layer({ after: 123 })], ['unchanged hash', layer({ after: before })],
]
test.each(invalid)('malformed palette history is rejected by validation and ZIP import: %s', async (_, value) => {
  const p = await project(); p.manifest.items[0].paletteRepairs = value as ItemPaletteRepair[]
  expect(validate(p)).toContain('base: invalid local palette repair history')
  await expect(readCharacterZip(await zip(await projectEntries(p)))).rejects.toThrow('invalid local palette repair history')
})
