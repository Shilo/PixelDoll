// Adjust frame: free, lossless room around a saved character. Every stored image gains (or loses) the same transparent border
// on all sides and may move up or down inside it, and every pixel coordinate, index and API keypoint moves with it. A centered
// size change keeps the PixelLab character (registered on the old canvas, which PixelLab centers its animation canvases on)
// aligned by itself; a vertical move is recorded per direction in rig.artOffset, which places managed motion frames the same
// rows lower (artOffset in create.ts), so cached motion requests stay valid either way. Horizontal moves are not offered:
// mirrored views flip whole cells about the cell center, so moving the art sideways would make them jump.
import { makeImg, type Img } from '../image/png.ts';
import { padKeypoints } from '../items/items.ts';
import { LocalizedError, message, type Message } from '../message.ts';
import type { Item, Manifest } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { rehash } from './directions.ts';
import { HEADROOM_MIN } from './freeze.ts';
import { FLOOR, opaqueBox, type Box } from './normalize.ts';
import {
	cellHash,
	rigArtworkVersion,
	type DirectionName,
	type Keypoint,
	type Sha256
} from './rig.ts';
import type { Skeleton } from './skeleton.ts';

export const MIN_FRAME = 32;
export const MAX_FRAME = 256;
/** Free margins around the standing views, in px, and the standing height they belong to. */
export interface FrameRoom {
	height: number;
	top: number;
	below: number;
	left: number;
	right: number;
}
/** The union of the standing views' opaque boxes in one cell (`size`): what a move starts from. */
export function standingRoom(views: readonly Img[], size: number): FrameRoom | undefined {
	let box: Box | undefined;
	for (const view of views) {
		const b = opaqueBox(view);
		if (!b) continue;
		box = box
			? {
					x0: Math.min(box.x0, b.x0),
					y0: Math.min(box.y0, b.y0),
					x1: Math.max(box.x1, b.x1),
					y1: Math.max(box.y1, b.y1)
				}
			: b;
	}
	return box
		? {
				height: box.y1 - box.y0 + 1,
				top: box.y0,
				below: size - 1 - box.y1,
				left: box.x0,
				right: size - 1 - box.x1
			}
		: undefined;
}
/** How far a move reaches past the standing outline. Measured (2026-11-20, a 76 px imported character): a managed walk
 *  stepped 5 px below the standing feet (south) and 14 px past its side (east); the rule covers that sample exactly (a created
 *  64 px body stepped 1 px, so it is a conservative bound, not a constant). Tune it here: import, Make room and the move room
 *  warning all read this one rule. */
export const moveReach = (height: number) => ({
	below: Math.ceil((height * 5) / 76),
	side: Math.ceil((height * 14) / 76)
});
/** The room a frame should leave: the reach plus 2 guard rows below (PixelLab erases the outermost row, B4) and the usual
 *  headroom for hats above. */
export function roomNeed(height: number) {
	const reach = moveReach(height);
	return { below: reach.below + 2, top: HEADROOM_MIN, side: reach.side + 2 };
}
/** Cost steps (items.ts editGens / editFrameCap / padOf, gridEstimate): a rounded frame never crosses one the smallest
 *  frame does not. Above 80 px edit-animation-v2 takes 4 views per call, above 96 px held layers and 8-frame repair grids
 *  cost more, above 128 px every dress call costs more and 4-column grids stop fitting, above 170 px dressing costs 25. */
export const FRAME_COST_STEPS = [80, 96, 128, 170] as const;
/** The largest frame up to `max` (and 256) with the parity of `size`. */
const capped = (size: number, max: number) => {
	const top = Math.min(max, MAX_FRAME);
	return (top - size) % 2 ? top - 1 : top;
};
/** The smallest frame (centered on `size`, the same parity) that leaves `roomNeed` around the standing views, rounded up to
 *  the next multiple of 16 for an even size (the price-verified canvases) without crossing a cost step. `size` when the room
 *  is already there. */
export function roomFrame(size: number, room: FrameRoom, max = MAX_FRAME): number {
	const need = roomNeed(room.height);
	const p = Math.max(
		0,
		need.below - room.below,
		need.top - room.top,
		need.side - room.left,
		need.side - room.right
	);
	if (!p) return size;
	return roundedFrame(size, size + 2 * p, max);
}
/** `smallest` (a frame with the parity of `size`) rounded up to the next multiple of 16 for an even size, the price-verified
 *  canvases, without crossing a cost step the smallest frame does not, and capped at `max`. */
export function roundedFrame(size: number, smallest: number, max = MAX_FRAME): number {
	let frame = size % 2 ? smallest : 16 * Math.ceil(smallest / 16);
	if (FRAME_COST_STEPS.some((step) => smallest <= step && frame > step)) frame = smallest;
	return Math.min(frame, capped(size, max));
}
/** Rows to raise a new character's `char` px canvas above normalize's FLOOR in a `cell` frame, so a body filling the canvas
 *  leaves roomNeed below: the floor alone is too little for a large body's walk (2026-11-21, 8 sampled managed walks of 76 to
 *  100 px tall characters stepped 5 to 6 px below the standing feet). Only rows spare beyond the headroom above are used. */
export const canvasLift = (char: number, cell: number) =>
	Math.max(0, Math.min(roomNeed(char).below - FLOOR, cell - char - FLOOR - HEADROOM_MIN));
/** Whether a move is likely to reach past this frame: the reach, without guard rows or headroom. */
export function roomShort(room: FrameRoom): boolean {
	const reach = moveReach(room.height);
	return room.below < reach.below || Math.min(room.left, room.right) < reach.side;
}

/** The stored standing views of a character's directions (the default move's base cells when a view has none). */
export function standingViews(manifest: Manifest, images: ReadonlyMap<string, Img>): Img[] {
	const { rig } = manifest,
		base = manifest.items.find((i) => i.id === rig.baseItem);
	return rig.directions.flatMap((d) => {
		const hash =
			rig.rest?.[d.mirrorOf ?? d.id]?.image ?? base?.layers[0].cells?.default?.[d.id]?.[0];
		const image = hash ? images.get(hash) : undefined;
		return image ? [image] : [];
	});
}

type FrameRecord = Pick<StoredProject, 'manifest' | 'skeletons' | 'moveRecovery' | 'character'> & {
	savedAt?: string;
};
/** Every image hash a character stores, including Fix frames and palette history. */
function storedImages(m: Manifest): Sha256[] {
	const out = new Set<Sha256>();
	const add = (h: Sha256 | null | undefined) => h && out.add(h);
	for (const rest of Object.values(m.rig.rest ?? {})) add(rest?.image);
	for (const a of m.rig.animations)
		for (const s of Object.values(a.sources ?? {})) add(s?.reference);
	for (const item of m.items) {
		for (const layer of item.layers)
			for (const rows of Object.values(layer.cells ?? {}))
				for (const row of Object.values(rows ?? {})) for (const h of row ?? []) add(h);
		for (const h of Object.values(item.dressed ?? {})) add(h);
		for (const edit of item.frameEdits ?? [])
			for (const f of edit.frames) {
				add(f.rest);
				for (const l of f.layers) {
					add(l.before);
					add(l.after);
				}
			}
		for (const repair of item.paletteRepairs ?? [])
			for (const f of repair.frames)
				for (const l of f.layers) {
					add(l.before);
					add(l.after);
				}
	}
	return [...out];
}
const indexLists = (item: Item): (number[] | null | undefined)[] => [
	...Object.values(item.baseCut ?? {}).flatMap((rows) => Object.values(rows ?? {}).flat()),
	...(item.frameEdits ?? []).flatMap((e) => e.frames.flatMap((f) => [f.cut.before, f.cut.after]))
];

/** Reads an image the character stores (`images` first; history images are not part of a loaded project). */
export type ReadImage = (hash: Sha256) => Promise<Img>;
async function readAll(m: Manifest, images: ReadonlyMap<string, Img>, read?: ReadImage) {
	const all = new Map<Sha256, Img>();
	for (const h of storedImages(m)) {
		const image = images.get(h) ?? (read ? await read(h).catch(() => undefined) : undefined);
		if (!image)
			throw new LocalizedError(
				'Saved artwork of this character is missing, so its frame cannot be changed.',
				'adjustFrame.errors.missingArtwork'
			);
		all.set(h, image);
	}
	return all;
}
/** Free px between stored content and each frame edge (top, bottom, left, right), over every stored image on its own canvas
 *  (held layers keep their padding) and every joint, anchor, cut index and the pivot: how far the art can move toward an
 *  edge, or the frame shrink there, without cutting a visible pixel or moving a point outside. */
export interface FrameFree {
	top: number;
	bottom: number;
	left: number;
	right: number;
}
const unbounded = (): FrameFree => ({
	top: Infinity,
	bottom: Infinity,
	left: Infinity,
	right: Infinity
});
const within = (free: FrameFree, top: number, bottom: number, left: number, right: number) => {
	free.top = Math.min(free.top, top);
	free.bottom = Math.min(free.bottom, bottom);
	free.left = Math.min(free.left, left);
	free.right = Math.min(free.right, right);
};
function storedFree(record: FrameRecord, all: ReadonlyMap<Sha256, Img>): FrameFree {
	const { rig } = record.manifest,
		c = rig.cell.w,
		free = unbounded();
	for (const image of all.values()) {
		const box = visibleBox(image);
		if (box) within(free, box.y0, image.h - 1 - box.y1, box.x0, image.w - 1 - box.x1);
	}
	const edge = (x: number, y: number) => within(free, y, c - y, x, c - x); // pixel-edge points, 0..c
	const kp = (k: Keypoint[] | undefined) => k?.forEach((point) => edge(point.x * c, point.y * c));
	for (const rest of Object.values(rig.rest ?? {})) kp(rest?.keypoints);
	for (const a of rig.animations)
		for (const s of Object.values(a.sources ?? {})) {
			kp(s?.referenceKeypoints);
			s?.keypoints?.forEach(kp);
			s?.measured?.forEach(kp);
		}
	for (const s of Object.values(record.skeletons ?? {}))
		for (const point of Object.values(s)) edge(point.x, point.y);
	const index = (x: number, y: number) => within(free, y, c - 1 - y, x, c - 1 - x); // pixel indices, 0..c-1
	for (const track of Object.values(rig.anchors ?? {}))
		for (const rows of Object.values(track ?? {}))
			for (const pts of Object.values(rows ?? {})) for (const [x, y] of pts ?? []) index(x, y);
	for (const item of record.manifest.items)
		for (const list of indexLists(item))
			for (const i of list ?? []) index(i % c, Math.floor(i / c));
	edge(rig.pivot.x, rig.pivot.y);
	return {
		top: Math.floor(free.top),
		bottom: Math.floor(free.bottom),
		left: Math.floor(free.left),
		right: Math.floor(free.right)
	};
}
/** Any visible alpha, not only opaque: a move or shrink must keep every stored byte that shows. */
function visibleBox(im: Img): Box | null {
	let x0 = im.w,
		y0 = im.h,
		x1 = -1,
		y1 = -1;
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			if (im.data[(y * im.w + x) * 4 + 3]) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				y1 = y;
			}
	return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** The largest frame (the current parity) whose oversize layers, which grow with it, still fit 256 px. */
export function frameMax(m: Manifest): number {
	const c = m.rig.cell.w;
	const extra = Math.max(
		0,
		...m.items.flatMap((i) => i.layers.map((l) => (l.cell ? Math.max(l.cell.w, l.cell.h) - c : 0)))
	);
	return capped(c, MAX_FRAME - extra);
}
/** What Adjust frame knows about a character before a change: its frame, the size limits, the free space per edge and the
 *  room around its standing views. */
export interface FrameFacts {
	size: number;
	min: number;
	max: number;
	free: FrameFree;
	room?: FrameRoom;
}
export async function frameFacts(
	record: FrameRecord,
	images: ReadonlyMap<string, Img>,
	read?: ReadImage
): Promise<FrameFacts> {
	const m = record.manifest,
		size = m.rig.cell.w;
	return {
		size,
		min: MIN_FRAME + ((size - MIN_FRAME) % 2),
		max: frameMax(m),
		free: storedFree(record, await readAll(m, images, read)),
		room: standingRoom(standingViews(m, images), size)
	};
}
/** A frame change: the new square size (changed by an even number of px, centered) and the rows the art then moves down
 *  (negative: up). */
export interface FrameChange {
	size: number;
	dy: number;
}
/** Why a change cannot be saved, or undefined. Clipping names the edge in words, never by color alone. */
export function frameIssue(facts: FrameFacts, change: FrameChange): LocalizedError | undefined {
	const { size, dy } = change,
		p = (size - facts.size) / 2,
		{ free } = facts;
	if (!Number.isInteger(size) || !Number.isInteger(dy) || (size - facts.size) % 2)
		return new LocalizedError(
			'Choose a frame size that changes by an even number of pixels.',
			'adjustFrame.errors.even'
		);
	if (size < facts.min || size > facts.max)
		return new LocalizedError(
			`Frame must be ${facts.min}–${facts.max} px for this character.`,
			'adjustFrame.errors.range',
			{ min: facts.min, max: facts.max }
		);
	const cut = (edge: number) => Math.max(0, -edge);
	const top = cut(free.top + p + dy),
		bottom = cut(free.bottom + p - dy),
		sides = Math.max(cut(free.left + p), cut(free.right + p));
	if (top)
		return new LocalizedError(
			`This cuts ${top} px off the top of the character or its items.`,
			'adjustFrame.errors.clipTop',
			{ px: top }
		);
	if (bottom)
		return new LocalizedError(
			`This cuts ${bottom} px off the bottom of the character or its items.`,
			'adjustFrame.errors.clipBottom',
			{ px: bottom }
		);
	if (sides)
		return new LocalizedError(
			`This cuts ${sides} px off the sides of the character or its items.`,
			'adjustFrame.errors.clipSides',
			{ px: sides }
		);
	return undefined;
}
/** Extra content a change must keep inside the frame, as free px per edge of the current `size` frame (negative: already
 *  outside), such as the cached motion frames a stopped move continues with. */
export function freeOf(boxes: readonly Box[], size: number): FrameFree {
	const free = unbounded();
	for (const box of boxes) within(free, box.y0, size - 1 - box.y1, box.x0, size - 1 - box.x1);
	return free;
}
export type RoomPlan = (FrameChange & { limit?: false }) | { limit: true; size: number };
/** Make room: the smallest vertical move at the current size that leaves roomNeed around the standing views and keeps all
 *  stored content (and `extra`) inside; only when no move can, the smallest larger frame (centered, rounded as roomFrame
 *  rounds: multiples of 16 for an even size, never across a cost step), moved as little as needed. Never shrinks. `limit`
 *  when even the largest frame cannot fit it. */
export function makeRoom(facts: FrameFacts, extra: FrameFree = unbounded()): RoomPlan {
	const c = facts.size,
		hard = {
			top: Math.min(facts.free.top, extra.top),
			bottom: Math.min(facts.free.bottom, extra.bottom),
			left: Math.min(facts.free.left, extra.left),
			right: Math.min(facts.free.right, extra.right)
		},
		room = facts.room,
		need = room ? roomNeed(room.height) : undefined;
	const at = (size: number): number | undefined => {
		const p = (size - c) / 2;
		if (hard.left + p < 0 || hard.right + p < 0) return undefined;
		if (room && need && (room.left + p < need.side || room.right + p < need.side)) return undefined;
		const lo = Math.max(-(hard.top + p), room && need ? need.top - room.top - p : -Infinity),
			hi = Math.min(hard.bottom + p, room && need ? room.below + p - need.below : Infinity);
		if (lo > hi) return undefined;
		return Math.min(hi, Math.max(lo, 0));
	};
	const still = at(c);
	if (still !== undefined) return { size: c, dy: still };
	for (let size = c + 2; size <= facts.max; size += 2) {
		if (at(size) === undefined) continue;
		let rounded = c % 2 ? size : Math.min(16 * Math.ceil(size / 16), facts.max);
		if (FRAME_COST_STEPS.some((step) => size <= step && rounded > step)) rounded = size;
		if (at(rounded) === undefined) rounded = size;
		return { size: rounded, dy: at(rounded)! };
	}
	return { limit: true, size: facts.max };
}

/** Copy `im` onto a canvas 2p larger (p < 0: smaller), `dy` rows lower, byte for byte; counts the visible px a crop drops. */
function shifted(im: Img, p: number, dy: number): { img: Img; cut: number } {
	const img = makeImg(im.w + 2 * p, im.h + 2 * p);
	let cut = 0;
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const i = (y * im.w + x) * 4,
				X = x + p,
				Y = y + p + dy;
			if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) {
				if (im.data[i + 3]) cut++;
				continue;
			}
			img.data.set(im.data.subarray(i, i + 4), (Y * img.w + X) * 4);
		}
	return { img, cut };
}

/**
 * A character on a `size` px frame with its art `dy` rows lower: every image re-centered and moved (lossless both ways; a
 * change is refused if it would drop a visible pixel or move a joint, anchor, pivot or cut index outside), the pivot (so the
 * feet stay on the origin in every move and engine), anchors, skeletons, standing and move keypoints and cut indices moved
 * with it, rig.artOffset advanced by `dy`, `baseHash` rebased and a matching move-recovery receipt kept. The export unit
 * stays the old frame width (`rig.pixelsPerUnit`), so games keep the same in-game scale. Provenance, QA history and the
 * PixelLab character are kept: they describe what was bought, which this does not change.
 */
export async function reframeCharacter<R extends FrameRecord>(
	record: R,
	images: ReadonlyMap<string, Img>,
	change: FrameChange,
	read?: ReadImage
): Promise<{ record: R; newImages: Map<Sha256, Img> }> {
	const old = record.manifest.rig.cell.w,
		{ size, dy } = change;
	const issue =
		size === old && !dy
			? new LocalizedError(
					'Change the frame size or position first.',
					'adjustFrame.errors.unchanged'
				)
			: frameIssue(await frameFacts(record, images, read), change);
	if (issue) throw issue;
	const all = await readAll(record.manifest, images, read);
	const p = (size - old) / 2,
		q = p + dy;
	const result = structuredClone(record);
	const m = result.manifest,
		{ rig } = m;
	const receiptMatches =
		!!result.moveRecovery &&
		result.moveRecovery.bodyRigVersion === rigArtworkVersion(record.manifest.rig, result.character);
	const newImages = new Map<Sha256, Img>(),
		moved = new Map<Sha256, Promise<Sha256>>();
	const move = (h: Sha256): Promise<Sha256> => {
		let next = moved.get(h);
		if (!next) {
			const { img, cut } = shifted(all.get(h)!, p, dy);
			if (cut) throw new Error(`Frame change would cut ${cut} px of ${h}.`); // frameIssue refuses this first
			next = cellHash(img).then((key) => {
				if (!images.has(key)) newImages.set(key, img);
				return key;
			});
			moved.set(h, next);
		}
		return next;
	};
	const moveNull = async (h: Sha256 | null | undefined) => (h ? move(h) : (h ?? null));
	const keypoints = (k: Keypoint[]) => padKeypoints(k, { w: old, h: old }, p, dy);
	const index = (i: number) => (Math.floor(i / old) + q) * size + (i % old) + p;
	const indices = (list: number[] | null) => (list ? list.map(index).sort((a, b) => a - b) : list);

	rig.cell = { w: size, h: size };
	rig.pivot = { x: rig.pivot.x + p, y: rig.pivot.y + q };
	if (rig.pad) rig.pad = { x: rig.pad.x + p, y: rig.pad.y + q };
	const unit = record.manifest.rig.pixelsPerUnit ?? old;
	if (unit === size) delete rig.pixelsPerUnit;
	else rig.pixelsPerUnit = unit;
	if (dy) {
		const offsets = { ...rig.artOffset };
		for (const dir of new Set([
			...rig.directions.map((d) => d.id),
			...(Object.keys(rig.rest ?? {}) as DirectionName[])
		])) {
			const rows = (offsets[dir] ?? 0) + dy;
			if (rows) offsets[dir] = rows;
			else delete offsets[dir];
		}
		if (Object.keys(offsets).length) rig.artOffset = offsets;
		else delete rig.artOffset;
	}
	for (const rest of Object.values(rig.rest ?? {}))
		if (rest) {
			rest.image = await move(rest.image);
			rest.keypoints = keypoints(rest.keypoints);
		}
	for (const a of rig.animations)
		for (const s of Object.values(a.sources ?? {}))
			if (s) {
				if (s.reference) s.reference = await move(s.reference); // a reference is optional in hand-made records
				if (s.referenceKeypoints) s.referenceKeypoints = keypoints(s.referenceKeypoints);
				if (s.keypoints) s.keypoints = s.keypoints.map(keypoints);
				if (s.measured) s.measured = s.measured.map(keypoints);
			}
	for (const track of Object.values(rig.anchors ?? {}))
		for (const rows of Object.values(track ?? {}))
			for (const [dir, pts] of Object.entries(rows ?? {}))
				rows![dir as keyof typeof rows] = pts!.map(([x, y]) => [x + p, y + q]);
	for (const item of m.items) {
		for (const layer of item.layers) {
			if (layer.cell) layer.cell = { w: layer.cell.w + 2 * p, h: layer.cell.h + 2 * p };
			if (layer.pivot) layer.pivot = { x: layer.pivot.x + p, y: layer.pivot.y + q };
			for (const rows of Object.values(layer.cells ?? {}))
				for (const [dir, row] of Object.entries(rows ?? {}))
					rows![dir as keyof typeof rows] = await Promise.all((row ?? []).map(moveNull));
		}
		const dressed = item.dressed;
		if (dressed)
			for (const dir of Object.keys(dressed) as (keyof typeof dressed)[])
				dressed[dir] = await move(dressed[dir]!);
		for (const rows of Object.values(item.baseCut ?? {}))
			for (const [dir, row] of Object.entries(rows ?? {}))
				rows![dir as keyof typeof rows] = row!.map(indices);
		for (const edit of item.frameEdits ?? [])
			for (const f of edit.frames) {
				if (f.rest) f.rest = await move(f.rest);
				f.cut = { before: indices(f.cut.before), after: indices(f.cut.after) };
				for (const l of f.layers) {
					l.before = await moveNull(l.before);
					l.after = await moveNull(l.after);
				}
			}
		for (const repair of item.paletteRepairs ?? [])
			for (const f of repair.frames)
				for (const l of f.layers) {
					l.before = await move(l.before);
					l.after = await move(l.after);
				}
	}
	if (result.skeletons)
		result.skeletons = Object.fromEntries(
			Object.entries(result.skeletons).map(([key, s]) => [
				key,
				Object.fromEntries(
					Object.entries(s).map(([label, point]) => [
						label,
						{ ...point, x: point.x + p, y: point.y + q }
					])
				) as Skeleton
			])
		);
	await rehash(m);
	if (receiptMatches)
		result.moveRecovery = {
			...result.moveRecovery!,
			bodyRigVersion: rigArtworkVersion(rig, result.character)
		};
	if ('savedAt' in result) result.savedAt = new Date().toISOString();
	return { record: result, newImages };
}

/** A frame change in words: the new size when it changes, and how far the character moves. */
export function frameChangeText(from: number, change: FrameChange): Message[] {
	return [
		...(change.size !== from ? [message('adjustFrame.sizeReadout', { size: change.size })] : []),
		...(change.dy
			? [
					message(change.dy < 0 ? 'adjustFrame.movedUp' : 'adjustFrame.movedDown', {
						px: Math.abs(change.dy)
					})
				]
			: [])
	];
}
