import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { exportManifest } from '../../src/lib/export/generic.ts';
import { unityFiles, unityJson } from '../../src/lib/export/unity.ts';

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

test('Unity JSON retains all presets, original source sheets and item-local palette metadata', async () => {
  const m = await manifest();
  m.materials.push({ id: 'body_colour', owner: m.items[0].id, label: 'Body', ramp: ['#112233'], variants: {} });
  m.items[0].materials = ['body_colour'];
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
