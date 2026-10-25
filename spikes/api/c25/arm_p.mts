// Arm P: pose-call description. Control = production itemRoute.pose. Variant "look" = the same request with the description
// anchored to the dressed first frame. Stored S4 keyframes, seeds 7 and 11, clips slash E, slash N, walk E.
// Usage: node --env-file=../../.env c25/arm_p.ts [probe|run]
import { items, clips, paid, pool, b64, save, OUT, type Img } from './lib.mts';
import { rigA, S4_ITEMS, keyframeA, padOf } from './s4rig.mts';
const ARM = 'P', CAP = 230, rig = rigA(), cell = rig.cell;
export const LOOK = (_item: string) => `; the item keeps exactly the look it has in the first frame (same shape, size, colors and place on the body) in every frame`;
export const CLIPS: [string, string][] = [['slash', 'east'], ['slash', 'north'], ['walk', 'east']];
export const SEEDS = [7, 11], ARMS = ['ctrl', 'look'] as const;
export const fileOf = (item: string, arm: string, seed: number, anim: string, dir: string) => `${OUT}/P/${item}/${arm}_s${seed}_${anim}_${dir}`;

export async function poseTask(item: string, arm: (typeof ARMS)[number], seed: number, anim: string, dir: string): Promise<Img[] | null> {
  const { slot, prompt } = S4_ITEMS[item], pad = padOf(slot);
  const kf = items.padImg(await keyframeA(item, dir), pad), rest = rig.rest[dir].keypoints, poses = items.clipKeypoints(rig as any, anim, dir as any)!;
  const req = items.itemRoute.pose({ keyframePngB64: await b64(kf), rest, poses, item: prompt, slot, key: 'green', anim, dir: dir as any, seed, cell, pad, view: rig.view as any });
  if (arm === 'look') (req.body as any).description += LOOK(prompt);
  const out = await paid({ arm: ARM, label: `P ${item} ${arm} s${seed} ${anim}/${dir}`, file: fileOf(item, arm, seed, anim, dir), req: req as any, estimate: 3, armCap: CAP });
  if (!out) return null;
  return items.unrotate(out, items.f0Last(slot, rest, clips.paddedPoses(poses), cell)).slice(0, poses.length);
}

if (import.meta.main) {
  const mode = process.argv[2] ?? 'probe';
  const tasks: (() => Promise<unknown>)[] = [];
  for (const item of Object.keys(S4_ITEMS)) for (const seed of SEEDS) for (const arm of ARMS) for (const [anim, dir] of CLIPS) tasks.push(() => poseTask(item, arm, seed, anim, dir));
  if (mode === 'dry') { for (const item of ['helmet', 'sword']) { const { slot, prompt } = S4_ITEMS[item], pad = padOf(slot); const kf = items.padImg(await keyframeA(item, 'east'), pad); const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf), rest: rig.rest.east.keypoints, poses: items.clipKeypoints(rig as any, 'slash', 'east')!, item: prompt, slot, key: 'green', anim: 'slash', dir: 'east', seed: 7, cell, pad, view: rig.view as any }); console.log(req.path, req.body.description, '|', req.body.action, '|', req.body.keypoints.length, 'poses', kf.w + 'px'); console.log('  look:', req.body.description + LOOK(prompt)); } }
  else if (mode === 'probe') { await tasks[0](); }
  else await pool(tasks, 8);
}
