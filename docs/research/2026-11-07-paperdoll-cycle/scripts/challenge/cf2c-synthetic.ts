// CF2c (CF2b without restoring px production despill leaves near-gray) on the extraction spike's synthetic ground truth.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/challenge/cf2c-synthetic.ts
import { absorbOutline, chromaMask, components, despill, dropKeyOutline, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { makeImg } from '../../../../../app/src/lib/image/png.ts';
import { despillCF } from '../extraction/counterfactuals.ts';
import { B as BA, cases } from '../extraction/synthetic-mutations.ts';
import type { Img } from '../extraction/lib.ts';
const chroma3 = (c: ArrayLike<number>) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
const rows: Record<string, unknown>[] = [];
for (const c of cases) {
  const B = c.body ?? BA, key = c.key as Key, m0 = absorbOutline(dropKeyOutline(chromaMask(c.C, key), B, c.C, key), B, c.C, key);
  const mask = new Uint8Array(m0.length), L = makeImg(c.C.w, c.C.h);
  for (const comp of components(m0, c.C.w, c.C.h)) if (comp.length >= 2) for (const p of comp) { mask[p] = 1; L.data.set(c.C.data.subarray(p * 4, p * 4 + 4), p * 4); }
  const P = despill(L, key), Q = despillCF(L, key, true), R: Img = { w: L.w, h: L.h, data: new Uint8ClampedArray(Q.data) };
  for (let i = 0; i < R.data.length; i += 4) if (chroma3(P.data.subarray(i, i + 3)) < 16) R.data.set(P.data.subarray(i, i + 4), i);
  const exact = (im: Img) => { let n = 0; for (let p = 0; p < mask.length; p++) if (mask[p] && c.item[p] && [0, 1, 2].every((j) => im.data[p * 4 + j] === c.rgb.get(p)![j])) n++; return n; };
  rows.push({ case: c.id, prod: exact(P), CF2b: exact(Q), CF2c: exact(R) });
}
console.table(process.argv.includes("--all") ? rows : rows.filter((r) => r.prod !== r.CF2b || r.CF2b !== r.CF2c));
