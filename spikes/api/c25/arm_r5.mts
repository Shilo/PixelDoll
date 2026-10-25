// Round 5 (C25_RUN=c25e), rules fixed before the run; evidence for the review of Lexingel's paper-doll findings (2026-10-25).
// Arm T (tiny and one-view items): small gold hoop earrings and round wire glasses (face_acc) on body A (S/E/N, walk), seed 7.
// Question: does PixelLab draw them as parts under 4 px, and does a view legitimately show none of the item (north)? Rules:
// the keyframe-relative size floor ships only if a real item has a part under 4 px that the posed frames keep with it and lose
// without it; the empty-view rule ships only if a real dressed view shows no item while the other views do.
// Arm U (bare base): items on two Studio bodies made with "wearing only plain dark gray underwear" (c26man, c26woman; 64 px,
// Top-down 4, seed 26): an emerald tunic, a sleeveless leather vest and an open red cloak; dress + one idle+walk pose call per
// drawn view, seed 7. Rules: the underwear default ships only if no call is refused, every item keeps its production verdict
// class seen on the t-shirt bodies (no new hard-gate class), the openings (necklines, armholes, open fronts) show skin, not a
// garment, and the bodies' own create and idle/walk calls were not refused.
// Arm F (text-move facing): estimate-skeleton (0.1 gen) on every stored south/north frame of the S4 a48 text moves (pixminimax and
// v3; spikes/api/out/s4_anim), as production measures text moves. Rule: a south/north "turned side-on" review warning ships only
// if a shoulder-width test flags the visibly turned slash frames and at most 5 % of walk, idle and run clips.
// Usage: C25_RUN=c25e C25_CAP=<cap> node --env-file=../../.env c25/arm_r5.mts dry|T|U [body]|F
import fs from 'node:fs';
import path from 'node:path';
import { items, chroma, paid, paidJson, pool, b64, load, OUT, routes, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { studioBody } from './bodyB.mts';
export const T_ITEMS: Record<string, { slot: string; prompt: string }> = {
  earrings: { slot: 'face_acc', prompt: 'small gold hoop earrings' },
  glasses: { slot: 'face_acc', prompt: 'round wire-rimmed glasses' },
};
export const U_ITEMS: Record<string, { slot: string; prompt: string }> = {
  tunic: { slot: 'torso_outer', prompt: 'an emerald green tunic with gold trim, covering the torso down to the hips' },
  vest: { slot: 'torso_outer', prompt: 'a sleeveless brown leather vest, open at the neck, arms bare' },
  cloak: { slot: 'back', prompt: 'a long red cloak open at the front, hanging from the shoulders down to the calves' },
};
export const U_BODIES = ['c26man', 'c26woman'] as const;
const SEED = 7;
export const fileOf = (arm: string, item: string, what: string) => `${OUT}/${arm}/${item}/${what}`;
const cellsOf = (dirs: readonly string[]) => dirs.map((d) => `rest/${d}/0`);
async function dressT(item: string) {
  const { prompt } = T_ITEMS[item], key = chroma.pickKey(prompt);
  const views = await Promise.all(DIRS.map(async (d) => b64(chroma.toChroma(await restA(d), key))));
  const req: any = items.itemRoute.edit(views, items.itemPrompt(prompt, key, cellsOf(DIRS)), SEED, { w: 64, h: 64 });
  return paid({ arm: 'T', label: `T ${item} dress`, file: fileOf('T', item, 'dress'), req, estimate: 10, armCap: 60 });
}
async function walkT(item: string, kf: Img[], d: string) {
  const { slot, prompt } = T_ITEMS[item], rig: any = rigA(), key = chroma.pickKey(prompt);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[DIRS.indexOf(d as any)]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: prompt, slot, key, anim: 'walk', dir: d as any, seed: SEED, cell: rig.cell, view: rig.view });
  return paid({ arm: 'T', label: `T ${item} walk/${d}`, file: fileOf('T', item, `walk_${d}`), req, estimate: 3, armCap: 60 });
}
const bodies: Record<string, ReturnType<typeof studioBody>> = {};
export const bodyU = (n: string) => (bodies[n] ??= studioBody(n));
async function dressU(body: string, item: string) {
  const b = bodyU(body), { prompt } = U_ITEMS[item], key = chroma.pickKey(prompt), C = b.rig.cell.w;
  const views = await Promise.all(b.drawn.map(async (d) => b64(chroma.toChroma(await b.rest(d), key))));
  const req: any = items.itemRoute.edit(views, items.itemPrompt(prompt, key, cellsOf(b.drawn)), SEED, { w: C, h: C });
  return paid({ arm: 'U', label: `U ${body} ${item} dress`, file: fileOf('U', `${body}_${item}`, 'dress'), req, estimate: 10, armCap: 150 });
}
async function poseU(body: string, item: string, kf: Img[], d: string) {
  const b = bodyU(body), { slot, prompt } = U_ITEMS[item], key = chroma.pickKey(prompt), rig = b.rig;
  const poses = [...items.clipKeypoints(rig, 'idle', d as any)!, ...items.clipKeypoints(rig, 'walk', d as any)!]; // production packing (round 4)
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[b.drawn.indexOf(d)]), rest: rig.rest[d].keypoints, poses, item: prompt, slot, key, anim: 'walk', dir: d as any, seed: SEED, cell: rig.cell, view: rig.view });
  return paid({ arm: 'U', label: `U ${body} ${item} idle+walk/${d}`, file: fileOf('U', `${body}_${item}`, `both_${d}`), req, estimate: 3, armCap: 150 });
}
const S4 = path.resolve(import.meta.dirname, '../out/s4_anim');
export const F_FRAMES = () => fs.readdirSync(S4).filter((f) => /^a48_.+_(south|north)_\d+\.png$/.test(f)).sort();
const { skeletonInput } = await import(new URL('../../../app/src/lib/rig/estimate.ts', import.meta.url).href);
async function jointsF(f: string) {
  const input = skeletonInput(await load(`${S4}/${f}`));
  return paidJson({ arm: 'F', label: `F ${f}`, file: fileOf('F', 'joints', f.replace('.png', '')), req: { path: '/estimate-skeleton', body: { image: routes.png(await b64(input.image)) } }, estimate: 0.1, armCap: 40 });
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry';
  if (mode === 'dry') {
    for (const [i, t] of Object.entries(T_ITEMS)) console.log('T', i, chroma.pickKey(t.prompt), items.itemPrompt(t.prompt, chroma.pickKey(t.prompt), cellsOf(DIRS)));
    for (const [i, t] of Object.entries(U_ITEMS)) console.log('U', i, chroma.pickKey(t.prompt));
    console.log('F frames', F_FRAMES().length);
    for (const n of U_BODIES) { try { const b = bodyU(n); console.log(n, b.drawn, b.rig.cell, b.rig.animations.map((a: any) => `${a.id}:${a.cells}`)); } catch (e: any) { console.log(n, 'not exported yet'); } }
  } else if (mode === 'F') await pool(F_FRAMES().map((f) => () => jointsF(f)), 3);
  else if (mode === 'T') await pool(Object.keys(T_ITEMS).map((item) => async () => { const kf = await dressT(item); if (kf?.length !== DIRS.length) return console.log(`T ${item}: dress missing`); await pool(DIRS.map((d) => () => walkT(item, kf, d)), 3); }), 2);
  else if (mode === 'U') await pool(U_BODIES.filter((n) => !process.argv[3] || n === process.argv[3]).flatMap((body) => Object.keys(U_ITEMS).map((item) => async () => {
    const kf = await dressU(body, item), b = bodyU(body);
    if (kf?.length !== b.drawn.length) return console.log(`U ${body} ${item}: dress missing`);
    await pool(b.drawn.map((d) => () => poseU(body, item, kf, d)), 3);
  })), 6);
}
