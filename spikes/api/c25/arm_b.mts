// Round 2 arm B (bow hand): PixelLab draws bows in the LEFT hand (archery prior) even when asked for the right (arm E, 2/2 anchored
// seeds). Text-prompt longbow, production held route on body A (96 px canvas): main_hand vs off_hand, dress at seeds 7, 11, 23,
// walk S/E/N poses on seed 7. Rule (pre-registered): bows default to the off hand only if off_hand has the asked hand in all 3
// views on >= 2/3 seeds with no duplicate bow, and main_hand does not do as well.
// Usage: C25_RUN=c25b C25_CAP=<cap> node --env-file=../../.env c25/arm_b.mts dry|run
import { items, chroma, paid, pool, b64, OUT, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
const rig: any = rigA(), CELLS = DIRS.map((d) => `rest/${d}/0`), key = 'green', PROMPT = 'a wooden longbow with a leather grip';
export const B_SLOTS = ['main_hand', 'off_hand'], B_SEEDS = [7, 11, 23];
export const padB = (slot: string) => items.padOf(slot, 'skel', rig.cell);
export const fileOf = (slot: string, what: string) => `${OUT}/B/${slot}/${what}`;
async function dress(slot: string, seed: number) {
  const p = padB(slot), C = rig.cell.w + 2 * p, views = await Promise.all(DIRS.map(async (d) => b64(items.padImg(chroma.toChroma(await restA(d), key), p))));
  const req = items.itemRoute.edit(views, items.itemPrompt(items.heldPhrase(PROMPT, slot), key, CELLS), seed, { w: C, h: C });
  return paid({ arm: 'B', label: `B ${slot} dress s${seed}`, file: fileOf(slot, `dress_s${seed}`), req: req as any, estimate: 10, armCap: 100 });
}
async function walk(slot: string, kf: Img[], d: string) {
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[DIRS.indexOf(d as any)]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: PROMPT, slot, key, anim: 'walk', dir: d as any, seed: 7, cell: rig.cell, pad: padB(slot), view: rig.view });
  return paid({ arm: 'B', label: `B ${slot} walk/${d}`, file: fileOf(slot, `walk_${d}`), req, estimate: 3, armCap: 100 });
}
if (import.meta.main) {
  if ((process.argv[2] ?? 'dry') === 'dry') for (const s of B_SLOTS) console.log(s, padB(s), items.itemPrompt(items.heldPhrase(PROMPT, s), key, CELLS));
  else {
    const t: (() => Promise<unknown>)[] = [];
    for (const slot of B_SLOTS) t.push(async () => { const kf = await dress(slot, 7); if (kf?.length === 3) await pool(DIRS.map((d) => () => walk(slot, kf, d)), 3); });
    for (const slot of B_SLOTS) for (const s of B_SEEDS.slice(1)) t.push(() => dress(slot, s));
    await pool(t, 6);
  }
}
