import { expect, test } from 'vitest';
import { gdevelopFiles, gdObjectName, gdCharacterKey, GDEVELOP_RUNTIME } from '../../src/lib/export/gdevelop.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';

import { gdFixture, gdSheets } from '../fixtures/gdevelop-native.ts';

test('native project registers all frames, source palettes, native origins and exact runtime event', () => {
  const m = gdFixture(), files = gdevelopFiles(m, gdSheets());
  const p = JSON.parse(files.find((f) => f.name === 'gdevelop/game.json')!.data as string);
  expect(p.layouts[0].objects).toHaveLength(4);
  expect(p.resources.resources).toHaveLength(32);
  expect(new Set(p.resources.resources.map((r: { name: string }) => r.name)).size).toBe(32);
  for (const r of p.resources.resources) expect(files.some((f) => f.name === 'gdevelop/' + r.file)).toBe(true);
  const hat = p.layouts[0].objects.find((o: { name: string }) => o.name === gdObjectName('hat', 'main', gdCharacterKey(m)));
  expect(hat.animations[0].directions[0].sprites[0].originPoint).toMatchObject({ x: 2, y: 3 });
  expect(p.layouts[0].events[0].inlineCode.join('\n')).toContain(GDEVELOP_RUNTIME);
  expect(() => new Function('runtimeScene', p.layouts[0].events[0].inlineCode.join('\n'))).not.toThrow();
  expect(() => gdevelopFiles(m, new Map())).toThrow('missing source sheet');
  expect(gdObjectName('a_b', 'c')).not.toBe(gdObjectName('a', 'b_c'));
});

test('generated controller preserves playlist boundaries, independent dolls, body protection, tuck and z order', () => {
  const m = gdFixture(), nodes: any[] = [];
  const scene = { createObject: (name: string) => { const n = { name, hide: (v = true) => { n.hidden = v; }, hidden: false, setLayer() {}, setAnimationName() {}, setAnimationFrame(cell: number) { n.cell = cell; }, cell: 0, pauseAnimation() {}, setPosition() {}, setZOrder(z: number) { n.z = z; }, z: 0, updatePreRender() {}, getRendererObject: () => ({}), deleteFromScene() {} }; nodes.push(n); return n; }, getGame: () => ({ getImageManager: () => ({ getPIXITexture: () => ({}) }) }) };
  // Palette pixel behavior is exercised against the actual engine by scripts/verify-gdevelop-engine.mjs.
  m.materials = [];
  const names = Object.fromEntries(m.items.map((i) => [i.id, Object.fromEntries(i.layers.map((l) => [l.id, gdObjectName(i.id, l.id, gdCharacterKey(m))]))]));
  const create = new Function(GDEVELOP_RUNTIME + '\nreturn createPixelDoll;')();
  const d = create(scene, m, names), second = create(scene, m, names);
  expect(d.cell).toBe(1); d.update(80); expect(d.cell).toBe(0); expect(second.cell).toBe(1);
  expect([...d.nodes.keys()]).toContain(gdObjectName('hair~hat', 'main', gdCharacterKey(m)));
  expect(d.nodes.get(gdObjectName('hat', 'main', gdCharacterKey(m))).z).toBe(0);
  expect(() => d.play('walk', 'east')).toThrow('unavailable');
  expect(() => d.equip('body', null)).toThrow('invalid equipment');
  expect(() => d.equip('head', 'base')).toThrow('invalid equipment');
  d.applyPreset('red'); expect(d.nodes.get(gdObjectName('hat', 'main', gdCharacterKey(m))).hidden).toBe(true);
  d.play('stop', 'south'); d.update(999); expect(d.cell).toBe(1);
  d.destroy(); expect(d.nodes.size).toBe(0); expect(second.nodes.size).toBeGreaterThan(0);
});

test('same-name characters with different frozen bases have disjoint native object/resource identities', () => {
  const m = gdFixture(), other = gdFixture(); other.rig.baseHash = ('sha256:' + '2'.repeat(64)) as `sha256:${string}`;
  const native = (manifest: Manifest) => JSON.parse(gdevelopFiles(manifest, gdSheets()).find((f) => f.name === 'gdevelop/game.json')!.data as string);
  const a = native(m), b = native(other);
  expect(gdCharacterKey(m)).toMatch(/^[0-9a-f]{16}$/);
  expect(gdCharacterKey(m)).not.toBe(gdCharacterKey(other));
  expect(a.layouts[0].objects.some((x: { name: string }) => b.layouts[0].objects.some((y: { name: string }) => x.name === y.name))).toBe(false);
  expect(a.resources.resources.some((x: { name: string; file: string }) => b.resources.resources.some((y: { name: string; file: string }) => x.name === y.name || x.file === y.file))).toBe(false);
  expect(a.resources.resources.every((x: { file: string }) => x.file.length < 80)).toBe(true);
});
