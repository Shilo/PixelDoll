// Review of the staged measured-key change: synthetic keyframes (truth known by construction) on the exact keyed body A south
// rest, run through the production extractor, the emulated keyframe G3/G4 gates and the production measuredKeyCollision.
//  1. False K1 notes: realistic palettes whose prompt allows the key and whose colors stay below KT (nothing is lost).
//  2. True collisions, for contrast.
//  3. Retry key versus pickKey(prompt): mannequin drift (G3 with a clean item) and dilution of the measured colors by
//     off-body key px (a small pink trim on a drifting mannequin).
// Offline, production code imported. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/measured-key-synthetic.ts
import { keyScore, KT, pickKey, toChroma, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { extractCell, GATES } from '../../../../../app/src/lib/items/items.ts';
import { measuredKeyCollision } from '../../../../../app/src/lib/items/run.ts';
import { baseCell, clone, set, type Img } from '../extraction/lib.ts';
import { rampDist, runPipe } from '../extraction/bench-replay.ts';
import { readFileSync } from 'node:fs';
import { FIX } from '../extraction/lib.ts';

const B = await baseCell('A', 'south', 'rest'), W = B.w, H = B.h, band = { x: 0, y: 0, w: 1e3, h: H };
const onBody = (x: number, y: number) => B.data[(y * W + x) * 4 + 3] > 0;
type Paint = (x: number, y: number) => number[] | undefined;
const torso = (pal: number[][]): Paint => (x, y) => (y >= 29 && y <= 45 && x >= 22 && x <= 41 && onBody(x, y) ? pal[(x + 2 * y) % pal.length] : undefined);
const cloak = (pal: number[][]): Paint => (x, y) => (y >= 27 && y <= 52 && x >= 16 && x <= 47 && (onBody(x, y) || x < 22 || x > 41) ? pal[(y + (x >> 2)) % pal.length] : undefined);
const hood = (pal: number[][]): Paint => (x, y) => (y >= 8 && y <= 22 && x >= 22 && x <= 41 ? pal[(x + y) % pal.length] : undefined);

function evalCase(prompt: string, paint: Paint, opts: { key?: Key; drift?: number } = {}) {
  const key = opts.key ?? pickKey(prompt), K = toChroma(B, key), C = clone(K), truth = new Uint8Array(W * H);
  // drift: the mannequin redrawn `drift` px to the right (keyed body shifted, the original silhouette kept underneath)
  if (opts.drift) for (let y = 0; y < H; y++) for (let x = W - 1; x >= opts.drift; x--) { const p = (y * W + x - opts.drift) * 4; if (K.data[p + 3]) C.data.set(K.data.subarray(p, p + 4), (y * W + x) * 4); }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = paint(x, y); if (c) { set(C, x, y, c); truth[y * W + x] = 1; } }
  const cell = extractCell({ key: 'rest/south/0', call: 0, base: B, out: C, route: key, band });
  let n = 0, lost = 0;
  for (let p = 0; p < truth.length; p++) if (truth[p]) { n++; if (!cell.mask[p]) lost++; }
  const g1 = new Map<number, string>(), pre = [(cell.keyOutside ?? 0) > GATES.keyOutside && `G3 ${cell.keyOutside!.toFixed(3)}`, !cell.area && 'G4'].filter(Boolean) as string[];
  if (pre.length) g1.set(0, pre.map((s) => s.startsWith('G3') ? `G3 keyframe rest/south/0 key outside ${s.slice(3)}` : 'G4 keyframe rest/south/0: item missing').join('; '));
  const retry = measuredKeyCollision(prompt, key, [cell], [{ k: 0, key: 'rest/south/0', out: C }], g1);
  const k1 = /K1 keyframe [^:]+: (\d+) %/.exec(g1.get(0) ?? '')?.[1];
  return { key, n, lost, pre: pre.join(',') || '-', k1: k1 ? `${k1} %` : '-', retry: retry ?? '-', C, cell };
}
const row = (id: string, prompt: string, r: ReturnType<typeof evalCase>) => console.log(`  ${id.padEnd(36)} "${prompt}" key ${r.key.padEnd(7)} item ${String(r.n).padStart(3)} lost ${String(r.lost).padStart(3)} gates ${r.pre.padEnd(9)} K1 ${r.k1.padEnd(5)} retry ${r.retry}`);

console.log('1. Palettes the prompt allows on the key, nothing lost (any K1 here is a false note):');
const FALSE: [string, string, Paint][] = [
  ['brown leather, olive edge spill', 'a brown leather vest', torso([[112, 72, 40], [140, 95, 55], [80, 50, 30], [96, 112, 60]])],
  ['military jacket, olive drab', 'a military field jacket', torso([[85, 107, 47], [107, 142, 35], [70, 90, 40], [120, 150, 60]])],
  ['khaki jacket', 'a khaki safari jacket', torso([[195, 176, 128], [160, 145, 100], [120, 110, 75]])],
  ['yellow raincoat, olive shadow', 'a yellow raincoat', torso([[230, 200, 40], [190, 165, 30], [140, 130, 30], [120, 120, 40]])],
  ['gold crown, greenish shadow', 'a gold crown', hood([[212, 175, 55], [170, 140, 40], [110, 100, 35], [90, 96, 40]])],
  ['dark brown cloak, olive-black shade', 'a long traveler cloak', cloak([[60, 45, 30], [80, 60, 40], [36, 49, 12], [45, 40, 25]])],
  ['black leather, green-tinted shade', 'black leather armor', torso([[30, 30, 34], [45, 45, 50], [25, 40, 28], [60, 60, 66]])],
  ['steel helmet (blue key? no: green)', 'a steel helmet', hood([[178, 180, 192], [130, 132, 140], [90, 92, 100]])],
  ['bronze armor, verdigris', 'bronze armor', torso([[180, 120, 60], [140, 90, 45], [90, 120, 90], [100, 70, 35]])],
  ['dusty rose (magenta key)', 'a green hood with a soft trim', hood([[60, 140, 50], [40, 110, 35], [170, 120, 150], [150, 100, 140]])],
];
for (const [id, prompt, paint] of FALSE) row(id, prompt, evalCase(prompt, paint));

console.log('2. True collisions (key-colored item px the prompt never named):');
const TRUE: [string, string, Paint][] = [
  ['goblin armor (yellow-green)', 'goblin armor', torso([[64, 98, 40], [86, 130, 52], [110, 160, 64], [140, 190, 80]])],
  ['ranger hood (forest, unnamed)', 'a ranger hood', hood([[34, 60, 40], [46, 80, 52], [60, 100, 66]])],
  ['elven cloak (forest)', 'elven cloak', cloak([[24, 64, 36], [34, 85, 51], [46, 110, 66], [70, 140, 90]])],
];
for (const [id, prompt, paint] of TRUE) row(id, prompt, evalCase(prompt, paint));

console.log('3a. Mannequin drift (G3) with a clean, prompt-safe item:');
for (const [id, prompt, paint] of [FALSE[0], FALSE[7]]) row(`${id}, drift 1`, prompt, evalCase(prompt, paint, { drift: 1 }));
console.log('3b. Dilution: a small hood with a pink trim (magenta-unsafe) on a drifting mannequin:');
const trim = (frac: number): Paint => (x, y) => (y >= 8 && y <= 13 && x >= 26 && x <= 37 ? (((x + y) % Math.round(1 / frac)) === 0 ? [225, 95, 165] : [110, 75, 45]) : undefined);
for (const drift of [0, 1, 2]) for (const frac of [0.05, 0.1]) {
  const r = evalCase('a leather hood with a trim', trim(frac), { drift });
  let pinkKept = 0, pink = 0;
  for (let p = 0; p < W * H; p++) if (r.C.data[p * 4] === 225 && r.C.data[p * 4 + 1] === 95) { pink++; if (r.cell.mask[p]) pinkKept++; }
  row(`trim ${frac * 100} % pink, drift ${drift} (pink ${pinkKept}/${pink} kept)`, 'a leather hood with a trim', r);
  if (r.retry === 'magenta') console.log(`      pink #e15fa5 on magenta scores ${keyScore('magenta', 225, 95, 165)} (>= KT ${KT}: keyed out on the retry)`);
}

console.log('3c. Second attempt already on a measured key (magenta, after goblin armor collided on green) returns an empty view:');
row('empty dressed view (G4, nothing measured)', 'goblin armor', evalCase('goblin armor', () => undefined, { key: 'magenta' }));

console.log('4. Ramp distance of off-body key px on real keyframes that trigger the retry key (mannequin ~ <= 16, item far):');
interface Case { id: string; body: string; slot: string; key: Key; pad: number; clips: string[]; role?: string }
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
for (const id of ['n-cloak128', 'a-jester-magenta', 'b-jester']) {
  const c = cases.find((x) => x.id === id)!, run = await runPipe(c as never);
  for (const x of run.kf) {
    const d: number[] = [];
    for (let p = 0; p < x.mask.length; p++) { const o = x.out.data; if (!x.base.data[p * 4 + 3] && o[p * 4 + 3] >= 128 && keyScore(c.key, o[p * 4], o[p * 4 + 1], o[p * 4 + 2]) >= KT) d.push(rampDist(c.key, o[p * 4], o[p * 4 + 1], o[p * 4 + 2])); }
    if (!d.length) continue;
    const near = d.filter((v) => v <= 16).length;
    console.log(`  ${id.padEnd(17)} ${x.key.padEnd(20)} off-body key px ${String(d.length).padStart(4)}, ramp-like (<= 16) ${near}, item px ${x.area}`);
  }
}
const _: Img | undefined = undefined; void _;
