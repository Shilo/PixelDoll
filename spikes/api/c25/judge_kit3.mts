// Blind round r3: E4 concept arms (each row starts with the concept image) and the body B jester (magenta vs blue), plus placebo
// pairs from arm P and the S4 calibration pairs.
import fs from 'node:fs';
import { readOnly, items, load, OUT, exists, type Img } from './lib.mts';
readOnly();
import { writeKit, type Pair } from './blind.mts';
import { calibPairs } from './calib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { arm, CONCEPTS } from './arm_e4.mts';
import { restB, DRAWN } from './bodyB.mts';
import { fileOf } from './arm_c.mts';
import { swapGB } from './arm_dk.mts';
import { poseTask } from './arm_p.mts';
import { evaluate } from './evaluate.mts';
import { baseA, keyframeA, padOf, S4_ITEMS } from './s4rig.mts';
const rig = rigA(), skelA = (d: string) => Object.fromEntries((rig.rest as any)[d].keypoints.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
const pairs: Pair[] = [];
for (const name of ['A', 'B'] as const) {
  const concept = await load(CONCEPTS[name].file), rows: Record<string, Img[]> = {};
  for (const v of ['traw', 'tpaste', 'ea'] as const) {
    const out = (await arm(name, v))!;
    rows[v] = [concept, ...(await Promise.all(DIRS.map(async (d, i) => items.recompose(items.extractCell({ key: `rest/${d}/0`, call: 0, base: await restA(d), out: out[i], route: 'green', band: items.bandOf('head', skelA(d), 64) })))))];
  }
  for (const [a, b] of [['traw', 'tpaste'], ['traw', 'ea'], ['tpaste', 'ea']]) pairs.push({ id: `E4 ${name} ${a}-${b}`, kind: 'test', a: rows[a], b: rows[b], armA: a, armB: b });
}
const jester = async (v: string) => {
  const f = fileOf('jester', v, 'dress'); if (!exists(`${f}.json`)) return null;
  const sw = (im: Img) => (v === 'blue' ? swapGB(im) : im), key = v === 'blue' ? 'green' : 'magenta';
  return Promise.all(DRAWN.map(async (d, i) => { const c: any = items.extractCell({ key: `rest/${d}/0`, call: 0, base: await restB(d), out: sw(await load(`${f}.${i}.png`)), route: key, band: { x: 0, y: 0, w: 80, h: 80 } }); if (v === 'blue') c.layer = swapGB(c.layer); return items.recompose(c); }));
};
const jm = await jester('ctrl'), jb = await jester('blue');
if (jm && jb) pairs.push({ id: 'C jester magenta-blue', kind: 'test', a: jm, b: jb, armA: 'magenta', armB: 'blue' });
const posed = async (item: string, seed: number) => { const out = (await poseTask(item, 'ctrl', seed, 'slash', 'east'))!, slot = S4_ITEMS[item].slot; return evaluate({ name: '', slot, key: 'green', pad: padOf(slot), rig, rest: { east: await restA('east') }, dress: { east: await keyframeA(item, 'east') }, clips: [{ anim: 'slash', dir: 'east', frames: await Promise.all(out.map(async (o, i) => ({ base: await baseA('east', 'slash', i), out: o }))) }] }).cells.map((x: any) => items.recompose(x)); };
for (const item of ['cape', 'hair']) pairs.push({ id: `placebo ${item}`, kind: 'placebo', a: await posed(item, 7), b: await posed(item, 11), armA: 'ctrl s7', armB: 'ctrl s11' });
// r3 had only these 2 placebos, so any two same-side calls read as 100 % bias: r3b adds the D control seed pairs (6 more)
const { dressViews } = await import('./eval_dk.mts'), { D_ITEMS } = await import('./arm_dk.mts');
for (const name of Object.keys(D_ITEMS)) { const a = (await dressViews('D', name, 'ctrl', 7))!.map((x) => items.recompose(x.c)), b = (await dressViews('D', name, 'ctrl', 11))!.map((x) => items.recompose(x.c)); pairs.push({ id: `placebo D ${name}`, kind: 'placebo', a, b, armA: 'ctrl s7', armB: 'ctrl s11' }); }
pairs.push(...(await calibPairs()));
const k = await writeKit(process.argv[2] ?? 'r3', pairs);
console.log(`kit r3: ${k.n} pairs; ${pairs.filter((p) => p.kind === 'test').length} test`);
