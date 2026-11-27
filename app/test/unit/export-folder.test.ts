import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { buildExport } from '../../src/lib/export/build.ts';
import { unzip } from '../../src/lib/store/zip.ts';
import { hasRuntime } from '../../src/lib/project-folder/layout.ts';
import { engines, exportOptions, folderExportFixture } from './export-folder-fixture.ts';
import zipGolden from './export-folder-zip-golden.json';

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const decoder = new TextDecoder();
const runtimeFiles = {
	godot: ['paperdoll.gd', 'AGENTS.md', 'CLAUDE.md'],
	phaser: ['PaperdollContainer.js', 'types.d.ts', 'AGENTS.md', 'CLAUDE.md'],
	'phaser-ae': ['paperdoll.js', 'paperdoll.d.ts', 'types.d.ts', 'AGENTS.md', 'CLAUDE.md'],
	unity: [
		'Runtime/Paperdoll.cs',
		'Runtime/PixelDoll.Runtime.asmdef',
		'Editor/PixelDollImporter.cs',
		'Editor/PixelDoll.Editor.asmdef',
		'AGENTS.md',
		'CLAUDE.md'
	]
} as const;

// Pin each published revision's paths and bytes together. Keep old revision pins when adding a new one. (Revision 1
// was re-pinned before release, when the runtime folders gained their agent docs.)
const revisionGoldens: Record<keyof typeof runtimeFiles, Record<number, string>> = {
	godot: { 1: 'a2fc05b33da2ed307f5a00fa4b0b3a2f6c08b47a77e5f25f0a3ce862a8307364' },
	phaser: { 1: '0089403bf7806a1d2556a8181ae5ef9ed0691ee20ae8880116132700640b2554' },
	'phaser-ae': { 1: 'e7f27767185699f43a4038c561449ebdbbf1efa2122467f43a446cc91cd0c9cc' },
	unity: { 2: '402ebc0321c9cdd37d43720cbad4cb0df68eeff7052d0280574c58e8dcdf7d70' }
};

// Captured at the fixture's fixed exportedAt from an isolated archive of HEAD (67b40dc8e).
test.each(engines)('%s default ZIP preserves the archive and every entry', async (engine) => {
	const built = await buildExport(await folderExportFixture(), exportOptions(engine));
	expect(built.kind).toBe('requested');
	if (built.kind !== 'requested') throw new Error(JSON.stringify(built.errors));
	const archive = await unzip(built.zip!);
	const entryHashes = Object.fromEntries([...archive].map(([name, data]) => [name, sha256(data)]));
	expect(built.bundle).toBeUndefined();
	expect(entryHashes).toEqual(zipGolden[engine].entries);
	expect(sha256(built.zip!)).toBe(zipGolden[engine].archive);
});

test.each(engines)('%s folder keeps character files and separates its runtime', async (engine) => {
	const project = await folderExportFixture();
	const options = exportOptions(engine);
	const zip = await buildExport(project, { ...options, layout: 'zip' });
	const folder = await buildExport(project, { ...options, layout: 'folder' });
	expect(folder.kind).toBe('requested');
	expect(zip.kind).toBe('requested');
	if (folder.kind !== 'requested' || zip.kind !== 'requested') throw new Error('Build failed.');
	expect(folder.zip).toHaveLength(0);
	expect(folder.retime).toBeDefined();
	// Project folder publishing refuses a build whose runtime disagrees with its own list of runtime engines.
	expect(!!folder.bundle).toBe(hasRuntime(engine));
	if (!Object.hasOwn(runtimeFiles, engine)) {
		expect(folder.bundle).toBeUndefined();
		expect(folder.entries).toEqual(zip.entries);
		return;
	}
	const sharedEngine = engine as keyof typeof runtimeFiles;
	const bundle = folder.bundle!;
	expect(bundle.engine).toBe(sharedEngine);
	expect(Number.isSafeInteger(bundle.revision) && bundle.revision >= 1).toBe(true);
	const digest = sha256(
		JSON.stringify(bundle.files.map(({ name, data }) => [name, sha256(data)]).sort())
	);
	expect(
		digest,
		`${sharedEngine} bundle bytes changed. Bump the runtime revision and pin its new digest.`
	).toBe(revisionGoldens[sharedEngine][bundle.revision]);
	expect(bundle.files.map(({ name }) => name)).toEqual(runtimeFiles[sharedEngine]);
	const embedded = new Set(bundle.files.map(({ name }) => sharedEngine + '/' + name));
	expect(folder.entries.map(({ name }) => name)).toEqual(
		zip.entries.filter(({ name }) => !embedded.has(name)).map(({ name }) => name)
	);

	project.manifest.name = 'Another character';
	const another = await buildExport(project, {
		...options,
		exportedAt: '2026-02-02T00:00:00.000Z',
		look: { items: { body: 'base' }, variants: {} },
		layout: 'folder'
	});
	expect(another.kind).toBe('requested');
	if (another.kind === 'requested') expect(another.bundle).toEqual(bundle);

	const files = new Map(folder.entries.map(({ name, data }) => [name, decoder.decode(data)]));
	const path = `../pixeldoll-${engine}/${runtimeFiles[sharedEngine][0]}`;
	for (const name of [
		'README.txt',
		'AGENTS.md',
		'CLAUDE.md',
		`docs/${engine}.md`,
		`${engine}/README.txt`
	]) {
		expect(files.get(name)).toContain(path);
		expect(files.get(name)).toContain(`copy pixeldoll-${engine} too`);
	}
	if (engine === 'phaser' || engine === 'phaser-ae') {
		expect(files.get(`${engine}/README.txt`)).toContain(
			`from './<folder>/pixeldoll-${engine}/${runtimeFiles[engine][0]}'`
		);
		expect(files.get(`${engine}/README.txt`)).toContain('reload a running game');
	}
	if (engine === 'godot')
		expect(files.get('godot/Paperdoll.tscn')).toContain(
			'[ext_resource type="Script" path="../../pixeldoll-godot/paperdoll.gd" id="script"]'
		);
	if (engine === 'unity') {
		const data = JSON.parse(files.get('unity/pixeldoll_unity.json')!);
		expect(data).not.toHaveProperty('exportId');
		expect(Number.isSafeInteger(data.runtimeFormat) && data.runtimeFormat >= 1).toBe(true);
		expect(JSON.parse(decoder.decode(bundle.files[1].data)).name).toBe('PixelDoll.Runtime');
		expect(JSON.parse(decoder.decode(bundle.files[3].data))).toMatchObject({
			name: 'PixelDoll.Editor',
			references: ['PixelDoll.Runtime', 'Unity.2D.Sprite.Editor']
		});
	}
});
