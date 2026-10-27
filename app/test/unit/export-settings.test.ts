import { afterEach, expect, test, vi } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { cellHash, playlist, retainPlaybackChoices } from '../../src/lib/rig/rig.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { readAseprite } from '../../src/lib/export/aseprite.ts'
import { applyExportSetting, saveExportSetting, type StoredProject } from '../../src/lib/store/project.ts'
import { readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import * as db from '../../src/lib/store/db.ts'
import type { Engine, Project } from '../../src/lib/store/manifest.ts'

afterEach(() => vi.restoreAllMocks())
async function fixture(): Promise<Project> {
  const image = makeImg(32, 32); image.data.set([180, 100, 60, 255], (16 * 32 + 16) * 4)
  const hash = await cellHash(image)
  return { images: new Map([[hash, image]]), manifest: {
    format: 'pixeldoll/2', name: 'Explicit playback', app: 'PixelDoll',
    rig: { cell: { w: 32, h: 32 }, pivot: { x: 16, y: 30 }, baseItem: 'body', baseHash: hash, directions: [{ id: 'south' }],
      animations: [{ id: 'walk', cells: 2, loop: false, frames: playlist(2, 100) }, { id: 'death', cells: 2, loop: true, frames: playlist(2, 100) }] },
    slots: [{ id: 'body', z: 0, class: 'base' }], materials: [],
    items: [{ id: 'body', name: 'Body', slot: 'body', status: 'accepted', baseHash: hash, mirror: 'generate', materials: [], prompt: '', provenance: [],
      layers: [{ id: 'main', role: 'fg', z: 0, cells: { walk: { south: [hash, hash] }, death: { south: [hash, hash] } } }] }],
    presets: [{ id: 'current', name: 'Current look', items: { body: 'body' }, variants: {} }, { id: 'saved', name: 'Saved outfit', items: { body: 'body' }, variants: {} }],
  } }
}

for (const engine of ['godot', 'unity', 'phaser', 'gdevelop', 'aseprite', 'generic'] satisfies Engine[]) {
  test(`${engine} preserves explicit repeat choices and outfits with dressed sheets both on and off`, async () => {
    const project = await fixture()
    for (const baked of [true, false]) {
      applyExportSetting(project.manifest, { dressedCharacterSheets: baked })
      const result = await exportFiles(project, { engines: [engine], baked })
      expect(result.errors).toEqual([])
      const files = new Map(result.entries.map(entry => [entry.name, entry.data]))
      const text = (name: string) => new TextDecoder().decode(files.get(name)!)
      const manifest = JSON.parse(text('manifest.json'))
      expect(manifest.rig.animations.map((a: { loop: boolean }) => a.loop)).toEqual([false, true])
      expect(manifest.presets).toHaveLength(2)
      expect(JSON.parse(text('project.json')).manifest.exportSettings.dressedCharacterSheets).toBe(baked)
      expect([...files.keys()].filter(name => name.startsWith('baked/'))).toHaveLength(baked ? 4 : 0)
      expect([...files.keys()].some(name => name.startsWith('layers/'))).toBe(true)
      const imported = await readCharacterZip(await zip(result.entries))
      expect(imported.project.manifest.rig.animations.map(a => a.loop)).toEqual([false, true])
      expect(imported.project.manifest.exportSettings).toEqual({ dressedCharacterSheets: baked })
      if (engine === 'godot') {
        expect(text('godot/body_main.tres')).toMatch(/"loop": false,\n"name": &"walk_south"/)
        expect(text('godot/body_main.tres')).toMatch(/"loop": true,\n"name": &"death_south"/)
      }
      if (engine === 'unity') expect(JSON.parse(text('unity/pixeldoll_unity.json')).animations.map((a: { loop: boolean }) => a.loop)).toEqual([false, true])
      if (engine === 'gdevelop') expect(text('gdevelop/Paperdoll.js')).toContain('"loop":false')
      if (engine === 'aseprite') {
        const file = [...files].find(([name]) => name.endsWith('.aseprite'))!
        expect((await readAseprite(file[1])).tags.map(tag => tag.repeat)).toEqual([1, 0])
      }
    }
  })
}

test('setting writes patch the latest record and preserve concurrent changes', async () => {
  const project = await fixture()
  const record: StoredProject = { id: 'rig-settings', savedAt: '', manifest: project.manifest }
  vi.spyOn(db, 'update').mockImplementation(async (_store, id, update) => {
    expect(id).toBe(record.id)
    record.manifest.name = 'Renamed during export'
    record.manifest.rig.animations[1].loop = false
    update(record)
  })
  await saveExportSetting(record.id, { animation: 'walk', loop: true })
  await saveExportSetting(record.id, { dressedCharacterSheets: false })
  expect(record.manifest.name).toBe('Renamed during export')
  expect(record.manifest.rig.animations.map(a => a.loop)).toEqual([true, false])
  expect(record.manifest.exportSettings).toEqual({ dressedCharacterSheets: false })
})

test('artwork and pose publication retain matching explicit choices and default only new animations to Loop', async () => {
  const project = await fixture(), next = structuredClone(project.manifest.rig)
  next.animations.reverse()
  next.animations.forEach(a => { a.loop = !a.loop })
  next.animations.push({ id: 'custom-attack', cells: 1, loop: false, frames: playlist(1, 100) })
  retainPlaybackChoices(next, project.manifest.rig)
  expect(next.animations.map(a => [a.id, a.loop])).toEqual([['death', true], ['walk', false], ['custom-attack', true]])
})

test('invalid playback metadata is rejected without coercion and failed saves propagate', async () => {
  for (const invalid of [undefined, null, 'false', 0]) {
    const project = await fixture()
    Object.assign(project.manifest.rig.animations[0], { loop: invalid })
    expect((await exportFiles(project, { engines: ['generic'], baked: false })).errors).toContain('walk: loop must be true or false')
  }
  for (const invalid of [null, [], 'true', {}, { dressedCharacterSheets: 'false' }]) {
    const project = await fixture()
    Object.assign(project.manifest, { exportSettings: invalid })
    expect((await exportFiles(project, { engines: ['generic'], baked: false })).errors).toContain('Export settings must specify dressedCharacterSheets as true or false.')
  }
  const project = await fixture()
  expect(() => applyExportSetting(project.manifest, { animation: 'missing', loop: false })).toThrow('no longer exists')
  vi.spyOn(db, 'update').mockRejectedValue(new Error('Quota exceeded'))
  await expect(saveExportSetting('rig-settings', { animation: 'walk', loop: true })).rejects.toThrow('Quota exceeded')
})
