import { readFile, readdir, mkdtemp, writeFile, rm, cp, mkdir, symlink } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { expect, test } from 'vitest';
import * as core from '../../src/lib/runtime/paperdoll.js';
import * as compose from '../../src/lib/compose/compose.ts';
import * as colors from '../../src/lib/runtime/colors.js';
import * as timeline from '../../src/lib/runtime/timeline.js';
import { runtimeSources, runtimeTypes } from '../../src/lib/runtime/sources.ts';
import { PAPERDOLL_JS, phaserFiles } from '../../src/lib/export/phaser.ts';
import { CURRENT_FORMAT, type Project, type Item } from '../../src/lib/store/manifest.ts';
import { orderingProbe } from '../fixtures/runtime-order.ts';

const delivered = () =>
	new Function(
		PAPERDOLL_JS.replace(/^export /gm, '') +
			'\nreturn { composeCell, drawList, recolor, paletteMap, over, sampleTimeline, timelineDuration };'
	)() as Pick<typeof core, 'composeCell' | 'drawList' | 'over'> &
		Pick<typeof colors, 'recolor' | 'paletteMap'> &
		typeof timeline;

function project(): Project {
	const image = { w: 2, h: 1, data: new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 0]) };
	const item = (id: string, slot: string, z: number): Item => ({
		id,
		name: id,
		slot,
		status: 'accepted',
		baseHash: 'sha256:base',
		mirror: 'flip',
		materials: [id],
		prompt: '',
		provenance: [],
		layers: [{ id: 'main', role: 'fg', z, cells: { walk: { east: ['sha256:shared'] } } }]
	});
	return {
		images: new Map([['sha256:shared', image]]),
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Runtime',
			app: 'test',
			rig: {
				baseItem: 'base',
				baseHash: 'sha256:base',
				cell: { w: 2, h: 1 },
				pivot: { x: 1, y: 1 },
				directions: [{ id: 'east' }, { id: 'west', mirrorOf: 'east' }],
				animations: [{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			slots: [
				{ id: 'body', class: 'base', z: 10 },
				{ id: 'hair', class: 'worn', z: 20 }
			],
			items: [item('base', 'body', 10), item('hair', 'hair', 20)],
			materials: ['base', 'hair'].map((id) => ({
				id,
				owner: id,
				label: id,
				ramp: ['#646464'],
				variants: { red: ['#ff0000'], blue: ['#0000ff'] }
			})),
			presets: []
		}
	};
}

test('the shipped standalone JavaScript contains every canonical source byte-for-byte', async () => {
	const directory = new URL('../../src/lib/runtime/', import.meta.url);
	const names = (await readdir(directory)).filter((name) => name.endsWith('.js')).sort();
	expect(runtimeTypes).toBe(await readFile(new URL('types.d.ts', directory), 'utf8'));
	expect(Object.keys(runtimeSources)).toEqual(names);
	for (const name of names) {
		const source = await readFile(new URL(name, directory), 'utf8');
		expect(runtimeSources[name], name).toBe(source);
		expect(PAPERDOLL_JS, name).toContain(source);
		expect(source).not.toMatch(/^import\s/m);
	}
	expect(PAPERDOLL_JS).not.toMatch(/^import\s/m);
	for (const name of [
		'composeCell',
		'drawList',
		'hiddenSlots',
		'settleHands',
		'cellImg',
		'cutAt',
		'over',
		'tuck',
		'rigFrame',
		'layerFrame',
		'bakedFrame',
		'resolveZ',
		'compareDraws'
	] as const)
		expect(compose[name], name).toBe(core[name]);
	const module = await import(
		`data:text/javascript;base64,${Buffer.from(PAPERDOLL_JS).toString('base64')}`
	);
	expect(typeof module.Paperdoll).toBe('function');
	expect(typeof module.composeCell).toBe('function');
});

test('a canonical edit fails the stale guard and regeneration changes internal and delivered behavior together', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'pixeldoll-runtime-sync-')),
		app = fileURLToPath(new URL('../../', import.meta.url)),
		script = join(directory, 'scripts/sync-runtime.mjs');
	try {
		await mkdir(join(directory, 'scripts'));
		await cp(join(app, 'src/lib'), join(directory, 'src/lib'), { recursive: true });
		for (const name of ['package.json', 'prettier.config.js', 'scripts/sync-runtime.mjs'])
			await cp(join(app, name), join(directory, name));
		await symlink(join(app, 'node_modules'), join(directory, 'node_modules'), 'junction');
		const run = (...args: string[]) =>
			execFileSync(process.execPath, ['--experimental-transform-types', ...args], {
				cwd: directory,
				encoding: 'utf8'
			});
		run(script, '--check');
		const canonical = join(directory, 'src/lib/runtime/timeline.js');
		const source = await readFile(canonical, 'utf8');
		for (const unsupported of [
			"import './colors.js';",
			'export { timelineDuration as duration };',
			'export default timelineDuration;',
			'const example = `\nexport text inside a template\n`;',
			'/*\nexport text inside a comment\n*/',
			'  export const indented = 1;'
		]) {
			await writeFile(canonical, source + '\n' + unsupported);
			const rejected = spawnSync(process.execPath, [script, '--check'], {
				cwd: directory,
				encoding: 'utf8'
			});
			expect(rejected.status).not.toBe(0);
			expect(rejected.stderr).toContain('runtime embedding requires named declarations');
		}
		const mutation = source.replace('total + frame.ms, 0);', 'total + frame.ms, 0) + 100;');
		expect(mutation).not.toBe(source);
		await writeFile(canonical, mutation);
		const stale = spawnSync(process.execPath, [script, '--check'], {
			cwd: directory,
			encoding: 'utf8'
		});
		expect(stale.status).not.toBe(0);
		expect(stale.stderr).toContain('Runtime export sources are stale');
		run(script);
		run(script, '--check');
		const result = run(
			'--input-type=module',
			'--eval',
			`const internal = await import(${JSON.stringify(pathToFileURL(canonical).href)});
const { PAPERDOLL_JS } = await import(${JSON.stringify(pathToFileURL(join(directory, 'src/lib/export/phaser.ts')).href)});
const { GDEVELOP_RUNTIME } = await import(${JSON.stringify(pathToFileURL(join(directory, 'src/lib/export/gdevelop.ts')).href)});
const delivered = await import('data:text/javascript;base64,' + Buffer.from(PAPERDOLL_JS).toString('base64'));
const frames = [{cell: 0, ms: 80}];
const create = new Function(GDEVELOP_RUNTIME + '\\nreturn createPixelDoll;')();
const manifest = {rig: {baseItem: 'base', directions: [{id: 'south'}], animations: [{id: 'walk', loop: true, frames: [{cell: 0, ms: 80}, {cell: 1, ms: 80}]}]}, slots: [{id: 'body'}], items: [{id: 'base', slot: 'body', layers: []}], materials: [], presets: []};
const doll = create({}, manifest, {});
doll.update(160);
console.log(JSON.stringify([internal.timelineDuration(frames), delivered.timelineDuration(frames), doll.cell]));`
		);
		expect(JSON.parse(result)).toEqual([180, 180, 1]);
		const probe = join(directory, 'test/fixtures/runtime-order.ts');
		await mkdir(join(directory, 'test/fixtures'), { recursive: true });
		await cp(join(app, 'test/fixtures/runtime-order.ts'), probe);
		const orderSource = join(directory, 'src/lib/runtime/paperdoll.js');
		const original = await readFile(orderSource, 'utf8');
		const reversed = original.replace(
			'slotIndex(left.item.slot) - slotIndex(right.item.slot)',
			'slotIndex(right.item.slot) - slotIndex(left.item.slot)'
		);
		expect(reversed).not.toBe(original);
		await writeFile(orderSource, reversed);
		run(script);
		const ordered = run(
			'--input-type=module',
			'--eval',
			`const { orderingProbe } = await import(${JSON.stringify(pathToFileURL(probe).href)}); console.log(JSON.stringify(await orderingProbe()));`
		);
		expect(JSON.parse(ordered)).toEqual({
			canonical: ['base', 'Z', 'A'],
			pixel: [2, 0, 0, 255],
			phaser: ['base', 'Z', 'A'],
			gdevelop: ['base', 'Z', 'A'],
			aseprite: ['base', 'Z', 'A']
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('equal-depth layers have independent expected ordering in all JavaScript consumers', async () => {
	expect(await orderingProbe()).toEqual({
		canonical: ['base', 'A', 'Z'],
		pixel: [3, 0, 0, 255],
		phaser: ['base', 'A', 'Z'],
		gdevelop: ['base', 'A', 'Z'],
		aseprite: ['base', 'A', 'Z']
	});
});

test('the delivered JavaScript and its portable types check without application source files', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'pixeldoll-runtime-'));
	try {
		const module = join(directory, 'PaperdollContainer.js');
		await writeFile(module, PAPERDOLL_JS);
		const manifest = project().manifest;
		for (const item of manifest.items)
			for (const layer of item.layers) layer.sheets = { walk: 'unused.png' };
		const types = phaserFiles(manifest).find((file) => file.name === 'phaser/types.d.ts')!;
		expect(types.data).toBe(runtimeTypes);
		if (typeof types.data !== 'string') throw new Error('Expected portable type source text');
		await writeFile(join(directory, 'types.d.ts'), types.data);
		const program = ts.createProgram([module], {
			allowJs: true,
			checkJs: true,
			noEmit: true,
			noImplicitAny: false,
			target: ts.ScriptTarget.ES2023,
			module: ts.ModuleKind.ESNext,
			moduleResolution: ts.ModuleResolutionKind.Bundler,
			types: []
		});
		expect(
			ts
				.getPreEmitDiagnostics(program)
				.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
		).toEqual([]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('internal and delivered APIs preserve independent owners, mirrored cells, source pixels and cached identity', () => {
	const original = project(),
		api = delivered(),
		selections = { base: 'red', hair: 'blue' };
	for (const runtime of [{ ...core, ...colors }, api]) {
		const colored = runtime.recolor(original, selections);
		expect([...runtime.composeCell(colored, { hair: 'hair' }, 'walk', 'east', 0).data]).toEqual([
			0, 0, 255, 255, 0, 0, 0, 0
		]);
		expect([...runtime.composeCell(colored, {}, 'walk', 'west', 0).data]).toEqual([
			0, 0, 0, 0, 255, 0, 0, 255
		]);
		expect([...original.images.get('sha256:shared')!.data]).toEqual([
			100, 100, 100, 255, 0, 0, 0, 0
		]);
		const layer = original.manifest.items[0].layers[0];
		const onlyBody = {
			...original,
			manifest: { ...original.manifest, items: [original.manifest.items[0]] }
		};
		const first = runtime.recolor(onlyBody, selections),
			second = runtime.recolor(onlyBody, selections);
		expect(second.layerImages!.get(layer)!.get('sha256:shared')).toBe(
			first.layerImages!.get(layer)!.get('sha256:shared')
		);
	}
});

test('straight-alpha composition has an independent golden result and never mutates the source', () => {
	for (const runtime of [core, delivered()]) {
		const target = { w: 1, h: 1, data: new Uint8ClampedArray([0, 0, 255, 128]) };
		const source = { w: 1, h: 1, data: new Uint8ClampedArray([255, 0, 0, 128]) };
		runtime.over(target, source);
		expect([...target.data]).toEqual([170, 0, 85, 192]);
		expect([...source.data]).toEqual([255, 0, 0, 128]);
	}
});

test('public palette maps contain only active swaps and omit unselected source colors', () => {
	const original = project(),
		item = original.manifest.items[0];
	for (const runtime of [colors, delivered()]) {
		expect([...runtime.paletteMap(original.manifest, item, {})]).toEqual([]);
		expect([...runtime.paletteMap(original.manifest, item, { base: 'red' })]).toEqual([
			[0x646464, 0xff0000]
		]);
	}
});

test('palette null restores defaults while empty and unknown selections preserve source colors', () => {
	const { manifest } = project();
	manifest.materials[0].defaultVariant = 'blue';
	for (const runtime of [colors, delivered()]) {
		for (const selection of [{}, { base: null }])
			expect([...runtime.paletteMap(manifest, manifest.items[0], selection)]).toEqual([
				[0x646464, 0x0000ff]
			]);
		for (const selection of [{ base: '' }, { base: 'unknown' }])
			expect([...runtime.paletteMap(manifest, manifest.items[0], selection)]).toEqual([]);
		expect([...runtime.paletteMap(manifest, manifest.items[0], { missing: 'red' })]).toEqual([
			[0x646464, 0x0000ff]
		]);
	}
});

test('timeline sampling honors exact boundaries, repeated cells, terminal holds and explicit preview looping', () => {
	const frames = [
		{ cell: 2, ms: 80 },
		{ cell: 0, ms: 180 },
		{ cell: 2, ms: 100 }
	];
	for (const runtime of [timeline, delivered()]) {
		expect(runtime.timelineDuration(frames)).toBe(360);
		expect(
			[0, 79, 80, 259, 260, 359, 360, 440].map((elapsed) => runtime.sampleTimeline(frames, elapsed))
		).toEqual([2, 2, 0, 0, 2, 2, 2, 0]);
		expect(runtime.sampleTimeline(frames, 440, false)).toBe(2);
		expect(runtime.sampleTimeline(frames, -1)).toBe(2);
		expect(() => runtime.sampleTimeline([], 0)).toThrow('invalid animation timeline');
		expect(() => runtime.sampleTimeline([{ cell: 0, ms: 0 }], 0)).toThrow(
			'invalid animation timeline'
		);
	}
});
