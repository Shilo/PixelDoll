// Round 4 (C25_RUN=c25d), rules fixed before the run.
// Arm G (prompt grammar): the production dress prompt reads "1 cells rest facing south" and, for held items, "…the arms stay
// exactly as they are, drawn in its own natural colors"; the grid prompt reads "the identical a red cape" and "a 8-frame".
// Old (production) vs new wording, same seed 7, body A: dress of the S4 helmet, cape, chest and an off-hand longbow (96 px), and
// one cape grid repair (walk east). Rule: the new wording ships only if no pair gets a new hard-gate failure and the sheets look
// no worse; otherwise the old wording stays.
// Arm I (one pose call for idle + walk): chibi body (idle 4 + walk 8 frames), chibi helm and jester (round 2 dressed keyframes),
// per direction: idle alone (seed 7) vs one 12-frame call idle + walk (seed 7, action "walk"); walk alone exists (round 2).
// Rule: adopted only if neither the idle nor the walk part has more failing clips than the separate calls, the idle part still
// stands (no stepping), and the price is 4 gens per 12-frame call.
// Usage: C25_RUN=c25d C25_CAP=<cap> node --env-file=../../.env c25/arm_r4.mts dry|run
import path from 'node:path';
import { items, chroma, clips, routes, paid, pool, b64, OUT, load, type Img } from './lib.mts';
import { rigA, restA, baseA, DIRS, S4_ITEMS, keyframeA } from './s4rig.mts';
import { studioBody } from './bodyB.mts';
const CELLS = DIRS.map((d) => `rest/${d}/0`), BOW = 'a wooden longbow with a leather grip';
const strip = (s: string) => s.replace(/^(a|an|the)\s+/i, '');
/** The grammar fixes, applied to a production prompt. */
export function fixWording(p: string, item: string, key: chroma.Key) {
  const n = chroma.KEY_NAME[key];
  return p.replace(/\b1 cells\b/g, '1 cell')
    .replace(`Add only ${item}, drawn in its own natural colors (no ${n} on the item), identical design in all frames.`, `Add only ${item}. Draw it in its own natural colors (no ${n} on it), with the identical design in all frames.`)
    .replace(`the identical ${item}`, `the identical ${strip(item)}`)
    .replace(/are a (\d+)-frame (.+?) animation/, 'are $1 frames of a $2 animation');
}
const G_ITEMS: Record<string, { slot: string; prompt: string }> = { helmet: S4_ITEMS.helmet, cape: S4_ITEMS.cape, chest: S4_ITEMS.chest, bow: { slot: 'off_hand', prompt: BOW } };
export const fileOf = (arm: string, item: string, what: string) => `${OUT}/${arm}/${item}/${what}`;
async function dressG(item: string, v: 'old' | 'new') {
  const { slot, prompt } = G_ITEMS[item], rig: any = rigA(), pad = items.padOf(slot, 'skel', rig.cell), C = rig.cell.w + 2 * pad;
  const views = await Promise.all(DIRS.map(async (d) => b64(items.padImg(chroma.toChroma(await restA(d), 'green'), pad))));
  const phrase = pad ? items.heldPhrase(prompt, slot) : prompt, old = items.itemPrompt(phrase, 'green', CELLS);
  const req: any = items.itemRoute.edit(views, v === 'old' ? old : fixWording(old, phrase, 'green'), 7, { w: C, h: C });
  return paid({ arm: 'G', label: `G ${item} ${v} dress`, file: fileOf('G', item, `${v}_dress`), req, estimate: 10, armCap: 120 });
}
async function gridG(v: 'old' | 'new') { // cape walk east on body A: 8 green mannequin cells (slot-band masks) + the 3 S4 keyframes
  const rig: any = rigA(), skel = (k: any[]) => Object.fromEntries(k.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
  const kp = items.clipKeypoints(rig, 'walk', 'east')!, cells = await Promise.all(kp.map(async (_, i) => chroma.toChroma(await baseA('east', 'walk', i), 'green')));
  const masks = kp.map((k) => items.bandMask(items.bandOf('back', skel(k), 64), 64, 64)), refs = await Promise.all(DIRS.map((d) => keyframeA('cape', d)));
  const g = items.packGrid([...cells, ...refs], [...masks, ...refs.map(() => null)]), item = S4_ITEMS.cape.prompt;
  const old = items.gridPrompt({ item, slot: 'back', key: 'green', anim: 'walk', dir: 'east', n: 8, refs: [...DIRS], cell: { w: 64, h: 64 } });
  const req = routes.routes.inpaintV3({ description: v === 'old' ? old : fixWording(old, item, 'green'), inpainting_image: { image: routes.png(await b64(g.image)), size: { width: g.image.w, height: g.image.h } }, mask_image: { image: routes.png(await b64(g.mask)), size: { width: g.mask.w, height: g.mask.h } }, no_background: true, seed: 7 });
  return paid({ arm: 'G', label: `G cape ${v} grid walk/east`, file: fileOf('G', 'cape', `${v}_grid`), req: req as any, estimate: 10, armCap: 120 });
}
const chibi = () => studioBody('chibi');
const I_ITEMS: Record<string, string> = { helmChibi: 'a steel great helm with a narrow eye slit, covering the whole head', jesterChibi: 'a green and purple jester hat with three bells' };
const R2 = path.resolve(import.meta.dirname, '../out/c25b/N');
async function poseI(item: string, d: string, v: 'idle' | 'both') {
  const b = chibi(), rig = b.rig, key = chroma.pickKey(I_ITEMS[item]), i = b.drawn.indexOf(d), idle = items.clipKeypoints(rig, 'idle', d as any)!, walk = items.clipKeypoints(rig, 'walk', d as any)!;
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(await load(`${R2}/${item}/dress.${i}.png`)), rest: rig.rest[d].keypoints, poses: v === 'idle' ? idle : [...idle, ...walk], item: I_ITEMS[item], slot: 'head', key, anim: v === 'idle' ? 'idle' : 'walk', dir: d as any, seed: 7, cell: rig.cell, view: rig.view });
  return paid({ arm: 'I', label: `I ${item} ${v}/${d}`, file: fileOf('I', item, `${v}_${d}`), req, estimate: v === 'idle' ? 3 : 4, armCap: 60 });
}
if (import.meta.main) {
  if ((process.argv[2] ?? 'dry') === 'dry') {
    const old = items.itemPrompt(items.heldPhrase(BOW, 'off_hand'), 'green', CELLS);
    console.log('OLD', old, '\nNEW', fixWording(old, items.heldPhrase(BOW, 'off_hand'), 'green'));
    const g = items.gridPrompt({ item: S4_ITEMS.cape.prompt, slot: 'back', key: 'green', anim: 'walk', dir: 'east', n: 8, refs: [...DIRS], cell: { w: 64, h: 64 } });
    console.log('GRID NEW', fixWording(g, S4_ITEMS.cape.prompt, 'green'));
    const b = chibi(); console.log('chibi', b.drawn, b.rig.animations.map((a: any) => `${a.id}:${a.cells}`));
  } else {
    const t: (() => Promise<unknown>)[] = [];
    for (const item of Object.keys(G_ITEMS)) for (const v of ['old', 'new'] as const) t.push(() => dressG(item, v));
    for (const v of ['old', 'new'] as const) t.push(() => gridG(v));
    for (const item of Object.keys(I_ITEMS)) for (const d of chibi().drawn) for (const v of ['idle', 'both'] as const) t.push(() => poseI(item, d, v));
    await pool(t, 6);
  }
}
