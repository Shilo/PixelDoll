// Round 2 arm A: does the action verb make slash poses invent swords and streaks on non-held items? Control = production
// action "slash, empty hands, no weapon, no effects" (round 1 arm P control for seeds 7, 11; new here for seed 13); variant
// changes only the verb: "overhead swing with the right arm, empty hands, no weapon, no effects". Stored S4 keyframes.
// Usage: C25_RUN=c25b C25_CAP=<cap> node --env-file=../../.env c25/arm_a.mts dry|run|eval
import path from 'node:path';
import { items, chroma, clips, paid, pool, b64, OUT, readOnly, type Img } from './lib.mts';
import { rigA, S4_ITEMS, keyframeA, padOf, baseA } from './s4rig.mts';
const rig = rigA(), cell = rig.cell, R1 = path.resolve(import.meta.dirname, '../out/c25');
export const A_ITEMS = ['helmet', 'cape', 'hair'], A_CLIPS: [string, string][] = [['slash', 'east'], ['slash', 'north']], A_SEEDS = [7, 11, 13];
export const VERB = 'overhead swing with the right arm';
const fileOf = (item: string, v: string, seed: number, anim: string, dir: string) => v === 'ctrl' && seed !== 13 ? `${R1}/P/${item}/ctrl_s${seed}_${anim}_${dir}` : `${OUT}/A/${item}/${v}_s${seed}_${anim}_${dir}`;
export async function task(item: string, v: 'ctrl' | 'verb', seed: number, anim: string, dir: string): Promise<Img[] | null> {
  const { slot, prompt } = S4_ITEMS[item], pad = padOf(slot), rest = (rig.rest as any)[dir].keypoints, poses = items.clipKeypoints(rig as any, anim, dir as any)!;
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(items.padImg(await keyframeA(item, dir), pad)), rest, poses, item: prompt, slot, key: 'green', anim, dir: dir as any, seed, cell, pad, view: rig.view as any });
  if (v === 'verb') { if (!req.body.action.startsWith('slash')) throw new Error(`unexpected action ${req.body.action}`); req.body.action = VERB + req.body.action.slice('slash'.length); }
  const out = await paid({ arm: 'A', label: `A ${item} ${v} s${seed} ${anim}/${dir}`, file: fileOf(item, v, seed, anim, dir), req, estimate: 3, armCap: 80 });
  return out && items.unrotate(out, items.f0Last(slot, rest, clips.paddedPoses(poses), cell)).slice(0, poses.length);
}
/** Raw invented-prop px: non-key px in components detached from the item's largest component (swords, streaks, smears). */
export function propPx(frames: Img[]) {
  let n = 0;
  for (const im of frames) {
    const w = im.w, h = im.h, m = new Uint8Array(w * h);
    for (let p = 0; p < m.length; p++) { const q = p * 4; if (im.data[q + 3] >= 128 && chroma.keyScore('green', im.data[q], im.data[q + 1], im.data[q + 2]) < chroma.KT) m[p] = 1; }
    const comps = chroma.components(m, w, h).sort((a, b) => b.length - a.length);
    for (const c of comps.slice(1)) if (c.length >= 3) n += c.length;
  }
  return n;
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry';
  if (mode === 'dry') {
    const r: any = items.itemRoute.pose({ keyframePngB64: 'x', rest: (rig.rest as any).east.keypoints, poses: items.clipKeypoints(rig as any, 'slash', 'east')!, item: S4_ITEMS.helmet.prompt, slot: 'head', key: 'green', anim: 'slash', dir: 'east', seed: 7, cell, pad: 0 });
    console.log('control:', r.body.action, '| variant:', VERB + r.body.action.slice('slash'.length));
  } else if (mode === 'run') {
    const t: (() => Promise<unknown>)[] = [];
    for (const item of A_ITEMS) for (const [a, d] of A_CLIPS) { t.push(() => task(item, 'ctrl', 13, a, d)); for (const s of A_SEEDS) t.push(() => task(item, 'verb', s, a, d)); }
    await pool(t, 8);
  } else {
    readOnly();
    let lower = 0, higher = 0, same = 0;
    for (const item of A_ITEMS) for (const [a, d] of A_CLIPS) for (const s of A_SEEDS) {
      const c = await task(item, 'ctrl', s, a, d), v = await task(item, 'verb', s, a, d);
      if (!c || !v) { console.log(item, a, d, s, 'missing'); continue; }
      const pc = propPx(c), pv = propPx(v);
      if (pv < pc) lower++; else if (pv > pc) higher++; else same++;
      console.log(`${item.padEnd(7)} ${a}/${d} s${s}: props control ${pc} variant ${pv}`);
    }
    console.log(`variant lower ${lower}, higher ${higher}, same ${same}`);
  }
}
