// IndexedDB project records: projects/rig-<unique id> = { id, savedAt, manifest, skeletons, rigQa }.
// Cell PNGs live in `blobs` keyed by the RGBA sha256 hex (without "sha256:"). M3 adds accepted items to the same record.
import { decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import { copyMissingArtwork } from './workspace-mode.ts';
import type { Skeleton } from '../rig/skeleton.ts';
import { pinnedArtwork } from '../rig/rig.ts';
import * as db from './db.ts';
import type { Item, Manifest, Preset, Project, Sha256, Slot } from './manifest.ts';
import { supportedFormat } from './manifest.ts';
import { putItem } from '../items/items.ts';
import { defaultCharacterExportId, newItemExportId } from './identity.ts';

export interface StoredProject {
	id: string;
	savedAt: string;
	creationSpec?: string; // internal creation-attempt fingerprint; never exported or used as clone identity
	moveReviews?: Record<string, import('../../studio/replaceMove.ts').MoveCandidate>;
	stateGeneration?: import('../../studio/stateGeneration.ts').StateAttempt;
	managedStates?: Record<string, string>;
	moveRecovery?: {
		id: string;
		originalRigVersion: string;
		bodyRigVersion: string;
		specHash: string;
	}; // internal atomic body-publication receipt; never exported
	manifest: Manifest;
	skeletons?: Record<string, Skeleton>; // cell key -> keypoints (mirrored cells flipped)
	rigQa?: unknown;
	character?: { id: string; looks: string };
	/** Set by a restore: the backup's character ID and content fingerprint, so restoring that backup again can tell an
	 *  untouched copy (skipped) from one edited since (explained before another copy is added). */
	restoredFrom?: RestoredFrom;
	origin: 'studio' | 'dev'; // T2: who made it; the Studio's character menu lists only 'studio' rigs (dev rigs: dev pages)
}

export interface RestoredFrom {
	id: string;
	fingerprint: string;
	copyFingerprint?: string;
	/** When it was restored, and the build that made the file. */
	at: string;
	build: string;
}

export const OUTDATED =
	'This character was saved by an earlier preview version and is no longer supported.';

export const listProjects = async () =>
	(await db.all<StoredProject>('projects')).filter(
		(p) => supportedFormat(p?.manifest?.format) && p.id?.startsWith('rig-')
	);

// Decoded cells by content hash, shared by every read: a character's thumbnail and its later open (and every reopen) decode
// each cell once. Safe because a hash names exact pixels and cells are never changed in place (edits make new images). Past
// the budget the least recently used are dropped and decoded again when needed.
const DECODED_BUDGET = 96 * 1024 * 1024;
const decoded = new Map<Sha256, Img>();
let decodedBytes = 0;
/** Also for cells made and saved here, so the next load does not read them back. */
export function rememberDecoded(h: Sha256, image: Img) {
	if (decoded.delete(h)) decodedBytes -= image.data.length;
	decoded.set(h, image);
	decodedBytes += image.data.length;
	for (const [k, old] of decoded) {
		if (decodedBytes <= DECODED_BUDGET) break;
		decoded.delete(k);
		decodedBytes -= old.data.length;
	}
}
export function getDecoded(h: Sha256): Img | undefined {
	const image = decoded.get(h);
	if (image) rememberDecoded(h, image);
	return image;
}
/** Shared work keeps going for other callers; an abandoned caller stops waiting for it at once. */
export function untilAborted<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
	if (!signal) return work;
	signal.throwIfAborted();
	return new Promise<T>((resolve, reject) => {
		const stop = () => reject(signal.reason);
		signal.addEventListener('abort', stop, { once: true });
		work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
	});
}
// Loads that need the same cell at once share one read; one no load still waits for stops before decoding.
const cellReads = new Map<Sha256, { work: Promise<Img>; waiting: number }>();
async function decodeCell(h: Sha256, owner: string, signal?: AbortSignal): Promise<Img> {
	const known = getDecoded(h);
	if (known) return known;
	let read = cellReads.get(h);
	if (!read) {
		const started = { work: Promise.resolve() as unknown as Promise<Img>, waiting: 0 };
		started.work = (async () => {
			const b = await db.getBlob(h.slice(7));
			if (!started.waiting) {
				// Retire it now, so a load arriving before this rejection settles starts a fresh read.
				if (cellReads.get(h) === started) cellReads.delete(h);
				throw new DOMException('No load needs this cell any more', 'AbortError');
			}
			if (!b) throw new Error(`${owner}: cell blob ${h.slice(0, 19)} missing`);
			const image = await decodePng(b);
			rememberDecoded(h, image);
			return image;
		})().finally(() => {
			if (cellReads.get(h) === started) cellReads.delete(h);
		});
		// Every waiting load reports a failure; one all of them abandoned has no one to tell.
		started.work.catch(() => undefined);
		cellReads.set(h, started);
		read = started;
	}
	read.waiting++;
	try {
		return await untilAborted(read.work, signal);
	} finally {
		read.waiting--;
	}
}

/** Decode one stored image a loaded project leaves out (Fix frames and palette history). */
export const readStoredImage = (h: Sha256) => decodeCell(h, 'saved artwork');

/** Decode every cell referenced by the manifest's layers (and the v1.3 rest views) into Project.images. */
export async function loadProject(
	id: string,
	signal?: AbortSignal,
	{ allowMissingImages = false } = {}
): Promise<{ rec: StoredProject; project: Project; missingImages?: number }> {
	signal?.throwIfAborted();
	const rec = await db.get<StoredProject>('projects', id);
	signal?.throwIfAborted();
	if (!rec) throw new Error(`project ${id} not found`);
	if (!supportedFormat(rec.manifest?.format)) throw new Error(OUTDATED);
	rec.manifest.exportId ??= defaultCharacterExportId(id);
	const images = new Map<string, Img>();
	const missing = new Set<string>();
	let damagedTrack = false;
	const add = async (h: Sha256 | null | undefined, owner: string) => {
		signal?.throwIfAborted();
		if (!h || images.has(h) || missing.has(h)) return;
		if (copyMissingArtwork.has(h)) {
			missing.add(h);
			return;
		}
		let image: Img;
		try {
			image = await decodeCell(h, owner, signal);
		} catch (error) {
			if (!allowMissingImages || signal?.aborted) throw error;
			console.warn('Could not read saved artwork for export', error);
			missing.add(h);
			return;
		}
		signal?.throwIfAborted();
		images.set(h, image);
	};
	for (const v of Object.values(rec.manifest.rig.rest ?? {})) await add(v?.image, 'rest view');
	for (const hash of pinnedArtwork(rec.manifest.rig)) await add(hash, 'move source');
	for (const it of rec.manifest.items) {
		for (const h of Object.values(it.dressed ?? {})) await add(h, `${it.id} dressed view`);
		if (allowMissingImages && !Array.isArray(it.layers)) {
			damagedTrack = true;
			continue;
		}
		for (const l of it.layers)
			for (const dirs of Object.values(l.cells ?? {}))
				for (const cells of Object.values(dirs ?? {})) {
					if (allowMissingImages && cells != null && !Array.isArray(cells)) {
						damagedTrack = true;
						continue;
					}
					for (const h of cells ?? []) await add(h, it.id);
				}
	}
	signal?.throwIfAborted();
	return {
		rec,
		project: { manifest: rec.manifest, images },
		...(missing.size || damagedTrack ? { missingImages: missing.size + Number(damagedTrack) } : {})
	};
}

/**
 * Add or replace an item (same id) in the project record, store its cell PNGs, and insert its slot (ladder order) if missing.
 * Publish blobs and references in one transaction, so garbage collection cannot sweep the gap between them.
 */
export async function saveItem(
	id: string,
	item: Item,
	images: Map<Sha256, Img>,
	ladder: Slot[],
	check?: (rec: StoredProject) => void,
	stored?: Parameters<typeof db.updateCharacter>[3]
): Promise<void> {
	const blobs = new Map<string, Blob>();
	for (const [h, im] of images)
		blobs.set(
			h.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	await db.updateCharacter<StoredProject>(
		id,
		blobs,
		(rec) => {
			if (!rec) throw new Error(`project ${id} not found`);
			check?.(rec);
			const previous = rec.manifest.items.find((entry) => entry.id === item.id);
			const next = {
				...item,
				name: previous?.name ?? item.name,
				exportId: previous ? previous.exportId : newItemExportId(rec.manifest.items, item.id)
			};
			putItem(rec.manifest, next, ladder);
			rec.savedAt = new Date().toISOString();
			return rec;
		},
		stored
	);
}

export type DressedRecord = StoredProject & {
	dress?: { current?: Pick<Preset, 'items' | 'variants'> };
};

/** Remove items with their materials (links to them dropped), outfit entries and color choices. The base is never removed. */
function removeItems(rec: DressedRecord, itemIds: ReadonlySet<string>) {
	const m = rec.manifest;
	const materials = new Set(m.materials.filter((x) => itemIds.has(x.owner)).map((x) => x.id));
	m.items = m.items.filter((i) => i.id === m.rig.baseItem || !itemIds.has(i.id));
	m.materials = m.materials.filter((x) => !materials.has(x.id));
	for (const mat of m.materials) if (mat.linkTo && materials.has(mat.linkTo)) delete mat.linkTo;
	for (const preset of [...m.presets, ...(rec.dress?.current ? [rec.dress.current] : [])]) {
		for (const slot of Object.keys(preset.items))
			if (itemIds.has(preset.items[slot]!)) preset.items[slot] = null;
		for (const material of materials) delete preset.variants[material];
	}
	rec.savedAt = new Date().toISOString();
}

export async function deleteItem(id: string, itemId: string): Promise<void> {
	await db.update<DressedRecord>('projects', id, (rec) => {
		if (!rec) throw new Error(`project ${id} not found`);
		if (itemId !== rec.manifest.rig.baseItem) removeItems(rec, new Set([itemId]));
		return rec;
	});
}

/** Delete exactly these items and finish the change in one transaction: nothing is written unless every item is still saved
 *  (and none is the base) and `finish` accepts the record, so a refusal leaves every item in place. */
export async function deleteItems(
	id: string,
	itemIds: readonly string[],
	finish: (rec: DressedRecord) => void
): Promise<void> {
	await db.update<DressedRecord>('projects', id, (rec) => {
		if (!rec) throw new Error(`project ${id} not found`);
		const m = rec.manifest,
			saved = new Set(m.items.map((i) => i.id));
		if (itemIds.some((i) => i === m.rig.baseItem || !saved.has(i)))
			throw new Error('Its items changed meanwhile. Review it again before deleting.');
		removeItems(rec, new Set(itemIds));
		finish(rec);
		return rec;
	});
}
