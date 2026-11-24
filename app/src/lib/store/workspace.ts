import { layerFrame } from '../compose/compose.ts';
import { pngSize } from '../image/png.ts';
import { decodePngBytes } from '../image/pngraw.ts';
import { cellHash, pinnedArtwork } from '../rig/rig.ts';
import { readWorkspaceSnapshot } from './db.ts';
import { manifestShape } from './import.ts';
import { replayable } from '../frames/history.ts';
import {
	supportedFormat,
	type ItemFrameEdit,
	type ItemPaletteRepair,
	type Manifest
} from './manifest.ts';
import type { StoredProject } from './project.ts';
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, zip } from './zip.ts';
import { LocalizedError } from '../message.ts';

const hashPattern = /^(?:sha256:)?([a-f0-9]{64})$/;
const maxRecords = 500;
const maxPixels = 64 * 1024 * 1024;
/** Thrown past the artwork budget: each archive reports it in its own words. */
class ArtworkLimitError extends Error {}

/** The errors an archive format reports in its own words, so the shared reading and packing below serve each format. */
export interface ArchiveErrors {
	invalidIndex: () => LocalizedError;
	duplicateRecord: () => LocalizedError;
	missingFiles: () => LocalizedError;
	unexpectedFile: () => LocalizedError;
	tooLarge: () => LocalizedError;
	containsKey: () => LocalizedError;
}

/** What Open backup as a copy shows about the file it opened. */
export interface CopyArchive {
	build: string;
	projects: Map<string, unknown>;
	blobs: Map<string, Blob>;
	/** Artwork the characters reference that the file lacks or that failed verification. */
	missing: string[];
	/** Characters left out because they failed validation. */
	omitted?: number;
}

const object = (value: unknown): Record<string, unknown> | undefined =>
	value !== null && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined;

/** A saved Studio character (developer rigs stay out of every archive). */
export const studioCharacter = (key: string, value: unknown) =>
	key.startsWith('rig-') && (value as Partial<StoredProject> | undefined)?.origin === 'studio';

type FrameSize = { w: number; h: number };
/** Characters an archive left out because they failed validation. */
type Omitted = { characters: number };

/** Every artwork reference of a character, Undo history included, with the frame size it must have when the reference fixes
 *  one. */
export function* artworkRefs(manifest: Manifest): Generator<[unknown, FrameSize | undefined]> {
	for (const pose of Object.values(manifest.rig.rest ?? {})) yield [pose?.image, manifest.rig.cell];
	for (const hash of pinnedArtwork(manifest.rig)) yield [hash, manifest.rig.cell];
	for (const item of manifest.items) {
		for (const hash of Object.values(item.dressed ?? {})) yield [hash, undefined];
		for (const layer of item.layers) {
			const frame = layerFrame(manifest.rig, layer);
			for (const dirs of Object.values(layer.cells ?? {}))
				for (const cells of Object.values(dirs ?? {}))
					for (const hash of cells ?? []) yield [hash, frame];
		}
		for (const edit of item.frameEdits ?? [])
			for (const frame of edit.frames) {
				if (frame.rest) yield [frame.rest, manifest.rig.cell];
				for (const layer of frame.layers) {
					if (layer.before) yield [layer.before, undefined];
					if (layer.after) yield [layer.after, undefined];
				}
			}
		for (const repair of item.paletteRepairs ?? [])
			for (const frame of repair.frames)
				for (const layer of frame.layers) {
					yield [layer.before, undefined];
					yield [layer.after, undefined];
				}
	}
}

/** Drop the Undo history (Fix frames edits and palette repairs) that is malformed or whose artwork `has` lacks, frame by frame.
 *  Compose and export never read it, so a character stays whole without it, while a reference to absent artwork would leave
 *  every later archive of the character incomplete. Returns whether anything was dropped. */
export function pruneHistory(manifest: Manifest, has: (hex: string) => boolean): boolean {
	const available = (hash: unknown) => {
		const hex = typeof hash === 'string' && hashPattern.exec(hash)?.[1];
		return !!hex && has(hex);
	};
	const optional = (hash: unknown) => hash == null || available(hash);
	const layers = (value: unknown, kept: (layer: Record<string, unknown>) => boolean) =>
		Array.isArray(value) && value.every((layer) => !!object(layer) && kept(object(layer)!));
	let dropped = false;
	function prune<T extends { frames: unknown[] }>(
		list: unknown,
		valid: (entry: T) => boolean,
		keep: (frame: T['frames'][number]) => boolean
	): T[] | undefined {
		if (list === undefined) return undefined;
		const entries = Array.isArray(list) ? (list as unknown[]) : [];
		const out: T[] = [];
		for (const value of entries) {
			const entry = value as T;
			if (!object(value) || !Array.isArray(entry.frames) || !valid(entry)) continue;
			const frames = entry.frames.filter(keep);
			if (frames.length)
				out.push(frames.length === entry.frames.length ? entry : { ...entry, frames });
		}
		dropped ||=
			!Array.isArray(list) ||
			out.length !== entries.length ||
			out.some((entry, index) => entry !== entries[index]);
		return out;
	}
	for (const item of manifest.items) {
		const edits = prune<ItemFrameEdit>(
			item.frameEdits,
			replayable,
			(frame) =>
				optional(frame.rest) &&
				layers(frame.layers, (layer) => optional(layer.before) && optional(layer.after))
		);
		const repairs = prune<ItemPaletteRepair>(
			item.paletteRepairs,
			() => true,
			(frame) =>
				!!object(frame) &&
				layers(frame.layers, (layer) => available(layer.before) && available(layer.after))
		);
		if (edits) item.frameEdits = edits;
		if (repairs) item.paletteRepairs = repairs;
	}
	return dropped;
}

function recoverRecords(
	projects: Map<string, unknown>,
	omitted: Omitted,
	trimmed = new Set<string>()
) {
	const found = new Map<string, FrameSize | undefined>();
	for (const [key, value] of projects) {
		const local = new Map<string, FrameSize | undefined>();
		const add = (value: unknown, frame?: FrameSize) => {
			if (value == null) return;
			const hash = typeof value === 'string' && hashPattern.exec(value)?.[1];
			if (!hash) throw new Error('This archive has an invalid artwork reference.');
			const previous = local.get(hash) ?? found.get(hash);
			if (previous && frame && (previous.w !== frame.w || previous.h !== frame.h))
				throw new Error('This archive has conflicting artwork dimensions.');
			local.set(hash, frame ?? previous);
		};
		try {
			const record = value as StoredProject;
			const { id, manifest } = record;
			if (!studioCharacter(key, value) || id !== key || !supportedFormat(manifest?.format))
				throw new Error('Unsupported character record.');
			delete record.stateGenerations;
			manifestShape(manifest);
			if (pruneHistory(manifest, () => true)) trimmed.add(key);
			for (const [hash, frame] of artworkRefs(manifest)) add(hash, frame);
			for (const [hash, frame] of local) found.set(hash, frame);
		} catch {
			projects.delete(key);
			omitted.characters++;
		}
	}
	return found;
}

/** Prune the history of each validated character to the artwork `has` holds: every hash the characters still reference, and
 *  how many characters lost history. */
function prunedReferences(
	projects: Map<string, unknown>,
	has: (hash: string) => boolean,
	trimmed = new Set<string>()
) {
	const refs = new Set<string>();
	for (const [key, value] of projects) {
		if (!key.startsWith('rig-')) continue;
		const { manifest } = value as StoredProject;
		if (pruneHistory(manifest, has)) trimmed.add(key);
		for (const [hash] of artworkRefs(manifest)) {
			const hex = typeof hash === 'string' && hashPattern.exec(hash)?.[1];
			if (hex) refs.add(hex);
		}
	}
	return refs;
}

export const archiveBuild = () => `${__APP_VERSION__} (${__APP_COMMIT__})`;

/** Read the selected records and their artwork in one snapshot, verify both, and pack them with the index `write` names and
 *  makes. Records and artwork that fail verification are left out and reported, and the packed index never holds a key. */
export async function packArchive(
	select: (key: string, value: unknown) => boolean,
	keys: readonly string[],
	errors: ArchiveErrors,
	write: (contents: {
		projects: Map<string, unknown>;
		missing: string[];
		omitted?: Omitted;
	}) => [name: string, index: object],
	attachments: readonly { name: string; data: Uint8Array }[] = []
) {
	const omitted: Omitted = { characters: 0 };
	let references = new Map<string, FrameSize | undefined>();
	const snapshot = await readWorkspaceSnapshot(select, (projects) => {
		references = recoverRecords(projects, omitted);
		return references;
	});
	const { blobs, projects } = snapshot;
	if (projects.size > maxRecords) throw errors.tooLarge();
	for (const value of projects.values()) {
		const record = value as Partial<StoredProject>;
		delete record.creationSpec;
		delete record.moveRecovery;
		delete record.moveReviews;
	}
	const verified = new Map<string, Uint8Array>();
	let pixels = 0;
	for (const [hash, blob] of blobs) {
		if (blob.size > MAX_ZIP_BYTES) throw errors.tooLarge();
		const bytes = new Uint8Array(await blob.arrayBuffer());
		const size = await recoverArtwork(
			bytes,
			hash,
			maxPixels - pixels,
			references.get(hash),
			errors
		);
		if (size !== undefined) {
			pixels += size;
			verified.set(hash, bytes);
		}
	}
	// History whose artwork is gone from this device (or failed verification) is left out, so the archive never references
	// artwork it lacks and its own restore accepts it.
	const kept = prunedReferences(projects, (hash) => verified.has(hash));
	const artwork: { name: string; data: Uint8Array }[] = [];
	let artworkBytes = 0;
	for (const [hash, bytes] of verified) {
		if (!kept.has(hash)) continue;
		artworkBytes += bytes.length;
		if (artworkBytes > MAX_ZIP_BYTES || artwork.length + 2 > MAX_ZIP_ENTRIES)
			throw errors.tooLarge();
		artwork.push({ name: `blobs/${hash}`, data: bytes });
	}
	const missing = [...kept].filter((hash) => !verified.has(hash));
	const omissions = omitted.characters ? omitted : undefined;
	const [name, index] = write({ projects, missing, omitted: omissions });
	const json = JSON.stringify(index);
	if (
		keys.some(
			(key) => key && (json.includes(key) || json.includes(JSON.stringify(key).slice(1, -1)))
		)
	)
		throw errors.containsKey();
	const data = new TextEncoder().encode(json);
	if (
		missing.length > MAX_ZIP_ENTRIES ||
		artwork.length + attachments.length + 1 > MAX_ZIP_ENTRIES ||
		data.length + artworkBytes + attachments.reduce((sum, entry) => sum + entry.data.length, 0) >
			MAX_ZIP_BYTES
	)
		throw errors.tooLarge();
	const packed = await zip([{ name, data }, ...artwork, ...attachments]);
	if (packed.length > MAX_ZIP_BYTES) throw errors.tooLarge();
	return { bytes: packed, hasOmissions: !!omissions || !!missing.length, records: projects.size };
}

async function recoverArtwork(
	data: Uint8Array,
	hash: string,
	remaining: number,
	frame: FrameSize | undefined,
	errors: ArchiveErrors
) {
	try {
		return await verifyArtwork(data, hash, remaining, frame);
	} catch (error) {
		if (error instanceof ArtworkLimitError) throw errors.tooLarge();
		return undefined;
	}
}

async function verifyArtwork(
	data: Uint8Array,
	hash: string,
	remaining: number,
	frame?: FrameSize
): Promise<number> {
	const size = pngSize(data);
	if (!size || size.w < 1 || size.h < 1 || size.w > 2048 || size.h > 2048)
		throw new Error('This archive contains invalid artwork.');
	if (frame && (size.w !== frame.w || size.h !== frame.h))
		throw new Error('Archive artwork does not match its saved frame dimensions.');
	const pixels = size.w * size.h;
	if (pixels > remaining) throw new ArtworkLimitError();
	let actual: string;
	try {
		actual = await cellHash(await decodePngBytes(data));
	} catch (cause) {
		throw new Error('This archive contains an unreadable PNG.', { cause });
	}
	if (actual !== `sha256:${hash}`)
		throw new Error('Archive artwork does not match its saved pixel hash.');
	return pixels;
}

/** An archive index, refusing prototype keys. */
export function parseIndex(json: Uint8Array, errors: ArchiveErrors): unknown {
	try {
		return JSON.parse(
			new TextDecoder('utf-8', { fatal: true }).decode(json),
			(key, value: unknown) => {
				if (key === '__proto__') throw new Error('Unsafe property');
				return value;
			}
		);
	} catch (cause) {
		const error = errors.invalidIndex();
		error.cause = cause;
		throw error;
	}
}

/** The records of an index's `rows` (only `allowed` keys) and their verified artwork from `files`. Records that fail validation
 *  are left out and counted in `omitted`; artwork that fails verification is reported missing along with what `listed` names. */
export async function readArchiveFiles(
	files: Map<string, Uint8Array>,
	indexName: string,
	rows: unknown,
	listed: unknown,
	omitted: Omitted,
	allowed: (key: string) => boolean,
	errors: ArchiveErrors
) {
	if (
		!Array.isArray(rows) ||
		rows.length > maxRecords ||
		!Array.isArray(listed) ||
		listed.length > MAX_ZIP_ENTRIES
	)
		throw errors.invalidIndex();
	const projects = new Map<string, unknown>();
	for (const row of rows) {
		if (
			!Array.isArray(row) ||
			row.length !== 2 ||
			typeof row[0] !== 'string' ||
			!allowed(row[0]) ||
			projects.has(row[0])
		)
			throw errors.duplicateRecord();
		projects.set(row[0], row[1]);
	}
	const previousOmissions = omitted.characters;
	const trimmed = new Set<string>();
	const references = recoverRecords(projects, omitted, trimmed);
	// What a left-out character or dropped history referenced may still be listed or packed.
	const skippedCharacter = omitted.characters > previousOmissions || trimmed.size > 0;
	const absent = new Set<unknown>(listed);
	if (
		absent.size !== listed.length ||
		listed.some(
			(hash) =>
				typeof hash !== 'string' ||
				!/^[a-f0-9]{64}$/.test(hash) ||
				(!skippedCharacter && !references.has(hash))
		)
	)
		throw errors.missingFiles();
	const blobs = new Map<string, Blob>();
	let pixels = 0;
	for (const [path, data] of files) {
		if (path === indexName) continue;
		const hash = /^blobs\/([a-f0-9]{64})$/.exec(path)?.[1];
		if (!hash || (!skippedCharacter && !references.has(hash)) || absent.has(hash))
			throw errors.unexpectedFile();
		if (!references.has(hash)) continue;
		const verified = await recoverArtwork(
			data,
			hash,
			maxPixels - pixels,
			references.get(hash),
			errors
		);
		if (verified !== undefined) {
			pixels += verified;
			blobs.set(hash, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
		}
	}
	const refs = prunedReferences(projects, (hash) => blobs.has(hash), trimmed);
	return {
		projects,
		blobs,
		missing: [...refs].filter((hash) => !blobs.has(hash)),
		/** Characters restored without Undo history the file lacks or that was malformed. */
		trimmed: trimmed.size
	};
}
