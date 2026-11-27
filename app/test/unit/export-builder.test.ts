import { expect, test } from 'vitest';
import {
	itemProject,
	outfitProject,
	moveProject,
	buildExport
} from '../../src/lib/export/build.ts';
import { recoverArtwork } from '../../src/lib/export/recovery.ts';
import { retainMoves, retainMoveMetadata } from '../../src/lib/rig/moves.ts';
import { variantOf } from '../../src/lib/dress/dress.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes } from '../../src/lib/image/pngraw.ts';
import { baseHashOf, cellHash } from '../../src/lib/rig/rig.ts';
import { defaultExportSettings } from '../../src/lib/store/export-settings.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { CURRENT_FORMAT, type Project } from '../../src/lib/store/manifest.ts';
import { unzip } from '../../src/lib/store/zip.ts';

async function project(): Promise<Project> {
	const image = makeImg(32, 32);
	image.data.set([17, 34, 51, 255], 0);
	const hash = await cellHash(image);
	return {
		images: new Map([[hash, image]]),
		manifest: {
			format: CURRENT_FORMAT,
			app: 'PixelDoll',
			name: 'Review',
			rig: {
				cell: { w: 32, h: 32 },
				pivot: { x: 16, y: 31 },
				baseItem: 'base',
				baseHash: hash,
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			slots: [
				{ id: 'body', z: 10, class: 'base' },
				{ id: 'hair', z: 20, class: 'worn' },
				{ id: 'head', z: 30, class: 'rigid' }
			],
			items: ['base', 'hair', 'hat'].map((id, index) => ({
				id,
				name: id,
				slot: ['body', 'hair', 'head'][index],
				status: 'accepted',
				mirror: 'generate',
				materials: [`${id}_tone`],
				prompt: '',
				provenance: [],
				baseHash: hash,
				layers: [{ id: 'main', role: 'fg', z: 10 + index * 10, cells: { idle: { south: [hash] } } }]
			})),
			materials: ['base', 'hair', 'hat'].map((id) => ({
				id: `${id}_tone`,
				owner: id,
				label: id,
				ramp: ['#112233'],
				variants: { gold: ['#aabbcc'] }
			})),
			presets: []
		}
	};
}

test('item ZIP imports back with only body and item without mutating source', async () => {
	const source = await project(),
		before = structuredClone(source.manifest);
	const selected = itemProject(source, 'hair', {
		items: { body: 'base', hair: 'hair', head: 'hat' },
		variants: { hair_tone: 'gold' }
	});
	const result = await buildExport(selected.project, {
		engine: 'generic',
		baked: false,
		look: selected.look,
		settings: defaultExportSettings()
	});
	expect(result.errors).toEqual([]);
	expect(result.zip).toBeTruthy();
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.items.map((item) => item.id)).toEqual(['base', 'hair']);
	expect(imported.project.manifest.presets[0].variants.hair_tone).toBe('gold');
	expect(imported.project.manifest.materials.map((material) => material.owner)).not.toContain(
		'hat'
	);
	expect(source.manifest).toEqual(before);
});

test('detaching omitted palette owner preserves uncolored selection', async () => {
	const source = await project();
	const hair = source.manifest.materials.find((material) => material.id === 'hair_tone')!;
	hair.defaultVariant = 'gold';
	hair.linkTo = 'hat_tone';
	const look = { items: { body: 'base', hair: 'hair', head: 'hat' }, variants: {} };
	expect(variantOf(source.manifest, look.variants, hair.id)).toBeUndefined();
	const selected = itemProject(source, 'hair', look);
	expect(variantOf(selected.project.manifest, selected.look.variants, hair.id)).toBeUndefined();
});

test('outfit ZIP uses only the selected saved look without changing the live character', async () => {
	const source = await project();
	source.manifest.presets = [
		{
			id: 'gold',
			name: 'Gold',
			items: { body: 'base', hair: 'hair' },
			variants: { hair_tone: 'gold' }
		},
		{ id: 'hat', name: 'Hat', items: { head: 'hat' }, variants: {} }
	];
	const before = structuredClone(source.manifest);
	const selected = outfitProject(source, 'gold');
	const result = await buildExport(selected.project, {
		engine: 'generic',
		baked: false,
		look: selected.look,
		settings: defaultExportSettings()
	});
	expect(result.errors).toEqual([]);
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.presets).toHaveLength(1);
	expect(imported.project.manifest.presets[0]).toMatchObject({ id: 'gold', name: 'Gold' });
	expect(imported.project.manifest.presets[0].items.hair).toBe('hair');
	expect(imported.project.manifest.presets[0].variants.hair_tone).toBe('gold');
	expect(source.manifest).toEqual(before);
	expect(() => outfitProject(source, 'gone')).toThrow('no longer available');
});

test('unavailable outfit equipment does not block character ZIPs or change the saved outfits', async () => {
	const source = await project();
	source.manifest.presets = [
		{
			id: 'wizard',
			name: 'Wizard',
			items: { body: 'base', facial_hair: null, head: 'hat' },
			variants: {}
		}
	];
	const look = { items: { hair: 'hair', head: 'missing' }, variants: { hair_tone: 'gold' } };
	const before = structuredClone({ manifest: source.manifest, look });
	for (const engine of ['generic', 'godot'] as const) {
		const result = await buildExport(source, {
			engine,
			baked: true,
			look,
			settings: defaultExportSettings()
		});
		expect(result.errors).toEqual([]);
		expect(result.warnings).toContain('Current look: Missing equipment was left out (Head).');
		const imported = await readCharacterZip(result.zip!);
		expect(imported.project.manifest.presets).toMatchObject([
			{ id: 'current', items: { hair: 'hair' }, variants: { hair_tone: 'gold' } },
			{ id: 'wizard', items: { body: 'base', head: 'hat' } }
		]);
		expect(imported.project.manifest.presets[0].items).not.toHaveProperty('head');
		expect(imported.project.manifest.presets[1].items).not.toHaveProperty('facial_hair');
		expect({ manifest: source.manifest, look }).toEqual(before);
	}
});

const exportOptions = {
	look: { items: {}, variants: {} },
	settings: defaultExportSettings(),
	baked: true
};

test.each([
	'generic',
	'godot',
	'unity',
	'phaser',
	'gdevelop',
	'aseprite',
	'rpg-maker',
	'rpg-maker-xp'
] as const)('%s recovers surviving artwork when the body no longer matches', async (engine) => {
	const source = await project();
	const missing = `sha256:${'a'.repeat(64)}` as const;
	source.manifest.rig.rest = { south: { image: missing, keypoints: [] } };
	source.manifest.items[1].dressed = { south: missing };
	source.manifest.items[0].baseHash = missing;
	const result = await buildExport(source, { ...exportOptions, engine });
	expect(result.kind).toBe('recovery');
	expect(result.problem).toBe('The body frames no longer match this character.');
	expect(result.warnings).toEqual(['Some source images could not be included.']);
	expect([...(await unzip(result.zip!)).keys()]).toEqual([
		'README.txt',
		'frames.json',
		'frames/1.png'
	]);
	expect(source.manifest.rig.rest.south?.image).toBe(missing);
});

test('recovery counts repeated frame references toward its ZIP limit', async () => {
	const source = await project();
	const cells = source.manifest.items[0].layers[0].cells!.idle!.south!;
	cells.push(...Array.from({ length: 200 }, () => cells[0]));
	const result = await recoverArtwork(source, 'Could not export.', 1600);
	expect(result?.skipped).toBe(true);
	expect(result?.zip.length).toBeLessThanOrEqual(1600);
	const files = await unzip(result!.zip);
	const tracks = JSON.parse(new TextDecoder().decode(files.get('frames.json')));
	expect(tracks[0].frameCount).toBe(cells.length);
	expect(tracks[0].images.length).toBeGreaterThan(0);
	expect(tracks[0].images.length).toBeLessThan(cells.length);
	expect([...files.keys()]).toEqual(['README.txt', 'frames.json', 'frames/1.png']);
});

test('no ZIP is offered when none of the recorded images can be read', async () => {
	const source = await project();
	source.images.clear();
	const result = await buildExport(source, { ...exportOptions, engine: 'generic' });
	expect(result).toMatchObject({ kind: 'failed', zip: null, retryable: false });
});

test('a visible foreground exports and imports even when the first body layer is empty', async () => {
	const source = await project();
	const body = source.manifest.items[0];
	const layer = body.layers[0];
	body.layers = [
		{ ...layer, id: 'bg', role: 'bg', cells: { idle: { south: [null] } } },
		{ ...layer, id: 'fg' }
	];
	const result = await buildExport(source, { ...exportOptions, engine: 'generic' });
	expect(result.kind).toBe('requested');
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.items[0].layers).toEqual(body.layers);
});

test.each(['rpg-maker', 'rpg-maker-xp'] as const)(
	'%s offers source artwork instead of pretending to make a walking sheet',
	async (engine) => {
		const source = await project();
		const result = await buildExport(source, { ...exportOptions, engine });
		expect(result.kind).toBe('recovery');
		const files = await unzip(result.zip!);
		expect([...files.keys()]).toEqual(['README.txt', 'frames.json', 'frames/1.png']);
		const image = await decodePngBytes(files.get('frames/1.png')!);
		expect(image).toEqual([...source.images.values()][0]);
		expect(new TextDecoder().decode(files.get('README.txt'))).toContain('not a game-ready export');
	}
);

test('a missing equipment frame is left empty without losing the rest of the export', async () => {
	const source = await project();
	const cells = source.manifest.items[1].layers[0].cells!.idle!.south!;
	const missing = `sha256:${'a'.repeat(64)}` as const;
	cells[0] = missing;
	source.manifest.rig.rest = { north: { image: missing, keypoints: [] } };
	source.manifest.items[1].dressed = { south: missing };
	const result = await buildExport(source, { ...exportOptions, engine: 'generic' });
	expect(result.kind).toBe('requested');
	expect(result.warnings).toContain('hair: 1 frame was left empty.');
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.items[1].layers[0].cells!.idle!.south).toEqual([null]);
	expect(imported.project.manifest.rig.rest).toEqual({});
	expect(imported.project.manifest.items[1].dressed).toEqual({});
	const notes = new TextDecoder().decode((await unzip(result.zip!)).get('Export notes.txt'));
	expect(notes).toContain('Missing body reference images');
	expect(notes).toContain('hair: Missing reference images');
	expect(cells[0]).toBe(missing);
	expect(source.manifest.rig.rest.north?.image).toBe(missing);
	expect(source.manifest.items[1].dressed.south).toBe(missing);
});

test('move ZIP and deletion filtering retain only matching tracks and leave the source intact', async () => {
	const source = await project();
	const manifest = source.manifest;
	manifest.rig.animations.push({ ...manifest.rig.animations[0], id: 'walk' });
	manifest.rig.anchors = { head: { idle: { south: [[1, 2]] }, walk: { south: [[3, 4]] } } };
	manifest.slots[1].zOverrides = [
		{ layer: 'fg', z: 5, anim: 'walk' },
		{ layer: 'fg', z: 6 }
	];
	for (const item of manifest.items) {
		item.layers[0].cells!.walk = structuredClone(item.layers[0].cells!.idle);
		item.coverage = ['idle/south/0', 'walk/south/0'];
		item.baseCut = { idle: { south: [[1]] }, walk: { south: [[2]] } };
		item.anchorCell = 'walk/south/0';
		item.standing = 'walk';
		const summary = {
			minKeyKept: 1,
			maxKeyOutside: 0,
			minAreaRatio: 1,
			maxAreaCV: 0,
			maxPaletteDist: 0,
			clipPx: 0,
			status: 'pass' as const
		};
		item.qa = {
			...summary,
			status: 'fail',
			rerolls: 2,
			clips: { 'idle/south': summary, 'walk/south': { ...summary, status: 'fail', clipPx: 9 } },
			cells: {}
		};
	}
	const before = structuredClone(manifest);
	const filtered = await retainMoves(manifest, new Set(['idle']));
	const expectedHash = await baseHashOf(filtered.rig, {
		'idle/south/0': filtered.items[0].layers[0].cells!.idle.south![0]!
	});
	expect(filtered.rig.baseHash).toBe(expectedHash);
	expect(filtered.items.every((item) => item.baseHash === expectedHash)).toBe(true);
	expect(filtered.rig.animations.map((move) => move.id)).toEqual(['idle']);
	expect(Object.keys(filtered.rig.anchors!.head!)).toEqual(['idle']);
	expect(filtered.slots[1].zOverrides).toEqual([{ layer: 'fg', z: 6 }]);
	for (const item of filtered.items) {
		expect(Object.keys(item.layers[0].cells!)).toEqual(['idle']);
		expect(Object.keys(item.baseCut!)).toEqual(['idle']);
		expect(item.coverage).toEqual(['idle/south/0']);
		expect(item.anchorCell).toBeUndefined();
		expect(item.standing).toBeUndefined();
		expect(item.qa).toMatchObject({ status: 'pass', clipPx: 0, rerolls: 2 });
		expect(Object.keys(item.qa!.clips)).toEqual(['idle/south']);
	}
	const result = await buildExport(
		{ ...source, manifest: filtered },
		{
			engine: 'generic',
			baked: false,
			look: { items: { body: 'base', hair: 'hair' }, variants: {} },
			settings: defaultExportSettings()
		}
	);
	expect(result.errors).toEqual([]);
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.rig.animations.map((move) => move.id)).toEqual(['idle']);
	expect(manifest).toEqual(before);
});

test('move metadata keeps matching skeletons, QA and unscoped warnings without mutating the record', () => {
	const metadata = {
		skeletons: {},
		rigQa: {
			warnings: ['walk/south: failed', 'idle/south: note', 'General note'],
			clips: { 'walk/south': { status: 'fail' }, 'idle/south': { status: 'pass' } }
		}
	};
	const before = structuredClone(metadata);
	const filtered = retainMoveMetadata(metadata, new Set(['idle']));
	expect(filtered.rigQa).toEqual({
		warnings: ['idle/south: note', 'General note'],
		clips: { 'idle/south': { status: 'pass' } }
	});
	expect(metadata).toEqual(before);
});

test('move filtering accepts partial directions and mirrors without rebasing stale items', async () => {
	const source = await project();
	source.manifest.rig.directions.push({ id: 'east' }, { id: 'west', mirrorOf: 'east' });
	source.manifest.rig.animations.push({ ...source.manifest.rig.animations[0], id: 'walk' });
	source.manifest.items[2].baseHash = 'sha256:stale';
	const hash = source.manifest.items[0].layers[0].cells!.idle.south![0]!;
	const filtered = await retainMoves(source.manifest, new Set(['idle']));
	expect(filtered.rig.baseHash).toBe(await baseHashOf(filtered.rig, { 'idle/south/0': hash }));
	expect(filtered.items[1].baseHash).toBe(filtered.rig.baseHash);
	expect(filtered.items[2].baseHash).toBe('sha256:stale');
	for (const item of source.manifest.items) item.layers[0].cells!.idle.east = [hash];
	const mirrored = await retainMoves(source.manifest, new Set(['idle']));
	expect(mirrored.rig.baseHash).toBe(
		await baseHashOf(mirrored.rig, {
			'idle/south/0': hash,
			'idle/east/0': hash
		})
	);
});

test('move ZIP retains standing-reference moves so the imported character remains editable', async () => {
	const source = await project();
	for (const id of ['default', 'walk']) {
		source.manifest.rig.animations.push({ ...source.manifest.rig.animations[0], id });
		for (const item of source.manifest.items)
			item.layers[0].cells![id] = structuredClone(item.layers[0].cells!.idle);
	}
	source.manifest.items[1].standing = 'default';
	const selected = await moveProject(source, 'walk');
	expect(selected.manifest.rig.animations.map((move) => move.id)).toEqual(['default', 'walk']);
	expect(selected.manifest.items[1].standing).toBe('default');
	const result = await buildExport(selected, {
		engine: 'generic',
		baked: false,
		look: { items: { body: 'base', hair: 'hair' }, variants: {} },
		settings: defaultExportSettings()
	});
	expect(result.errors).toEqual([]);
	const imported = await readCharacterZip(result.zip!);
	expect(imported.project.manifest.rig.animations.map((move) => move.id)).toEqual([
		'default',
		'walk'
	]);
	expect(imported.project.manifest.items[1].standing).toBe('default');
	await expect(moveProject(source, 'gone')).rejects.toThrow('no longer available');
});

test.each(['generic', 'godot', 'unity', 'phaser', 'gdevelop', 'aseprite'] as const)(
	'%s exports a State saved without some facings, with their mirrors left out',
	async (engine) => {
		const source = await project();
		const { rig } = source.manifest;
		rig.directions = [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }];
		rig.animations.push({
			id: 'glow',
			kind: 'state',
			cells: 1,
			loop: false,
			frames: [{ cell: 0, ms: 100 }]
		});
		for (const item of source.manifest.items) {
			const cells = item.layers[0].cells!;
			cells.idle.east = [...cells.idle.south!];
		}
		// The east facing of the State came back blank, so it was saved with south only.
		source.manifest.items[0].layers[0].cells!.glow = {
			south: [source.manifest.items[0].layers[0].cells!.idle.south![0]]
		};
		const result = await buildExport(source, { ...exportOptions, engine });
		expect(result.errors).toEqual([]);
		expect(result.kind).toBe('requested');
	}
);
