// Preload (node --import): every import of production chroma.ts resolves to chroma-x.ts, which wraps chromaLayer with the
// prototype outline rule (variant chosen at run time by globalThis.__OUTLINE; 'off' = production behavior).
import { registerHooks } from 'node:module';
const WRAP = new URL('./chroma-x.ts', import.meta.url).href;
registerHooks({
  resolve(spec, ctx, next) {
    const r = next(spec, ctx);
    if (r.url.endsWith('/app/src/lib/image/chroma.ts')) return { ...r, url: WRAP };
    return r;
  },
});
