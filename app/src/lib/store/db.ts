// IndexedDB "pixeldoll": projects (manifest JSON), blobs (sha256-keyed Blobs), jobs (queue ledger).
import { sha256, stableStringify } from '../image/hash.ts';
import { LocalizedError } from '../message.ts';
import type { StoredProject } from './project.ts';
import {
	blobReferences,
	CREATE_DRAFT_PREFIX,
	incompatibleKind,
	RETAINED_ARCHIVE_PREFIX
} from './incompatible.ts';
import { workspaceCopy } from './workspace-mode.ts';
import { defaultCharacterExportId } from './identity.ts';

export { CREATE_DRAFT_PREFIX };
export type StoreName = 'projects' | 'blobs' | 'jobs';
// Bump when PixelLab request inputs change. Work saved with different inputs no longer matches its ledger records and would
// resend paid calls, so it waits for review instead of resuming by itself.
export const REQUEST_TEXT = 5; // 5: repair grids pack into the cheapest layout (2026-11-07)
// Opened at whatever version it has: Delete local work raises the version as its fence (fenceStoredWork). A page of an
// earlier version opens version 1 explicitly, so after a fence it fails to open instead of writing into the emptied
// library. A future schema change must open at max(current version, its own).
const DB = 'pixeldoll';

let dbp: Promise<IDBDatabase> | null = null;
let copy: Record<StoreName, Map<string, unknown>> | undefined;
export function installWorkspaceCopy(projects: Map<string, unknown>, blobs: Map<string, Blob>) {
	if (!workspaceCopy || copy) throw new Error('Open a workspace copy in a separate tab.');
	copy = { projects, blobs, jobs: new Map() };
}

function openDatabase(name: string): Promise<IDBDatabase> {
	return new Promise((res, rej) => {
		const r = indexedDB.open(name);
		r.onupgradeneeded = () => {
			const db = r.result;
			for (const s of ['projects', 'blobs', 'jobs'])
				if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
		};
		r.onsuccess = () => {
			r.result.onversionchange = () => r.result.close();
			res(r.result);
		}; // another page's version change (a fence) is never blocked
		r.onerror = () => rej(r.error);
		r.onblocked = () =>
			rej(new Error('storage is held by an older PixelDoll tab; close it and reload'));
	});
}

function open(): Promise<IDBDatabase> {
	if (workspaceCopy) throw new Error('This operation is not available in a workspace copy.');
	return (dbp ??= (async () => {
		await holdPresence(storage);
		return openDatabase(DB);
	})());
}

// ---- Exclusive access (Delete local work) ----
// Every page that opens the database first holds `lock` shared for its lifetime: a page holding it exclusively knows no
// page of this version has the database open, and pages opening it meanwhile wait. Pages of earlier versions hold no such
// lock, so the deletion itself runs in a version change, which IndexedDB starts only once every other connection has
// closed. Write transactions check `sealed` as they are created: from the start of a deletion until it is refused and
// the lock is held again, or for good once it commits, this page writes nothing that could restore deleted work.
interface Hold {
	release(): Promise<void>;
}
interface Fence {
	name: string;
	lock: string;
	/** Held exclusively for a whole attempt: two pages never give up their presence for deletions at once. */
	intent: string;
	presence?: Promise<Hold>;
	sealed: boolean;
	connection(): Promise<IDBDatabase>;
	/** Forget the connection a refused version change closed. */
	reset(): void;
}
const storage: Fence = {
	name: DB,
	lock: 'pixeldoll-storage',
	intent: 'pixeldoll-storage-delete',
	sealed: false,
	connection: () => open(),
	reset: () => (dbp = null)
};
const storageLocks = () => (workspaceCopy ? undefined : globalThis.navigator?.locks);

/** Hold `name` shared until release() resolves, which waits until the lock is actually free again. */
function holdShared(locks: LockManager, name: string) {
	let leave!: () => void;
	const held = new Promise<void>((resolve) => (leave = resolve));
	return new Promise<Hold>((granted, failed) => {
		const done = locks.request(name, { mode: 'shared' }, () => {
			granted({
				release() {
					leave();
					return done;
				}
			});
			return held;
		});
		done.catch(failed);
	});
}

/** Without Web Locks (no browser that supports PixelDoll's other features lacks them) nothing is held, and Delete local
 *  work refuses to run. A failed request fails the open: an untracked page could write after a deletion. */
async function holdPresence(fence: Fence) {
	const locks = storageLocks();
	if (locks) await (fence.presence ??= holdShared(locks, fence.lock));
}

const sealedError = () =>
	new LocalizedError(
		'Local work was deleted. Reload PixelDoll to continue.',
		'librarySettings.deleteWork.sealed'
	);
function writable(database: IDBDatabase, stores: StoreName | StoreName[]) {
	if (storage.sealed) throw sealedError();
	return database.transaction(stores, 'readwrite');
}

async function tx<T>(
	store: StoreName,
	mode: IDBTransactionMode,
	fn: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	const db = await open();
	return new Promise((res, rej) => {
		const t = mode === 'readwrite' ? writable(db, store) : db.transaction(store, mode);
		const req = fn(t.objectStore(store));
		t.oncomplete = () => res(req.result);
		t.onerror = t.onabort = () => rej(t.error ?? req.error);
	});
}

export const get = async <T>(s: StoreName, key: string) =>
	copy
		? (structuredClone(copy[s].get(key)) as T | undefined)
		: tx<T | undefined>(s, 'readonly', (o) => o.get(key));
export const put = async (s: StoreName, key: string, value: unknown) => {
	if (copy) {
		copy[s].set(key, structuredClone(value));
	} else await tx(s, 'readwrite', (o) => o.put(value, key));
};
export const del = async (s: StoreName, key: string) => {
	if (copy) copy[s].delete(key);
	else await tx(s, 'readwrite', (o) => o.delete(key));
};
export const all = async <T>(s: StoreName) =>
	copy
		? (structuredClone([...copy[s].values()]) as T[])
		: tx<T[]>(s, 'readonly', (o) => o.getAll());
export const clear = async (s: StoreName) => {
	if (copy) copy[s].clear();
	else await tx(s, 'readwrite', (o) => o.clear());
};

export async function readWorkspaceSnapshot(
	select: (key: string, value: unknown) => boolean,
	references: (records: Map<string, unknown>) => ReadonlyMap<string, unknown>,
	includeErrors: boolean
) {
	const db = await open();
	return new Promise<{
		projects: Map<string, unknown>;
		blobs: Map<string, Blob>;
		jobs: unknown[];
		retainedIds: string[];
	}>((resolve, reject) => {
		const stores: StoreName[] = ['projects', 'blobs'];
		if (includeErrors) stores.push('jobs');
		const transaction = db.transaction(stores, 'readonly');
		const projects = new Map<string, unknown>();
		const blobs = new Map<string, Blob>();
		const retainedIds: string[] = [];
		const jobs = includeErrors ? transaction.objectStore('jobs').getAll() : undefined;
		const cursor = transaction.objectStore('projects').openCursor();
		let error: unknown;
		cursor.onsuccess = () => {
			try {
				const row = cursor.result;
				if (row) {
					if (typeof row.key === 'string') {
						if (row.key.startsWith(RETAINED_ARCHIVE_PREFIX)) retainedIds.push(row.key);
						else if (select(row.key, row.value)) projects.set(row.key, row.value);
					}
					row.continue();
				} else {
					const images = transaction.objectStore('blobs');
					for (const hash of references(projects).keys()) {
						const image = images.get(hash);
						image.onsuccess = () => {
							if (image.result instanceof Blob) blobs.set(hash, image.result);
						};
					}
				}
			} catch (cause) {
				error = cause;
				transaction.abort();
			}
		};
		transaction.oncomplete = () =>
			resolve({ projects, blobs, jobs: jobs?.result ?? [], retainedIds });
		transaction.onerror = transaction.onabort = () => reject(error ?? transaction.error);
	});
}

/** Encoding happens before this transaction, so garbage collection cannot sweep an import's partial blob writes. */
export async function putCharacter(
	id: string,
	record: unknown,
	blobs: Map<string, Blob>
): Promise<void> {
	if (copy) {
		if (copy.projects.has(id)) throw new Error('This character already exists.');
		const saved = structuredClone(record);
		for (const [hash, blob] of blobs) copy.blobs.set(hash, blob);
		copy.projects.set(id, saved);
		return;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = writable(db, ['projects', 'blobs']);
		for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
		t.objectStore('projects').add(record, id);
		t.oncomplete = () => res();
		t.onerror = t.onabort = () => rej(t.error);
	});
}

export interface CharacterSnapshot {
	/** Every saved character record (keys starting with "rig-"), developer rigs included. */
	records: Map<string, unknown>;
	/** Which of the asked hashes have a stored blob. */
	stored: Set<string>;
}

/** One consistent read of every saved character and of which `hashes` are stored. */
export const readCharacters = (hashes: readonly string[]) => characterBatch(hashes);

/** Read as readCharacters does, then add what `add` returns in the same transaction: a restore decides against exactly what it
 *  writes beside. Nothing is overwritten (an existing record or blob key aborts), `add` may throw to abort, and any failure,
 *  such as a full disk, leaves the whole batch unwritten. `add` must be synchronous; blobs it returns must be among `hashes`,
 *  and stored ones are kept as they are. */
export const addCharacters = (
	hashes: readonly string[],
	add: (snapshot: CharacterSnapshot) => { records: Map<string, unknown>; blobs: Map<string, Blob> },
	opaque: ReadonlyMap<string, { id: string; data: Uint8Array }> = new Map()
) => characterBatch(hashes, add, opaque);

async function characterBatch(
	hashes: readonly string[],
	add?: Parameters<typeof addCharacters>[1],
	opaque: Parameters<typeof addCharacters>[2] = new Map()
): Promise<CharacterSnapshot> {
	if (copy) {
		if (opaque.size) throw new Error('Cannot retain archives in a backup copy.');
		const records = new Map(
			[...copy.projects]
				.filter(([key]) => key.startsWith('rig-'))
				.map(([key, value]) => [key, structuredClone(value)])
		);
		const snapshot = { records, stored: new Set(hashes.filter((hash) => copy!.blobs.has(hash))) };
		if (add) {
			const out = add(snapshot);
			for (const id of out.records.keys())
				if (copy.projects.has(id)) throw new DOMException('Key already exists.', 'ConstraintError');
			for (const [hash, blob] of out.blobs) if (!copy.blobs.has(hash)) copy.blobs.set(hash, blob);
			for (const [id, record] of out.records) copy.projects.set(id, structuredClone(record));
		}
		return snapshot;
	}
	const db = await open();
	return new Promise((resolve, reject) => {
		const t = add ? writable(db, ['projects', 'blobs']) : db.transaction(['projects', 'blobs']),
			projects = t.objectStore('projects'),
			images = t.objectStore('blobs'),
			range = IDBKeyRange.bound('rig-', 'rig.', false, true),
			values = projects.getAll(range),
			keys = projects.getAllKeys(range),
			counts = hashes.map((hash) => [hash, images.count(hash)] as const),
			archives = [...opaque].map(([id, record]) => ({ id, record, found: projects.get(id) }));
		const snapshot: CharacterSnapshot = { records: new Map(), stored: new Set() };
		let error: unknown;
		// Requests in one transaction complete in order: the last one finds all the others done.
		(archives.at(-1)?.found ?? counts.at(-1)?.[1] ?? keys).onsuccess = () => {
			try {
				keys.result.forEach((key, index) =>
					snapshot.records.set(String(key), values.result[index])
				);
				for (const [hash, count] of counts) if (count.result) snapshot.stored.add(hash);
				if (!add) return;
				const out = add(snapshot);
				for (const [hash, blob] of out.blobs)
					if (!snapshot.stored.has(hash)) images.add(blob, hash);
				for (const [id, record] of out.records) projects.add(record, id);
				for (const { id, record, found } of archives) {
					if (found.result === undefined) {
						projects.add(record, id);
						continue;
					}
					const previous = found.result;
					if (
						previous?.id !== id ||
						!(previous.data instanceof Uint8Array) ||
						previous.data.length !== record.data.length ||
						!record.data.every((value, index) => value === previous.data[index])
					)
						throw new LocalizedError(
							'A saved copy of this archive is damaged. Existing data was not changed.',
							'incompatible.error.invalid'
						);
				}
			} catch (failure) {
				error = failure;
				t.abort();
			}
		};
		t.oncomplete = () => resolve(snapshot);
		// A refused add reports on its request before the transaction aborts.
		t.onerror = (event) => (error ??= (event.target as IDBRequest).error);
		t.onabort = () => reject(error ?? t.error);
	});
}

/** Publish a completed rig without a gap between new image blobs and their project references. `stored`: blobs the record
 *  references that are already stored; they are checked in the same transaction, so a concurrent cleanup cannot sweep them
 *  between the check and the write. */
export async function updateCharacter<T>(
	id: string,
	blobs: Map<string, Blob>,
	fn: (record: T | undefined) => T,
	stored?: { keys: Iterable<string>; missing: (key: string) => Error }
): Promise<void> {
	if (copy) {
		for (const key of stored?.keys ?? []) if (!copy.blobs.has(key)) throw stored!.missing(key);
		const saved = structuredClone(fn(structuredClone(copy.projects.get(id)) as T | undefined));
		for (const [hash, blob] of blobs) copy.blobs.set(hash, blob);
		copy.projects.set(id, saved);
		return;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = writable(db, ['projects', 'blobs']),
			projects = t.objectStore('projects'),
			read = projects.get(id),
			keys = [...(stored?.keys ?? [])];
		let error: unknown,
			pending = keys.length + 1,
			missing: string | undefined;
		const write = () => {
			if (--pending) return;
			try {
				if (missing) throw stored!.missing(missing);
				const record = fn(read.result);
				for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
				projects.put(record, id);
			} catch (e) {
				error = e;
				t.abort();
			}
		};
		read.onsuccess = write;
		for (const key of keys) {
			const count = t.objectStore('blobs').count(key);
			count.onsuccess = () => {
				if (!count.result) missing ??= key;
				write();
			};
		}
		t.oncomplete = () => res();
		t.onerror = t.onabort = () => rej(error ?? t.error);
	});
}

/** A record's change when characters `ids` are deleted: their drafts leave the shared draft lists; undefined when the record
 * does not depend on them. */
export function withoutCharacters(r: any, ids: Set<string>): Record<string, unknown> | undefined {
	const list = r?.id === 'studio-drafts' ? 'gens' : r?.id === 'm3-drafts' ? 'drafts' : undefined;
	if (!list) return;
	const kept = r[list].filter(
		(d: { rigId?: string; draft?: { rigId: string } }) => !ids.has(d.draft?.rigId ?? d.rigId!)
	);
	return kept.length === r[list].length ? undefined : { ...r, [list]: kept };
}

/** The drafts a character's deletion takes with it, each with the shared list it came from. */
export function takenDrafts(r: any, id: string): { list: 'gens' | 'drafts'; entry: unknown }[] {
	const list = r?.id === 'studio-drafts' ? 'gens' : r?.id === 'm3-drafts' ? 'drafts' : undefined;
	if (!list) return [];
	return r[list]
		.filter(
			(d: { rigId?: string; draft?: { rigId: string } }) => (d.draft?.rigId ?? d.rigId) === id
		)
		.map((entry: unknown) => ({ list, entry }));
}

type FlowRecord = {
	status?: string;
	requestText?: number;
	projectId?: string;
	spec?: { projectId?: string };
	queued?: { projectId?: string }[];
};
/** Running work could write any character back; older inputs wait for review. */
export const runningFlow = (r: FlowRecord) =>
	r.status === 'running' && r.requestText === REQUEST_TEXT;
/** Whether saved ledger `jobs` or flow `records` show generation work that `holds` cares about: any queued, submitting or
 *  running job, a create, move or setup draft it holds, or an item draft that is running. Records an earlier version saved
 *  never run, so they hold nothing. */
export function generationWork(
	records: readonly any[],
	jobs: readonly any[],
	holds: (r: FlowRecord) => boolean
): boolean {
	return (
		jobs.some((j) => ['queued', 'submitting', 'running'].includes(j?.state)) ||
		records.some(
			(r) =>
				(!incompatibleKind(r) &&
					(r?.id?.startsWith(CREATE_DRAFT_PREFIX) ||
						r?.id === 'studio-move' ||
						r?.id === 'studio-setup') &&
					holds(r)) ||
				(r?.id === 'studio-drafts' && r.gens?.some((g: { phase: string }) => g.phase === 'running'))
		)
	);
}
type IdleAction =
	'delete' | 'restore' | 'change directions for' | 'replace body frames of' | 'change the frame of';

export async function editIdleCharacter(
	id: string,
	action: IdleAction,
	edit: (
		projects: { delete(key: string): void; put(value: unknown, key: string): void },
		records: any[]
	) => void,
	blobs?: Map<string, Blob>,
	/** Adjust frame from a stopped move's review: that failed move of this character waits for the resize and continues on
	 *  it, so it does not hold the edit. Any other stopped or running work still does. */
	stoppedMove = false
): Promise<void> {
	if (!id.startsWith('rig-')) throw new Error(`You can only ${action} a saved character.`);
	if (copy) {
		const projects = new Map(copy.projects);
		edit(
			{
				delete: (key) => projects.delete(key),
				put: (value, key) => projects.set(key, structuredClone(value))
			},
			[...projects.values()]
		);
		for (const [hash, blob] of blobs ?? []) copy.blobs.set(hash, blob);
		copy.projects = projects;
		return;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = writable(db, blobs?.size ? ['projects', 'jobs', 'blobs'] : ['projects', 'jobs']),
			projects = t.objectStore('projects');
		const records = projects.getAll(),
			jobs = t.objectStore('jobs').getAll();
		let error: unknown;
		jobs.onsuccess = () => {
			// Stopped work waits for the user and holds only its own character.
			const holds = (r: FlowRecord) =>
				runningFlow(r) ||
				r.projectId === id ||
				r.spec?.projectId === id ||
				!!r.queued?.some((queued) => queued.projectId === id);
			const waits = (r: { id?: string; status?: string; projectId?: string; queued?: unknown[] }) =>
				stoppedMove &&
				r.id === 'studio-move' &&
				r.status === 'failed' &&
				r.projectId === id &&
				!r.queued?.length;
			try {
				if (
					generationWork(records.result, jobs.result, (record) => holds(record) && !waits(record))
				)
					throw action === 'delete'
						? new LocalizedError(
								'Finish or dismiss pending generation work before deleting a character.',
								'state.finishBeforeCharacterRemoval'
							)
						: action === 'restore'
							? new LocalizedError(
									'Finish or dismiss pending generation work before restoring this character.',
									'state.finishBeforeRestore'
								)
							: action === 'replace body frames of'
								? new LocalizedError(
										'Wait for the current generation work to finish before fixing frames.',
										'state.finishBeforeFixFrames'
									)
								: action === 'change the frame of'
									? new LocalizedError(
											'Finish or dismiss pending generation work before adjusting the frame.',
											'state.finishBeforeFrameChange'
										)
									: new LocalizedError(
											'Finish or dismiss pending generation work before changing directions.',
											'state.finishBeforeDirectionRemoval'
										);
				edit(projects, records.result);
				for (const [hash, blob] of blobs ?? []) t.objectStore('blobs').put(blob, hash);
			} catch (failure) {
				error = failure;
				t.abort();
			}
		};
		t.oncomplete = () => res();
		t.onerror = t.onabort = () => rej(error ?? t.error);
	});
}

/** Delete a local character and its drafts atomically, refusing work that could later write it back. Shared blobs stay.
 *  `keep` receives the record and drafts just before they are removed, and returns the recovery entry to write in the same
 *  transaction: a delete is never left without one, and a refused entry writes deletes nothing. */
export async function deleteCharacter<T>(
	id: string,
	keep?: (
		record: StoredProject,
		drafts: { list: 'gens' | 'drafts'; entry: unknown }[]
	) => { key: string; entry: T; prune?: readonly string[] }
): Promise<T | undefined> {
	let kept: T | undefined;
	await editIdleCharacter(id, 'delete', (projects, records) => {
		const record = records.find((r) => r?.id === id) as StoredProject | undefined;
		if (record && keep) {
			const out = keep(
				record,
				records.flatMap((r) => takenDrafts(r, id))
			);
			projects.put(out.entry, out.key);
			for (const gone of out.prune ?? []) if (gone !== out.key) projects.delete(gone);
			kept = out.entry;
		}
		projects.delete(id);
		for (const rec of records) {
			const change = withoutCharacters(rec, new Set([id]));
			if (change) projects.put(change, rec.id);
		}
	});
	return kept;
}

/** Replace a whole character record while no generation work could write it back, refusing if it changed since `original`. */
export async function saveIdleCharacter(
	original: StoredProject,
	next: StoredProject,
	blobs: Map<string, Blob>,
	action: Exclude<IdleAction, 'delete'>,
	stoppedMove = false
): Promise<void> {
	const { id } = original;
	const version = stableStringify(original);
	const frames = action === 'replace body frames of',
		frame = action === 'change the frame of';
	await editIdleCharacter(
		id,
		action,
		(projects, records) => {
			if (records.some((record) => withoutCharacters(record, new Set([id]))))
				throw frames
					? new LocalizedError(
							'Keep or dismiss this character’s item drafts before replacing body frames.',
							'fixFrames.errors.resolveDrafts'
						)
					: frame
						? new LocalizedError(
								'Keep or dismiss this character’s item drafts before adjusting the frame.',
								'adjustFrame.errors.resolveDrafts'
							)
						: new Error('Keep or dismiss this character’s item drafts before changing directions.');
			if (stableStringify(asLoaded(records.find((record) => record?.id === id))) !== version)
				throw frames
					? new LocalizedError(
							'These frames changed since your review. Import the file again.',
							'fixFrames.errors.changed'
						)
					: frame
						? new LocalizedError(
								'This character changed. Reopen Adjust frame to review the latest version.',
								'adjustFrame.errors.changed'
							)
						: new Error(
								'This character changed. Close and reopen Directions to review the latest version.'
							);
			projects.put(next, id);
		},
		blobs,
		stoppedMove
	);
}

/** A stored record as loadProject returns it: callers compare their loaded copy, which gains a default export id. */
export function asLoaded(record: StoredProject | undefined): StoredProject | undefined {
	if (!record?.manifest || record.manifest.exportId) return record;
	return {
		...record,
		manifest: { ...record.manifest, exportId: defaultCharacterExportId(record.id) }
	};
}

type RelatedRecord = <R>(key: string) => R | undefined;
type PreserveRecord<T> = (previous: T | undefined) => { key: string; record: unknown } | undefined;

export function update<T>(
	s: StoreName,
	key: string,
	fn: (v: T | undefined, related: RelatedRecord) => T,
	relatedKeys: readonly string[],
	preserve?: PreserveRecord<T>,
	/** Keys removed in the same transaction: a recovery entry a restore consumes, or entries a delete prunes. */
	consume?: readonly string[]
): Promise<T>;
export function update<T>(s: StoreName, key: string, fn: (v: T | undefined) => T): Promise<T>;
/** Atomic read-modify-write: get + put in ONE readwrite transaction, so concurrent writers (another accept, autosave, another
 * tab) queue behind it instead of overwriting each other. `fn` must be synchronous: do async work (hashing, blob writes) first.
 * Related records in the same store can be read for conflict checks. Throwing in `fn` aborts without writing. */
export async function update<T>(
	s: StoreName,
	key: string,
	fn: (v: T | undefined, related: RelatedRecord) => T,
	relatedKeys: readonly string[] = [],
	preserve?: PreserveRecord<T>,
	consume: readonly string[] = []
): Promise<T> {
	const archiveOf = (previous: T | undefined) => {
		const archive = preserve?.(previous);
		if (archive?.key === key) throw new DOMException('Key already exists.', 'ConstraintError');
		return archive;
	};
	if (copy) {
		const records = copy[s];
		const previous = structuredClone(records.get(key)) as T | undefined;
		const archived = archiveOf(previous);
		const saved = archived && structuredClone(archived.record);
		const result = fn(previous, <R>(related: string) =>
			relatedKeys.includes(related)
				? (structuredClone(records.get(related)) as R | undefined)
				: undefined
		);
		const next = structuredClone(result);
		if (archived) {
			if (records.has(archived.key))
				throw new DOMException('Key already exists.', 'ConstraintError');
			records.set(archived.key, saved);
		}
		for (const gone of consume) if (gone !== key) records.delete(gone);
		records.set(key, next);
		return result;
	}
	const db = await open();
	return new Promise((res, rej) => {
		const t = writable(db, s),
			o = t.objectStore(s),
			g = o.get(key),
			related = new Map(
				[...new Set(relatedKeys)].map((relatedKey) => [relatedKey, o.get(relatedKey)])
			);
		let out: T, err: unknown;
		const write = () => {
			try {
				const archived = archiveOf(g.result as T | undefined);
				if (archived) o.add(archived.record, archived.key);
				out = fn(
					g.result as T | undefined,
					<R>(relatedKey: string) => related.get(relatedKey)?.result as R | undefined
				);
				o.put(out, key);
				for (const gone of consume) if (gone !== key) o.delete(gone);
			} catch (e) {
				err = e;
				t.abort();
			}
		};
		(related.size ? [...related.values()].at(-1)! : g).onsuccess = write;
		t.oncomplete = () => res(out);
		t.onerror = (event) => (err ??= (event.target as IDBRequest).error);
		t.onabort = () => rej(err ?? t.error);
	});
}

/** Atomically claim one ledger record. Selection runs against the latest jobs in the same transaction as insert;
 * returning an existing record never rewrites it. The callback must be synchronous and may throw to abort. */
export async function claimJob<T extends { id: string }>(
	record: T,
	chooseExisting: (records: T[]) => T | undefined
): Promise<T> {
	if (copy) {
		const existing = chooseExisting(structuredClone([...copy.jobs.values()]) as T[]);
		if (existing) return existing;
		if (copy.jobs.has(record.id)) throw new DOMException('Job already exists.', 'ConstraintError');
		copy.jobs.set(record.id, structuredClone(record));
		return record;
	}
	const database = await open();
	return new Promise((resolve, reject) => {
		const transaction = writable(database, 'jobs'),
			jobs = transaction.objectStore('jobs'),
			read = jobs.getAll();
		let result: T, error: unknown;
		read.onsuccess = () => {
			try {
				const existing = chooseExisting(read.result as T[]);
				result = existing ?? record;
				if (!existing) jobs.add(record, record.id);
			} catch (e) {
				error = e;
				transaction.abort();
			}
		};
		transaction.oncomplete = () => resolve(result);
		transaction.onerror = transaction.onabort = () => reject(error ?? transaction.error);
	});
}
/** A retained archive is an opaque ZIP: hashes inside it name no stored blob. */
function referencedBy(key: IDBValidKey, value: unknown, refs: Set<string>) {
	if (typeof key !== 'string' || !key.startsWith(RETAINED_ARCHIVE_PREFIX))
		blobReferences([value], refs);
}

export interface StoredWork {
	projects: ReadonlyMap<string, unknown>;
	jobs: ReadonlyMap<string, unknown>;
}
export class StorageInUseError extends LocalizedError {
	constructor() {
		super(
			'Close other PixelDoll tabs and windows, then try again. Nothing was deleted.',
			'librarySettings.deleteWork.otherTabs'
		);
	}
}
type SelectWork = (stored: StoredWork) => { projects: Iterable<string>; jobs: Iterable<string> };

/** Delete the `projects` and `jobs` keys `select` picks, with the blobs only they referenced, in ONE transaction: `select`
 *  decides against exactly what is deleted and may throw to refuse; any failure changes nothing. It runs only while no
 *  other page can have the database open (fenceStoredWork). Once it resolves, the caller must reload the page: this
 *  page's connection is closed and it writes nothing more. */
export async function deleteStoredWork(select: SelectWork): Promise<void> {
	if (copy) throw new Error('This operation is not available in a workspace copy.');
	await fenceStoredWork(storage, select);
}

async function fenceStoredWork(fence: Fence, select: SelectWork) {
	const locks = storageLocks();
	if (!locks)
		throw new LocalizedError(
			'This browser cannot confirm that other PixelDoll tabs are closed, so nothing was deleted.',
			'librarySettings.deleteWork.unsupported'
		);
	await fence.connection(); // holds presence
	if (fence.sealed) throw sealedError();
	await locks.request(fence.intent, { mode: 'exclusive', ifAvailable: true }, async (intent) => {
		if (!intent) throw new StorageInUseError();
		fence.sealed = true; // writes this page created earlier finish first: IndexedDB runs overlapping ones in order
		let committed = false,
			changing = false;
		try {
			const hold = await fence.presence;
			fence.presence = undefined;
			await hold?.release();
			await locks.request(fence.lock, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
				if (!lock) throw new StorageInUseError();
				const database = await fence.connection();
				// Refuse before the version change, which closes every other connection, even an earlier version's page.
				await new Promise<void>((resolve, reject) => {
					const t = database.transaction(['projects', 'jobs']);
					withStoredWork(t, select, reject);
					t.oncomplete = () => resolve();
					t.onerror = t.onabort = () => reject(t.error);
				});
				changing = true; // from here this page's own connection closes for the version change
				await deleteInVersionChange(fence.name, database.version + 1, select);
				committed = true;
			});
		} finally {
			if (!committed) {
				if (changing) fence.reset();
				await holdPresence(fence); // throws while still sealed: then nothing more is written
				fence.sealed = false;
			}
		}
	});
}

function withStoredWork(
	t: IDBTransaction,
	use: (stored: StoredWork) => unknown,
	fail: (error: unknown) => void
) {
	const projects = t.objectStore('projects'),
		jobs = t.objectStore('jobs'),
		projectKeys = projects.getAllKeys(),
		projectValues = projects.getAll(),
		jobKeys = jobs.getAllKeys(),
		jobValues = jobs.getAll();
	const pairs = (keys: IDBValidKey[], values: unknown[]) =>
		new Map(keys.map((key, index) => [String(key), values[index]]));
	// Requests in one transaction complete in order: the last one finds all the others done.
	jobValues.onsuccess = () => {
		try {
			use({
				projects: pairs(projectKeys.result, projectValues.result),
				jobs: pairs(jobKeys.result, jobValues.result)
			});
		} catch (error) {
			fail(error);
			t.abort();
		}
	};
}

function deleteInVersionChange(name: string, version: number, select: SelectWork) {
	return new Promise<void>((resolve, reject) => {
		let blocked = false,
			error: unknown;
		const r = indexedDB.open(name, version);
		// A connection that does not close holds the change back: give up now, and abort the change if it ever starts.
		r.onblocked = () => {
			blocked = true;
			reject(new StorageInUseError());
		};
		r.onupgradeneeded = () => {
			const t = r.transaction!;
			if (blocked) return t.abort();
			withStoredWork(
				t,
				(stored) => {
					const chosen = select(stored),
						goneProjects = new Set(chosen.projects),
						goneJobs = new Set(chosen.jobs),
						gone = new Set<string>(),
						kept = new Set<string>();
					for (const [key, value] of stored.projects)
						if (goneProjects.has(key)) {
							t.objectStore('projects').delete(key);
							referencedBy(key, value, gone);
						} else referencedBy(key, value, kept);
					for (const [key, value] of stored.jobs)
						if (goneJobs.has(key)) {
							t.objectStore('jobs').delete(key);
							blobReferences([value], gone);
						} else blobReferences([value], kept);
					// Only artwork the deleted records used: blobs nothing references were never this deletion's to remove.
					for (const hash of gone) if (!kept.has(hash)) t.objectStore('blobs').delete(hash);
				},
				(failure) => (error = failure)
			);
		};
		r.onsuccess = () => {
			r.result.close();
			resolve();
		};
		r.onerror = () => reject(error ?? r.error);
	});
}

/** Mark-and-sweep in one transaction over all stores: a blob survives when any project/draft/job record mentions its hash
 * (blobReferences), including records an earlier version saved, which stay until the user removes them. Returns the number
 * of blobs deleted. Callers run it only while this tab is idle, because writers put cell blobs one transaction before the
 * record that references them. */
export async function gcBlobs(): Promise<number> {
	if (copy) return 0;
	const db = await open();
	return new Promise((res, rej) => {
		const t = writable(db, ['projects', 'jobs', 'blobs']);
		const jobs = t.objectStore('jobs').getAll(),
			images = t.objectStore('blobs'),
			blobs = images.getAllKeys(),
			projects = t.objectStore('projects').openCursor(),
			refs = new Set<string>();
		let n = 0;
		projects.onsuccess = () => {
			const row = projects.result;
			if (row) {
				referencedBy(row.key, row.value, refs);
				row.continue();
				return;
			}
			blobReferences(jobs.result, refs);
			for (const k of blobs.result)
				if (!refs.has(String(k))) {
					images.delete(k);
					n++;
				}
		};
		t.oncomplete = () => res(n);
		t.onerror = t.onabort = () => rej(t.error);
	});
}

// Content-addressed: key = sha256 hex of the bytes. Identical files dedupe.
export async function putBlob(bytes: Uint8Array, type = 'image/png'): Promise<string> {
	const key = await sha256(bytes);
	if (!(await get('blobs', key)))
		await put('blobs', key, new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
	return key;
}
export const getBlob = (key: string) => get<Blob>('blobs', key);

let persistAsked = false;
export function askPersist() {
	if (persistAsked || workspaceCopy) return;
	persistAsked = true;
	// Best effort: a refused or failed request leaves storage evictable, which the app already tolerates.
	navigator.storage?.persist?.().catch(() => {});
}

export async function selfTest() {
	const k = 'selftest-' + Math.random();
	await put('projects', k, { a: 1 });
	console.assert((await get<{ a: number }>('projects', k))?.a === 1, 'db put/get');
	await del('projects', k);
	console.assert((await get('projects', k)) === undefined, 'db delete');
	const sha = await putBlob(new Uint8Array([1, 2, 3]), 'application/octet-stream');
	console.assert(
		sha === '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
		'putBlob key'
	);
	console.assert((await getBlob(sha))?.size === 3, 'getBlob');
	await del('blobs', sha);
	await Promise.all(
		[1, 2, 3].map(() => update<{ n: number }>('projects', k, (r) => ({ n: (r?.n ?? 0) + 1 })))
	); // P1-5: no lost update
	console.assert((await get<{ n: number }>('projects', k))?.n === 3, 'db update is atomic');
	await update('projects', k, () => {
		throw new Error('x');
	}).catch(() => {});
	console.assert((await get<{ n: number }>('projects', k))?.n === 3, 'db update aborts on throw');
	const archive = `${k}-archive`;
	try {
		const replace = () =>
			update<{ n: number }>(
				'projects',
				k,
				() => ({ n: 4 }),
				[],
				(record) => ({
					key: archive,
					record
				})
			);
		await put('projects', archive, { n: 2 });
		const refused = await replace().then(
			() => undefined,
			(error: DOMException) => error
		);
		console.assert(
			refused?.name === 'ConstraintError' &&
				(await get<{ n: number }>('projects', k))?.n === 3 &&
				(await get<{ n: number }>('projects', archive))?.n === 2,
			'db update rolls back replacement when the archived copy cannot be inserted'
		);
		await del('projects', archive);
		await replace();
		console.assert(
			(await get<{ n: number }>('projects', k))?.n === 4 &&
				(await get<{ n: number }>('projects', archive))?.n === 3,
			'db update saves both the replacement and the archived copy'
		);
	} finally {
		await del('projects', archive);
	}
	const claimGroup = 'selftest-claim-' + Math.random(),
		candidates = Array.from({ length: 10 }, (_, i) => ({
			id: `${claimGroup}-${i}`,
			group: claimGroup,
			state: 'done',
			jobs: [],
			createdAt: Date.now(),
			progress: 0
		}));
	const choose = (records: typeof candidates) => records.find((r) => r.group === claimGroup);
	try {
		const claims = await Promise.all(candidates.map((candidate) => claimJob(candidate, choose)));
		console.assert(
			claims.every((r) => r.id === claims[0].id),
			'db claim serializes concurrent insert-if-absent requests'
		);
		const winner = claims[0];
		await update<typeof winner>('jobs', winner.id, (current) => ({ ...current!, progress: 2 }));
		const resumed = await claimJob({ ...winner, progress: 0 }, choose);
		console.assert(
			resumed.progress === 2 && (await get<typeof winner>('jobs', winner.id))?.progress === 2,
			'db claim never overwrites progressed existing work'
		);
		const forbidden = { ...winner, id: `${claimGroup}-forbidden` };
		let rejected = false;
		try {
			await claimJob(forbidden, () => {
				throw new Error('stale consent');
			});
		} catch {
			rejected = true;
		}
		console.assert(
			rejected && !(await get('jobs', forbidden.id)),
			'db claim callback failure inserts no record'
		);
	} finally {
		await Promise.all(candidates.map((candidate) => del('jobs', candidate.id)));
	}
	const taken = `rig-selftest-${Math.random()}`,
		added = `rig-selftest-${Math.random()}`,
		retained = `${RETAINED_ARCHIVE_PREFIX}selftest-${Math.random()}`,
		image = `selftest-${Math.random()}`;
	try {
		await put('projects', taken, { n: 1 });
		const batch = (ids: string[]) =>
			addCharacters([image], () => ({
				records: new Map(ids.map((id) => [id, { id }])),
				blobs: new Map([[image, new Blob([new Uint8Array([1])])]])
			}));
		const refused = await batch([added, taken]).then(
			() => undefined,
			(error: DOMException) => error
		);
		console.assert(
			refused?.name === 'ConstraintError' &&
				!(await get('projects', added)) &&
				!(await get('blobs', image)) &&
				(await get<{ n: number }>('projects', taken))?.n === 1,
			'db addCharacters never overwrites and rolls the whole batch back'
		);
		const opaque = (byte: number) => ({ id: retained, data: new Uint8Array([byte]) });
		await put('projects', retained, opaque(1));
		const addWithArchive = (byte: number) =>
			addCharacters(
				[],
				() => ({ records: new Map([[added, { id: added }]]), blobs: new Map() }),
				new Map([[retained, opaque(byte)]])
			);
		const conflict = await addWithArchive(2).then(
			() => undefined,
			(error: unknown) => error
		);
		console.assert(
			conflict instanceof LocalizedError &&
				!(await get('projects', added)) &&
				(await get<ReturnType<typeof opaque>>('projects', retained))?.data[0] === 1,
			'db addCharacters rolls back on a conflicting retained archive'
		);
		await addWithArchive(1);
		console.assert(!!(await get('projects', added)), 'an identical retained archive is a no-op');
		await del('projects', added);
		await batch([added]);
		const seen = await readCharacters([image]);
		console.assert(
			seen.stored.has(image) && seen.records.has(added) && seen.records.has(taken),
			'db addCharacters writes records and blobs together'
		);
	} finally {
		await Promise.all([
			del('projects', taken),
			del('projects', added),
			del('projects', retained),
			del('blobs', image)
		]);
	}
	await del('projects', k); // gcBlobs is not run here: it sweeps the whole origin's store (probe in B13 report)
	await fenceSelfTest();
}

/** Delete local work's fence on a throwaway database and locks of its own: the app's data and presence are never touched. */
async function fenceSelfTest() {
	const locks = storageLocks();
	console.assert(!!locks, 'fence self-test needs Web Locks');
	if (!locks) return;
	const tag = `pixeldoll-selftest-fence-${crypto.randomUUID()}`;
	const connection: { pending?: Promise<IDBDatabase> } = {};
	const fence: Fence = {
		name: tag,
		lock: `${tag}-lock`,
		intent: `${tag}-intent`,
		sealed: false,
		connection: () =>
			(connection.pending ??= (async () => {
				await holdPresence(fence);
				return openDatabase(tag);
			})()),
		reset: () => (connection.pending = undefined)
	};
	const hex = (n: number) => String(n).repeat(64);
	const [only, shared, orphan, jobOnly] = [1, 2, 3, 4].map(hex);
	const select = () => ({ projects: ['rig-gone'], jobs: ['job-gone'] });
	const refused = (run: Promise<unknown>) =>
		run.then(
			() => undefined,
			(error: unknown) => error
		);
	const snapshot = async () => {
		const database = await fence.connection();
		const read = (store: StoreName) =>
			new Promise<string[]>((resolve, reject) => {
				const request = database.transaction(store).objectStore(store).getAllKeys();
				request.onsuccess = () => resolve(request.result.map(String).sort());
				request.onerror = () => reject(request.error);
			});
		return {
			version: database.version,
			projects: await read('projects'),
			jobs: await read('jobs'),
			blobs: await read('blobs')
		};
	};
	try {
		const database = await fence.connection();
		await new Promise<void>((resolve, reject) => {
			const t = database.transaction(['projects', 'jobs', 'blobs'], 'readwrite');
			t.objectStore('projects').put(
				{ id: 'rig-gone', art: [only, `sha256:${shared}`] },
				'rig-gone'
			);
			t.objectStore('projects').put({ id: 'rig-kept', art: shared }, 'rig-kept');
			t.objectStore('projects').put({ data: only }, `${RETAINED_ARCHIVE_PREFIX}x`);
			t.objectStore('jobs').put({ id: 'job-gone', results: [{ sha: jobOnly }] }, 'job-gone');
			for (const hash of [only, shared, orphan, jobOnly])
				t.objectStore('blobs').put(new Blob([hash]), hash);
			t.oncomplete = () => resolve();
			t.onerror = t.onabort = () => reject(t.error);
		});
		const before = await snapshot();
		const unchanged = async (label: string) =>
			console.assert(
				stableStringify(await snapshot()) === stableStringify(before) && !fence.sealed,
				`fence leaves everything unchanged and writable: ${label}`
			);

		const otherPage = await holdShared(locks, fence.lock);
		console.assert(
			(await refused(fenceStoredWork(fence, select))) instanceof StorageInUseError,
			'fence refuses while another page holds the database'
		);
		await otherPage.release();
		await unchanged('another page');

		let releaseIntent!: () => void;
		const intentHeld = new Promise<void>((granted) =>
			locks.request(fence.intent, () => {
				granted();
				return new Promise<void>((resolve) => (releaseIntent = resolve));
			})
		);
		await intentHeld;
		console.assert(
			(await refused(fenceStoredWork(fence, select))) instanceof StorageInUseError,
			'fence refuses while another deletion is under way'
		);
		releaseIntent();
		await unchanged('another deletion');

		const refusal = new Error('refused');
		console.assert(
			(await refused(
				fenceStoredWork(fence, () => {
					throw refusal;
				})
			)) === refusal,
			'fence refuses before the version change'
		);
		await unchanged('refused before the version change');
		let calls = 0;
		console.assert(
			(await refused(
				fenceStoredWork(fence, () => {
					if (++calls === 2) throw refusal; // the library changed between the check and the change
					return select();
				})
			)) === refusal,
			'fence refuses inside the version change'
		);
		await unchanged('refused inside the version change');

		const stale = indexedDB.open(tag); // a connection that never closes for a version change
		const holder = await new Promise<IDBDatabase>((resolve, reject) => {
			stale.onsuccess = () => resolve(stale.result);
			stale.onerror = () => reject(stale.error);
		});
		console.assert(
			(await refused(fenceStoredWork(fence, select))) instanceof StorageInUseError,
			'fence refuses while a connection holds the version change back'
		);
		holder.close(); // the abandoned change starts now and must abort
		await unchanged('blocked version change');

		const old = await fence.connection();
		await fenceStoredWork(fence, select);
		console.assert(fence.sealed, 'fence keeps the page sealed after deleting');
		let staleWrite: unknown;
		try {
			old.transaction('projects', 'readwrite');
		} catch (error) {
			staleWrite = error;
		}
		console.assert(
			(staleWrite as DOMException)?.name === 'InvalidStateError',
			"the deleting page's old connection can no longer write"
		);
		const earlier = await refused(
			new Promise<IDBDatabase>((resolve, reject) => {
				const r = indexedDB.open(tag, before.version);
				r.onsuccess = () => resolve(r.result);
				r.onerror = () => reject(r.error);
			})
		);
		console.assert(
			(earlier as DOMException)?.name === 'VersionError',
			'a page opening the earlier version cannot write into the emptied library'
		);
		fence.reset();
		fence.sealed = false;
		const after = await snapshot();
		console.assert(
			after.version === before.version + 1 &&
				stableStringify(after.projects) ===
					stableStringify([`${RETAINED_ARCHIVE_PREFIX}x`, 'rig-kept']) &&
				after.jobs.length === 0 &&
				stableStringify(after.blobs) === stableStringify([shared, orphan].sort()),
			'fence deletes the chosen records and only the artwork just they used'
		);
	} finally {
		(await connection.pending?.catch(() => undefined))?.close();
		await (await fence.presence?.catch(() => undefined))?.release();
		await new Promise((resolve) => {
			const r = indexedDB.deleteDatabase(tag);
			r.onsuccess = r.onerror = r.onblocked = resolve;
		});
	}
}
