import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { cellHash, playlist, retainPlaybackChoices, validateRig } from '../../src/lib/rig/rig.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { readAseprite } from '../../src/lib/export/aseprite.ts'
import { animationNames, applyExportSettings, defaultExportSettings, EXPORT_SETTINGS_KEY, readExportSettings, saveExportSetting, subscribeExportSettings, type ExportSettings } from '../../src/lib/store/export-settings.ts'
import { projectEntries, readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import * as db from '../../src/lib/store/db.ts'
import type { Engine, Project } from '../../src/lib/store/manifest.ts'

beforeEach(() => vi.stubGlobal('BroadcastChannel', undefined))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
async function fixture(): Promise<Project> {
  const image = makeImg(32, 32); image.data.set([180, 100, 60, 255], (16 * 32 + 16) * 4)
  const hash = await cellHash(image)
  return { images: new Map([[hash, image]]), manifest: {
    format: 'pixeldoll/2', name: 'Explicit playback', app: 'PixelDoll',
    rig: { cell: { w: 32, h: 32 }, pivot: { x: 16, y: 30 }, baseItem: 'body', baseHash: hash, directions: [{ id: 'south' }],
      animations: [{ id: 'walk', cells: 2, loop: true, frames: playlist(2, 100) }, { id: 'death', cells: 2, loop: false, frames: playlist(2, 100) }] },
    slots: [{ id: 'body', z: 0, class: 'base' }], materials: [],
    items: [{ id: 'body', name: 'Body', slot: 'body', status: 'accepted', baseHash: hash, mirror: 'generate', materials: [], prompt: '', provenance: [],
      layers: [{ id: 'main', role: 'fg', z: 0, cells: { walk: { south: [hash, hash] }, death: { south: [hash, hash] } } }] }],
    presets: [{ id: 'current', name: 'Current look', items: { body: 'body' }, variants: {} }, { id: 'saved', name: 'Saved outfit', items: { body: 'body' }, variants: {} }],
  } }
}

function storedSettings(initial?: unknown) {
  const records = new Map<string, unknown>(initial === undefined ? [] : [[EXPORT_SETTINGS_KEY, structuredClone(initial)]])
  const get = vi.spyOn(db, 'get').mockImplementation(async (_store, key) => structuredClone(records.get(key)))
  const update = vi.spyOn(db, 'update').mockImplementation(async (_store, key, change) => {
    const next = change(structuredClone(records.get(key)))
    records.set(key, structuredClone(next))
    return next
  })
  return { records, get, update }
}

for (const engine of ['godot', 'unity', 'phaser', 'gdevelop', 'aseprite', 'generic'] satisfies Engine[]) {
  test(engine + ' exports global name choices consistently with dressed sheets on and off', async () => {
    const source = await fixture(), original = structuredClone(source.manifest), database = storedSettings()
    for (const baked of [true, false]) {
      const settings: ExportSettings = { engine, dressedCharacterSheets: baked, playOnce: ['walk'] }
      const project = { ...source, manifest: structuredClone(source.manifest) }
      applyExportSettings(project.manifest, settings)
      const result = await exportFiles(project, { engines: [settings.engine], baked: settings.dressedCharacterSheets })
      expect(result.errors).toEqual([])
      const files = new Map(result.entries.map(entry => [entry.name, entry.data]))
      const text = (name: string) => new TextDecoder().decode(files.get(name)!)
      const manifest = JSON.parse(text('manifest.json'))
      expect(manifest.rig.animations.map((a: { loop: boolean }) => a.loop)).toEqual([false, true])
      expect(manifest.presets).toHaveLength(2)
      expect(manifest.export.engines).toEqual([engine])
      expect(JSON.parse(text('project.json')).manifest.rig.animations.map((a: { loop: boolean }) => a.loop)).toEqual([false, true])
      expect([...files.keys()].filter(name => name.startsWith('baked/'))).toHaveLength(baked ? 4 : 0)
      expect([...files.keys()].some(name => name.startsWith('layers/'))).toBe(true)
      const imported = await readCharacterZip(await zip(result.entries))
      expect(imported.project.manifest.rig.animations.map(a => a.loop)).toEqual([false, true])
      applyExportSettings(imported.project.manifest, defaultExportSettings())
      expect(imported.project.manifest.rig.animations.every(a => a.loop)).toBe(true)
      expect(database.update).not.toHaveBeenCalled()
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
      expect(settings).toEqual({ engine, dressedCharacterSheets: baked, playOnce: ['walk'] })
      expect(source.manifest).toEqual(original)
    }
  })
}

test('global writes atomically patch latest settings, normalize case and persist independent tab choices', async () => {
  const database = storedSettings()
  expect(await readExportSettings()).toEqual(defaultExportSettings())
  await Promise.all([saveExportSetting({ engine: 'unity' }), saveExportSetting({ dressedCharacterSheets: false }), saveExportSetting({ animation: ' Jump ', playOnce: true })])
  await saveExportSetting({ animation: 'JUMP', playOnce: true })
  await saveExportSetting({ animation: 'jump-loop', playOnce: true })
  const committed = await saveExportSetting({ animation: 'JUMP', playOnce: false })
  expect(committed).toEqual({ engine: 'unity', dressedCharacterSheets: false, playOnce: ['jump-loop'] })
  expect(await readExportSettings()).toEqual(committed)
  committed.playOnce.push('changed-by-caller')
  expect((await readExportSettings()).playOnce).toEqual(['jump-loop'])
  expect(database.records.size).toBe(1)
  expect(database.update.mock.calls.every(([store, key]) => store === 'projects' && key === EXPORT_SETTINGS_KEY)).toBe(true)
})

test('exact canonical name rules cover existing and future characters without touching their saved rigs', async () => {
  const settings: ExportSettings = { engine: 'godot', dressedCharacterSheets: true, playOnce: ['jump'] }
  const first = (await fixture()).manifest, second = structuredClone(first)
  first.rig.animations[0].id = 'jump'; second.rig.animations[0].id = 'Jump'
  second.rig.animations.push({ id: 'jump-loop', cells: 1, frames: playlist(1, 200), loop: false })
  second.rig.animations.push({ id: 'jump_loop', cells: 1, frames: playlist(1, 200), loop: false }, { id: 'jumping', cells: 1, frames: playlist(1, 200), loop: false })
  const firstOriginal = structuredClone(first), secondOriginal = structuredClone(second)
  const exportedFirst = structuredClone(first), exportedSecond = structuredClone(second)
  applyExportSettings(exportedFirst, settings); applyExportSettings(exportedSecond, settings)
  expect(exportedFirst.rig.animations.map(a => a.loop)).toEqual([false, true])
  expect(exportedSecond.rig.animations.map(a => a.loop)).toEqual([false, true, true, true, true])
  expect(first).toEqual(firstOriginal); expect(second).toEqual(secondOriginal)
  expect(animationNames([first, second], settings)).toEqual(['death', 'jump', 'jump-loop', 'jump_loop', 'jumping'])
  expect(animationNames([], settings)).toEqual(['jump'])
  second.rig.animations[0].id = 'leap'
  expect(animationNames([second], settings)).toEqual(['death', 'jump', 'jump-loop', 'jump_loop', 'jumping', 'leap'])
  applyExportSettings(second, settings)
  expect(second.rig.animations[0].loop).toBe(true)
})

test('canonical rig names reject case-only duplicates and native imports do not seed global preferences', async () => {
  const project = await fixture(), database = storedSettings({ engine: 'phaser', dressedCharacterSheets: false, playOnce: ['walk'] })
  project.manifest.rig.animations.push({ ...structuredClone(project.manifest.rig.animations[0]), id: 'Walk' })
  expect(validateRig(project.manifest.rig).some(error => error.includes('animation id "Walk"'))).toBe(true)
  project.manifest.rig.animations.pop()
  const imported = await readCharacterZip(await zip(await projectEntries(project)))
  expect(imported.project.manifest.rig.animations.map(a => a.loop)).toEqual([true, false])
  expect(await readExportSettings()).toEqual({ engine: 'phaser', dressedCharacterSheets: false, playOnce: ['walk'] })
  expect(database.update).not.toHaveBeenCalled()
})

test('invalid saved preferences and failed writes surface errors instead of silently resetting choices', async () => {
  const database = storedSettings()
  for (const invalid of [null, [], 'true', {}, { engine: 'missing', dressedCharacterSheets: true, playOnce: [] }, { engine: 'godot', dressedCharacterSheets: 'false', playOnce: [] }, { engine: 'godot', dressedCharacterSheets: true, playOnce: ['Jump'] }, { engine: 'godot', dressedCharacterSheets: true, playOnce: ['jump', 'jump'] }, { engine: 'godot', dressedCharacterSheets: true, playOnce: ['jump/../walk'] }]) {
    database.records.set(EXPORT_SETTINGS_KEY, invalid)
    await expect(readExportSettings()).rejects.toThrow('Saved export settings')
    await expect(saveExportSetting({ engine: 'unity' })).rejects.toThrow('Saved export settings')
  }
  database.records.delete(EXPORT_SETTINGS_KEY)
  await expect(saveExportSetting({ engine: 'unknown' as Engine })).rejects.toThrow('supported export format')
  await expect(saveExportSetting({ animation: 'jump/../walk', playOnce: true })).rejects.toThrow('Animation names')
  await expect(saveExportSetting({ dressedCharacterSheets: 'false' as unknown as boolean })).rejects.toThrow('true or false')
  database.update.mockRejectedValue(new Error('Quota exceeded'))
  await expect(saveExportSetting({ animation: 'jump', playOnce: true })).rejects.toThrow('Quota exceeded')
})

test('only committed settings send payload-free cross-tab invalidations and listeners clean up', async () => {
  storedSettings()
  const messages: unknown[] = [], channels: { name: string; onmessage?: () => void; closed: boolean }[] = []
  vi.stubGlobal('BroadcastChannel', class {
    onmessage?: () => void
    closed = false
    constructor(readonly name: string) { channels.push(this) }
    postMessage(value: unknown) { messages.push(value); channels.filter(channel => channel !== this && !channel.closed && channel.name === this.name).forEach(channel => channel.onmessage?.()) }
    close() { this.closed = true }
  })
  const listener = vi.fn(), unsubscribe = subscribeExportSettings(listener)
  await saveExportSetting({ animation: 'jump', playOnce: true })
  expect(listener).toHaveBeenCalledOnce(); expect(messages).toEqual([null])
  expect(channels[1].closed).toBe(true)
  unsubscribe(); expect(channels[0].closed).toBe(true)
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('BroadcastChannel', class { constructor() { throw new Error('Channels are unavailable') } })
  expect((await saveExportSetting({ engine: 'unity' })).engine).toBe('unity')
  expect((await readExportSettings()).engine).toBe('unity')
  expect(warning).toHaveBeenCalledOnce()
  vi.spyOn(db, 'update').mockRejectedValue(new Error('No storage'))
  await expect(saveExportSetting({ engine: 'unity' })).rejects.toThrow('No storage')
  expect(messages).toHaveLength(1)
})

test('invalid playback metadata remains rejected by exports and native imports', async () => {
  for (const invalid of [undefined, null, 'false', 0]) {
    const project = await fixture()
    Object.assign(project.manifest.rig.animations[0], { loop: invalid })
    expect((await exportFiles(project, { engines: ['generic'], baked: false })).errors).toContain('walk: loop must be true or false')
    await expect(readCharacterZip(await zip(await projectEntries(project)))).rejects.toThrow('loop must be true or false')
  }
  const empty = await fixture(); empty.manifest.rig.animations = []
  await expect(readCharacterZip(await zip(await projectEntries(empty)))).rejects.toThrow('no animations')
})

test('artwork and pose publication retain archive flags and default only genuinely new animations to Loop', async () => {
  const project = await fixture(), next = structuredClone(project.manifest.rig)
  next.animations.reverse()
  next.animations.forEach(a => { a.loop = !a.loop })
  next.animations.push({ id: 'custom-attack', cells: 1, loop: false, frames: playlist(1, 100) })
  retainPlaybackChoices(next, project.manifest.rig)
  expect(next.animations.map(a => [a.id, a.loop])).toEqual([['death', false], ['walk', true], ['custom-attack', true]])
})
