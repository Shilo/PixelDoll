import { atlasName } from '../../src/lib/export/phaser.ts'
import { expect, test } from 'vitest'
import { buildRig, type SourceAnim } from '../../src/lib/rig/freeze.ts'
import { DIRECTIONS, cellHash, cellKey, cellKeys, type DirectionName } from '../../src/lib/rig/rig.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { cellImg, composeCell } from '../../src/lib/compose/compose.ts'
import { recolour } from '../../src/lib/dress/dress.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { readAseprite } from '../../src/lib/export/aseprite.ts'
import { readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import type { Item, Layer, Manifest, Project } from '../../src/lib/store/manifest.ts'

const MIRRORS: Partial<Record<DirectionName, DirectionName>> = { west: 'east', 'south-west': 'south-east', 'north-west': 'north-east' }
const cases = [
  { count: 4, independent: false, generated: 3 }, { count: 8, independent: false, generated: 5 },
  { count: 4, independent: true, generated: 4 }, { count: 8, independent: true, generated: 8 },
] as const
function sprite(direction: DirectionName, frame: number, kind: 'body' | 'hair' | 'hat'): Img {
  const im = makeImg(64, 64), index = DIRECTIONS.indexOf(direction)
  const rgba = kind === 'body' ? [30, 60, 90, 255] : kind === 'hair' ? [80, 20, 30, 255] : [20, 90, 40, 255]
  const rect = (left: number, top: number, right: number, bottom: number) => {
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) im.data.set(rgba, (y * 64 + x) * 4)
  }
  if (kind === 'body') { rect(25, 18, 39, 60); rect(17 + index, 40 + frame, 26, 42 + frame) }
  if (kind === 'hair') { rect(18, 8, 44, 22); rect(12 + index, 18 + frame, 19, 20 + frame) }
  if (kind === 'hat') rect(19 + index % 3, 6 + frame, 43 + index % 3, 13 + frame)
  return im
}
async function fixture(count: 4 | 8, independent: boolean) {
  const requested = DIRECTIONS.filter((d) => count === 8 || ['south', 'east', 'north', 'west'].includes(d))
  const generated = requested.filter((d) => independent || !MIRRORS[d])
  const raw: SourceAnim[] = ['idle', 'walk'].map((id) => ({ id, dirs: Object.fromEntries(generated.map((d) => [d, [sprite(d, 0, 'body'), sprite(d, 1, 'body')]])) }))
  const built = await buildRig(raw, { mode: independent ? 'all' : count === 8 ? '8' : '4' })
  expect(built.errors).toEqual([])
  const rig = built.rig, images: Project['images'] = new Map(Object.values(built.cells).map((c) => [c.hash, c.img]))
  const cells: NonNullable<Layer['cells']> = {}
  for (const key of cellKeys(rig)) { const [anim, dir, frame] = key.split('/') as [string, DirectionName, string]; ((cells[anim] ??= {})[dir] ??= [])[+frame] = built.cells[key].hash }
  const base: Item = { id: 'base', name: 'Body', slot: 'body', status: 'accepted', mirror: independent ? 'generate' : 'flip', materials: ['body_colour'], prompt: 'offline fixture', baseHash: rig.baseHash, layers: [{ id: 'main', role: 'fg', z: 10, cells }], provenance: [] }
  rig.rest = {}
  rig.anchors = { hand_r: {} }
  const hand = rig.anchors.hand_r!
  const skeletons: Record<string, Record<string, { x: number; y: number; z: number }>> = {}
  for (const d of generated) {
    const image = sprite(d, 0, 'body'), h = await cellHash(image); images.set(h, image)
    const keypoints = LABELS.map((label) => ({ label, x: (20 + DIRECTIONS.indexOf(d)) / 64, y: label === 'NOSE' ? 0.25 : 0.5 }))
    rig.rest[d] = { image: h, keypoints }
    for (const anim of rig.animations) (anim.sources ??= {})[d] = { route: 'import', reference: h, keypoints: [keypoints, keypoints], measured: [keypoints, keypoints], provenance: [] }
  }
  for (const anim of rig.animations) {
    hand[anim.id] = {}
    for (const d of rig.directions) {
      const sourceX = 20 + DIRECTIONS.indexOf(d.mirrorOf ?? d.id)
      hand[anim.id]![d.id] = d.mirrorOf ? [[63 - sourceX, 32], [62 - sourceX, 32]] : [[sourceX, 32], [sourceX + 1, 32]]
      for (let frame = 0; frame < 2; frame++) skeletons[cellKey(anim.id, d.id, frame)] = { 'RIGHT ARM': { x: d.mirrorOf ? 64 - sourceX : sourceX, y: 32, z: 0 } }
    }
  }
  const equipment: Item[] = []
  for (const [kind, slot, z] of [['hair', 'hair', 110], ['hat', 'head', 130]] as const) {
    const layer: Layer = { id: 'main', role: 'fg', z, cells: {} }
    for (const anim of rig.animations) {
      layer.cells![anim.id] = {}
      for (const d of generated) layer.cells![anim.id]![d] = await Promise.all([0, 1].map(async (frame) => { const im = sprite(d, frame, kind), h = await cellHash(im); images.set(h, im); return h }))
    }
    equipment.push({ id: kind, name: kind, slot, status: 'accepted', mirror: independent ? 'generate' : 'flip', materials: [`${kind}_colour`], prompt: kind, baseHash: rig.baseHash, layers: [layer], provenance: [] })
  }
  const manifest: Manifest = { format: 'pixeldoll/1', name: `${independent ? 'Independent' : 'Legacy'} ${count}`, app: 'test', rig,
    items: [base, ...equipment], slots: [{ id: 'body', z: 10, class: 'base' }, { id: 'hair', z: 110, class: 'worn' }, { id: 'head', z: 130, class: 'rigid', clips: ['hair'] }],
    materials: [
      { id: 'body_colour', owner: 'base', label: 'Body', ramp: ['#1e3c5a'], variants: { gold: ['#d0a050'] } },
      { id: 'hair_colour', owner: 'hair', label: 'Hair', ramp: ['#50141e'], variants: { gold: ['#b08020'] } },
      { id: 'hat_colour', owner: 'hat', label: 'Hat', ramp: ['#145a28'], variants: { gold: ['#f0d080'] } },
    ], presets: [
      { id: 'gold', name: 'Gold', items: { body: 'base', hair: 'hair', head: 'hat' }, variants: { body_colour: 'gold', hair_colour: 'gold', hat_colour: 'gold' } },
      { id: 'original', name: 'Original', items: { body: 'base', hair: 'hair', head: 'hat' }, variants: {} },
    ] }
  return { p: { manifest, images } satisfies Project, requested, generated, skeletons }
}

test.each(cases)('$count directions independent=$independent preserve explicit west and legacy mirrors through editable and engine exports', async ({ count, independent, generated: expectedGenerated }) => {
  const { p, requested, generated, skeletons } = await fixture(count, independent), rig = p.manifest.rig
  expect(rig.directions.map((d) => d.id)).toEqual(requested)
  expect(generated).toHaveLength(expectedGenerated)
  expect(rig.directions.filter((d) => !d.mirrorOf)).toHaveLength(expectedGenerated)
  expect(Object.keys(rig.rest!)).toEqual(generated)
  const base = p.manifest.items[0].layers[0]
  const west = cellImg(p, base, 'idle', 'west', 0)!
  if (independent) {
    expect(west).toEqual(sprite('west', 0, 'body'))
    expect(west).not.toEqual(flipH(sprite('east', 0, 'body')))
    expect(p.images.get(rig.rest!.west!.image)).toEqual(sprite('west', 0, 'body'))
    expect(rig.animations[0].sources!.west!.reference).toBe(rig.rest!.west!.image)
    expect(rig.rest!.west!.keypoints).not.toEqual(rig.rest!.east!.keypoints)
  } else {
    expect(west).toEqual(flipH(sprite('east', 0, 'body')))
    expect(rig.directions.find((d) => d.id === 'west')!.mirrorOf).toBe('east')
  }
  const before = structuredClone(p.manifest)
  const out = await exportFiles(p, { engines: ['generic', 'godot', 'phaser', 'unity', 'aseprite'], baked: true, projectData: { skeletons } })
  expect(out.errors).toEqual([])
  expect(p.manifest).toEqual(before)
  const restored = await readCharacterZip(await zip(out.entries))
  expect(restored.project.manifest).toEqual(before)
  expect(restored.extra.skeletons).toEqual(skeletons)
  expect(cellImg(restored.project, restored.project.manifest.items[0].layers[0], 'idle', 'west', 0)).toEqual(west)
  const engineOnly = await readCharacterZip(await zip(out.entries.filter((e) => e.name !== 'project.json' && !e.name.startsWith('cells/'))))
  // Engine rows are already materialized; legacy sheet import clears mirror metadata without altering any exported pixels.
  expect(engineOnly.project.manifest.rig.directions.every((d) => !d.mirrorOf)).toBe(true)
  for (const [i, preset] of p.manifest.presets.entries()) {
    const expected = recolour(p, preset.variants), pr = engineOnly.project.manifest.presets[i]
    for (const anim of rig.animations) for (const dir of requested) for (let frame = 0; frame < anim.cells; frame++)
      expect(composeCell(recolour(engineOnly.project, pr.variants), pr.items, anim.id, dir, frame)).toEqual(composeCell(expected, preset.items, anim.id, dir, frame))
  }
  const files = new Map(out.entries.map((e) => [e.name, e.data])), text = new TextDecoder()
  const m = JSON.parse(text.decode(files.get('manifest.json'))) as Manifest
  const unity = JSON.parse(text.decode(files.get('unity/pixeldoll_unity.json')))
  expect(unity.directions).toEqual(requested)
  const visibleBody = m.items.find((it) => it.id === m.presets[0].items.body)!
  const atlas = JSON.parse(text.decode(files.get(`phaser/${atlasName(visibleBody.id, 'main', 'idle')}`)))
  expect(atlas.frames.idle_west_0.frame.y).toBe(requested.indexOf('west') * 64)
  expect(text.decode(files.get(`godot/${visibleBody.id}_main.tres`))).toContain('&"idle_west"')
  const ase = await readAseprite(out.entries.find((e) => e.name.endsWith('.aseprite'))!.data)
  expect(ase.frames).toHaveLength(2 * requested.length * 2)
  expect(ase.tags.map((t) => t.name)).toEqual(rig.animations.flatMap((a) => requested.map((d) => `${a.id}_${d}`)))
}, 30_000)
