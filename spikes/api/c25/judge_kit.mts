// Build the blind judging kit for arms P, D and K (read-only): test pairs, ~20 % placebo pairs (same arm, other seed) and the
// S4 calibration pairs. Writes out/c25/blind/<round>/*.png and the sealed key out/c25/sealed_<round>.json.
import { readOnly, items, type Img } from './lib.mts';
readOnly();
import { writeKit, type Pair } from './blind.mts';
import { calibPairs } from './calib.mts';
import { baseA, restA, S4_ITEMS } from './s4rig.mts';
import { poseTask, CLIPS } from './arm_p.mts';
import { dressViews } from './eval_dk.mts';
import { D_ITEMS, K_ITEMS } from './arm_dk.mts';
import { evaluate } from './evaluate.mts';

/** Posed frames as production would ship them: extracted, cleaned, drawn over the real base. */
async function posedClip(item: string, arm: 'ctrl' | 'look', seed: number, anim: string, dir: string): Promise<Img[] | null> {
  const out = await poseTask(item, arm, seed, anim, dir);
  if (!out) return null;
  const { rigA, keyframeA, padOf } = await import('./s4rig.mts');
  const slot = S4_ITEMS[item].slot, c: any = { name: '', slot, key: 'green', pad: padOf(slot), rig: rigA(), rest: { [dir]: await restA(dir) }, dress: { [dir]: await keyframeA(item, dir) }, clips: [{ anim, dir, frames: await Promise.all(out.map(async (o, i) => ({ base: await baseA(dir, anim, i), out: o }))) }] };
  return evaluate(c).cells.map((x: any) => items.recompose(x));
}
const views = async (arm: 'D' | 'K', name: string, v: string, seed: number) => (await dressViews(arm, name, v, seed))?.map((x) => items.recompose(x.c)) ?? null;

const ARMS = (process.argv[3] ?? 'P,D,K').split(','), pairs: Pair[] = [];
const add = (id: string, kind: Pair['kind'], a: Img[] | null, b: Img[] | null, armA: string, armB: string) => { if (a && b) pairs.push({ id, kind, a, b, armA, armB }); };
if (ARMS.includes('P')) for (const item of Object.keys(S4_ITEMS)) for (const [anim, dir] of CLIPS) {
  for (const seed of [7, 11]) add(`P ${item} ${anim}/${dir} s${seed}`, 'test', await posedClip(item, 'ctrl', seed, anim, dir), await posedClip(item, 'look', seed, anim, dir), 'ctrl', 'look');
  if (dir === 'east' && anim === 'slash') add(`P placebo ${item} ${anim}/${dir}`, 'placebo', await posedClip(item, 'ctrl', 7, anim, dir), await posedClip(item, 'ctrl', 11, anim, dir), 'ctrl s7', 'ctrl s11');
}
if (ARMS.includes('D')) for (const name of Object.keys(D_ITEMS)) {
  for (const seed of [7, 11]) add(`D ${name} s${seed}`, 'test', await views('D', name, 'ctrl', seed), await views('D', name, 'view', seed), 'ctrl', 'view');
  add(`D placebo ${name}`, 'placebo', await views('D', name, 'ctrl', 7), await views('D', name, 'ctrl', 11), 'ctrl s7', 'ctrl s11');
}
if (ARMS.includes('K')) for (const name of Object.keys(K_ITEMS)) for (const seed of [7, 11]) {
  add(`K ${name} s${seed} magenta-blue`, 'test', await views('K', name, 'magenta', seed), await views('K', name, 'blue', seed), 'magenta', 'blue');
  add(`K ${name} s${seed} magenta-none`, 'test', await views('K', name, 'magenta', seed), await views('K', name, 'none', seed), 'magenta', 'none');
  add(`K ${name} s${seed} blue-none`, 'test', await views('K', name, 'blue', seed), await views('K', name, 'none', seed), 'blue', 'none');
}
pairs.push(...(await calibPairs()));
const round = process.argv[2] ?? 'r1', k = await writeKit(round, pairs);
console.log(`kit ${round}: ${k.n} pairs in ${k.dir}; ${pairs.filter((p) => p.kind === 'test').length} test, ${pairs.filter((p) => p.kind === 'placebo').length} placebo, ${pairs.filter((p) => p.kind === 'calib').length} calib`);
