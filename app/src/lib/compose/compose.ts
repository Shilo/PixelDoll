// Compose (architecture §3.5, manifest-spec §3 invariants 7–9): visible layers, resolved z, draw list, pixel compose.
// Pure over Img, so the preview, baked export and node scripts share one code path.
import { makeImg, type Img } from '../image/png.ts';
import { flipH } from '../rig/mirror.ts';
import { cellHash } from '../rig/rig.ts';
import type {
	DirectionName,
	Item,
	Layer,
	Manifest,
	Preset,
	Project,
	Sha256,
	Slot
} from '../store/manifest.ts';
import {
	tuckedId,
	cutAt,
	cutBodyLayer,
	tucked,
	affectsBody,
	cellImg,
	over,
	composeCell,
	tuck,
	resolveZ,
	drawList,
	bakedFrame,
	unionFrame,
	shownItems
} from '../runtime/paperdoll.js';
export {
	rigFrame,
	layerFrame,
	unionFrame,
	bakedFrame,
	equipped,
	hiddenSlots,
	OTHER_HAND,
	twoHanded,
	settleHands,
	tuckers,
	tuckedId,
	variantCovers,
	shownItems,
	cutAt,
	cutBase,
	tuck,
	resolveZ,
	compareDraws,
	drawList,
	cellImg,
	over,
	composeCell
} from '../runtime/paperdoll.js';
export type { Draw, Frame } from '../runtime/paperdoll.js';

/** Bound complete body-cover combinations before allocating their cells and export sheets. */
export const MAX_BODY_CUT_VARIANTS = 256;
const bodyCoverGroups = (m: Manifest) => {
	const groups = new Map<string, Item[]>();
	for (const item of m.items.filter(
		(it) =>
			!it.variantOf &&
			it.baseHash === m.rig.baseHash &&
			it.id !== m.rig.baseItem &&
			affectsBody(m, it)
	)) {
		const group = groups.get(item.slot) ?? [];
		group.push(item);
		groups.set(item.slot, group);
	}
	return [...groups]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([, items]) => items.sort((a, b) => a.id.localeCompare(b.id)));
};
export const bodyCutVariantCount = (m: Manifest) =>
	bodyCoverGroups(m).reduce((count, group) => count * (group.length + 1), 1) - 1;
export const bodyCutVariantLimit = (count: number) =>
	`This inventory needs ${count} body variants. Export supports at most ${MAX_BODY_CUT_VARIANTS}. Export fewer designs that hide body pixels.`;

/** Forget an item's hidden body px in some directions of a move (their cells were replaced or removed). */
export function dropCut(item: Item, anim: string, dirs: Iterable<DirectionName>) {
	const a = item.baseCut?.[anim];
	if (!a) return;
	for (const d of dirs) delete a[d];
	if (!Object.keys(a).length) delete item.baseCut![anim];
	if (!Object.keys(item.baseCut!).length) delete item.baseCut;
}

/** Export copy of `p` with a baked "<item>~<over>" variant per (tucked item, covering item) pair: engines swap to it when both
 *  are worn (stored directions only; a mirrored view is the flip of its source, and tucking commutes with the flip). Stale
 *  items are not exported, and a cover that hides the slot never shows the tucked copy, so neither gets one. */
export async function withTuckVariants(p: Project): Promise<Project> {
	const m = { ...p.manifest, items: p.manifest.items.filter((item) => !item.variantOf) };
	const images = new Map(p.images),
		add: Item[] = [],
		current = (x: Item) => x.baseHash === m.rig.baseHash;
	const count = bodyCutVariantCount(m);
	if (count > MAX_BODY_CUT_VARIANTS) throw new Error(bodyCutVariantLimit(count));
	for (const over of m.items.filter(current)) {
		const overSlot = m.slots.find((s) => s.id === over.slot),
			hides = over.hides ?? overSlot?.hides ?? [];
		for (const slot of (overSlot?.clips ?? []).filter((s) => !hides.includes(s)))
			for (const it of m.items.filter(
				(x) => x.slot === slot && x.id !== m.rig.baseItem && current(x)
			)) {
				const v: Item = {
					...structuredClone(it),
					id: tuckedId(it.id, over.id),
					name: `${it.name} under ${over.name}`,
					variantOf: it.id,
					under: over.id
				};
				delete v.qa;
				for (const [li, l] of v.layers.entries())
					for (const [anim, dirs] of Object.entries(l.cells ?? {}))
						for (const [dir, cells] of Object.entries(dirs ?? {}) as [
							DirectionName,
							(Sha256 | null)[]
						][])
							dirs![dir] = await Promise.all(
								cells.map(async (h, i) => {
									const original = it.layers[li];
									const t = tucked(
										p,
										h ? cellImg(p, original, anim, dir, i) : null,
										original,
										[over],
										anim,
										dir,
										i
									);
									if (!t?.data.some((x, j) => j % 4 === 3 && x)) return null;
									const k = await cellHash(t);
									images.set(k, t);
									return k;
								})
							);
				add.push(v);
			}
	}
	const base = m.items.find((x) => x.id === m.rig.baseItem);
	let combinations: Item[][] = [];
	for (const group of bodyCoverGroups(m)) {
		const prefixes = [[], ...combinations];
		combinations.push(...prefixes.flatMap((prefix) => group.map((over) => [...prefix, over])));
	}
	for (const covers of combinations)
		if (base) {
			const ids = covers.map((over) => over.id).sort();
			const v: Item = {
				...structuredClone(base),
				id: tuckedId(base.id, ids),
				name: `${base.name} under ${covers.map((over) => over.name).join(', ')}`,
				variantOf: base.id,
				...(ids.length === 1 ? { under: ids[0] } : { underAll: ids })
			};
			delete v.qa;
			for (const [li, l] of v.layers.entries())
				for (const [anim, dirs] of Object.entries(l.cells ?? {}))
					for (const [dir, cells] of Object.entries(dirs ?? {}) as [
						DirectionName,
						(Sha256 | null)[]
					][])
						dirs![dir] = await Promise.all(
							cells.map(async (h, i) => {
								const im = h ? cellImg(p, base.layers[li], anim, dir, i) : null;
								if (!im) return h;
								const clipped = tucked(
									p,
									im,
									base.layers[li],
									covers.filter((over) =>
										(m.slots.find((s) => s.id === over.slot)?.clips ?? []).includes('body')
									),
									anim,
									dir,
									i
								)!;
								const t = cutBodyLayer(
										clipped,
										covers.map((over) => cutAt(m, over, anim, dir, i)),
										m.rig,
										base.layers[li]
									),
									k = await cellHash(t);
								images.set(k, t);
								return k;
							})
						);
			add.push(v);
		}
	return { manifest: { ...m, items: [...m.items, ...add] }, images, layerImages: p.layerImages };
}

export async function selfTest() {
	const px = (r: number): Img => ({ w: 1, h: 1, data: new Uint8ClampedArray([r, 0, 0, 255]) });
	const images = new Map<string, Img>([
		['sha256:b', px(1)],
		['sha256:h', px(2)],
		['sha256:c', px(3)],
		['sha256:k', px(4)]
	]);
	const L = (role: 'fg' | 'bg', z: number, h: string) =>
		({
			id: role === 'bg' ? 'bg' : 'main',
			role,
			z,
			cells: { walk: { south: [h as `sha256:${string}`, null] } }
		}) as Layer;
	const item = (id: string, slot: string, layers: Layer[], hides?: string[]) =>
		({ id, slot, layers, hides }) as Item;
	const m = {
		rig: {
			cell: { w: 1, h: 1 },
			pivot: { x: 0, y: 0 },
			baseItem: 'base',
			directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }]
		},
		slots: [
			{ id: 'body', z: 10 },
			{ id: 'back', z: 90, bgZ: 4 },
			{ id: 'hair', z: 110 },
			{
				id: 'head',
				z: 130,
				hides: ['hair'],
				zOverrides: [
					{ layer: 'fg', z: 5, dir: 'south' },
					{ layer: 'fg', z: 7, dir: 'south', cell: 1 },
					{ layer: 'fg', z: 6, anim: 'walk' }
				]
			}
		],
		items: [
			item('base', 'body', [L('fg', 10, 'sha256:b')]),
			item('cape', 'back', [L('fg', 90, 'sha256:c'), L('bg', 4, 'sha256:k')]),
			item('hair1', 'hair', [L('fg', 110, 'sha256:h')]),
			item('helm', 'head', [L('fg', 130, 'sha256:h')])
		]
	} as unknown as Manifest;
	const p: Project = { manifest: m, images };
	const head = m.slots[3],
		fg = { role: 'fg' as const, z: 130 };
	console.assert(resolveZ(head, fg, 'idle', 'east', 0) === 130, 'z: no override');
	console.assert(resolveZ(head, fg, 'idle', 'south', 0) === 5, 'z: dir override');
	console.assert(resolveZ(head, fg, 'walk', 'south', 0) === 6, 'z: anim beats dir');
	console.assert(resolveZ(head, fg, 'walk', 'south', 1) === 7, 'z: cell beats anim');
	console.assert(
		resolveZ(head, { role: 'bg', z: 3 }, 'walk', 'south', 1) === 3,
		'z: role must match'
	);
	const order = (items: Preset['items'], dir: DirectionName = 'east') =>
		drawList(m, items, 'idle', dir, 0)
			.map((d) => `${d.item.id}.${d.layer.role}`)
			.join();
	console.assert(
		order({ back: 'cape', hair: 'hair1' }) === 'cape.bg,base.fg,cape.fg,hair1.fg',
		`draw order ${order({ back: 'cape', hair: 'hair1' })}`
	);
	console.assert(order({ hair: 'hair1', head: 'helm' }) === 'base.fg,helm.fg', 'helmet hides hair');
	console.assert(order({ head: 'helm' }, 'south') === 'helm.fg,base.fg', 'dir override reorders');
	console.assert(order({ head: null }) === 'base.fg', 'empty slot');
	console.assert(
		composeCell(p, { back: 'cape' }, 'walk', 'south', 0).data[0] === 3,
		'compose: fg cape over base'
	);
	console.assert(
		composeCell(p, { back: 'cape' }, 'walk', 'south', 1).data[3] === 0,
		'compose: transparent cell'
	);
	const e = { id: 'main', role: 'fg', z: 1, cells: { walk: { east: ['sha256:b'] } } } as Layer;
	const two: Img = { w: 2, h: 1, data: new Uint8ClampedArray([1, 0, 0, 255, 2, 0, 0, 255]) };
	images.set('sha256:b', two);
	console.assert(
		cellImg(p, e, 'walk', 'west', 0)?.data.join() === '2,0,0,255,1,0,0,255',
		'mirrored dir = flip of source'
	);
	console.assert(
		cellImg(p, e, 'walk', 'south', 0) === null && cellImg(p, e, 'idle', 'east', 0) === null,
		'missing anim/dir = transparent'
	);

	// oversize: a 3x3 layer with pivot (2,2) over a 1x1 rig cell with pivot (1,1) -> its center pixel lands on the rig cell
	const big: Img = {
		w: 3,
		h: 3,
		data: new Uint8ClampedArray(36).map((_, i) =>
			i % 4 === 3 ? 255 : i % 4 === 0 ? 10 + (i >> 2) : 0
		)
	};
	images.set('sha256:o', big);
	const sword = {
		id: 'main',
		role: 'fg',
		z: 150,
		cell: { w: 3, h: 3 },
		pivot: { x: 2, y: 2 },
		cells: { walk: { south: ['sha256:o', null] } }
	} as Layer;
	m.slots.push({ id: 'main_hand', z: 150 } as Slot);
	m.items.push(item('sw', 'main_hand', [sword]));
	m.rig.pivot = { x: 1, y: 1 };
	console.assert(
		composeCell(p, { main_hand: 'sw' }, 'walk', 'south', 0).data[0] === 14,
		'oversize: aligned by pivot, clipped to the rig cell'
	);
	const bf = bakedFrame(m);
	console.assert(
		bf.w === 3 && bf.h === 3 && bf.x === 2 && bf.y === 2,
		`bakedFrame = union around the pivot ${JSON.stringify(bf)}`
	);
	const baked = composeCell(p, { main_hand: 'sw' }, 'walk', 'south', 0, bf);
	console.assert(
		baked.data.filter((_, i) => i % 4 === 0).join() === '10,11,12,13,14,15,16,17,18',
		'oversize: whole layer on the baked frame'
	);
	const u = unionFrame([
		{ w: 64, h: 64, x: 32, y: 60 },
		{ w: 96, h: 96, x: 48, y: 76 },
		{ w: 64, h: 80, x: 32, y: 60 }
	]);
	console.assert(u.w === 96 && u.h === 96 && u.x === 48 && u.y === 76, 'unionFrame');
	// B14 tuck: hair 4x4 under a 2x2 helmet at columns 1-2, rows 0-1 -> rows 0-1 go everywhere (sides: nearest column), rows 2-3 stay
	const hair4 = makeImg(4, 4);
	hair4.data.fill(255);
	const helm4 = makeImg(4, 4);
	for (const q of [1, 2, 5, 6]) helm4.data.set([9, 9, 9, 255], q * 4);
	const f4 = { w: 4, h: 4, x: 2, y: 4 },
		t4 = tuck(hair4, f4, [[helm4, f4]]),
		op = (im: Img) => im.data.filter((_, i) => i % 4 === 3 && _).length;
	console.assert(
		op(t4) === 8 &&
			t4.data[2 * 4 * 4 + 3] === 255 &&
			!t4.data[3] &&
			op(tuck(t4, f4, [[helm4, f4]])) === 8,
		'tuck: drops px at/above the brim, keeps what hangs below, idempotent'
	);
	console.assert(
		op(tuck(hair4, f4, [[helm4, { ...f4, y: 3 }]])) === 4 &&
			tuck(hair4, f4, [[null, f4]]) === hair4,
		'tuck: covers align by pivot; no cover = untouched'
	);
	const hair6 = makeImg(6, 4);
	hair6.data.fill(255);
	const horns = makeImg(6, 4);
	for (const q of [0, 6, 12, 5]) horns.data.set([9, 9, 9, 255], q * 4); // a tall left horn, a short right one, a gap
	const f6 = { w: 6, h: 4, x: 3, y: 4 },
		fh = { ...f6, x: 6 - f6.x };
	console.assert(
		flipH(tuck(hair6, f6, [[horns, f6]])).data.join() ===
			tuck(flipH(hair6), fh, [[flipH(horns), fh]]).data.join(),
		'tuck commutes with a mirrored view (interior gap)'
	);
	const tm = {
		slots: [
			{ id: 'hair', z: 110 },
			{ id: 'head', z: 130, clips: ['hair'] }
		],
		items: [
			{ id: 'h', slot: 'hair' },
			{ id: 'k', slot: 'head' },
			{ id: 'h~k', slot: 'hair', variantOf: 'h', under: 'k' }
		]
	} as unknown as Manifest;
	console.assert(
		shownItems(tm, [tm.items[0], tm.items[1]])
			.map((i) => i.id)
			.join() === 'h~k,k' && shownItems(tm, [tm.items[0]])[0].id === 'h',
		'tuck: the baked variant replaces its item only under its cover'
	);
	const clip = makeImg(2, 2);
	over(clip, big, -1, -1);
	console.assert(clip.data[0] === 14 && clip.data[12] === 18, 'over clips negative offsets');
	// round 3 baseCut: a 3x1 rig cell; the hood hides base px 2 in walk/east/0, and west (mirror of east) hides px 0
	const b3: Img = {
		w: 3,
		h: 1,
		data: new Uint8ClampedArray([5, 0, 0, 255, 6, 0, 0, 255, 7, 0, 0, 255])
	};
	const cm = {
		rig: {
			cell: { w: 3, h: 1 },
			pivot: { x: 1, y: 0 },
			baseItem: 'base',
			baseHash: 'sha256:base',
			directions: [{ id: 'east' }, { id: 'west', mirrorOf: 'east' }]
		},
		slots: [
			{ id: 'body', z: 10 },
			{ id: 'back', z: 90 }
		],
		items: [
			{
				id: 'base',
				slot: 'body',
				baseHash: 'sha256:base',
				layers: [{ id: 'main', role: 'fg', z: 10, cells: { walk: { east: ['sha256:b3'] } } }]
			},
			{
				id: 'hood',
				slot: 'back',
				baseHash: 'sha256:base',
				layers: [{ id: 'main', role: 'fg', z: 90, cells: { walk: { east: [null] } } }],
				baseCut: { walk: { east: [[2]] } }
			}
		]
	} as unknown as Manifest;
	const cp: Project = { manifest: cm, images: new Map([['sha256:b3', b3]]) },
		seen = (im: Img) => [0, 1, 2].map((i) => (im.data[i * 4 + 3] ? 1 : 0)).join('');
	console.assert(
		seen(composeCell(cp, { back: 'hood' }, 'walk', 'east', 0)) === '110' &&
			seen(composeCell(cp, {}, 'walk', 'east', 0)) === '111',
		'baseCut: hidden only while the item is worn'
	);
	console.assert(
		seen(composeCell(cp, { back: 'hood' }, 'walk', 'west', 0)) === '011',
		'baseCut: a mirrored direction flips the cut'
	);
	const ex = await withTuckVariants(cp),
		v = ex.manifest.items.find((i) => i.id === 'base~hood');
	console.assert(
		!!v &&
			v.variantOf === 'base' &&
			v.under === 'hood' &&
			seen(cellImg(ex, v.layers[0], 'walk', 'east', 0)!) === '110' &&
			seen(composeCell(ex, { back: 'hood' }, 'walk', 'east', 0)) === '110',
		'baseCut: exports bake <base>~<item>; compose stays idempotent'
	);
}
