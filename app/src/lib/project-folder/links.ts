// Linked project folders, one per character, in their own small database. Kept apart from the library so the feature can
// be absent, fail or be cleared without touching saved characters, and so backups never carry a device's folder handle.
import type { Engine } from '../store/manifest.ts';

export interface FolderLink {
	characterId: string;
	handle: FileSystemDirectoryHandle;
	/** The subfolder PixelDoll manages inside the picked folder, fixed at link time so renames never move files. */
	subfolder: string;
	engine: Engine;
	/** Republish after every saved change; off means only Publish now writes. */
	auto: boolean;
	linkedAt: string;
	/** The exportedAt written last, reused until the files change so an unchanged character rewrites nothing. */
	exportedAt?: string;
	publishedAt?: string;
}

const DB = 'pixeldoll-project-folders';
const STORE = 'links';

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'));
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore(STORE, { keyPath: 'characterId' });
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('Project folder storage is blocked by another tab'));
	});
}

async function run<T>(
	mode: IDBTransactionMode,
	work: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
	const db = await open();
	try {
		return await new Promise<T>((resolve, reject) => {
			const tx = db.transaction(STORE, mode);
			const request = work(tx.objectStore(STORE));
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

export const putLink = (link: FolderLink) => run<IDBValidKey>('readwrite', (s) => s.put(link));

export const deleteLink = (characterId: string) =>
	run<undefined>('readwrite', (s) => s.delete(characterId));

/** Applies a change to the link in one transaction, only while it is still the link made at `linkedAt`: an older publish
 *  or another tab can then never bring back a stopped link or undo a newer choice. Resolves to the stored result. */
export async function updateLink(
	characterId: string,
	linkedAt: string,
	patch: Partial<Pick<FolderLink, 'auto' | 'exportedAt' | 'publishedAt'>>
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
