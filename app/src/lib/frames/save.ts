// Fix frames persistence: read the user's files, plan against the stored character, and save, undo or restore one item's
// (or the body's) frames atomically. Item saves go through saveItem with a version check; body saves rebase the items fitted
// to the old body and refuse while generation work could write the character back (saveIdleCharacter).
import { decodePng, pngSize, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { stableStringify } from '../image/hash.ts';
import { LocalizedError } from '../message.ts';
import { isGarment, regionMarker } from '../dress/regions.ts';
import {
	baseHashOf,
	DEFAULT_MOVE,
	rigArtworkVersion,
	storedCellHashes,
	type DirectionName,
	type Sha256
} from '../rig/rig.ts';
import * as db from '../store/db.ts';
import { itemContent } from '../store/identity.ts';
import type { Item, Project } from '../store/manifest.ts';
import { getBlob } from '../store/db.ts';
import { layerFrame } from '../compose/compose.ts';
import { loadProject, rememberDecoded, saveItem, type StoredProject } from '../store/project.ts';
import { unzip } from '../store/zip.ts';
import { standingHistory, type FrameHistory } from './history.ts';
import {
	applyPlan,
	layerOfFile,
	planFrames,
	restoreOriginals,
	sheetSize,
	standingBound,
	undoLast,
	type FramesPlan,
	type LayerId
} from './fix.ts';

export interface FramesFile {
	name: string;
	bytes: Uint8Array;
}

const isZip = (f: FramesFile) =>
	/\.zip$/i.test(f.name) || (f.bytes[0] === 0x50 && f.bytes[1] === 0x4b);

/** The PNGs the user chose (loose or inside ZIPs), matched to the item's layers; size checked before decoding. */
export async function readFrameFiles(p: Project, item: Item, anim: string, files: FramesFile[]) {
	const pngs: FramesFile[] = [];
	for (const f of files)
		if (isZip(f))
			for (const [name, bytes] of await unzip(f.bytes)) {
				if (/\.png$/i.test(name) && !/(^|\/)(__MACOSX|\.)/.test(name)) pngs.push({ name, bytes });
			}
		else pngs.push(f);
	const sheets = new Map<LayerId, Img>();
	let ignored = 0;
	for (const f of pngs) {
		const size = pngSize(f.bytes);
		const layerId = size ? layerOfFile(item, f.name) : undefined;
		const layer = item.layers.find((l) => l.id === layerId);
		if (!size || !layer) {
			ignored++;
			continue;
		}
		if (sheets.has(layer.id))
			throw new LocalizedError(
				`More than one file ends in -${layer.id}.png. Choose one file per layer.`,
				'fixFrames.errors.duplicateLayer',
				{ layer: layer.id }
			);
		const want = sheetSize(p.manifest, layer, anim);
		if (size.w !== want.w || size.h !== want.h)
			throw new LocalizedError(
				`This PNG is ${size.w}×${size.h} px, but these frames need ${want.w}×${want.h} px. Keep the original size and grid.`,
				'fixFrames.errors.size',
				{ got: `${size.w}×${size.h}`, want: `${want.w}×${want.h}` }
			);
		try {
			sheets.set(layer.id, await decodePng(f.bytes));
		} catch (error) {
			console.error('fix frames decode', error);
			throw new LocalizedError(
				'This file could not be read as a PNG. Save it again as PNG and import it.',
				'fixFrames.errors.badPng'
			);
		}
	}
	if (!sheets.size)
		throw new LocalizedError(
			item.layers.length > 1
				? 'No PNG matched these frames. Use the files from Download, keeping names that end in -fg or -bg.'
				: 'No PNG found. Choose the PNG you downloaded and edited.',
			item.layers.length > 1 ? 'fixFrames.errors.noLayerMatch' : 'fixFrames.errors.noPng'
		);
	return { sheets: [...sheets].map(([layerId, image]) => ({ layerId, image })), ignored };
}

const itemVersion = (rec: StoredProject, itemId: string) => {
	const item = rec.manifest.items.find((i) => i.id === itemId);
	return stableStringify({
		rig: rigArtworkVersion(rec.manifest.rig, rec.character),
		item: item && itemContent(item)
	});
};

export interface PreparedFrames {
	projectId: string;
	rec: StoredProject;
	project: Project;
	plan: FramesPlan;
	ignored: number;
	/** Body only: items fitted to the current body, which stay worn on the new frames. */
	fitted: string[];
}

const assertEditable = (projectId: string) => {
	if (!projectId.startsWith('rig-'))
		throw new LocalizedError(
			'Copy this character before fixing its frames.',
			'fixFrames.errors.notEditable'
		);
};

export async function prepareFrames(
	projectId: string,
	itemId: string,
	anim: string,
	files: FramesFile[]
): Promise<PreparedFrames> {
	assertEditable(projectId);
	const { rec, project } = await loadProject(projectId);
	const m = rec.manifest,
		item = m.items.find((i) => i.id === itemId);
	if (!item || !m.rig.animations.some((a) => a.id === anim))
		throw new LocalizedError('This item or move no longer exists.', 'fixFrames.errors.targetGone');
	const isBase = item.id === m.rig.baseItem;
	const { sheets, ignored } = await readFrameFiles(project, item, anim, files);
	const plan = await planFrames(project, itemId, anim, sheets, {
		mark: isBase ? regionMarker(project, anim) : undefined,
		colorKey: isBase && item.regions ? (c) => (isGarment(c) ? c & ~1 : c) : undefined
	});
	const fitted = isBase
		? m.items
				.filter((i) => i.id !== item.id && !i.variantOf && i.baseHash === m.rig.baseHash)
				.map((i) => i.name)
		: [];
	return { projectId, rec, project, plan, ignored, fitted };
}

const changedSince = () =>
	new LocalizedError(
		'These frames changed since your review. Import the file again.',
		'fixFrames.errors.changed'
	);

async function blobsOf(images: Map<Sha256, Img>) {
	const blobs = new Map<string, Blob>();
	for (const [h, im] of images)
		blobs.set(
			h.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	return blobs;
}

/** The record with a new body item: the standing view follows the bound Default frame (back to what a reverted import
 *  found, or on to new art; an erased frame keeps the last art), the items fitted to the old body move to the new one, and
 *  a matching move-recovery receipt stays matching (as saveSplit does). */
export async function bodyRecord(
	original: StoredProject,
	base: Item,
	reverted: FrameHistory[] = []
): Promise<StoredProject> {
	const next = structuredClone(original),
		m = next.manifest,
		{ rig } = m,
		index = m.items.findIndex((i) => i.id === rig.baseItem),
		before = m.items[index];
	const receiptMatches =
		next.moveRecovery?.bodyRigVersion === rigArtworkVersion(rig, next.character);
	for (const d of rig.directions) {
		const rest = rig.rest?.[d.id];
		if (!rest) continue;
		const back = reverted.find(
			(h) => h.anim === DEFAULT_MOVE && h.first.dir === d.id && h.first.rest !== undefined
		);
		if (back) {
			// Only a standing view this frame's own history set goes back; one Directions rebuilt since stays.
			if (standingHistory(before, d.id).has(rest.image)) rest.image = back.first.rest!;
			continue;
		}
		const old = before.layers[0].cells?.[DEFAULT_MOVE]?.[d.id]?.[0] ?? null,
			now = base.layers[0].cells?.[DEFAULT_MOVE]?.[d.id]?.[0] ?? null;
		if (now && rest.image !== now && standingBound(before, d.id, rest.image, old)) rest.image = now;
	}
	m.items[index] = structuredClone(base);
	const oldHash = rig.baseHash;
	rig.baseHash = await baseHashOf(rig, storedCellHashes(rig, base.layers[0].cells));
	for (const it of m.items) if (it.baseHash === oldHash) it.baseHash = rig.baseHash;
	if (receiptMatches && next.moveRecovery)
		next.moveRecovery = {
			...next.moveRecovery,
			bodyRigVersion: rigArtworkVersion(rig, next.character)
		};
	next.savedAt = new Date().toISOString();
	return next;
}

async function saveTarget(
	projectId: string,
	rec: StoredProject,
	item: Item,
	images: Map<Sha256, Img>,
	stored: Sha256[],
	reverted: FrameHistory[] = []
) {
	assertEditable(projectId);
	const missing = () =>
		new LocalizedError(
			'The original frames are not saved in this copy of the character.',
			'fixFrames.errors.originalsMissing'
		);
	if (item.id === rec.manifest.rig.baseItem) {
		const next = await bodyRecord(rec, item, reverted);
		// Standing views the save changes must be stored, like the frames it points back to.
		const standing = Object.entries(next.manifest.rig.rest ?? {}).flatMap(([dir, view]) =>
			view && view.image !== rec.manifest.rig.rest?.[dir as DirectionName]?.image
				? [view.image]
				: []
		);
		for (const h of new Set([...stored, ...standing]))
			if (!images.has(h) && !(await getBlob(h.slice(7)))) throw missing();
		await db.saveIdleCharacter(rec, next, await blobsOf(images), 'replace body frames of');
	} else {
		const version = itemVersion(rec, item.id);
		await saveItem(
			projectId,
			item,
			images,
			[],
			(current) => {
				if (itemVersion(current, item.id) !== version) throw changedSince();
			},
			stored.length ? { keys: new Set(stored.map((h) => h.slice(7))), missing } : undefined
		);
	}
	for (const [h, im] of images) rememberDecoded(h, im);
}

/** Save a reviewed import; returns its id, which Undo names so it never reverts a later import. */
export async function saveFrames(prepared: PreparedFrames): Promise<string> {
	const { projectId, rec, project, plan } = prepared;
	if (!plan.changed.length) throw new Error('No frames changed');
	const id = crypto.randomUUID();
	await saveTarget(projectId, rec, applyPlan(project, plan, id), plan.images, []);
	return id;
}

/** Undo the latest import of an item's frames, or restore all its edited frames to their originals. */
export async function revertFrames(
	projectId: string,
	itemId: string,
	how: { undo: string } | 'restore'
): Promise<number> {
	assertEditable(projectId);
	const { rec } = await loadProject(projectId);
	const item = rec.manifest.items.find((i) => i.id === itemId);
	const result =
		item &&
		(how === 'restore'
			? restoreOriginals(rec.manifest, item)
			: undoLast(rec.manifest, item, how.undo));
	if (!result)
		throw new LocalizedError(
			'These frames were changed again since, so there is nothing to undo here.',
			'fixFrames.errors.nothingToRevert'
		);
	// Originals come back from storage (possibly from an imported archive): each must be a PNG of its layer's frame size.
	const layers = new Map(item!.layers.map((l) => [l.id, layerFrame(rec.manifest.rig, l)]));
	for (const { layer, hash } of result.writes) {
		const blob = await getBlob(hash.slice(7));
		if (!blob) continue; // saveTarget refuses missing originals in the same write
		const size = pngSize(new Uint8Array(await blob.arrayBuffer())),
			frame = layers.get(layer);
		if (!size || !frame || size.w !== frame.w || size.h !== frame.h)
			throw new LocalizedError(
				'The original frames in this copy of the character cannot be used, so nothing was changed.',
				'fixFrames.errors.originalsUnusable'
			);
	}
	await saveTarget(
		projectId,
		rec,
		result.item,
		new Map(),
		result.writes.map((w) => w.hash),
		result.frames
	);
	return result.count;
}
