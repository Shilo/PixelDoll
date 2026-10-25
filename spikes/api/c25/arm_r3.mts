// Round 3 (C25_RUN=c25c). Arm V (bow wording): the held dress wording "pointing down and slightly outward" was written for
// swords; bows come out diagonal across the legs, partly hidden and swinging (round 2 arm B: G4/G5/G9). Control = production
// off-hand wording (round 2 arm B outputs copied into out/c25c/B/off_hand: same requests); vert = an upright bow at the side.
// Dress at seeds 7, 11, 23 and walk S/E/N on every seed, body A, 96 px canvas.
// Rule (pre-registered): vert is adopted only if failing walk clips drop by >= 3 of 9 against control, the asked hand holds
// in all 3 views on >= 2/3 seeds, and the sheets look no worse.
// Arm S (azure on steel): a green + purple + steel item never ran on azure. Dress seeds 7, 11 and walk S/E/N seed 7, body A.
// Rule: azure stays for these items if every dress set and walk passes G3 and the sheets show no holes in the steel.
// Usage: C25_RUN=c25c C25_CAP=<cap> node --env-file=../../.env c25/arm_r3.mts dry|run
import { items, chroma, paid, pool, b64, OUT, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
// extension (declared after the first 9 clips fell one short of the rule): seeds 31, 47, 59; decide on all 18 clips, >= 6 fewer
export const SEEDS = process.env.V_EXT ? [31, 47, 59] : [7, 11, 23];
const rig: any = rigA(), CELLS = DIRS.map((d) => `rest/${d}/0`), BOW = 'a wooden longbow with a leather grip';
export const VERT = `${BOW}, held upright in the character's left hand at its side, the bow vertical with one end above the shoulder and the other near the knee, the string toward the body; exactly one held item, nothing in the right hand; the arms stay exactly as they are`;
export const S_ITEMS: Record<string, { slot: string; prompt: string }> = {
  plume: { slot: 'head', prompt: 'a steel helmet with a green and purple plume' },
  tabard: { slot: 'torso_outer', prompt: 'a green and purple tabard over steel plate armor' },
};
export const fileOf = (arm: string, v: string, what: string) => `${OUT}/${arm}/${v}/${what}`;
const pad = items.padOf('off_hand', 'skel', rig.cell), C = rig.cell.w + 2 * pad;
async function dressV(v: 'off_hand' | 'vert', seed: number) {
  const views = await Promise.all(DIRS.map(async (d) => b64(items.padImg(chroma.toChroma(await restA(d), 'green'), pad))));
  const phrase = v === 'vert' ? VERT : items.heldPhrase(BOW, 'off_hand');
  return paid({ arm: 'V', label: `V ${v} dress s${seed}`, file: fileOf('B', v, `dress_s${seed}`), req: items.itemRoute.edit(views, items.itemPrompt(phrase, 'green', CELLS), seed, { w: C, h: C }) as any, estimate: 10, armCap: 200 });
}
async function walkV(v: string, seed: number, kf: Img[], d: string) {
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[DIRS.indexOf(d as any)]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: BOW, slot: 'off_hand', key: 'green', anim: 'walk', dir: d as any, seed, cell: rig.cell, pad, view: rig.view });
  return paid({ arm: 'V', label: `V ${v} walk/${d} s${seed}`, file: fileOf('B', v, seed === 7 ? `walk_${d}` : `walk_${d}_s${seed}`), req, estimate: 3, armCap: 200 });
}
async function dressS(item: string, seed: number) {
  const { prompt } = S_ITEMS[item], key = chroma.pickKey(prompt), views = await Promise.all(DIRS.map(async (d) => b64(chroma.toChroma(await restA(d), key))));
  return paid({ arm: 'S', label: `S ${item} ${key} dress s${seed}`, file: fileOf('S', item, `dress_s${seed}`), req: items.itemRoute.edit(views, items.itemPrompt(prompt, key, CELLS), seed, rig.cell) as any, estimate: 10, armCap: 80 });
}
async function walkS(item: string, kf: Img[], d: string) {
  const { slot, prompt } = S_ITEMS[item], key = chroma.pickKey(prompt);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[DIRS.indexOf(d as any)]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: prompt, slot, key, anim: 'walk', dir: d as any, seed: 7, cell: rig.cell, view: rig.view });
  return paid({ arm: 'S', label: `S ${item} walk/${d}`, file: fileOf('S', item, `walk_${d}`), req, estimate: 3, armCap: 80 });
}
if (import.meta.main) {
  if ((process.argv[2] ?? 'dry') === 'dry') { console.log(items.itemPrompt(VERT, 'green', CELLS)); for (const [k, v] of Object.entries(S_ITEMS)) console.log(k, chroma.pickKey(v.prompt), items.itemPrompt(v.prompt, chroma.pickKey(v.prompt), CELLS).slice(0, 120)); }
  else {
    const t: (() => Promise<unknown>)[] = [];
    for (const v of ['off_hand', 'vert'] as const) for (const s of SEEDS) t.push(async () => { const kf = await dressV(v, s); if (kf?.length === 3) await pool(DIRS.map((d) => () => walkV(v, s, kf, d)), 3); });
    if (!process.env.V_EXT) for (const item of Object.keys(S_ITEMS)) t.push(async () => { const kf = await dressS(item, 7); if (kf?.length === 3) await pool(DIRS.map((d) => () => walkS(item, kf, d)), 3); }, () => dressS(item, 11));
    await pool(t, 6);
  }
}
