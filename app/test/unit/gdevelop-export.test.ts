import { afterEach, expect, test, vi } from 'vitest';
import {
	gdevelopFiles,
	gdObjectName,
	gdCharacterKey,
	GDEVELOP_RUNTIME
} from '../../src/lib/export/gdevelop.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { runtimeSources } from '../../src/lib/runtime/sources.ts';

import { gdFixture, gdSheets } from '../fixtures/gdevelop-native.ts';

afterEach(() => vi.unstubAllGlobals());

test('native project registers all frames, source palettes, native origins and exact runtime event', () => {
	const m = gdFixture(),
		files = gdevelopFiles(m, gdSheets());
	const p = JSON.parse(files.find((f) => f.name === 'gdevelop/game.json')!.data as string);
	expect(p.layouts[0].objects).toHaveLength(4);
	expect(p.resources.resources).toHaveLength(32);
	expect(new Set(p.resources.resources.map((r: { name: string }) => r.name)).size).toBe(32);
	for (const r of p.resources.resources)
		expect(files.some((f) => f.name === 'gdevelop/' + r.file)).toBe(true);
	const hat = p.layouts[0].objects.find(
		(o: { name: string }) => o.name === gdObjectName('hat', 'main', gdCharacterKey(m))
	);
	expect(hat.animations[0].directions[0].sprites[0].originPoint).toMatchObject({ x: 2, y: 3 });
	expect(p.layouts[0].events[0].inlineCode.join('\n')).toContain(GDEVELOP_RUNTIME);
	expect(
		() => new Function('runtimeScene', p.layouts[0].events[0].inlineCode.join('\n'))
	).not.toThrow();
	for (const source of Object.values(runtimeSources))
		expect(GDEVELOP_RUNTIME).toContain(source.replace(/^export /gm, ''));
	expect(() => gdevelopFiles(m, new Map())).toThrow('missing source sheet');
	expect(gdObjectName('a_b', 'c')).not.toBe(gdObjectName('a', 'b_c'));
});

test('generated controller preserves playlist boundaries, independent dolls, body protection, tuck and z order', () => {
	const m = gdFixture(),
		nodes: any[] = [];
	const scene = {
		createObject: (name: string) => {
			const n = {
				name,
				hide: (v = true) => {
					n.hidden = v;
				},
				hidden: false,
				setLayer() {},
				setAnimationName() {},
				setAnimationFrame(cell: number) {
					n.cell = cell;
				},
				cell: 0,
				pauseAnimation() {},
				setPosition() {},
				setZOrder(z: number) {
					n.z = z;
				},
				z: 0,
				updatePreRender() {},
				getRendererObject: () => ({}),
				deleteFromScene() {}
			};
			nodes.push(n);
			return n;
		},
		getGame: () => ({ getImageManager: () => ({ getPIXITexture: () => ({}) }) })
	};
	// Palette pixel behavior is exercised against the actual engine by scripts/verify-gdevelop-engine.mjs.
	m.materials = [];
	const names = Object.fromEntries(
		m.items.map((i) => [
			i.id,
			Object.fromEntries(i.layers.map((l) => [l.id, gdObjectName(i.id, l.id, gdCharacterKey(m))]))
		])
	);
	const create = new Function(GDEVELOP_RUNTIME + '\nreturn createPixelDoll;')();
	const d = create(scene, m, names),
		second = create(scene, m, names);
	expect(d.cell).toBe(1);
	d.update(80);
	expect(d.cell).toBe(0);
	d.play('walk', 'south');
	expect(d.elapsed).toBe(80);
	expect(d.cell).toBe(0);
	expect(second.cell).toBe(1);
	expect([...d.nodes.keys()]).toContain(gdObjectName('hair~hat', 'main', gdCharacterKey(m)));
	expect(d.nodes.get(gdObjectName('hat', 'main', gdCharacterKey(m))).z).toBe(0);
	d.update(280);
	expect(d.cell).toBe(1); // exactly one full 360 ms loop
	expect(() => d.play('walk', 'east')).toThrow('unavailable');
	expect(() => d.equip('body', null)).toThrow('invalid equipment');
	expect(() => d.equip('head', 'base')).toThrow('invalid equipment');
	d.applyPreset('red');
	expect(d.equipped).toEqual({ ...m.presets[1].items, body: m.rig.baseItem });
	expect(d.variants).toEqual(m.presets[1].variants);
	const equipment = { ...d.equipped },
		variants = { ...d.variants };
	expect(() => d.applyPreset('unknown')).toThrow('unknown outfit');
	expect(d.equipped).toEqual(equipment);
	expect(d.variants).toEqual(variants);
	expect(d.nodes.get(gdObjectName('hat', 'main', gdCharacterKey(m))).hidden).toBe(true);
	d.play('stop', 'south');
	d.update(999);
	expect(d.cell).toBe(1);
	d.play('stop', 'south');
	expect(d.elapsed).toBe(0);
	expect(d.cell).toBe(0);
	d.update(60);
	d.play('stop', 'south');
	expect(d.elapsed).toBe(60);
	expect(d.cell).toBe(1);
	d.play('stop', 'south', true);
	expect(d.elapsed).toBe(0);
	expect(d.cell).toBe(0);
	d.destroy();
	expect(d.nodes.size).toBe(0);
	expect(second.nodes.size).toBeGreaterThan(0);
});

test('same-name characters with different frozen bases have disjoint native object/resource identities', () => {
	const m = gdFixture(),
		other = gdFixture();
	other.rig.baseHash = ('sha256:' + '2'.repeat(64)) as `sha256:${string}`;
	const native = (manifest: Manifest) =>
		JSON.parse(
			gdevelopFiles(manifest, gdSheets()).find((f) => f.name === 'gdevelop/game.json')!
				.data as string
		);
	const a = native(m),
		b = native(other);
	expect(gdCharacterKey(m)).toMatch(/^[0-9a-f]{16}$/);
	expect(gdCharacterKey(m)).not.toBe(gdCharacterKey(other));
	expect(
		a.layouts[0].objects.some((x: { name: string }) =>
			b.layouts[0].objects.some((y: { name: string }) => x.name === y.name)
		)
	).toBe(false);
	expect(
		a.resources.resources.some((x: { name: string; file: string }) =>
			b.resources.resources.some(
				(y: { name: string; file: string }) => x.name === y.name || x.file === y.file
			)
		)
	).toBe(false);
	expect(a.resources.resources.every((x: { file: string }) => x.file.length < 80)).toBe(true);
});

test('GDevelop selects combined body cuts and returns to single cutters when equipment changes', () => {
	const m = gdFixture(),
		base = m.items[0];
	m.materials = [];
	const hat = m.items.find((item) => item.id === 'hat')!;
	hat.baseHash = m.rig.baseHash;
	hat.baseCut = { walk: { south: [[0], [0]] } };
	m.slots.push({ id: 'back', class: 'worn', z: 90 });
	m.items.push(
		{ ...structuredClone(m.items.find((item) => item.id === 'hat')!), id: 'cape', slot: 'back' },
		{ ...structuredClone(base), id: 'base~hat', variantOf: 'base', under: 'hat' },
		{ ...structuredClone(base), id: 'base~cape', variantOf: 'base', under: 'cape' },
		{ ...structuredClone(base), id: 'base~cape~hat', variantOf: 'base', underAll: ['cape', 'hat'] }
	);
	const names = Object.fromEntries(
		m.items.map((item) => [
			item.id,
			Object.fromEntries(item.layers.map((layer) => [layer.id, gdObjectName(item.id, layer.id)]))
		])
	);
	const scene = {
		createObject: () => ({
			hide() {},
			setLayer() {},
			setAnimationName() {},
			setAnimationFrame() {},
			pauseAnimation() {},
			setPosition() {},
			setZOrder() {},
			updatePreRender() {},
			getRendererObject: () => ({})
		}),
		getGame: () => ({ getImageManager: () => ({ getPIXITexture: () => ({}) }) })
	};
	const create = new Function(GDEVELOP_RUNTIME + '\nreturn createPixelDoll;')();
	const d = create(scene, m, names);
	d.equip('back', 'cape');
	expect(d.nodes.has(gdObjectName('base~cape~hat', 'main'))).toBe(true);
	d.equip('head', null);
	expect(d.nodes.has(gdObjectName('base~cape', 'main'))).toBe(true);
	d.equip('back', null);
	d.equip('back', 'cape');
	d.equip('head', 'hat');
	expect(d.nodes.has(gdObjectName('base~cape~hat', 'main'))).toBe(true);
});

test('GDevelop executes canonical timeline changes rather than a separate playlist sampler', () => {
	const original = 'export function sampleTimeline(frames, elapsedMs, loop = true) {',
		mutated = GDEVELOP_RUNTIME.replace(
			original.replace('export ', ''),
			original.replace('export ', '') + '\nreturn frames[0].cell;'
		);
	expect(mutated).not.toBe(GDEVELOP_RUNTIME);
	const create = new Function(mutated + '\nreturn createPixelDoll;')();
	const m = gdFixture();
	m.items = m.items
		.filter((item) => item.id === m.rig.baseItem)
		.map((item) => ({ ...item, layers: [] }));
	m.presets = [];
	const d = create({}, m, {});
	d.update(80);
	expect(d.cell).toBe(1);
});

test('GDevelop applies owner-local linked palettes, preserves alpha and sources, and consumes shared draw decisions', () => {
	const source = { width: 1, height: 1, pixels: new Uint8ClampedArray([100, 100, 100, 128]) };
	vi.stubGlobal('document', {
		createElement: () => {
			const canvas = {
				width: 0,
				height: 0,
				pixels: new Uint8ClampedArray(),
				getContext: () => context
			};
			const context = {
				drawImage: (image: typeof source) => {
					canvas.pixels = image.pixels.slice();
				},
				getImageData: () => ({ data: canvas.pixels.slice() }),
				putImageData: (image: { data: Uint8ClampedArray }) => {
					canvas.pixels = image.data.slice();
				}
			};
			return canvas;
		}
	});
	vi.stubGlobal('PIXI', {
		Texture: { from: (canvas: unknown) => ({ canvas, baseTexture: {}, destroy() {} }) },
		SCALE_MODES: { NEAREST: 0 }
	});
	const scene = {
		createObject: vi.fn(() => {
			const renderer = { texture: null };
			return {
				hide() {},
				setLayer() {},
				setAnimationName() {},
				setAnimationFrame() {},
				pauseAnimation() {},
				setPosition() {},
				setZOrder() {},
				updatePreRender() {},
				getRendererObject: () => renderer
			};
		}),
		getGame: () => ({
			getImageManager: () => ({ getImageSource: () => source, getPIXITexture: () => source })
		})
	};
	const m = gdFixture(),
		names = Object.fromEntries(
			m.items.map((item) => [
				item.id,
				Object.fromEntries(item.layers.map((layer) => [layer.id, item.id + '/' + layer.id]))
			])
		);
	const create = new Function(GDEVELOP_RUNTIME + '\nreturn createPixelDoll;')();
	const d = create(scene, m, names),
		second = create(scene, m, names);
	const pixels = (doll: any, name: string) => [
		...doll.nodes.get(name).getRendererObject().texture.canvas.pixels
	];
	expect(pixels(d, 'base/main')).toEqual([0, 0, 255, 128]);
	expect(pixels(d, 'hair~hat/main')).toEqual([0, 255, 255, 128]);
	d.setVariants({ skin: 'red' });
	expect(pixels(d, 'base/main')).toEqual([255, 0, 0, 128]);
	expect(pixels(d, 'hair~hat/main')).toEqual([255, 0, 255, 128]);
	expect(pixels(second, 'hair~hat/main')).toEqual([0, 255, 255, 128]);
	d.setVariants({});
	expect(pixels(d, 'base/main')).toEqual([0, 0, 255, 128]);
	expect([...source.pixels]).toEqual([100, 100, 100, 128]);
	const palette = 'export function paletteMap(manifest, item, variants, resolveRamp) {';
	const recolored = GDEVELOP_RUNTIME.replace(
		palette.replace('export ', ''),
		palette.replace('export ', '') + '\nreturn new Map([[0x646464, 0x010203]]);'
	);
	expect(recolored).not.toBe(GDEVELOP_RUNTIME);
	const changed = new Function(recolored + '\nreturn createPixelDoll;')()(scene, m, names);
	expect(pixels(changed, 'base/main')).toEqual([1, 2, 3, 128]);
	expect(pixels(changed, 'hair~hat/main')).toEqual([1, 2, 3, 128]);
	const decision = 'function drawList(m, items, anim, dir, cell) {';
	const mutated = GDEVELOP_RUNTIME.replace(decision, decision + '\nreturn [];');
	expect(mutated).not.toBe(GDEVELOP_RUNTIME);
	scene.createObject.mockClear();
	const hidden = new Function(mutated + '\nreturn createPixelDoll;')()(scene, m, names);
	expect(hidden.nodes.size).toBe(0);
	expect(scene.createObject).not.toHaveBeenCalled();
});
