// Arm Y (2026-11-09): which chroma key should be the DEFAULT mannequin? Green (production default) vs cyan (hue 180, harness:
// the green ramp rotated +60 and extracted by rotating back, as hue.mts does for azure), azure (production 4th key) and blue
// (production 3rd key). Identical prompts except the key name, identical seeds and bodies. Production dress (edit-animation-v2)
// and pose (skeleton-v3) builders. Results go to out/<C25_RUN>/Y. Pre-registered rule: out/<C25_RUN>/RESULTS.md.
// Usage (from spikes/api): C25_RUN=chroma-2026-11-09 C25_CAP=900 node c25/arm_y.mts dry
//   ... arm_y.mts dressA <seed> <keys,comma> [items,comma] | dressB <keys> <items> | walk <keys> <items>
import './y_env.mts'; // must stay first: local API base and agent key for this process (see the file)
import fs from 'node:fs';
import { items, chroma, paid, pool, b64, load, exists, OUT, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { rigB, restB } from './bodyB.mts';
import { rotate } from './hue.mts';

export type K = 'green' | 'cyan' | 'azure' | 'blue';
export const KS: K[] = ['green', 'cyan', 'azure', 'blue'];
/** Hue rotation that maps a key's frame back to green (cyan is the harness-only key; azure and blue ship). */
export const ROT: Record<K, number> = { green: 0, cyan: 60, azure: 90, blue: 120 };
export const NAME: Record<K, string> = { green: chroma.KEY_NAME.green, cyan: 'bright cyan', azure: chroma.KEY_NAME.azure, blue: chroma.KEY_NAME.blue };
export const Y_ITEMS: Record<string, { slot: string; prompt: string; collides?: K[] }> = {
  helm: { slot: 'head', prompt: 'a steel great helm covering the whole head, cold grey steel with bright metallic highlights' },
  boots: { slot: 'feet', prompt: 'a pair of brown leather boots on the feet, reaching up to just below the knees' },
  cloak: { slot: 'back', prompt: 'a long red hooded cloak hanging from the shoulders behind the back, hood down' },
  crown: { slot: 'head', prompt: 'a golden crown with a white fur trim band, on top of the head, face visible' },
  hair: { slot: 'hair', prompt: 'long blonde hair in two braids hanging over the shoulders, face visible, no hat' },
  jerkin: { slot: 'torso_outer', prompt: 'a tan leather jerkin with brass buttons covering the torso down to the hips' },
  plate: { slot: 'torso_outer', prompt: 'a polished silver plate armor chestpiece covering the torso' },
  hood: { slot: 'head', prompt: 'a drab khaki ranger hood in muted yellowish earth tones covering the head, face visible' },
  amulet: { slot: 'neck', prompt: 'a gold chain amulet with a large turquoise gem on the chest', collides: ['cyan', 'azure', 'blue'] },
  tunic: { slot: 'torso_outer', prompt: 'a navy blue cloth tunic covering the torso down to the hips', collides: ['azure', 'blue', 'cyan'] },
};
const CELLS = DIRS.map((d) => `rest/${d}/0`);
export const BODY = {
  A: { rig: rigA() as any, rest: restA, views: [...DIRS] as string[] },
  B: { rig: rigB() as any, rest: restB, views: ['south', 'east', 'north'] },
};
export const fileOf = (body: 'A' | 'B', item: string, k: K, what: string) => `${OUT}/Y/${body}/${item}/${k}_${what}`;
/** The key mannequin the model receives. */
export const mannequin = (base: Img, k: K) => (k === 'cyan' ? rotate(chroma.toChroma(base, 'green'), 60) : chroma.toChroma(base, k));
const named = (s: string, k: K) => (k === 'cyan' ? s.replaceAll(chroma.KEY_NAME.green, NAME.cyan) : s);
/** Production extraction for green/azure/blue; cyan rotates to green, extracts with the green code and rotates the layer back. */
export function extract(k: K, o: Omit<Parameters<typeof items.extractCell>[0], 'route'>) {
  if (k !== 'cyan') return items.extractCell({ ...o, route: k });
  const c: any = items.extractCell({ ...o, out: rotate(o.out, -60), route: 'green' });
  c.layer = rotate(c.layer, 60); c.out = rotate(c.out, 60); c.input = rotate(c.input, 60);
  return c;
}
const CAP = 900;
/** A stored call's frames, or null; never spends. */
export const stored = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
async function dress(body: 'A' | 'B', item: string, k: K, seed: number) {
  const B = BODY[body], rest = await Promise.all(B.views.map(B.rest));
  const description = named(items.itemPrompt(Y_ITEMS[item].prompt, k === 'cyan' ? 'green' : k, B.views.map((d) => `rest/${d}/0`)), k);
  return paid({ arm: 'Y', label: `Y ${body} ${item} ${k} dress s${seed}`, file: fileOf(body, item, k, `dress_s${seed}`), req: items.itemRoute.edit(await Promise.all(rest.map((r) => b64(mannequin(r, k)))), description, seed, B.rig.cell) as any, estimate: body === 'A' ? 10 : 15, armCap: CAP });
}
async function walk(item: string, k: K, kf: Img[], d: string) {
  const rig = BODY.A.rig, { slot, prompt } = Y_ITEMS[item], i = DIRS.indexOf(d as any);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[i]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: prompt, slot, key: k === 'cyan' ? 'green' : k, anim: 'walk', dir: d as any, seed: 7, cell: rig.cell, pad: 0, view: rig.view });
  req.body.description = named(req.body.description, k);
  return paid({ arm: 'Y', label: `Y A ${item} ${k} walk/${d}`, file: fileOf('A', item, k, `walk_${d}`), req, estimate: 3, armCap: CAP });
}
if (import.meta.main) {
  const [mode = 'dry', a, b, c] = process.argv.slice(2), list = (s: string | undefined, all: string[]) => (s ? s.split(',') : all);
  const t: (() => Promise<unknown>)[] = [];
  if (mode === 'dry') {
    for (const k of KS) console.log(k, '|', named(items.itemPrompt(Y_ITEMS.helm.prompt, k === 'cyan' ? 'green' : k, CELLS), k));
    const r = await restA('south');
    for (const k of KS) { const im = mannequin(r, k); console.log(k, 'px', [...im.data.subarray((40 * 64 + 32) * 4, (40 * 64 + 32) * 4 + 3)]); }
  } else if (mode === 'dressA') for (const k of list(b, KS) as K[]) for (const item of list(c, Object.keys(Y_ITEMS))) t.push(() => dress('A', item, k, +a));
  else if (mode === 'dressB') for (const k of list(a, KS) as K[]) for (const item of list(b, [])) t.push(() => dress('B', item, k, 7));
  else if (mode === 'walk') for (const k of list(a, []) as K[]) for (const item of list(b, [])) t.push(async () => {
    const kf = await stored(fileOf('A', item, k, 'dress_s7'));
    if (kf?.length !== 3) return console.log(`no stored keyframes for ${item} ${k}`);
    await pool(DIRS.map((d) => () => walk(item, k, kf, d)), 3);
  });
  await pool(t, 6);
}
