// Project folder: a publish builds its export once. Every other export time only rewrites the text that carries the time
// (manifest.json and the engine files that embed it), so these tests prove those bytes equal a build with that time.
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { buildExport } from '../../src/lib/export/build.ts';
import type { Engine, Project } from '../../src/lib/store/manifest.ts';
import { equipmentFixture } from './equipment-fixture.ts';

const fixture = (path: string) =>
	readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url));
const A = '2026-01-01T00:00:00.000Z';
const B = '2026-02-02T02:02:02.002Z';

type BuildOptions = Parameters<typeof buildExport>[1];
type Built = Extract<Awaited<ReturnType<typeof buildExport>>, { kind: 'requested' }>;

function options(
	engine: Engine,
	exportedAt: string,
	extra: Partial<BuildOptions> = {}
): BuildOptions {
	return {
		engine,
		baked: true,
		look: { items: {}, variants: {} },
		settings: {
			engine,
			dressedCharacterSheets: true,
			actionLayers: false,
			playOnce: []
		},
		exportedAt,
		filesOnly: true,
		...extra
	};
}

async function filesAt(
	project: Project,
	engine: Engine,
	at: string,
	extra: Partial<BuildOptions> = {}
): Promise<Built> {
	const result = await buildExport(project, options(engine, at, extra));
	if (result.kind !== 'requested') throw new Error(`build failed: ${result.kind}`);
	return result;
}

/** A retimed build holds exactly the files a build with that time produces, in the same order. */
function expectSameFiles(retimed: Built['entries'], built: Built['entries'], label: string) {
	expect(retimed.map(({ name }) => name)).toEqual(built.map(({ name }) => name));
	for (const [i, entry] of retimed.entries()) {
		const expected = built[i]!;
		expect(entry.data.byteLength, `${label} ${entry.name}`).toBe(expected.data.byteLength);
		expect(entry.data, `${label} ${entry.name}`).toEqual(expected.data);
	}
}

const engines: Engine[] = [
	'generic',
	'godot',
	'phaser',
	'phaser-ae',
	'unity',
	'gdevelop',
	'aseprite'
];

for (const engine of engines)
	test(`another export time is byte-identical to a build with it (${engine})`, async () => {
		const project = await equipmentFixture();
		const first = await filesAt(project, engine, A);
		const second = await filesAt(project, engine, B);
		expectSameFiles(first.retime!(B)!, second.entries, engine);
		// The build keeps its own bytes: retiming rewrites nothing it was given, and its own time is a no-op.
		expect(first.retime!(A)).toEqual(first.entries);
	});

test.each(['godot', 'phaser', 'phaser-ae', 'unity'] as const)(
	'folder retime rewrites only %s character entries',
	async (engine) => {
		const project = await equipmentFixture();
		const first = await filesAt(project, engine, A, { layout: 'folder' });
		const second = await filesAt(project, engine, B, { layout: 'folder' });
		expectSameFiles(first.retime!(B)!, second.entries, engine);
		expect(first.bundle).toBeDefined();
		expect(first.bundle).toEqual(second.bundle);
	}
);

test('another export time is byte-identical for RPG Maker and action-layered exports', async () => {
	const project = await loadFixture(fixture);
	for (const [engine, extra] of [
		['godot', { actionLayering: { waist: 32, walk: ['walk'], attacks: ['cross-punch'] } }]
	] as [Engine, Partial<BuildOptions>][]) {
		const first = await filesAt(project, engine, A, extra);
		const second = await filesAt(project, engine, B, extra);
		expectSameFiles(first.retime!(B)!, second.entries, `${engine} ${JSON.stringify(extra)}`);
	}
	const rpg = await filesAt(project, 'rpg-maker', A);
	const rpgLater = await filesAt(project, 'rpg-maker', B);
	expectSameFiles(rpg.retime!(B)!, rpgLater.entries, 'rpg-maker');
});

test('names with replacement patterns such as $& and $$ are copied as written', async () => {
	const project = await equipmentFixture();
	project.manifest.name = "Cash $& the $$ team $` $'";
	for (const engine of ['generic', 'godot', 'gdevelop'] as Engine[]) {
		const first = await filesAt(project, engine, A);
		const second = await filesAt(project, engine, B);
		expectSameFiles(first.retime!(B)!, second.entries, engine);
	}
});

test('a name that contains the export time makes the caller build again rather than keep a stale time', async () => {
	const project = await equipmentFixture();
	project.manifest.name = `Exported ${A}`;
	const first = await filesAt(project, 'generic', A);
	expect(first.retime!(B)).toBeNull();
});
