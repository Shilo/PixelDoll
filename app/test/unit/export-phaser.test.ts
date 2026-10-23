import { EventEmitter } from 'node:events';
import { afterEach, expect, test, vi } from 'vitest';
import { atlasJson, atlasName, phaserFiles, PAPERDOLL_JS } from '../../src/lib/export/phaser.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';

// Execute the actual generated module; no copied runtime logic in this harness.
const runtime = () => new Function(PAPERDOLL_JS.replace(/^export /gm, '') + '\nreturn { loadPaperdoll, Paperdoll, paletteMap, texKey, animKey };')() as Record<string, any>;
const fixture = () => ({
  name: 'Same name', app: 'test', format: 'pixeldoll/2',
  rig: { baseItem: 'base', cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, directions: [{ id: 'south' }, { id: 'east' }],
    animations: [{ id: 'walk', cells: 2, directions: ['south'], loop: true, frames: [{ cell: 1, ms: 80 }, { cell: 0, ms: 180 }, { cell: 1, ms: 100 }] }] },
  materials: [
    { id: 'skin', owner: 'base', ramp: ['#646464'], defaultVariant: 'blue', variants: { blue: ['#0000ff'], red: ['#ff0000'] } },
    { id: 'hair', owner: 'hair', ramp: ['#646464'], linkTo: 'skin', variants: { blue: ['#00ffff'], red: ['#ff00ff'] } },
  ],
  slots: [{ id: 'body', z: 10 }, { id: 'hair', z: 20 }, { id: 'head', z: 20, clips: ['hair'] }],
  items: [
    { id: 'base', slot: 'body', materials: ['skin'], layers: [{ id: 'main', role: 'fg', z: 10, sheets: { walk: 'layers/body.png' }, sourceSheets: { walk: 'sources/body.png' } }] },
    { id: 'hair', slot: 'hair', materials: ['hair'], layers: [{ id: 'main', role: 'fg', z: 20, sheets: { walk: 'layers/hair.png' } }] },
    { id: 'hat', slot: 'head', materials: [], layers: [{ id: 'main', role: 'fg', z: 20, sheets: { walk: 'layers/hat.png' }, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } }] },
    { id: 'hair~hat', variantOf: 'hair', slot: 'hair', materials: ['hair'], layers: [{ id: 'main', role: 'fg', z: 20, sheets: { walk: 'layers/tucked.png' } }] },
  ],
  presets: [{ id: 'one', items: { hair: 'hair', head: 'hat' }, variants: {} }, { id: 'two', items: { hair: 'hair', head: null }, variants: { skin: 'red' } }],
}) as unknown as Manifest;

function sceneHarness() {
  const textures = new Map<string, any>(), animations = new Map<string, any>();
  const load = Object.assign(new EventEmitter(), {
    queued: [] as any[], fail: false,
    atlas(key: string, url: string, data: any) { this.queued.push({ key, url, data }); },
    isLoading: () => false,
    start(this: any) {
      this.queued.forEach((e: any, i: number) => {
        if (this.fail && i === 1) this.emit('loaderror', { key: e.key, src: e.url });
        else textures.set(e.key, { getSourceImage: () => ({ width: 1, height: 1, pixels: [100, 100, 100, 255] }) });
      });
      this.emit('complete');
    },
  });
  const scene = {
    load,
    textures: {
      exists: (key: string) => textures.has(key), get: (key: string) => textures.get(key), remove: (key: string) => textures.delete(key),
      addCanvas: (key: string, canvas: any) => { const texture = { canvas }; textures.set(key, texture); return texture; },
      addAtlasJSONHash: (_key: string, texture: any, atlas: any) => { texture.atlas = atlas; },
    },
    anims: { exists: (key: string) => animations.has(key), create: (config: any) => animations.set(config.key, config) },
    add: {
      container: () => ({ list: [] as any[], add(node: any) { this.list.push(node); }, sort(_field: string, compare: any) { this.list.sort(compare); }, destroy: vi.fn() }),
      sprite: () => Object.assign(new EventEmitter(), {
        visible: true, depth: 0, key: '', frame: '', anims: { currentFrame: null as any },
        setName() { return this; }, setVisible(visible: boolean) { this.visible = visible; return this; },
        setTexture(key: string, frame: string) { this.key = key; this.frame = frame; return this; },
        play(this: any, key: string) { this.anims.currentFrame = { textureFrame: animations.get(key).frames[0].frame }; this.emit('animationstart'); },
      }),
    },
  };
  return { scene, textures, animations };
}

function browserHarness(m: Manifest) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('manifest.json') ? structuredClone(m) : atlasJson(m, ...atlasArgs(url, m)) })));
  vi.stubGlobal('document', {
    baseURI: 'https://game.test/',
    createElement: () => {
      const canvas = { width: 0, height: 0, pixels: new Uint8ClampedArray(), getContext: () => ctx };
      const ctx = {
        drawImage: (source: any) => { canvas.pixels = new Uint8ClampedArray(source.pixels); },
        getImageData: () => ({ data: canvas.pixels }), putImageData: (image: any) => { canvas.pixels = image.data; },
      };
      return canvas;
    },
  });
}
function atlasArgs(url: string, m: Manifest): [string, string, string] {
  const item = m.items.find((it) => url.endsWith(atlasName(it.id, 'main', 'walk')))!;
  return [item.id, 'main', 'walk'];
}
afterEach(() => vi.unstubAllGlobals());

test('Phaser quick start selects the first playable move and its supported direction', () => {
  const m = fixture();
  m.rig.animations.unshift({ ...m.rig.animations[0], id: 'empty', directions: [] });
  const readme = phaserFiles(m).find((f) => f.name === 'phaser/README.txt')!;
  expect(readme.data).toContain('doll.play("walk", "south")');
});

test('atlas filenames cannot collide when item and move identifiers contain underscores', () => {
  expect(atlasName('a', 'main', 'main_walk')).not.toBe(atlasName('a_main', 'main', 'walk'));
});

test('generated Phaser loader preserves nonuniform repeated-frame timing and avoids unsupported rows', async () => {
  const m = fixture(), api = runtime(), h = sceneHarness(); browserHarness(m);
  const loaded = await api.loadPaperdoll(h.scene, 'assets/hero');
  expect(h.animations.size).toBe(1);
  const animation = [...h.animations.values()][0];
  expect(animation.frames.map((f: any) => 1000 / animation.frameRate + f.duration)).toEqual([80, 180, 100]);
  expect(animation.frames.map((f: any) => f.frame)).toEqual(['walk_south_1', 'walk_south_0', 'walk_south_1']);
  expect(h.scene.load.queued[0].url).toBe('https://game.test/assets/hero/sources/body.png');
  expect(await api.loadPaperdoll(h.scene, 'assets/hero/')).toBe(loaded);
  await api.loadPaperdoll(h.scene, 'assets/other/');
  expect(h.animations.size).toBe(2);
});

test('concurrent scenes share a folder load through the game-global TextureManager', async () => {
  const m = fixture(), api = runtime(), first = sceneHarness(), second = sceneHarness(); browserHarness(m);
  second.scene.textures = first.scene.textures;
  second.scene.anims = first.scene.anims;
  const [a, b] = await Promise.all([
    api.loadPaperdoll(first.scene, '/hero/'), api.loadPaperdoll(second.scene, '/hero/'),
  ]);
  expect(a).toBe(b);
  expect(first.scene.load.queued).toHaveLength(4);
  expect(second.scene.load.queued).toHaveLength(0);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('manifest.json'))).toHaveLength(1);
});

test('generated Phaser runtime recolours source pixels per owner, resolves linked presets and tucked layers, and restores defaults', async () => {
  const m = fixture(), api = runtime(), h = sceneHarness(); browserHarness(m);
  const loaded = await api.loadPaperdoll(h.scene, '/hero/');
  const doll = new api.Paperdoll(h.scene, 0, 0, loaded);
  expect(doll.nodes.every((n: any) => !n.sprite.visible)).toBe(true);
  doll.play('walk', 'south');
  const body = doll.body, hair = doll.nodes[1].sprite;
  expect([...h.textures.get(body.key).canvas.pixels]).toEqual([0, 0, 255, 255]);
  expect([...h.textures.get(hair.key).canvas.pixels]).toEqual([0, 255, 255, 255]);
  expect(hair.key).toContain('hair~hat');
  expect(h.textures.get(doll.nodes[2].sprite.key).getSourceImage).toBeTruthy();
  const atlas = h.textures.get(body.key).atlas.frames.walk_south_1;
  expect(atlas.pivot).toEqual({ x: 0.5, y: 60 / 64 });
  doll.applyPreset(loaded.presets[1]);
  expect([...h.textures.get(body.key).canvas.pixels]).toEqual([255, 0, 0, 255]);
  expect([...h.textures.get(hair.key).canvas.pixels]).toEqual([255, 0, 255, 255]);
  expect(hair.key).not.toContain('hair~hat');
  expect(doll.nodes[2].sprite.visible).toBe(false);
  doll.setVariants({});
  expect([...h.textures.get(body.key).canvas.pixels]).toEqual([0, 0, 255, 255]);
  expect(loaded.presets[0].variants).toEqual({});
  expect(() => doll.play('walk', 'east')).toThrow('unavailable');
  expect(() => doll.equip('body', null)).toThrow('invalid equipment');
  expect(() => doll.equip('hair', 'hat')).toThrow('invalid equipment');
  doll.destroy(); expect(doll.container.destroy).toHaveBeenCalledOnce();
});

test('generated loader reports HTTP failures and removes partial textures before retry', async () => {
  const m = fixture(), api = runtime(), h = sceneHarness(); browserHarness(m);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 })));
  await expect(api.loadPaperdoll(h.scene, '/bad/')).rejects.toThrow('HTTP 404');
  expect(h.textures.size).toBe(0);
  browserHarness(m); h.scene.load.fail = true;
  await expect(api.loadPaperdoll(h.scene, '/hero/')).rejects.toThrow('failed to load');
  expect(h.textures.size).toBe(0);
  expect(h.animations.size).toBe(0);
  h.scene.load.fail = false; h.scene.load.queued = [];
  await expect(api.loadPaperdoll(h.scene, '/hero/')).resolves.toHaveProperty('name', m.name);
});

test('generated runtime keeps stable equal-depth order and applies most-specific cell overrides', async () => {
  const m = fixture(), api = runtime(), h = sceneHarness(); browserHarness(m);
  const loaded = await api.loadPaperdoll(h.scene, '/hero/');
  loaded.slots[1].zOverrides = [{ layer: 'fg', anim: 'walk', z: 40 }, { layer: 'fg', cell: 1, z: 5 }];
  const doll = new api.Paperdoll(h.scene, 0, 0, loaded); doll.play('walk', 'south');
  expect(doll.container.list.map((s: any) => s.pdOrder)).toEqual([1, 0, 2]);
  loaded.slots[1].zOverrides = [];
  doll.sync(); expect(doll.container.list.map((s: any) => s.pdOrder)).toEqual([0, 1, 2]);
});
