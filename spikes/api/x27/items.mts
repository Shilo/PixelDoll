// Round 8: items posed on catalog moves with production's pose route (dress once, then one skeleton-v3 call per move and
// direction), extracted by color key, gated, and composited over the body frames of the same move.
// Usage (spikes/api): node --env-file=<repo root>/.env x27/items.mts <arm> <bodyArm> <dirs comma> <item:move ...>
// Without the key it only evaluates stored results.
import fs from 'node:fs';
import { load, save, OUT, items, chroma, b64, call, CELL, SEED, restKps, RIG, BODY, clips, spent, TOTAL_CAP, pool } from './lib.mts';
import { MOVES, seq } from './moves.mts';
const { evaluate } = await import('../c25/evaluate.mts');

const X26 = `${OUT}/../x26`;
const DIRS = ['south', 'east'];
// Keyframes dressed in round 6 (X3 state cloak, X4 edit-animation-v2 sword and hair), S and E.
export const ITEMS = {
  sword: { slot: 'main_hand', prompt: 'a steel longsword', kf: (d: string) => load(`${X26}/X4/dress_sword.${DIRS.indexOf(d)}.png`) },
  cloak: { slot: 'back', prompt: 'a long red cloak open at the front, hanging from the shoulders down to the calves', kf: (d: string) => load(`${X26}/X3/state_cloak.${d}.png`) },
  hair: { slot: 'hair', prompt: 'shoulder-length dark brown hair, no hat', kf: (d: string) => load(`${X26}/X4/dress_hair2.${DIRS.indexOf(d)}.png`) },
} as const;
type Name = keyof typeof ITEMS;
const move = (id: string) => MOVES.find((m) => m.id === id) ?? (() => { throw new Error(`no move ${id}`); })();

export async function pose(arm: string, name: Name, id: string, d: string) {
  const it = ITEMS[name], m = move(id), key = chroma.pickKey(it.prompt), pad = items.padOf(it.slot, 'skel', CELL);
  const req = items.itemRoute.pose({ keyframePngB64: await b64(await it.kf(d)), rest: restKps(d) as any, poses: seq(m, d as any).frames as any, item: it.prompt, slot: it.slot, key, anim: m.action, dir: d as any, seed: SEED, cell: CELL, pad, view: 'low top-down' });
  return call({ arm, label: `pose ${name} ${id} ${d}`, file: `${OUT}/${arm}/pose_${name}_${id}_${d}`, req: req as any, estimate: 4, armCap: 2000 });
}

/** Gate + extract + composite over the body frames; writes `<arm>/comp_<item>_<move>_<dir>.<i>.png`. */
export async function compose(arm: string, bodyArm: string, name: Name, id: string, d: string) {
  const it = ITEMS[name], m = move(id), kps = seq(m, d as any).frames, f = `${OUT}/${arm}/pose_${name}_${id}_${d}`;
  if (!fs.existsSync(`${f}.json`)) return null;
  const labels: string[] = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).labels.sort((a: string, b: string) => +a - +b);
  const outsAll = await Promise.all(labels.map((l) => load(`${f}.${l}.png`)));
  const key = chroma.pickKey(it.prompt), pad = items.padOf(it.slot, 'skel', CELL);
  const outs = items.unrotate(outsAll, items.f0Last(it.slot, restKps(d) as any, clips.paddedPoses(kps as any), CELL)).slice(0, kps.length);
  const bj = JSON.parse(fs.readFileSync(`${OUT}/${bodyArm}/body_${id}_${d}.json`, 'utf8'));
  const bases = await Promise.all((bj.labels as string[]).sort((a, b) => +a - +b).map((l) => load(`${OUT}/${bodyArm}/body_${id}_${d}.${l}.png`)));
  const rig = { ...RIG, animations: [...RIG.animations, { id, cells: kps.length, loop: false, frames: kps.map((_, cell) => ({ cell, ms: 100 })), sources: { [d]: { keypoints: kps } } }] };
  const r: any = evaluate({ name, slot: it.slot, key, pad, rig, rest: { [d]: await BODY.rest(d) }, dress: { [d]: await it.kf(d) }, clips: [{ anim: id, dir: d, frames: bases.map((b, i) => ({ base: b, out: outs[i] })) }] } as any);
  for (const [i, c] of r.cells.entries()) await save(`${OUT}/${arm}/comp_${name}_${id}_${d}.${i}.png`, items.recompose(c));
  fs.writeFileSync(`${OUT}/${arm}/comp_${name}_${id}_${d}.json`, JSON.stringify({ labels: r.cells.map((_: any, i: number) => String(i)), status: r.status, fails: r.fails, warnings: r.warnings }));
  return { status: r.status, fails: r.fails };
}

if (import.meta.main) {
  const [arm, bodyArm, dirs, ...pairs] = process.argv.slice(2);
  const jobs = pairs.flatMap((p) => { const [n, id] = p.split(':'); return dirs.split(',').map((d) => [n as Name, id, d] as const); });
  await pool(jobs.map(([n, id, d]) => () => pose(arm, n, id, d)), 16);
  for (const [n, id, d] of jobs) console.log(n, id, d, JSON.stringify(await compose(arm, bodyArm, n, id, d)));
  console.log(`spent ${spent()} / ${TOTAL_CAP}`);
}
