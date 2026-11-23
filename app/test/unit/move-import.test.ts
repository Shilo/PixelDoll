import { expect, test } from 'vitest';
import { buildExport, moveProject } from '../../src/lib/export/build.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { applyMoveImport, fitPose, planMoveImport } from '../../src/lib/rig/moveImport.ts';
import { retainMoves } from '../../src/lib/rig/moves.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { reframeCharacter } from '../../src/lib/rig/reframe.ts';
import { cellHash, type Keypoint, type Sha256 } from '../../src/lib/rig/rig.ts';
import { defaultExportSettings } from '../../src/lib/store/export-settings.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import {
	CURRENT_FORMAT,
	type Manifest,
	type Project,
	type Provenance
} from '../../src/lib/store/manifest.ts';
import { moveEstimate } from '../../src/studio/movePricing.ts';

const SIZE = 32;
const options = {
	label: (id: string, clips: readonly { id: string; name?: string }[]) => {
		const clip = clips.find((entry) => entry.id === id);
		return clip?.name ?? id[0].toUpperCase() + id.slice(1).replace(/-/g, ' ');
	},
	idOf: (name: string) =>
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
};

/** A body rectangle (with one marked pixel per frame so frames differ), optionally `dy` rows lower. */
function body(frame: number, rgb = [200, 150, 120], dy = 0): Img {
	const im = makeImg(SIZE, SIZE);
	for (let y = 8 + dy; y <= 30 + dy; y++)
		for (let x = 12; x <= 19; x++) im.data.set([...rgb, 255], (y * SIZE + x) * 4);
	if (frame) im.data.set([0, 0, frame * 40, 255], ((20 + dy) * SIZE + 12 + frame) * 4);
	return im;
}
function hair(frame: number, dy = 0): Img {
	const im = makeImg(SIZE, SIZE);
	for (let x = 12; x <= 19; x++) im.data.set([90, 40, 10 + frame, 255], ((8 + dy) * SIZE + x) * 4);
	return im;
}
/** Eighteen joints of an upright body, `lift` px of arm raise, in API coordinates of a SIZE cell. */
function joints(lift = 0, dy = 0): Keypoint[] {
	const at: Record<string, [number, number]> = {
		NOSE: [16, 10],
		NECK: [16, 13],
		'RIGHT SHOULDER': [13, 14],
		'RIGHT ELBOW': [12, 18 - lift],
		'RIGHT ARM': [12, 22 - 2 * lift],
		'LEFT SHOULDER': [19, 14],
		'LEFT ELBOW': [20, 18],
		'LEFT ARM': [20, 22],
		'RIGHT HIP': [14, 22],
		'RIGHT KNEE': [14, 26],
		'RIGHT LEG': [14, 30],
		'LEFT HIP': [18, 22],
		'LEFT KNEE': [18, 26],
		'LEFT LEG': [18, 30],
		'RIGHT EYE': [15, 9],
		'LEFT EYE': [17, 9],
		'RIGHT EAR': [14, 10],
		'LEFT EAR': [18, 10]
	};
	return LABELS.map((label) => ({ label, x: at[label][0] / SIZE, y: (at[label][1] + dy) / SIZE }));
}

/** A one-direction character: Standing, and a two-frame walk worn with hair. */
async function character(o: { rgb?: number[]; dy?: number; walk?: number } = {}): Promise<Project> {
	const images = new Map<string, Img>();
	const put = async (im: Img) => {
		const h = await cellHash(im);
		images.set(h, im);
		return h;
	};
	const dy = o.dy ?? 0,
		w = o.walk ?? 1;
	const stand = await put(body(0, o.rgb, dy));
	const walk = [await put(body(w, o.rgb, dy)), await put(body(w + 1, o.rgb, dy))];
	const hairStand = await put(hair(0, dy)),
		hairWalk = [await put(hair(1, dy)), await put(hair(2, dy))];
	const provenance: Provenance = {
		endpoint: '/animate-with-skeleton-v3',
		params: {},
		seed: 7,
		requestHash: `sha256:${'a'.repeat(64)}` as Sha256,
		createdAt: '2026-11-01T00:00:00.000Z',
		produced: ['walk/south/0', 'walk/south/1'] as Provenance['produced']
	};
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		app: 'PixelDoll',
		name: 'Hero',
		rig: {
			cell: { w: SIZE, h: SIZE },
			pivot: { x: 16, y: 31 + dy },
			baseItem: 'base',
			baseHash: stand,
			directions: [{ id: 'south' }],
			rest: { south: { image: stand, keypoints: joints(0, dy) } },
			animations: [
				{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
				{
					id: 'walk',
					kind: 'move',
					cells: 2,
					loop: true,
					frames: [
						{ cell: 0, ms: 100 },
						{ cell: 1, ms: 100 }
					],
					sources: {
						south: {
							route: 'skeleton-v3',
							reference: stand,
							keypoints: [joints(2, dy), joints(4, dy)],
							provenance: [0]
						}
					}
				}
			]
		},
		slots: [
			{ id: 'body', z: 10, class: 'base' },
			{ id: 'hair', z: 20, class: 'worn' }
		],
		items: [
			{
				id: 'base',
				name: 'Body',
				slot: 'body',
				status: 'accepted',
				mirror: 'generate',
				materials: [],
				prompt: '',
				provenance: [provenance],
				baseHash: stand,
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 10,
						cells: { default: { south: [stand] }, walk: { south: walk } }
					}
				]
			},
			{
				id: 'hair',
				name: 'Hair',
				slot: 'hair',
				status: 'accepted',
				mirror: 'generate',
				materials: [],
				prompt: '',
				provenance: [],
				baseHash: stand,
				coverage: ['default/south/0', 'walk/south/0', 'walk/south/1'],
				layers: [
					{
						id: 'main',
						role: 'fg',
						z: 20,
						cells: { default: { south: [hairStand] }, walk: { south: hairWalk } }
					}
				]
			}
		],
		materials: [],
		presets: []
	};
	return { manifest, images };
}

/** The walk's Download ZIP, read back as the Import sheet reads it. */
async function walkZip(source: Project) {
	const result = await buildExport(await moveProject(source, 'walk'), {
		engine: 'generic',
		baked: false,
		look: { items: { body: 'base', hair: 'hair' }, variants: {} },
		settings: defaultExportSettings()
	});
	expect(result.errors).toEqual([]);
	return readCharacterZip(result.zip!);
}
const target = (p: Project) => ({ record: { manifest: p.manifest }, images: p.images });

test('a backed-up move comes back free onto the same character, with its items and costs once', async () => {
	const hero = await character();
	const zip = await walkZip(hero);
	const manifest = await retainMoves(hero.manifest, new Set(['default']));
	const kept = new Set(
		manifest.items.flatMap((i) => Object.values(i.layers[0].cells!.default!).flat())
	) as Set<string>;
	const without = { manifest, images: new Map([...hero.images].filter(([h]) => kept.has(h))) };
	without.manifest.items[0].provenance = structuredClone(hero.manifest.items[0].provenance);
	const plan = await planMoveImport(target(without), zip, options);
	expect(plan.fit).toEqual({ same: true, differing: 0 });
	expect(plan.rows).toMatchObject([{ id: 'walk', action: 'add', items: ['hair'], left: [] }]);
	const { record, images } = await applyMoveImport(target(without), plan, ['walk']);
	const m = record.manifest;
	expect(m.rig.animations.map((a) => a.id)).toEqual(['default', 'walk']);
	expect(m.items[0].layers[0].cells!.walk).toEqual(hero.manifest.items[0].layers[0].cells!.walk);
	expect(m.items[1].layers[0].cells!.walk).toEqual(hero.manifest.items[1].layers[0].cells!.walk);
	expect(m.items[1].coverage).toContain('walk/south/1');
	// The same paid call is not counted twice, and the move's source still points at it.
	expect(m.items[0].provenance).toHaveLength(1);
	expect(m.rig.animations[1].sources!.south!.provenance).toEqual([0]);
	expect(m.rig.baseHash).not.toBe(without.manifest.rig.baseHash);
	expect(images.size).toBe(4);
});

test('a move this character already has is offered as present, a different one with its name is kept as a copy', async () => {
	const hero = await character();
	const zip = await walkZip(hero);
	expect((await planMoveImport(target(hero), zip, options)).rows[0].action).toBe('present');
	const other = await character({ walk: 3 });
	const plan = await planMoveImport(target(other), zip, options);
	expect(plan.rows[0]).toMatchObject({
		action: 'copy',
		targetId: 'walk-2',
		targetName: 'Walk 2'
	});
	const { record } = await applyMoveImport(target(other), plan, ['walk']);
	const copy = record.manifest.rig.animations.find((a) => a.id === 'walk-2')!;
	expect(copy.name).toBe('Walk 2');
	expect(record.manifest.rig.animations.find((a) => a.id === 'walk')!.cells).toBe(2);
	expect(record.manifest.items[1].layers[0].cells!['walk-2']).toEqual(
		hero.manifest.items[1].layers[0].cells!.walk
	);
	expect(record.manifest.items[1].coverage).toContain('walk-2/south/0');
	// The copy's frames come from the same paid call as this character's walk: listed once, now producing both.
	expect(record.manifest.items[0].provenance).toHaveLength(1);
	expect(copy.sources!.south!.provenance).toEqual([0]);
	expect(record.manifest.items[0].provenance[0].produced).toContain('walk-2/south/1');
});

test('a move made before Adjust frame lines up with the resized character', async () => {
	const hero = await character();
	const zip = await walkZip(hero);
	const { record: grown, newImages } = await reframeCharacter(
		{ manifest: await retainMoves(hero.manifest, new Set(['default'])) },
		hero.images,
		{ size: SIZE + 8, dy: 2 }
	);
	const images = new Map([...hero.images, ...newImages]);
	const plan = await planMoveImport({ record: grown, images }, zip, options);
	expect(plan.fit).toEqual({ same: true, shift: { size: SIZE + 8, dy: 2 }, differing: 0 });
	const { record, images: added } = await applyMoveImport({ record: grown, images }, plan, [
		'walk'
	]);
	const hash = record.manifest.items[0].layers[0].cells!.walk.south![0]!;
	const frame = added.get(hash)!;
	expect(frame.w).toBe(SIZE + 8);
	// The marked pixel moved 4 right (centered) and 4 + 2 down.
	expect([
		...frame.data.subarray(
			((20 + 6) * (SIZE + 8) + 13 + 4) * 4,
			((20 + 6) * (SIZE + 8) + 14 + 4) * 4
		)
	]).toEqual([0, 0, 40, 255]);
});

test('a touched-up Standing still counts as the same body; a different body offers only its motion', async () => {
	const hero = await character();
	const zip = await walkZip(hero);
	const touched = await character();
	const stand = touched.manifest.items[0].layers[0].cells!.default.south![0]!;
	const edited = structuredClone(touched.images.get(stand)!);
	edited.data.set([1, 2, 3, 255], (10 * SIZE + 13) * 4);
	edited.data.set([1, 2, 3, 255], (11 * SIZE + 13) * 4);
	const h = await cellHash(edited);
	touched.images.set(h, edited);
	touched.manifest.items[0].layers[0].cells!.default.south = [h];
	const near = await planMoveImport(target(touched), zip, options);
	expect(near.fit).toEqual({ same: true, differing: 2 });
	expect(near.rows[0].action).toBe('present');

	const stranger = await character({ rgb: [20, 200, 20], dy: 1 });
	const plan = await planMoveImport(target(stranger), zip, options);
	expect(plan.fit).toEqual({ same: false, reason: 'body' });
	expect(plan.source).toBeUndefined();
	expect(plan.rows[0]).toMatchObject({ action: 'motion', targetId: 'walk-2', items: [] });
	const poses = plan.rows[0].poses!.south!;
	expect(poses).toHaveLength(2);
	// Fitted to this body: one row lower, the arm still raised as in the source.
	const wrist = poses[1].find((k) => k.label === 'RIGHT ARM')!;
	expect(wrist.y * SIZE).toBeCloseTo(22 - 8 + 1, 1);
	await expect(applyMoveImport(target(stranger), plan, ['walk'])).rejects.toThrow('Nothing');
});

test('fitted joints keep this body at rest and turn its bones like the source', () => {
	const rest = joints(),
		big = joints().map((k) => ({ ...k, y: Math.min(1, k.y * 1.02) }));
	const same = fitPose(rest, rest, { w: SIZE, h: SIZE }, big, { w: SIZE, h: SIZE })!;
	for (const [i, k] of same.entries()) {
		expect(k.x).toBeCloseTo(big[i].x, 3);
		expect(k.y).toBeCloseTo(big[i].y, 3);
	}
	const moved = fitPose(joints(3), rest, { w: SIZE, h: SIZE }, rest, { w: SIZE, h: SIZE })!;
	expect(moved.find((k) => k.label === 'RIGHT ARM')!.y * SIZE).toBeCloseTo(16, 1);
});

test('imported motion costs the body render and checks, never a motion request', async () => {
	const hero = await character();
	const poses = { south: [joints(2), joints(4), joints(2), joints(0)] };
	const imported = moveEstimate(hero.manifest, {
		id: 'wave',
		poses,
		frames: 4,
		animation: { model: 'skeleton-v3', frameCount: 4 },
		items: []
	});
	const described = moveEstimate(hero.manifest, {
		id: 'wave',
		frames: 4,
		animation: { model: 'skeleton-v3', frameCount: 4 },
		motionSource: 'standalone',
		items: []
	});
	expect(imported.gens).toBeLessThan(described.gens);
});

test('a move into a touched-up Standing points at this body’s standing view and can still be reframed', async () => {
	const hero = await character();
	const zip = await walkZip(hero);
	const touched = { ...hero, manifest: await retainMoves(hero.manifest, new Set(['default'])) };
	touched.images = new Map(hero.images);
	const stand = touched.manifest.items[0].layers[0].cells!.default.south![0]!;
	const edited = structuredClone(touched.images.get(stand)!);
	edited.data.set([1, 2, 3, 255], (10 * SIZE + 13) * 4);
	const h = await cellHash(edited);
	touched.images.set(h, edited);
	touched.images.delete(stand);
	touched.manifest.items[0].layers[0].cells!.default.south = [h];
	touched.manifest.rig.rest!.south!.image = h;
	const plan = await planMoveImport(target(touched), zip, options);
	expect(plan.fit).toMatchObject({ same: true, differing: 1 });
	const { record, images } = await applyMoveImport(target(touched), plan, ['walk']);
	const walk = record.manifest.rig.animations.find((a) => a.id === 'walk')!;
	expect(walk.sources!.south!.reference).toBe(h);
	const all = new Map([...touched.images, ...images]);
	await expect(reframeCharacter(record, all, { size: SIZE + 2, dy: 0 })).resolves.toBeTruthy();
});

test('motion that started from a saved frame is fitted from Standing, keeping its raised pose', async () => {
	const hero = await character();
	const walk = hero.manifest.rig.animations[1];
	walk.sources!.south!.referenceKeypoints = joints(4);
	walk.sources!.south!.keypoints = [joints(4), joints(4)];
	const zip = await walkZip(hero);
	const stranger = await character({ rgb: [20, 200, 20], dy: 1 });
	const plan = await planMoveImport(target(stranger), zip, options);
	const wrist = plan.rows[0].poses!.south![0].find((k) => k.label === 'RIGHT ARM')!;
	expect(wrist.y * SIZE).toBeCloseTo(22 - 8 + 1, 1);
});

test('characters without Standing are compared on a move both have, and items still come along', async () => {
	const hero = await character();
	const punch = structuredClone(hero.manifest.rig.animations[1]);
	punch.id = 'punch';
	hero.manifest.rig.animations.push(punch);
	for (const item of hero.manifest.items) {
		item.layers[0].cells!.punch = structuredClone(item.layers[0].cells!.walk);
		if (item.coverage) item.coverage.push('punch/south/0', 'punch/south/1');
	}
	hero.manifest.items[0].provenance[0].produced.push('punch/south/0', 'punch/south/1');
	const source = {
		...hero,
		manifest: await retainMoves(hero.manifest, new Set(['walk', 'punch']))
	};
	delete source.manifest.rig.rest;
	const result = await buildExport(source, {
		engine: 'generic',
		baked: false,
		look: { items: { body: 'base', hair: 'hair' }, variants: {} },
		settings: defaultExportSettings()
	});
	const zip = await readCharacterZip(result.zip!);
	const mine = { ...source, manifest: await retainMoves(source.manifest, new Set(['walk'])) };
	const plan = await planMoveImport(target(mine), zip, options);
	expect(plan.fit).toEqual({ same: true, differing: 0 });
	expect(plan.rows.find((row) => row.id === 'punch')).toMatchObject({
		action: 'add',
		items: ['hair']
	});
});
