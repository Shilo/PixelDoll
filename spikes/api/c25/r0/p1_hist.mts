// P1: key-score histogram over real outputs (opaque px on the base silhouette). If few px sit near KT = 35, the threshold is not a lever.
import { chroma, load, EV } from './lib.mts';
import { readdirSync } from 'node:fs';
const sets: [string, RegExp, 'green' | 'magenta'][] = [
  ['s4 ea2 green', /^sk_ea2_\w+_(south|east|north)\.out\d+\.png$/, 'green'],
  ['s5 posed green', /^pose_\w+_s7_\d+\.png$/, 'green'],
  ['s2 x1 magenta', /^\w+_magenta_ea2\.out\d+\.png$/, 'magenta'],
  ['s2 x1 green', /^\w+_green_ea2\.out\d+\.png$/, 'green'],
];
const dirs: Record<string, string> = { 's4 ea2 green': 's4_items', 's5 posed green': 's5_held', 's2 x1 magenta': 's2_x1', 's2 x1 green': 's2_x1' };
for (const [name, re, key] of sets) {
  const files = readdirSync(EV + dirs[name]).filter((f) => re.test(f));
  const bins = new Array(11).fill(0); let n = 0;
  for (const f of files) {
    const im = await load(`${dirs[name]}/${f}`);
    for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3] >= 128) { const s = chroma.keyScore(key, im.data[i], im.data[i + 1], im.data[i + 2]); bins[Math.min(10, Math.floor(s / 10))]++; n++; }
  }
  console.log(name.padEnd(16), files.length, 'frames', n, 'px | % per score decile 0-9,10-19..100:', bins.map((b) => ((100 * b) / n).toFixed(2)).join(' '));
}
