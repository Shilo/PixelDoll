// IndexedDB "pixeldoll": projects (manifest JSON), blobs (sha256-keyed Blobs), jobs (queue ledger).
import { sha256 } from '../image/hash.ts';

export type StoreName = 'projects' | 'blobs' | 'jobs';
const DB = 'pixeldoll', VERSION = 1;

let dbp: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of ['projects', 'blobs', 'jobs']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}

async function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req.result);
    t.onerror = t.onabort = () => rej(t.error ?? req.error);
  });
}

export const get = <T>(s: StoreName, key: string) => tx<T | undefined>(s, 'readonly', (o) => o.get(key));
export const put = (s: StoreName, key: string, value: unknown) => tx(s, 'readwrite', (o) => o.put(value, key)).then(() => undefined);
export const del = (s: StoreName, key: string) => tx(s, 'readwrite', (o) => o.delete(key));
export const all = <T>(s: StoreName) => tx<T[]>(s, 'readonly', (o) => o.getAll());
export const clear = (s: StoreName) => tx(s, 'readwrite', (o) => o.clear());

// Content-addressed: key = sha256 hex of the bytes. Identical files dedupe.
export async function putBlob(bytes: Uint8Array, type = 'image/png'): Promise<string> {
  const key = await sha256(bytes);
  if (!(await get('blobs', key))) await put('blobs', key, new Blob([bytes as Uint8Array<ArrayBuffer>], { type }));
  return key;
}
export const getBlob = (key: string) => get<Blob>('blobs', key);

let persistAsked = false;
export function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

export async function selfTest() {
  const k = 'selftest-' + Math.random();
  await put('projects', k, { a: 1 });
  console.assert((await get<{ a: number }>('projects', k))?.a === 1, 'db put/get');
  await del('projects', k);
  console.assert((await get('projects', k)) === undefined, 'db delete');
  const sha = await putBlob(new Uint8Array([1, 2, 3]), 'application/octet-stream');
  console.assert(sha === '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81', 'putBlob key');
  console.assert((await getBlob(sha))?.size === 3, 'getBlob');
  await del('blobs', sha);
}
