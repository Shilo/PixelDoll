// Character backups: a private ZIP of saved Studio characters and their artwork, and a restore that adds them back without
// overwriting anything.
import { sha256, stableStringify } from '../image/hash.ts';
import { LocalizedError } from '../message.ts';
import * as db from './db.ts';
import { incompatibleKind, RETAINED_ARCHIVE_PREFIX as retainedPrefix } from './incompatible.ts';
import {
	incompatibleIndexPath,
	inspectIncompatible,
	inspectIncompatibleFiles,
	packIncompatible
} from './incompatible-archive.ts';
import { supportedFormat } from './manifest.ts';
import type { RestoredFrom, StoredProject } from './project.ts';
import {
	archiveBuild,
	artworkRefs,
	packArchive,
	parseIndex,
	readArchiveFiles,
	studioCharacter,
	type ArchiveErrors,
	type CopyArchive
} from './workspace.ts';
import { MAX_ZIP_BYTES, unzip } from './zip.ts';
import { DEBUG_FOLDER } from '../debug/flags.ts';

export const BACKUP_FORMAT = 'pixeldoll-backup/1';
const indexPath = 'backup.json';
const maxRecords = 500;
const archivePath = /^archives\/([a-f0-9]{64})\.zip$/;

interface ArchivePack {
	id: string;
	data: Uint8Array;
	count: number;
}

export async function listArchiveDownloads() {
	let localCount = 0;
	const { retainedIds } = await db.readWorkspaceSnapshot(
		(_key, value) => {
			if (incompatibleKind(value)) localCount++;
			return false;
		},
		() => new Map()
	);
	return { localCount, retainedIds };
}

const invalidArchive = () =>
	new LocalizedError(
		'The archived data could not be preserved safely.',
		'incompatible.error.invalid'
	);

async function retainedArchive(id: string, keys: readonly string[]) {
	const digest = id.slice(retainedPrefix.length);
	if (!id.startsWith(retainedPrefix) || !/^[a-f0-9]{64}$/.test(digest)) throw invalidArchive();
	const pack = await db.get<Partial<ArchivePack>>('projects', id);
	if (
		!pack ||
		pack.id !== id ||
		!(pack.data instanceof Uint8Array) ||
		pack.data.length > MAX_ZIP_BYTES ||
		(await sha256(pack.data)) !== digest
	)
		throw invalidArchive();
	const { missing } = await inspectIncompatible(pack.data, keys);
	return { digest, data: pack.data, missing: missing.length };
}

async function archiveEntries(keys: readonly string[]) {
	const { retainedIds } = await listArchiveDownloads();
	const local = await packIncompatible(keys);
	const entries = new Map<string, Uint8Array>();
	let size = 0;
	let hasOmissions = Boolean(local?.missing);
	function include(digest: string, data: Uint8Array) {
		if (entries.has(digest)) return;
		size += data.length;
		if (size > MAX_ZIP_BYTES) throw backupErrors.tooLarge();
		entries.set(digest, data);
	}
	if (local) include(await sha256(local.bytes), local.bytes);
	for (const id of retainedIds) {
		const { digest, data, missing } = await retainedArchive(id, keys);
		include(digest, data);
		hasOmissions ||= missing > 0;
	}
	return {
		files: [...entries].map(([digest, data]) => ({ name: `archives/${digest}.zip`, data })),
		hasOmissions
	};
}

export async function downloadArchivedBackup(keys: readonly string[], id?: string) {
	return id === undefined
		? (await packIncompatible(keys))?.bytes
		: (await retainedArchive(id, keys)).data;
}

interface BackupIndex {
	format: typeof BACKUP_FORMAT;
	build: string;
	characters: [string, unknown][];
	/** Artwork hashes (hex) the characters reference that could not be included. */
	missing: string[];
	/** Characters left out because they failed validation. */
	omitted?: number;
}

const invalid = () =>
	new LocalizedError('This backup is damaged or invalid.', 'backup.error.invalid');
const backupErrors: ArchiveErrors = {
	invalidIndex: invalid,
	duplicateRecord: invalid,
	missingFiles: invalid,
	unexpectedFile: invalid,
	tooLarge: () =>
		new LocalizedError(
			'This backup exceeds the ZIP size or artwork limit. Use individual character ZIPs instead.',
			'backup.error.tooLarge'
		),
	containsKey: () =>
		new LocalizedError(
			'A saved character contains the connected or remembered PixelLab key. Remove it before backing up.',
			'backup.error.containsKey'
		)
};

/** Every saved Studio character with its artwork, read in one snapshot. Preferences, the demo outfit, export settings,
 *  drafts, jobs, credentials and diagnostics stay out. `keys`: the connected and remembered PixelLab keys, refused if any
 *  saved field holds one. hasOmissions: a character or some artwork failed verification and was left out. */
export async function exportBackup(
	keys: readonly string[],
	debug: readonly { name: string; data: Uint8Array }[] = []
) {
	const archives = await archiveEntries(keys);
	const { bytes, hasOmissions, records } = await packArchive(
		studioCharacter,
		keys,
		backupErrors,
		({ projects, missing, omitted }) => [
			indexPath,
			{
				format: BACKUP_FORMAT,
				build: archiveBuild(),
				characters: [...projects],
				missing,
				...(omitted && { omitted: omitted.characters })
			} satisfies BackupIndex
		],
		[...archives.files, ...debug]
	);
	return { bytes, hasOmissions: hasOmissions || archives.hasOmissions, characters: records };
}

export interface RestoreSource {
	/** The build that made the file. */
	build: string;
	/** Validated saved Studio characters, in file order. */
	characters: Map<string, StoredProject>;
	/** Verified artwork by hex hash. */
	blobs: Map<string, Blob>;
	/** Characters the file left out or that failed validation here. */
	unreadable: number;
	/** Characters read without Undo history the file lacks or that was malformed. History is never drawn or exported, so they
	 *  are otherwise whole. */
	trimmed: number;
	archives?: ArchivePack[];
	missing?: string[];
}

/** A bounded backup ZIP, validated. Throws a LocalizedError when the file as a whole cannot be read. */
export async function readRestoreSource(
	bytes: Uint8Array,
	keys: readonly string[] = []
): Promise<RestoreSource> {
	const files = await unzip(bytes);
	if (!files.has(indexPath) && files.has(incompatibleIndexPath)) {
		const { build, counts } = inspectIncompatibleFiles(files, keys);
		return {
			build,
			characters: new Map(),
			blobs: new Map(),
			unreadable: 0,
			trimmed: 0,
			archives: [
				{ id: `${retainedPrefix}${await sha256(bytes)}`, data: bytes.slice(), count: counts.total }
			]
		};
	}
	return readRestoreFiles(files, keys);
}

async function readRestoreFiles(
	files: Map<string, Uint8Array>,
	keys: readonly string[]
): Promise<RestoreSource> {
	const json = files.get(indexPath);
	if (!json)
		throw new LocalizedError(
			'Choose a PixelDoll backup ZIP, not a character ZIP.',
			'backup.error.notBackup'
		);
	const index = parseIndex(json, backupErrors) as Partial<BackupIndex> | null;
	if (index?.format !== BACKUP_FORMAT)
		throw new LocalizedError(
			'This backup file version is not supported.',
			'backup.error.unsupportedVersion'
		);
	const omitted = index.omitted ?? 0;
	if (
		typeof index.build !== 'string' ||
		index.build.length > 100 ||
		!Number.isInteger(omitted) ||
		omitted < 0 ||
		omitted > maxRecords
	)
		throw invalid();
	const counts = { characters: omitted };
	// Debugging details (lib/debug/bundle.ts) are for whoever helps the user, never restored.
	for (const path of [...files.keys()]) if (path.startsWith(DEBUG_FOLDER)) files.delete(path);
	const archives: ArchivePack[] = [];
	for (const [path, data] of files) {
		const digest = archivePath.exec(path)?.[1];
		if (!digest) continue;
		if ((await sha256(data)) !== digest) throw invalid();
		const { counts } = await inspectIncompatible(data, keys);
		archives.push({ id: `${retainedPrefix}${digest}`, data: data.slice(), count: counts.total });
		files.delete(path);
	}
	const { projects, blobs, missing, trimmed } = await readArchiveFiles(
		files,
		indexPath,
		index.characters,
		index.missing,
		counts,
		(key) => key.startsWith('rig-'),
		backupErrors
	);
	return {
		build: index.build,
		characters: projects as Map<string, StoredProject>,
		blobs,
		missing,
		unreadable: counts.characters,
		trimmed,
		...(archives.length && { archives })
	};
}

export async function readBackupCopy(bytes: Uint8Array): Promise<CopyArchive> {
	const source = await readRestoreFiles(await unzip(bytes), []);
	return {
		build: source.build,
		projects: source.characters,
		blobs: source.blobs,
		missing: source.missing ?? [],
		...(source.unreadable && { omitted: source.unreadable })
	};
}

/** What describes the character itself: not where or when it was saved, what it wears right now, internal receipts, where it
 *  was restored from or its Undo history (which an archive may lack). */
function canonical(record: StoredProject & { dress?: unknown }) {
	const {
		id: _id,
		savedAt: _savedAt,
		creationSpec: _creationSpec,
		moveRecovery: _moveRecovery,
		stateGenerations: _stateGenerations,
		appearanceEdits: _appearanceEdits,
		restoredFrom: _restoredFrom,
		dress: _dress,
		origin: _origin,
		...content
	} = record;
	const items = content.manifest.items.map(
		({ frameEdits: _frameEdits, paletteRepairs: _paletteRepairs, ...item }) => item
	);
	return stableStringify({ ...content, manifest: { ...content.manifest, items } });
}

/** Equal for two characters with the same content, whatever their IDs. */
export const characterFingerprint = async (record: StoredProject) =>
	`sha256:${await sha256(canonical(record))}`;

/** Every input of a plan's decision about a saved record; synchronous, so a restore checks it inside its transaction. */
const stateKey = (record: unknown) =>
	supportedFormat((record as Partial<StoredProject> | undefined)?.manifest?.format)
		? stableStringify({ ...(record as object), savedAt: undefined, dress: undefined })
		: 'unsupported';

const hexHash = /^(?:sha256:)?([a-f0-9]{64})$/;
const refsOf = (record: StoredProject) => [
	...new Set(
		[...artworkRefs(record.manifest)].flatMap(([hash]) => {
			const hex = typeof hash === 'string' && hexHash.exec(hash)?.[1];
			return hex ? [hex] : [];
		})
	)
];

export interface RestoreEntry {
	/** The character's ID in the file. */
	id: string;
	name: string;
	fingerprint: string;
	/** add: under its own ID. copy: under a new ID, because its ID holds different content here or an earlier restored copy
	 *  of it changed. skip: saved here unchanged, under its ID or as a restored copy of it. blocked: see blockers. */
	action: 'add' | 'copy' | 'skip' | 'blocked';
	/** skip: the saved character with the same content. */
	match?: string;
}

export type RestoreWarning =
	/** Characters the file left out or that failed validation: the rest can still be restored. */
	| { code: 'unreadable'; count: number }
	/** Characters restored without Undo history the file lacks. */
	| { code: 'trimmedHistory'; count: number }
	/** `copies` were restored from character `id` before and differ from this file's version now (edited since, or restored
	 *  from another version): restoring adds another copy instead of skipping it, which the person should know first. */
	| { code: 'editedRestore'; id: string; copies: string[] };

/** A character that cannot be restored: `count` artwork files it shows are neither in the file nor saved here. It is skipped;
 *  the other characters still restore. */
export type RestoreBlocker = { code: 'missingArtwork'; id: string; count: number };

export interface RestorePlan {
	source: RestoreSource;
	/** One per character in the file, in file order. */
	entries: RestoreEntry[];
	warnings: RestoreWarning[];
	blockers: RestoreBlocker[];
	/** What the plan was decided against: saved records by ID, and each file character's artwork. restoreCharacters writes only
	 *  while the records are unchanged. */
	basis: { records: Map<string, string>; refs: Map<string, string[]> };
}

/** Preview a restore against the characters saved now. It writes nothing. */
export async function planRestore(source: RestoreSource): Promise<RestorePlan> {
	const characters = await Promise.all(
		[...source.characters].map(async ([id, record]) => ({
			id,
			record,
			fingerprint: await characterFingerprint(record),
			refs: refsOf(record)
		}))
	);
	const borrowed = [
		...new Set(characters.flatMap(({ refs }) => refs.filter((hash) => !source.blobs.has(hash))))
	];
	const { records, stored } = await db.readCharacters(borrowed);
	const local = new Map<string, { fingerprint?: string; restoredFrom?: RestoredFrom }>();
	const basis: RestorePlan['basis'] = { records: new Map(), refs: new Map() };
	for (const [id, value] of records) {
		basis.records.set(id, stateKey(value));
		const record = value as StoredProject;
		const from = record?.restoredFrom;
		local.set(id, {
			fingerprint:
				studioCharacter(id, record) && supportedFormat(record.manifest?.format)
					? await characterFingerprint(record)
					: undefined,
			restoredFrom:
				typeof from?.id === 'string' && typeof from.fingerprint === 'string' ? from : undefined
		});
	}
	const plan: RestorePlan = { source, entries: [], warnings: [], blockers: [], basis };
	if (source.unreadable) plan.warnings.push({ code: 'unreadable', count: source.unreadable });
	if (source.trimmed) plan.warnings.push({ code: 'trimmedHistory', count: source.trimmed });
	for (const { id, record, fingerprint, refs } of characters) {
		basis.refs.set(id, refs);
		const entry = { id, name: record.manifest.name, fingerprint };
		// Only the same character counts: its original ID, or a copy restored from it. Equal content under another ID is an
		// intentional clone and is restored too.
		const lineage = [...local].filter(
			([localId, { restoredFrom }]) => localId === id || restoredFrom?.id === id
		);
		const match = lineage.find(
			([, saved]) =>
				saved.fingerprint === fingerprint ||
				(saved.restoredFrom?.fingerprint === fingerprint &&
					saved.fingerprint !== undefined &&
					saved.fingerprint === saved.restoredFrom.copyFingerprint)
		)?.[0];
		if (match) {
			plan.entries.push({ ...entry, action: 'skip', match });
			continue;
		}
		const missing = refs.filter((hash) => !source.blobs.has(hash) && !stored.has(hash)).length;
		if (missing) {
			plan.entries.push({ ...entry, action: 'blocked' });
			plan.blockers.push({ code: 'missingArtwork', id, count: missing });
			continue;
		}
		const copies = lineage
			.filter(([, { restoredFrom }]) => restoredFrom?.id === id)
			.map(([copy]) => copy);
		if (copies.length) plan.warnings.push({ code: 'editedRestore', id, copies });
		// A changed restored copy keeps its lineage even when the original ID is free: the file's version is another copy.
		plan.entries.push({ ...entry, action: records.has(id) || copies.length ? 'copy' : 'add' });
	}
	return plan;
}

/** The saved characters changed after the preview: nothing was written, and `plan` is the refreshed preview to confirm. */
export class RestoreChangedError extends LocalizedError {
	constructor(readonly plan: RestorePlan) {
		super(
			'Your saved characters changed. Review the updated restore preview.',
			'backup.error.changed'
		);
	}
}

export interface RestoreResult {
	/** Each added character: its ID in the file and its saved ID. */
	added: { from: string; id: string }[];
}

/** Add a plan's add and copy entries and the artwork they need in one transaction: all of them or, on any failure such as a
 *  full disk, none. Blocked entries are skipped, and nothing saved is overwritten or removed. Throws RestoreChangedError when
 *  saved characters changed since the plan. */
export async function restoreCharacters(
	plan: RestorePlan,
	options?: { keepArchived: boolean; keys: readonly string[]; copyName: (name: string) => string }
): Promise<RestoreResult> {
	const { source, basis } = plan;
	const writes = plan.entries.filter(({ action }) => action === 'add' || action === 'copy');
	const opaque = new Map<string, ArchivePack>();
	if (options?.keepArchived)
		for (const pack of source.archives ?? []) {
			await inspectIncompatible(pack.data, options.keys);
			opaque.set(pack.id, pack);
		}
	if (!writes.length && !opaque.size) return { added: [] };
	const renamedCopies = new Map<string, { name: string; copyFingerprint: string }>();
	if (options)
		for (const { id, action } of writes) {
			if (action !== 'copy') continue;
			const record = source.characters.get(id)!;
			const name = options.copyName(record.manifest.name);
			const copyFingerprint = await characterFingerprint({
				...record,
				manifest: { ...record.manifest, name }
			});
			renamedCopies.set(id, { name, copyFingerprint });
		}
	const hashes = [...new Set(writes.flatMap(({ id }) => basis.refs.get(id)!))];
	const at = new Date().toISOString();
	const stale = new Error('The saved characters changed since the restore plan.');
	const added: RestoreResult['added'] = [];
	try {
		await db.addCharacters(
			hashes,
			({ records, stored }) => {
				if (
					records.size !== basis.records.size ||
					[...records].some(([id, record]) => basis.records.get(id) !== stateKey(record)) ||
					hashes.some((hash) => !source.blobs.has(hash) && !stored.has(hash))
				)
					throw stale;
				const out = { records: new Map<string, unknown>(), blobs: new Map<string, Blob>() };
				for (const { id: from, fingerprint, action } of writes) {
					let id = from;
					if (action === 'copy')
						do id = `rig-${crypto.randomUUID()}`;
						while (records.has(id) || out.records.has(id));
					const record = structuredClone(source.characters.get(from)!);
					const renamed = renamedCopies.get(from);
					if (renamed) record.manifest.name = renamed.name;
					delete record.creationSpec;
					delete record.moveRecovery;
					out.records.set(id, {
						...record,
						id,
						savedAt: at,
						origin: 'studio',
						restoredFrom: {
							id: from,
							fingerprint,
							at,
							build: source.build,
							...(renamed && { copyFingerprint: renamed.copyFingerprint })
						}
					} satisfies StoredProject);
					added.push({ from, id });
				}
				for (const hash of hashes) {
					const blob = source.blobs.get(hash);
					if (blob && !stored.has(hash)) out.blobs.set(hash, blob);
				}
				return out;
			},
			opaque
		);
	} catch (error) {
		if (error === stale) throw new RestoreChangedError(await planRestore(source));
		throw error;
	}
	db.askPersist();
	return { added };
}
