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
	godot: { 1: 'dba99e2fe87e0957296618727d3a32b25b420e7e071a6e4bd5d627543453db67' },
	phaser: { 1: '1ef1f9f0c819cf54e78c5434c74e3891c91510d1f0c820d8e10d865ac5469b41' },
	'phaser-ae': { 1: 'e94e36b77c57efcc44050e73c07f4f157fc620c8ae00183c39f82b56578d957c' },
	unity: { 1: 'd4dbe00f2f9d3246f98d34f07ad1fba8afcb917a2615e30ed4c4672cf7dd618d' }
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
