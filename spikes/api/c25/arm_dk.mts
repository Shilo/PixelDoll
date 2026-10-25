// Arms D (dress prompt) and K (key collision): one edit-animation-v2 dress call on body A's rest views (S, E, N), seeds 7 and 11.
// D: ctrl = production itemPrompt; view = view-aware wording. K: magenta (production pickKey) vs blue (green ramp with G<->B
// swapped; extraction runs the production green code on swapped channels) vs none (production diff route on the real base).
// Usage: node --env-file=../../.env c25/arm_dk.mts dry|probe|D|K
import { items, chroma, paid, pool, b64, OUT, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
const rig = rigA(), cell = rig.cell, CELLS = DIRS.map((d) => `rest/${d}/0`);
export const D_ITEMS: Record<string, { slot: string; prompt: string }> = {
  greathelm: { slot: 'head', prompt: 'a steel great helm with a narrow eye slit, covering the whole head' },
  cloak: { slot: 'back', prompt: 'a long red hooded cloak with the hood up over the head, hanging down the back to the calves' },
  tunic: { slot: 'torso_outer', prompt: 'an emerald green tunic with gold trim, covering the torso down to the hips' },
  blackboots: { slot: 'feet', prompt: 'black leather boots reaching up to just below the knees' },
  crown: { slot: 'head', prompt: 'a small gold crown with a white fur rim' },
  robe: { slot: 'torso_outer', prompt: 'a long white wizard robe with long sleeves, covering the body from the shoulders down to the ankles' },
};
export const K_ITEMS: Record<string, { slot: string; prompt: string }> = {
  jester: { slot: 'head', prompt: 'a green and pink jester hat with three bells' },
  holly: { slot: 'torso_outer', prompt: 'a red and green holly-trimmed tunic covering the torso down to the hips' },
};
export const SEEDS = [7, 11];
const VIEW: Record<string, string> = { south: 'from the front (facing the viewer)', 'south-east': 'from the front-right', east: 'from the side (facing right)', 'north-east': 'from the back-right', north: 'from the back', 'north-west': 'from the back-left', west: 'from the side (facing left)', 'south-west': 'from the front-left' };
const NAME = { green: 'bright green', magenta: 'magenta', blue: 'bright blue' } as const;
/** D variant: one prompt per angle instead of "identical design in all frames" plus the pseudo-clip "rest" note. */
export function viewPrompt(item: string, key: keyof typeof NAME, dirs: string[]): string {
  const n = NAME[key];
  return `This pixel art character is a solid ${n} mannequin seen from ${dirs.length} angles: ${dirs.map((d, i) => `frame ${i + 1} ${VIEW[d]}`).join(', ')}. ` +
    `The ${n} color is intentional (a chroma key) and must stay exactly the same ${n} in every frame. ` +
    `Add only ${item}, drawn in its own natural colors (no ${n} on the item). The item is the same in every frame, shown as it looks from that frame's angle. ` +
    'Keep every other pixel, the pose, the outline and the transparent background unchanged.';
}
export const swapGB = (im: Img): Img => { const d = new Uint8ClampedArray(im.data); for (let i = 0; i < d.length; i += 4) { d[i + 1] = im.data[i + 2]; d[i + 2] = im.data[i + 1]; } return { ...im, data: d }; };
export const fileOf = (arm: string, item: string, variant: string, seed: number) => `${OUT}/${arm}/${item}/${variant}_s${seed}`;

export async function dressReq(item: string, prompt: string, variant: string, seed: number) {
  const rest = await Promise.all(DIRS.map((d) => restA(d)));
  let frames: Img[], description: string;
  if (variant === 'none') { frames = rest; description = items.itemPrompt(prompt, 'none', CELLS); }
  else if (variant === 'blue') { frames = rest.map((r) => swapGB(chroma.toChroma(r, 'green'))); description = items.itemPrompt(prompt, 'green', CELLS).replaceAll('bright green', 'bright blue'); }
  else {
    const key = variant === 'magenta' ? 'magenta' : chroma.pickKey(prompt);
    frames = rest.map((r) => chroma.toChroma(r, key));
    description = variant === 'view' ? viewPrompt(prompt, key, [...DIRS]) : items.itemPrompt(prompt, key, CELLS);
  }
  return items.itemRoute.edit(await Promise.all(frames.map(b64)), description, seed, cell);
}
const task = (arm: 'D' | 'K', item: string, prompt: string, variant: string, seed: number, cap: number) => async () =>
  paid({ arm, label: `${arm} ${item} ${variant} s${seed}`, file: fileOf(arm, item, variant, seed), req: (await dressReq(item, prompt, variant, seed)) as any, estimate: 10, armCap: cap });

if (import.meta.main) {
  const mode = process.argv[2] ?? 'dry', t: (() => Promise<unknown>)[] = [];
  if (mode === 'D' || mode === 'dry' || mode === 'probe') for (const [item, { prompt }] of Object.entries(D_ITEMS)) for (const seed of SEEDS) for (const v of ['ctrl', 'view']) t.push(task('D', item, prompt, v, seed, 250));
  if (mode === 'K') for (const [item, { prompt }] of Object.entries(K_ITEMS)) for (const seed of SEEDS) for (const v of ['magenta', 'blue', 'none']) t.push(task('K', item, prompt, v, seed, 125));
  if (mode === 'dry') {
    for (const [item, v] of [['tunic', 'ctrl'], ['tunic', 'view'], ['jester', 'blue'], ['jester', 'none'], ['jester', 'magenta']]) {
      const p = (D_ITEMS[item] ?? K_ITEMS[item]).prompt, r: any = await dressReq(item, p, v, 7);
      console.log(item, v, r.path, r.body.frames.length, 'frames', r.body.image_size, '\n  ', r.body.description);
    }
  } else if (mode === 'probe') await t[0]();
  else await pool(t, 6);
}
