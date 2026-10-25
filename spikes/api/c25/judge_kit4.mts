// Blind round r4 (round 2): E concept pairs (held weapons, robe), round 1's unjudged E4 seed 11, azure vs magenta; 6 flipped
// repeats (the bias gate) and the 10 S4 calibration pairs. Each concept row starts with the concept image.
// Usage: C25_RUN=c25b node c25/judge_kit4.mts
import path from 'node:path';
import { readOnly, items, load, OUT, type Img } from './lib.mts';
readOnly();
import { writeKit, type Pair } from './blind.mts';
import { calibPairs } from './calib.mts';
import { padTo } from './evaluate.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { views } from './eval_e.mts';
import { E_ITEMS } from './arm_e.mts';
import { azureCell } from './hue.mts';
import { fileOf as zFile } from './arm_z.mts';
const rig: any = rigA(), skel = (k: any[]) => Object.fromEntries(k.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
const R1 = path.resolve(import.meta.dirname, '../out/c25');
const pairs: Pair[] = [];
for (const item of Object.keys(E_ITEMS)) {
  const concept = await load(`${OUT}/E/concept_${item}.0.png`);
  for (const seed of [7, 11]) {
    const [t, e] = [await views(item, 'traw', seed), await views(item, 'ea', seed)];
    const row = (cs: any[]) => [padTo(concept, cs[0].base.w), ...cs.map((c) => items.recompose(c))];
    if (t && e) pairs.push({ id: `E ${item} s${seed}`, kind: 'test', a: row(t), b: row(e), armA: 'transfer', armB: 'anchored-dress' });
  }
}
for (const name of ['A', 'B']) { // round 1 E4 seed 11 (never judged blind)
  const concept = name === 'A' ? await load(`${R1}/../e3_static/helmet__inpaint-v3.out0.png`) : await load(`${R1}/E4/conceptB.0.png`);
  const row = async (v: string) => { const n = v === 'ea' ? 4 : 3, outs = await Promise.all(Array.from({ length: n }, (_, i) => load(`${R1}/E4/${name}_${v}_s11.${i}.png`))), o = v === 'ea' ? outs.slice(1) : outs;
    return [padTo(concept, Math.max(64, concept.w)), ...(await Promise.all(DIRS.map(async (d, i) => items.recompose(items.extractCell({ key: `rest/${d}/0`, call: 0, base: await restA(d), out: o[i], route: 'green', band: items.bandOf('head', skel(rig.rest[d].keypoints), 64) })))))]; };
  const r = { traw: await row('traw'), tpaste: await row('tpaste'), ea: await row('ea') };
  for (const [a, b] of [['traw', 'tpaste'], ['traw', 'ea'], ['tpaste', 'ea']] as const) pairs.push({ id: `E4s11 ${name} ${a}-${b}`, kind: 'test', a: r[a], b: r[b], armA: a, armB: b });
}
for (const item of ['jester', 'stripes']) { // azure vs magenta, seed 7
  const slot = item === 'jester' ? 'head' : 'torso_outer';
  const row = async (v: 'azure' | 'magenta') => { const outs = await Promise.all(DIRS.map((_, i) => load(`${zFile(item, v, 'dress_s7')}.${i}.png`)));
    return Promise.all(DIRS.map(async (d, i) => { const o = { key: `rest/${d}/0`, call: 0, base: await restA(d), out: outs[i], route: 'magenta' as const, band: items.bandOf(slot, skel(rig.rest[d].keypoints), 64) }; return items.recompose(v === 'azure' ? azureCell(o) : items.extractCell(o)); })); };
  pairs.push({ id: `Z ${item}`, kind: 'test', a: await row('azure'), b: await row('magenta'), armA: 'azure', armB: 'magenta' });
}
for (const id of ['E scimitar s7', 'E robe s11', 'E longbow s7', 'E4s11 A traw-ea', 'E4s11 B traw-tpaste', 'Z stripes']) { const p = pairs.find((x) => x.id === id)!; pairs.push({ ...p, id: `${id} (repeat)`, kind: 'repeat', of: id }); }
pairs.push(...(await calibPairs()));
const k = await writeKit('r4', pairs);
console.log(`kit r4: ${k.n} pairs; ${pairs.filter((p) => p.kind === 'test').length} test, ${pairs.filter((p) => p.kind === 'repeat').length} repeats, ${pairs.filter((p) => p.kind === 'calib').length} calib`);
