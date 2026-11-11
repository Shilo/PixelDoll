// IndexedDB project records: projects/rig-<unique id> = { id, savedAt, manifest, skeletons, rigQa }.
// Cell PNGs live in `blobs` keyed by the RGBA sha256 hex (without "sha256:"). M3 adds accepted items to the same record.
import { decodePng, type Img } from '../image/png.ts';
import { encodePngBytes } from '../image/pngraw.ts';
import type { Skeleton } from '../rig/skeleton.ts';
import * as db from './db.ts';
import type { Item, Manifest, Preset, Project, Sha256, Slot } from './manifest.ts';
import { CURRENT_FORMAT, supportedFormat } from './manifest.ts';

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

const retiredDesign = (r: OutdatedCandidate) =>
	r.kind === 'equipment-design' || r.kind === 'equipment-fit-draft';
/** Earlier preview formats are never upgraded: delete their characters, demo outfits, retired shared-design and fit records
 * and an unfinished character creation saved before explicit direction plans (its paid pipeline is never re-keyed). Counts the
 * retired designs (and their fits) apart from the other records. */
export async function deleteOutdated(): Promise<{ designs: number; other: number }> {
	const formatOf = (r: OutdatedCandidate) =>
		retiredDesign(r)
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
	const designs = outdated.filter(retiredDesign).length;
	return { designs, other: outdated.length - designs };
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
		const b = await db.getBlob(h.slice(7));
		signal?.throwIfAborted();
		if (!b) throw new Error(`${owner}: cell blob ${h.slice(0, 19)} missing`);
		const image = await decodePng(b);
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

/** Add or replace an item (same id) and insert its slot in ladder order if missing. */
export function putItem(m: Manifest, item: Item, ladder: Slot[]) {
	m.items = [...m.items.filter((i) => i.id !== item.id), item];
	if (!m.slots.some((s) => s.id === item.slot)) {
		const order = (s: string) => ladder.findIndex((x) => x.id === s);
		m.slots = [...m.slots, ladder.find((s) => s.id === item.slot)!].sort(
			(a, b) => order(a.id) - order(b.id)
		);
	}
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
