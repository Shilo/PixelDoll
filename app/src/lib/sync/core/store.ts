// Sync's own local database, "pixeldoll-sync": kept apart from "pixeldoll", whose version is Delete local work's fence.
// kv: this device's sync state and sign-in; revs: every revision this device has read or made (bodies hold item object
// references); objects: item objects by content hash. Nothing here is ever synced, exported or broadcast.
import { SYNC_DATABASE } from '../connection.ts';

export type SyncStoreName = 'kv' | 'revs' | 'objects';

export interface SyncStore {
	get<T>(store: SyncStoreName, key: string): Promise<T | undefined>;
	put(store: SyncStoreName, key: string, value: unknown): Promise<void>;
	del(store: SyncStoreName, key: string): Promise<void>;
}

const STORES: SyncStoreName[] = ['kv', 'revs', 'objects'];

/** Tests and one-off imports: the same interface in memory. */
export class MemoryStore implements SyncStore {
	private maps = new Map<SyncStoreName, Map<string, unknown>>(
		STORES.map((name) => [name, new Map()])
	);
	async get<T>(store: SyncStoreName, key: string) {
		return structuredClone(this.maps.get(store)!.get(key)) as T | undefined;
	}
	async put(store: SyncStoreName, key: string, value: unknown) {
		this.maps.get(store)!.set(key, structuredClone(value));
	}
	async del(store: SyncStoreName, key: string) {
		this.maps.get(store)!.delete(key);
	}
}

export class IndexedSyncStore implements SyncStore {
	private db?: Promise<IDBDatabase>;
	private open() {
		return (this.db ??= new Promise((resolve, reject) => {
			const request = indexedDB.open(SYNC_DATABASE, 1);
			request.onupgradeneeded = () => {
				for (const name of STORES)
					if (!request.result.objectStoreNames.contains(name))
						request.result.createObjectStore(name);
			};
			request.onsuccess = () => {
				// Delete local work removes this database: let it, and open again on the next use.
				request.result.onversionchange = () => {
					request.result.close();
					this.db = undefined;
				};
				resolve(request.result);
			};
			request.onerror = () => reject(request.error);
			request.onblocked = () => reject(new Error('Cloud Save storage is held by another tab.'));
		}));
	}
	private async run<T>(
		store: SyncStoreName,
		mode: IDBTransactionMode,
		use: (s: IDBObjectStore) => IDBRequest<T>
	) {
		const db = await this.open();
		return new Promise<T>((resolve, reject) => {
			const t = db.transaction(store, mode);
			const request = use(t.objectStore(store));
			t.oncomplete = () => resolve(request.result);
			t.onerror = t.onabort = () => reject(t.error ?? request.error);
		});
	}
	get<T>(store: SyncStoreName, key: string) {
		return this.run<T | undefined>(store, 'readonly', (s) => s.get(key));
	}
	async put(store: SyncStoreName, key: string, value: unknown) {
		await this.run(store, 'readwrite', (s) => s.put(value, key));
	}
	async del(store: SyncStoreName, key: string) {
		await this.run(store, 'readwrite', (s) => s.delete(key));
	}
}
