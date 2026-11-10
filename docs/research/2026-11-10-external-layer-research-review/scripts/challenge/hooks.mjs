import { pathToFileURL } from 'node:url';
const NM = pathToFileURL('<MAIN_CHECKOUT>/app/package.json').href;
const HERE = new URL('./', import.meta.url).href;
export async function resolve(spec, ctx, next) {
  const r = await (async () => { try { return await next(spec, ctx); } catch (e) {
    if (/^[a-z@]/i.test(spec) && !/^[a-z]:/i.test(spec) && !spec.startsWith('node:') && !spec.startsWith('file:')) return next(spec, { ...ctx, parentURL: NM });
    throw e; } })();
  if (r.url.endsWith('/src/lib/pixellab/queue.ts')) return { ...r, url: HERE + 'stub-queue.ts', shortCircuit: true };
  if (r.url.endsWith('/src/lib/store/db.ts')) return { ...r, url: HERE + 'stub-db.ts', shortCircuit: true };
  return r;
}
