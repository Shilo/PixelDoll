// IndexedDB project records: projects/rig-<unique id> = { id, savedAt, manifest, skeletons, rigQa }.
// Cell PNGs live in `blobs` keyed by the RGBA sha256 hex (without "sha256:"). M3 adds accepted items to the same record.
import { decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Skeleton } from '../rig/skeleton.ts';
import * as db from './db.ts';
import type { Item, Manifest, Preset, Project, Sha256, Slot } from './manifest.ts';
import { CURRENT_FORMAT, supportedFormat } from './manifest.ts';
import { putItem } from '../items/items.ts';

export interface StoredProject {
	id: string;
	savedAt: string;
	creationSpec?: string; // internal creation-attempt fingerprint; never exported or used as clone identity
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
	origin: 'studio' | 'dev'; // T2: who made it; the Studio's character menu lists only 'studio' rigs (dev rigs: dev pages)
}

export const OUTDATED =
	'This character was saved by an earlier preview version and is no longer supported.';

/** Earlier preview formats are never upgraded: delete their characters, demo outfits, retired shared-design and fit records
 * and an unfinished character creation saved before explicit direction plans (its paid pipeline is never re-keyed). */
export async function deleteOutdated(): Promise<number> {
	const formatOf = (r: OutdatedCandidate) =>
		r.kind === 'equipment-design' || r.kind === 'equipment-fit-draft'
			? undefined
			: r.kind === 'dress' || r.manifest
				? (r.format ?? r.manifest?.format)
				: r.id === 'studio-create' && !Array.isArray(r.spec?.directions)
					? undefined
					: CURRENT_FORMAT;
	const outdated = (await db.all<OutdatedCandidate>('projects')).filter(
		(r) => typeof r?.id === 'string' && formatOf(r) !== CURRENT_FORMAT
	);
	for (const r of outdated) await db.del('projects', r.id);
	// Drafts of a removed character would only fail to reopen it: they go with it, as when a character is deleted.
	const gone = new Set(outdated.map((r) => r.id));
	if (gone.size)
		for (const r of await db.all<{ id: string }>('projects')) {
			const change = db.withoutCharacters(r, gone);
			if (change) await db.put('projects', r.id, change);
		}
	return outdated.length;
}
interface OutdatedCandidate {
	id: string;
	kind?: string;
	format?: string;
	manifest?: { format?: string };
	spec?: { directions?: unknown };
}

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
	const known = decoded.get(h);
	if (known) {
		rememberDecoded(h, known);
		return known;
	}
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

/** Decode every cell referenced by the manifest's layers (and the v1.3 rest views) into Project.images. */
export async function loadProject(
	id: string,
	signal?: AbortSignal
): Promise<{ rec: StoredProject; project: Project }> {
	signal?.throwIfAborted();
	const rec = await db.get<StoredProject>('projects', id);
	signal?.throwIfAborted();
	if (!rec) throw new Error(`project ${id} not found`);
	if (!supportedFormat(rec.manifest?.format)) throw new Error(OUTDATED);
	const images = new Map<string, Img>();
	const add = async (h: Sha256 | null | undefined, owner: string) => {
		signal?.throwIfAborted();
		if (!h || images.has(h)) return;
		const image = await decodeCell(h, owner, signal);
		signal?.throwIfAborted();
		images.set(h, image);
	};
	for (const v of Object.values(rec.manifest.rig.rest ?? {})) await add(v?.image, 'rest view');
	for (const it of rec.manifest.items) {
		for (const h of Object.values(it.dressed ?? {})) await add(h, `${it.id} dressed view`);
		for (const l of it.layers)
			for (const dirs of Object.values(l.cells ?? {}))
				for (const cells of Object.values(dirs ?? {}))
					for (const h of cells ?? []) await add(h, it.id);
	}
	signal?.throwIfAborted();
	return { rec, project: { manifest: rec.manifest, images } };
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
	check?: (rec: StoredProject) => void
): Promise<void> {
	const blobs = new Map<string, Blob>();
	for (const [h, im] of images)
		blobs.set(
			h.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	await db.updateCharacter<StoredProject>(id, blobs, (rec) => {
		if (!rec) throw new Error(`project ${id} not found`);
		check?.(rec);
		putItem(rec.manifest, item, ladder);
		rec.savedAt = new Date().toISOString();
		return rec;
	});
}

export async function deleteItem(id: string, itemId: string): Promise<void> {
	await db.update<StoredProject & { dress?: { current?: Pick<Preset, 'items' | 'variants'> } }>(
		'projects',
		id,
		(rec) => {
			if (!rec) throw new Error(`project ${id} not found`);
			const m = rec.manifest;
			if (itemId === m.rig.baseItem) return rec;
			const materials = new Set(m.materials.filter((x) => x.owner === itemId).map((x) => x.id));
			m.items = m.items.filter((i) => i.id !== itemId);
			m.materials = m.materials.filter((x) => !materials.has(x.id));
			for (const mat of m.materials) if (mat.linkTo && materials.has(mat.linkTo)) delete mat.linkTo;
			for (const preset of [...m.presets, ...(rec.dress?.current ? [rec.dress.current] : [])]) {
				for (const slot of Object.keys(preset.items))
					if (preset.items[slot] === itemId) preset.items[slot] = null;
				for (const material of materials) delete preset.variants[material];
			}
			rec.savedAt = new Date().toISOString();
			return rec;
		}
	);
}
