import { expect, test } from 'vitest';
import { agentFiles } from '../../src/lib/export/agent-docs.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { CURRENT_FORMAT, EXPORT_ENGINES, type Project } from '../../src/lib/store/manifest.ts';

async function fixture(name = 'Portable'): Promise<Project> {
	const image = makeImg(64, 64);
	image.data.set([100, 100, 100, 255], 0);
	const hash = await cellHash(image);
	return {
		images: new Map([[hash, image]]),
		manifest: {
			format: CURRENT_FORMAT,
			name,
			app: 'test',
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
					prompt: 'a secret prompt that must never reach a doc',
					provenance: [],
					baseHash: hash,
					layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [hash] } } }]
				}
			],
			presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }]
		}
	};
}

const text = (entries: { name: string; data: unknown }[], name: string) =>
	new TextDecoder().decode(
		entries.find((entry) => entry.name === name)?.data as Uint8Array | undefined
	);

test('every engine export carries the agent map and its own engine reference', async () => {
	const engines = EXPORT_ENGINES.filter(
		(engine) => engine !== 'rpg-maker' && engine !== 'rpg-maker-xp'
	);
	const result = await exportFiles(await fixture(), { engines: [...engines], baked: false });
	expect(result.errors).toEqual([]);
	expect(text(result.entries as { name: string; data: unknown }[], 'AGENTS.md')).toContain(
		'# PixelDoll paper-doll export'
	);
	expect(text(result.entries as { name: string; data: unknown }[], 'CLAUDE.md')).toContain(
		'AGENTS.md'
	);
	for (const engine of engines) {
		const doc = text(result.entries as { name: string; data: unknown }[], `docs/${engine}.md`);
		expect(doc, engine).toContain('#');
		expect(doc, engine).toContain(`${engine}/README`);
	}
	// Only the selected engines get a reference.
	expect(result.entries.some((entry) => entry.name === 'docs/rpg-maker.md')).toBe(false);
	expect(result.entries.some((entry) => entry.name === 'docs/rpg-maker-xp.md')).toBe(false);
});

test('the agent docs are identical for every character and carry no prompts or names', async () => {
	const build = async (name: string) => {
		const project = await fixture(name);
		project.manifest.exportId = name.toLowerCase().replaceAll(' ', '-');
		return exportFiles(project, { engines: ['phaser', 'godot'], baked: false });
	};
	const first = await build('First hero');
	const second = await build('Second hero');
	expect(first.errors).toEqual([]);
	expect(second.errors).toEqual([]);
	for (const name of ['AGENTS.md', 'CLAUDE.md', 'docs/phaser.md', 'docs/godot.md']) {
		const doc = text(first.entries as { name: string; data: unknown }[], name);
		expect(doc, name).toBe(text(second.entries as { name: string; data: unknown }[], name));
		expect(doc, name).not.toContain('First hero');
		expect(doc, name).not.toContain('Second hero');
		expect(doc, name).not.toContain('second-hero');
		expect(doc, name).not.toContain('secret prompt');
	}
});

test('the agent files cover every engine the app can export', () => {
	const files = agentFiles(EXPORT_ENGINES);
	const names = files.map((file) => file.name);
	expect(new Set(names).size).toBe(names.length);
	expect(names.slice(0, 2)).toEqual(['AGENTS.md', 'CLAUDE.md']);
	for (const engine of EXPORT_ENGINES) expect(names).toContain(`docs/${engine}.md`);
	// A repeated engine never produces a duplicate path.
	expect(agentFiles(['phaser', 'phaser']).map((file) => file.name)).toEqual([
		'AGENTS.md',
		'CLAUDE.md',
		'docs/phaser.md'
	]);
	for (const file of files) expect(typeof file.data).toBe('string');
});

// Every path an engine doc sends a reader to must be in that engine's ZIP, and the root README must name the moves and
// outfits the manifest carries. This is what keeps the shipped docs honest as the exporters change.
const ENGINE_FILES: Record<string, string[]> = {
	generic: ['generic/README.txt'],
	godot: ['godot/Paperdoll.tscn', 'godot/paperdoll.gd', 'godot/library.tres'],
	unity: ['unity/Runtime/Paperdoll.cs', 'unity/Editor/PixelDollImporter.cs'],
	phaser: ['phaser/PaperdollContainer.js', 'phaser/types.d.ts'],
	'phaser-ae': ['phaser-ae/paperdoll.js', 'phaser-ae/paperdoll.d.ts', 'phaser-ae/assets.json'],
	gdevelop: ['gdevelop/game.json', 'gdevelop/Paperdoll.js'],
	aseprite: ['aseprite/README.txt']
};

test('each engine doc names files that the export really contains', async () => {
	for (const [id, expected] of Object.entries(ENGINE_FILES)) {
		const engine = id as (typeof EXPORT_ENGINES)[number];
		const result = await exportFiles(await fixture(), {
			engines: [engine],
			baked: false
		});
		expect(result.errors, engine).toEqual([]);
		const names = new Set(result.entries.map((entry) => entry.name));
		for (const path of [
			'AGENTS.md',
			'CLAUDE.md',
			`docs/${engine}.md`,
			'README.txt',
			'manifest.json',
			`${engine}/README.txt`,
			...expected
		]) {
			expect(names.has(path), `${engine}: ${path}`).toBe(true);
		}
		const doc = text(result.entries as { name: string; data: unknown }[], `docs/${engine}.md`);
		expect(doc.length, engine).toBeGreaterThan(200);
	}
});

test('the root README names every move and outfit the manifest carries', async () => {
	const project = await fixture();
	const result = await exportFiles(project, { engines: ['generic'], baked: false });
	expect(result.errors).toEqual([]);
	const readme = text(result.entries as { name: string; data: unknown }[], 'README.txt');
	const manifest = JSON.parse(
		text(result.entries as { name: string; data: unknown }[], 'manifest.json')
	) as {
		rig: { animations: { id: string }[] };
		presets: { id: string; name: string }[];
		materials: unknown[];
	};
	for (const move of manifest.rig.animations) expect(readme, move.id).toContain(move.id);
	const outfits = readme.slice(readme.indexOf('Outfits:'));
	for (const [index, preset] of manifest.presets.entries()) {
		expect(outfits, preset.id).toContain(`(${preset.id})`);
		if (index === 0) expect(outfits).toContain('starts the character');
	}
	// A character with no named variants must say so instead of promising a recolor that selects nothing.
	expect(readme).toContain('no named color variants');
});
