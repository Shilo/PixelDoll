// Studio model helpers (pure, node-runnable): user-facing slot groups (D1 §4.1), item thumbnails, base prompts, wording for
// QA and costs. Frame placement lives in lib/rig/normalize.ts (one rule for M2/M3/Studio).
import { makeImg, type Img } from '../lib/image/png.ts';
import { cellImg, layerFrame, over, unionFrame } from '../lib/compose/compose.ts';
import type { DirectionName, Item, Manifest, Project } from '../lib/store/manifest.ts';
import { originOf, type StoredProject } from '../lib/store/project.ts';

/** Explain historical body-QA records without presenting estimated joints or silhouette bounds as proven defects. */
export const bodyQualityNote = (w: string) => w.replace(/^([^/]+)\/([^:]+): /, (_, clip: string, direction: string) => `${clip[0].toUpperCase() + clip.slice(1)} ${direction}: `)
  .replace(/arms ([\d.]+) px off (?:the )?requested pose/, 'estimated arm-joint difference $1 px from requested pose; review')
  .replace(/feet drift (\d+) px from pivot y \d+/, 'legacy silhouette-bottom difference $1 px from frame pivot')
  .replace(/feet drift (\d+) px.*/, 'silhouette bottom differs up to $1 px from reference')
  .replace(/ground line is (\d+) px (above|below) the shared pivot/, 'legacy silhouette bottom is $1 px $2 the frame pivot (view dependent)')
  .replace(/headroom (\d+) px.*/, 'headroom $1 px; tall hair or hats may need a larger frame');

export interface Group { id: string; slots: string[]; empty: string; ideas: { label: string; slot?: string }[] }
/** 16 architecture slots in 8 groups; slots[0] = default slot for a new item. */
export const GROUPS: Group[] = [
  { id: 'Head', slots: ['head'], empty: 'hats', ideas: [{ label: 'wizard hat' }, { label: 'iron knight helmet' }, { label: 'golden crown' }, { label: 'hood' }] },
  { id: 'Hair', slots: ['hair', 'facial_hair'], empty: 'hairstyles', ideas: [{ label: 'long braided hair' }, { label: 'short spiky hair' }, { label: 'ponytail' }, { label: 'full beard', slot: 'facial_hair' }] },
  { id: 'Face', slots: ['face_acc'], empty: 'face items', ideas: [{ label: 'round glasses' }, { label: 'eye patch' }, { label: 'bandit mask' }] },
  { id: 'Body', slots: ['torso_inner', 'torso_outer', 'shoulders', 'arms', 'neck'], empty: 'tops', ideas: [{ label: 'leather vest' }, { label: 'chainmail shirt' }, { label: 'blue tunic' }, { label: 'steel plate armor', slot: 'torso_outer' }] },
  { id: 'Legs', slots: ['legs', 'waist'], empty: 'trousers', ideas: [{ label: 'brown trousers' }, { label: 'plate greaves' }, { label: 'leather belt', slot: 'waist' }] },
  { id: 'Feet', slots: ['feet'], empty: 'shoes', ideas: [{ label: 'leather boots' }, { label: 'sandals' }, { label: 'iron sabatons' }] },
  { id: 'Back', slots: ['back'], empty: 'capes', ideas: [{ label: 'red cape' }, { label: 'travel backpack' }, { label: 'quiver of arrows' }] },
  { id: 'Hands', slots: ['main_hand', 'off_hand'], empty: 'weapons', ideas: [{ label: 'steel sword' }, { label: 'wooden staff' }, { label: 'round shield', slot: 'off_hand' }] },
];
/** Held items PixelLab draws in the left hand: bows (archery prior; round 2 arm B: main hand got the right hand on 1/3 seeds,
 * off hand 3/3) and shields (the main-hand wording forbids a shield). Crossbows stay in the main hand. */
const OFF_HAND = /\b(?:long|short|recurve|hunting|war|great|flat)?bows?\b|\b(?:shield|buckler)s?\b/i;
export const heldSlotFor = (prompt: string) => (OFF_HAND.test(prompt) ? 'off_hand' : 'main_hand');
export const groupOf = (slot: string) => GROUPS.find((g) => g.slots.includes(slot)) ?? GROUPS[3];
export const SLOT_LABEL: Record<string, string> = {
  head: 'Head', hair: 'Hair', facial_hair: 'Facial hair', face_acc: 'Face', torso_inner: 'Top (inner)', torso_outer: 'Top (outer)',
  shoulders: 'Shoulders', arms: 'Arms', neck: 'Neck', legs: 'Legs', waist: 'Waist', feet: 'Feet', back: 'Back', main_hand: 'Main hand', off_hand: 'Off hand', body: 'Body',
};
export const slotLabel = (s: string) => SLOT_LABEL[s] ?? s;

/** One item alone (all its layers, bg under fg) in one cell; mirrored directions flip their source. Oversize layers (v1.3.1,
 * e.g. 96 px held items) line up by pivot on the union of the item's layer frames. */
export function itemCell(p: Project, it: Item, anim: string, dir: DirectionName, cell: number): Img {
  const rig = p.manifest.rig, frame = unionFrame(it.layers.map((l) => layerFrame(rig, l))), out = makeImg(frame.w, frame.h);
  for (const l of [...it.layers].sort((a, b) => +(a.role === 'fg') - +(b.role === 'fg'))) {
    const im = cellImg(p, l, anim, dir, cell), f = layerFrame(rig, l);
    if (im) over(out, im, frame.x - f.x, frame.y - f.y);
  }
  return out;
}

/** First cell (anim, dir) where the item has pixels; for thumbnails. */
export function thumbCell(p: Project, it: Item): Img | null {
  const m = p.manifest;
  for (const a of m.rig.animations)
    for (const d of m.rig.directions) {
      const im = itemCell(p, it, a.id, d.id, 0);
      if (im.data.some((v, i) => i % 4 === 3 && v)) return im;
    }
  return null;
}

/** Opaque bounding box crop (null when empty). */
export function crop(im: Img): Img | null {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = y; }
  if (x1 < 0) return null;
  const o = makeImg(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < o.h; y++) o.data.set(im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x1 + 1) * 4), y * o.w * 4);
  return o;
}

/** Crop several same-size images to the union of their opaque boxes (keeps them aligned). */
export function cropAll(ims: Img[]): Img[] {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const im of ims) for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return ims;
  return ims.map((im) => {
    const o = makeImg(x1 - x0 + 1, y1 - y0 + 1);
    for (let y = 0; y < o.h; y++) o.data.set(im.data.subarray(((y0 + y) * im.w + x0) * 4, ((y0 + y) * im.w + x1 + 1) * 4), y * o.w * 4);
    return o;
  });
}

/** One crop for the entire clip, so animated item previews keep their scale, alignment and layout bounds. */
export function itemPreviewFrames(p: Project, it: Item, anim: string): Img[][] {
  const clip = p.manifest.rig.animations.find((a) => a.id === anim);
  if (!clip) return [];
  const dirs = p.manifest.rig.directions;
  const cropped = cropAll(clip.frames.flatMap((f) => dirs.map((d) => itemCell(p, it, anim, d.id, f.cell))));
  return clip.frames.map((_, i) => cropped.slice(i * dirs.length, (i + 1) * dirs.length));
}

/** Base prompt: the user's words + a bare paper-doll body, so no garment shows through the items' gaps (round 5: the former
 * t-shirt showed in necklines, armholes and open fronts). The shortest wording that drew no garment on a man and a woman over
 * four seeds; without "everywhere" or "nothing worn" men get briefs or a loincloth. "nude" and "underwear" are avoided. See
 * docs/research/bare-skin-base-wording-2026-10-25.md. */
export const BASE_CLOTHES = 'with plain bare skin everywhere, nothing worn';
export const bodyWith = (clothes: string) => `plain bald paperdoll base body, ${clothes}, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso`;
export const BASE_BODY = bodyWith(BASE_CLOTHES);
/** The clothes each base body text names, current first. Prompts saved by earlier versions wear the B15 shirt and shorts
 * (lib/dress/regions.ts splits those into Shirt and Shorts), some spelled "grey". */
const OLD_CLOTHES = 'wearing a plain light gray t-shirt and plain dark gray shorts';
const CLOTHES = [BASE_CLOTHES, OLD_CLOTHES, OLD_CLOTHES.replaceAll('gray', 'grey')];
export const isBaseBody = (line: string) => CLOTHES.some((c) => line.trim() === bodyWith(c))
export const withoutBaseBody = (text: string) => CLOTHES.reduce((t, c) => t.replace(bodyWith(c), ''), text)
/** The clothes of the base body line in a prompt, or undefined when the prompt has none. */
export const baseClothesIn = (text: string) => CLOTHES.find((c) => text.includes(bodyWith(c)))
export const basePrompt = (desc: string) => `${desc.trim().replace(/[.\s]+$/, '')}, ${BASE_BODY}`;
/** What the base LOOKS like (raw skeleton-v3 `description`, S3): no pose words, empty hands. `clothes` null: the description
 * says what the body wears (an exact prompt without a base body line), so no base clothes are added on top of it. */
export const looksOf = (desc: string, clothes: string | null = BASE_CLOTHES) =>
  `${desc.trim().replace(/[.\s]+$/, '')}, ${clothes == null ? '' : `bald, ${clothes}, barefoot, `}empty hands, no weapon`;

export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** The noun of the description's first phrase: "a sturdy young dwarf with a friendly face" -> "Dwarf". */
// ponytail: last word before with/who/in/wearing/comma; a rename field is the real fix.
export function nameFrom(desc: string): string {
  const head = desc.trim().split(/\s+(?:with|who|in|wearing|from|and)\s+|[,.;]/i)[0];
  const w = head.split(/\s+/).filter(Boolean).at(-1) ?? '';
  return w ? w[0].toUpperCase() + w.slice(1) : 'My character';
}

/** Item name from its description, sentence case like the demo: "a straw farmer hat, frayed" -> "Straw farmer hat" (T1 P2-15). */
export function itemNameFrom(desc: string): string {
  const head = desc.trim().split(/\s+(?:with|that|which|for|made|in|on|and)\s+|[,.;:]/i)[0].replace(/^(?:a|an|the|some|two|pair of)\s+/i, '');
  const w = head.split(/\s+/).filter(Boolean).slice(-4).join(' ');
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '';
}

export type Health = 'clean' | 'look' | 'stale' | 'demo';
export function healthOf(m: Manifest, it: Item): Health {
  if (it.baseHash !== m.rig.baseHash) return 'stale';
  if (it.designWarnings?.length) return 'look';
  if (!it.qa) return 'demo';
  return it.qa.status === 'pass' ? 'clean' : 'look';
}
export const HEALTH_LABEL: Record<Health, string> = { clean: 'Clean', look: 'Needs a look', stale: 'Made for another body', demo: 'Demo' };

/** QA gate messages in plain words (D1 §5.5). */
export function plainReason(s: string): string {
  if (s.startsWith('D2 ')) return 'The requested waist band differs between standing views';
  if (s.startsWith('G13 ')) return 'The waist band differs from the standing design; inspect the clothing';
  if (s.startsWith('G14 ')) return 'Some frames resemble the opposite view; inspect the torso';
  if (s.startsWith('G11 ')) return 'Some lower clothing is missing compared with the standing design';
  if (s.startsWith('G12 ')) return 'Footwear differs from the standing design; inspect the feet';
  if (s.startsWith('G2') || s.startsWith('G3')) return 'Some body pixels were changed by the model';
  if (s.startsWith('G4')) return 'The item is missing in some frames';
  if (s.startsWith('G5')) return 'The item changes size between frames';
  if (s.startsWith('G6')) return 'Colors drift between directions';
  if (s.startsWith('G7')) return 'The item touches the frame edge (may be cut off)';
  if (s.startsWith('G8')) {
    const clip = /^G8 ([^ :]+\/[^ :]+):/.exec(s)?.[1];
    const where = clip ? ` (${clip.replaceAll('/', ', ').replaceAll('-', ' ')})` : '';
    if (s.includes('hand positions are missing')) return `Hand positions are unavailable; set up the pose rig and check this view${where}`;
    if (s.includes('handedness not checked')) return `Handedness could not be confirmed; inspect the intended hand${where}`;
    if (s.includes('grip side is unclear')) return `The grip side is unclear; check the intended hand${where}`;
    if (s.includes('from both hands') || s.includes('grip contact not confirmed')) return `The grip could not be confirmed; inspect the item at the hand${where}`;
    if (s.includes('other clips') || s === 'G8') return `The item may change hands between views; check the intended hand${where}`;
    return `The item may be held in the wrong hand; check the intended hand${where}`;
  }
  if (s.startsWith('G1')) return 'PixelLab returned an unexpected image';
  if (s.startsWith('H4')) return 'Some frames do not look like the design (e.g. a cape wrapped around an arm)';
  if (s.startsWith('D1')) return 'The design has gray smudges';
  const pasted = /^R1 ([^/]+)\/([^:]+): dressed item pasted on (\d+)/.exec(s);
  if (pasted) return `Held item pasted on ${pasted[3]} ${pasted[1].replaceAll('-', ' ')} ${pasted[3] === '1' ? 'frame' : 'frames'} (${pasted[2].replaceAll('-', ' ')}); check that it moves`;
  const noGrid = /^([^/]+)\/([^:]+): no inpaint-v3 repair grid \((.+)\); kept the best pose roll/.exec(s);
  if (noGrid) return `No repair grid for ${noGrid[1].replaceAll('-', ' ')} (${noGrid[2].replaceAll('-', ' ')}): ${noGrid[3]}; the best try was kept`;
  return s;
}

export const fmtGens = (n: number) => `${Math.round(n * 10) / 10} gens`;
export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtTime = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(5, Math.round(s / 5) * 5)} s`);

/** First entry per key, order kept (drafts by spec.id: a list persisted twice heals on read). */
export const uniqueBy = <T>(xs: T[], key: (x: T) => string): T[] => { const seen = new Set<string>(); return xs.filter((x) => !seen.has(key(x)) && !!seen.add(key(x))); };

export function selfTest() {
  const ids = uniqueBy([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'b' }, { id: 'c' }], (x) => x.id).map((x) => x.id).join();
  console.assert(ids === 'a,b,c', `uniqueBy keeps one entry per id (${ids})`);
  const s = makeImg(48, 48);
  s.data.set([9, 9, 9, 255], 0);
  console.assert(nameFrom('a stocky dwarf, tan skin') === 'Dwarf' && nameFrom('a sturdy young dwarf with a friendly face') === 'Dwarf' && nameFrom('') === 'My character', 'nameFrom');
  console.assert(itemNameFrom('a straw farmer hat') === 'Straw farmer hat' && itemNameFrom('Iron Knight Helmet with a red plume') === 'Iron knight helmet' && itemNameFrom('') === '', `itemNameFrom ${itemNameFrom('a straw farmer hat')}`);
  console.assert(['a wooden longbow', 'short bow', 'Round Shield', 'elven bow with gold', 'a yew warbow'].every((x) => heldSlotFor(x) === 'off_hand')
    && ['steel sword', 'a crossbow', 'elbow pads', 'rainbow staff'].every((x) => heldSlotFor(x) === 'main_hand'), 'heldSlotFor');
  console.assert(groupOf('off_hand').id === 'Hands' && groupOf('waist').id === 'Legs', 'groupOf');
  // T2: character menu marker; records from before `origin` are migrated by shape (v1.3 create / demo copy = Studio)
  const rec = (x: Partial<StoredProject>) => x as StoredProject;
  console.assert(originOf(rec({ origin: 'dev', character: { id: 'c', looks: '' } })) === 'dev' && originOf(rec({ character: { id: 'c', looks: '' } })) === 'studio'
    && originOf(rec({ rigQa: { pivotFrom: '' } })) === 'studio' && originOf(rec({ rigQa: { pivotFrom: 'idle/south/0' } })) === 'dev', 'originOf');
  console.assert(crop(s)!.w === 1 && crop(makeImg(2, 2)) === null, 'crop');
  console.assert(plainReason('G4 walk/south: item missing').includes('missing'), 'plainReason');
}
