import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { decodePngBytes } from '../../src/lib/image/pngraw.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { composeCell, bakedFrame, over } from '../../src/lib/compose/compose.ts'
import { recolour } from '../../src/lib/dress/dress.ts'
import { withColourVariants } from '../../src/lib/export/colours.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { readAseprite } from '../../src/lib/export/aseprite.ts'
import { readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import type { Manifest, Project } from '../../src/lib/store/manifest.ts'

async function source(): Promise<Project> {
  const images: Project['images'] = new Map(), hash = `sha256:${'0'.repeat(64)}` as const
  const rows = [['base', 'body', '#112233', 20, 55], ['hair', 'hair', '#443322', 5, 18], ['hat', 'head', '#223344', 4, 10]] as const
  const items = await Promise.all(rows.map(async ([id, slot, colour, top, bottom], i) => {
    const im = makeImg(64, 64), rgb = colour.match(/[0-9a-f]{2}/g)!.map((x) => parseInt(x, 16))
    for (let y = top; y < bottom; y++) for (let x = 20; x < 35; x++) im.data.set([...rgb, 255], (y * 64 + x) * 4)
    const h = await cellHash(im); images.set(h, im)
    return { id, name: id, slot, status: 'accepted' as const, mirror: 'flip' as const, materials: [`${id}_tone`], prompt: id, provenance: [], baseHash: hash,
      layers: [{ id: 'main' as const, role: 'fg' as const, z: [10, 110, 130][i], cells: { idle: { south: [h], east: [h] } } }] }
  }))
  return { images, manifest: { format: 'pixeldoll/1', app: 'PixelDoll', name: 'Coloured',
    rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: hash,
      directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] },
    slots: [{ id: 'body', z: 10, class: 'base' }, { id: 'hair', z: 110, class: 'worn' }, { id: 'head', z: 130, class: 'rigid', clips: ['hair'] }], items,
    materials: rows.map(([id, , colour]) => ({ id: `${id}_tone`, owner: id, label: id, ramp: [colour], variants: { gold: ['#aabbcc'], rose: ['#cc1122'] } })),
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
    const expected = composeCell(recolour(p, preset.variants), preset.items, 'idle', dir, 0, bakedFrame(p.manifest))
    const restored = engineOnly.project.manifest.presets[i]
    expect(composeCell(engineOnly.project, restored.items, 'idle', dir, 0, bakedFrame(engineOnly.project.manifest))).toEqual(expected)
    const baked = await decodePngBytes(files.get(`baked/${preset.id}/idle.png`)!)
    const row = p.manifest.rig.directions.findIndex((d) => d.id === dir)
    expect(baked.data.slice(row * 64 * 64 * 4, (row + 1) * 64 * 64 * 4)).toEqual(expected.data)
  }
  const overlay = m.items.find((it) => it.id === m.presets[0].items.body_colour)!
  expect(overlay.hides).toContain('body')
  expect(m.items.filter((it) => it.slot === 'body')).toHaveLength(1)
  expect(text.decode(files.get(`godot/${overlay.id}_main.tres`))).toContain(overlay.layers[0].sheets!.idle)
  const unity = JSON.parse(text.decode(files.get('unity/pixeldoll_unity.json')))
  expect(unity.preset).toContainEqual({ slot: 'body_colour', item: overlay.id })
  expect(unity.items.find((it: { id: string }) => it.id === overlay.id).hides).toContain('body')
  const phaser = JSON.parse(text.decode(files.get(`phaser/${overlay.id}_main_idle.json`)))
  expect(phaser.frames.idle_west_0.pivot).toEqual({ x: 0.5, y: 60 / 64 })
  const ase = await readAseprite(files.get('aseprite/Coloured.aseprite')!)
  expect(ase.layers.find((l) => l.name === 'body.base')!.visible).toBe(false)
  const flat = makeImg(ase.w, ase.h)
  for (const cel of [...ase.frames[0].cels].sort((a, b) => (a.layer + a.z) - (b.layer + b.z))) if (ase.layers[cel.layer].visible && cel.img) over(flat, cel.img, cel.x, cel.y)
  expect(flat).toEqual(composeCell(recolour(p, p.manifest.presets[0].variants), p.manifest.presets[0].items, 'idle', 'south', 0))
  expect((await readCharacterZip(await zip(exported.entries))).project.manifest).toEqual(before)
  const again = await exportFiles(p, { engines: ['generic'], baked: false })
  const m2 = JSON.parse(text.decode(again.entries.find((e) => e.name === 'manifest.json')!.data)) as Manifest
  expect(m2.items.map((it) => it.id)).toEqual(m.items.map((it) => it.id))
})


test('palette copies deduplicate outfit combinations and avoid item/slot collisions', async () => {
  const p = await source(), first = await withColourVariants(p)
  const collisionId = first.manifest.presets[0].items.body_colour!
  p.manifest.slots.push({ id: 'body_colour', z: 5, class: 'worn' })
  p.manifest.items.push({ ...structuredClone(p.manifest.items[2]), id: collisionId, materials: [] })
  p.manifest.presets.push({ ...structuredClone(p.manifest.presets[0]), id: 'same-again' })
  const result = await withColourVariants(p)
  expect(result.manifest.presets[0].items.body_colour_2).toBe(`${collisionId}-2`)
  expect(result.manifest.presets[2].items).toEqual(result.manifest.presets[0].items)
  expect(result.manifest.items.length).toBe(p.manifest.items.length + 6)
  expect(new Set(result.manifest.items.map((it) => it.id)).size).toBe(result.manifest.items.length)
})


test('a later coloured body and linked material keep first source outfit unchanged', async () => {
  const p = await source()
  p.manifest.materials.find((m) => m.id === 'hair_tone')!.linkTo = 'base_tone'
  p.manifest.presets.unshift({ id: 'original', name: 'Original', items: { body: 'base', hair: 'hair', head: 'hat' }, variants: {} })
  delete p.manifest.presets[1].variants.hair_tone
  const normalized = await withColourVariants(p)
  expect(normalized.manifest.presets[0].items.body_colour).toBeTruthy()
  expect(normalized.manifest.presets[1].items.body_colour).toBeTruthy()
  expect(normalized.manifest.presets[1].items.hair).not.toBe('hair')
  for (const [i, preset] of p.manifest.presets.entries()) {
    expect(composeCell(normalized, normalized.manifest.presets[i].items, 'idle', 'south', 0)).toEqual(composeCell(recolour(p, preset.variants), preset.items, 'idle', 'south', 0))
  }
})


test('body-colour overlays preserve body hiding and clipping from equipped gear', async () => {
  for (const mode of ['item-hide', 'slot-hide', 'slot-clip', 'uncoloured-clip'] as const) {
    const p = await source()
    if (mode === 'item-hide') p.manifest.items[2].hides = ['body']
    if (mode === 'slot-hide') p.manifest.slots[2].hides = ['body']
    if (mode === 'slot-clip' || mode === 'uncoloured-clip') p.manifest.slots[2].clips = ['body', 'hair']
    if (mode === 'uncoloured-clip') for (const preset of p.manifest.presets) preset.variants = {}
    const out = await exportFiles(p, { engines: ['generic'], baked: false })
    expect(out.errors).toEqual([])
    const restored = await readCharacterZip(await zip(out.entries.filter((e) => e.name !== 'project.json' && !e.name.startsWith('cells/'))))
    for (const [i, preset] of p.manifest.presets.entries()) expect(composeCell(restored.project, restored.project.manifest.presets[i].items, 'idle', 'south', 0)).toEqual(composeCell(recolour(p, preset.variants), preset.items, 'idle', 'south', 0))
  }
})
