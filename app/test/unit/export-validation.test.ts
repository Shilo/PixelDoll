import { expect, test } from 'vitest';
import type { Project } from '../../src/lib/store/manifest.ts';
import { exportManifest, validate } from '../../src/lib/export/generic.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { spriteFramesTres } from '../../src/lib/export/godot.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';

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
	expect(result.warnings.some((warning) => warning.includes('old: stale'))).toBe(true);
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
