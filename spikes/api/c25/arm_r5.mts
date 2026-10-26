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
// Arm W (fully bare base wording, owner request): create-character-v3 at 64 px (8 rotations, ~2 gens) for "a human man" and "a
// human woman" with three clothes clauses in the production base body line, seed 26. Sources: pixellab-pip (bare-skin and "no
// clothes" create prompts never refused; "no underwear" stopped drawn briefs) and web research (mannequin framing, avoid "nude",
// "topless", "briefs"). Rule: a wording ships only if neither sex is refused, no view draws a garment, hair or explicit detail,
// and the bodies stay full-body; ties go to the shortest wording. The winner then gets full bodies and items (arm U).
// W2-W7 (later rounds, same rule): refined clauses and seeds 26-29, then ablations of the winner. Shipped: m5.
// Usage: C25_RUN=c25e C25_CAP=<cap> node --env-file=../../.env c25/arm_r5.mts dry|T|U [body]|F|W
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
export const U_BODIES = ['c26man', 'c26woman', 'c27man', 'c27woman'] as const; // c27: the fully bare default (arm W winner), Light tan, seed 27
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
  return paid({ arm: 'U', label: `U ${body} ${item} dress`, file: fileOf('U', `${body}_${item}`, 'dress'), req, estimate: 10, armCap: 250 });
}
async function poseU(body: string, item: string, kf: Img[], d: string) {
  const b = bodyU(body), { slot, prompt } = U_ITEMS[item], key = chroma.pickKey(prompt), rig = b.rig;
  const poses = [...items.clipKeypoints(rig, 'idle', d as any)!, ...items.clipKeypoints(rig, 'walk', d as any)!]; // production packing (round 4)
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[b.drawn.indexOf(d)]), rest: rig.rest[d].keypoints, poses, item: prompt, slot, key, anim: 'walk', dir: d as any, seed: SEED, cell: rig.cell, view: rig.view });
  return paid({ arm: 'U', label: `U ${body} ${item} idle+walk/${d}`, file: fileOf('U', `${body}_${item}`, `both_${d}`), req, estimate: 3, armCap: 250 });
}
export const W_CLOTHES: Record<string, string> = {
  bare: 'with bare skin, no clothes, no underwear',
  smooth: 'with a smooth unclothed body like a featureless store mannequin, one even skin tone, no underwear',
  plain: 'with bare skin, no clothes, no underwear, smooth featureless non-explicit anatomy',
};
// W2, after W: the men drew briefs and tattoo-like marks with every clause (bare, smooth, plain); the bare woman was clean.
// Refined clauses on seeds 26 and 27; same rule.
export const W2_CLOTHES: Record<string, string> = {
  bare2: 'with bare skin, no clothes, no underwear, no tattoos',
  doll: 'with a smooth unclothed doll body, plain skin, no underwear, no tattoos',
  skin: 'with plain bare skin everywhere, nothing worn, no underwear, no tattoos or markings',
  // W4 ablation of the winner (owner: is it the most minimal prompt?), seeds 26-29; ships if it matches skin on garments
  m1: 'with plain bare skin, nothing worn',
  m2: 'nothing worn',
  m3: 'with plain bare skin everywhere, nothing worn, no underwear', // W5: skin without the tattoo clause (no effect seen)
  m4: 'with plain bare skin, nothing worn, no underwear', // W6: m3 without "everywhere"
  m5: 'with plain bare skin everywhere, nothing worn', // W6: m3 without "no underwear"
  m6: 'with plain bare skin everywhere', // W7: m5 without "nothing worn"
};
const { bodyWith } = await import(new URL('../../../app/src/studio/model.ts', import.meta.url).href);
export const W_WHO = { man: 'a human man', woman: 'a human woman' } as const;
async function createW(v: string, who: keyof typeof W_WHO, seed = 26) {
  const req = routes.routes.createCharacterV3({ description: `${W_WHO[who]}, ${bodyWith({ ...W_CLOTHES, ...W2_CLOTHES }[v])}`, image_size: { width: 64, height: 64 }, view: 'low top-down', template_id: 'mannequin', seed, no_background: true });
  return paid({ arm: 'W', label: `W ${v} ${who}${seed === 26 ? '' : ` s${seed}`}`, file: fileOf('W', v, seed === 26 ? who : `${who}_s${seed}`), req: req as any, estimate: 2, armCap: 160 });
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
    for (const v of Object.keys(W_CLOTHES)) console.log('W', v, '|', `${W_WHO.woman}, ${bodyWith(W_CLOTHES[v])}`);
    for (const n of U_BODIES) { try { const b = bodyU(n); console.log(n, b.drawn, b.rig.cell, b.rig.animations.map((a: any) => `${a.id}:${a.cells}`)); } catch (e: any) { console.log(n, 'not exported yet'); } }
  } else if (mode === 'W7') await pool((Object.keys(W_WHO) as (keyof typeof W_WHO)[]).flatMap((who) => [26, 27, 28, 29].map((seed) => () => createW('m6', who, seed))), 8);
  else if (mode === 'W6') await pool(['m4', 'm5'].flatMap((v) => (Object.keys(W_WHO) as (keyof typeof W_WHO)[]).flatMap((who) => [26, 27, 28, 29].map((seed) => () => createW(v, who, seed)))), 6);
  else if (mode === 'W5') await pool((Object.keys(W_WHO) as (keyof typeof W_WHO)[]).flatMap((who) => [26, 27, 28, 29].map((seed) => () => createW('m3', who, seed))), 6);
  else if (mode === 'W4') await pool(['m1', 'm2'].flatMap((v) => (Object.keys(W_WHO) as (keyof typeof W_WHO)[]).flatMap((who) => [26, 27, 28, 29].map((seed) => () => createW(v, who, seed)))), 6);
  else if (mode === 'W3') await pool((Object.keys(W_WHO) as (keyof typeof W_WHO)[]).flatMap((who) => [28, 29].map((seed) => () => createW('skin', who, seed))), 4); // more seeds for the W2 winner
  else if (mode === 'W2') await pool(Object.keys(W2_CLOTHES).flatMap((v) => (Object.keys(W_WHO) as (keyof typeof W_WHO)[]).flatMap((who) => [26, 27].map((seed) => () => createW(v, who, seed)))), 6);
  else if (mode === 'W') await pool(Object.keys(W_CLOTHES).flatMap((v) => (Object.keys(W_WHO) as (keyof typeof W_WHO)[]).map((who) => () => createW(v, who))), 6);
  else if (mode === 'F') await pool(F_FRAMES().map((f) => () => jointsF(f)), 3);
  else if (mode === 'T') await pool(Object.keys(T_ITEMS).map((item) => async () => { const kf = await dressT(item); if (kf?.length !== DIRS.length) return console.log(`T ${item}: dress missing`); await pool(DIRS.map((d) => () => walkT(item, kf, d)), 3); }), 2);
  else if (mode === 'U') await pool(U_BODIES.filter((n) => !process.argv[3] || n === process.argv[3]).flatMap((body) => Object.keys(U_ITEMS).map((item) => async () => {
    const kf = await dressU(body, item), b = bodyU(body);
    if (kf?.length !== b.drawn.length) return console.log(`U ${body} ${item}: dress missing`);
    await pool(b.drawn.map((d) => () => poseU(body, item, kf, d)), 3);
  })), 6);
}
