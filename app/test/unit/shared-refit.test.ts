import { beforeEach, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { acceptCopy } from '../../src/lib/equipment/copy.ts';
import { refitShared } from '../../src/lib/equipment/refit.ts';
import { translate } from '../../src/lib/items/items.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { cellHash, DEFAULT_MOVE, type Keypoint, type Rig } from '../../src/lib/rig/rig.ts';
import { loadProject } from '../../src/lib/store/project.ts';
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
		fn: (record: unknown) => unknown
	) => {
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
/** A body block from the shoulders to the feet, moved by (dx, dy). */
function bodyAt(dx: number, dy: number) {
	const im = makeImg(64, 64);
	fill(im, 24 + dx, 12 + dy, 16, 48, [180, 120, 90, 255]);
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
}
async function character(o: Spec): Promise<Project> {
	const [dx, dy] = o.at ?? [0, 0];
	const images = new Map<Sha256, Img>(),
		put = async (im: Img) => {
			const h = await cellHash(im);
			images.set(h, im);
			return h;
		};
	const body = await put(bodyAt(dx, dy));
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
	expect(item.fittedFrom).toBe('Knight');
	expect(item.qa?.status).toBe('warn');
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

test('a forearm at a different angle does not fit', async () => {
	const source = await knight(),
		target = await character({
			name: 'Fencer',
			at: [1, 0],
			slash1: { 'RIGHT ELBOW': [21, 36], 'RIGHT ARM': [27, 37] }
		});
	expect(await refit(source, target)).toBeNull();
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

test('a different canvas or pivot never re-fits', async () => {
	const source = await knight(),
		target = await character({ name: 'Squire', at: [1, 0] });
	target.manifest.rig.pivot = { x: 32, y: 61 };
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
