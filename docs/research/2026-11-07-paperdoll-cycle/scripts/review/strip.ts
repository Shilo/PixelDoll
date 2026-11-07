// Review of 735b92d3: one clip of one bench case as three zoomed rows (raw output, parent result, current result) so a changed
// frame can be judged against its neighbors. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/strip.ts <case> <anim/dir> [zoom] [x0 y0 x1 y1]
import { readFileSync, writeFileSync } from 'node:fs';
import { encodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import { FIX, makeImg, type Img } from '../extraction/lib.ts';
import { NEW, OLD, run, type Case } from './compare-735b.ts';

const [id, clip, zs, ...box] = process.argv.slice(2), Z = Number(zs ?? 4);
const c: Case = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).find((x: Case) => x.id === id);
const a = await run(OLD, c), b = await run(NEW, c);
const sel = b.cells.map((x, i) => [x, a.cells[i]] as const).filter(([x]) => x.key.startsWith(clip + '/'));
const W = b.cells[0].layer.w, [x0, y0, x1, y1] = box.length ? box.map(Number) : [0, 0, W - 1, W - 1], cw = x1 - x0 + 1, ch = y1 - y0 + 1;
const o = makeImg((cw * Z + 4) * sel.length, (ch * Z + 4) * 3);
const put = (row: number, col: number, f: (p: number) => number[]) => {
  for (let y = 0; y < ch * Z; y++) for (let x = 0; x < cw * Z; x++) { const p = (y0 + ((y / Z) | 0)) * W + x0 + ((x / Z) | 0); o.data.set(f(p), ((row * (ch * Z + 4) + y) * o.w + col * (cw * Z + 4) + x) * 4); }
};
const comp = (base: Img, layer: Img, mask: Uint8Array, other?: Uint8Array) => (p: number) => {
  if (mask[p]) return other && !other[p] ? [255, 0, 255, 255] : [...layer.data.subarray(p * 4, p * 4 + 3), 255];
  if (base.data[p * 4 + 3]) { const g = 60 + (base.data[p * 4] + base.data[p * 4 + 1] + base.data[p * 4 + 2]) / 12; return [g, g, g, 255]; }
  return [32, 32, 40, 255];
};
sel.forEach(([n, old], col) => {
  const raw = b.raws.get(n.key)!;
  put(0, col, (p) => (raw.data[p * 4 + 3] ? [...raw.data.subarray(p * 4, p * 4 + 3), 255] : [255, 255, 255, 255]));
  put(1, col, comp(old.base, old.layer, old.mask));
  put(2, col, comp(n.base, n.layer, n.mask, old.mask)); // magenta = kept only by the current code
});
const out = new URL(`../../../../../app/test-results-review/735b/strip-${id}-${clip.replace('/', '_')}.png`, import.meta.url);
writeFileSync(out, await encodePngBytes(o));
console.log(out.pathname);
