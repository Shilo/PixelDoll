// dropKeyOutline (chroma.ts rim guard) on the real corpus: where its removals lie (silhouette ring vs interior dark base px),
// their colors and luminance, and a counterfactual that keeps interior-dark candidates the guard was never written for.
// Also counts keyframe parts smaller than the posed size floor (items.ts sizeFloor / partFloor) and fractional alpha.
import { readFileSync } from 'node:fs';
import { chromaMask, components, dropKeyOutline, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { runPipe } from './bench-replay.ts';
import { FIX, saveJson } from './lib.ts';

const lum = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
const rows: Record<string, unknown>[] = [];
const lumHist = { ring: [0, 0, 0, 0, 0], interior: [0, 0, 0, 0, 0] }; // lum <=.1, <=.2, <=.3, <=.4, >.4
const colors = new Map<string, number>();
for (const c of cases) {
  const key = c.key as Key, run = await runPipe(c), all = [...run.kf, ...run.cells];
  let ring = 0, interior = 0, partsBelowFloor = 0, partPx = 0, frac = 0;
  for (const x of all) {
    const { w, h } = x.base, m1 = chromaMask(x.out, key), m2 = dropKeyOutline(m1, x.base, x.out, key), op = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && x.base.data[(Y * w + X) * 4 + 3] > 0;
    for (let p = 0; p < m1.length; p++) {
      const a = x.out.data[p * 4 + 3]; if (a && a < 255) frac++;
      if (!m1[p] || m2[p]) continue;
      const X = p % w, Y = (p / w) | 0, edge = !op(X - 1, Y) || !op(X + 1, Y) || !op(X, Y - 1) || !op(X, Y + 1), l = lum(x.out.data, p * 4);
      (edge ? lumHist.ring : lumHist.interior)[Math.min(4, Math.floor(l * 10 - 1e-9) < 0 ? 0 : Math.min(4, Math.ceil(l * 10) - 1))]++;
      if (edge) ring++; else { interior++; const k = [...x.out.data.subarray(p * 4, p * 4 + 3)].join(); colors.set(`${c.id} ${k}`, (colors.get(`${c.id} ${k}`) ?? 0) + 1); }
    }
  }
  for (const k of run.kf) {
    const comps = components(k.mask, k.layer.w, k.layer.h), big = Math.max(0, ...comps.map((q) => q.length)), floor = Math.max(4, 0.15 * big);
    for (const q of comps) if (q.length < floor) { partsBelowFloor++; partPx += q.length; }
  }
  rows.push({ case: c.id, dropRing: ring, dropInteriorDark: interior, keyframePartsBelowPosedFloor: partsBelowFloor, theirPx: partPx, fractionalAlphaRawPx: frac });
}
console.table(rows);
console.log('luminance of removed px (<=.1/<=.2/<=.3/<=.4/>.4): ring', lumHist.ring.join('/'), 'interior', lumHist.interior.join('/'));
console.log('interior-dark removals by color:', [...colors].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => `${k} x${n}`).join('; '));
saveJson('rim-guard.json', { rows, lumHist, colors: [...colors] });
