import { expect, test } from 'vitest';
import { bakedFrame, cellImg, composeCell } from '../../src/lib/compose/compose.ts';
import { recolour } from '../../src/lib/dress/dress.ts';
import { exportFiles, exportZip } from '../../src/lib/export/export.ts';
import { exportManifest, validate } from '../../src/lib/export/generic.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { projectEntries, readCharacterZip } from '../../src/lib/store/import.ts';
import type { Manifest, Project } from '../../src/lib/store/manifest.ts';
import { zip } from '../../src/lib/store/zip.ts';

const hash = `sha256:${'0'.repeat(64)}` as const;
const options = { engines: ['generic'] as const, baked: true, exportedAt: '2026-10-23T00:00:00.000Z' };
const opts = () => ({ ...options, engines: [...options.engines] });
const crop = (im: Img, x: number, y: number, w: number, h: number): Img => {
  const out = makeImg(w, h);
  for (let row = 0; row < h; row++) out.data.set(im.data.subarray(((y + row) * im.w + x) * 4, ((y + row) * im.w + x + w) * 4), row * w * 4);
  return out;
};

async function fixture(): Promise<Project> {
  const body = makeImg(64, 64), second = makeImg(64, 64), sword = makeImg(96, 96);
  body.data.set([100, 100, 100, 255], (10 * 64 + 10) * 4);
  second.data.set([100, 100, 100, 255], (11 * 64 + 11) * 4);
  // One pixel outside the body cell and one pixel over it, so a clipped/misaligned bake fails.
  sword.data.set([128, 128, 128, 255], 0);
  sword.data.set([128, 128, 128, 255], (26 * 96 + 26) * 4);
  const b = await cellHash(body), b2 = await cellHash(second), sw = await cellHash(sword);
  return {
    images: new Map([[b, body], [b2, second], [sw, sword]]),
    manifest: {
      name: 'Export contract', app: 'test', format: 'pixeldoll/2',
      rig: { baseItem: 'base', baseHash: hash, cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 },
        directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
        animations: [
          { id: 'walk', cells: 2, loop: false, frames: [{ cell: 1, ms: 80 }, { cell: 0, ms: 180 }, { cell: 1, ms: 100 }] },
          { id: 'strike', cells: 2, loop: true, frames: [{ cell: 0, ms: 200 }, { cell: 1, ms: 100 }] },
        ] },
      slots: [{ id: 'body', z: 10, class: 'base' }, { id: 'main_hand', z: 20, class: 'held' }],
      items: [
        { id: 'base', name: 'Body', slot: 'body', status: 'accepted', baseHash: hash, mirror: 'flip', materials: ['skin'], provenance: [], prompt: '',
          layers: [{ id: 'main', role: 'fg', z: 10, cells: { walk: { south: [b, null], east: [b2, b] }, strike: { south: [b, null] } } }] },
        { id: 'sword', name: 'Sword', slot: 'main_hand', status: 'accepted', baseHash: hash, mirror: 'flip', materials: ['metal'], provenance: [], prompt: '',
          layers: [{ id: 'main', role: 'fg', z: 20, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 }, cells: { walk: { south: [sw, null], east: [sw, sw] } } }] },
      ],
      materials: [
        { id: 'skin', owner: 'base', label: 'Skin', ramp: ['#646464'], defaultVariant: 'azure', variants: {} },
        { id: 'metal', owner: 'sword', label: 'Metal', ramp: ['#808080'], linkTo: 'skin', variants: {} },
      ],
      presets: [
        { id: 'default', name: 'Default', items: { main_hand: 'sword' }, variants: {} },
        { id: 'red', name: 'Red', items: { main_hand: 'sword' }, variants: { skin: 'tint:#ff0000' } },
      ],
    },
  };
}

test('public export materialises procedural defaults, linked defaults and every preset without changing the source', async () => {
  const p = await fixture(), before = structuredClone(p.manifest);
  const { manifest: m } = exportManifest(p, opts());
  for (const mat of m.materials) {
    expect(mat.variants.azure).toHaveLength(1);
    expect(mat.variants['tint:#ff0000']).toHaveLength(1);
  }
  expect(m.items[1].layers[0].sourceSheets?.walk).toBe('sources/layers/main_hand/sword/main/walk.png');
  expect(p.manifest).toEqual(before);
  const result = await exportFiles(p, opts());
  expect(result.errors).toEqual([]);
  const files = new Map(result.entries.map((e) => [e.name, e.data]));
  for (const item of m.items) {
    const l = item.layers[0], src = p.manifest.items.find((it) => it.id === item.id)!.layers[0];
    const canonical = await decodePngBytes(files.get(l.sheets!.walk)!);
    const source = await decodePngBytes(files.get(l.sourceSheets!.walk)!);
    const w = l.cell!.w, h = l.cell!.h;
    expect(crop(canonical, 0, 0, w, h)).toEqual(cellImg(recolour(p, {}), src, 'walk', 'south', 0));
    expect(crop(source, 0, 0, w, h)).toEqual(cellImg(p, src, 'walk', 'south', 0));
  }
});

test('encoded strips and oversized baked sheets match the compositor, including mirrored rows and preset palettes', async () => {
  const p = await fixture(), result = await exportFiles(p, opts());
  expect(result.errors).toEqual([]);
  const files = new Map(result.entries.map((e) => [e.name, e.data]));
  const m = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))) as Manifest;
  expect(m.export?.bakedCell).toEqual({ w: 96, h: 96 });
  expect(m.export?.bakedPivot).toEqual({ x: 48, y: 76 });
  for (const pr of m.presets) for (const a of m.rig.animations) {
    const baked = await decodePngBytes(files.get(`baked/${pr.id}/${a.id}.png`)!);
    for (const [row, d] of m.rig.directions.entries()) for (let c = 0; c < a.cells; c++) {
      expect(crop(baked, c * 96, row * 96, 96, 96)).toEqual(composeCell(recolour(p, pr.variants), pr.items, a.id, d.id, c, bakedFrame(m)));
    }
  }
  const strips = [...files.keys()].filter((path) => path.startsWith('generic/') && path.endsWith('.png'));
  expect(strips).toContain('generic/sword_main/walk_west_strip2.png');
  expect(strips).not.toContain('generic/sword_main/strike_south_strip2.png');
  expect(strips).not.toContain('generic/base_main/strike_east_strip2.png');
  const west = await decodePngBytes(files.get('generic/sword_main/walk_west_strip2.png')!);
  const expected = cellImg(recolour(p, {}), p.manifest.items[1].layers[0], 'walk', 'west', 0)!;
  expect(crop(west, 0, 0, 96, 96)).toEqual(expected);
  expect(m.rig.animations[0].frames).toEqual(p.manifest.rig.animations[0].frames);
  expect(new TextDecoder().decode(files.get('generic/README.txt'))).toContain('including repeated indices');
});

test('raw export round-trips through editable and source-sheet-only archives with exact outfit pixels', async () => {
  const p = await fixture(), result = await exportFiles(p, opts());
  for (const entries of [result.entries, result.entries.filter((e) => e.name !== 'project.json' && !e.name.startsWith('cells/'))]) {
    const restored = (await readCharacterZip(await zip(entries))).project;
    for (const pr of p.manifest.presets) for (const dir of p.manifest.rig.directions) for (let c = 0; c < 2; c++) {
      expect(composeCell(recolour(restored, pr.variants), pr.items, 'walk', dir.id, c, bakedFrame(p.manifest)))
        .toEqual(composeCell(recolour(p, pr.variants), pr.items, 'walk', dir.id, c, bakedFrame(p.manifest)));
    }
  }
});

test('stale exclusion preserves linked outfit palettes while removing dangling owners and worn stale items', async () => {
  const p = await fixture();
  const stale = structuredClone(p.manifest.items[1]);
  stale.id = 'old'; stale.materials = ['old_palette']; stale.baseHash = `sha256:${'1'.repeat(64)}`;
  p.manifest.items.push(stale);
  p.manifest.materials.push({ id: 'old_palette', owner: 'old', label: 'Old', ramp: ['#909090'], variants: {}, defaultVariant: 'azure' });
  p.manifest.materials[1].linkTo = 'old_palette';
  p.manifest.presets[0].items.main_hand = 'old';
  p.manifest.presets[1].variants = { old_palette: 'tint:#ff0000' };
  const result = await exportFiles(p, opts());
  expect(result.errors).toEqual([]);
  expect(result.warnings).toContain('old: stale (baseHash differs from the rig), excluded');
  const files = new Map(result.entries.map((e) => [e.name, e.data]));
  const m = JSON.parse(new TextDecoder().decode(files.get('manifest.json'))) as Manifest;
  expect(m.items.map((it) => it.id)).toEqual(['base', 'sword']);
  expect(m.materials.map((mat) => mat.id)).toEqual(['skin', 'metal']);
  expect(m.materials[1].linkTo).toBeUndefined();
  expect(m.materials[1].defaultVariant).toBe('azure');
  expect(m.presets[1].variants.metal).toBe('tint:#ff0000');
  expect(m.presets[0].items.main_hand).toBeNull();
  const restored = (await readCharacterZip(await zip(result.entries.filter((e) => e.name !== 'project.json' && !e.name.startsWith('cells/'))))).project;
  for (const [i, pr] of m.presets.entries()) {
    const expected = composeCell(recolour({ ...p, manifest: { ...p.manifest, items: p.manifest.items.filter((it) => it.id !== 'old') } }, p.manifest.presets[i].variants), pr.items, 'walk', 'south', 0, bakedFrame(m));
    expect(composeCell(recolour(restored, pr.variants), pr.items, 'walk', 'south', 0, bakedFrame(m))).toEqual(expected);
    expect(crop(await decodePngBytes(files.get(`baked/${pr.id}/walk.png`)!), 0, 0, 96, 96)).toEqual(expected);
  }
});

test('export refuses fractional indices, stale or invisible bodies, duplicate output paths and unsafe paths', async () => {
  const fractional = await fixture();
  fractional.manifest.rig.animations[0].frames[0].cell = 0.5;
  fractional.manifest.rig.animations[1].cells = 1.5;
  expect(validate(fractional).filter((e) => e.includes('integer'))).toHaveLength(2);
  const stale = await fixture(); stale.manifest.items[0].baseHash = `sha256:${'1'.repeat(64)}`;
  expect((await exportFiles(stale, opts())).errors.join()).toContain('base body is stale');
  const invisible = await fixture(); invisible.manifest.items[0].layers[0].cells = {};
  expect((await exportFiles(invisible, opts())).errors.join()).toContain('no visible');
  const duplicate = await fixture(); duplicate.manifest.presets[1].id = duplicate.manifest.presets[0].id;
  const dup = await exportZip(duplicate, opts());
  expect(dup.zip).toBeNull(); expect(dup.entries).toEqual([]); expect(dup.errors.join()).toContain('duplicate preset id');
  const unsafe = await fixture(); unsafe.manifest.presets[0].id = '../outside';
  const bad = await exportZip(unsafe, opts());
  expect(bad.zip).toBeNull(); expect(bad.entries).toEqual([]); expect(bad.errors.join()).toContain('preset id "../outside" is invalid');
});

test('sparse moves remain exportable and empty moves produce an explicit playback warning', async () => {
  const p = await fixture();
  p.manifest.items[0].layers[0].cells!.strike = {};
  const result = await exportFiles(p, opts());
  expect(result.errors).toEqual([]);
  expect(result.warnings).toContain('strike: no base frames; playback is unavailable for this move');
  expect(result.entries.some((e) => e.name === 'generic/base_main/walk_south_strip2.png')).toBe(true);
});

test('Aseprite native limits surface as actionable export errors with no partial archive', async () => {
  const p = await fixture();
  p.manifest.rig.animations[0].frames[0].ms = 65536;
  const result = await exportZip(p, { ...opts(), engines: ['aseprite'] });
  expect(result.errors.join()).toContain('Aseprite frame duration');
  expect(result.zip).toBeNull();
  expect(result.entries).toEqual([]);
});

test('foreground layer contracts reject broken clock layouts on import and every export target', async () => {
  for (const layout of ['background-only', 'duplicate', 'mismatched-role', 'empty'] as const) {
    const p = await fixture(), layers = p.manifest.items[0].layers;
    if (layout === 'background-only') Object.assign(layers[0], { id: 'bg', role: 'bg' });
    if (layout === 'duplicate') layers.push(structuredClone(layers[0]));
    if (layout === 'mismatched-role') Object.assign(layers[0], { id: 'main', role: 'bg' });
    if (layout === 'empty') layers.length = 0;
    expect(validate(p).join()).toContain('foreground');
    await expect(readCharacterZip(await zip(await projectEntries(p)))).rejects.toThrow(/foreground/);
    for (const engine of ['godot', 'unity', 'phaser', 'gdevelop', 'aseprite', 'generic'] as const) {
      const result = await exportZip(p, { ...opts(), engines: [engine] });
      expect(result.errors.join()).toContain('foreground');
      expect(result.zip).toBeNull();
      expect(result.entries).toEqual([]);
    }
  }
  const split = await fixture(), fg = split.manifest.items[0].layers[0];
  fg.id = 'fg'; split.manifest.items[0].layers.push({ ...structuredClone(fg), id: 'bg', role: 'bg' });
  expect(validate(split)).toEqual([]);
});

test('invalid source and variant RGB values fail before image processing or native code generation', async () => {
  for (const value of ['#gggggg', '#123', '#12345678', 123, null]) {
    for (const variant of [false, true]) {
      const p = await fixture();
      const ramp = [value] as unknown as `#${string}`[];
      if (variant) p.manifest.materials[0].variants.bad = ramp;
      else p.manifest.materials[0].ramp = ramp;
      const result = await exportZip(p, opts());
      expect(result.errors.join()).toContain('#RRGGBB');
      expect(result.zip).toBeNull();
    }
  }
});

test('export refuses simultaneous clipping slots but permits alternate items, empty slots and stale covers', async () => {
  const p = await fixture();
  p.manifest.slots.push({ id: 'head', z: 100, class: 'rigid', clips: ['main_hand'] }, { id: 'face_acc', z: 110, class: 'rigid', clips: ['main_hand'] });
  const cover = (id: string, slot: string) => ({ ...structuredClone(p.manifest.items[0]), id, slot, materials: [] });
  p.manifest.items.push(cover('hat', 'head'), cover('cap', 'head'));
  expect((await exportFiles(p, opts())).errors).toEqual([]); // two hats cannot be equipped together
  p.manifest.items.push(cover('mask', 'face_acc'));
  expect(validate(p)).toEqual([]); // preview/import retain their richer clipping rules
  const result = await exportZip(p, opts());
  expect(result.errors.join()).toContain('head, face_acc can cover it together');
  expect(result.zip).toBeNull(); expect(result.entries).toEqual([]);
  p.manifest.slots.find((s) => s.id === 'head')!.hides = ['main_hand'];
  expect((await exportFiles(p, opts())).errors).toEqual([]); // covered item is always hidden
  p.manifest.items.find((it) => it.id === 'hat')!.hides = []; // an item can override its slot's hiding
  expect((await exportFiles(p, opts())).errors.join()).toContain('head, face_acc');
  p.manifest.items.at(-1)!.baseHash = `sha256:${'1'.repeat(64)}`;
  expect((await exportFiles(p, opts())).errors).toEqual([]);
});

test('export scale accepts fractions and refuses invalid values without a partial archive', async () => {
  const p = await fixture();
  for (const pixelsPerUnit of [0, -1, NaN, Infinity, null as unknown as number]) {
    const result = await exportZip(p, { ...opts(), pixelsPerUnit });
    expect(result.errors.join()).toContain('positive finite');
    expect(result.zip).toBeNull(); expect(result.entries).toEqual([]);
  }
  const result = await exportFiles(p, { ...opts(), pixelsPerUnit: 2.5 });
  expect(result.errors).toEqual([]);
  const m = JSON.parse(new TextDecoder().decode(result.entries.find((e) => e.name === 'manifest.json')!.data)) as Manifest;
  expect(m.export!.pixelsPerUnit).toBe(2.5);
});

test('fractional and nonfinite depths cannot silently collapse in native integer properties', async () => {
  for (const z of [1.5, NaN, Infinity, 2147483648, -2147483649]) {
    for (const location of ['layer', 'slot', 'override']) {
      const p = await fixture();
      if (location === 'layer') p.manifest.items[0].layers[0].z = z;
      if (location === 'slot') p.manifest.slots[0].z = z;
      if (location === 'override') p.manifest.slots[0].zOverrides = [{ layer: 'fg', z }];
      expect((await exportFiles(p, opts())).errors.join()).toContain('finite integer');
    }
  }
});
