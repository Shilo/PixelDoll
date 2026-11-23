// Fix frames: download one item's (or the body's) frames of a move as source-pixel sheets, and plan, apply, undo or restore
// the frames a user edited in another pixel editor. Pure: no DOM, IndexedDB or PixelLab. Sheets follow export layout
// (manifest-spec §5): rows = rig.directions (mirrored rows baked), columns = cells, each layer at its own frame size.
import { binaryAlpha, makeImg, type Img } from '../image/png.ts';
import { layerSheet } from '../export/sheets.ts';
import { cellImg, layerFrame, over, unionFrame, type Frame } from '../compose/compose.ts';
import { flipH } from '../rig/mirror.ts';
import { cellHash, DEFAULT_MOVE, type DirectionName, type Sha256 } from '../rig/rig.ts';
import { LocalizedError } from '../message.ts';
import { editedHistory, replayable, type FrameEdit, type FrameHistory } from './history.ts';
import type { CellKey, Item, ItemFrameEdit, Layer, Manifest, Project } from '../store/manifest.ts';

export type LayerId = Layer['id'];

/** The sheet a layer downloads as and must come back as. */
export function sheetSize(m: Manifest, layer: Layer, anim: string): { w: number; h: number } {
	const f = layerFrame(m.rig, layer),
		cells = m.rig.animations.find((a) => a.id === anim)?.cells ?? 0;
	return { w: cells * f.w, h: m.rig.directions.length * f.h };
}

/** Source-pixel sheets of every layer (never the recolored `layerImages`). */
export function frameSheets(p: Project, itemId: string, anim: string) {
	const source: Project = { manifest: p.manifest, images: p.images };
	const item = p.manifest.items.find((i) => i.id === itemId);
	if (!item) throw new Error(`Item ${itemId} not found`);
	return item.layers.map((layer) => ({
		layerId: layer.id,
		image: layerSheet(source, layer, anim)
	}));
}

/** File name suffix per layer: one-layer items need none; fg/bg files carry `-fg` / `-bg`, which matching reads back. */
export const layerSuffix = (item: Pick<Item, 'layers'>, layerId: LayerId) =>
	item.layers.length > 1 ? `-${layerId}` : '';

/** Which item layer a file is for. One-layer items take any single PNG; otherwise the `-fg`/`-bg`/`-main` suffix decides. */
export function layerOfFile(item: Pick<Item, 'layers'>, name: string): LayerId | undefined {
	if (item.layers.length === 1) return item.layers[0].id;
	const stem = name.replace(/^.*[\\/]/, '').replace(/\.png$/i, '');
	return item.layers.find((l) => stem.endsWith(`-${l.id}`))?.id;
}

function cropCell(sheet: Img, col: number, row: number, f: Pick<Frame, 'w' | 'h'>): Img {
	const out = makeImg(f.w, f.h);
	for (let y = 0; y < f.h; y++) {
		const s = ((row * f.h + y) * sheet.w + col * f.w) * 4;
		out.data.set(sheet.data.subarray(s, s + f.w * 4), y * f.w * 4);
	}
	return out;
}

const empty = (im: Img) => {
	for (let i = 3; i < im.data.length; i += 4) if (im.data[i]) return false;
	return true;
};
/** Same picture: alpha 0 is transparent whatever its RGB (editors often zero or keep it). */
function sameVisible(a: Img | null, b: Img | null): boolean {
	if (!a || !b) return (!a || empty(a)) && (!b || empty(b));
	if (a.w !== b.w || a.h !== b.h) return false;
	for (let i = 0; i < a.data.length; i += 4) {
		const va = a.data[i + 3],
			vb = b.data[i + 3];
		if (va !== vb) return false;
		if (
			va &&
			(a.data[i] !== b.data[i] ||
				a.data[i + 1] !== b.data[i + 1] ||
				a.data[i + 2] !== b.data[i + 2])
		)
			return false;
	}
	return true;
}

export type FramesNote =
	| { kind: 'mirrored'; dir: DirectionName; of: DirectionName }
	| { kind: 'noBodyRow'; dir: DirectionName }
	| { kind: 'missingLayer'; layer: LayerId }
	| { kind: 'emptiedBody' };

interface FrameChange {
	dir: DirectionName;
	cell: number;
	/** Only the layers that change. */
	layers: { id: LayerId; before: Sha256 | null; after: Sha256 | null }[];
}
export interface FramesPlan {
	itemId: string;
	anim: string;
	changed: FrameChange[];
	/** New cell images only (hash → pixels). */
	images: Map<Sha256, Img>;
	/** Pixels with alpha between 1 and 254, made opaque (from 128) or transparent. */
	softAlpha: number;
	/** Distinct colors in changed frames that the target used nowhere before. */
	newColors: number;
	notes: FramesNote[];
}

interface PlanOptions {
	/** Rewrite a new body cell before hashing (garment region marks). */
	mark?: (dir: DirectionName, cell: number, image: Img) => Img;
	/** Color identity for the palette check (the body ignores its region bit). */
	colorKey?: (rgb: number) => number;
}

/** Compare edited sheets against the stored frames. Only frames whose visible pixels changed get new hashes. A direction
 *  that mirrors another is never edited on its own: it follows its source, re-baked where it stores its own rows. */
export async function planFrames(
	p: Project,
	itemId: string,
	anim: string,
	files: { layerId: LayerId; image: Img }[],
	o: PlanOptions = {}
): Promise<FramesPlan> {
	const m = p.manifest,
		{ rig } = m,
		item = m.items.find((i) => i.id === itemId),
		move = rig.animations.find((a) => a.id === anim);
	if (!item || !move) throw new Error(`Frames target ${itemId}/${anim} not found`);
	const base = m.items.find((i) => i.id === rig.baseItem)!;
	const isBase = item.id === base.id;
	const plan: FramesPlan = {
		itemId,
		anim,
		changed: [],
		images: new Map(),
		softAlpha: 0,
		newColors: 0,
		notes: []
	};
	const byLayer = new Map(files.map((f) => [f.layerId, f.image]));
	const changes = new Map<string, FrameChange>();
	const fresh: Img[] = [];
	const note = (n: FramesNote) => {
		if (!plan.notes.some((x) => JSON.stringify(x) === JSON.stringify(n))) plan.notes.push(n);
	};
	for (const layer of item.layers) {
		const sheet = byLayer.get(layer.id);
		if (!sheet) {
			note({ kind: 'missingLayer', layer: layer.id });
			continue;
		}
		const want = sheetSize(m, layer, anim);
		if (sheet.w !== want.w || sheet.h !== want.h)
			throw new LocalizedError(
				`This PNG is ${sheet.w}×${sheet.h} px, but these frames need ${want.w}×${want.h} px. Keep the original size and grid.`,
				'fixFrames.errors.size',
				{ got: `${sheet.w}×${sheet.h}`, want: `${want.w}×${want.h}` }
			);
		for (let i = 3; i < sheet.data.length; i += 4)
			if (sheet.data[i] && sheet.data[i] < 255) plan.softAlpha++;
		const solid = binaryAlpha(sheet),
			f = layerFrame(rig, layer);
		const edited = (row: number, c: number) => cropCell(solid, c, row, f);
		const change = async (dir: DirectionName, c: number, next: Img) => {
			const before = layer.cells?.[anim]?.[dir]?.[c] ?? null;
			const old = before ? (p.images.get(before) ?? null) : null;
			if (sameVisible(old, next)) return undefined;
			let after: Sha256 | null = null;
			if (!empty(next)) {
				after = await cellHash(next);
				if (after === before) return undefined;
				plan.images.set(after, next);
				fresh.push(next);
			} else if (isBase) note({ kind: 'emptiedBody' });
			const key = `${dir}/${c}`;
			const entry = changes.get(key) ?? { dir, cell: c, layers: [] };
			entry.layers.push({ id: layer.id, before, after });
			changes.set(key, entry);
			return next;
		};
		for (const [row, d] of rig.directions.entries()) {
			if (d.mirrorOf) {
				const source = rig.directions.findIndex((x) => x.id === d.mirrorOf);
				for (let c = 0; c < move.cells; c++) {
					const now = edited(row, c);
					if (
						!sameVisible(cellImg(p, layer, anim, d.id, c), now) &&
						!(source >= 0 && sameVisible(flipH(edited(source, c)), now))
					) {
						note({ kind: 'mirrored', dir: d.id, of: d.mirrorOf });
						break;
					}
				}
				continue;
			}
			if (!layer.cells?.[anim]?.[d.id]) {
				let touched = false;
				for (let c = 0; c < move.cells && !touched; c++) touched = !empty(edited(row, c));
				if (!touched) continue;
				// A body direction is never added from a sheet: it would need rig setup and new item fits.
				if (isBase || !base.layers[0].cells?.[anim]?.[d.id]) {
					note({ kind: 'noBodyRow', dir: d.id });
					continue;
				}
			}
			for (let c = 0; c < move.cells; c++) {
				let next = edited(row, c);
				if (o.mark && !empty(next)) next = o.mark(d.id, c, next);
				const saved = await change(d.id, c, next);
				if (!saved) continue;
				// Directions may keep a mirrored direction's own flipped rows: they follow their source.
				for (const mirror of rig.directions)
					if (mirror.mirrorOf === d.id && layer.cells?.[anim]?.[mirror.id])
						await change(mirror.id, c, flipH(saved));
			}
		}
	}
	const order = new Map(rig.directions.map((d, i) => [d.id, i]));
	plan.changed = [...changes.values()].sort(
		(a, b) => order.get(a.dir)! - order.get(b.dir)! || a.cell - b.cell
	);
	plan.newColors = countNewColors(p, item, fresh, o.colorKey ?? ((c) => c));
	return plan;
}

function countNewColors(p: Project, item: Item, fresh: Img[], key: (c: number) => number) {
	const known = new Set<number>(),
		seen = new Set<string>();
	const add = (im: Img, to: Set<number>) => {
		for (let i = 0; i < im.data.length; i += 4)
			if (im.data[i + 3]) to.add(key((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]));
	};
	for (const layer of item.layers)
		for (const dirs of Object.values(layer.cells ?? {}))
			for (const row of Object.values(dirs ?? {}))
				for (const h of row ?? []) {
					if (!h || seen.has(h)) continue;
					seen.add(h);
					const im = p.images.get(h);
					if (im) add(im, known);
				}
	const found = new Set<number>();
	for (const im of fresh) add(im, found);
	let n = 0;
	for (const c of found) if (!known.has(c)) n++;
	return n;
}

/** Base pixels an item hides stay hidden only where the item still draws (erasing a hood must not leave a hole). Returns the
 *  cut's before and after when it changed. Mutates `item`. */
function pruneCut(
	m: Manifest,
	item: Item,
	anim: string,
	dir: DirectionName,
	cell: number,
	image: (layer: Layer) => Img | null
) {
	const cut = item.baseCut?.[anim]?.[dir]?.[cell];
	if (!cut?.length) return undefined;
	const { w } = m.rig.cell;
	const kept = cut.filter((index) => {
		const x = index % w,
			y = Math.floor(index / w);
		return item.layers.some((layer) => {
			const im = image(layer);
			if (!im) return false;
			const f = layerFrame(m.rig, layer),
				lx = x + f.x - m.rig.pivot.x,
				ly = y + f.y - m.rig.pivot.y;
			return lx >= 0 && ly >= 0 && lx < im.w && ly < im.h && !!im.data[(ly * im.w + lx) * 4 + 3];
		});
	});
	if (kept.length === cut.length) return undefined;
	const after = kept.length ? kept : null;
	item.baseCut![anim]![dir]![cell] = after;
	return { before: cut, after };
}

/** Apply a reviewed plan to a copy of the item and record each changed frame's whole state (one history entry). */
export function applyPlan(p: Project, plan: FramesPlan, id: string): Item {
	const m = p.manifest,
		original = m.items.find((i) => i.id === plan.itemId)!,
		item = structuredClone(original),
		cells = m.rig.animations.find((a) => a.id === plan.anim)!.cells,
		isBase = item.id === m.rig.baseItem;
	const entry: ItemFrameEdit = { version: 'frames-v1', id, anim: plan.anim, frames: [] };
	for (const c of plan.changed) {
		const key: CellKey = `${plan.anim}/${c.dir}/${c.cell}`;
		const cutBefore = item.baseCut?.[plan.anim]?.[c.dir]?.[c.cell] ?? null;
		const frame: FrameEdit = {
			dir: c.dir,
			cell: c.cell,
			layers: [],
			cut: { before: cutBefore, after: cutBefore }
		};
		for (const layer of item.layers) {
			const row = layer.cells?.[plan.anim]?.[c.dir];
			const edit = c.layers.find((l) => l.id === layer.id);
			if (!row && !edit) continue; // a layer without this direction stays out of the frame's state
			const before = row?.[c.cell] ?? null;
			const after = edit ? edit.after : before;
			frame.layers.push({ id: layer.id, before, after });
			if (after === before) continue;
			if (!row) (frame.newRows ??= []).push(layer.id);
			(((layer.cells ??= {})[plan.anim] ??= {})[c.dir] ??= Array(cells).fill(null))[c.cell] = after;
		}
		if (item.coverage && !item.coverage.includes(key) && frame.layers.some((l) => l.after)) {
			item.coverage.push(key);
			frame.added = true;
		}
		const cut = pruneCut(m, item, plan.anim, c.dir, c.cell, (layer) => {
			const h = layer.cells?.[plan.anim]?.[c.dir]?.[c.cell];
			return h ? (plan.images.get(h) ?? p.images.get(h) ?? null) : null;
		});
		if (cut) frame.cut.after = cut.after;
		// The standing view generation poses from is bound to the body's Default frame once it matched it. Each record keeps
		// the reference it found, so Undo and Restore put it back (bodyRecord); saves move it with the frame's art.
		const rest = m.rig.rest?.[c.dir]?.image;
		const main = frame.layers.find((l) => l.id === 'main')?.before ?? null;
		if (rest && isBase && plan.anim === DEFAULT_MOVE && standingBound(original, c.dir, rest, main))
			frame.rest = rest;
		entry.frames.push(frame);
	}
	item.frameEdits = [...(item.frameEdits ?? []).filter(replayable), entry];
	return item;
}

/** Whether the body's Default frame in `dir` is the standing view: it showed that view (`before`), or an earlier import
 *  found it was. */
export const standingBound = (
	base: Item,
	dir: DirectionName,
	rest: Sha256,
	before: Sha256 | null
) =>
	before === rest ||
	!!base.frameEdits
		?.filter(replayable)
		.some(
			(e) =>
				e.anim === DEFAULT_MOVE &&
				e.frames.some((f) => f.dir === dir && f.cell === 0 && f.rest !== undefined)
		);

/** Hidden body px that can be written back: none on a mirrored direction, sorted unique indices inside the body cell. */
const validCutFor = (m: Manifest, dir: DirectionName, cut: number[] | null) =>
	cut === null ||
	(!m.rig.directions.find((d) => d.id === dir)?.mirrorOf &&
		cut.every(
			(v, i) =>
				Number.isSafeInteger(v) &&
				v >= 0 &&
				v < m.rig.cell.w * m.rig.cell.h &&
				(i === 0 || v > cut[i - 1])
		));

/** Put a frame back as its history found it: each layer's original cell (empty where the layer had no row), coverage,
 *  created rows and hidden body px. Mutates `item`. */
function revertFrame(m: Manifest, item: Item, h: FrameHistory) {
	const { anim, first: f } = h,
		cells = m.rig.animations.find((a) => a.id === anim)!.cells;
	for (const [id, before] of h.original) {
		const row = item.layers.find((x) => x.id === id)?.cells?.[anim]?.[f.dir];
		if (row) row[f.cell] = before;
	}
	if (h.added && item.coverage)
		item.coverage = item.coverage.filter((k) => k !== `${anim}/${f.dir}/${f.cell}`);
	const cut = item.baseCut?.[anim]?.[f.dir];
	if (validCutFor(m, f.dir, f.cut.before) && (cut || f.cut.before))
		(((item.baseCut ??= {})[anim] ??= {})[f.dir] ??= Array(cells).fill(null))[f.cell] =
			f.cut.before;
}

/** Rows an import created, or that did not exist when the frame's history began, go away again once reverting leaves
 *  them empty; empty rows the item already had stay. Mutates `item`. */
function dropCreatedRows(item: Item, reverted: FrameHistory[]) {
	for (const h of reverted)
		for (const id of new Set([...h.created, ...h.absent])) {
			const rows = item.layers.find((x) => x.id === id)?.cells?.[h.anim];
			if (rows?.[h.first.dir]?.every((x) => !x)) delete rows[h.first.dir];
		}
}

/** A reverted item, the stored cells it points back to (by layer), the frames reverted and how many. */
interface Reverted {
	item: Item;
	writes: { layer: LayerId; hash: Sha256 }[];
	frames: FrameHistory[];
	count: number;
}
const revert = (m: Manifest, item: Item, frames: FrameHistory[]): Reverted => {
	const next = structuredClone(item);
	for (const h of frames) revertFrame(m, next, h);
	dropCreatedRows(next, frames);
	return {
		item: next,
		writes: frames.flatMap((h) =>
			[...h.original].flatMap(([layer, hash]) => (hash ? [{ layer, hash }] : []))
		),
		frames,
		count: frames.length
	};
};

/** Put every still-edited frame back to its original and forget the history. */
export function restoreOriginals(m: Manifest, item: Item): Reverted | null {
	const live = editedHistory(m, item);
	if (!live.length) return null;
	const result = revert(m, item, live);
	delete result.item.frameEdits;
	return result;
}

/** One grid tile: the item's layers over a faded body (the body alone when it is the target), in a frame wide enough for
 *  padded held layers, pivots aligned. */
export function frameTile(
	p: Project,
	itemId: string,
	anim: string,
	dir: DirectionName,
	cell: number
): Img {
	const m = p.manifest,
		{ rig } = m,
		item = m.items.find((i) => i.id === itemId)!,
		base = m.items.find((i) => i.id === rig.baseItem)!;
	const { x, y, w, h } = unionFrame([
		{ ...rig.cell, ...rig.pivot },
		...item.layers.map((l) => layerFrame(rig, l))
	]);
	const out = makeImg(w, h);
	if (item.id !== base.id) {
		const body = cellImg(p, base.layers[0], anim, dir, cell);
		if (body) {
			const faded = { ...body, data: new Uint8ClampedArray(body.data) };
			for (let i = 3; i < faded.data.length; i += 4)
				faded.data[i] = Math.round(faded.data[i] * 0.3);
			over(out, faded, x - rig.pivot.x, y - rig.pivot.y);
		}
	}
	for (const layer of [...item.layers].sort((a, b) => a.z - b.z)) {
		const im = cellImg(p, layer, anim, dir, cell),
			f = layerFrame(rig, layer);
		if (im) over(out, im, x - f.x, y - f.y);
	}
	return out;
}

export { editedCount, editedFrames } from './history.ts';
