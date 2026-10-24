import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { exportManifest } from '../../src/lib/export/generic.ts';
import { unityFiles, unityJson } from '../../src/lib/export/unity.ts';
import { composeCell, over } from '../../src/lib/compose/compose.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import type { Item, Project } from '../../src/lib/store/manifest.ts';

async function manifest() {
  const project = await loadFixture(async (path) => readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)));
  return exportManifest(project, { engines: ['unity'], baked: false }).manifest;
}

test('Unity native export declares only required assemblies and isolates character types', async () => {
  const m = await manifest();
  const files = unityFiles(m);
  const get = (name: string) => String(files.find((f) => f.name === name)!.data);
  const runtime = JSON.parse(get('unity/Runtime/PixelDoll.Runtime.asmdef')) as { name: string };
  const editor = JSON.parse(get('unity/Editor/PixelDoll.Editor.asmdef')) as { references: string[]; includePlatforms: string[] };
  expect(editor.references).toEqual([runtime.name, 'Unity.2D.Sprite.Editor']);
  expect(editor.includePlatforms).toEqual(['Editor']);
  expect(get('unity/Editor/PixelDollImporter.cs')).not.toContain('SpriteLibraryAsset');
  expect(get('unity/Runtime/Paperdoll.cs')).toContain(`namespace ${runtime.name.slice(0, -'.Runtime'.length)}`);
  const second = unityFiles({ ...m, name: `${m.name} 2` });
  expect(second.find((f) => f.name.endsWith('Runtime.asmdef'))!.data).not.toEqual(get('unity/Runtime/PixelDoll.Runtime.asmdef'));
  expect(unityFiles(structuredClone(m))).toEqual(files);
});

test('Unity serializes fractional pixels per unit as a native float', async () => {
  const m = await manifest();
  m.export!.pixelsPerUnit = 2.5;
  expect(unityJson(m).ppu).toBe(2.5);
  const data = String(unityFiles(m).find((f) => f.name === 'unity/Runtime/Paperdoll.cs')!.data);
  expect(data).toContain('public float ppu;');
});

test('Unity JSON retains all presets, original source sheets and item-local palette metadata', async () => {
  const m = await manifest();
  m.materials.push({ id: 'body_color', owner: m.items[0].id, label: 'Body', ramp: ['#112233'], variants: {} });
  m.items[0].materials = ['body_color'];
  m.materials[0].defaultVariant = 'warm';
  m.materials[0].variants.warm = m.materials[0].ramp.map(() => '#ff0000');
  m.presets[0].variants = { [m.materials[0].id]: 'warm' };
  m.presets.push({ id: 'empty', name: 'Empty', items: { head: null }, variants: {} });
  m.items[0].layers[0].sourceSheets = { walk: 'sources/body-walk.png' };
  const u = unityJson(m);
  expect(u.presets.map((p) => p.id)).toEqual(m.presets.map((p) => p.id));
  expect(u.presets[1].items).toContainEqual({ slot: 'head', item: '' });
  expect(u.presets[0].variants).toContainEqual({ id: m.materials[0].id, variant: 'warm' });
  expect(u.materials[0].variants).toContainEqual({ id: 'warm', ramp: m.materials[0].variants.warm });
  expect(u.items[0].materials).toEqual(m.items[0].materials);
  const walk = m.rig.animations.findIndex((a) => a.id === 'walk');
  expect(u.items[0].layers[0].sourceSheets[walk]).toBe('sources/body-walk.png');
  expect(u.animations.find((a) => a.id === 'cross-punch')!.directions).toEqual(['south']);
});

test('Unity importer preserves native asset references and lossless geometry settings', async () => {
  const m = await manifest();
  const cs = String(unityFiles(m).find((f) => f.name === 'unity/Editor/PixelDollImporter.cs')!.data);
  expect(cs).not.toContain('AssetDatabase.DeleteAsset(');
  expect(cs).toContain('EditorUtility.CopySerialized(asset, existing)');
  expect(cs).toContain('TextureImporterNPOTScale.None');
  expect(cs).toContain('SpriteMeshType.FullRect');
  expect(cs).toContain('l.pivotX / l.cellW');
  expect(cs).toContain('1f - (float)l.pivotY / l.cellH');
  expect(cs).toContain('layers.First(l => l.role == "fg")');
  expect(cs).toContain('EditorCurveBinding.PPtrCurve("clock"');
  expect(cs).toContain('keys.Add(new ObjectReferenceKeyframe { time = t, value = keys[keys.Count - 1].value })');
  expect(cs).toContain('var initial = d.animations.First(a => a.directions.Length > 0)');
  expect(cs).not.toContain('d.animations[0].directions[0]');
});

test('Unity resolves a clipped canonical body for both the prefab preview and runtime', async () => {
  const body = makeImg(64, 64), hat = makeImg(64, 64);
  body.data.set([255, 0, 0, 255], (5 * 64 + 10) * 4); // Must disappear above the hat's brim.
  body.data.set([255, 0, 0, 255], (30 * 64 + 10) * 4); // Must remain below the brim.
  hat.data.set([0, 0, 255, 255], (10 * 64 + 10) * 4);
  const b = await cellHash(body), h = await cellHash(hat), baseHash = `sha256:${'0'.repeat(64)}` as const;
  const item = (id: string, slot: string, z: number, image: typeof b): Item => ({
    id, name: id, slot, status: 'accepted', baseHash, mirror: 'flip', materials: [], provenance: [], prompt: '',
    layers: [{ id: 'main', role: 'fg', z, cells: { idle: { south: [image] } } }],
  });
  const project: Project = {
    images: new Map([[b, body], [h, hat]]),
    manifest: {
      name: 'Clipped body', app: 'test', format: 'pixeldoll/2',
      rig: { baseItem: 'base', baseHash, cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 },
        directions: [{ id: 'south' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] },
      slots: [{ id: 'body', class: 'base', z: 10 }, { id: 'head', class: 'rigid', z: 130, clips: ['body'] }],
      items: [item('base', 'body', 10, b), item('hat', 'head', 130, h)], materials: [],
      presets: [{ id: 'default', name: 'Default', items: { body: 'base', head: 'hat' }, variants: {} }],
    },
  };
  const exported = await exportFiles(project, { engines: ['unity'], baked: true });
  expect(exported.errors).toEqual([]);
  const files = new Map(exported.entries.map((entry) => [entry.name, entry.data]));
  const clipped = await decodePngBytes(files.get('layers/body/base~hat/main/idle.png')!);
  expect([...clipped.data.slice((5 * 64 + 10) * 4, (5 * 64 + 10) * 4 + 4)]).toEqual([0, 0, 0, 0]);
  expect([...clipped.data.slice((30 * 64 + 10) * 4, (30 * 64 + 10) * 4 + 4)]).toEqual([255, 0, 0, 255]);
  const visible = makeImg(64, 64);
  over(visible, clipped); over(visible, hat);
  const expected = composeCell(project, project.manifest.presets[0].items, 'idle', 'south', 0);
  expect(visible).toEqual(expected);
  expect(await decodePngBytes(files.get('baked/default/idle.png')!)).toEqual(expected);
  const text = new TextDecoder(), data = JSON.parse(text.decode(files.get('unity/pixeldoll_unity.json'))) as ReturnType<typeof unityJson>;
  expect(data.items.find((entry) => entry.id === 'base~hat')?.variantOf).toBe('base');
  // The generated C# cannot be executed by Vitest: guard the resolver integration as well as the actual PNGs.
  const runtime = text.decode(files.get('unity/Runtime/Paperdoll.cs'));
  expect(runtime).toMatch(/Item\(Shown\(n\.slot == "body" \? data\.baseItem : equipped\.Find\(x => x\.slot == n\.slot\)\?\.item\)\)/);
  const importer = text.decode(files.get('unity/Editor/PixelDollImporter.cs'));
  expect(importer.indexOf('doll.Sync();')).toBeGreaterThan(importer.indexOf('doll.clock.sprite = body['));
  expect(importer.indexOf('PrefabUtility.SaveAsPrefabAsset(')).toBeGreaterThan(importer.indexOf('doll.Sync();'));
});
