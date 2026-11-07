// Review of the staged measured-key change: does a candidate refinement of nearKeyShare separate the one clean benchmark view
// that reads as a collision (n-cloak128 north, 53 %: a very dark olive shadow #24310c whose 13-level key excess is amplified by
// the ratio score) from the recorded collisions (a-jester-magenta, a-stripes-magenta, b-jester)? Variant: ignore near-key px whose
// brightest channel is below V (dark px, where keyScore is a ratio of small numbers). Also replays the synthetic palettes of
// measured-key-synthetic.ts. Offline. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/measured-key-variants.ts
import { readFileSync } from 'node:fs';
import { keyScore, KT, NEAR_KEY, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import type { Img } from '../../../../../app/src/lib/image/png.ts';
import { FIX } from '../extraction/lib.ts';
import { runPipe } from '../extraction/bench-replay.ts';

const share = (out: Img, mask: Uint8Array, key: Key, V: number) => {
  let item = 0, near = 0;
  for (let p = 0; p < mask.length; p++) if (mask[p]) {
    item++;
    const r = out.data[p * 4], g = out.data[p * 4 + 1], b = out.data[p * 4 + 2], s = keyScore(key, r, g, b);
    if (s >= NEAR_KEY && s < KT && Math.max(r, g, b) >= V) near++;
  }
  return item ? near / item : 0;
};
interface Case { id: string; body: string; slot: string; key: Key | 'none'; pad: number; clips: string[]; role?: string }
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.key !== 'none');
const Vs = [0, 48, 64, 80];
console.log(`max near-key share over dressed views, brightest channel >= V (V = ${Vs.join(', ')}); * = at or above 0.2`);
for (const c of cases) {
  const run = await runPipe(c as never);
  const row = Vs.map((V) => Math.max(...run.kf.map((x) => share(x.out, x.mask, c.key as Key, V))));
  console.log(`  ${(c.id + (c.role ? ' [ref]' : '')).padEnd(24)} ${row.map((s) => `${(s * 100).toFixed(0).padStart(3)} %${s >= 0.2 ? '*' : ' '}`).join('  ')}`);
}
// synthetic palettes (same colors as measured-key-synthetic.ts, uniform share per color)
const PAL: [string, Key, number[][]][] = [
  ['military jacket, olive drab', 'green', [[85, 107, 47], [107, 142, 35], [70, 90, 40], [120, 150, 60]]],
  ['dark brown cloak, olive-black', 'green', [[60, 45, 30], [80, 60, 40], [36, 49, 12], [45, 40, 25]]],
  ['black leather, green-tinted', 'green', [[30, 30, 34], [45, 45, 50], [25, 40, 28], [60, 60, 66]]],
  ['bronze, verdigris', 'green', [[180, 120, 60], [140, 90, 45], [90, 120, 90], [100, 70, 35]]],
  ['dusty rose on magenta', 'magenta', [[60, 140, 50], [40, 110, 35], [170, 120, 150], [150, 100, 140]]],
  ['ranger hood, unnamed forest', 'green', [[34, 60, 40], [46, 80, 52], [60, 100, 66]]],
  ['goblin armor', 'green', [[64, 98, 40], [86, 130, 52], [110, 160, 64], [140, 190, 80]]],
];
console.log('synthetic palettes, near share of the colors that are kept (score < KT):');
for (const [id, key, pal] of PAL) {
  const kept = pal.filter((c) => keyScore(key, c[0], c[1], c[2]) < KT);
  const row = Vs.map((V) => kept.filter((c) => { const s = keyScore(key, c[0], c[1], c[2]); return s >= NEAR_KEY && Math.max(...c) >= V; }).length / Math.max(1, kept.length));
  console.log(`  ${id.padEnd(30)} ${row.map((s) => `${(s * 100).toFixed(0).padStart(3)} %${s >= 0.2 ? '*' : ' '}`).join('  ')}`);
}
