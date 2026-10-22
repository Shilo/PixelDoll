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
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); res(r.result); }; // a newer tab's schema bump is never blocked
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('storage is held by an older PixelDoll tab; close it and reload'));
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

/** Encoding happens before this transaction, so garbage collection cannot sweep an import's partial blob writes. */
export async function putCharacter(id: string, record: unknown, blobs: Map<string, Blob>): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(['projects', 'blobs'], 'readwrite');
    for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
    t.objectStore('projects').add(record, id);
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(t.error);
  });
}

/** Publish a completed rig without a gap between new image blobs and their project references. */
export async function updateCharacter<T>(id: string, blobs: Map<string, Blob>, fn: (record: T | undefined) => T): Promise<void> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(['projects', 'blobs'], 'readwrite'), projects = t.objectStore('projects'), read = projects.get(id);
    let error: unknown;
    read.onsuccess = () => {
      try {
        const record = fn(read.result);
        for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
        projects.put(record, id);
      } catch (e) { error = e; t.abort(); }
    };
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(error ?? t.error);
  });
}

/** Publish an accepted fit, its character and PNGs in one transaction. The draft marker makes repeated acceptance safe. */
export async function updateCharacterAndDraft<T, D>(id: string, draftId: string, blobs: Map<string, Blob>, fn: (project: T | undefined, draft: D | undefined) => { project: T; draft: D }): Promise<void> {
  const database = await open();
  return new Promise((resolve, reject) => {
    const t = database.transaction(['projects', 'blobs'], 'readwrite'), projects = t.objectStore('projects');
    const project = projects.get(id), draft = projects.get(draftId); let error: unknown;
    draft.onsuccess = () => {
      try {
        const result = fn(project.result, draft.result);
        for (const [hash, blob] of blobs) t.objectStore('blobs').put(blob, hash);
        projects.put(result.project, id); projects.put(result.draft, draftId);
      } catch (e) { error = e; t.abort(); }
    };
    t.oncomplete = () => resolve(); t.onerror = t.onabort = () => reject(error ?? t.error);
  });
}

/** Delete a local character and its drafts atomically, refusing work that could later write it back. Shared blobs stay. */
export async function deleteCharacter(id: string): Promise<void> {
  if (!id.startsWith('rig-')) throw new Error('Only a saved local character can be deleted.');
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(['projects', 'jobs'], 'readwrite'), projects = t.objectStore('projects');
    const records = projects.getAll(), jobs = t.objectStore('jobs').getAll();
    let error: Error | undefined;
    jobs.onsuccess = () => {
      const busy = jobs.result.some((j) => ['queued', 'submitting', 'running'].includes(j.state));
      const work = records.result.some((r) => r.id === 'studio-create' || r.id === 'studio-move' || r.id === 'studio-setup' || (r.id === 'studio-drafts' && r.gens?.some((g: { phase: string }) => g.phase === 'running')));
      const fit = records.result.some((r) => r.kind === 'equipment-fit-draft' && r.targetId === id && !['accepted', 'discarded'].includes(r.stage));
      if (busy || work || fit) { error = new Error('Finish or dismiss pending generation work before deleting a character.'); t.abort(); return; }
      projects.delete(id);
      for (const r of records.result) {
        if (r.kind === 'equipment-fit-draft' && r.targetId === id && ['accepted', 'discarded'].includes(r.stage)) projects.delete(r.id);
        if (r.id === 'studio-drafts') projects.put({ ...r, gens: r.gens.filter((g: { draft: { rigId: string } }) => g.draft.rigId !== id) }, r.id);
        if (r.id === 'm3-drafts') projects.put({ ...r, drafts: r.drafts.filter((d: { rigId: string }) => d.rigId !== id) }, r.id);
      }
    };
    t.oncomplete = () => res();
    t.onerror = t.onabort = () => rej(error ?? t.error);
  });
}

/** Atomic read-modify-write: get + put in ONE readwrite transaction, so concurrent writers (another accept, autosave, another
 * tab) queue behind it instead of overwriting each other. `fn` must be synchronous: do async work (hashing, blob writes) first.
 * Throwing in `fn` aborts the transaction (nothing is written). */
export async function update<T>(s: StoreName, key: string, fn: (v: T | undefined) => T): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(s, 'readwrite'), o = t.objectStore(s), g = o.get(key);
    let out: T, err: unknown;
    g.onsuccess = () => { try { out = fn(g.result as T | undefined); o.put(out, key); } catch (e) { err = e; t.abort(); } };
    t.oncomplete = () => res(out);
    t.onerror = t.onabort = () => rej(err ?? t.error);
  });
}

/** Mark-and-sweep in one transaction over all stores: a blob survives when any project/draft/job record mentions its hash
 * (as "<hex>" or "sha256:<hex>"). Returns the number of blobs deleted.
 * ponytail: conservative deep string scan (a requestHash can keep a blob alive; harmless). Callers run it only while this tab
 * is idle, because writers put cell blobs one transaction before the record that references them. */
export async function gcBlobs(): Promise<number> {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(['projects', 'jobs', 'blobs'], 'readwrite');
    const p = t.objectStore('projects').getAll(), j = t.objectStore('jobs').getAll(), b = t.objectStore('blobs').getAllKeys();
    const refs = new Set<string>();
    const scan = (v: unknown): void => {
      if (typeof v === 'string') { const m = /^(?:sha256:)?([0-9a-f]{64})$/.exec(v); if (m) refs.add(m[1]); }
      else if (v && typeof v === 'object' && !(v instanceof Blob)) for (const x of Object.values(v)) scan(x);
    };
    let n = 0;
    b.onsuccess = () => { // requests in one transaction complete in order: p and j are done
      for (const r of [...p.result, ...j.result]) scan(r);
      for (const k of b.result) if (!refs.has(String(k))) { t.objectStore('blobs').delete(k); n++; }
    };
    t.oncomplete = () => res(n);
    t.onerror = t.onabort = () => rej(t.error);
  });
}

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
  await Promise.all([1, 2, 3].map(() => update<{ n: number }>('projects', k, (r) => ({ n: (r?.n ?? 0) + 1 })))); // P1-5: no lost update
  console.assert((await get<{ n: number }>('projects', k))?.n === 3, 'db update is atomic');
  await update('projects', k, () => { throw new Error('x'); }).catch(() => {});
  console.assert((await get<{ n: number }>('projects', k))?.n === 3, 'db update aborts on throw');
  await del('projects', k); // gcBlobs is not run here: it sweeps the whole origin's store (probe in B13 report)
}
