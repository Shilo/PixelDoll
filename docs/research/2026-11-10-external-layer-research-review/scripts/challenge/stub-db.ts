export * from 'file:///<REPO>/app/src/lib/store/db.ts?real';
(globalThis as any).__blobs ??= new Map();
export const getBlob = async (k: string) => { const b = (globalThis as any).__blobs.get(k); if (!b) throw new Error('no blob ' + k); return new Blob([b], { type: 'image/png' }); };
