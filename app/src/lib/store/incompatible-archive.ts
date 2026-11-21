// Saved data from earlier preview versions (incompatible.ts), packed exactly as stored: for the user's private download and
// as an opaque, separate payload a workspace backup can carry. It is never opened, upgraded or edited here. A pack holds only
// incompatible projects-store records and the blobs they mention, never jobs, live drafts, settings or credentials, and a
// record that JSON cannot keep exactly fails the whole pack instead of being changed or left out.
import { LocalizedError } from '../message.ts';
import * as db from './db.ts';
import {
	blobReferences,
	CREATE_DRAFT_PREFIX,
	incompatibleCounts,
	incompatibleKind,
	type IncompatibleCounts,
	type IncompatibleKind
} from './incompatible.ts';
import { MAX_ZIP_BYTES, MAX_ZIP_ENTRIES, unzip, zip } from './zip.ts';

const format = 'pixeldoll-incompatible/1';
const indexPath = 'incompatible.json';
const blobPath = /^blobs\/([0-9a-f]{64})$/;
const blobKey = /^[0-9a-f]{64}$/;
const maxBuild = 100;
const maxType = 255;

interface Index {
	format: typeof format;
	build: string;
	/** [store key, record exactly as stored] */
	records: [string, unknown][];
	/** [blob key, Blob type]; the bytes are blobs/<key> */
	blobs: [string, string][];
	/** Blob keys the records mention that were not stored. */
	missing: string[];
}

export interface IncompatibleData {
	records: Map<string, unknown>;
	blobs: Map<string, Blob>;
	missing: string[];
	counts: IncompatibleCounts;
}

const unsupported = (path: string) =>
	Object.assign(
		new LocalizedError(
			'Saved data from an earlier version holds a value this download cannot keep exactly, so nothing was downloaded.',
			'incompatible.error.unsupported'
		),
		{ cause: `at ${path}` }
	);
const tooLarge = () =>
	new LocalizedError(
		'Saved data from earlier versions is too large for one ZIP, so nothing was downloaded.',
		'incompatible.error.tooLarge'
	);
const invalid = (cause?: unknown) =>
	Object.assign(
		new LocalizedError(
			'The saved data from earlier versions in this file is damaged or unsupported.',
			'incompatible.error.invalid'
		),
		cause === undefined ? {} : { cause }
	);

/** Each kind keeps to the keys its earlier version used, so a carried record can never land on a key this version reads
 *  as live state (drafts, moves, setup, settings) and be run. */
const KEYS: Record<IncompatibleKind, (key: string) => boolean> = {
	characters: (key) => key.startsWith('rig-'),
	outfits: (key) => key.startsWith('dress-'),
	creations: (key) => key === 'studio-create' || key.startsWith(CREATE_DRAFT_PREFIX),
	retired: (key) => key.startsWith('equipment-')
};
const carried = (key: string, value: unknown) => {
	const kind = incompatibleKind(value);
	return !!kind && (value as { id: string }).id === key && KEYS[kind](key);
};

/** JSON keeps this value exactly: plain objects and dense arrays of strings, finite numbers (not -0), booleans and null,
 *  without cycles. Anything else (undefined, Blob, Date, typed arrays, Map, a "__proto__" key...) is refused. */
function checkLossless(value: unknown, path: string, open = new Set<object>()): void {
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
	if (typeof value === 'number') {
		if (Number.isFinite(value) && !Object.is(value, -0)) return;
		throw unsupported(path);
	}
	if (typeof value !== 'object' || open.has(value)) throw unsupported(path);
	const array = Array.isArray(value),
		proto = Object.getPrototypeOf(value);
	const keys = Object.keys(value);
	if (
		(!array && proto !== Object.prototype && proto !== null) ||
		Object.getOwnPropertySymbols(value).length ||
		(array &&
			(keys.length !== (value as unknown[]).length || keys.some((key, i) => key !== String(i))))
	)
		throw unsupported(path);
	open.add(value);
	for (const key of keys) {
		if (key === '__proto__') throw unsupported(path);
		checkLossless((value as Record<string, unknown>)[key], `${path}.${key}`, open);
	}
	open.delete(value);
}

/** Throws when the text holds the connected or remembered PixelLab key (as the workspace export does). */
function refuseKeys(json: string, keys: readonly string[]) {
	if (
		keys.some(
			(key) => key && (json.includes(key) || json.includes(JSON.stringify(key).slice(1, -1)))
		)
	)
		throw new LocalizedError(
			'A saved field contains the connected or remembered PixelLab key. Remove it from the workspace before exporting.',
			'workspace.error.containsKey'
		);
}

/** How many incompatible records are stored, by kind, for the user to see. */
export async function storedIncompatibleCounts(): Promise<IncompatibleCounts> {
	return incompatibleCounts(await db.all('projects'));
}

/**
 * Pack every stored incompatible record and the blobs it mentions, read in one transaction, as one ZIP: the user's private
 * download, and the separate payload a workspace backup carries. Undefined when nothing is stored. Throws, packing
 * nothing, when a record cannot be kept exactly, the pack exceeds the ZIP limits or it would hold a PixelLab key.
 */
export async function packIncompatible(
	keys: readonly string[]
): Promise<{ bytes: Uint8Array; counts: IncompatibleCounts; missing: number } | undefined> {
	const { projects, blobs } = await db.readWorkspaceSnapshot(
		(_key, value) => !!incompatibleKind(value),
		(records) =>
			new Map([...blobReferences(records.values())].map((hash) => [hash, true] as const)),
		false
	);
	if (!projects.size) return undefined;
	if (projects.size > MAX_ZIP_ENTRIES) throw tooLarge();
	for (const [key, value] of projects) {
		if (!carried(key, value)) throw unsupported(key);
		checkLossless(value, key);
	}
	const references = blobReferences(projects.values());
	const files: { name: string; data: Uint8Array }[] = [];
	const types: [string, string][] = [];
	let bytes = 0;
	for (const [hash, blob] of blobs) {
		if (blob.type.length > maxType) throw unsupported(`blob ${hash}`);
		bytes += blob.size;
		if (bytes > MAX_ZIP_BYTES || files.length + 2 > MAX_ZIP_ENTRIES) throw tooLarge();
		files.push({ name: `blobs/${hash}`, data: new Uint8Array(await blob.arrayBuffer()) });
		types.push([hash, blob.type]);
	}
	const index: Index = {
		format,
		build: `${__APP_VERSION__} (${__APP_COMMIT__})`.slice(0, maxBuild),
		records: [...projects],
		blobs: types,
		missing: [...references].filter((hash) => !blobs.has(hash))
	};
	const json = JSON.stringify(index);
	refuseKeys(json, keys);
	const data = new TextEncoder().encode(json);
	if (data.length + bytes > MAX_ZIP_BYTES) throw tooLarge();
	const packed = await zip([{ name: indexPath, data }, ...files]);
	if (packed.length > MAX_ZIP_BYTES) throw tooLarge();
	return {
		bytes: packed,
		counts: incompatibleCounts(projects.values()),
		missing: index.missing.length
	};
}

/**
 * Read a pack back, only when the user chose to restore saved data from earlier versions. Every record must be one this
 * version classifies as incompatible, under the key its kind uses, so none can be opened or run; every file must be a blob
 * a record mentions. The result is to be stored as it is, never edited. Throws on anything else.
 */
export async function unpackIncompatible(
	bytes: Uint8Array,
	options: { userOptIn: true },
	keys: readonly string[]
): Promise<IncompatibleData> {
	if (options?.userOptIn !== true)
		throw new Error('Saved data from earlier versions is restored only when the user chooses it.');
	return inspectIncompatible(bytes, keys);
}

export async function inspectIncompatible(
	bytes: Uint8Array,
	keys: readonly string[]
): Promise<IncompatibleData> {
	const files = await unzip(bytes);
	const json = files.get(indexPath);
	if (!json) throw invalid();
	let text: string, index: Index;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(json);
		index = JSON.parse(text, (key, value: unknown) => {
			if (key === '__proto__') throw new Error('Unsafe property');
			return value;
		});
	} catch (cause) {
		throw invalid(cause);
	}
	if (
		index?.format !== format ||
		typeof index.build !== 'string' ||
		index.build.length > maxBuild ||
		!Array.isArray(index.records) ||
		!index.records.length ||
		index.records.length > MAX_ZIP_ENTRIES ||
		!Array.isArray(index.blobs) ||
		!Array.isArray(index.missing) ||
		index.blobs.length + index.missing.length > MAX_ZIP_ENTRIES
	)
		throw invalid();
	refuseKeys(text, keys);
	const records = new Map<string, unknown>();
	for (const row of index.records) {
		if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string') throw invalid();
		const [key, value] = row as [string, unknown];
		if (records.has(key) || !carried(key, value)) throw invalid();
		try {
			checkLossless(value, key);
		} catch (cause) {
			throw invalid(cause);
		}
		records.set(key, value);
	}
	const references = blobReferences(records.values());
	const listed = new Set<string>();
	const blobs = new Map<string, Blob>();
	for (const row of index.blobs) {
		if (
			!Array.isArray(row) ||
			row.length !== 2 ||
			typeof row[0] !== 'string' ||
			!blobKey.test(row[0]) ||
			typeof row[1] !== 'string' ||
			row[1].length > maxType ||
			listed.has(row[0]) ||
			!references.has(row[0])
		)
			throw invalid();
		const data = files.get(`blobs/${row[0]}`);
		if (!data) throw invalid();
		listed.add(row[0]);
		blobs.set(row[0], new Blob([data as Uint8Array<ArrayBuffer>], { type: row[1] }));
	}
	for (const hash of index.missing) {
		if (
			typeof hash !== 'string' ||
			!blobKey.test(hash) ||
			listed.has(hash) ||
			!references.has(hash)
		)
			throw invalid();
		listed.add(hash);
	}
	for (const path of files.keys()) {
		const hash = blobPath.exec(path)?.[1];
		if (path !== indexPath && (!hash || !blobs.has(hash))) throw invalid();
	}
	if (listed.size !== references.size) throw invalid();
	return {
		records,
		blobs,
		missing: [...index.missing],
		counts: incompatibleCounts(records.values())
	};
}
