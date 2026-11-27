// The synthetic archives the native export verifiers share: nonuniform durations, repeated cells, play-once clips,
// eight directions with mirrors, oversize and translucent layers, covers, hides, depth overrides, palettes and a State.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { exportZip } from '../src/lib/export/export.ts';
import { applyExportSettings } from '../src/lib/store/export-settings.ts';
import { baseHashOf, cellHash } from '../src/lib/rig/rig.ts';
import { makeImg } from '../src/lib/image/png.ts';

/** Exports each archive for `engine`, writing a copy of every ZIP into `dir`. */
export async function reviewArchives(engine, dir) {
	const basic = await fixtureArchive(engine, dir);
	return [
		basic,
		await adversarialArchive(engine, dir, basic.project),
		await stateArchive(engine, dir, basic.project)
	];
}

async function fixtureArchive(engine, dir) {
	const images = new Map(),
		body = [],
		hats = [];
	for (const size of [64, 96])
		for (let cell = 0; cell < 2; cell++) {
			const image = makeImg(size, size);
			for (let y = 0; y < (size === 64 ? size : 8); y++)
				for (let x = 0; x < size; x++) image.data.set([100, 100, 100, 255], (y * size + x) * 4);
			image.data.set(
				cell ? [0, 255, 0, 255] : [255, 0, 0, 255],
				((size === 64 ? 32 : 4) * size + size / 2) * 4
			);
			const hash = await cellHash(image);
			images.set(hash, image);
			(size === 64 ? body : hats).push(hash);
		}
	const animations = ['walk', 'jump'].map((id) => ({
		id,
		cells: 2,
		loop: id === 'jump',
		frames: [
			{ cell: 0, ms: 80 },
			{ cell: 1, ms: 180 },
			{ cell: 1, ms: 100 }
		]
	}));
	const rig = {
		baseItem: 'base',
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		directions: [{ id: 'south' }],
		animations,
		baseHash: ''
	};
	rig.baseHash = await baseHashOf(
		rig,
		Object.fromEntries(
			animations.flatMap((a) => body.map((hash, i) => [`${a.id}/south/${i}`, hash]))
		)
	);
	const manifest = {
		name: 'Phaser playback',
		app: 'test',
		format: 'pixeldoll/3',
		rig,
		slots: [
			{ id: 'body', class: 'base', z: 10, required: true },
			{ id: 'head', class: 'rigid', z: 20 }
		],
		materials: [
			{
				id: 'skin',
				owner: 'base',
				label: 'Skin',
				ramp: ['#646464'],
				defaultVariant: 'blue',
				variants: { blue: ['#0000ff'], red: ['#ff0000'] }
			}
		],
		items: [
			['base', 'body', body],
			['hat', 'head', hats]
		].map(([id, slot, hashes]) => ({
			id,
			name: id,
			slot,
			status: 'accepted',
			mirror: 'flip',
			prompt: '',
			provenance: [],
			baseHash: rig.baseHash,
			materials: slot === 'body' ? ['skin'] : [],
			layers: [
				{
					id: 'main',
					role: 'fg',
					z: slot === 'body' ? 10 : 20,
					...(slot === 'head' ? { cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } } : {}),
					cells: Object.fromEntries(animations.map((a) => [a.id, { south: hashes }]))
				}
			]
		})),
		presets: [
			{ id: 'current', name: 'Current', items: { body: 'base', head: 'hat' }, variants: {} },
			{ id: 'red', name: 'Red', items: { body: 'base', head: 'hat' }, variants: { skin: 'red' } }
		]
	};
	const copy = structuredClone(manifest);
	applyExportSettings(copy, { engine, dressedCharacterSheets: true, playOnce: ['jump'] });
	const result = await exportZip(
		{ manifest: copy, images },
		{ engines: [engine], baked: true, exportedAt: '2026-10-28T00:00:00.000Z' }
	);
	assert.deepEqual(result.errors, []);
	assert.deepEqual(
		manifest.rig.animations.map((a) => a.loop),
		[false, true]
	);
	await writeFile(join(dir, 'pipeline-fixture.pixeldoll.zip'), result.zip);
	return {
		label: 'global-settings-pipeline',
		fixture: true,
		zip: result.zip,
		project: { manifest, images }
	};
}
async function adversarialArchive(engine, dir, source) {
	const manifest = structuredClone(source.manifest),
		images = new Map(source.images);
	manifest.name = 'Eight direction runtime';
	manifest.rig.directions = [
		{ id: 'south' },
		{ id: 'south-east' },
		{ id: 'east' },
		{ id: 'north-east' },
		{ id: 'north' },
		{ id: 'north-west', mirrorOf: 'north-east' },
		{ id: 'west', mirrorOf: 'east' },
		{ id: 'south-west', mirrorOf: 'south-east' }
	];
	const directions = manifest.rig.directions.filter((direction) => !direction.mirrorOf);
	for (const item of manifest.items) {
		const layer = item.layers[0];
		delete layer.cell;
		delete layer.pivot;
		const cells = {};
		for (const [index, direction] of directions.entries()) {
			cells[direction.id] = [];
			for (let cell = 0; cell < 2; cell++) {
				const image = makeImg(64, 64);
				for (let y = 0; y < (item.slot === 'body' ? 64 : 13); y++)
					for (let x = 0; x < 64; x++) image.data.set([100, 100, 100, 255], (y * 64 + x) * 4);
				image.data.set(
					[20 + index * 35, 30 + cell * 160, 210 - index * 30, 255],
					((20 + cell) * 64 + 10 + index) * 4
				);
				const hash = await cellHash(image);
				images.set(hash, image);
				cells[direction.id].push(hash);
			}
		}
		layer.cells = Object.fromEntries(
			manifest.rig.animations.map((move) => [move.id, structuredClone(cells)])
		);
	}
	manifest.slots[1].clips = ['hair'];
	manifest.slots.push(
		{ id: 'hair', class: 'worn', z: 15 },
		{ id: 'chest', profile: 'torso_outer', class: 'worn', z: 25, clips: ['body'] },
		{
			id: 'back',
			class: 'worn',
			z: 5,
			zOverrides: [
				{ layer: 'fg', dir: 'north', z: 35 },
				{ layer: 'fg', anim: 'walk', z: 8 },
				{ layer: 'fg', anim: 'walk', cell: 0, z: -5 }
			]
		},
		{ id: 'off_hand', class: 'held', z: 40 },
		{ id: 'main_hand', class: 'held', z: 40 }
	);
	const makeItem = async (id, slot, z, width, height, pivot, paint, extra = {}) => {
		const image = makeImg(width, height);
		paint(image);
		const hash = await cellHash(image);
		images.set(hash, image);
		return {
			id,
			name: id,
			slot,
			status: 'accepted',
			baseHash: manifest.rig.baseHash,
			mirror: 'flip',
			materials: [],
			prompt: '',
			provenance: [],
			layers: [
				{
					id: 'main',
					role: 'fg',
					z,
					cell: { w: width, h: height },
					pivot,
					cells: Object.fromEntries(
						manifest.rig.animations.map((move) => [
							move.id,
							Object.fromEntries(directions.map((direction) => [direction.id, [hash, hash]]))
						])
					)
				}
			],
			...extra
		};
	};
	const dot = (image, x, y, rgba) => image.data.set(rgba, (y * image.w + x) * 4);
	const hair = await makeItem('hair', 'hair', 15, 64, 64, { x: 32, y: 60 }, (image) => {
		for (let y = 0; y < 26; y++)
			for (let x = 12; x < 51; x++) dot(image, x, y, [120, 30, 200, 255]);
	});
	const coat = await makeItem('coat', 'chest', 25, 64, 64, { x: 32, y: 60 }, (image) => {
		for (let y = 26; y < 40; y++)
			for (let x = 18; x < 46; x++) dot(image, x, y, [20, 180, 60, 255]);
	});
	const cape = await makeItem('cape', 'back', 8, 64, 64, { x: 32, y: 60 }, (image) => {
		for (let y = 15; y < 50; y++) dot(image, 12, y, [220, 40, 70, 128]);
	});
	cape.layers[0].id = 'fg';
	cape.layers.push({ ...structuredClone(cape.layers[0]), id: 'bg', role: 'bg', z: -10 });
	const weapon = await makeItem(
		'weapon',
		'main_hand',
		40,
		96,
		80,
		{ x: 48, y: 68 },
		(image) => {
			for (let y = 10; y < 65; y++) dot(image, 3, y, [240, 180, 20, 128]);
		},
		{ hides: ['off_hand'] }
	);
	const shield = await makeItem(
		'shield',
		'off_hand',
		40,
		64,
		64,
		{ x: 32, y: 60 },
		(image) => dot(image, 52, 30, [50, 200, 255, 255]),
		{ hides: ['main_hand'] }
	);
	manifest.items.push(hair, coat, cape, weapon, shield);
	manifest.items.find((item) => item.id === 'hat').baseCut = Object.fromEntries(
		manifest.rig.animations.map((move) => [
			move.id,
			Object.fromEntries(
				directions.map((direction) => [direction.id, [[15 * 64 + 10], [16 * 64 + 11]]])
			)
		])
	);
	manifest.presets = [
		['bare', {}],
		['hair', { hair: 'hair' }],
		['hat', { head: 'hat', hair: 'hair' }],
		['coat', { chest: 'coat', back: 'cape' }],
		['combined', { head: 'hat', hair: 'hair', chest: 'coat', back: 'cape', main_hand: 'weapon' }],
		['hands', { off_hand: 'shield', main_hand: 'weapon' }]
	].map(([id, items]) => ({
		id,
		name: id,
		items: { body: 'base', ...items },
		variants: { skin: id === 'combined' ? 'red' : 'blue' }
	}));
	const copy = structuredClone(manifest);
	applyExportSettings(copy, { engine, dressedCharacterSheets: true, playOnce: ['walk'] });
	const result = await exportZip(
		{ manifest: copy, images },
		{ engines: [engine], baked: true, exportedAt: '2026-11-12T00:00:00.000Z' }
	);
	assert.deepEqual(result.errors, []);
	await writeFile(join(dir, 'adversarial-fixture.pixeldoll.zip'), result.zip);
	return {
		label: 'eight-direction-masks-hands-alpha',
		fixture: false,
		adversarial: true,
		zip: result.zip
	};
}
// Separate archive so the basic fixture's clips and negative controls stay unchanged.
async function stateArchive(engine, dir, source) {
	const manifest = structuredClone(source.manifest),
		images = new Map(source.images);
	manifest.name = 'Ready stance State';
	manifest.rig.animations.push({
		id: 'ready-stance',
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: 150 }]
	});
	// The State's 4x4 magenta blocks (body center, hat marker) appear in no Move cell.
	for (const item of manifest.items) {
		const layer = item.layers[0],
			original = images.get(layer.cells.walk.south[0]),
			image = { ...original, data: original.data.slice() },
			[cx, cy] = item.slot === 'head' ? [48, 4] : [32, 32];
		for (let y = cy - 2; y < cy + 2; y++)
			for (let x = cx - 2; x < cx + 2; x++)
				image.data.set([255, 0, 255, 255], (y * image.w + x) * 4);
		const hash = await cellHash(image);
		images.set(hash, image);
		layer.cells['ready-stance'] = { south: [hash] };
	}
	const body = manifest.items.find((item) => item.slot === 'body').layers[0].cells;
	manifest.rig.baseHash = await baseHashOf(
		manifest.rig,
		Object.fromEntries(
			manifest.rig.animations.flatMap((a) =>
				body[a.id].south.map((hash, i) => [`${a.id}/south/${i}`, hash])
			)
		)
	);
	for (const item of manifest.items) item.baseHash = manifest.rig.baseHash;
	const copy = structuredClone(manifest);
	applyExportSettings(copy, {
		engine,
		dressedCharacterSheets: true,
		playOnce: ['jump', 'ready-stance']
	});
	const result = await exportZip(
		{ manifest: copy, images },
		{ engines: [engine], baked: true, exportedAt: '2026-11-21T00:00:00.000Z' }
	);
	assert.deepEqual(result.errors, []);
	await writeFile(join(dir, 'state-fixture.pixeldoll.zip'), result.zip);
	return { label: 'ready-stance-state', fixture: false, state: true, zip: result.zip };
}
