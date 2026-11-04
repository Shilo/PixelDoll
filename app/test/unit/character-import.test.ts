import { expect, test, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { loadFixture } from '../../src/lib/compose/fixture.ts'
import { cellImg } from '../../src/lib/compose/compose.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { characterId, downloadCharacter, listCharacters } from '../../src/lib/pixellab/library.ts'
import { planItem } from '../../src/lib/items/items.ts'
import { baseCell } from '../../src/lib/items/run.ts'
import { coverage } from '../../src/studio/itemRoute.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { expectPixels } from './pixels.ts'
import { CharacterImportError, projectEntries, readCharacterZip } from '../../src/lib/store/import.ts'
import { unzip, zip, type ZipEntry } from '../../src/lib/store/zip.ts'
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts'

const enc = new TextEncoder()
const id = '5352683c-54aa-4617-b303-e942e472c66d'
function sprite(red: number, x = 20) {
  const im = makeImg(48, 48)
  for (let y = 15; y < 44; y++) for (let dx = 0; dx < 10; dx++) im.data.set([red, 90, 60, 255], (y * im.w + x + dx) * 4)
  return im
}
async function pixelLabFiles(): Promise<ZipEntry[]> {
  const frames = { rotations: { south: 'Idle/rotations/south.png', east: 'Idle/rotations/east.png', west: 'Idle/rotations/west.png' }, animations: { walking: { south: ['Idle/animations/walking/south/frame_000.png', 'Idle/animations/walking/south/frame_001.png'] } } }
  return [
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ export_version: '1', states: [{ character: { id, name: 'Test adventurer', prompt: 'test base', size: { width: 48, height: 48 } }, folder: 'Idle', frames }, { character: { id: 'second', name: 'Second state' }, frames: { rotations: frames.rotations, animations: {} } }] })) },
    ...await Promise.all(Object.values(frames.rotations).map(async (name, i) => ({ name, data: await encodePngBytes(sprite(100 + 30 * i, 18 + i)) }))),
    ...await Promise.all(frames.animations.walking.south.map(async (name, i) => ({ name, data: await encodePngBytes(sprite(100, 18 + i)) }))),
  ]
}

test('ZIP reader handles stored and deflated files and nested UTF-8 names', async () => {
  const entries = [{ name: 'dir/ü.txt', data: enc.encode('hello '.repeat(100)) }]
  for (const deflate of [false, true]) expect(await unzip(await zip(entries, { deflate }))).toEqual(new Map(entries.map((e) => [e.name, e.data])))
})

test('ZIP reader rejects truncation, damaged data, unsafe paths and duplicate entries', async () => {
  const bytes = await zip([{ name: 'a.txt', data: enc.encode('hello') }])
  await expect(unzip(bytes.slice(0, -2))).rejects.toThrow()
  bytes[35] ^= 1
  await expect(unzip(bytes)).rejects.toThrow('damaged')
  await expect(unzip(await zip([{ name: '../a.txt', data: enc.encode('bad') }]))).rejects.toThrow('unsafe')
  await expect(unzip(await zip([{ name: 'a', data: enc.encode('x') }, { name: 'a', data: enc.encode('y') }]))).rejects.toThrow('Duplicate')
})

test('PNG import rejects inflated data that exceeds its declared image dimensions', async () => {
  const bytes = await encodePngBytes(makeImg(64, 64)), view = new DataView(bytes.buffer)
  view.setUint32(16, 1); view.setUint32(20, 1)
  await expect(decodePngBytes(bytes)).rejects.toThrow('exceeds image dimensions')
})

test('current PixelLab multi-state ZIP preserves independent directions and sparse animation', async () => {
  const bytes = await zip(await pixelLabFiles())
  const imported = await readCharacterZip(bytes, id), { manifest: m, images } = imported.project
  expect(m.name).toBe('Test adventurer')
  expect(m.format).toBe(CURRENT_FORMAT) // pixeldoll/1 recolor skips item colors the body uses
  expect(imported.states).toHaveLength(2)
  expect(m.rig.directions.map((d) => [d.id, d.mirrorOf])).toEqual([['south', undefined], ['east', undefined], ['west', undefined]])
  const base = m.items[0].layers[0]
  expect(base.cells?.walking.south).toHaveLength(2)
  expect(base.cells?.walking.east).toBeUndefined()
  const east = images.get(base.cells!.default.east![0]!)!, west = images.get(base.cells!.default.west![0]!)!
  expect(east.data).not.toEqual(west.data)
  expect(images.get(base.cells!.default.south![0]!)!.data[(27 * 64 + 26) * 4]).toBe(100) // exact 48 -> 64 padding +8,+12
  expect(imported.extra.character).toBeUndefined()
  expect(m.rig.rest).toBeUndefined()
  expect((await readCharacterZip(bytes, 'second')).project.manifest.rig.animations).toHaveLength(1)
  await expect(readCharacterZip(bytes, 'missing')).rejects.toThrow('selected character state')
})

test('the rotations are the Default move; a ZIP animation named default steps aside', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[0].frames.animations = { default: meta.states[0].frames.animations.walking }
  entries[0].data = enc.encode(JSON.stringify(meta))
  const m = (await readCharacterZip(await zip(entries), id)).project.manifest
  expect(m.rig.animations.map((a) => [a.id, a.cells])).toEqual([['default', 1], ['default-copy', 2]])
})

test('PixelLab imports explicitly chosen sibling animations without inventing moves from static states', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[1].character.name = 'Armored state'
  meta.states[1].frames.animations = { walking: meta.states[0].frames.animations.walking, Right_Punch: meta.states[0].frames.animations.walking }
  meta.states.push({ character: { id: 'static', name: 'Hair variant' }, frames: { rotations: meta.states[0].frames.rotations, animations: {} } })
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries), selected = await readCharacterZip(bytes), all = await readCharacterZip(bytes, undefined, 'all')
  expect(selected.project.manifest.rig.animations.map(a => a.id)).toEqual(['default', 'walking'])
  expect(all.states?.map(s => [s.name, s.animations])).toEqual([['Test adventurer', 1], ['Armored state', 2], ['Hair variant', 0]])
  expect(all.project.manifest.rig.animations.map(a => a.id)).toEqual(['default', 'walking', 'armored-state-walking', 'right_punch'])
  expect((await readCharacterZip(bytes, id, ['second'])).project.manifest).toEqual(all.project.manifest)
  const base = all.project.manifest.items[0].layers[0]
  expect(base.cells!.walking.south).toEqual(base.cells!['armored-state-walking'].south)
  expect(all.project.manifest.rig.directions.map(d => d.id)).toEqual(['south', 'east', 'west'])
  const second = await readCharacterZip(bytes, 'second', 'all')
  expect(second.project.manifest.rig.animations.map(a => a.id)).toEqual(['default', 'walking', 'right_punch', 'test-adventurer-walking'])
  expect(second.project.manifest.rig.animations.some(a => a.id === 'walking-copy')).toBe(false)
  await expect(readCharacterZip(bytes, id, ['missing'])).rejects.toThrow('selected move states')
})

test('PixelLab keeps unequal direction lengths as separate sparse moves without padding or dropping frames', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[0].frames.animations.walking.east = [meta.states[0].frames.animations.walking.south[0]]
  entries[0].data = enc.encode(JSON.stringify(meta))
  const imported = await readCharacterZip(await zip(entries)), { manifest } = imported.project
  expect(manifest.rig.animations.map(a => [a.id, a.cells])).toEqual([['default', 1], ['walking-south', 2], ['walking-east', 1]])
  expect(manifest.rig.animations[1].frames).toEqual([{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }])
  expect(manifest.items[0].layers[0].cells!['walking-south'].east).toBeUndefined()
  expect(manifest.items[0].layers[0].cells!['walking-east'].south).toBeUndefined()
  expect(imported.warnings).toContain('“walking” has different frame counts by direction. Its directions were imported as separate moves to keep every original frame and direction length.')
})

test.each([80, 92, 96, 128, 160, 256])('PixelLab preserves every source pixel at %i px instead of forcing a 64 px frame', async size => {
  const original = makeImg(size, size)
  original.data.set([255, 30, 40, 255], 0)
  original.data.set([40, 255, 30, 255], original.data.length - 4)
  const bytes = await zip([{ name: 'metadata.json', data: enc.encode(JSON.stringify({ name: `Size ${size}` })) }, { name: 'rotations/south.png', data: await encodePngBytes(original) }])
  const imported = await readCharacterZip(bytes), { manifest } = imported.project
  expect(manifest.rig.cell).toEqual({ w: size, h: size })
  expectPixels(cellImg(imported.project, manifest.items[0].layers[0], 'default', 'south', 0), original)
})

test('PixelLab uses a common canvas for padded animation frames without clipping their bottom pixels', async () => {
  const rotation = sprite(80), animation = makeImg(64, 64)
  animation.data.set([255, 20, 30, 255], (63 * 64 + 32) * 4)
  const bytes = await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Padded' })) },
    { name: 'rotations/south.png', data: await encodePngBytes(rotation) },
    { name: 'animations/step/south/frame_0.png', data: await encodePngBytes(animation) },
  ])
  const imported = await readCharacterZip(bytes), { manifest } = imported.project
  expectPixels(cellImg(imported.project, manifest.items[0].layers[0], 'step', 'south', 0), animation)
  const standing = cellImg(imported.project, manifest.items[0].layers[0], 'default', 'south', 0)!
  expect([...standing.data.slice(((15 + 8) * 64 + 20 + 8) * 4, ((15 + 8) * 64 + 20 + 8) * 4 + 4)]).toEqual([80, 90, 60, 255])
})

test.each([[48, 68, 10], [64, 96, 16]])('PixelLab aligns a %i px standing canvas and %i px padded animation around one source origin', async (size, paddedSize, offset) => {
  const standing = makeImg(size, size), animation = makeImg(paddedSize, paddedSize)
  standing.data.set([90, 120, 180, 255], (20 * size + 10) * 4)
  animation.data.set([90, 120, 180, 255], ((20 + offset) * paddedSize + 10 + offset) * 4)
  const imported = await readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Common origin' })) },
    { name: 'rotations/south.png', data: await encodePngBytes(standing) },
    { name: 'animations/step/south/frame_0.png', data: await encodePngBytes(animation) },
  ]))
  const layer = imported.project.manifest.items[0].layers[0]
  expect(imported.project.manifest.rig.cell).toEqual({ w: paddedSize, h: paddedSize })
  expectPixels(cellImg(imported.project, layer, 'default', 'south', 0), animation)
  expectPixels(cellImg(imported.project, layer, 'step', 'south', 0), animation)
  expect(imported.project.manifest.rig.pivot).toEqual({ x: paddedSize / 2, y: 21 + offset })
})

test('PixelLab bounds repeated logical references before decoding their image data', async () => {
  const png = await encodePngBytes(makeImg(1, 1)), view = new DataView(png.buffer)
  view.setUint32(16, 256); view.setUint32(20, 256)
  const directions = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
  const rotations = Object.fromEntries(directions.map(dir => [dir, 'repeated.png']))
  const clip = Object.fromEntries(directions.map(dir => [dir, Array.from({ length: 120 }, () => 'repeated.png')]))
  const metadata = { states: [{ character: { id, name: 'Repeated' }, frames: { rotations, animations: { one: clip, two: clip } } }] }
  await expect(readCharacterZip(await zip([{ name: 'metadata.json', data: enc.encode(JSON.stringify(metadata)) }, { name: 'repeated.png', data: png }]))).rejects.toThrow('including repeated frame references')
})

test('PixelLab rejects oversized animation metadata and duplicate frame indices', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data)), clip = meta.states[0].frames.animations.walking
  meta.states[0].frames.animations = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`move-${i}`, clip]))
  entries[0].data = enc.encode(JSON.stringify(meta))
  await expect(readCharacterZip(await zip(entries))).rejects.toThrow('too many moves')
  const png = await encodePngBytes(sprite(80))
  await expect(readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Duplicate indices' })) },
    { name: 'rotations/south.png', data: png },
    { name: 'animations/walk/south/frame_0.png', data: png },
    { name: 'animations/walk/south/frame_00.png', data: png },
  ]))).rejects.toThrow('missing animation frames')
})

test('PixelLab malformed metadata and incompatible sibling states retain useful chooser errors', async () => {
  for (const metadata of [null, { states: 'invalid' }, { states: [null] }, { states: [{ character: {} }] }]) {
    await expect(readCharacterZip(await zip([{ name: 'metadata.json', data: enc.encode(JSON.stringify(metadata)) }]))).rejects.toThrow(/metadata|state list/)
  }
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[1].character.view = 'side'
  meta.states[0].character.view = 'low top-down'
  meta.states[1].frames.animations = meta.states[0].frames.animations
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  await expect(readCharacterZip(bytes, id, 'all')).rejects.toMatchObject({ stateId: id, states: [{ id, name: 'Test adventurer', animations: 1 }, { id: 'second', name: 'Second state', animations: 1 }], message: expect.stringContaining('different character size or camera view') })
  expect((await readCharacterZip(bytes)).project.manifest.rig.animations).toHaveLength(2)
})

test('PixelLab preserves distinct animation labels that collide after normalization or contain path separators', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data)), clip = meta.states[0].frames.animations.walking
  meta.states[0].frames.animations = { '__Walk__': clip, Walk: clip, 'A/B': clip, 'A B': clip }
  entries[0].data = enc.encode(JSON.stringify(meta))
  expect((await readCharacterZip(await zip(entries))).project.manifest.rig.animations.map(a => a.id)).toEqual(['default', 'walk', 'walk-copy', 'a-b', 'a-b-copy'])
})

test('PixelLab animations default to looping regardless of their names', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  const clip = meta.states[0].frames.animations.walking
  meta.states[0].frames.animations = Object.fromEntries(['jump', 'cast', 'swim', 'dance', 'death', 'attack', 'soldier-walk', 'custom'].map(name => [name, clip]))
  entries[0].data = enc.encode(JSON.stringify(meta))
  const animations = (await readCharacterZip(await zip(entries), id)).project.manifest.rig.animations
  expect(animations).toHaveLength(9)
  expect(animations.every(animation => animation.loop === true)).toBe(true)
})

test('PixelLab legacy root exports import; opaque cropping is refused', async () => {
  const entries = [{ name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Legacy' })) }, { name: 'rotations/south.png', data: await encodePngBytes(sprite(100)) }]
  expect((await readCharacterZip(await zip(entries))).project.manifest.name).toBe('Legacy')
  const huge = makeImg(272, 272); huge.data.set([255, 0, 0, 255], 0)
  entries[1].data = await encodePngBytes(huge)
  await expect(readCharacterZip(await zip(entries))).rejects.toThrow('visible pixels')
})

test('PixelLab metadata supports arbitrary safe frame paths inside nested enclosing folders', async () => {
  const entries = await pixelLabFiles(), original = await readCharacterZip(await zip(entries))
  const meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  const paths = new Map(entries.slice(1).map((e, i) => [e.name, `Artwork/深い folder/custom ${i}.PNG`]))
  for (const state of meta.states) {
    for (const [dir, path] of Object.entries(state.frames.rotations)) state.frames.rotations[dir] = paths.get(path as string)
    for (const dirs of Object.values(state.frames.animations)) for (const [dir, frames] of Object.entries(dirs as Record<string, string[]>)) (dirs as Record<string, string[]>)[dir] = frames.map(p => paths.get(p)!)
  }
  const nested = [{ name: 'My download/Character/metadata.json', data: enc.encode(JSON.stringify(meta)) }, ...entries.slice(1).map(e => ({ name: `My download/Character/${paths.get(e.name)}`, data: e.data })), { name: 'README.txt', data: enc.encode('unrelated packaging') }]
  const actual = await readCharacterZip(await zip(nested, { deflate: true }))
  expect(actual.project.manifest).toEqual(original.project.manifest)
  expect(actual.project.images).toEqual(original.project.images)
})

test('ambiguous character folders and PNG-only ZIPs explain their unsupported layout', async () => {
  const entries = await pixelLabFiles()
  await expect(readCharacterZip(await zip(['one', 'two'].flatMap(root => entries.map(e => ({ ...e, name: `${root}/${e.name}` })))))).rejects.toThrow('multiple character folders')
  await expect(readCharacterZip(await zip(entries.filter(e => e.name !== 'metadata.json')))).rejects.toThrow('direction and frame layout')
})

test('sparse imported clips can be dressed without planning missing base frames', async () => {
  const { project } = await readCharacterZip(await zip(await pixelLabFiles()))
  const ctx = { rec: { id: 'rig-test', savedAt: '', manifest: project.manifest }, project }
  const selected = coverage(ctx)
  expect(selected.clipDirs?.walking).toEqual(['south'])
  const plan = planItem(project.manifest.rig, { ...selected, key: 'green', method: 'anchor' })
  const keys = plan.flatMap((c) => c.cells)
  expect(keys).toContain('walking/south/1')
  expect(keys).not.toContain('walking/east/0')
  for (const key of keys) expect(baseCell(ctx, key).w).toBe(64) // includes the imported Default move
  const long = { ...project.manifest.rig, animations: [{ id: 'long', cells: 32, loop: true, frames: [] }] }
  const chunks = planItem(long, { anims: ['long'], dirs: ['south'], key: 'green', method: 'anchor' })
  expect(chunks.flatMap((c) => c.cells).sort()).toEqual(Array.from({ length: 32 }, (_, i) => `long/south/${i}`).sort())
  expect(chunks.every((c, i) => c.cells.length <= (i ? 15 : 16))).toBe(true)
})

test('state choices survive an incompatible first PixelLab state', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  const big = makeImg(272, 272); big.data.set([1, 2, 3, 255], 0)
  entries.push({ name: 'oversize.png', data: await encodePngBytes(big) })
  meta.states[0].frames.rotations = { south: 'oversize.png' }
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  await expect(readCharacterZip(bytes)).rejects.toBeInstanceOf(CharacterImportError)
  await readCharacterZip(bytes).catch((e: CharacterImportError) => expect(e.states).toHaveLength(2))
  expect((await readCharacterZip(bytes, 'second')).project.manifest.name).toBe('Second state')
})

test('PixelDoll export restores editable original cells, outfits, rest rig and dressed views', async () => {
  const p = await loadFixture(async (path) => new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))))
  // Include an item keyframe which is neither a layer cell nor a base rest frame.
  const dressed = sprite(222), hash = await cellHash(dressed)
  p.images.set(hash, dressed)
  p.manifest.items[1].dressed = { south: hash }
  const extra = { character: { id, looks: 'test appearance' }, skeletons: {}, rigQa: { warnings: [] } }
  const out = await exportFiles(p, { engines: ['generic'], baked: false, projectData: extra })
  expect(out.errors).toEqual([])
  const result = await readCharacterZip(await zip(out.entries, { deflate: true }))
  expect(result.project.manifest).toEqual(p.manifest)
  expect(result.extra).toEqual(extra)
  expectPixels(result.project.images.get(hash), dressed)
  for (const [h, im] of p.images) if (result.project.images.has(h)) expectPixels(result.project.images.get(h), im, h)
})

test('older PixelDoll sheets import with correct rows and preserve source pixels', async () => {
  const p = await loadFixture(async (path) => new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))))
  p.manifest.items[1].dressed = { south: await cellHash(sprite(222)) }
  p.manifest.items[1].route = 'skeleton-pose'
  p.manifest.slots.find((s) => s.id === 'head')!.clips = ['hair']
  const out = await exportFiles(p, { engines: ['generic'], baked: false })
  const old = out.entries.filter((f) => f.name !== 'project.json' && !f.name.startsWith('cells/'))
  const result = await readCharacterZip(await zip(old))
  const base = p.manifest.items.find((it) => it.id === p.manifest.rig.baseItem)!.layers[0]
  const restored = result.project.manifest.items.find((it) => it.id === p.manifest.rig.baseItem)!.layers[0]
  for (const a of p.manifest.rig.animations) for (const d of p.manifest.rig.directions) for (let c = 0; c < a.cells; c++) expectPixels(cellImg(result.project, restored, a.id, d.id, c), cellImg(p, base, a.id, d.id, c), `${a.id}/${d.id}/${c}`)
  expect(result.project.manifest.rig.directions.every((d) => !d.mirrorOf)).toBe(true)
  expect(result.project.manifest.items[1].dressed).toBeUndefined()
  expect(result.project.manifest.items[1].route).toBeUndefined()
  expect(result.project.manifest.items.some((it) => it.variantOf)).toBe(false)
  const reexported = await exportFiles(result.project, { engines: ['generic'], baked: false })
  await expect(unzip(await zip(reexported.entries))).resolves.toBeInstanceOf(Map)
})

test('current PixelDoll ZIPs support one enclosing folder containing both manifests', async () => {
  const { project } = await readCharacterZip(await zip(await pixelLabFiles()))
  const exported = await exportFiles(project, { engines: ['generic'], baked: false })
  const wrapped = exported.entries.map((e) => ({ ...e, name: `My character/${e.name}` }))
  expect((await readCharacterZip(await zip(wrapped))).project.manifest).toEqual(project.manifest)
})

test('editable import verifies referenced image hashes', async () => {
  const imported = await readCharacterZip(await zip(await pixelLabFiles()))
  const entries = await projectEntries(imported.project)
  entries.find((e) => e.name.startsWith('cells/'))!.data = await encodePngBytes(sprite(1))
  await expect(readCharacterZip(await zip(entries))).rejects.toThrow('stored hash')
})

test('PixelLab ID parsing permits only UUIDs and official links', () => {
  expect(characterId(id)).toBe(id)
  expect(characterId(`https://pixellab.ai/characters/${id}`)).toBe(id)
  expect(characterId(`https://pixellab.ai/character-creator?character_id=${id}`)).toBe(id)
  expect(() => characterId(`https://evil.example/${id}`)).toThrow('pixellab.ai')
  expect(() => characterId('not-an-id')).toThrow('UUID')
})

test('library import uses GET only and never sends a key to the public ZIP', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ characters: [], total: 0 }))).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])))
  vi.stubGlobal('fetch', fetch)
  try {
    await listCharacters('test-only-key', 20)
    expect(fetch.mock.calls[0][0]).toContain('/characters?limit=20&offset=20')
    expect(fetch.mock.calls[0][1].method).toBe('GET')
    expect(await downloadCharacter(id)).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetch.mock.calls[1][0]).toContain(`/zip?states=${id}`)
    expect(fetch.mock.calls[1][1].headers).toBeUndefined()
    expect(fetch.mock.calls[1][1].credentials).toBe('omit')
    expect(fetch.mock.calls[1][1].cache).toBe('no-store')
  } finally { vi.unstubAllGlobals() }
})

test('closing import aborts both library and ZIP reads without removing their timeout signals', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ characters: [], total: 0 }))).mockResolvedValueOnce(new Response(new Uint8Array([1])))
  const reads = new AbortController()
  vi.stubGlobal('fetch', fetch)
  try {
    await listCharacters('test-only-key', 0, reads.signal)
    await downloadCharacter(id, reads.signal)
    const signals = fetch.mock.calls.map(c => c[1].signal as AbortSignal)
    expect(signals.every(s => s !== reads.signal && !s.aborted)).toBe(true)
    reads.abort()
    expect(signals.every(s => s.aborted && s.reason.name === 'AbortError')).toBe(true)
  } finally { vi.unstubAllGlobals() }
})


test('import bounds repeated logical sheet references before decoding their images', async () => {
  const { project } = await readCharacterZip(await zip(await pixelLabFiles()))
  const m = structuredClone(project.manifest)
  m.rig.animations = [{ id: 'idle', cells: 120, loop: true, frames: [{ cell: 0, ms: 100 }] }]
  m.items = Array.from({ length: 200 }, (_, i) => ({ ...structuredClone(m.items[0]), id: i ? `item-${i}` : 'base', slot: i ? 'head' : 'body',
    layers: [{ id: 'main' as const, role: 'fg' as const, z: 10, cell: { w: 256, h: 256 }, sheets: { idle: 'same.png' } }] }))
  await expect(readCharacterZip(await zip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(m)) }]))).rejects.toThrow('including repeated frame references')
  m.items[0].layers[0].cell!.w = -256
  await expect(readCharacterZip(await zip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(m)) }]))).rejects.toThrow('invalid layer size')
})


test.each(['source-only', 'source-exceeds-canonical'] as const)('v2 bounds the actual source sheet references before PNG materialization: %s', async (layout) => {
  const { project } = await readCharacterZip(await zip(await pixelLabFiles()))
  const m = structuredClone(project.manifest); m.format = 'pixeldoll/2'
  m.rig.animations = [{ id: 'idle', cells: 120, loop: true, frames: [{ cell: 0, ms: 100 }] }, { id: 'rest', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
  m.items = Array.from({ length: 200 }, (_, i) => ({ ...structuredClone(m.items[0]), id: i ? `item-${i}` : 'base', slot: i ? 'head' : 'body',
    layers: [{ id: 'main' as const, role: 'fg' as const, z: 10, cell: { w: 256, h: 256 }, sourceSheets: { idle: 'same.png' }, ...(layout === 'source-exceeds-canonical' ? { sheets: { rest: 'canonical.png' } } : {}) }] }))
  // No PNG exists: this specific error proves the allocation guard runs before any sheet is decoded/sliced.
  await expect(readCharacterZip(await zip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(m)) }]))).rejects.toThrow('including repeated frame references')
})

test('v2 sourceSheets-only imports preserve legitimate oversize96px source pixels and shared geometry', async () => {
  const { project } = await readCharacterZip(await zip(await pixelLabFiles()))
  const m = structuredClone(project.manifest); m.format = 'pixeldoll/2'
  m.rig.animations = [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
  m.items = [m.items[0]]
  m.items[0].layers = [{ id: 'main', role: 'fg', z: 10, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 75 }, sourceSheets: { idle: 'source.png' } }]
  const sheet = makeImg(96, 96 * m.rig.directions.length)
  for (let row = 0; row < m.rig.directions.length; row++) sheet.data.set([110 + row, 80, 50, 255], ((row * 96 + 60) * 96 + 47) * 4)
  const imported = await readCharacterZip(await zip([{ name: 'manifest.json', data: enc.encode(JSON.stringify(m)) }, { name: 'source.png', data: await encodePngBytes(sheet) }]))
  const layer = imported.project.manifest.items[0].layers[0]
  expect(layer.cell).toEqual({ w: 96, h: 96 }); expect(layer.pivot).toEqual({ x: 48, y: 75 })
  for (const [row, dir] of m.rig.directions.entries()) {
    const image = cellImg(imported.project, layer, 'idle', dir.id, 0)!
    expect([...image.data.slice((60 * 96 + 47) * 4, (60 * 96 + 47) * 4 + 4)]).toEqual([110 + row, 80, 50, 255])
  }
})
