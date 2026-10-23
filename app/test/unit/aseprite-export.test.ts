import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';
import { asepriteFile, readAseprite } from '../../src/lib/export/aseprite.ts';
import { coreFiles, exportManifest } from '../../src/lib/export/generic.ts';
import { bakedFrame, composeCell, withTuckVariants } from '../../src/lib/compose/compose.ts';
import { recolour } from '../../src/lib/dress/dress.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Item, Manifest, Project } from '../../src/lib/store/manifest.ts';

async function fixture() {
  const body = makeImg(4, 4), hair = makeImg(4, 4), hat = makeImg(4, 4), sword = makeImg(6, 6);
  for (const q of [5, 6, 9, 10, 13, 14]) body.data.set([100, 100, 100, 255], q * 4);
  for (let q = 0; q < 16; q++) hair.data.set([100, 100, 100, 255], q * 4);
  for (const q of [1, 2, 5, 6]) hat.data.set([100, 100, 100, 255], q * 4);
  for (const q of [0, 7, 14, 21, 28, 35]) sword.data.set([100, 100, 100, 255], q * 4);
  const images = new Map<string, Img>();
  const hashes = await Promise.all([body, hair, hat, sword].map(async (im) => { const h = await cellHash(im); images.set(h, im); return h; }));
  const item = (id: string, slot: string, hash: typeof hashes[number], z: number, oversize = false): Item => ({
    id, name: id, slot, status: 'accepted', mirror: 'flip', materials: [id], prompt: '', baseHash: hashes[0], provenance: [],
    layers: [{ id: 'main', role: 'fg', z, ...(oversize ? { cell: { w: 6, h: 6 }, pivot: { x: 3, y: 5 } } : {}), cells: { walk: { south: [hash, hash], east: [hash, hash] } } }],
  });
  const p: Project = { images, manifest: {
    format: 'pixeldoll/2', name: 'Aseprite regression', app: 'test',
    rig: { cell: { w: 4, h: 4 }, pivot: { x: 2, y: 4 }, baseItem: 'base', baseHash: hashes[0], directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
      animations: [{ id: 'walk', cells: 2, loop: false, frames: [{ cell: 0, ms: 125 }, { cell: 1, ms: 50 }, { cell: 1, ms: 75 }] }] },
    slots: [{ id: 'body', class: 'base', z: 10 }, { id: 'hair', class: 'rigid', z: 110 }, { id: 'head', class: 'rigid', z: 130, clips: ['hair'] },
      { id: 'main_hand', class: 'held', z: 150, zOverrides: [{ layer: 'fg', dir: 'east', cell: 1, z: 8 }] }],
    items: [item('base', 'body', hashes[0], 10), item('hair', 'hair', hashes[1], 110), item('hat', 'head', hashes[2], 130), item('sword', 'main_hand', hashes[3], 150, true)],
    materials: ['base', 'hair', 'hat', 'sword'].map((id) => ({ id, owner: id, label: id, ramp: ['#646464'], variants: { red: ['#ff0000'], blue: ['#0000ff'] },
      ...(id === 'hat' ? { linkTo: 'hair' } : {}), ...(['hair', 'base'].includes(id) ? { defaultVariant: 'blue' } : {}) })),
    presets: [{ id: 'default', name: 'Default', items: { hair: 'hair', head: 'hat', main_hand: 'sword' }, variants: { base: 'red' } }],
  } };
  const project = await withTuckVariants(p), m = exportManifest(project, { engines: ['aseprite'], baked: true }).manifest;
  const sheets = new Map(coreFiles(project, m).filter((f): f is { name: string; data: Img } => typeof f.data === 'object' && 'w' in f.data).map((f) => [f.name, f.data]));
  return { project, m, sheets };
}

test('Aseprite keeps layered pivots, first-outfit palettes, tucked visibility, tags and linked held cels', async () => {
  const { m, sheets } = await fixture();
  const a = await readAseprite(await asepriteFile(m, sheets));
  expect([a.w, a.h]).toEqual([6, 6]);
  expect(a.tags.map((t) => [t.name, t.from, t.to, t.repeat])).toEqual([['walk_south', 0, 2, 1], ['walk_east', 3, 5, 1], ['walk_west', 6, 8, 1]]);
  expect(a.frames.map((f) => f.ms)).toEqual([125, 50, 75, 125, 50, 75, 125, 50, 75]);
  expect(a.slices[0]).toEqual({ name: 'pivot', pivot: [3, 5] });
  expect(a.layers.find((l) => l.name === 'hair.hair')!.visible).toBe(false);
  expect(a.layers.find((l) => l.name === 'hair.hair~hat')!.visible).toBe(true);
  const cel = (name: string) => a.frames[0].cels.find((c) => c.layer === a.layers.findIndex((l) => l.name === name))!;
  expect([cel('body.base').x, cel('body.base').y]).toEqual([1, 1]);
  expect(cel('body.base').img!.data.slice(20, 24)).toEqual(new Uint8ClampedArray([255, 0, 0, 255]));
  expect(cel('head.hat').img!.data.slice(4, 8)).toEqual(new Uint8ClampedArray([0, 0, 255, 255]));
  expect(cel('main_hand.sword').img!.data.slice(0, 4)).toEqual(new Uint8ClampedArray([100, 100, 100, 255]));
  expect(a.frames[2].cels.every((c) => c.type === 1 && c.link === 1)).toBe(true);
  expect(a.frames[4].cels.find((c) => c.layer === a.layers.findIndex((l) => l.name === 'main_hand.sword'))!.z).toBeLessThan(0);
});

test('Aseprite refuses native-format overflow and empty timelines instead of writing corrupt documents', async () => {
  const { m, sheets } = await fixture();
  for (const ms of [0, 65536, 1.5]) {
    m.rig.animations[0].frames[0].ms = ms;
    await expect(asepriteFile(m, sheets)).rejects.toThrow('frame duration');
  }
  m.rig.animations[0].frames[0].ms = 125;
  m.rig.animations[0].frames = Array.from({ length: 21846 }, () => ({ cell: 0, ms: 1 }));
  await expect(asepriteFile(m, sheets)).rejects.toThrow('frame count');
  m.rig.animations[0].frames = [];
  await expect(asepriteFile(m, sheets)).rejects.toThrow('at least one animation frame');
  m.rig.animations[0].frames = [{ cell: 0, ms: 100 }];
  (m.rig.animations[0] as Manifest['rig']['animations'][number] & { directions: string[] }).directions = [];
  await expect(asepriteFile(m, sheets)).rejects.toThrow('at least one animation frame');
});

const native = process.env.ASEPRITE_BIN ?? 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Aseprite\\Aseprite.exe';
test.skipIf(!existsSync(native))('native Aseprite renders every frame exactly like the PixelDoll compositor', async () => {
  const { project, m, sheets } = await fixture(), folder = resolve('node_modules/.cache/aseprite-review');
  mkdirSync(folder, { recursive: true });
  const file = resolve(folder, 'regression.aseprite'), png = resolve(folder, 'native.png'), json = resolve(folder, 'native.json');
  writeFileSync(file, await asepriteFile(m, sheets));
  const run = spawnSync(native, ['--batch', file, '--list-tags', '--list-slices', '--format', 'json-array', '--data', json, '--sheet-type', 'horizontal', '--sheet', png], { encoding: 'utf8', timeout: 30000 });
  expect(run.error).toBeUndefined(); expect(run.status, run.stdout + run.stderr).toBe(0);
  const sheet = await decodePngBytes(readFileSync(png));
  const metadata = JSON.parse(readFileSync(json, 'utf8')) as { frames: { duration: number }[]; meta: { frameTags: { name: string }[]; slices: { name: string; keys: { pivot: { x: number; y: number } }[] }[] } };
  expect(metadata.frames.map((f) => f.duration)).toEqual([125, 50, 75, 125, 50, 75, 125, 50, 75]);
  expect(metadata.meta.frameTags.map((t) => t.name)).toEqual(['walk_south', 'walk_east', 'walk_west']);
  expect(metadata.meta.slices[0].keys[0].pivot).toEqual({ x: 3, y: 5 });
  const coloured = recolour(project, m.presets[0].variants), bf = bakedFrame(m);
  let frame = 0;
  for (const dir of m.rig.directions) for (const entry of m.rig.animations[0].frames) {
    const expected = composeCell(coloured, m.presets[0].items, 'walk', dir.id, entry.cell, bf), actual = makeImg(bf.w, bf.h);
    for (let y = 0; y < bf.h; y++) actual.data.set(sheet.data.subarray((y * sheet.w + frame * bf.w) * 4, (y * sheet.w + (frame + 1) * bf.w) * 4), y * bf.w * 4);
    expect(actual.data, `${dir.id} cell ${entry.cell}`).toEqual(expected.data);
    frame++;
  }
}, 60000);
