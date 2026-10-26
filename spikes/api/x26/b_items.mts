// Round 6, step B2: the CC0 mocap slash (Quaternius Sword_Attack_Standing, projected with depth + z_index) rendered on the body,
// then X4: sword and the state cloak posed on that slash, hair posed on the retargeted template idle; S and E only.
// Usage (spikes/api): node --env-file=<repo root>/.env x26/b_items.mts
import fs from 'node:fs';
import { load, OUT, items, chroma, b64, call, CELL, SEED, retarget, restKps, renderBody, spent, TOTAL_CAP } from './lib.mts';

const DIRS = ['south', 'east'];
/** Mocap frames re-applied as per-frame changes onto this body's rest pose, keeping depth and draw order. */
export function mocapSeq(d: string) {
  const J = JSON.parse(fs.readFileSync(`${OUT}/mocap/sword_slash_standing_${d}.json`, 'utf8'));
  const xy = retarget(J.frames, d, CELL);
  return xy.map((f, i) => f.map((k) => { const m = J.frames[i].find((q: any) => q.label === k.label); return { ...k, depth: m.depth, z_index: m.z_index }; }));
}
const seqOf = (name: string, d: string) => JSON.parse(fs.readFileSync(`${OUT}/X2/seq_${name}_${d}.json`, 'utf8'));

const ITEMS = {
  sword: { slot: 'main_hand', prompt: 'a steel longsword', kf: (d: string) => load(`${OUT}/X4/dress_sword.${DIRS.indexOf(d)}.png`), anim: 'slash' },
  cloak: { slot: 'back', prompt: 'a long red cloak open at the front, hanging from the shoulders down to the calves', kf: (d: string) => load(`${OUT}/X3/state_cloak.${d}.png`), anim: 'slash' },
  hair: { slot: 'hair', prompt: 'shoulder-length dark brown hair, no hat', kf: (d: string) => load(`${OUT}/X4/dress_hair2.${DIRS.indexOf(d)}.png`), anim: 'idle' },
} as const;

async function pose(name: keyof typeof ITEMS, d: string) {
  const it = ITEMS[name], key = chroma.pickKey(it.prompt), pad = items.padOf(it.slot, 'skel', CELL);
  const seq = it.anim === 'slash' ? mocapSeq(d) : seqOf('tpl_idle', d);
  const req = items.itemRoute.pose({ keyframePngB64: await b64(await it.kf(d)), rest: restKps(d) as any, poses: seq as any, item: it.prompt, slot: it.slot, key, anim: it.anim, dir: d as any, seed: SEED, cell: CELL, pad, view: 'low top-down' });
  return call({ arm: 'X4', label: `pose ${name} ${it.anim} ${d}`, file: `${OUT}/X4/pose_${name}_${d}`, req: req as any, estimate: 3, armCap: 60 });
}

if (import.meta.main) {
  await Promise.all([
    ...DIRS.map((d) => renderBody({ arm: 'X2', armCap: 70, name: 'mocap_slash', dir: d, action: 'slash, empty hands, no weapon, no props, no effects', keypoints: mocapSeq(d) })),
    ...DIRS.flatMap((d) => (['sword', 'cloak', 'hair'] as const).map((n) => pose(n, d))),
  ]);
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
