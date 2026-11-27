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
	godot: { 1: '721efb338e2e0623080a00dbb0e45f715bceee0ada8fd80834cfe9c2e132d041' },
	phaser: { 1: 'c75683d0f5dadb441b579c4fb51ebe1ff67497294f04064543af73175c5fa540' },
	'phaser-ae': { 1: '545479b480abac837c9db2f1312ce2b6ba173287bbbdb51bcc1dc10cc9e4914e' },
	unity: { 2: '8ee599f22891042eba74f8305366b4c296b6bcd8be502ae4011374d0dc08a2d9' }
};

// Captured at the fixture's fixed exportedAt from an isolated archive of 67b40dc8e, then updated only for deliberate
// README wording fixes (Phaser AE scene imports, and layout-neutral wording in Phaser, GDevelop and RPG Maker guides).
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
