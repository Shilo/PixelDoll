import { pathToFileURL } from 'node:url';
const NM = pathToFileURL('<MAIN_CHECKOUT>/app/package.json').href;
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx); }
  catch (e) {
    if (/^[a-z@]/i.test(spec) && !/^[a-z]:/i.test(spec) && !spec.startsWith('node:') && !spec.startsWith('file:')) return next(spec, { ...ctx, parentURL: NM });
    throw e;
  }
}
