import { expect, test } from 'vitest';
import { cellImg, withTuckVariants } from '../../src/lib/compose/compose.ts';
import { deriveMaterials, recolour, variantOf } from '../../src/lib/dress/dress.ts';
import { applyDress, dressOf } from '../../src/lib/dress/project.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { validate } from '../../src/lib/export/generic.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import type { Item, Material, Project } from '../../src/lib/store/manifest.ts';

const rgba = (im: ReturnType<typeof makeImg>, x = 32, y = 21) => [...im.data.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
async function fixture(): Promise<Project> {
  const body = makeImg(64, 64), hair = makeImg(64, 64), helmet = makeImg(64, 64);
  body.data.set([100, 100, 100, 255], (55 * 64 + 32) * 4);
  for (const y of [20, 21]) hair.data.set([100, 100, 100, 255], (y * 64 + 32) * 4);
  helmet.data.set([250, 250, 250, 255], (20 * 64 + 32) * 4);
  const b = await cellHash(body), h = await cellHash(hair), c = await cellHash(helmet), hash = `sha256:${'0'.repeat(64)}` as const;
  const item = (id: string, slot: string, image: typeof h): Item => ({ id, name: id, slot, status: 'accepted', mirror: 'flip', materials: [id], prompt: id, baseHash: hash, provenance: [], layers: [{ id: 'main', role: 'fg', z: slot === 'head' ? 130 : 110, cells: { walk: { south: [image] } } }] });
  const material = (id: string, color = '#646464'): Material => ({ id, owner: id, label: id, ramp: [color as `#${string}`], variants: { blue: ['#0000ff'], red: ['#ff0000'] } });
  return { images: new Map([[b, body], [h, hair], [c, helmet]]), manifest: { format: 'pixeldoll/2', name: 'Palette fixture', app: 'test', rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 56 }, baseItem: 'base', baseHash: hash, directions: [{ id: 'south' }], animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] }, materials: [material('base'), material('a'), material('b'), material('helmet', '#fafafa')], slots: [{ id: 'body', z: 10, class: 'base', required: true }, { id: 'hair', z: 110, class: 'rigid' }, { id: 'head', z: 130, class: 'rigid', clips: ['hair'] }], items: [item('base', 'body', b), item('a', 'hair', h), item('b', 'hair', h), item('helmet', 'head', c)], presets: [{ id: 'old-outfit', name: 'Old outfit', items: { body: 'base', hair: 'a', head: 'helmet' }, variants: {} }] } };
}

test('v2 derives independent ramps despite identical RGBs, while v1 keeps its historical contract', async () => {
  const p = await fixture();
  p.manifest.materials = []; p.manifest.items.forEach((it) => { it.materials = []; });
  deriveMaterials(p);
  expect(p.manifest.items.filter((it) => it.id !== 'helmet').every((it) => it.materials.length)).toBe(true);
  expect(validate(p)).toEqual([]);
  p.manifest.format = 'pixeldoll/1';
  expect(validate(p).some((s) => s.includes('colour'))).toBe(true);
});

test('identical hashes recolour per owner including an unworn or unmodified second copy', async () => {
  const p = await fixture(), a = p.manifest.items[1].layers[0], b = p.manifest.items[2].layers[0];
  const colored = recolour(p, { a: 'blue', b: 'red' });
  expect(rgba(cellImg(colored, a, 'walk', 'south', 0)!)).toEqual([0, 0, 255, 255]);
  expect(rgba(cellImg(colored, b, 'walk', 'south', 0)!)).toEqual([255, 0, 0, 255]);
  const onlyA = recolour(p, { a: 'blue' });
  expect(rgba(cellImg(onlyA, b, 'walk', 'south', 0)!)).toEqual([100, 100, 100, 255]);
  expect(rgba(cellImg(p, a, 'walk', 'south', 0)!)).toEqual([100, 100, 100, 255]);
});

test('tucked variants resolve the original owner-local layer rather than another copy sharing its hash', async () => {
  const p = await fixture(), tucked = await withTuckVariants(recolour(p, { a: 'blue', b: 'red' }));
  for (const [id, expected] of [['a~helmet', [0, 0, 255, 255]], ['b~helmet', [255, 0, 0, 255]]] as const) {
    const layer = tucked.manifest.items.find((it) => it.id === id)!.layers[0];
    expect(rgba(cellImg(tucked, layer, 'walk', 'south', 0)!)).toEqual([...expected]);
  }
});

test('stale autosave preserves newly fitted palettes and cannot restore deleted owners', async () => {
  const p = await fixture(), old = structuredClone(dressOf(p.manifest));
  p.manifest.materials.push({ id: 'new', owner: 'new', label: 'new', ramp: ['#010203'], variants: {} });
  p.manifest.items.push({ ...structuredClone(p.manifest.items[1]), id: 'new', materials: ['new'] });
  p.manifest.items = p.manifest.items.filter((it) => it.id !== 'a');
  applyDress(p.manifest, old);
  expect(p.manifest.materials.some((m) => m.id === 'new')).toBe(true);
  expect(p.manifest.items.find((it) => it.id === 'new')!.materials).toEqual(['new']);
  expect(p.manifest.materials.some((m) => m.owner === 'a')).toBe(false);
});

test('validation refuses missing and foreign material IDs, including invalid defaults', async () => {
  const p = await fixture();
  p.manifest.items[1].materials = ['base', 'missing'];
  expect(validate(p).filter((s) => s.includes('foreign material'))).toHaveLength(2);
  p.manifest.materials[0].defaultVariant = 'not-a-colour';
  expect(validate(p).some((s) => s.includes('default colourway'))).toBe(true);
});

test('default colourway survives old outfits; canonical sheets render it and sourceSheets retain independent raw roles', async () => {
  const p = await fixture();
  p.manifest.materials.find((m) => m.id === 'a')!.defaultVariant = 'blue';
  expect(variantOf(p.manifest, {}, 'a')).toBe('blue');
  expect(rgba(cellImg(recolour(p, {}), p.manifest.items[1].layers[0], 'walk', 'south', 0)!)).toEqual([0, 0, 255, 255]);
  const result = await exportFiles(p, { engines: ['generic', 'godot', 'phaser', 'unity', 'aseprite'], baked: true });
  expect(result.errors).toEqual([]);
  const files = new Map(result.entries.map((e) => [e.name, e.data]));
  const m = JSON.parse(new TextDecoder().decode(files.get('manifest.json')!));
  const layer = m.items.find((it: Item) => it.id === 'a').layers[0];
  expect(rgba(await decodePngBytes(files.get(layer.sheets.walk)!))).toEqual([0, 0, 255, 255]);
  expect(rgba(await decodePngBytes(files.get(layer.sourceSheets.walk)!))).toEqual([100, 100, 100, 255]);
  const restored = (await readCharacterZip(await zip(result.entries))).project;
  expect(restored.manifest.materials.find((m) => m.id === 'a')!.defaultVariant).toBe('blue');
  expect(rgba(cellImg(recolour(restored, {}), restored.manifest.items.find((it) => it.id === 'a')!.layers[0], 'walk', 'south', 0)!)).toEqual([0, 0, 255, 255]);
});
