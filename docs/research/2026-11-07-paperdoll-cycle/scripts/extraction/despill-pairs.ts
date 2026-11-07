// What despill actually changes on the real corpus: the most frequent raw -> shipped RGB pairs per case, their Chebyshev size,
// key score and tint of the raw color, and whether the raw color also appears unchanged elsewhere in the same layer.
// Also lists the colors of key-scoring body px far (> 24) from the production key ramp (probe A in bench-replay.ts).
import { readFileSync } from 'node:fs';
import { keyScore, KT, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { rampDist, runPipe } from './bench-replay.ts';
import { FIX, saveJson } from './lib.ts';

const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
const report: Record<string, unknown> = {};
for (const c of cases) {
  const key = c.key as Key, run = await runPipe(c), all = [...run.kf, ...run.cells];
  const pairs = new Map<string, number>(), far = new Map<string, number>();
  let big = 0, total = 0;
  for (const x of all) for (let p = 0; p < x.mask.length; p++) {
    const o = x.out.data, i = p * 4, raw = [o[i], o[i + 1], o[i + 2]];
    if (o[i + 3] >= 128 && x.base.data[i + 3] && keyScore(key, raw[0], raw[1], raw[2]) >= KT && rampDist(key, raw[0], raw[1], raw[2]) > 24) far.set(raw.join(), (far.get(raw.join()) ?? 0) + 1);
    if (!x.mask[p]) continue;
    const got = [x.layer.data[i], x.layer.data[i + 1], x.layer.data[i + 2]];
    if (got.join() === raw.join()) continue;
    total++;
    const d = Math.max(...raw.map((v, j) => Math.abs(v - got[j])));
    if (d > 24) big++;
    const k = `${raw.join()} -> ${got.join()} (d ${d}, score ${keyScore(key, raw[0], raw[1], raw[2])}, ramp ${rampDist(key, raw[0], raw[1], raw[2])})`;
    pairs.set(k, (pairs.get(k) ?? 0) + 1);
  }
  const top = [...pairs].sort((a, b) => b[1] - a[1]).slice(0, 6), farTop = [...far].sort((a, b) => b[1] - a[1]).slice(0, 4);
  report[c.id] = { key, changed: total, changedOver24: big, top, farKeyBodyColors: farTop };
  console.log(`\n${c.id} (${key}): ${total} changed, ${big} by > 24 per channel`);
  for (const [k, n] of top) console.log(`  ${String(n).padStart(6)}  ${k}`);
  if (farTop.length) console.log('  far-from-ramp key-scoring body colors:', farTop.map(([k, n]) => `${k} x${n} ramp ${rampDist(key, ...(k.split(',').map(Number) as [number, number, number]))}`).join('; '));
}
saveJson('despill-pairs.json', report);
