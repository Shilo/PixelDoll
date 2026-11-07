// Component sizes (8-connected) of the px dropKeyOutline removes on the real corpus, split by whether the component has any
// px off the silhouette ring, versus the synthetic thin-item cases. Supports or rejects a "large interior candidate chains
// are item" counterfactual for the rim guard.
import { readFileSync } from 'node:fs';
import { chromaMask, components, dropKeyOutline, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { runPipe } from './bench-replay.ts';
import { FIX, saveJson } from './lib.ts';

const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
const hist = { ringOnly: new Map<number, number>(), withInterior: new Map<number, number>() }, big: string[] = [];
let cellsN = 0;
for (const c of cases) {
  const key = c.key as Key, run = await runPipe(c);
  for (const x of [...run.kf, ...run.cells]) {
    cellsN++;
    const { w, h } = x.base, m1 = chromaMask(x.out, key), m2 = dropKeyOutline(m1, x.base, x.out, key), rem = m1.map((v, p) => (v && !m2[p] ? 1 : 0)) as Uint8Array;
    const op = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && x.base.data[(Y * w + X) * 4 + 3] > 0;
    for (const comp of components(rem, w, h)) {
      const interior = comp.some((p) => { const X = p % w, Y = (p / w) | 0; return op(X - 1, Y) && op(X + 1, Y) && op(X, Y - 1) && op(X, Y + 1); });
      const m = interior ? hist.withInterior : hist.ringOnly, n = Math.min(comp.length, 10);
      m.set(n, (m.get(n) ?? 0) + 1);
      if (interior && comp.length >= 4) big.push(`${c.id} ${x.key} ${comp.length}px`);
    }
  }
}
const fmt = (m: Map<number, number>) => [...m].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k === 10 ? '>=10' : k}:${v}`).join(' ');
console.log(`cells ${cellsN}`);
console.log('removed components, ring only:', fmt(hist.ringOnly));
console.log('removed components with an interior px:', fmt(hist.withInterior));
console.log('interior components >= 4 px:', big.join('; ') || 'none');
saveJson('rim-guard-components.json', { cellsN, ringOnly: [...hist.ringOnly], withInterior: [...hist.withInterior], big });
void toChroma;
