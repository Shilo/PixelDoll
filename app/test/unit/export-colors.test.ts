import { atlasName } from '../../src/lib/export/phaser.ts'
import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { decodePngBytes } from '../../src/lib/image/pngraw.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { composeCell, bakedFrame, over } from '../../src/lib/compose/compose.ts'
import { recolor } from '../../src/lib/dress/dress.ts'
import { withColorVariants } from '../../src/lib/export/colors.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { readAseprite } from '../../src/lib/export/aseprite.ts'
import { readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import type { Manifest, Project } from '../../src/lib/store/manifest.ts'
import { expectBytes, expectPixels } from './pixels.ts'

async function source(): Promise<Project> {
  const images: Project['images'] = new Map(), hash = `sha256:${'0'.repeat(64)}` as const
  const rows = [['base', 'body', '#112233', 20, 55], ['hair', 'hair', '#443322', 5, 18], ['hat', 'head', '#223344', 4, 10]] as const
  const items = await Promise.all(rows.map(async ([id, slot, color, top, bottom], i) => {
    const im = makeImg(64, 64), rgb = color.match(/[0-9a-f]{2}/g)!.map((x) => parseInt(x, 16))
    for (let y = top; y < bottom; y++) for (let x = 20; x < 35; x++) im.data.set([...rgb, 255], (y * 64 + x) * 4)
    const h = await cellHash(im); images.set(h, im)
    return { id, name: id, slot, status: 'accepted' as const, mirror: 'flip' as const, materials: [`${id}_tone`], prompt: id, provenance: [], baseHash: hash,
      layers: [{ id: 'main' as const, role: 'fg' as const, z: [10, 110, 130][i], cells: { idle: { south: [h], east: [h] } } }] }
  }))
  return { images, manifest: { format: 'pixeldoll/1', app: 'PixelDoll', name: 'Colored',
    rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: hash,
      directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] },
    slots: [{ id: 'body', z: 10, class: 'base' }, { id: 'hair', z: 110, class: 'worn' }, { id: 'head', z: 130, class: 'rigid', clips: ['hair'] }], items,
    materials: rows.map(([id, , color]) => ({ id: `${id}_tone`, owner: id, label: id, ramp: [color], variants: { gold: ['#aabbcc'], rose: ['#cc1122'] } })),
    presets: ['gold', 'rose'].map((id) => ({ id, name: id, items: { body: 'base', hair: 'hair', head: 'hat' }, variants: { base_tone: id, hair_tone: id, hat_tone: id } })),
  } }
}

test('all engine exports preserve body and equipment palettes, tuck masks, mirrored pixels and editable source', async () => {
  const p = await source(), before = structuredClone(p.manifest)
  const exported = await exportFiles(p, { engines: ['generic', 'godot', 'unity', 'phaser', 'aseprite'], baked: true })
  expect(exported.errors).toEqual([])
  expect(p.manifest).toEqual(before)
  const files = new Map(exported.entries.map((e) => [e.name, e.data])), text = new TextDecoder()
  const m = JSON.parse(text.decode(files.get('manifest.json'))) as Manifest
  const engineOnly = await readCharacterZip(await zip(exported.entries.filter((e) => e.name !== 'project.json' && !e.name.startsWith('cells/'))))
  for (const [i, preset] of p.manifest.presets.entries()) for (const dir of ['south', 'east', 'west'] as const) {
    const expected = composeCell(recolor(p, preset.variants), preset.items, 'idle', dir, 0, bakedFrame(p.manifest))
    const restored = engineOnly.project.manifest.presets[i]
    expectPixels(composeCell(recolor(engineOnly.project, restored.variants), restored.items, 'idle', dir, 0, bakedFrame(engineOnly.project.manifest)), expected, dir)
    const baked = await decodePngBytes(files.get(`baked/${preset.id}/idle.png`)!)
    const row = p.manifest.rig.directions.findIndex((d) => d.id === dir)
    expectBytes(baked.data.slice(row * 64 * 64 * 4, (row + 1) * 64 * 64 * 4), expected.data, dir)
  }
  const overlay = m.items.find((it) => it.id === m.presets[0].items.body)!
  expect(overlay.slot).toBe('body')
  expect(m.items.filter((it) => it.slot === 'body')).toHaveLength(1)
  expect(text.decode(files.get(`godot/${overlay.id}_main.tres`))).toContain(overlay.layers[0].sheets!.idle)
  const unity = JSON.parse(text.decode(files.get('unity/pixeldoll_unity.json')))
  expect(unity.preset).toContainEqual({ slot: 'body', item: overlay.id })
  expect(unity.items.find((it: { id: string }) => it.id === overlay.id)).toBeTruthy()
  const phaser = JSON.parse(text.decode(files.get(`phaser/${atlasName(overlay.id, 'main', 'idle')}`)))
  expect(phaser.frames.idle_west_0.pivot).toEqual({ x: 0.5, y: 60 / 64 })
  const ase = await readAseprite(files.get('aseprite/Colored.aseprite')!)
  expect(ase.layers.find((l) => l.name === 'body.base')!.visible).toBe(true)
  const flat = makeImg(ase.w, ase.h)
  for (const cel of [...ase.frames[0].cels].sort((a, b) => (a.layer + a.z) - (b.layer + b.z))) if (ase.layers[cel.layer].visible && cel.img) over(flat, cel.img, cel.x, cel.y)
  expect(flat).toEqual(composeCell(recolor(p, p.manifest.presets[0].variants), p.manifest.presets[0].items, 'idle', 'south', 0))
  expect((await readCharacterZip(await zip(exported.entries))).project.manifest).toEqual(before)
  const again = await exportFiles(p, { engines: ['generic'], baked: false })
  const m2 = JSON.parse(text.decode(again.entries.find((e) => e.name === 'manifest.json')!.data)) as Manifest
  expect(m2.items.map((it) => it.id)).toEqual(m.items.map((it) => it.id))
})


test('palette copies deduplicate outfit combinations and avoid item/slot collisions', async () => {
  const p = await source(), first = await withColorVariants(p)
  const collisionId = first.manifest.presets[0].items.body_color!
  p.manifest.slots.push({ id: 'body_color', z: 5, class: 'worn' })
  p.manifest.items.push({ ...structuredClone(p.manifest.items[2]), id: collisionId, materials: [] })
  p.manifest.presets.push({ ...structuredClone(p.manifest.presets[0]), id: 'same-again' })
  const result = await withColorVariants(p)
  expect(result.manifest.presets[0].items.body_color_2).toBe(`${collisionId}-2`)
  expect(result.manifest.presets[2].items).toEqual(result.manifest.presets[0].items)
  expect(result.manifest.items.length).toBe(p.manifest.items.length + 6)
  expect(new Set(result.manifest.items.map((it) => it.id)).size).toBe(result.manifest.items.length)
})


test('a later colored body and linked material keep first source outfit unchanged', async () => {
  const p = await source()
  p.manifest.materials.find((m) => m.id === 'hair_tone')!.linkTo = 'base_tone'
  p.manifest.presets.unshift({ id: 'original', name: 'Original', items: { body: 'base', hair: 'hair', head: 'hat' }, variants: {} })
  delete p.manifest.presets[1].variants.hair_tone
  const normalized = await withColorVariants(p)
  expect(normalized.manifest.presets[0].items.body_color).toBeTruthy()
  expect(normalized.manifest.presets[1].items.body_color).toBeTruthy()
  expect(normalized.manifest.presets[1].items.hair).not.toBe('hair')
  for (const [i, preset] of p.manifest.presets.entries()) {
    expect(composeCell(normalized, normalized.manifest.presets[i].items, 'idle', 'south', 0)).toEqual(composeCell(recolor(p, preset.variants), preset.items, 'idle', 'south', 0))
  }
})


test('body-color overlays preserve body hiding and clipping from equipped gear', async () => {
  for (const mode of ['item-hide', 'slot-hide', 'slot-clip', 'uncolored-clip'] as const) {
    const p = await source()
    if (mode === 'item-hide') p.manifest.items[2].hides = ['body']
    if (mode === 'slot-hide') p.manifest.slots[2].hides = ['body']
    if (mode === 'slot-clip' || mode === 'uncolored-clip') p.manifest.slots[2].clips = ['body', 'hair']
    if (mode === 'uncolored-clip') for (const preset of p.manifest.presets) preset.variants = {}
    const out = await exportFiles(p, { engines: ['generic'], baked: false })
    expect(out.errors).toEqual([])
    const restored = await readCharacterZip(await zip(out.entries.filter((e) => e.name !== 'project.json' && !e.name.startsWith('cells/'))))
    for (const [i, preset] of p.manifest.presets.entries()) expect(composeCell(recolor(restored.project, restored.project.manifest.presets[i].variants), restored.project.manifest.presets[i].items, 'idle', 'south', 0)).toEqual(composeCell(recolor(p, preset.variants), preset.items, 'idle', 'south', 0))
  }
})
