// Free: the colors the production rim guard (dropKeyOutline) removes on the real frozen benchmark, per case, with how many are dark
// (luminance < 0.25). The source of the redraw colors in lpc-fairness.ts. Labels are unknown: some drops are item px.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/lpc-fairness/bench-drops.ts
import { readFileSync } from 'node:fs';
import { chromaMask, dropKeyOutline, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { runPipe } from '../extraction/bench-replay.ts';
import { FIX } from '../extraction/lib.ts';
const lum = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: any) => c.key !== 'none' && !c.role);
for (const c of cases) {
  const run = await runPipe(c), cols = new Map<string, number>();
  let n = 0, dark = 0;
  for (const x of [...run.kf, ...run.cells]) {
    const m = chromaMask(x.out, c.key as Key), d = dropKeyOutline(m, x.base, x.out, c.key as Key), o = x.out.data;
    for (let p = 0; p < m.length; p++) if (m[p] && !d[p]) { n++; const k = [o[p*4],o[p*4+1],o[p*4+2]]; if (lum(k[0],k[1],k[2]) < 0.25) dark++; const s = k.join(','); cols.set(s, (cols.get(s) ?? 0) + 1); }
  }
  console.log(c.id, c.key, 'dropped', n, 'dark', dark, [...cols].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + 'x' + v).join(' '));
}
