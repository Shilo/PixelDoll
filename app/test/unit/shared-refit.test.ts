import { beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { acceptCopy, copyMoreFrames, freeFrames, sharedFit } from '../../src/lib/equipment/copy.ts';
import { REFIT, refitShared } from '../../src/lib/equipment/refit.ts';
import { refitNotes } from '../../src/studio/model.ts';
import { forgetFits, listShared } from '../../src/lib/equipment/shared.ts';
import { translate } from '../../src/lib/items/items.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { decodePng, makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, DEFAULT_MOVE, type Keypoint, type Rig } from '../../src/lib/rig/rig.ts';
import { loadProject } from '../../src/lib/store/project.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';
import {
	CURRENT_FORMAT,
	type Item,
	type Project,
	type Sha256
} from '../../src/lib/store/manifest.ts';
import { runCase } from '../../scripts/bench.ts';

const memory = vi.hoisted(() => ({
	records: new Map<string, unknown>(),
	blobs: new Map<string, Blob>(),
	writes: 0
}));
vi.mock('../../src/lib/store/db.ts', () => ({
	get: async (_s: string, id: string) => structuredClone(memory.records.get(id)),
	all: async () => [...memory.records.values()].map((r) => structuredClone(r)),
	getBlob: async (hash: string) => memory.blobs.get(hash),
	updateCharacter: async (
		id: string,
		blobs: Map<string, Blob>,
		fn: (record: unknown) => unknown,
		stored?: { keys: Iterable<string>; missing: (key: string) => Error }
	) => {
		for (const key of stored?.keys ?? []) if (!memory.blobs.has(key)) throw stored!.missing(key);
		const record = fn(structuredClone(memory.records.get(id)));
		for (const [hash, blob] of blobs) memory.blobs.set(hash, blob);
		memory.records.set(id, structuredClone(record));
		memory.writes++;
	}
}));
beforeEach(() => {
	memory.records.clear();
	memory.blobs.clear();
	memory.writes = 0;
	forgetFits();
});
async function store(id: string, p: Project) {
	for (const [hash, im] of p.images)
		memory.blobs.set(
			hash.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	memory.records.set(id, {
		id,
		savedAt: '2026-11-01T00:00:00.000Z',
		origin: 'studio',
		manifest: p.manifest
	});
}

// ---------- synthetic characters: one south view, a standing Default move and a two-frame slash ----------
type Px = [number, number];
const POSE: Record<string, Px> = {
	NOSE: [32, 14],
	NECK: [32, 20],
	'RIGHT SHOULDER': [28, 22],
	'RIGHT ELBOW': [27, 30],
	'RIGHT ARM': [27, 36],
	'LEFT SHOULDER': [36, 22],
	'LEFT ELBOW': [37, 30],
	'LEFT ARM': [37, 36],
	'RIGHT HIP': [30, 40],
	'RIGHT KNEE': [30, 48],
	'RIGHT LEG': [30, 56],
	'LEFT HIP': [34, 40],
	'LEFT KNEE': [34, 48],
	'LEFT LEG': [34, 56],
	'RIGHT EYE': [30, 13],
	'LEFT EYE': [34, 13],
	'RIGHT EAR': [28, 14],
	'LEFT EAR': [36, 14]
};
/** Keypoints of POSE moved by (dx, dy), with some joints placed elsewhere (px). */
const pose = (dx = 0, dy = 0, at: Record<string, Px> = {}): Keypoint[] =>
	LABELS.map((label) => {
		const [x, y] = at[label] ?? POSE[label];
		return { label, x: (x + dx) / 64, y: (y + dy) / 64 };
	});
const fill = (im: Img, x0: number, y0: number, w: number, h: number, rgba: number[]) => {
	for (let y = y0; y < y0 + h; y++)
		for (let x = x0; x < x0 + w; x++) im.data.set(rgba, (y * im.w + x) * 4);
};
/** A body block from the shoulders to the feet, moved by (dx, dy), its left side (the right hand's) trimmed by `slim` px. */
function bodyAt(dx: number, dy: number, slim = 0) {
	const im = makeImg(64, 64);
	fill(im, 24 + dx + slim, 12 + dy, 16 - slim, 48, [180, 120, 90, 255]);
	return im;
}
/** A sword in the right hand on the 96 px held canvas (pad 16): grip over the body, blade and guard beyond it. */
function swordAt(wrist: Px) {
	const im = makeImg(96, 96),
		[x, y] = [wrist[0] + 16, wrist[1] + 16];
	fill(im, x, y - 14, 1, 16, [200, 200, 210, 255]);
	fill(im, x - 2, y + 1, 5, 1, [90, 60, 30, 255]);
	return im;
}
interface Spec {
	name: string;
	/** Body and joints moved by this offset (px). */
	at?: Px;
	/** Joints of the second slash frame. */
	slash1?: Record<string, Px>;
	/** Standing keypoints with the hand labels swapped. */
	swapped?: boolean;
	/** An extra two-frame move with these joints. */
	extra?: { id: string; at: Record<string, Px> };
	sword?: boolean;
	/** Px trimmed from the body's left side. */
	slim?: number;
}
async function character(o: Spec): Promise<Project> {
	const [dx, dy] = o.at ?? [0, 0];
	const images = new Map<Sha256, Img>(),
		put = async (im: Img) => {
			const h = await cellHash(im);
			images.set(h, im);
			return h;
		};
	const body = await put(bodyAt(dx, dy, o.slim));
	const rest = o.swapped
		? pose(dx, dy, { 'RIGHT ARM': POSE['LEFT ARM'], 'LEFT ARM': POSE['RIGHT ARM'] })
		: pose(dx, dy);
	const slash = [pose(dx, dy), pose(dx, dy, o.slash1 ?? { 'RIGHT ARM': [27, 37] })];
	const moves: Rig['animations'] = [
		{ id: DEFAULT_MOVE, cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
		{
			id: 'slash',
			cells: 2,
			loop: true,
			frames: [
				{ cell: 0, ms: 100 },
				{ cell: 1, ms: 100 }
			],
			sources: {
				south: { route: 'skeleton-v3', reference: body, keypoints: slash, provenance: [] }
			}
		}
	];
	if (o.extra)
		moves.push({
			id: o.extra.id,
			cells: 2,
			loop: true,
			frames: [
				{ cell: 0, ms: 100 },
				{ cell: 1, ms: 100 }
			],
			sources: {
				south: {
					route: 'skeleton-v3',
					reference: body,
					keypoints: [pose(dx, dy, o.extra.at), pose(dx, dy, o.extra.at)],
					provenance: []
				}
			}
		});
	const baseHash = `sha256:${'b'.repeat(64)}` as Sha256;
	const items: Item[] = [
		{
			id: 'base',
			name: 'Body',
			slot: 'body',
			status: 'accepted',
			mirror: 'flip',
			materials: [],
			prompt: '',
			baseHash,
			provenance: [],
			layers: [
				{
					id: 'main',
					role: 'fg',
					z: 10,
					cells: Object.fromEntries(moves.map((a) => [a.id, { south: Array(a.cells).fill(body) }]))
				}
			]
		}
	];
	if (o.sword) {
		const cells = {
			[DEFAULT_MOVE]: { south: [await put(swordAt(POSE['RIGHT ARM']))] },
			slash: {
				south: [
					await put(swordAt(POSE['RIGHT ARM'])),
					await put(swordAt((o.slash1 ?? { 'RIGHT ARM': [27, 37] as Px })['RIGHT ARM']))
				]
			}
		};
		items.push({
			id: 'sword',
			name: 'Steel sword',
			slot: 'main_hand',
			status: 'accepted',
			mirror: 'flip',
			materials: ['sword'],
			prompt: 'a steel sword',
			baseHash,
			route: 'skeleton-pose',
			dressed: { south: body },
			provenance: [],
			coverage: ['default/south/0', 'slash/south/0', 'slash/south/1'],
			qa: {
				status: 'pass',
				rerolls: 0,
				cells: {},
				clips: {},
				minKeyKept: 1,
				maxKeyOutside: 0,
				minAreaRatio: 1,
				maxAreaCV: 0,
				maxPaletteDist: 0,
				clipPx: 0
			},
			layers: [
				{
					id: 'fg',
					role: 'fg',
					z: 150,
					cell: { w: 96, h: 96 },
					pivot: { x: 48, y: 76 },
					cells
				}
			]
		});
	}
	return {
		images,
		manifest: {
			format: CURRENT_FORMAT,
			name: o.name,
			app: 'test',
			rig: {
				view: 'low top-down',
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 60 },
				directions: [{ id: 'south' }],
				animations: moves,
				baseItem: 'base',
				baseHash,
				rest: { south: { image: body, keypoints: rest } }
			},
			items,
			materials: o.sword
				? [{ id: 'sword', owner: 'sword', label: 'Metal', ramp: ['#c8c8d2'], variants: {} }]
				: [],
			slots: [
				{ id: 'body', class: 'base', z: 10 },
				{ id: 'main_hand', class: 'held', anchor: 'hand_r', z: 150 },
				{ id: 'head', class: 'rigid', anchor: 'head', z: 130 }
			],
			presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }]
		}
	};
}
const knight = () => character({ name: 'Knight', sword: true });
const refit = (source: Project, target: Project) =>
	refitShared(source.manifest, 'sword', {}, target.manifest, async (h) => {
		const im = source.images.get(h) ?? target.images.get(h);
		if (!im) throw new Error(`missing ${h}`);
		return im;
	});
const cellsOf = (item: Item, images: Map<string, Img>) => {
	const out: Record<string, Img | null> = {};
	for (const [anim, dirs] of Object.entries(item.layers[0].cells ?? {}))
		for (const [dir, hs] of Object.entries(dirs ?? {}))
			for (const [i, h] of (hs ?? []).entries())
				out[`${anim}/${dir}/${i}`] = h ? images.get(h)! : null;
	return out;
};

test('a held item on a body moved by a known offset moves by exactly that offset and is marked for review', async () => {
	const source = await knight(),
		target = await character({ name: 'Squire', at: [2, 1] });
	await store('rig-knight', source);
	await store('rig-squire', target);
	const item = (await acceptCopy('rig-knight', 'sword', 'rig-squire'))!;
	expect(item).not.toBeNull();
	expect(item.id).not.toBe('sword');
	expect(item.copiedFrom).toEqual({ id: 'rig-knight', name: 'Knight', item: 'sword' });
	// No frame failed a check: it keeps the source's checks, and only notes would ask for a look.
	expect(item.refit).toEqual([]);
	expect(item.qa?.status).toBe('pass');
	expect(item.coverage).toEqual(['default/south/0', 'slash/south/0', 'slash/south/1']);
	expect(item.dressed).toBeUndefined();
	expect(item.route).toBeUndefined();
	const saved = await loadProject('rig-squire'),
		copied = saved.project.manifest.items.find((it) => it.id === item.id)!;
	expect(copied.baseHash).toBe(saved.project.manifest.rig.baseHash);
	const before = cellsOf(source.manifest.items[1], source.images),
		after = cellsOf(copied, saved.project.images);
	expect(Object.keys(after)).toEqual(Object.keys(before));
	for (const [key, im] of Object.entries(before)) expect(after[key]).toEqual(translate(im!, 2, 1));
	// The source keeps its item.
	expect((await loadProject('rig-knight')).project.manifest).toEqual(source.manifest);
});

const turned = { 'RIGHT ELBOW': [21, 36] as Px, 'RIGHT ARM': [27, 37] as Px };
test('a forearm at a different angle in more than a quarter of the frames does not fit', async () => {
	// One of three frames.
	expect(
		await refit(await knight(), await character({ name: 'Fencer', at: [1, 0], slash1: turned }))
	).toBeNull();
});

test('up to a quarter of the frames may fail a check: the copy names them for a look', async () => {
	// One of five frames: the standing frame also dresses a still two-frame idle.
	const fit = (await refit(
		await knight(),
		await character({
			name: 'Fencer',
			at: [1, 0],
			slash1: turned,
			extra: { id: 'idle', at: {} }
		})
	))!;
	expect(fit).not.toBeNull();
	expect(fit.item.coverage).toHaveLength(5);
	expect(fit.item.refit).toEqual([{ anim: 'slash', dir: 'south', frames: [1], checks: ['angle'] }]);
	// The failing frame still moves with the wrist.
	const source = await knight();
	expect(cellsOf(fit.item, fit.images!)['slash/south/1']).toEqual(
		translate(source.images.get(source.manifest.items[1].layers[0].cells!.slash.south![1]!)!, 1, 0)
	);
});

test('measured joints place the item where the body was drawn', async () => {
	const source = await knight(),
		target = await character({ name: 'Squire', at: [1, 0] });
	// Re-estimated on the frozen frames: the drawn slash stands 1 px further right than requested.
	const slash = target.manifest.rig.animations.find((a) => a.id === 'slash')!.sources!.south!;
	slash.measured = [pose(2, 0), pose(2, 0, { 'RIGHT ARM': [27, 37] })];
	const fit = (await refit(source, target))!,
		before = cellsOf(source.manifest.items[1], source.images),
		after = cellsOf(fit.item, fit.images!);
	expect(after['default/south/0']).toEqual(translate(before['default/south/0']!, 1, 0));
	expect(after['slash/south/0']).toEqual(translate(before['slash/south/0']!, 2, 0));
	expect(after['slash/south/1']).toEqual(translate(before['slash/south/1']!, 2, 0));
});

test('a character whose hand labels are swapped does not fit', async () => {
	const source = await knight();
	expect(await refit(source, await character({ name: 'Mirror', at: [1, 0] }))).not.toBeNull();
	expect(
		await refit(source, await character({ name: 'Mirror', at: [1, 0], swapped: true }))
	).toBeNull();
});

test('a move the source lacks fits only where the target stands still', async () => {
	const source = await knight();
	const still = (await refit(
		source,
		await character({ name: 'Idler', at: [1, 0], extra: { id: 'idle', at: {} } })
	))!;
	// The standing frame dresses both still frames.
	expect(still.item.coverage).toEqual([
		'default/south/0',
		'slash/south/0',
		'slash/south/1',
		'idle/south/0',
		'idle/south/1'
	]);
	expect(still.item.layers[0].cells!.idle.south).toEqual([
		still.item.layers[0].cells![DEFAULT_MOVE].south![0],
		still.item.layers[0].cells![DEFAULT_MOVE].south![0]
	]);
	const kick = { 'RIGHT KNEE': [26, 44] as Px, 'RIGHT LEG': [20, 46] as Px };
	expect(
		await refit(
			source,
			await character({ name: 'Kicker', at: [1, 0], extra: { id: 'kick', at: kick } })
		)
	).toBeNull();
});

test('only held items re-fit, and never one that hides body pixels', async () => {
	const source = await knight(),
		target = await character({ name: 'Squire', at: [1, 0] });
	const sword = source.manifest.items[1];
	sword.baseCut = { slash: { south: [[100], null] } };
	expect(await refit(source, target)).toBeNull();
	delete sword.baseCut;
	sword.slot = 'head';
	expect(await refit(source, target)).toBeNull();
});

const withViews = async (p: Promise<Project>, directions: Rig['directions']) => {
	const out = await p;
	out.manifest.rig.directions = directions;
	return out;
};
const squire = () => character({ name: 'Squire', at: [1, 0] });

test('views must be drawn or mirrored alike: a view mirrored on one character and drawn on the other does not fit', async () => {
	const mirrored: Rig['directions'] = [
		{ id: 'south' },
		{ id: 'east' },
		{ id: 'west', mirrorOf: 'east' }
	];
	const drawn: Rig['directions'] = [{ id: 'south' }, { id: 'east' }, { id: 'west' }];
	const pair = async (from: Rig['directions'], to: Rig['directions']) =>
		refit(await withViews(knight(), from), await withViews(squire(), to));
	expect(await pair(mirrored, mirrored)).not.toBeNull();
	expect(await pair(drawn, drawn)).not.toBeNull();
	expect(await pair(mirrored, drawn)).toBeNull();
	expect(await pair(drawn, mirrored)).toBeNull();
});

test('a source lacking a view the target draws does not fit; a source with more views does', async () => {
	const four: Rig['directions'] = [{ id: 'south' }],
		eight: Rig['directions'] = [{ id: 'south' }, { id: 'south-east' }];
	expect(await refit(await withViews(knight(), four), await withViews(squire(), eight))).toBeNull();
	expect(
		await refit(await withViews(knight(), eight), await withViews(squire(), four))
	).not.toBeNull();
});

test('an item the source’s checks found in the wrong hand does not re-fit', async () => {
	const target = await squire();
	const held = async (hand: 'r' | 'l') => {
		const source = await knight(),
			qa = source.manifest.items[1].qa!;
		qa.clips['slash/south'] = { ...qa, hand };
		return source;
	};
	expect(await refit(await held('r'), target)).not.toBeNull();
	expect(await refit(await held('l'), target)).toBeNull();
	const warned = await knight();
	warned.manifest.items[1].designWarnings = [
		'G8 main_hand: held in the left hand; slot main_hand expects hand_r'
	];
	expect(await refit(warned, target)).toBeNull();
});

test('a wrong hand found only facing east or west, where one arm hides the other, does not refuse a re-fit', async () => {
	const target = await squire(),
		source = await knight(),
		qa = source.manifest.items[1].qa!,
		{ cells: _cells, clips: _clips, rerolls: _rerolls, ...summary } = qa;
	qa.clips = {
		'slash/south': { ...summary, hand: 'r' },
		'slash/east': { ...summary, hand: 'l' },
		'default/west': { ...summary, hand: 'l' }
	};
	// The item-wide verdict mixes every view, so it saw a switch.
	qa.handedness = 'switched';
	expect(await refit(source, target)).not.toBeNull();
	// A diagonal shows both hands: it decides like the front.
	qa.clips['slash/south-east'] = { ...summary, hand: 'l' };
	expect(await refit(source, target)).toBeNull();
	// Without any view's own hand, the item-wide verdict decides.
	qa.clips = {};
	expect(await refit(source, target)).toBeNull();
});

test('a grip up to 2 px beside a slimmer body still counts as on it; farther, it may float', async () => {
	// The blade lies 2 px left of this body's edge, the guard partly over it.
	expect(
		(await refit(await knight(), await character({ name: 'Slim', slim: 5 })))!.item.refit
	).toEqual([]);
	const far = await character({ name: 'Slimmer', slim: 6 });
	expect(await refit(await knight(), far)).toBeNull();
	REFIT.maxFailing = 1;
	try {
		expect((await refit(await knight(), far))!.item.refit).toEqual([
			{ anim: 'default', dir: 'south', frames: [0], checks: ['body'] },
			{ anim: 'slash', dir: 'south', frames: [0, 1], checks: ['body'] }
		]);
	} finally {
		REFIT.maxFailing = 0.25;
	}
});

test('the source design’s smudges move with a re-fit as notes on that view, never counted as failed frames', async () => {
	const source = await knight(),
		target = await squire();
	source.manifest.items[1].designWarnings = [
		'D1 keyframe rest/south/0: 5 % gray smudges in a colorful design',
		'D1 keyframe rest/south/0: a dark patch not seen in the other views, possibly not part of the design'
	];
	const fit = (await refit(source, target))!;
	expect(fit.item.refit).toEqual([
		{ anim: 'default', dir: 'south', frames: [0], checks: ['smudge'] },
		{ anim: 'default', dir: 'south', frames: [0], checks: ['dark'] }
	]);
	// In plain words: a design finding names its view, a one-frame move no frame number.
	fit.item.copiedFrom = { id: 'rig-knight', name: 'Knight', item: 'sword' };
	fit.item.refit!.push({ anim: 'default', dir: 'south', frames: [0], checks: ['angle'] });
	fit.item.refit!.push({ anim: 'slash', dir: 'south', frames: [1], checks: ['body'] });
	expect(refitNotes(target.manifest, fit.item).map((n) => n.text)).toEqual([
		'Facing south: Knight’s design has gray smudges in this view.',
		'Facing south: Knight’s design has a dark patch the other views lack.',
		'Default facing south: the forearm points another way than on Knight.',
		'Slash facing south, frame 2: the grip may float off the body.'
	]);
});

const loadStored = async (h: Sha256) => {
	const blob = memory.blobs.get(h.slice(7));
	if (!blob) throw new Error(`missing ${h}`);
	return decodePng(blob);
};

test('a re-fit never re-fits again, but copies exactly onto an identical body with its notes and first source', async () => {
	const fencer = (name: string) =>
		character({ name, at: [1, 0], slash1: turned, extra: { id: 'idle', at: {} } });
	await store('rig-knight', await knight());
	await store('rig-fencer', await fencer('Fencer'));
	const fitted = (await acceptCopy('rig-knight', 'sword', 'rig-fencer'))!;
	expect(fitted.refit).toEqual([{ anim: 'slash', dir: 'south', frames: [1], checks: ['angle'] }]);
	// A different body: the re-fit's pixels are only worn as drawn, never fitted again; the original still re-fits.
	const holder = (await loadProject('rig-fencer')).project.manifest,
		ranger = await character({ name: 'Ranger', at: [2, 0], extra: { id: 'idle', at: {} } }),
		other = ranger.manifest,
		original = await knight();
	await store('rig-ranger', ranger);
	expect(await sharedFit(holder, fitted, other, loadStored)).toBe('unfitted');
	expect(await sharedFit(original.manifest, original.manifest.items[1], other, loadStored)).toBe(
		'refit'
	);
	// The holder's identical twin: an exact copy keeps the notes, which name the same frames there.
	const twin = await fencer('Twin');
	await store('rig-twin', twin);
	expect(await sharedFit(holder, fitted, twin.manifest, loadStored)).toBe('copy');
	const copied = (await acceptCopy('rig-fencer', fitted.id, 'rig-twin'))!;
	expect(copied.refit).toEqual(fitted.refit);
	expect(copied.copiedFrom).toEqual({ id: 'rig-knight', name: 'Knight', item: 'sword' });
});

test('an exact copy missing frames the item has on its source gives way to a re-fit that covers them', async () => {
	const source = await knight(),
		target = await character({ name: 'Twin' });
	// The same body except the second slash frame, which differs by one pixel away from the hand.
	const changed = bodyAt(0, 0);
	fill(changed, 0, 0, 1, 1, [1, 2, 3, 255]);
	const h = await cellHash(changed);
	target.images.set(h, changed);
	target.manifest.items[0].layers[0].cells!.slash!.south![1] = h;
	await store('rig-knight', source);
	await store('rig-twin', target);
	const sword = source.manifest.items[1];
	expect(await sharedFit(source.manifest, sword, target.manifest, loadStored)).toBe('refit');
	const item = (await acceptCopy('rig-knight', 'sword', 'rig-twin'))!;
	expect(item.coverage).toEqual(['default/south/0', 'slash/south/0', 'slash/south/1']);
	expect(item.refit).toEqual([]);
	// Every frame matches on an identical body: an exact copy.
	const page = await character({ name: 'Page' });
	expect(await sharedFit(source.manifest, sword, page.manifest, loadStored)).toBe('copy');
});

test('a different pivot re-fits through each rig’s own pivot; a different canvas never does', async () => {
	const source = await knight(),
		target = await character({ name: 'Squire', at: [2, 1] });
	target.manifest.rig.pivot = { x: 31, y: 62 };
	const fit = (await refit(source, target))!;
	expect(fit).not.toBeNull();
	// The padded held layer keeps its 16 px around the target's pivot, so it still lines up with the body by pivot.
	expect(fit.item.layers[0].cell).toEqual({ w: 96, h: 96 });
	expect(fit.item.layers[0].pivot).toEqual({ x: 31 + 16, y: 62 + 16 });
	const before = cellsOf(source.manifest.items[1], source.images),
		after = cellsOf(fit.item, fit.images!);
	for (const [key, im] of Object.entries(before)) expect(after[key]).toEqual(translate(im!, 2, 1));
	// Composed on each body's own canvas, the sword sits on the body exactly as on the source.
	const worn = (p: Project, item: Item, images: Map<Sha256, Img>) =>
		composeCell(
			{
				...p,
				images: new Map([...p.images, ...images]),
				manifest: { ...p.manifest, items: [p.manifest.items[0], item] }
			},
			{ body: 'base', main_hand: item.id },
			'slash',
			'south',
			1
		);
	const onBody = (im: Img) => {
		const px = (rgba: string) => {
			const out: [number, number][] = [];
			for (let y = 0; y < im.h; y++)
				for (let x = 0; x < im.w; x++)
					if (im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4).join() === rgba)
						out.push([x, y]);
			return out;
		};
		const [x0, y0] = px('180,120,90,255')[0];
		return px('200,200,210,255').map(([x, y]) => `${x - x0},${y - y0}`);
	};
	const placed = onBody(worn(source, source.manifest.items[1], new Map()));
	expect(placed.length).toBeGreaterThan(0);
	expect(onBody(worn(target, fit.item, fit.images!))).toEqual(placed);
	target.manifest.rig.cell = { w: 72, h: 72 };
	expect(await refit(source, target)).toBeNull();
});

// ---------- real art: the bench adventurer's posed sword (walk and slash, three views) ----------
const BENCH = new URL('../fixtures/bench/', import.meta.url);
async function adventurer(shift: Px): Promise<{ project: Project; sword: Map<string, Img> }> {
	const json = JSON.parse(readFileSync(new URL('bodyA.json', BENCH), 'utf8')) as {
			rig: Rig;
			rows: string[];
			cols: string[];
		},
		sheet = await decodePngBytes(new Uint8Array(readFileSync(new URL('bodyA.png', BENCH)))),
		rig = structuredClone(json.rig),
		n = rig.cell.w;
	const images = new Map<Sha256, Img>(),
		cells: Record<string, Partial<Record<string, Sha256[]>>> = {};
	for (const [r, dir] of json.rows.entries())
		for (const [c, col] of json.cols.entries()) {
			const im = makeImg(n, n);
			for (let y = 0; y < n; y++)
				im.data.set(
					sheet.data.subarray(
						((r * n + y) * sheet.w + c * n) * 4,
						((r * n + y) * sheet.w + c * n + n) * 4
					),
					y * n * 4
				);
			const moved = translate(im, shift[0], shift[1]),
				h = await cellHash(moved);
			images.set(h, moved);
			// The standing column is the character's Default move.
			const [anim, i] = col === 'rest' ? [DEFAULT_MOVE, '0'] : col.split('/');
			((cells[anim] ??= {})[dir] ??= [])[+i] = h;
		}
	rig.animations.unshift({
		id: DEFAULT_MOVE,
		cells: 1,
		loop: true,
		frames: [{ cell: 0, ms: 100 }]
	});
	const move = (k: Keypoint[]) =>
		k.map((p) => ({ ...p, x: p.x + shift[0] / n, y: p.y + shift[1] / n }));
	for (const view of Object.values(rig.rest ?? {})) view!.keypoints = move(view!.keypoints);
	for (const a of rig.animations)
		for (const s of Object.values(a.sources ?? {})) s!.keypoints = s!.keypoints!.map(move);
	const body: Item = {
		id: 'base',
		name: 'Body',
		slot: 'body',
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: '',
		baseHash: rig.baseHash,
		provenance: [],
		layers: [{ id: 'main', role: 'fg', z: 10, cells: cells as never }]
	};
	const sword = new Map<string, Img>();
	for (const c of (
		await runCase(
			JSON.parse(readFileSync(new URL('cases.json', BENCH), 'utf8')).find(
				(x: { id: string }) => x.id === 'a-sword96'
			)
		)
	).cells)
		sword.set(c.key.replace(/^rest\//, `${DEFAULT_MOVE}/`), c.layer);
	return {
		sword,
		project: {
			images,
			manifest: {
				format: CURRENT_FORMAT,
				name: 'Adventurer',
				app: 'test',
				rig,
				items: [body],
				materials: [],
				slots: [
					{ id: 'body', class: 'base', z: 10 },
					{ id: 'main_hand', class: 'held', anchor: 'hand_r', z: 150 }
				],
				presets: [{ id: 'default', name: 'Default', items: { body: 'base' }, variants: {} }]
			}
		}
	};
}

test('the bench adventurer’s real sword re-fits a body standing 1 px to the side, frame for frame', async () => {
	const { project: source, sword } = await adventurer([0, 0]),
		{ project: target } = await adventurer([1, 0]);
	const layer: Item['layers'][number]['cells'] = {};
	for (const [key, im] of sword) {
		const [anim, dir, i] = key.split('/') as [string, 'south', string],
			h = await cellHash(im);
		source.images.set(h, im);
		((layer[anim] ??= {})[dir] ??= [])[+i] = h;
	}
	source.manifest.items.push({
		id: 'sword',
		name: 'Sword',
		slot: 'main_hand',
		status: 'accepted',
		mirror: 'flip',
		materials: [],
		prompt: 'a sword',
		baseHash: source.manifest.rig.baseHash,
		provenance: [],
		coverage: [...sword.keys()] as Item['coverage'],
		layers: [
			{
				id: 'fg',
				role: 'fg',
				z: 150,
				cell: { w: 96, h: 96 },
				pivot: { x: 48, y: 76 },
				cells: layer
			}
		]
	});
	const fit = (await refit(source, target))!;
	expect(fit).not.toBeNull();
	const out = cellsOf(fit.item, fit.images!);
	expect(Object.keys(out).sort()).toEqual([...sword.keys()].sort());
	for (const [key, im] of sword) expect(out[key]).toEqual(translate(im, 1, 0));
});

// ---------- the wardrobe list ----------
const dated = (p: Project, at: string, prompt?: string) => {
	const sword = p.manifest.items[1];
	sword.provenance = [{ createdAt: at, produced: [] } as never];
	if (prompt) Object.assign(sword, { prompt, name: prompt.replace(/^an? /, '') });
	return p;
};

test('the list says how each item comes to this character, prefers the copy that fits and lists free items first', async () => {
	const page = await character({ name: 'Page' });
	// Only accepted items count as this character's own: a draft of the same request does not hide one.
	page.manifest.items.push({
		...structuredClone((await knight()).manifest.items[1]),
		id: 'draft',
		status: 'draft',
		prompt: 'a mirror sword'
	});
	await store('rig-page', page);
	// The same request twice: the older exact copy beats the newer re-fit.
	await store('rig-knight', dated(await knight(), '2026-11-02T00:00:00.000Z'));
	await store(
		'rig-squire',
		dated(await character({ name: 'Squire', at: [2, 1], sword: true }), '2026-11-05T00:00:00.000Z')
	);
	await store(
		'rig-fencer',
		dated(
			await character({ name: 'Fencer', at: [1, 0], sword: true }),
			'2026-11-03T00:00:00.000Z',
			'a fencing sword'
		)
	);
	// Hand labels swapped: no re-fit, so worn as drawn; newest, but listed after the fitted ones.
	await store(
		'rig-mirror',
		dated(
			await character({ name: 'Mirror', at: [1, 0], swapped: true, sword: true }),
			'2026-11-09T00:00:00.000Z',
			'a mirror sword'
		)
	);
	const { items: list } = await listShared('rig-page', page.manifest);
	expect(list.map((x) => [x.sourceName, x.item.prompt, x.fit])).toEqual([
		['Fencer', 'a fencing sword', 'refit'],
		['Knight', 'a steel sword', 'copy'],
		['Mirror', 'a mirror sword', 'unfitted']
	]);
});

test('an item whose images cannot be read is skipped and counted; the others still list', async () => {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	const broken = await knight();
	broken.manifest.items[1].layers[0].cells!.slash.south![1] = `sha256:${'f'.repeat(64)}` as Sha256;
	await store('rig-knight', broken);
	await store(
		'rig-fencer',
		dated(
			await character({ name: 'Fencer', at: [1, 0], sword: true }),
			'2026-11-03T00:00:00.000Z',
			'a fencing sword'
		)
	);
	const squire = await character({ name: 'Squire', at: [2, 1] });
	await store('rig-squire', squire);
	const { items, skipped } = await listShared('rig-squire', squire.manifest);
	expect(items.map((x) => [x.sourceName, x.fit])).toEqual([['Fencer', 'refit']]);
	expect(skipped).toBe(1);
	expect(warn).toHaveBeenCalledWith(
		'shared item skipped',
		'rig-knight',
		'sword',
		expect.any(Error)
	);
	warn.mockRestore();
});

test('a second tap while the first copy is saving returns the copy already added', async () => {
	await store('rig-knight', await knight());
	await store('rig-squire', await character({ name: 'Squire', at: [2, 1] }));
	const [a, b] = await Promise.all([
		acceptCopy('rig-knight', 'sword', 'rig-squire'),
		acceptCopy('rig-knight', 'sword', 'rig-squire')
	]);
	expect(b!.id).toBe(a!.id);
	const items = (await loadProject('rig-squire')).project.manifest.items;
	expect(items.filter((it) => it.slot === 'main_hand')).toHaveLength(1);
});

test('an exact copy references the stored images without rewriting them, and fails if one is gone', async () => {
	const source = await knight();
	await store('rig-knight', source);
	await store('rig-page', await character({ name: 'Page' }));
	const blade = source.manifest.items[1].layers[0].cells!.slash.south![1]!.slice(7);
	const kept = memory.blobs.get(blade);
	memory.blobs.delete(blade);
	await expect(acceptCopy('rig-knight', 'sword', 'rig-page')).rejects.toThrow(
		`An image of Steel sword is missing (${blade.slice(0, 12)}).`
	);
	memory.blobs.set(blade, kept!);
	const item = (await acceptCopy('rig-knight', 'sword', 'rig-page'))!;
	expect(item.copiedFrom).toEqual({ id: 'rig-knight', name: 'Knight', item: 'sword' });
	expect(item.refit).toBeUndefined();
	expect(memory.blobs.get(blade)).toBe(kept);
});

/** The slash drawn with its own body pose (a pixel apart from the standing body), so only a slash frame can dress it. */
async function swung(p: Project) {
	const im = bodyAt(0, 0);
	fill(im, 0, 0, 1, 1, [1, 2, 3, 255]);
	const h = await cellHash(im);
	p.images.set(h, im);
	p.manifest.items[0].layers[0].cells!.slash!.south = [h, h];
	return p;
}
test('an exact copy takes the frames its source item gained since, for free, into the same item', async () => {
	// Copied while the Knight's sword had only its standing frame.
	const early = await swung(await knight()),
		sword = early.manifest.items[1];
	sword.coverage = ['default/south/0'];
	delete sword.layers[0].cells!.slash;
	await store('rig-knight', early);
	await store('rig-page', await swung(await character({ name: 'Page' })));
	const copy = (await acceptCopy('rig-knight', 'sword', 'rig-page'))!;
	expect(copy.coverage).toEqual(['default/south/0']);
	const page = () => loadProject('rig-page').then((p) => p.project);
	expect(await freeFrames((await page()).manifest)).toEqual({});
	expect(await copyMoreFrames('rig-page', copy.id)).toBe(0);
	// The Knight's sword gains the slash.
	const later = await swung(await knight());
	await store('rig-knight', later);
	const before = (await page()).manifest;
	expect(await freeFrames(before)).toEqual({ [copy.id]: 2 });
	expect(await copyMoreFrames('rig-page', copy.id)).toBe(2);
	const after = await page(),
		item = after.manifest.items.find((it) => it.id === copy.id)!;
	expect(after.manifest.items.filter((it) => it.slot === 'main_hand')).toHaveLength(1);
	expect(item.coverage).toEqual(['default/south/0', 'slash/south/0', 'slash/south/1']);
	expect(item.layers[0].cells).toEqual(later.manifest.items[1].layers[0].cells);
	// The same item: its own materials (the user's colors) stay.
	expect(item.materials).toEqual(copy.materials);
	expect(after.manifest.materials).toEqual(before.materials);
	expect(item.qa?.clips['slash/south']).toBeDefined();
	// Nothing left to copy.
	expect(await freeFrames(after.manifest)).toEqual({});
	expect(await copyMoreFrames('rig-page', copy.id)).toBe(0);
});

test('a re-fit never takes more frames from its source', async () => {
	const early = await knight();
	early.manifest.items[1].coverage = ['default/south/0'];
	delete early.manifest.items[1].layers[0].cells!.slash;
	await store('rig-knight', early);
	await store('rig-squire', await character({ name: 'Squire', at: [2, 1] }));
	const fitted = (await acceptCopy('rig-knight', 'sword', 'rig-squire'))!;
	expect(fitted.refit).toEqual([]);
	await store('rig-knight', await knight());
	expect(await freeFrames((await loadProject('rig-squire')).project.manifest)).toEqual({});
	expect(await copyMoreFrames('rig-squire', fitted.id)).toBe(0);
});
