// Fix frames history (Item.frameEdits): which frames still hold the user's edit. Small and dependency-free, so item health
// can read it without loading the Fix frames code.
import type { Item, ItemFrameEdit, Manifest } from '../store/manifest.ts';

export type FrameEdit = ItemFrameEdit['frames'][number];

const sameCut = (a: number[] | null | undefined, b: number[] | null | undefined) =>
	(a ?? null) === null
		? (b ?? null) === null
		: !!b && a!.length === b.length && a!.every((v, i) => v === b[i]);

/** History this version can replay; anything else (older or damaged records) is ignored, never read. */
export const replayable = (e: ItemFrameEdit) =>
	!!e &&
	typeof e.anim === 'string' &&
	typeof e.id === 'string' &&
	Array.isArray(e.frames) &&
	e.frames.every(
		(f) =>
			!!f &&
			typeof f.cell === 'number' &&
			Array.isArray(f.layers) &&
			!!f.cut &&
			typeof f.cut === 'object' &&
			'before' in f.cut &&
			'after' in f.cut
	);

/** The frame is still exactly as `f` left it: every recorded layer's row exists and holds its cell, and the hidden body px
 *  match. A row or cut a later direction or move change replaced means it is no longer the user's edit. */
export function holds(m: Manifest, item: Item, anim: string, f: FrameEdit): boolean {
	const cells = m.rig.animations.find((a) => a.id === anim)?.cells ?? 0;
	if (f.cell >= cells || !m.rig.directions.some((d) => d.id === f.dir)) return false;
	return (
		f.layers.every((l) => {
			const row = item.layers.find((x) => x.id === l.id)?.cells?.[anim]?.[f.dir];
			return !!row && (row[f.cell] ?? null) === l.after;
		}) && sameCut(item.baseCut?.[anim]?.[f.dir]?.[f.cell], f.cut.after)
	);
}

type LayerId = FrameEdit['layers'][number]['id'];

/** Per edited frame, over its continuous history: the first record, the latest, each layer's original cell (null for a
 *  layer that had no row then), whether any record added coverage, the layers whose row it created, and the layers that
 *  had no row when the history began. */
export interface FrameHistory {
	anim: string;
	first: FrameEdit;
	latest: FrameEdit;
	original: Map<LayerId, FrameEdit['layers'][number]['before']>;
	added: boolean;
	created: LayerId[];
	absent: LayerId[];
}

/** Frames that still hold the user's latest edit and differ from their originals in any way (pixels, hidden body px,
 *  coverage or rows). A record that does not continue from the previous one (something else, such as Directions, changed
 *  the frame in between) starts the frame's history over; frames changed since the latest record are left out. */
export function editedHistory(m: Manifest, item: Item): FrameHistory[] {
	const out = new Map<string, FrameHistory>();
	for (const e of (item.frameEdits ?? []).filter(replayable))
		for (const f of e.frames) {
			const key = `${e.anim}/${f.dir}/${f.cell}`;
			let h = out.get(key);
			const joins =
				h &&
				sameCut(f.cut.before, h.latest.cut.after) &&
				f.layers.every(
					(l) => l.before === (h!.latest.layers.find((x) => x.id === l.id)?.after ?? null)
				);
			if (!h || !joins)
				h = {
					anim: e.anim,
					first: f,
					latest: f,
					original: new Map(f.layers.map((l) => [l.id, l.before])),
					added: false,
					created: [],
					absent: []
				};
			for (const l of f.layers)
				if (!h.original.has(l.id)) {
					h.original.set(l.id, null);
					h.absent.push(l.id);
				}
			h.latest = f;
			h.added ||= !!f.added;
			h.created = [...new Set([...h.created, ...(f.newRows ?? [])])];
			out.set(key, h);
		}
	return [...out.values()].filter(
		(h) =>
			holds(m, item, h.anim, h.latest) &&
			(h.added ||
				h.created.length > 0 ||
				!sameCut(h.first.cut.before, h.latest.cut.after) ||
				[...h.original].some(
					([id, before]) => before !== (h.latest.layers.find((x) => x.id === id)?.after ?? null)
				))
	);
}

/** Distinct edited frames of one move, as `dir/cell`. */
export const editedFrames = (m: Manifest, item: Item, anim: string) =>
	new Set(
		editedHistory(m, item)
			.filter((h) => h.anim === anim)
			.map((h) => `${h.latest.dir}/${h.latest.cell}`)
	);

/** How many frames (any move) still hold the user's edit. */
export const editedCount = (m: Manifest, item: Item) => editedHistory(m, item).length;
