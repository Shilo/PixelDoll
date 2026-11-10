// Arm S (2026-11-10): is the decisive variable the key HUE or the keying STRATEGY? Practitioner setups against production green.
// Arms (new, paid): fc = whole body in five flat BRIGHT cyan tones with no dark outline (the body's outline drawn as a key tone
// just under the skin, as in the third-party "plain outline" stand-in), fg = the same construction in green (hue control),
// sc = skin only in four flat bright cyan tones taken from a practitioner's own sprites, every other body px (outline,
// underwear, eyes) left natural, with a "no cyan on the clothing" prompt. Production green (continuous ramp, rule (c)) and the
// cyan continuous ramp are reused from arm Y (same bodies, items, prompts and seeds). Pre-registration:
// docs/research/2026-11-09-paperdoll-video-review/evidence/chroma-strategies.md. Outputs: out/<C25_RUN>/S.
// Usage (from spikes/api): C25_RUN=chroma-strategies-2026-11-10 C25_CAP=500 node c25/arm_s.mts dry
//   ... arm_s.mts dressA <seed> <arms> [items] | dressB <arms> <items> | walk <arms> <items> | prod <item> (production pickKey route)
import './y_env.mts'; // must stay first: local API base and agent key for this process (see the file)
import { items, chroma, paid, pool, b64, save, OUT, type Img } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { rigB, restB } from './bodyB.mts';
import { stored } from './arm_y.mts';
const APP = new URL('../../../app/src/lib/', import.meta.url).href;
const { lab } = await import(APP + 'dress/palette.ts');

export type A = 'fc' | 'fg' | 'sc';
export const ARMS: A[] = ['fc', 'fg', 'sc'];
export const HUE: Record<A, number> = { fc: 185, fg: 120, sc: 185 };
export const NAME: Record<A, string> = { fc: 'bright cyan', fg: 'bright green', sc: 'bright cyan' };
export const S_ITEMS: Record<string, { slot: string; prompt: string }> = {
  helm: { slot: 'head', prompt: 'a steel great helm covering the whole head, cold grey steel with bright metallic highlights' },
  plate: { slot: 'torso_outer', prompt: 'a polished silver plate armor chestpiece covering the torso' },
  hair: { slot: 'hair', prompt: 'long blonde hair in two braids hanging over the shoulders, face visible, no hat' },
  cloak: { slot: 'back', prompt: 'a long red hooded cloak hanging from the shoulders behind the back, hood down' },
  jerkin: { slot: 'torso_outer', prompt: 'a tan leather jerkin with brass buttons covering the torso down to the hips' },
  amulet: { slot: 'neck', prompt: 'a gold chain amulet with a large turquoise gem on the chest' }, // cyan-risk control
  tunic: { slot: 'torso_outer', prompt: 'an emerald green cloth tunic covering the torso down to the hips' }, // green-risk control
};
export const BODY = {
  A: { rig: rigA() as any, rest: restA, views: [...DIRS] as string[] },
  B: { rig: rigB() as any, rest: restB, views: ['south', 'east', 'north'] },
};
export const fileOf = (body: 'A' | 'B', item: string, a: string, what: string) => `${OUT}/S/${body}/${item}/${a}_${what}`;

const rgb = (d: ArrayLike<number>, i: number) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
/** HSV hue (deg), saturation, value of a color. */
export function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return [0, 0, mx / 255];
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / mx, mx / 255];
}
function fromHsv(h: number, s: number, v: number): [number, number, number] {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((R + m) * 255), Math.round((G + m) * 255), Math.round((B + m) * 255)];
}
/** Base px class from OKLab: outline (L < 0.42, the third-party outline cut), garment (gray, C < 0.04), skin (warm). */
export type Part = 'outline' | 'garment' | 'skin' | 'other';
export function partOf(c: number): Part {
  const [L, a, b] = lab(c), C = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  // skin first, so dark skin shades (ears and neck in shadow) are keyed on the skin-only arm; near-black stays outline
  if (L >= 0.25 && C >= 0.05 && h >= 15 && h <= 100) return 'skin';
  if (L < 0.42) return 'outline';
  return C < 0.04 ? 'garment' : 'other';
}
/** Third-party stand-in tones (outline, shadow, dark, main, light; all value >= 0.69) rotated to `hue`. */
const PINK = [[204, 22, 148], [176, 16, 128], [232, 28, 164], [255, 60, 188], [255, 128, 216]];
export const flatTones = (hue: number) => PINK.map(([r, g, b]) => { const [, s, v] = hsv(r, g, b); return fromHsv(hue, s, v); });
/** Skin tones measured on a practitioner's cyan-skin sprites (most used, dark to light). */
export const SKIN_TONES: [number, number, number][] = [[0, 138, 156], [0, 190, 208], [54, 227, 238], [160, 250, 255]];
const quant = (vals: number[]) => { const s = [...vals].sort((x, y) => x - y); return [0.25, 0.5, 0.75].map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]); };
const L = (c: number) => lab(c)[0];
/** fc / fg: every opaque px to five flat bright tones; base outline px get the "outline" tone just under the skin, the rest the
 * shadow, dark, main, light tone by the body's own lightness quartiles. sc: only skin px to four flat cyan tones. */
export function mannequin(base: Img, a: A): Img {
  const o: Img = { w: base.w, h: base.h, data: new Uint8ClampedArray(base.data) }, d = base.data;
  const flatOutline = (c: number) => L(c) < 0.42; // the third-party outline cut
  const pick = (c: number) => (a === 'sc' ? partOf(c) === 'skin' : !flatOutline(c));
  const ls: number[] = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] && pick(rgb(d, i))) ls.push(L(rgb(d, i)));
  const q = quant(ls), tones = a === 'sc' ? SKIN_TONES : flatTones(HUE[a]);
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const c = rgb(d, i);
    if (a !== 'sc' && flatOutline(c)) o.data.set(tones[0], i);
    else if (pick(c)) { const l = L(c), k = l < q[0] ? 0 : l < q[1] ? 1 : l < q[2] ? 2 : 3; o.data.set(a === 'sc' ? tones[k] : tones[1 + k], i); }
  }
  return o;
}
const cells = (views: string[]) => items.cellsNote(views.map((d) => `rest/${d}/0`));
/** Dress prompt: fc / fg use the production template with the key name; sc the practitioner's skin-only wording. */
export function dressPrompt(item: string, a: A, views: string[]): string {
  if (a !== 'sc') return chroma.chromaPrompt(item, 'green', cells(views)).replaceAll(chroma.KEY_NAME.green, NAME[a]);
  return `This pixel art character's skin is painted bright cyan on purpose (a chroma key) and must stay exactly the same bright cyan in every frame. ` +
    `Add only ${item}, drawn in its own colors, identical design in all frames; do not use any cyan on the clothing. ${cells(views)}` +
    'Keep every other pixel, the pose, the outline and the transparent background unchanged.';
}
const CAP = 500;
async function dress(body: 'A' | 'B', item: string, a: A, seed: number) {
  const B = BODY[body], rest = await Promise.all(B.views.map(B.rest));
  return paid({ arm: 'S', label: `S ${body} ${item} ${a} dress s${seed}`, file: fileOf(body, item, a, `dress_s${seed}`), req: items.itemRoute.edit(await Promise.all(rest.map((r) => b64(mannequin(r, a)))), dressPrompt(S_ITEMS[item].prompt, a, B.views), seed, B.rig.cell) as any, estimate: 10, armCap: CAP });
}
/** Production route for an item: pickKey (the emerald tunic goes to magenta), production toChroma and prompt. */
async function prod(item: string, seed: number) {
  const B = BODY.A, rest = await Promise.all(B.views.map(B.rest)), k = chroma.pickKey(S_ITEMS[item].prompt);
  return paid({ arm: 'S', label: `S A ${item} prod-${k} dress s${seed}`, file: fileOf('A', item, `prod-${k}`, `dress_s${seed}`), req: items.itemRoute.edit(await Promise.all(rest.map((r) => b64(chroma.toChroma(r, k)))), items.itemPrompt(S_ITEMS[item].prompt, k, B.views.map((d) => `rest/${d}/0`)), seed, B.rig.cell) as any, estimate: 10, armCap: CAP });
}
async function walk(item: string, a: A, kf: Img[], d: string) {
  const rig = BODY.A.rig, { slot, prompt } = S_ITEMS[item], i = DIRS.indexOf(d as any);
  const req: any = items.itemRoute.pose({ keyframePngB64: await b64(kf[i]), rest: rig.rest[d].keypoints, poses: items.clipKeypoints(rig, 'walk', d as any)!, item: prompt, slot, key: 'green', anim: 'walk', dir: d as any, seed: 7, cell: rig.cell, pad: 0, view: rig.view });
  req.body.description = a === 'sc'
    ? `character with bright cyan skin (chroma key color, no cyan on the clothing) wearing ${prompt}, empty hands, no weapon`
    : req.body.description.replaceAll(chroma.KEY_NAME.green, NAME[a]);
  return paid({ arm: 'S', label: `S A ${item} ${a} walk/${d}`, file: fileOf('A', item, a, `walk_${d}`), req, estimate: 3, armCap: CAP });
}
if (import.meta.main) {
  const [mode = 'dry', x, y, z] = process.argv.slice(2), list = (s: string | undefined, all: string[]) => (s ? s.split(',') : all);
  const t: (() => Promise<unknown>)[] = [];
  if (mode === 'dry') {
    for (const a of ARMS) console.log(a, '|', dressPrompt(S_ITEMS.helm.prompt, a, BODY.A.views));
    console.log('flat cyan', JSON.stringify(flatTones(185)), 'flat green', JSON.stringify(flatTones(120)));
    for (const body of ['A', 'B'] as const) for (const d of BODY[body].views) {
      const r = await BODY[body].rest(d);
      for (const a of ARMS) await save(`${OUT}/S/mannequins/${body}_${d}_${a}.png`, mannequin(r, a));
    }
  } else if (mode === 'dressA') for (const a of list(y, ARMS) as A[]) for (const item of list(z, Object.keys(S_ITEMS))) t.push(() => dress('A', item, a, +x));
  else if (mode === 'dressB') for (const a of list(x, ARMS) as A[]) for (const item of list(y, [])) t.push(() => dress('B', item, a, 7));
  else if (mode === 'prod') t.push(() => prod(x, +(y ?? 7)));
  else if (mode === 'walk') for (const a of list(x, []) as A[]) for (const item of list(y, [])) t.push(async () => {
    const kf = await stored(fileOf('A', item, a, 'dress_s7'));
    if (kf?.length !== 3) return console.log(`no stored keyframes for ${item} ${a}`);
    await pool(DIRS.map((d) => () => walk(item, a, kf, d)), 3);
  });
  await pool(t, 6);
}
