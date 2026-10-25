import { expect, test } from 'vitest'
import { composeCell, over } from '../../src/lib/compose/compose.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { validate } from '../../src/lib/export/generic.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { decodePngBytes } from '../../src/lib/image/pngraw.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import type { Engine, Item, Project } from '../../src/lib/store/manifest.ts'

// Round 3 (docs/research/generation-quality-round3-2026-10-25.md): a hood that hides the body's ear tips exports as a baked
// "<base>~<hood>" body every engine swaps to while the hood is worn; nothing else of the body changes.
async function project(cut: Item['baseCut']): Promise<Project> {
  const body = makeImg(64, 64), hood = makeImg(64, 64), ear = 12 * 64 + 20
  body.data.set([200, 150, 120, 255], ear * 4)
  body.data.set([200, 150, 120, 255], (40 * 64 + 20) * 4)
  hood.data.set([150, 20, 30, 255], (12 * 64 + 22) * 4)
  const b = await cellHash(body), h = await cellHash(hood), baseHash = `sha256:${'0'.repeat(64)}` as const
  const item = (id: string, slot: string, z: number, image: typeof b, extra: Partial<Item> = {}): Item => ({
    id, name: id, slot, status: 'accepted', baseHash, mirror: 'flip', materials: [], provenance: [], prompt: '',
    layers: [{ id: 'main', role: 'fg', z, cells: { idle: { south: [image] } } }], ...extra,
  })
  return {
    images: new Map([[b, body], [h, hood]]),
    manifest: {
      name: 'Hidden ears', app: 'test', format: 'pixeldoll/2',
      rig: { baseItem: 'base', baseHash, cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 },
        directions: [{ id: 'south' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] },
      slots: [{ id: 'body', class: 'base', z: 10 }, { id: 'head', class: 'rigid', z: 130 }],
      items: [item('base', 'body', 10, b), item('hood', 'head', 130, h, { baseCut: cut })], materials: [],
      presets: [{ id: 'default', name: 'Default', items: { body: 'base', head: 'hood' }, variants: {} }],
    },
  }
}

test('a hood that hides the ear tips exports a baked body variant for every engine', async () => {
  const p = await project({ idle: { south: [[12 * 64 + 20]] } })
  const engines: Engine[] = ['generic', 'godot', 'unity', 'phaser', 'gdevelop', 'aseprite']
  const out = await exportFiles(p, { engines, baked: true })
  expect(out.errors).toEqual([])
  const files = new Map(out.entries.map((e) => [e.name, e.data]))
  const manifest = JSON.parse(new TextDecoder().decode(files.get('manifest.json')!))
  expect(manifest.items.find((i: Item) => i.id === 'base~hood')).toMatchObject({ variantOf: 'base', under: 'hood' })
  const shown = composeCell(p, p.manifest.presets[0].items, 'idle', 'south', 0)
  expect(shown.data[(12 * 64 + 20) * 4 + 3]).toBe(0) // the ear is hidden while the hood is worn
  expect(shown.data[(40 * 64 + 20) * 4 + 3]).toBe(255) // the rest of the body is untouched
  expect(composeCell(p, { body: 'base' }, 'idle', 'south', 0).data[(12 * 64 + 20) * 4 + 3]).toBe(255) // and back without it
  expect(await decodePngBytes(files.get('baked/default/idle.png')!)).toEqual(shown)
  const sheet = [...files.keys()].find((k) => k.includes('base~hood') && k.endsWith('.png'))
  expect(sheet, 'a sheet for the body variant').toBeTruthy()
  const variant = await decodePngBytes(files.get(sheet!)!), visible = makeImg(64, 64)
  over(visible, variant); over(visible, p.images.get(p.manifest.items[1].layers[0].cells!.idle!.south![0]!)!)
  expect(visible).toEqual(shown)
})

test('malformed hidden body pixels are rejected', async () => {
  for (const bad of [{ walk: { south: [[1]] } }, { idle: { east: [[1]] } }, { idle: { south: [[5, 3]] } }, { idle: { south: [[64 * 64]] } }, { idle: { south: [[1], [2]] } }])
    expect(validate(await project(bad as unknown as Item['baseCut'])), JSON.stringify(bad)).toContain('hood: invalid hidden body pixels (baseCut)')
})

test('an exact copy keeps the hidden ear px, flipped for a target view the source mirrored', async () => {
  const { createDesign } = await import('../../src/lib/equipment/design.ts')
  const { prepareCopy } = await import('../../src/lib/equipment/copy.ts')
  const { flipH } = await import('../../src/lib/rig/mirror.ts')
  const body = makeImg(64, 64), hood = makeImg(64, 64), ear = 12 * 64 + 20, earW = 12 * 64 + 43
  body.data.set([200, 150, 120, 255], ear * 4); body.data.set([200, 150, 120, 255], (40 * 64 + 20) * 4); hood.data.set([150, 20, 30, 255], (12 * 64 + 22) * 4)
  const bodyW = flipH(body), [b, h, bw] = await Promise.all([body, hood, bodyW].map(cellHash)), baseHash = `sha256:${'0'.repeat(64)}` as const
  const item = (id: string, slot: string, z: number, cells: Item['layers'][number]['cells'], extra: Partial<Item> = {}): Item => ({ id, name: id, slot, status: 'accepted', baseHash, mirror: 'flip', materials: [], provenance: [], prompt: 'a red hood', layers: [{ id: 'main', role: 'fg', z, cells }], ...extra })
  const rig = (directions: Project['manifest']['rig']['directions']) => ({ baseItem: 'base', baseHash, cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions, animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] })
  const slots = [{ id: 'body', class: 'base', z: 10 }, { id: 'head', class: 'rigid', anchor: 'head', z: 130 }] as Project['manifest']['slots']
  const src: Project = { images: new Map([[b, body], [h, hood]]), manifest: { name: 's', app: 'test', format: 'pixeldoll/2', rig: rig([{ id: 'east' }, { id: 'west', mirrorOf: 'east' }]), slots, items: [item('base', 'body', 10, { idle: { east: [b] } }), item('hood', 'head', 130, { idle: { east: [h] } }, { baseCut: { idle: { east: [[ear]] } } })], materials: [], presets: [{ id: 'default', name: 'd', items: { body: 'base', head: 'hood' }, variants: {} }] } }
  const tgt: Project = { images: new Map([[b, body], [bw, bodyW]]), manifest: { name: 't', app: 'test', format: 'pixeldoll/2', rig: rig([{ id: 'east' }, { id: 'west' }]), slots, items: [item('base', 'body', 10, { idle: { east: [b], west: [bw] } })], materials: [], presets: [{ id: 'default', name: 'd', items: { body: 'base' }, variants: {} }] } }
  const cand = await prepareCopy(await createDesign(src, 'hood'), tgt), id = cand.itemId
  const seen = (dir: 'east' | 'west', px: number) => composeCell(cand.project, { body: 'base', head: id }, 'idle', dir, 0).data[px * 4 + 3]
  expect(seen('east', ear)).toBe(0)
  expect(seen('west', earW)).toBe(0)
  expect(seen('east', 40 * 64 + 20)).toBe(255)
  expect(validate(cand.project)).toEqual([])
})
