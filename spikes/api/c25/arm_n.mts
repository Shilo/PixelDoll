// Round 2 arm N: control items on two new Studio bodies (Top-down 4, 3 drawn views): body128 (128 px human, 160 px frame) gets a
// helmet, a hooded cloak and a held sword (192 px oversize canvas); chibi (64 px chibi dwarf, 80 px frame) gets two head items.
// Production key choice (pickKey), dress wording and raw skeleton-v3 walk poses, seed 7. The first 128 px dress is a price probe.
// Usage: C25_RUN=c25b C25_CAP=<cap> node --env-file=../../.env c25/arm_n.mts dry|probe|run
import { items, chroma, paid, pool, b64, OUT, type Img } from './lib.mts';
import { studioBody } from './bodyB.mts';
import { D_ITEMS } from './arm_dk.mts';
import { Z_ITEMS } from './arm_z.mts';
const bodies: Record<string, ReturnType<typeof studioBody>> = {};
export const bodyOf = (n: 'body128' | 'chibi') => (bodies[n] ??= studioBody(n));
export const N_ITEMS: Record<string, { body: 'body128' | 'chibi'; slot: string; prompt: string }> = {
  helm128: { body: 'body128', ...D_ITEMS.greathelm },
  cloak128: { body: 'body128', ...D_ITEMS.cloak },
  sword128: { body: 'body128', slot: 'main_hand', prompt: 'a steel longsword with a brass crossguard' },
  helmChibi: { body: 'chibi', ...D_ITEMS.greathelm },
  jesterChibi: { body: 'chibi', ...Z_ITEMS.jester }, // azure in production
};
const SEED = 7, CAP = 400;
export const fileOf = (item: string, what: string) => `${OUT}/N/${item}/${what}`;
export const nCase = (item: string) => {
  const { body, slot, prompt } = N_ITEMS[item], b = bodyOf(body), pad = items.padOf(slot, 'skel', b.rig.cell);
  return { b, slot, prompt, pad, key: chroma.pickKey(prompt), C: b.rig.cell.w + 2 * pad };
};
async function dress(item: string) {
  const { b, slot, prompt, pad, key, C } = nCase(item), cells = b.drawn.map((d) => `rest/${d}/0`);
  const frames = await Promise.all(b.drawn.map(async (d) => b64(items.padImg(chroma.toChroma(await b.rest(d), key), pad))));
  const req = items.itemRoute.edit(frames, items.itemPrompt(pad ? items.heldPhrase(prompt, slot) : prompt, key, cells), SEED, { w: C, h: C });
  return paid({ arm: 'N', label: `N ${item} dress`, file: fileOf(item, 'dress'), req: req as any, estimate: C > 96 ? 40 : 10, armCap: CAP });
}
async function walk(item: string, kf: Img[], d: string) {
  const { b, slot, prompt, pad, key, C } = nCase(item), i = b.drawn.indexOf(d);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[i]), rest: b.rig.rest[d].keypoints, poses: items.clipKeypoints(b.rig, 'walk', d as any)!, item: prompt, slot, key, anim: 'walk', dir: d as any, seed: SEED, cell: b.rig.cell, pad, view: b.rig.view });
  return paid({ arm: 'N', label: `N ${item} walk/${d}`, file: fileOf(item, `walk_${d}`), req, estimate: C > 96 ? 10 : 3, armCap: CAP });
}
async function runItem(item: string) {
  const kf = await dress(item), b = bodyOf(N_ITEMS[item].body), n = b.drawn.length;
  if (kf?.length !== n) return console.log(`N ${item}: dress missing (${kf?.length ?? 0}/${n}); no poses`);
  await pool(b.drawn.map((d) => () => walk(item, kf, d)), 3);
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry';
  if (mode === 'dry') for (const item of Object.keys(N_ITEMS)) { const c = nCase(item); console.log(item, c.key, `pad ${c.pad} canvas ${c.C}`, c.b.drawn.join(','), !!items.clipKeypoints(c.b.rig, 'walk', 'south')); }
  else if (mode === 'probe') await dress('helm128');
  else await pool(Object.keys(N_ITEMS).filter((i) => !process.argv[3] || N_ITEMS[i].body === process.argv[3]).map((item) => () => runItem(item)), 5); // run [body128|chibi]
}
