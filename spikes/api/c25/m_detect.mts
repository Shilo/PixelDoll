// Arm M (offline, 0 gens): a measured key-collision check on the dressed keyframes. flag = G3 key outside > 0.02, or >= 10 % of
// item px with an own-key score just under the cut (20 <= score < KT 35: item colors drifting toward the key). Run over every
// stored dress output with its real base views; prints each set with its known visual verdict.
import fs from 'node:fs';
import path from 'node:path';
import { readOnly, items, chroma, load, type Img } from './lib.mts';
readOnly();
import { restA, DIRS } from './s4rig.mts';
import { restB, DRAWN } from './bodyB.mts';
import { swapGB } from './arm_dk.mts';
const OUT = path.resolve(import.meta.dirname, '../out');
export function collision(base: Img[], outs: Img[], key: 'green' | 'magenta' | 'blue') {
  let g3 = 0, near = 0, item = 0;
  for (const [i, out] of outs.entries()) {
    const o = key === 'blue' ? swapGB(out) : out, k = key === 'blue' ? 'green' : key, L = chroma.chromaLayer(o, k, base[i]);
    g3 = Math.max(g3, chroma.keyOutside(base[i], o, k, chroma.KT, L.mask));
    for (let p = 0; p < L.mask.length; p++) if (L.mask[p]) { item++; const s = chroma.keyScore(k, o.data[p * 4], o.data[p * 4 + 1], o.data[p * 4 + 2]); if (s >= 20 && s < chroma.KT) near++; }
  }
  const nearShare = item ? near / item : 0;
  // round 2 re-decision: the G3 term is dropped (it also fires on hood overflow), M_G3=1 restores it
  return { g3: +g3.toFixed(3), near: +nearShare.toFixed(3), flag: (process.env.M_G3 === '1' && g3 > 0.02) || nearShare >= 0.1 };
}
const sets: { name: string; key: 'green' | 'magenta' | 'blue'; base: Img[]; outs: Img[]; truth: 'collision' | 'clean' }[] = [];
const A = await Promise.all(DIRS.map(restA)), B = await Promise.all(DRAWN.map(restB));
const frames = async (f: string, n: number) => Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`)));
for (const [v, key] of [['magenta', 'magenta'], ['blue', 'blue']] as const) for (const s of [7, 11]) {
  sets.push({ name: `K jester ${v} s${s}`, key, base: A, outs: await frames(`${OUT}/c25/K/jester/${v}_s${s}`, 3), truth: v === 'magenta' ? 'collision' : 'clean' });
  sets.push({ name: `K holly ${v} s${s}`, key, base: A, outs: await frames(`${OUT}/c25/K/holly/${v}_s${s}`, 3), truth: 'clean' }); // passed all gates and looked right on both keys
}
for (const item of ['greathelm', 'cloak', 'tunic', 'blackboots', 'crown', 'robe']) for (const v of ['ctrl', 'view']) for (const s of [7, 11])
  sets.push({ name: `D ${item} ${v} s${s}`, key: item === 'tunic' ? 'magenta' : 'green', base: A, outs: await frames(`${OUT}/c25/D/${item}/${v}_s${s}`, 3), truth: 'clean' });
for (const [item, v, key, truth] of [['jester', 'ctrl', 'magenta', 'collision'], ['jester', 'blue', 'blue', 'clean'], ['tunic', 'ctrl', 'magenta', 'clean'], ['cloak', 'ctrl', 'green', 'clean'], ['greathelm', 'ctrl', 'green', 'clean']] as const)
  sets.push({ name: `C ${item} ${v}`, key, base: B, outs: await frames(`${OUT}/c25/C/${item}/${v}_dress`, 5), truth });
for (const item of ['helmet', 'cape', 'chest', 'boots', 'hair', 'sword'])
  sets.push({ name: `S4 ${item}`, key: 'green', base: A, outs: await Promise.all(DIRS.map((d) => load(`${OUT}/s4_q3e/dress_ea2_${item}_${d}.png`))), truth: 'clean' });
const e2 = (d: string, i: number) => load(`${OUT}/e2_anim/walk_${d}_${i}.png`);
for (const it of ['helmet', 'chest', 'boots', 'cape', 'sword']) for (const k of ['green', 'magenta'] as const) {
  const f = (i: number) => `${OUT}/s2_x1/${it}_${k}_ea2.out${i}.png`;
  if (!fs.existsSync(f(0))) continue;
  sets.push({ name: `S2 ${it} ${k}`, key: k, base: [await e2('south', 2), await e2('east', 3)], outs: [await load(f(2)), await load(f(11))], truth: it === 'cape' && k === 'magenta' ? 'collision' : 'clean' }); // S2: magenta failed on the red cape
}
for (const item of ['jester', 'stripes']) for (const v of ['magenta', 'azure'] as const) { // round 2 arm Z: magenta = collision
  const f = `${OUT}/c25b/Z/${item}/${v}_dress_s7`; if (!fs.existsSync(`${f}.json`)) continue;
  if (v === 'magenta') sets.push({ name: `Z ${item} magenta`, key: 'magenta', base: A, outs: await frames(f, 3), truth: 'collision' });
}
let tp = 0, fp = 0, fn = 0;
for (const s of sets) {
  const r = collision(s.base, s.outs, s.key), hit = r.flag === (s.truth === 'collision');
  if (r.flag && s.truth === 'collision') tp++; else if (r.flag) fp++; else if (s.truth === 'collision') fn++;
  console.log(`${hit ? '  ' : '!!'} ${s.name.padEnd(26)} ${s.truth.padEnd(9)} flag ${String(r.flag).padEnd(5)} g3 ${r.g3} near ${r.near}`);
}
console.log(`collisions caught ${tp}/${tp + fn}, false flags ${fp}/${sets.length - tp - fn}`);
