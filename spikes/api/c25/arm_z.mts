// Round 2 arm Z: azure (hue 210°) as a 4th key for green + purple items. Body A dress (S, E, N) on azure for 3 items × seeds
// 7, 11; a magenta reference (production pickKey) for 2 items at seed 7; azure walk poses (S, E, N) at seed 7.
// Usage: C25_RUN=c25b C25_CAP=<cap> node --env-file=../../.env c25/arm_z.mts dry|run
import { items, chroma, paid, pool, b64, OUT, load, exists, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { azureMannequin, AZURE_NAME } from './hue.mts';
const rig = rigA(), cell = rig.cell, CELLS = DIRS.map((d) => `rest/${d}/0`);
export const Z_ITEMS: Record<string, { slot: string; prompt: string }> = {
  jester: { slot: 'head', prompt: 'a green and purple jester hat with three bells' },
  stripes: { slot: 'torso_outer', prompt: 'a green and purple striped tunic covering the torso down to the hips' },
  hood: { slot: 'head', prompt: 'a green and violet mage hood' },
};
export const fileOf = (item: string, v: string, what: string) => `${OUT}/Z/${item}/${v}_${what}`;
async function dress(item: string, v: 'azure' | 'magenta', seed: number) {
  const { prompt } = Z_ITEMS[item], rest = await Promise.all(DIRS.map(restA));
  const frames = v === 'azure' ? rest.map(azureMannequin) : rest.map((r) => chroma.toChroma(r, 'magenta'));
  const description = v === 'azure' ? items.itemPrompt(prompt, 'green', CELLS).replaceAll('bright green', AZURE_NAME) : items.itemPrompt(prompt, 'magenta', CELLS);
  return paid({ arm: 'Z', label: `Z ${item} ${v} dress s${seed}`, file: fileOf(item, v, `dress_s${seed}`), req: items.itemRoute.edit(await Promise.all(frames.map(b64)), description, seed, cell) as any, estimate: 10, armCap: 140 });
}
async function walk(item: string, kf: Img[], d: string) {
  const { slot, prompt } = Z_ITEMS[item], i = DIRS.indexOf(d as any);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[i]), rest: (rig.rest as any)[d].keypoints, poses: items.clipKeypoints(rig as any, 'walk', d as any)!, item: prompt, slot, key: 'green', anim: 'walk', dir: d as any, seed: 7, cell, pad: 0, view: rig.view as any });
  req.body.description = req.body.description.replace('bright green', AZURE_NAME);
  return paid({ arm: 'Z', label: `Z ${item} azure walk/${d}`, file: fileOf(item, 'azure', `walk_${d}`), req, estimate: 3, armCap: 140 });
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry';
  if (mode === 'dry') { const r: any = items.itemRoute.edit(['x', 'x', 'x'], items.itemPrompt(Z_ITEMS.jester.prompt, 'green', CELLS).replaceAll('bright green', AZURE_NAME), 7, cell); console.log(r.body.description); const m = azureMannequin(await restA('south')); console.log('azure px sample', [...m.data.subarray((40 * 64 + 32) * 4, (40 * 64 + 32) * 4 + 4)]); }
  else {
    const t: (() => Promise<unknown>)[] = [];
    for (const item of Object.keys(Z_ITEMS)) t.push(async () => { const kf = await dress(item, 'azure', 7); if (kf?.length === 3) await pool(DIRS.map((d) => () => walk(item, kf, d)), 3); });
    for (const item of Object.keys(Z_ITEMS)) t.push(() => dress(item, 'azure', 11));
    for (const item of ['jester', 'stripes']) t.push(() => dress(item, 'magenta', 7));
    await pool(t, 6);
  }
}
