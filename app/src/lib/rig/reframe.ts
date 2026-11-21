// Frame size: free, lossless room around a saved character. Every stored image gains (or loses) the same transparent border
// on all sides, and every pixel coordinate, index and API keypoint moves with it. Centered symmetric padding keeps the
// PixelLab character (registered on the old canvas, which PixelLab centers its animation canvases on) and every cached
// motion request valid: a new move's frames are centered on the larger frame exactly as the padded old ones are.
import { makeImg, type Img } from '../image/png.ts';
import { padKeypoints } from '../items/items.ts';
import { LocalizedError } from '../message.ts';
import type { Item, Manifest } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { rehash } from './directions.ts';
import { HEADROOM_MIN } from './freeze.ts';
import { opaqueBox, type Box } from './normalize.ts';
import { cellHash, rigArtworkVersion, type Keypoint, type Sha256 } from './rig.ts';
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
 *  stepped 5 px below the standing feet (south) and 14 px past its side (east), about H/16 and H/6. A created 64 px body
 *  stepped 1 px, so this is a conservative bound, not a constant. Tune it here: import, the Frame size suggestion and the
 *  move room warning all read this one rule. */
export const moveReach = (height: number) => ({
	below: Math.ceil(height / 16),
	side: Math.ceil(height / 6)
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
	const smallest = size + 2 * p;
	let frame = size % 2 ? smallest : 16 * Math.ceil(smallest / 16);
	if (FRAME_COST_STEPS.some((step) => smallest <= step && frame > step)) frame = smallest;
	return Math.min(frame, capped(size, max));
}
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
				'frameSheet.errors.missingArtwork'
			);
		all.set(h, image);
	}
	return all;
}
/** Free px between stored content and the frame edge: how much a frame can shrink on each side without cutting a pixel or
 *  moving a joint, anchor, cut index or pivot outside it. */
function inset(record: FrameRecord, all: ReadonlyMap<Sha256, Img>): number {
	const { rig } = record.manifest,
		c = rig.cell.w;
	let free = Math.floor(c / 2);
	const at = (x: number, y: number, w: number, h: number) =>
		(free = Math.min(free, x, y, w - 1 - x, h - 1 - y));
	for (const image of all.values()) {
		const box = opaqueBoxAny(image);
		if (box) free = Math.min(free, box.x0, box.y0, image.w - 1 - box.x1, image.h - 1 - box.y1);
	}
	const kp = (k: Keypoint[] | undefined) => {
		for (const q of k ?? []) at(q.x * c, q.y * c, c + 1, c + 1);
	};
	for (const rest of Object.values(rig.rest ?? {})) kp(rest?.keypoints);
	for (const a of rig.animations)
		for (const s of Object.values(a.sources ?? {})) {
			s?.keypoints?.forEach(kp);
			s?.measured?.forEach(kp);
		}
	for (const s of Object.values(record.skeletons ?? {}))
		for (const q of Object.values(s)) at(q.x, q.y, c + 1, c + 1);
	for (const track of Object.values(rig.anchors ?? {}))
		for (const rows of Object.values(track ?? {}))
			for (const pts of Object.values(rows ?? {})) for (const [x, y] of pts ?? []) at(x, y, c, c);
	for (const item of record.manifest.items)
		for (const list of indexLists(item))
			for (const i of list ?? []) at(i % c, Math.floor(i / c), c, c);
	at(rig.pivot.x, rig.pivot.y, c + 1, c + 1);
	return Math.max(0, Math.floor(free));
}
/** Any visible alpha, not only opaque: a shrink must keep every stored byte that shows. */
function opaqueBoxAny(im: Img): Box | null {
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

/** The frame sizes a character can take: from the smallest that keeps everything it stores to the largest whose oversize
 *  layers still fit 256 px, both with the current size's parity (an even change keeps mirrored views exact). */
export async function frameLimits(
	record: FrameRecord,
	images: ReadonlyMap<string, Img>,
	read?: ReadImage
): Promise<{ min: number; max: number }> {
	const m = record.manifest,
		c = m.rig.cell.w;
	const all = await readAll(m, images, read);
	const lowest = c - 2 * inset(record, all);
	return { min: Math.max(lowest, MIN_FRAME + ((c - MIN_FRAME) % 2)), max: frameMax(m) };
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

/** Copy `im` onto a canvas 2p larger (p < 0: smaller), byte for byte; counts the visible px a crop would drop. */
function shifted(im: Img, p: number): { img: Img; cut: number } {
	const img = makeImg(im.w + 2 * p, im.h + 2 * p);
	let cut = 0;
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const i = (y * im.w + x) * 4,
				X = x + p,
				Y = y + p;
			if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) {
				if (im.data[i + 3]) cut++;
				continue;
			}
			img.data.set(im.data.subarray(i, i + 4), (Y * img.w + X) * 4);
		}
	return { img, cut };
}

/**
 * A character on a `size` px frame: every image re-centered (lossless both ways; a shrink is refused if it would drop a
 * visible pixel or move a joint, anchor, pivot or cut index outside), the pivot, anchors, skeletons, standing and move
 * keypoints and cut indices moved with it, `baseHash` rebased and a matching move-recovery receipt kept. The export unit
 * stays the old frame width (`rig.pixelsPerUnit`), so games keep the same in-game scale. Provenance, QA history and the
 * PixelLab character are kept: they describe what was bought, which this does not change.
 */
export async function reframeCharacter<R extends FrameRecord>(
	record: R,
	images: ReadonlyMap<string, Img>,
	size: number,
	read?: ReadImage
): Promise<{ record: R; newImages: Map<Sha256, Img> }> {
	const old = record.manifest.rig.cell.w;
	if (!Number.isInteger(size) || size === old || (size - old) % 2)
		throw new LocalizedError(
			'Choose a different frame size that changes by an even number of pixels.',
			'frameSheet.errors.even'
		);
	const limits = await frameLimits(record, images, read);
	if (size < limits.min || size > limits.max)
		throw new LocalizedError(
			`Frame must be ${limits.min}–${limits.max} px for this character.`,
			'frameSheet.errors.range',
			limits
		);
	const all = await readAll(record.manifest, images, read);
	const p = (size - old) / 2;
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
			const { img, cut } = shifted(all.get(h)!, p);
			if (cut) throw new Error(`Frame change would cut ${cut} px of ${h}.`); // frameLimits refuses this first
			next = cellHash(img).then((key) => {
				if (!images.has(key)) newImages.set(key, img);
				return key;
			});
			moved.set(h, next);
		}
		return next;
	};
	const moveNull = async (h: Sha256 | null | undefined) => (h ? move(h) : (h ?? null));
	const keypoints = (k: Keypoint[]) => padKeypoints(k, { w: old, h: old }, p);
	const index = (i: number) => (Math.floor(i / old) + p) * size + (i % old) + p;
	const indices = (list: number[] | null) => (list ? list.map(index).sort((a, b) => a - b) : list);

	rig.cell = { w: size, h: size };
	rig.pivot = { x: rig.pivot.x + p, y: rig.pivot.y + p };
	if (rig.pad) rig.pad = { x: rig.pad.x + p, y: rig.pad.y + p };
	const unit = record.manifest.rig.pixelsPerUnit ?? old;
	if (unit === size) delete rig.pixelsPerUnit;
	else rig.pixelsPerUnit = unit;
	for (const rest of Object.values(rig.rest ?? {}))
		if (rest) {
			rest.image = await move(rest.image);
			rest.keypoints = keypoints(rest.keypoints);
		}
	for (const a of rig.animations)
		for (const s of Object.values(a.sources ?? {}))
			if (s) {
				if (s.reference) s.reference = await move(s.reference); // a reference is optional in hand-made records
				if (s.keypoints) s.keypoints = s.keypoints.map(keypoints);
				if (s.measured) s.measured = s.measured.map(keypoints);
			}
	for (const track of Object.values(rig.anchors ?? {}))
		for (const rows of Object.values(track ?? {}))
			for (const [dir, pts] of Object.entries(rows ?? {}))
				rows![dir as keyof typeof rows] = pts!.map(([x, y]) => [x + p, y + p]);
	for (const item of m.items) {
		for (const layer of item.layers) {
			if (layer.cell) layer.cell = { w: layer.cell.w + 2 * p, h: layer.cell.h + 2 * p };
			if (layer.pivot) layer.pivot = { x: layer.pivot.x + p, y: layer.pivot.y + p };
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
					Object.entries(s).map(([label, q]) => [label, { ...q, x: q.x + p, y: q.y + p }])
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
