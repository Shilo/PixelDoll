// Audit: share of body px that dropKeyOutline treats as "dark base" (mean RGB < 60, chroma.ts L96) as skin darkens,
// versus a relative rule (lowest 20 % of the cell's own luminance range, the same normalization toChroma uses).
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/dark-base.ts
import { baseCell, clone } from '../extraction/lib.ts';
const B = await baseCell('A', 'south', 'rest');
const lum = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
for (const f of [1, 0.8, 0.6, 0.42]) {
  const D = clone(B); for (let i = 0; i < D.data.length; i += 4) for (let j = 0; j < 3; j++) D.data[i + j] = Math.round(D.data[i + j] * f);
  let n = 0, abs = 0, rel = 0, lo = 1e9, hi = -1;
  for (let i = 0; i < D.data.length; i += 4) if (D.data[i + 3]) { lo = Math.min(lo, lum(D.data, i)); hi = Math.max(hi, lum(D.data, i)); }
  for (let i = 0; i < D.data.length; i += 4) if (D.data[i + 3]) { n++; if ((D.data[i] + D.data[i + 1] + D.data[i + 2]) / 3 < 60) abs++; if (lum(D.data, i) <= lo + 0.2 * (hi - lo)) rel++; }
  console.log(`body x${f}: absolute dark ${(100 * abs / n).toFixed(1)} %, relative dark ${(100 * rel / n).toFixed(1)} % of ${n} body px`);
}
