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
  expect(m.name).toBe('Imported character') // State labels are not a group name, and this fixture has no shared prompt.
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
  expect((await readCharacterZip(bytes, id, [id, 'second'])).project.manifest).toEqual(all.project.manifest)
  const base = all.project.manifest.items[0].layers[0]
  expect(base.cells!.walking.south).toEqual(base.cells!['armored-state-walking'].south)
  expect(all.project.manifest.rig.directions.map(d => d.id)).toEqual(['south', 'east', 'west'])
  const second = await readCharacterZip(bytes, 'second', 'all')
  expect(second.project.manifest.rig.animations.map(a => a.id)).toEqual(['default', 'walking', 'right_punch', 'test-adventurer-walking'])
  expect(second.project.manifest.rig.animations.some(a => a.id === 'walking-copy')).toBe(false)
  await expect(readCharacterZip(bytes, id, ['missing'])).rejects.toThrow('selected move states')
})

test('PixelLab standing rotations and chosen animation states are independent, including Default alone', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[1].frames.rotations = { south: 'Second/rotations/south.png' }
  meta.states[1].frames.animations = { attack: meta.states[0].frames.animations.walking }
  entries.push({ name: 'Second/rotations/south.png', data: await encodePngBytes(sprite(180)) })
  entries.find(entry => entry.name.endsWith('frame_000.png'))!.data = await encodePngBytes(sprite(222))
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  for (const [base, moves, expected] of [
    [id, undefined, ['default', 'walking']],
    [id, [], ['default']],
    [id, ['second'], ['default', 'attack']],
    [id, [id], ['default', 'walking']],
    [id, 'all', ['default', 'walking', 'attack']],
    ['second', [], ['default']],
    ['second', [id], ['default', 'walking']],
  ] as const) {
    const imported = await readCharacterZip(bytes, base, moves), { manifest } = imported.project
    expect(manifest.rig.animations.map(animation => animation.id)).toEqual(expected)
    const layer = manifest.items[0].layers[0]
    const standing = cellImg(imported.project, layer, 'default', 'south', 0)!
    expect(standing.data[(27 * 64 + 28) * 4]).toBe(base === id ? 100 : 180)
    expect(manifest.rig.animations[0].cells).toBe(1)
    const animated = manifest.rig.animations[1]
    if (animated) expect(cellImg(imported.project, layer, animated.id, 'south', 0)!.data[(27 * 64 + 28) * 4]).toBe(222)
  }
})

test('PixelLab can exclude unreadable selected animations while still validating the standing artwork', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states = meta.states.slice(0, 1)
  meta.states[0].frames.animations = null
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  await expect(readCharacterZip(bytes, id)).rejects.toThrow('Uncheck that state’s moves')
  const standing = await readCharacterZip(bytes, id, [])
  expect(standing.project.manifest.rig.animations.map(animation => animation.id)).toEqual(['default'])
  expect(standing.states?.[0].animations).toBeNull()
  meta.states[0].frames.rotations.south = 'Missing.png'
  entries[0].data = enc.encode(JSON.stringify(meta))
  await expect(readCharacterZip(await zip(entries), id, [])).rejects.toThrow('Missing file: Missing.png')
})

test('PixelLab explicit character names and shared appearance descriptions stay independent of the standing state', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  const prompt = '  A slim athletic human\nwith a completely bald head, charcoal shorts, and a confident relaxed appearance.  '
  for (const state of meta.states) state.character.prompt = prompt
  const name = prompt.replace(/\s+/g, ' ').trim().slice(0, 60).trim()
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  for (const selected of [id, 'second']) {
    const manifest = (await readCharacterZip(bytes, selected, [])).project.manifest
    expect(manifest.name).toBe(name)
    expect(manifest.name).not.toBe(meta.states.find((state: { character: { id: string } }) => state.character.id === selected).character.name)
    expect(manifest.items[0].prompt).toBe(prompt)
  }
  meta.name = 'Actual character title'
  entries[0].data = enc.encode(JSON.stringify(meta))
  expect((await readCharacterZip(await zip(entries), 'second', [])).project.manifest.name).toBe('Actual character title')
  delete meta.name; meta.character = { name: 'Another explicit title' }
  entries[0].data = enc.encode(JSON.stringify(meta))
  expect((await readCharacterZip(await zip(entries), id, [])).project.manifest.name).toBe('Another explicit title')
})

test.each([undefined, '', 'A different appearance', {}])('PixelLab uses a generic name when appearance prompts are not shared unambiguously: %j', async prompt => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[1].character.prompt = prompt
  entries[0].data = enc.encode(JSON.stringify(meta))
  expect((await readCharacterZip(await zip(entries), id, [])).project.manifest.name).toBe('Imported character')
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

test.each([[32, 32], [33, 33], [48, 63], [63, 48], [64, 65], [65, 64], [96, 80], [127, 128], [128, 127], [255, 256], [256, 255]])('PixelLab centers odd and rectangular %i×%i source canvases without resampling', async (width, height) => {
  const image = makeImg(width, height)
  image.data.set([150, 70, 20, 255], 0)
  image.data.set([20, 70, 150, 255], image.data.length - 4)
  const imported = await readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Rectangular frame' })) },
    { name: 'rotations/south.png', data: await encodePngBytes(image) },
  ]))
  const size = Math.max(64, width, height), canvas = Math.max(width, height)
  const x = Math.floor((size - width) / 2), y = Math.max(0, size - canvas - 4) + Math.floor((canvas - height) / 2)
  const result = cellImg(imported.project, imported.project.manifest.items[0].layers[0], 'default', 'south', 0)!
  expect([result.w, result.h]).toEqual([size, size])
  expect([...result.data.slice((y * size + x) * 4, (y * size + x) * 4 + 4)]).toEqual([150, 70, 20, 255])
  const last = ((y + height - 1) * size + x + width - 1) * 4
  expect([...result.data.slice(last, last + 4)]).toEqual([20, 70, 150, 255])
  expect(result.data.filter((value, index) => index % 4 === 3 && value)).toHaveLength(2)
})

test('PixelLab applies its disclosed alpha threshold and refuses wholly empty animation frames', async () => {
  const image = makeImg(64, 64)
  image.data.set([70, 80, 90, 127], 0)
  image.data.set([80, 90, 100, 128], 4)
  image.data.set([90, 100, 110, 200], 8)
  const entries = [
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Alpha policy' })) },
    { name: 'rotations/south.png', data: await encodePngBytes(image) },
  ]
  const imported = await readCharacterZip(await zip(entries)), layer = imported.project.manifest.items[0].layers[0]
  expect([...cellImg(imported.project, layer, 'default', 'south', 0)!.data.slice(0, 12)]).toEqual([0, 0, 0, 0, 80, 90, 100, 255, 90, 100, 110, 255])
  expect(imported.warnings).toContain('Partially transparent edges were converted to pixel-art transparency.')
  entries.push({ name: 'animations/disappear/south/frame_0.png', data: await encodePngBytes(makeImg(64, 64)) })
  await expect(readCharacterZip(await zip(entries))).rejects.toThrow('animations/disappear/south/frame_0.png is an empty frame')
})

test.each([null, [], 17, 'bad', {}])('PixelLab refuses malformed selected direction frame lists with a clear error: %j', async frames => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[0].frames.animations.walking.south = frames
  entries[0].data = enc.encode(JSON.stringify(meta))
  await expect(readCharacterZip(await zip(entries))).rejects.toThrow('walking/south animation must contain 1–120 frame paths')
})

test('PixelLab reports missing referenced images and directions before accepting a partial character', async () => {
  const entries = await pixelLabFiles()
  await expect(readCharacterZip(await zip(entries.filter(entry => !entry.name.endsWith('frame_001.png'))))).rejects.toThrow('Missing file: Idle/animations/walking/south/frame_001.png')
  const meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[0].frames.animations.walking.north = meta.states[0].frames.animations.walking.south
  entries[0].data = enc.encode(JSON.stringify(meta))
  await expect(readCharacterZip(await zip(entries))).rejects.toThrow('walking/north animation has no matching standing view')
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

test('PixelLab bounds unique PNG source pixels by content even when metadata paths have no PNG suffix', async () => {
  const header = await encodePngBytes(makeImg(1, 1)), view = new DataView(header.buffer)
  view.setUint32(16, 4096); view.setUint32(20, 2048)
  const paths = Array.from({ length: 9 }, (_, index) => `Artwork/source-${index}.bin`)
  const metadata = { states: [{ character: { id, name: 'Content limit' }, frames: { rotations: { south: 'base.png' }, animations: { move: { south: paths } } } }] }
  await expect(readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify(metadata)) },
    { name: 'base.png', data: await encodePngBytes(sprite(80)) },
    ...paths.map(name => ({ name, data: header })),
  ]))).rejects.toThrow('archive contains too many image pixels')
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

test.each(['9007199254740992', '9007199254740993', '9'.repeat(400)])('PixelLab refuses unsafe legacy frame indices instead of changing order: %s', async index => {
  const png = await encodePngBytes(sprite(80))
  await expect(readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Unsafe frame number' })) },
    { name: 'rotations/south.png', data: png },
    { name: `animations/walk/south/frame_${index}.png`, data: png },
  ]))).rejects.toThrow('invalid animation frame number')
})

test('PixelLab decodes a repeated source path once while retaining every repeated animation cell', async () => {
  const imageModule = await import('../../src/lib/image/png.ts'), decode = vi.spyOn(imageModule, 'decodePng')
  try {
    const path = 'shared.png', png = await encodePngBytes(sprite(80))
    const metadata = { states: [{ character: { id, name: 'Repeated source' }, frames: { rotations: { south: path }, animations: { hold: { south: [path, path, path] } } } }] }
    const imported = await readCharacterZip(await zip([{ name: 'metadata.json', data: enc.encode(JSON.stringify(metadata)) }, { name: path, data: png }]))
    expect(decode).toHaveBeenCalledOnce()
    const cells = imported.project.manifest.items[0].layers[0].cells!
    expect(cells.hold.south).toEqual([cells.default.south![0], cells.default.south![0], cells.default.south![0]])
    expect(imported.project.manifest.rig.animations.find(a => a.id === 'hold')!.frames).toEqual([{ cell: 0, ms: 100 }, { cell: 1, ms: 100 }, { cell: 2, ms: 100 }])
  } finally { decode.mockRestore() }
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

test.each([null, [], 'bad', 17])('PixelLab marks malformed sibling animation metadata unreadable and permits excluding it: %j', async animations => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[1].frames.animations = animations
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  await expect(readCharacterZip(bytes, id, 'all')).rejects.toMatchObject({
    stateId: id, states: [{ id, name: 'Test adventurer', animations: 1 }, { id: 'second', name: 'Second state', animations: null }],
    message: expect.stringContaining('Uncheck that state’s moves to continue'),
  })
  expect((await readCharacterZip(bytes, id, [id])).project.manifest.rig.animations.map(animation => animation.id)).toEqual(['default', 'walking'])
})

test.each([
  [{ name: 123 }, 'character name must be text'],
  [{ character: { name: 123 } }, 'character name must be text'],
  [{ name: 'Test', prompt: {} }, 'character prompt must be text'],
  [{ name: 'Test', template_id: {} }, 'character template must be text'],
  [{ name: 'Test', view: {} }, 'unsupported camera view'],
  [{ name: 'Test', size: { width: '48', height: 48 } }, 'size must contain positive whole-pixel'],
  [{ name: 'Test', size: { width: 48, height: 1.5 } }, 'size must contain positive whole-pixel'],
])('PixelLab refuses malformed consumed character information before it reaches the UI: %j', async (metadata, message) => {
  await expect(readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify(metadata)) },
    { name: 'rotations/south.png', data: await encodePngBytes(sprite(80)) },
  ]))).rejects.toThrow(message)
})

test('PixelLab preserves optional null fallbacks and ignores metadata fields overridden by the actual character', async () => {
  const entries = [
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: null, prompt: null, template_id: null, view: null, size: null })) },
    { name: 'rotations/south.png', data: await encodePngBytes(sprite(80)) },
  ]
  const fallback = (await readCharacterZip(await zip(entries))).project.manifest
  expect(fallback.name).toBe('Imported character')
  expect(fallback.rig.view).toBe('low top-down')
  expect(fallback.rig.template).toBe('mannequin')
  entries[0].data = enc.encode(JSON.stringify({ name: 'Actual name', prompt: 'Actual prompt', character: { name: 123, prompt: {} } }))
  const overridden = (await readCharacterZip(await zip(entries))).project.manifest
  expect(overridden.name).toBe('Actual name')
  expect(overridden.items[0].prompt).toBe('Actual prompt')
})

test('PixelLab validates selected metadata and included sibling geometry while leaving unused sibling prompts alone', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[0].character.prompt = {}
  entries[0].data = enc.encode(JSON.stringify(meta))
  await expect(readCharacterZip(await zip(entries))).rejects.toMatchObject({ stateId: id, states: expect.any(Array), message: expect.stringContaining('character prompt must be text') })
  meta.states[0].character.prompt = 'Valid base'
  meta.states[1].character.prompt = {}; meta.states[1].character.template_id = {}
  meta.states[1].frames.animations = { attack: meta.states[0].frames.animations.walking }
  entries[0].data = enc.encode(JSON.stringify(meta))
  expect((await readCharacterZip(await zip(entries), id, 'all')).project.manifest.items[0].prompt).toBe('Valid base')
  meta.states[1].character.size = { width: '48', height: 48 }
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  await expect(readCharacterZip(bytes, id, 'all')).rejects.toThrow('invalid size or camera metadata')
  expect((await readCharacterZip(bytes, id, [id])).project.manifest.rig.animations.map(animation => animation.id)).toEqual(['default', 'walking'])
})

test.each(['missing-map', 'empty-map', 'extra-frame', 'extra-frame-without-suffix'] as const)('PixelLab refuses animation PNGs its selected state cannot account for: %s', async layout => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states = meta.states.slice(0, 1)
  if (layout === 'missing-map') delete meta.states[0].frames.animations
  else if (layout === 'empty-map') meta.states[0].frames.animations = {}
  else entries.push({ name: `Idle/animations/walking/south/frame_002${layout === 'extra-frame' ? '.png' : ''}`, data: entries[1].data })
  entries[0].data = enc.encode(JSON.stringify(meta))
  await expect(readCharacterZip(await zip(entries), id, 'all')).rejects.toMatchObject({
    stateId: id, states: [{ id, name: 'Test adventurer', animations: null }],
    message: expect.stringContaining('animation file missing from its metadata'),
  })
})

test.each(['Idle/Variant', 'animations/Variant'])('PixelLab keeps an unreadable nested %s state separate from an included valid state', async folder => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  meta.states[1].folder = folder
  meta.states[1].frames.rotations = { south: `${folder}/rotations/south.png` }
  entries.push({ name: `${folder}/rotations/south.png`, data: entries[1].data }, { name: `${folder}/animations/extra/south/frame_0.png`, data: entries[1].data })
  entries[0].data = enc.encode(JSON.stringify(meta))
  const bytes = await zip(entries)
  const selected = await readCharacterZip(bytes, id, [id])
  expect(selected.project.manifest.rig.animations.map(animation => animation.id)).toEqual(['default', 'walking'])
  expect(selected.states?.find(state => state.id === 'second')?.animations).toBeNull()
  await expect(readCharacterZip(bytes, id, 'all')).rejects.toThrow('Uncheck that state’s moves to continue')
})

test('PixelLab rejects orphan or ambiguously owned animation PNGs without guessing their state', async () => {
  const entries = await pixelLabFiles()
  for (const path of ['Unknown/animations/walk/south/frame_0.png', 'Idle/animations/walking/south/frame_002.png']) {
    const bytes = await zip([...entries, { name: path, data: entries[1].data }])
    await expect(readCharacterZip(bytes)).rejects.toThrow('animation file without an unambiguous state layout')
    expect((await readCharacterZip(bytes, id, [])).project.manifest.rig.animations.map(animation => animation.id)).toEqual(['default'])
  }
})

test('PixelLab metadata references remain authoritative inside animation-named folders and ordinary artwork extras stay harmless', async () => {
  const entries = await pixelLabFiles(), meta = JSON.parse(new TextDecoder().decode(entries[0].data))
  const old = meta.states[0].frames.animations.walking.south[0], path = 'Artwork/animations/explicit custom.PNG'
  meta.states[0].frames.animations.walking.south[0] = path
  entries.find(entry => entry.name === old)!.name = path
  entries[0].data = enc.encode(JSON.stringify(meta))
  entries.push({ name: 'preview.png', data: entries[1].data }, { name: 'Artwork/myanimations/icon.png', data: entries[1].data })
  const imported = await readCharacterZip(await zip(entries))
  expect(imported.project.manifest.rig.animations.map(animation => animation.id)).toEqual(['default', 'walking'])
  expect(imported.project.manifest.items[0].layers[0].cells!.walking.south).toHaveLength(2)
})

test.each([
  ['animations/walk/south/FRAME_0.PNG', 'Unsupported animation frame path'],
  ['animations/walk/south/frame_last.png', 'Unsupported animation frame path'],
  ['animations/walk/south/frame_0-final.png', 'Unsupported animation frame path'],
  ['animations/walk/south/frame_1', 'Unsupported animation frame path'],
  ['rotations/EAST.PNG', 'Unsupported rotation image path'],
  ['rotations/diagonal.png', 'Unsupported rotation image path'],
])('PixelLab refuses unconsumed legacy PNG data instead of importing a partial character: %s', async (path, message) => {
  const png = await encodePngBytes(sprite(80))
  await expect(readCharacterZip(await zip([
    { name: 'metadata.json', data: enc.encode(JSON.stringify({ name: 'Partial character' })) },
    { name: 'rotations/south.png', data: png },
    { name: 'animations/walk/south/frame_0.png', data: png },
    { name: path, data: png },
  ]))).rejects.toThrow(`${message}: ${path}`)
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

test('PixelLab packed spritesheet ZIPs explain the missing frame layout instead of guessing one', async () => {
  await expect(readCharacterZip(await zip([
    { name: 'Character.png', data: await encodePngBytes(sprite(80)) },
    { name: 'Character.json', data: enc.encode(JSON.stringify({ cell_size: 48, rows: [{ animation: 'walk', direction: 'south' }] })) },
  ]))).rejects.toThrow('Arbitrary PNG folders and spritesheet ZIPs need a direction and frame layout')
})

test.each(['../bad', '/absolute', 'C:/bad', 'dir\\bad', 'dir/./bad', 'dir/../bad'])('ZIP paths cannot escape their character root: %s', async name => {
  await expect(unzip(await zip([{ name, data: enc.encode('invalid path') }]))).rejects.toThrow('unsafe file path')
})

test.each(['encrypted', 'compression', 'expanded', 'split'] as const)('ZIP guard rejects %s headers before reading file data', async invalid => {
  const bytes = await zip([{ name: 'a', data: enc.encode('bounded payload') }]), view = new DataView(bytes.buffer)
  const end = bytes.length - 22, central = view.getUint32(end + 16, true)
  if (invalid === 'encrypted') view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true)
  else if (invalid === 'compression') view.setUint16(central + 10, 99, true)
  else if (invalid === 'expanded') view.setUint32(central + 24, 64 * 1024 * 1024 + 1, true)
  else view.setUint16(end + 4, 1, true)
  await expect(unzip(bytes)).rejects.toThrow(invalid === 'split' ? 'Split, ZIP64 or oversized archives' : 'too large, encrypted, or uses unsupported compression')
})

test('ZIP guard limits entry count and rejects an empty file with clear errors', async () => {
  const entries = Array.from({ length: 5001 }, (_, index) => ({ name: `file-${index}`, data: new Uint8Array() }))
  await expect(unzip(await zip(entries))).rejects.toThrow('Split, ZIP64 or oversized archives')
  await expect(unzip(new Uint8Array())).rejects.toThrow('not a supported ZIP archive')
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
  const second = await readCharacterZip(bytes, 'second')
  expect(second.project.manifest.name).toBe('Imported character')
  expect(second.stateId).toBe('second')
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
