import { expect, test } from 'vitest';
import type { Project, Slot } from '../../src/lib/store/manifest.ts';
import { exportManifest, validate } from '../../src/lib/export/generic.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { spriteFramesTres } from '../../src/lib/export/godot.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import { addCustom, moveCategory, shownCategories } from '../../src/studio/slots.ts';
import { slotLadder } from '../../src/lib/items/slots.ts';

function project(): Project {
	const hash = `sha256:${'0'.repeat(64)}` as const;
	return {
		images: new Map(),
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Test',
			app: 'PixelDoll',
			materials: [],
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 60 },
				baseItem: 'base',
				baseHash: hash,
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			slots: [{ id: 'body', z: 10, class: 'base' }],
			items: [
				{
					id: 'base',
					name: 'Base',
					slot: 'body',
					status: 'accepted',
					mirror: 'generate',
					materials: [],
					prompt: '',
					provenance: [],
					baseHash: hash,
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [null] } } }]
				}
			],
			presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }]
		}
	};
}

test('export rejects archive-path IDs and malformed layer geometry before building derived variants', async () => {
	for (const invalid of ['../escape', 'a/b', 'a\\b', 'C:escape']) {
		const p = project();
		p.manifest.items[0].id = invalid;
		expect(
			(await exportFiles(p, { engines: ['godot'], baked: true })).errors.some((e) =>
				e.includes('item id')
			)
		).toBe(true);
	}
	for (const geometry of [
		{ cell: { w: 1000000, h: 64 } },
		{ pivot: { x: 2147483647, y: 60 } },
		{ pivot: { x: -1, y: 60 } }
	]) {
		const p = project();
		Object.assign(p.manifest.items[0].layers[0], geometry);
		expect(validate(p).some((e) => e.includes('pivot inside the cell'))).toBe(true);
	}
	expect(validate(project())).toEqual([]);
});

test('playlist cell references and counts must be integers', () => {
	const p = project();
	p.manifest.rig.animations[0].frames[0].cell = 0.5;
	expect(validate(p).some((e) => e.includes('bad frame'))).toBe(true);
	p.manifest.rig.animations[0].cells = 1.5;
	expect(validate(p).some((e) => e.includes('no cells'))).toBe(true);
});

test('validation and export reject unsupported manifest formats', async () => {
	const p = project();
	Object.assign(p.manifest, { format: 'pixeldoll/2' });
	expect(validate(p).some((error) => error.includes('format'))).toBe(true);
	const result = await exportFiles(p, { engines: ['generic'], baked: true });
	expect(result.errors.some((error) => error.includes('format'))).toBe(true);
	expect(result.entries).toHaveLength(0);
});

test.each([
	['wrong-slot', { head: 'base' }],
	['missing', { head: 'missing' }],
	['unknown-slot', { unknown: null }]
])('validation and export reject %s stored preset equipment', async (_label, items) => {
	const p = project();
	p.manifest.slots.push({ id: 'head', z: 20, class: 'worn' });
	p.manifest.presets[0].items = items;
	expect(
		validate(p).some((error) => error.includes('default:') && error.includes('equipment'))
	).toBe(true);
	const result = await exportFiles(p, { engines: ['generic'], baked: true });
	expect(result.errors.some((error) => error.includes('equipment'))).toBe(true);
	expect(result.entries).toHaveLength(0);
});

test('valid stale equipment is still excluded instead of rejecting its preset', () => {
	const p = project();
	p.manifest.slots.push({ id: 'head', z: 20, class: 'worn' });
	p.manifest.items.push({
		...structuredClone(p.manifest.items[0]),
		id: 'old',
		slot: 'head',
		baseHash: `sha256:${'1'.repeat(64)}`
	});
	p.manifest.presets[0].items.head = 'old';
	expect(validate(p)).toEqual([]);
	const result = exportManifest(p, { engines: ['generic'], baked: false });
	expect(result.manifest.presets[0].items.head).toBeNull();
	expect(result.warnings).toContain('Base: Left out because it no longer matches the body.');
});

test('Godot resources keep distinct valid animation IDs distinct after escaping', () => {
	const p = project(),
		m = p.manifest;
	m.rig.animations = ['walk-fast', 'walk_fast'].map((id) => ({
		id,
		cells: 1,
		loop: true,
		frames: [{ cell: 0, ms: 100 }]
	}));
	m.items[0].layers[0].sheets = { 'walk-fast': 'a.png', walk_fast: 'b.png' };
	const tres = spriteFramesTres(m, 'base', 'main');
	const ids = [...tres.matchAll(/\[(?:ext|sub)_resource[^\n]* id="([^"]+)"\]/g)].map((x) => x[1]);
	expect(ids).toHaveLength(4);
	expect(new Set(ids).size).toBe(ids.length);
	expect(tres).toContain('"name": &"walk-fast_south"');
	expect(tres).toContain('"name": &"walk_fast_south"');
});

test('slot metadata validates and only its label reaches the runtime manifest', () => {
	const p = project();
	const slot: Slot = {
		id: 'quiver',
		z: 95,
		bgZ: 4,
		class: 'worn',
		anchor: 'neck',
		hides: ['body'],
		clips: ['body'],
		zOverrides: [{ layer: 'bg', z: 4, dir: 'south', anim: 'idle', cell: 0 }],
		band: true,
		label: 'Quiver',
		origin: 'back',
		profile: 'back',
		wardrobeOrder: 3,
		wardrobeHidden: true,
		promptTemplate: 'Add {{description}}.'
	};
	p.manifest.slots.push(slot);
	expect(validate(p)).toEqual([]);
	const exported = exportManifest(p, { engines: ['generic'], baked: false }).manifest.slots[1];
	expect(exported).toMatchObject({
		id: 'quiver',
		z: 95,
		bgZ: 4,
		class: 'worn',
		anchor: 'neck',
		hides: ['body'],
		clips: ['body'],
		band: true,
		label: 'Quiver'
	});
	for (const authoringOnly of [
		'origin',
		'profile',
		'wardrobeOrder',
		'wardrobeHidden',
		'promptTemplate'
	])
		expect(exported).not.toHaveProperty(authoringOnly);
});

test('built-in hide and clip targets remain valid without their own slot entry', () => {
	const p = project();
	p.manifest.slots.push({
		id: 'head',
		z: 130,
		class: 'rigid',
		anchor: 'head',
		clips: ['hair'],
		hides: ['facial_hair']
	});
	expect(validate(p)).toEqual([]);
});

test('slot keys, duplicate entries, classes and anchors are validated', () => {
	let p = project();
	p.manifest.slots.push({ id: 'Quiver', z: 90, class: 'worn' });
	expect(validate(p).some((error) => error.includes('slot id "Quiver" is invalid'))).toBe(true);

	p = project();
	p.manifest.slots.push({ id: 'body', z: 90, class: 'worn' });
	expect(validate(p).some((error) => error.includes('duplicate slot id body'))).toBe(true);

	p = project();
	p.manifest.slots.push({ id: 'head', z: 90, class: 'hat' as never, anchor: 'tail' });
	const errors = validate(p);
	expect(errors.some((error) => error.includes('class must be base, rigid, held or worn'))).toBe(
		true
	);
	expect(errors.some((error) => error.includes('anchor "tail" is not a supported anchor'))).toBe(
		true
	);
});

test('slot depths, overrides and hide/clip references must be valid', () => {
	const p = project();
	p.manifest.slots.push({
		id: 'quiver',
		z: 95.5,
		bgZ: Number.NaN,
		class: 'worn',
		profile: 'back',
		zOverrides: [{ layer: 'side' as never, z: 1.5, dir: 'up' as never, anim: 'fly', cell: -1 }],
		hides: ['missing'],
		clips: ['missing', 'missing']
	});
	const errors = validate(p);
	for (const message of [
		'slot depth must be a finite integer',
		'background depth must be a finite integer',
		'zOverrides[0] layer must be fg or bg',
		'zOverrides[0] depth must be a finite integer',
		'zOverrides[0] has unknown direction up',
		'zOverrides[0] has unknown move fly',
		'zOverrides[0] cell must be a non-negative integer',
		'hides names unknown slot missing',
		'clips names unknown slot missing',
		'duplicate clips entry missing'
	])
		expect(errors.some((error) => error.includes(message))).toBe(true);
});

test('slot authoring metadata stays within the supported catalog and types', () => {
	const withSlot = (over: Partial<Slot>): Project => {
		const p = project();
		p.manifest.slots.push({ id: 'quiver', z: 95, class: 'worn', profile: 'back', ...over });
		return p;
	};
	const includes = (over: Partial<Slot>, message: string) =>
		validate(withSlot(over)).some((error) => error.includes(message));
	expect(includes({ origin: 'ring' as never }, 'origin must name a supported built-in')).toBe(true);
	expect(includes({ origin: 'body' }, 'only the Base slot can originate from body')).toBe(true);
	expect(includes({ profile: 'ring' as never }, 'behavior profile "ring" is not supported')).toBe(
		true
	);
	expect(includes({ profile: undefined }, 'behavior profile is missing')).toBe(true);
	expect(includes({ profile: 'body' }, 'profile body is reserved for the Base slot')).toBe(true);
	expect(includes({ label: 42 as never }, 'label must be text')).toBe(true);
	expect(includes({ wardrobeOrder: -1 }, 'wardrobeOrder must be a non-negative integer')).toBe(
		true
	);
	expect(includes({ wardrobeOrder: 1.5 }, 'wardrobeOrder must be a non-negative integer')).toBe(
		true
	);
	expect(includes({ wardrobeHidden: 'yes' as never }, 'wardrobeHidden must be true or false')).toBe(
		true
	);
	expect(includes({ promptTemplate: 7 as never }, 'promptTemplate must be text')).toBe(true);
});

test('malformed slot entries reject clearly instead of throwing', () => {
	const p = project();
	(p.manifest.slots as unknown[]).push(null, 7, { z: 1, class: 'worn' });
	let errors: string[] = [];
	expect(() => {
		errors = validate(p);
	}).not.toThrow();
	expect(errors.some((error) => error.includes('slot entry has no id'))).toBe(true);
});

test('Wardrobe reordering keeps every order a whole non-negative number, so the export validates', () => {
	const p = project(),
		none = new Set<string>();
	p.manifest.slots = slotLadder(p.manifest.rig);
	expect(validate(p)).toEqual([]);
	addCustom(p.manifest, { label: 'Brooch' }, none);
	for (const [key, to] of [
		['brooch', 0],
		['feet', 0],
		['head', 3],
		['brooch', 1],
		['feet', 0],
		['hair', 2]
	] as const)
		moveCategory(p.manifest, key, to, none);
	const shown = shownCategories(p.manifest, none);
	expect(shown.slice(0, 3).map((c) => c.key)).toEqual(['feet', 'brooch', 'hair']);
	expect(shown.map((c) => c.order)).toEqual(shown.map((_, i) => i));
	expect(validate(p)).toEqual([]);
});
