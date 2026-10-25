// Arm C: full pipeline on body B (Studio default geometry: 80 px frame, 5 drawn views): one dress call over the 5 rest views,
// then raw skeleton-v3 walk poses per view. Variants: ctrl (production), blue (third key, jester only), view (D prompt, if D wins).
// Usage: node --env-file=../../.env c25/arm_c.mts dry|ctrl|blue|view
import { items, chroma, paid, pool, b64, OUT, load, type Img } from './lib.mts';
import { rigB, restB, DRAWN } from './bodyB.mts';
import { D_ITEMS, K_ITEMS, viewPrompt, swapGB } from './arm_dk.mts';
const rig = rigB(), cell = rig.cell, CELLS = DRAWN.map((d) => `rest/${d}/0`), SEED = 7;
export const C_ITEMS: Record<string, { slot: string; prompt: string }> = { greathelm: D_ITEMS.greathelm, cloak: D_ITEMS.cloak, tunic: D_ITEMS.tunic, jester: K_ITEMS.jester };
export const fileOf = (item: string, v: string, what: string) => `${OUT}/C/${item}/${v}_${what}`;
const keyOf = (v: string, prompt: string) => (v === 'blue' ? 'green' : chroma.pickKey(prompt)); // blue runs the green code on swapped channels

async function dress(item: string, v: string) {
  const { prompt } = C_ITEMS[item], key = keyOf(v, prompt), rest = await Promise.all(DRAWN.map(restB));
  let frames = rest.map((r) => chroma.toChroma(r, key)), description = v === 'view' ? viewPrompt(prompt, key, DRAWN) : items.itemPrompt(prompt, key, CELLS);
  if (v === 'blue') { frames = frames.map(swapGB); description = description.replaceAll('bright green', 'bright blue'); }
  const req = items.itemRoute.edit(await Promise.all(frames.map(b64)), description, SEED, cell);
  return paid({ arm: 'C', label: `C ${item} ${v} dress`, file: fileOf(item, v, 'dress'), req: req as any, estimate: 15, armCap: 280 });
}
async function pose(item: string, v: string, kf: Img[], d: string) {
  const { slot, prompt } = C_ITEMS[item], key = keyOf(v, prompt), i = DRAWN.indexOf(d);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[i]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: prompt, slot, key, anim: 'walk', dir: d as any, seed: SEED, cell, pad: 0, view: rig.view });
  if (v === 'blue') req.body.description = req.body.description.replace('bright green', 'bright blue');
  return paid({ arm: 'C', label: `C ${item} ${v} walk/${d}`, file: fileOf(item, v, `walk_${d}`), req, estimate: 3, armCap: 280 });
}
export async function runItem(item: string, v: string) {
  const kf = await dress(item, v);
  if (!kf || kf.length !== DRAWN.length) { console.log(`C ${item} ${v}: dress missing (${kf?.length ?? 0} frames); no poses`); return null; }
  const walks = await pool(DRAWN.map((d) => () => pose(item, v, kf, d)), 5);
  return { kf, walks };
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry';
  if (mode === 'dry') {
    const r: any = items.itemRoute.edit((await Promise.all(DRAWN.map(restB))).map(() => 'x'), items.itemPrompt(C_ITEMS.tunic.prompt, chroma.pickKey(C_ITEMS.tunic.prompt), CELLS), SEED, cell);
    console.log(r.path, r.body.frames.length, 'frames', r.body.image_size, '\n ', r.body.description);
  } else {
    const list = mode === 'blue' ? ['jester'] : Object.keys(C_ITEMS);
    await pool(list.map((item) => () => runItem(item, mode)), 4);
  }
}
