// Import moves and States from a PixelDoll character ZIP into a saved character. Pure: no DOM, IndexedDB or PixelLab.
// A move's frames are drawings of one body, so they only fit a character whose frozen standing body is the same. That is
// decided from the standing views alone (new moves never change them): exact pixels, the same art after a lossless Adjust
// frame (re-centered or moved up or down), or nearly the same art (a few pixels touched up in Fix frames). A different
// body can still take the motion: each frame's joints, fitted to this body, for the Studio to redraw it (paid).
import type { Img } from '../image/png.ts';
import { stableStringify } from '../image/hash.ts';
import { LocalizedError } from '../message.ts';
import type { ImportedCharacter } from '../store/import.ts';
import type { Item, Manifest, Provenance, RigAnimation } from '../store/manifest.ts';
import type { StoredProject } from '../store/project.ts';
import { restoreMove, retainItemMoves, retainMoveMetadata } from './moves.ts';
import { opaqueBox } from './normalize.ts';
import { hasAll } from './poses.ts';
import { reframeCharacter } from './reframe.ts';
import {
	DEFAULT_MOVE,
	pinnedArtwork,
	validAnimationId,
	type DirectionName,
	type Keypoint,
	type Sha256
} from './rig.ts';

export type MoveRecord = Pick<
	StoredProject,
	'manifest' | 'skeletons' | 'rigQa' | 'moveRecovery' | 'character'
>;
export interface MoveImportTarget {
	record: MoveRecord;
	images: ReadonlyMap<string, Img>;
}
/** Same body: `shift` is the Adjust frame change that lines the ZIP up; `differing` counts standing pixels that still
 *  differ (0 = identical). A different body says why: another direction layout, or another standing body. */
export type MoveImportFit =
	| { same: true; shift?: { size: number; dy: number }; differing: number }
	| { same: false; reason: 'directions' | 'body' };

export interface MoveImportRow {
	/** The clip's id in the ZIP. */
	id: string;
	kind: 'move' | 'state';
	cells: number;
	/** add: a new clip; copy: a name already used here, kept both under `targetName`; present: this character already has
	 *  these exact frames; motion: another body's move whose joints can redraw this body; unavailable: nothing usable. */
	action: 'add' | 'copy' | 'present' | 'motion' | 'unavailable';
	targetId: string;
	/** The name a kept-both copy takes. */
	targetName?: string;
	/** This character's items whose frames for the clip come with it. */
	items: string[];
	/** Names of the ZIP's items with frames for the clip that this character does not have (left out). */
	left: string[];
	/** Motion rows: per drawn direction, the clip's joints fitted to this body (API keypoints). */
	poses?: Partial<Record<DirectionName, Keypoint[][]>>;
}
export interface MoveImportPlan {
	fit: MoveImportFit;
	rows: MoveImportRow[];
	/** Same body only: the ZIP lined up with this character's frame, and the clip both bodies were compared on. */
	source?: { record: MoveRecord; images: ReadonlyMap<string, Img>; ref: string };
}
export interface MoveImportOptions {
	/** A clip's name as the Studio shows it. */
	label: (id: string, clips: readonly RigAnimation[]) => string;
	/** The clip id a name takes. */
	idOf: (name: string) => string;
	/** Names in use beyond the saved clips (moves waiting for review, pending States). */
	taken?: readonly string[];
}

/** Standing pixels that may differ for the same body: Fix frames touch-ups, not another drawing. */
export const NEAR_SHARE = 0.02;
const NEAR_MIN = 8;

const drawn = (m: Manifest) => m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
const baseOf = (m: Manifest) => m.items.find((item) => item.id === m.rig.baseItem);
/** The body's first frame of a clip in one direction. */
function view(m: Manifest, images: ReadonlyMap<string, Img>, clip: string, dir: DirectionName) {
	const hash = baseOf(m)?.layers[0]?.cells?.[clip]?.[dir]?.[0];
	return hash ? images.get(hash) : undefined;
}
/** The clip both bodies are compared on: Standing (Default), which new moves never change; else, for a character without
 *  one (the bundled demo), the first move both have. */
function reference(a: Manifest, b: Manifest, dir: DirectionName): string | undefined {
	const has = (m: Manifest, clip: string) => !!baseOf(m)?.layers[0]?.cells?.[clip]?.[dir]?.[0];
	if (has(a, DEFAULT_MOVE) && has(b, DEFAULT_MOVE)) return DEFAULT_MOVE;
	return a.rig.animations.find((clip) => has(a, clip.id) && has(b, clip.id))?.id;
}

/** Pixels that differ between two frames, and the visible pixels of either. Garment regions live in the blue channel's
 *  lowest bit (dress/regions.ts), which a body gains when it is opened, so that bit never counts as a difference. */
export function frameDifference(a: Img, b: Img): { differing: number; visible: number } {
	if (a.w !== b.w || a.h !== b.h) return { differing: Infinity, visible: 0 };
	let differing = 0,
		visible = 0;
	for (let i = 0; i < a.data.length; i += 4) {
		const seenA = a.data[i + 3] > 0,
			seenB = b.data[i + 3] > 0;
		if (seenA || seenB) visible++;
		if (!seenA && !seenB) continue;
		if (
			a.data[i] !== b.data[i] ||
			a.data[i + 1] !== b.data[i + 1] ||
			(a.data[i + 2] & 0xfe) !== (b.data[i + 2] & 0xfe) ||
			a.data[i + 3] !== b.data[i + 3]
		)
			differing++;
	}
	return { differing, visible };
}

/** Line the ZIP up with the target's frame and compare the bodies on their reference clip. */
async function align(
	target: MoveImportTarget,
	source: { record: MoveRecord; images: ReadonlyMap<string, Img> }
): Promise<{
	fit: MoveImportFit;
	record?: MoveRecord;
	images?: ReadonlyMap<string, Img>;
	ref?: string;
}> {
	const tm = target.record.manifest;
	let record = source.record,
		images = source.images;
	if (stableStringify(tm.rig.directions) !== stableStringify(record.manifest.rig.directions))
		return { fit: { same: false, reason: 'directions' } };
	const dirs = drawn(tm),
		body = { fit: { same: false, reason: 'body' } } as const;
	const ref = dirs[0] && reference(tm, record.manifest, dirs[0]);
	if (!ref) return body;
	const first = view(tm, target.images, ref, dirs[0]),
		theirs = view(record.manifest, images, ref, dirs[0]);
	const tc = tm.rig.cell,
		sc = record.manifest.rig.cell;
	const ours = first && opaqueBox(first),
		box = theirs && opaqueBox(theirs);
	if (!ours || !box) return body;
	// Adjust frame re-centers square frames and moves the art only up or down (lib/rig/reframe.ts).
	const p = (tc.w - sc.w) / 2;
	if ((tc.w !== sc.w || tc.h !== sc.h) && (tc.w !== tc.h || sc.w !== sc.h || !Number.isInteger(p)))
		return body;
	if (box.x0 + p !== ours.x0) return body;
	const dy = ours.y0 - (box.y0 + p);
	let shift: { size: number; dy: number } | undefined;
	if (p || dy) {
		try {
			const moved = await reframeCharacter(record, images, { size: tc.w, dy });
			record = moved.record;
			images = new Map([...images, ...moved.newImages]);
			shift = { size: tc.w, dy };
		} catch (error) {
			// Art that cannot be moved there without cutting it off is not this body on this frame.
			if (error instanceof LocalizedError) return body;
			throw error;
		}
	}
	let differing = 0,
		visible = 0;
	for (const dir of dirs) {
		const a = view(tm, target.images, ref, dir),
			b = view(record.manifest, images, ref, dir);
		if (!a || !b) return body;
		const d = frameDifference(a, b);
		differing += d.differing;
		visible += d.visible;
	}
	if (differing > Math.max(NEAR_MIN, Math.round(visible * NEAR_SHARE))) return body;
	return { fit: { same: true, ...(shift ? { shift } : {}), differing }, record, images, ref };
}

/** An item's art on the reference clip: what a copy of the same item has, whatever its id or name. */
function itemLook(item: Item, ref: string): string | undefined {
	const cells = item.layers.map((layer) => [layer.id, layer.cells?.[ref] ?? null]);
	if (!cells.some(([, rows]) => rows) && !item.dressed) return undefined;
	return stableStringify([item.slot, cells, item.dressed ?? null]);
}
const owns = (item: Item, clip: string) =>
	item.layers.some((layer) => layer.cells?.[clip]) ||
	!!item.coverage?.some((cell) => cell.split('/')[0] === clip);

/** This character's item matching each ZIP item (same id preferred), or none. */
function matchItems(target: Manifest, source: Manifest, ref: string): Map<string, string> {
	const out = new Map<string, string>([[source.rig.baseItem, target.rig.baseItem]]);
	const candidates = target.items.filter(
		(item) => !item.variantOf && item.id !== target.rig.baseItem
	);
	const used = new Set<string>();
	for (const item of source.items) {
		if (item.variantOf || item.id === source.rig.baseItem) continue;
		const look = itemLook(item, ref);
		if (!look) continue;
		const same = candidates.filter((other) => !used.has(other.id) && itemLook(other, ref) === look);
		const match = same.find((other) => other.id === item.id) ?? same[0];
		if (match) {
			out.set(item.id, match.id);
			used.add(match.id);
		}
	}
	return out;
}

function sameFrames(
	a: Manifest,
	aImages: ReadonlyMap<string, Img>,
	b: Manifest,
	bImages: ReadonlyMap<string, Img>,
	clip: string
): boolean {
	const ours = baseOf(a)?.layers[0]?.cells?.[clip],
		theirs = baseOf(b)?.layers[0]?.cells?.[clip];
	if (!ours || !theirs) return false;
	for (const dir of drawn(a)) {
		const x = ours[dir] ?? [],
			y = theirs[dir] ?? [];
		if (x.length !== y.length) return false;
		for (const [i, hash] of x.entries()) {
			if (hash === y[i]) continue;
			const p = hash && aImages.get(hash),
				q = y[i] && bImages.get(y[i]!);
			if (!p || !q || frameDifference(p, q).differing) return false;
		}
	}
	return true;
}

/** Which moves and States of an imported ZIP can come into this character, and how. */
export async function planMoveImport(
	target: MoveImportTarget,
	imported: Pick<ImportedCharacter, 'project' | 'extra'>,
	options: MoveImportOptions
): Promise<MoveImportPlan> {
	const tm = target.record.manifest;
	const source = {
		record: structuredClone({
			manifest: imported.project.manifest,
			skeletons: imported.extra.skeletons,
			rigQa: imported.extra.rigQa,
			character: imported.extra.character
		}) as MoveRecord,
		images: imported.project.images
	};
	const aligned = await align(target, source);
	const sm = (aligned.record ?? source.record).manifest;
	const matches = aligned.ref ? matchItems(tm, sm, aligned.ref) : new Map<string, string>();
	const names = new Set(
		[
			...tm.rig.animations.flatMap((clip) => [clip.id, options.label(clip.id, tm.rig.animations)]),
			...(options.taken ?? []),
			DEFAULT_MOVE,
			'standing'
		].map(options.idOf)
	);
	const free = (label: string) => {
		// "Walk 2" kept again is "Walk 3", not "Walk 2 2".
		const stem = label.replace(/\s+\d+$/, '') || label;
		for (let n = 2; ; n++) {
			const name = `${stem} ${n}`,
				id = options.idOf(name);
			if (validAnimationId(id) && !names.has(id)) {
				names.add(id);
				return { id, name };
			}
		}
	};
	const rows: MoveImportRow[] = [];
	for (const clip of sm.rig.animations) {
		if (clip.id === DEFAULT_MOVE) continue;
		const label = options.label(clip.id, sm.rig.animations),
			kind = clip.kind === 'state' ? 'state' : 'move';
		const holders = sm.items.filter((item) => item.id !== sm.rig.baseItem && owns(item, clip.id));
		const row: MoveImportRow = {
			id: clip.id,
			kind,
			cells: clip.cells,
			action: 'unavailable',
			targetId: clip.id,
			items: holders.flatMap((item) => {
				const id = matches.get(item.id);
				return id ? [id] : [];
			}),
			left: holders.filter((item) => !matches.has(item.id)).map((item) => item.name)
		};
		if (aligned.fit.same) {
			const here = tm.rig.animations.find((other) => other.id === clip.id);
			if (
				here &&
				(here.kind === 'state') === (kind === 'state') &&
				sameFrames(tm, target.images, sm, aligned.images!, clip.id)
			)
				row.action = 'present';
			else if (
				here ||
				names.has(clip.id) ||
				names.has(options.idOf(label)) ||
				!validAnimationId(clip.id)
			) {
				const copy = free(label);
				Object.assign(row, { action: 'copy', targetId: copy.id, targetName: copy.name });
			} else {
				row.action = 'add';
				names.add(clip.id);
				names.add(options.idOf(label));
			}
		} else {
			row.items = [];
			row.left = [];
			const poses = kind === 'move' ? clipPoses(tm, sm, clip) : undefined;
			if (poses) {
				const id = options.idOf(label);
				const named = validAnimationId(id) && !names.has(id) ? { id, name: label } : free(label);
				names.add(named.id);
				Object.assign(row, { action: 'motion', targetId: named.id, poses });
				if (named.id !== id) row.targetName = named.name;
			}
		}
		rows.push(row);
	}
	return {
		fit: aligned.fit,
		rows,
		...(aligned.ref
			? { source: { record: aligned.record!, images: aligned.images!, ref: aligned.ref } }
			: {})
	};
}

/** Rename one clip everywhere a record keys it (frames, poses, checks, costs and history). */
function renameClip(record: MoveRecord, from: string, to: string) {
	const key = (k: string) =>
		k === from ? to : k.startsWith(`${from}/`) ? to + k.slice(from.length) : k;
	const rekey = <T>(rows: Record<string, T> | undefined) =>
		rows &&
		(Object.fromEntries(Object.entries(rows).map(([k, v]) => [key(k), v])) as Record<string, T>);
	const m = record.manifest;
	for (const clip of m.rig.animations) if (clip.id === from) clip.id = to;
	for (const [anchor, track] of Object.entries(m.rig.anchors ?? {}))
		(m.rig.anchors as Record<string, unknown>)[anchor] = rekey(track);
	for (const slot of m.slots)
		for (const entry of slot.zOverrides ?? []) if (entry.anim === from) entry.anim = to;
	for (const item of m.items) {
		for (const layer of item.layers) {
			layer.cells = rekey(layer.cells);
			layer.sheets = rekey(layer.sheets);
			layer.sourceSheets = rekey(layer.sourceSheets);
			if (!layer.cells) delete layer.cells;
			if (!layer.sheets) delete layer.sheets;
			if (!layer.sourceSheets) delete layer.sourceSheets;
		}
		if (item.baseCut) item.baseCut = rekey(item.baseCut);
		if (item.coverage) item.coverage = item.coverage.map(key) as typeof item.coverage;
		if (item.pending) item.pending = item.pending.map(key) as typeof item.pending;
		if (item.anchorCell) item.anchorCell = key(item.anchorCell) as typeof item.anchorCell;
		if (item.standing === from) item.standing = to;
		for (const note of [
			...(item.refit ?? []),
			...(item.unfitted ?? []),
			...(item.frameEdits ?? []),
			...(item.paletteRepairs ?? [])
		])
			if (note.anim === from) note.anim = to;
		for (const entry of item.provenance ?? [])
			if (entry.produced) entry.produced = entry.produced.map(key) as typeof entry.produced;
		if (item.qa) {
			item.qa.cells = rekey(item.qa.cells)!;
			item.qa.clips = rekey(item.qa.clips)!;
			if (item.qa.inherited) item.qa.inherited.clips = item.qa.inherited.clips.map(key);
		}
	}
	record.skeletons = rekey(record.skeletons);
	const qa = record.rigQa as { clips?: Record<string, unknown>; warnings?: string[] } | undefined;
	if (qa && typeof qa === 'object') {
		if (qa.clips) qa.clips = rekey(qa.clips);
		if (qa.warnings)
			qa.warnings = qa.warnings.map((w) =>
				w.startsWith(`${from}/`) || w.startsWith(`${from} `) ? to + w.slice(from.length) : w
			);
	}
}

/** The ZIP record reduced to one clip under its id here, with only the items that match this character's, renamed to
 *  theirs: what restoreMove puts back. */
function clipRecord(
	source: MoveRecord,
	target: Manifest,
	row: MoveImportRow,
	ref: string
): MoveRecord {
	const record = structuredClone({
		manifest: source.manifest,
		skeletons: source.skeletons,
		rigQa: source.rigQa
	}) as MoveRecord;
	// Matched on the reference clip before renaming, which may rename that very clip.
	const matches = matchItems(target, record.manifest, ref);
	if (row.targetId !== row.id) renameClip(record, row.id, row.targetId);
	const m = record.manifest,
		keep = new Set([row.targetId]);
	const clip = m.rig.animations.find((entry) => entry.id === row.targetId)!;
	if (row.targetName) {
		clip.name = row.targetName;
		delete clip.exportId;
	}
	m.items = m.items.flatMap((item) => {
		const id = matches.get(item.id);
		if (!id || (item.id !== m.rig.baseItem && !row.items.includes(id))) return [];
		retainItemMoves(item, keep);
		item.id = id;
		return [item];
	});
	m.rig.baseItem = target.rig.baseItem;
	Object.assign(record, retainMoveMetadata(record, keep));
	return record;
}

/** One paid call, whichever frames it is recorded as having produced (a kept-both copy renames them). */
const callOf = ({ produced: _produced, replaced: _replaced, ...call }: Provenance) =>
	stableStringify(call);
/** Paid-call records the clip's frames, poses and checks point at: the ZIP's entries join this item's list and the indexes
 *  follow them. A call already listed is not repeated (restoring a backup or keeping a copy counts nothing twice); it gains
 *  the clip's frames instead. */
function carryProvenance(m: Manifest, b: Manifest, clip: string) {
	for (const item of m.items) {
		const was = b.items.find((entry) => entry.id === item.id);
		if (!was?.provenance?.length) continue;
		const list = (item.provenance ??= []),
			known = new Map(list.map((entry, i) => [callOf(entry), i])),
			map = new Map<number, number>();
		const index = (i: number): number | undefined => {
			if (map.has(i)) return map.get(i);
			const entry = was.provenance[i];
			if (!entry) return undefined;
			const text = callOf(entry);
			let j = known.get(text);
			if (j === undefined) {
				j = list.push(structuredClone(entry)) - 1;
				known.set(text, j);
			} else {
				const ours = list[j];
				ours.produced = [...new Set([...(ours.produced ?? []), ...(entry.produced ?? [])])];
			}
			map.set(i, j);
			return j;
		};
		for (const [i, entry] of was.provenance.entries())
			if (entry.produced?.some((cell) => cell.split('/')[0] === clip)) index(i);
		if (item.id === m.rig.baseItem) {
			const anim = m.rig.animations.find((entry) => entry.id === clip);
			for (const source of Object.values(anim?.sources ?? {}))
				if (source)
					source.provenance = source.provenance.flatMap((i) => {
						const j = index(i);
						return j === undefined ? [] : [j];
					});
		}
		for (const [cell, qa] of Object.entries(item.qa?.cells ?? {})) {
			if (cell.split('/')[0] !== clip || qa.provenance === undefined) continue;
			const j = index(qa.provenance);
			if (j === undefined) delete qa.provenance;
			else qa.provenance = j;
		}
	}
}

/** The record with the chosen rows added, and the images it now needs that this character does not store yet. */
export async function applyMoveImport(
	target: MoveImportTarget,
	plan: MoveImportPlan,
	ids: readonly string[]
): Promise<{
	record: MoveRecord;
	images: Map<Sha256, Img>;
	added: { id: string; kind: 'move' | 'state' }[];
}> {
	const rows = plan.rows.filter(
		(row) => ids.includes(row.id) && (row.action === 'add' || row.action === 'copy')
	);
	if (!plan.source || !rows.length) throw new Error('Nothing to import.');
	const next = structuredClone(target.record);
	const images = new Map<Sha256, Img>();
	const need = (hash: Sha256 | null | undefined) => {
		if (!hash || target.images.has(hash) || images.has(hash)) return;
		const image = plan.source!.images.get(hash);
		if (!image) throw new Error(`The import is missing image ${hash}.`);
		images.set(hash, image);
	};
	for (const row of rows) {
		const before = clipRecord(plan.source.record, next.manifest, row, plan.source.ref);
		const result = await restoreMove(next, before, row.targetId);
		if (result !== 'restored') throw new Error(`Could not import ${row.id}: ${result}.`);
		carryProvenance(next.manifest, before.manifest, row.targetId);
		// A move's reference is the standing view it was drawn from: this body's own (a touched-up one may have a new
		// hash), unless the move started from a saved frame, which is kept with its joints (pinned below).
		const clip = next.manifest.rig.animations.find((entry) => entry.id === row.targetId)!;
		for (const [dir, source] of Object.entries(clip.sources ?? {}) as [
			DirectionName,
			NonNullable<RigAnimation['sources']>[DirectionName]
		][])
			if (source && !source.referenceKeypoints) {
				const rest = next.manifest.rig.rest?.[dir]?.image;
				if (rest) source.reference = rest;
				else need(source.reference);
			}
		for (const item of next.manifest.items)
			for (const layer of item.layers)
				for (const cells of Object.values(layer.cells?.[row.targetId] ?? {}))
					for (const hash of cells ?? []) need(hash);
	}
	for (const hash of pinnedArtwork(next.manifest.rig)) need(hash);
	return { record: next, images, added: rows.map((row) => ({ id: row.targetId, kind: row.kind })) };
}

// ---------- motion from another body ----------
const PARENT: Record<string, string> = {
	NECK: 'PELVIS',
	'RIGHT HIP': 'PELVIS',
	'LEFT HIP': 'PELVIS',
	'RIGHT KNEE': 'RIGHT HIP',
	'RIGHT LEG': 'RIGHT KNEE',
	'LEFT KNEE': 'LEFT HIP',
	'LEFT LEG': 'LEFT KNEE',
	'RIGHT SHOULDER': 'NECK',
	'RIGHT ELBOW': 'RIGHT SHOULDER',
	'RIGHT ARM': 'RIGHT ELBOW',
	'LEFT SHOULDER': 'NECK',
	'LEFT ELBOW': 'LEFT SHOULDER',
	'LEFT ARM': 'LEFT ELBOW',
	NOSE: 'NECK',
	'RIGHT EYE': 'NOSE',
	'LEFT EYE': 'NOSE',
	'RIGHT EAR': 'NOSE',
	'LEFT EAR': 'NOSE'
};
/** Parents before children. */
const ORDER = Object.keys(PARENT).sort((a, b) => depth(a) - depth(b));
function depth(label: string): number {
	return label === 'PELVIS' ? 0 : 1 + depth(PARENT[label]);
}
type Point = { x: number; y: number };
type Pose = Record<string, Point>;
function pose(k: readonly Keypoint[], cell: { w: number; h: number }): Pose {
	const p: Pose = Object.fromEntries(k.map((q) => [q.label, { x: q.x * cell.w, y: q.y * cell.h }]));
	p.PELVIS = {
		x: (p['RIGHT HIP'].x + p['LEFT HIP'].x) / 2,
		y: (p['RIGHT HIP'].y + p['LEFT HIP'].y) / 2
	};
	return p;
}
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v: Point) => Math.hypot(v.x, v.y);
const legLength = (p: Pose, side: string) =>
	len(sub(p[`${side} KNEE`], p[`${side} HIP`])) + len(sub(p[`${side} LEG`], p[`${side} KNEE`]));
const height = (p: Pose) =>
	len(sub(p.NECK, p.PELVIS)) + (legLength(p, 'RIGHT') + legLength(p, 'LEFT')) / 2;
/** Bones shorter than this at rest have no reliable angle (a side view's overlapping hips). */
const SHORT_BONE = 2;

/**
 * One frame's joints moved onto another body: the pelvis travels as far as the source's did (scaled by body height), and
 * every bone turns and stretches (foreshortening) from this body's own standing bone as the source's turned and stretched
 * from its standing bone. A frame equal to the source's standing gives exactly this body's standing joints. Depth hints are
 * kept. Undefined when either standing pose has no usable height.
 */
export function fitPose(
	frame: readonly Keypoint[],
	sourceRest: readonly Keypoint[],
	sourceCell: { w: number; h: number },
	targetRest: readonly Keypoint[],
	targetCell: { w: number; h: number }
): Keypoint[] | undefined {
	const s = pose(frame, sourceCell),
		sr = pose(sourceRest, sourceCell),
		tr = pose(targetRest, targetCell);
	const k = height(tr) / height(sr);
	if (!Number.isFinite(k) || k <= 0) return undefined;
	const out: Pose = {
		PELVIS: {
			x: tr.PELVIS.x + (s.PELVIS.x - sr.PELVIS.x) * k,
			y: tr.PELVIS.y + (s.PELVIS.y - sr.PELVIS.y) * k
		}
	};
	for (const label of ORDER) {
		const parent = PARENT[label];
		const vs = sub(s[label], s[parent]),
			vsr = sub(sr[label], sr[parent]),
			vtr = sub(tr[label], tr[parent]);
		let v: Point;
		if (len(vsr) >= SHORT_BONE && len(vtr) >= SHORT_BONE) {
			const turn = Math.atan2(vs.y, vs.x) - Math.atan2(vsr.y, vsr.x),
				stretch = Math.min(3, len(vs) / len(vsr));
			v = {
				x: (vtr.x * Math.cos(turn) - vtr.y * Math.sin(turn)) * stretch,
				y: (vtr.x * Math.sin(turn) + vtr.y * Math.cos(turn)) * stretch
			};
		} else v = { x: vtr.x + (vs.x - vsr.x) * k, y: vtr.y + (vs.y - vsr.y) * k };
		out[label] = { x: out[parent].x + v.x, y: out[parent].y + v.y };
	}
	const unit = (n: number) => +Math.min(1, Math.max(0, n)).toFixed(4);
	return frame.map((q) => ({
		...q,
		x: unit(out[q.label].x / targetCell.w),
		y: unit(out[q.label].y / targetCell.h)
	}));
}

/** A ZIP move's joints for every direction this body draws, fitted to it, or undefined when any direction lacks them. */
function clipPoses(
	target: Manifest,
	source: Manifest,
	clip: RigAnimation
): Partial<Record<DirectionName, Keypoint[][]>> | undefined {
	const out: Partial<Record<DirectionName, Keypoint[][]>> = {};
	for (const dir of drawn(target)) {
		const src = clip.sources?.[dir],
			frames = src?.keypoints?.length ? src.keypoints : src?.measured,
			// Fitted from Standing to Standing: a saved start frame is only where the move began.
			rest = source.rig.rest?.[dir]?.keypoints,
			ours = target.rig.rest?.[dir]?.keypoints;
		if (!frames?.length || !frames.every(hasAll) || !hasAll(rest) || !hasAll(ours))
			return undefined;
		const fitted = frames.map((frame) =>
			fitPose(frame, rest!, source.rig.cell, ours!, target.rig.cell)
		);
		if (fitted.some((frame) => !frame)) return undefined;
		out[dir] = fitted as Keypoint[][];
	}
	return Object.keys(out).length ? out : undefined;
}
