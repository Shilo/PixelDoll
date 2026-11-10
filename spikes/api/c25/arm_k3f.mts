// Keys 3 final step (fallback keys): two same-session paired checks that stored outputs could not decide. Plan and rule:
// scratchpad keys3final/RESULTS.md section "Paid check". Body A (48 px in 64), dress only, S/E/N, seeds 7 and 11.
//   R2 merge: can azure replace blue for green plus pink or red? jesterR2 and holly on {blue, azure}.
//   R1 steel: does magenta tint steel on green-plus-steel items? plume and tabard on {magenta, azure}.
// The key is forced per arm (production toChroma and itemPrompt with that key); everything else is the production dress builder.
// Usage (from spikes/api): C25_RUN=keys3-2026-11-10 C25_CAP=440 node c25/arm_k3f.mts dry|run [cell filter]
import './y_env.mts'; // must stay first: local API base and agent key for this process (see the file)
import fs from 'node:fs';
import { items, chroma, paid, pool, b64, save, spent, OUT, TOTAL_CAP, type Img } from './lib.mts';
import { API_BASE } from './y_env.mts';
import { rigA, restA } from './s4rig.mts';

type Key = 'magenta' | 'blue' | 'azure';
export const ITEMS: Record<string, { slot: string; prompt: string; role: string }> = {
  jesterR2: { slot: 'head', prompt: 'a green and pink jester hat on the head, face visible', role: 'blue' },
  holly: { slot: 'torso_outer', prompt: 'a red and green holly tunic covering the torso down to the hips', role: 'blue' },
  plume: { slot: 'head', prompt: 'a steel helmet with a green plume, face visible', role: 'magenta' },
  tabard: { slot: 'torso_outer', prompt: 'a green tabard over steel plate armor covering the torso', role: 'magenta' },
};
export const VIEWS = ['south', 'east', 'north'];
export type Cell = { item: string; seed: number; key: Key };
const arms = (its: string[], keys: Key[]): Cell[] => its.flatMap((item) => [7, 11].flatMap((seed) => keys.map((key) => ({ item, seed, key }))));
export const CELLS: Cell[] = [...arms(['jesterR2', 'holly'], ['blue', 'azure']), ...arms(['plume', 'tabard'], ['magenta', 'azure'])];
export const fileOf = (c: Cell) => `${OUT}/K3F/${c.item}/${c.key}_dress_s${c.seed}`;
export const labelOf = (c: Cell) => `K3F A ${c.item} ${c.key} dress s${c.seed}`;
const EST = 10, ARM_CAP = 200; // 16 calls x 10; the step's hard cap is 300

async function request(c: Cell) {
  const rig = rigA(), { slot, prompt } = ITEMS[c.item], pad = items.padOf(slot, 'skel', rig.cell);
  if (pad) throw new Error('held items are out of scope here');
  const ims: Img[] = [];
  for (const d of VIEWS) ims.push(chroma.toChroma(await restA(d), c.key));
  const desc = items.itemPrompt(items.dressItem({ prompt, slot, method: 'skel' }), c.key, VIEWS.map((d) => `rest/${d}/0`));
  return { ims, desc, req: items.itemRoute.edit(await Promise.all(ims.map(b64)), desc, c.seed, rig.cell) as any };
}

if (import.meta.main) {
  const [mode = 'dry', filter] = process.argv.slice(2), cells = CELLS.filter((c) => !filter || labelOf(c).includes(filter));
  console.log(`base ${API_BASE.startsWith('http://localhost') ? 'local' : 'public'}; ledger spent ${spent()}; C25_CAP ${TOTAL_CAP}`);
  for (const [k, v] of Object.entries(ITEMS)) if (chroma.pickKey(v.prompt) !== v.role) throw new Error(`${k}: pickKey routes it to ${chroma.pickKey(v.prompt)}, expected ${v.role}`);
  if (mode === 'dry') {
    for (const c of cells) {
      const { desc, req } = await request(c);
      console.log(`${labelOf(c)} | ${fs.existsSync(`${fileOf(c)}.json`) ? 'STORED' : 'new'} | ${req.path} | ${desc}`);
    }
    console.log(`${cells.length} calls, estimate ${cells.length * EST} gens`);
  } else if (mode === 'run') {
    if (!TOTAL_CAP || TOTAL_CAP > 560) throw new Error('set C25_CAP to at most 560 (260 stage 1 + 300 this step)');
    // pairs are adjacent in CELLS (same item and seed, both keys), so the pool sends them back to back
    await pool(cells.map((c) => async () => {
      const { ims, req } = await request(c);
      for (const [i, im] of ims.entries()) await save(`${fileOf(c)}.input.${i}.png`, im);
      return paid({ arm: 'K3F', label: labelOf(c), file: fileOf(c), req, estimate: EST, armCap: ARM_CAP });
    }), 6);
    console.log(`done: ledger spent ${spent()} (arm K3F ${spent('K3F')})`);
  } else throw new Error(`unknown mode ${mode}`);
}
