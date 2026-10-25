// Round 2 arm E: concept images on held weapons and a full outfit. Pro Flash test concepts at native size (96 px held, 64 px robe).
// Arms × seeds 7, 11: traw = transfer-outfit-v2 with the raw concept as reference; ea = anchored edit-animation-v2 with the
// concept as frame 1 (output 0 dropped). Body A rest views S/E/N (held padded 64 -> 96 like production).
// Usage: C25_RUN=c25b C25_CAP=<cap> node --env-file=../../.env c25/arm_e.mts concepts|dry|run
import { items, chroma, paid, pool, b64, OUT, load, exists, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
const CELLS = DIRS.map((d) => `rest/${d}/0`), key = 'green', color = 'bright green';
export const E_ITEMS: Record<string, { slot: string; prompt: string; size: number }> = {
  scimitar: { slot: 'main_hand', prompt: 'a curved golden scimitar with a ruby pommel', size: 96 },
  longbow: { slot: 'main_hand', prompt: 'a wooden longbow with a leather grip', size: 96 },
  robe: { slot: 'torso_outer', prompt: 'a long blue wizard robe with silver stars', size: 64 },
};
const pad = (slot: string) => items.padOf(slot, 'skel', { w: 64, h: 64 });
const conceptFile = (item: string) => `${OUT}/E/concept_${item}`;
const instructions = (item: string) => { // pre-registered per-slot wording; the preservation sentences are the equipment/generate.ts ones
  const { slot, prompt } = E_ITEMS[item], keep = `Preserve target body silhouette, limb positions, ${color} chroma-key ramp and transparent background exactly. Do not transfer the reference body shape.`;
  return slot === 'main_hand'
    ? `Transfer ONLY the identical ${prompt} from the reference into the ${color} mannequin's right hand in every target frame, held pointing down and slightly outward. Target directions in order: ${DIRS.join(', ')}. Use the reference colors. Exactly one weapon, nothing in the left hand, no other clothing or effects. ${keep}`
    : `Dress the ${color} mannequin in the identical ${prompt} from the reference in every target frame. Target directions in order: ${DIRS.join(', ')}. Use the reference colors. Empty hands; no other clothing, weapons or effects. Fit it to the target body. ${keep}`;
};
export async function arm(item: string, v: 'traw' | 'ea', seed: number): Promise<Img[] | null> {
  const { slot, prompt, size } = E_ITEMS[item], p = pad(slot), concept = (await load(`${conceptFile(item)}.0.png`));
  const views = await Promise.all(DIRS.map(async (d) => items.padImg(chroma.toChroma(await restA(d), key), p)));
  const file = `${OUT}/E/${item}_${v}_s${seed}`, label = `E ${item} ${v} s${seed}`;
  if (v === 'ea') {
    const ref = concept.w === size ? concept : items.padImg(concept, (size - concept.w) / 2);
    const req = items.itemRoute.edit([await b64(ref), ...(await Promise.all(views.map(b64)))], items.itemPrompt(p ? items.heldPhrase(prompt, slot) : prompt, key, CELLS, 'rest/south/0'), seed, { w: size, h: size });
    const out = await paid({ arm: 'E', label, file, req: req as any, estimate: size > 80 ? 25 : 10, armCap: 300 });
    return out && out.slice(1);
  }
  const body = { reference_image: { image: { type: 'base64', base64: await b64(concept), format: 'png' }, size: { width: concept.w, height: concept.h } }, frames: await Promise.all(views.map(async (v2) => ({ image: { type: 'base64', base64: await b64(v2), format: 'png' }, size: { width: size, height: size } }))), image_size: { width: size, height: size }, seed, no_background: true, additional_instructions: instructions(item) };
  return paid({ arm: 'E', label, file, req: { path: '/transfer-outfit-v2', body }, estimate: size > 80 ? 25 : 10, armCap: 300 });
}
if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry';
  if (mode === 'concepts') await pool(Object.entries(E_ITEMS).map(([item, { prompt, size }]) => () => paid({ arm: 'E', label: `E concept ${item}`, file: conceptFile(item), req: { path: '/create-image-pro-flash', body: { description: `${prompt}, single item, no character, no hands, game item sprite`, image_size: { width: size, height: size }, no_background: true, seed: 7 } }, estimate: 6, armCap: 300 })), 3);
  else if (mode === 'dry') for (const item of Object.keys(E_ITEMS)) console.log(item, '|', instructions(item));
  else { // the first 96 px transfer is a price probe: run it alone, then the rest
    await arm('scimitar', 'traw', 7);
    const t: (() => Promise<unknown>)[] = [];
    for (const item of Object.keys(E_ITEMS)) for (const s of [7, 11]) for (const v of ['traw', 'ea'] as const) t.push(() => arm(item, v, s));
    await pool(t, 6);
  }
}
