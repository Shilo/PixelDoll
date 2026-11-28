// Linked project folders, one per character, and PixelDoll's trusted record of what it wrote into each, in their own small
// database. Kept apart from the library so the feature can be absent, fail or be cleared without touching saved
// characters, so backups never carry a device's folder handle, and so nothing in the user's folder can claim ownership.
import { PENDING, type FolderRecord, type PlanAction } from './plan.ts';
import type { Engine } from '../store/manifest.ts';

export interface FolderLink {
	characterId: string;
	handle: FileSystemDirectoryHandle;
	/** The picked folder, the same for every link to it (found with isSameEntry when linking), so the characters there
	 *  share one trusted record and one lock for their engine's runtime. */
	destinationId: string;
	/** The subfolder PixelDoll manages inside the picked folder, fixed at link time so renames never move files. */
	subfolder: string;
	engine: Engine;
	/** Republish after every saved change; off means only Publish now writes. */
	auto: boolean;
	linkedAt: string;
	/** The exportedAt written last, reused until the files change so an unchanged character rewrites nothing. */
	exportedAt?: string;
	publishedAt?: string;
	/** A fingerprint of everything the last complete publish built from, and the hash of each file it produced: a
	 *  background check of an unchanged character then checks those against the record without building. */
	inputs?: string;
	files?: Record<string, string>;
	/** Files found already holding exactly the export when this folder was chosen, offered once to be kept updated;
	 *  stored so the offer survives a reload until it is answered. */
	offered?: PlanAction[];
}

const DB = 'pixeldoll-project-folders';
const STORE = 'links';
/** One entry per written or kept path: { link, path, hash?, kept? }, keyed by [link, path]. */
const FILES = 'files';
/** Every folder ever linked, by id, kept after its links go, so the shared runtime's record and revision floor stay tied
 *  to that folder when it is picked again. */
const DESTINATIONS = 'destinations';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'));
		const request = indexedDB.open(DB, 3);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE))
				db.createObjectStore(STORE, { keyPath: 'characterId' });
			if (!db.objectStoreNames.contains(FILES))
				db.createObjectStore(FILES, { keyPath: ['link', 'path'] }).createIndex('link', 'link');
			if (!db.objectStoreNames.contains(DESTINATIONS))
				db.createObjectStore(DESTINATIONS, { keyPath: 'id' });
		};
		let blocked = false;
		request.onsuccess = () => {
			// An open that was blocked and later succeeds is no longer wanted: close it instead of leaking it.
			if (blocked) request.result.close();
			else {
				// A newer PixelDoll upgrading the database in another tab must not wait for this connection.
				request.result.onversionchange = () => request.result.close();
				resolve(request.result);
			}
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => {
			blocked = true;
			reject(new Error('Project folder storage is blocked by another tab'));
		};
	});
}

async function run<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => IDBRequest,
	name = STORE
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(name, mode);
			const request = work(tx.objectStore(name));
			tx.oncomplete = () => resolve(request.result as T);
			tx.onabort = tx.onerror = () => reject(tx.error ?? request.error);
		});
	} finally {
		db.close();
	}
}

const isLink = (value: unknown): value is FolderLink => {
	const v = value as Partial<FolderLink> | undefined;
	return (
		!!v &&
		typeof v.characterId === 'string' &&
		typeof v.destinationId === 'string' &&
		typeof v.subfolder === 'string' &&
		typeof v.engine === 'string' &&
		typeof v.auto === 'boolean' &&
		typeof v.linkedAt === 'string' &&
		typeof (v.handle as FileSystemDirectoryHandle | undefined)?.getDirectoryHandle === 'function'
	);
};

/** The character's link; a malformed record (an older or damaged one) reads as no link. */
export async function getLink(characterId: string): Promise<FolderLink | null> {
	const value = await run<unknown>('readonly', (s) => s.get(characterId));
	return isLink(value) ? value : null;
}

/** Removes the character's link, only while it is still the one made at `linkedAt`. Resolves to whether it did. */
export async function deleteLink(characterId: string, linkedAt: string): Promise<boolean> {
	const db = await open();
	try {
		return await new Promise<boolean>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			let deleted = false;
			const read = store.get(characterId);
			read.onsuccess = () => {
				const current: unknown = read.result;
				if (isLink(current) && current.linkedAt === linkedAt) {
					store.delete(characterId);
					deleted = true;
				}
			};
			tx.oncomplete = () => resolve(deleted);
			tx.onabort = tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

/** Applies a change to the link in one transaction, only while it is still the link made at `linkedAt`: an older publish
 *  or another tab can then never bring back a stopped link or undo a newer choice. Resolves to the stored result. */
export async function updateLink(
	characterId: string,
	linkedAt: string,
	patch: Partial<
		Pick<FolderLink, 'auto' | 'exportedAt' | 'publishedAt' | 'inputs' | 'files' | 'offered'>
	>
): Promise<FolderLink | null> {
	const db = await open();
	try {
		return await new Promise<FolderLink | null>((resolve, reject) => {
			const tx = db.transaction(STORE, 'readwrite');
			const store = tx.objectStore(STORE);
			let result: FolderLink | null = null;
			const read = store.get(characterId);
			read.onsuccess = () => {
				const current: unknown = read.result;
				if (!isLink(current) || current.linkedAt !== linkedAt) return;
				result = { ...current, ...patch };
				store.put(result);
			};
			tx.oncomplete = () => resolve(result);
			tx.onabort = tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

/** The key of one link's file record: a new folder choice starts a new record. */
export const recordKey = (link: Pick<FolderLink, 'characterId' | 'linkedAt'>) =>
	`${link.characterId}|${link.linkedAt}`;

type FileEntry = { link: string; path: string; hash?: string; kept?: true; revision?: number };

/** The path of the entry holding a shared runtime's revision floor: no file has an empty path. */
const FLOOR = '';

async function inFiles<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore, done: (value: T) => void) => void,
	durability?: IDBTransactionDurability
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(FILES, mode, durability ? { durability } : undefined);
			let result: T;
			work(tx.objectStore(FILES), (value) => (result = value));
			tx.oncomplete = () => resolve(result);
			tx.onabort = tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

/** What PixelDoll wrote (or the user approved) and what the user chose to keep, for one link. */
export function readRecord(key: string): Promise<FolderRecord> {
	return inFiles('readonly', (store, done) => {
		const request = store.index('link').getAll(key);
		request.onsuccess = () => {
			const written: Record<string, string> = {};
			const kept: string[] = [];
			for (const entry of request.result as FileEntry[]) {
				if (entry.hash) written[entry.path] = entry.hash;
				if (entry.kept) kept.push(entry.path);
			}
			done({ written, kept });
		};
	});
}

/** Records that PixelDoll just left these bytes at the path; null marks it untrusted while a write is in flight. */
export function recordWritten(key: string, path: string, hash: string | null): Promise<void> {
	// A PENDING mark must be on disk before its file is written: on a power loss the browser's default (relaxed) commit
	// could otherwise lose it and leave the written file trusted under its older hash. Losing a final hash is harmless:
	// the path just stays PENDING.
	return inFiles(
		'readwrite',
		(store, done) => {
			const read = store.get([key, path]);
			read.onsuccess = () => {
				const { hash: _old, ...entry } = (read.result as FileEntry | undefined) ?? {
					link: key,
					path
				};
				store.put(hash ? { ...entry, link: key, path, hash } : { ...entry, link: key, path });
				done(undefined);
			};
		},
		hash === PENDING ? 'strict' : undefined
	);
}

/** Marks paths as kept by the user (never written again), or, with `keep` false, clears those paths' kept marks
 *  (every kept mark when `paths` is empty). */
export function setKept(key: string, paths: readonly string[], keep: boolean): Promise<void> {
	return inFiles('readwrite', (store, done) => {
		if (keep) {
			for (const path of paths) {
				const read = store.get([key, path]);
				read.onsuccess = () =>
					store.put({ ...(read.result as FileEntry | undefined), link: key, path, kept: true });
			}
		} else if (paths.length) {
			for (const path of paths) {
				const read = store.get([key, path]);
				read.onsuccess = () => {
					if (!read.result) return;
					const { kept: _kept, ...rest } = read.result as FileEntry;
					store.put(rest);
				};
			}
		} else {
			const cursor = store.index('link').openCursor(key);
			cursor.onsuccess = () => {
				const c = cursor.result;
				if (!c) return;
				const { kept: _kept, ...rest } = c.value as FileEntry;
				c.update(rest);
				c.continue();
			};
		}
		done(undefined);
	});
}

/** Stores a new link for its character in one transaction with its record: it starts empty, or, with `keepRecord`,
 *  carries over what PixelDoll knew it wrote under `previous` (the same folder picked again). The previous record goes,
 *  so a crash can never leave a link whose record is missing or belongs to another folder. While `previous` is still
 *  the stored link, its Update automatically choice is kept, since it may have changed after `link` was made. Resolves
 *  to the stored link. */
export async function replaceLink(
	link: FolderLink,
	previous: FolderLink | null,
	keepRecord: boolean
): Promise<FolderLink> {
	const db = await open();
	try {
		return await new Promise<FolderLink>((resolve, reject) => {
			const tx = db.transaction([STORE, FILES], 'readwrite');
			const links = tx.objectStore(STORE);
			let stored = link;
			const read = links.get(link.characterId);
			read.onsuccess = () => {
				const current: unknown = read.result;
				if (previous && isLink(current) && current.linkedAt === previous.linkedAt)
					stored = { ...link, auto: current.auto };
				links.put(stored);
			};
			if (previous) {
				const files = tx.objectStore(FILES);
				const to = recordKey(link);
				const cursor = files.index('link').openCursor(recordKey(previous));
				cursor.onsuccess = () => {
					const c = cursor.result;
					if (!c) return;
					if (keepRecord) files.put({ ...(c.value as FileEntry), link: to });
					c.delete();
					c.continue();
				};
			}
			tx.oncomplete = () => resolve(stored);
			tx.onabort = tx.onerror = () => reject(tx.error);
		});
	} finally {
		db.close();
	}
}

/** Drops one link's record. */
export function deleteRecord(key: string): Promise<void> {
	return inFiles('readwrite', (store, done) => {
		const cursor = store.index('link').openCursor(key);
		cursor.onsuccess = () => {
			const c = cursor.result;
			if (!c) return;
			c.delete();
			c.continue();
		};
		done(undefined);
	});
}

/** Every stored link, to stop two characters from sharing one folder. */
export const allLinks = () =>
	run<unknown[]>('readonly', (s) => s.getAll()).then((values) => values.filter(isLink));

/** The newest runtime revision any tab has started installing under this record (0 when none). A tab with an older
 *  runtime never writes it: it would replace newer runtime files with older ones. */
export function readFloor(key: string): Promise<number> {
	return inFiles('readonly', (store, done) => {
		const read = store.get([key, FLOOR]);
		read.onsuccess = () => done((read.result as FileEntry | undefined)?.revision ?? 0);
	});
}

/** Raises the floor to `revision` (never lowers it), on disk before any runtime file is written, so a crash part way
 *  through an update cannot let an older tab take the files back. Resolves to the floor now stored. */
export function raiseFloor(key: string, revision: number): Promise<number> {
	return inFiles(
		'readwrite',
		(store, done) => {
			const read = store.get([key, FLOOR]);
			read.onsuccess = () => {
				const floor = Math.max((read.result as FileEntry | undefined)?.revision ?? 0, revision);
				store.put({ link: key, path: FLOOR, revision: floor });
				done(floor);
			};
		},
		'strict'
	);
}

export interface Destination {
	id: string;
	handle: FileSystemDirectoryHandle;
	/** A Unity character was linked here: its runtime may be in the folder even without a record of writing it. */
	unity?: boolean;
}

/** Every folder PixelDoll has linked; a malformed entry is skipped. */
export const allDestinations = () =>
	run<unknown[]>('readonly', (s) => s.getAll(), DESTINATIONS).then((values) =>
		values.filter(
			(v): v is Destination =>
				typeof (v as Partial<Destination> | undefined)?.id === 'string' &&
				typeof (v as Partial<Destination>).handle?.getDirectoryHandle === 'function'
		)
	);

/** Remembers a newly linked folder. */
export const addDestination = (destination: Destination) =>
	run<IDBValidKey>('readwrite', (s) => s.put(destination), DESTINATIONS);
