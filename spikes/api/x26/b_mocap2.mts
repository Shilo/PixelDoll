// Round 6, step B3: the mocap slash again with the mocap tool's final bone-rotation retarget (the first render used its
// earlier per-joint delta tables, which shrink limbs when the mocap start pose differs from the body's rest).
// Usage (spikes/api): node --env-file=<repo root>/.env x26/b_mocap2.mts
import fs from 'node:fs';
import { OUT, CELL, retarget, renderBody, spent, TOTAL_CAP } from './lib.mts';
export function boneSeq(d: string) {
  const J = JSON.parse(fs.readFileSync(`${OUT}/mocap/bone_sword_slash_standing_${d}.json`, 'utf8'));
  const xy = retarget(J.frames, d, CELL); // tables were fitted to c26man; re-apply as changes onto this body's rest
  return xy.map((f, i) => f.map((k) => { const m = J.frames[i].find((q: any) => q.label === k.label); return { ...k, depth: m.depth, z_index: m.z_index }; }));
}
if (import.meta.main) {
  await Promise.all(['south', 'east'].map((d) => renderBody({ arm: 'X2', armCap: 76, name: 'mocap_bone_slash', dir: d, action: 'slash, empty hands, no weapon, no props, no effects', keypoints: boneSeq(d) })));
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
