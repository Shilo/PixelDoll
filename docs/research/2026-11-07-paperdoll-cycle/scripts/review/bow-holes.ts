// Review of 735b92d3: the bench.test.ts grip-hole count (stand-in px off the body, within 2 px of the bow, left transparent)
// per a-bow96 cell for the parent and current cleanup, and whether each new hole sits next to a newly kept bow part.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/review/bow-holes.ts
import { readFileSync } from 'node:fs';
import { keyScore, KT } from '../../../../../app/src/lib/image/chroma.ts';
import { FIX } from '../extraction/lib.ts';
import { NEW, OLD, run, type Case } from './compare-735b.ts';

const c: Case = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).find((x: Case) => x.id === 'a-bow96');
const holesOf = (cell: any) => {
  const w = cell.base.w, o = cell.out.data, out: number[] = [];
  const near = (x: number, y: number) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < w && cell.mask[Y * w + X]) return true; } return false; };
  for (let p = 0; p < cell.mask.length; p++) if (!cell.base.data[p * 4 + 3] && !cell.mask[p] && o[p * 4 + 3] >= 128 && keyScore('green', o[p * 4], o[p * 4 + 1], o[p * 4 + 2]) >= KT && near(p % w, (p / w) | 0)) out.push(p);
  return out;
};
const a = await run(OLD, c), b = await run(NEW, c);
let to = 0, tn = 0;
for (const [i, cn] of b.cells.entries()) {
  const co = a.cells[i], ho = holesOf(co), hn = holesOf(cn), w = cn.base.w;
  to += ho.length; tn += hn.length;
  const fresh = hn.filter((p) => !ho.includes(p)), gone = ho.filter((p) => !hn.includes(p));
  const nextToAdded = fresh.filter((p) => { const x = p % w, y = (p / w) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = (y + dy) * w + x + dx; if (cn.mask[q] && !co.mask[q]) return true; } return false; });
  if (ho.length || hn.length) console.log(cn.key, 'old', ho.length, 'new', hn.length, 'fresh', fresh.length, 'next to newly kept px', nextToAdded.length, 'gone', gone.length);
}
console.log('total old', to, 'new', tn);
