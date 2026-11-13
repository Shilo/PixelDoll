import { expect, test, vi } from 'vitest';
import { PAPERDOLL_JS } from '../../src/lib/export/phaser.ts';
import { GDEVELOP_RUNTIME } from '../../src/lib/export/gdevelop.ts';
import type { Manifest, Preset } from '../../src/lib/store/manifest.ts';
import { gdFixture } from '../fixtures/gdevelop-native.ts';

function fixture() {
	const manifest = gdFixture();
	manifest.rig.animations = [];
	manifest.presets = [
		{ id: 'first', name: 'First', items: { hair: 'hair' }, variants: { skin: 'blue' } },
		{ id: 'second', name: 'Second', items: { head: 'hat' }, variants: { skin: 'red' } }
	];
	return manifest;
}

function harness(engine: string) {
	const sprite: any = { anims: { currentFrame: null } };
	for (const method of ['setName', 'setVisible', 'on']) sprite[method] = () => sprite;
	const scene = {
		add: {
			container: vi.fn(() => ({ add() {} })),
			sprite: vi.fn(() => sprite)
		},
		createObject: vi.fn()
	};
	const create =
		engine === 'Phaser'
			? new Function(
					PAPERDOLL_JS.replace(/^export /gm, '') +
						'\nreturn (scene, manifest, preset) => new Paperdoll(scene, 0, 0, manifest, preset);'
				)()
			: new Function(
					GDEVELOP_RUNTIME +
						'\nreturn (scene, manifest, preset) => createPixelDoll(scene, manifest, {}, 0, 0, preset);'
				)();
	return {
		scene,
		create: (manifest: Manifest, preset?: Preset | string) => create(scene, manifest, preset)
	};
}

for (const engine of ['Phaser', 'GDevelop']) {
	test(`${engine} uses the same empty-slot equipment rule for setters and presets`, () => {
		const manifest = fixture();
		const doll = harness(engine).create(manifest);
		doll.equip('head', undefined);
		expect(doll.equipped.head).toBeUndefined();
		const preset = { items: {}, variants: {} };
		Object.assign(preset.items, { head: undefined });
		doll.applyPreset(preset);
		expect(doll.equipped.head).toBeUndefined();
	});
	test(`${engine} defaults to the frozen body when there are no presets`, () => {
		const manifest = fixture();
		manifest.presets = [];
		const doll = harness(engine).create(manifest);
		expect(doll.equipped).toEqual({ body: 'base' });
		expect(doll.variants).toEqual({});
	});

	test(`${engine} constructor resolves preset IDs exactly like objects and applyPreset`, () => {
		const manifest = fixture(),
			runtime = harness(engine);
		const fromId = runtime.create(manifest, 'second');
		const fromObject = runtime.create(manifest, manifest.presets[1]);
		const applied = runtime.create(manifest);
		applied.applyPreset('second');
		for (const doll of [fromId, fromObject, applied]) {
			expect(doll.equipped).toEqual({ body: 'base', head: 'hat' });
			expect(doll.variants).toEqual({ skin: 'red' });
		}
		expect(runtime.create(manifest).equipped).toEqual({ body: 'base', hair: 'hair' });
	});

	const invalidEquipment: Preset['items'][] = [
		{ head: 'hair' },
		{ head: 'missing' },
		{ hair: 'hair', head: 'missing' },
		{ unknown: null },
		{ unknown: 'hat' },
		{ hair: 'hair~hat' }
	];
	for (const items of invalidEquipment) {
		test(`${engine} rejects ${JSON.stringify(items)} atomically by object and ID`, () => {
			const manifest = fixture(),
				runtime = harness(engine);
			const invalid: Preset = { id: 'invalid', name: 'Invalid', items, variants: { skin: 'red' } };
			manifest.presets.push(invalid);
			const doll = runtime.create(manifest);
			doll.sync = vi.fn();
			const equipped = doll.equipped,
				variants = doll.variants;
			for (const preset of [invalid, 'invalid']) {
				expect(() => doll.applyPreset(preset)).toThrow('equipment');
				expect(doll.equipped).toBe(equipped);
				expect(doll.variants).toBe(variants);
				expect(doll.sync).not.toHaveBeenCalled();
				runtime.scene.add.container.mockClear();
				expect(() => runtime.create(manifest, preset)).toThrow('equipment');
				expect(runtime.scene.add.container).not.toHaveBeenCalled();
				expect(runtime.scene.createObject).not.toHaveBeenCalled();
			}
		});
	}

	test(`${engine} rejects unknown constructor IDs and applyPreset IDs without mutation`, () => {
		const manifest = fixture(),
			runtime = harness(engine);
		expect(() => runtime.create(manifest, 'missing')).toThrow('unknown outfit');
		const doll = runtime.create(manifest);
		const equipped = doll.equipped,
			variants = doll.variants;
		expect(() => doll.applyPreset('missing')).toThrow('unknown outfit');
		expect(doll.equipped).toBe(equipped);
		expect(doll.variants).toBe(variants);
	});

	test(`${engine} preserves frozen body normalization and copies custom preset state`, () => {
		const manifest = fixture(),
			runtime = harness(engine);
		for (const body of [null, 'missing', 'hat']) {
			const preset: Preset = {
				id: 'custom',
				name: 'Custom',
				items: { body, head: 'hat' },
				variants: {}
			};
			const doll = runtime.create(manifest, preset);
			expect(doll.equipped).toEqual({ body: 'base', head: 'hat' });
			doll.applyPreset(preset);
			doll.equipped.head = null;
			doll.variants.skin = 'blue';
			expect(preset.items).toEqual({ body, head: 'hat' });
			expect(preset.variants).toEqual({});
		}
	});
}
