// Studio model helpers (pure, node-runnable): user-facing slot groups (D1 §4.1), item thumbnails, base prompts, wording for
// QA and costs. Frame placement lives in lib/rig/normalize.ts (one rule for M2/M3/Studio).
import { makeImg, type Img } from '../lib/image/png.ts';
import { cellImg, layerFrame, over, unionFrame } from '../lib/compose/compose.ts';
import type { DirectionName, Item, Manifest, Project } from '../lib/store/manifest.ts';

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

/** Base prompt (S2 winner): the user's words + a plain clothed mannequin so items have a clean body to sit on. */
export const basePrompt = (desc: string) =>
  `${desc.trim().replace(/[.\s]+$/, '')}, plain bald paperdoll base body, wearing a plain grey t-shirt and plain grey shorts, barefoot, no hair, no accessories, neutral standing pose with arms slightly away from the torso`;
/** What the base LOOKS like (raw skeleton-v3 `description`, S3): no pose words, empty hands. */
export const looksOf = (desc: string) =>
  `${desc.trim().replace(/[.\s]+$/, '')}, bald, wearing a plain grey t-shirt and plain grey shorts, barefoot, empty hands, no weapon`;

export const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
/** The noun of the description's first phrase: "a sturdy young dwarf with a friendly face" -> "Dwarf". */
// ponytail: last word before with/who/in/wearing/comma; a rename field is the real fix.
export function nameFrom(desc: string): string {
  const head = desc.trim().split(/\s+(?:with|who|in|wearing|from|and)\s+|[,.;]/i)[0];
  const w = head.split(/\s+/).filter(Boolean).at(-1) ?? '';
  return w ? w[0].toUpperCase() + w.slice(1) : 'My character';
}

export type Health = 'clean' | 'look' | 'stale' | 'demo';
export function healthOf(m: Manifest, it: Item): Health {
  if (it.baseHash !== m.rig.baseHash) return 'stale';
  if (!it.qa) return 'demo';
  return it.qa.status === 'pass' ? 'clean' : 'look';
}
export const HEALTH_LABEL: Record<Health, string> = { clean: 'Clean', look: 'Needs a look', stale: 'Made for another body', demo: 'Demo' };

/** QA gate messages in plain words (D1 §5.5). */
export function plainReason(s: string): string {
  if (s.startsWith('G2') || s.startsWith('G3')) return 'Some body pixels were changed by the model';
  if (s.startsWith('G4')) return 'The item is missing in some frames';
  if (s.startsWith('G5')) return 'The item changes size between frames';
  if (s.startsWith('G6')) return 'Colours drift between directions';
  if (s.startsWith('G7')) return 'The item touches the frame edge (may be cut off)';
  if (s.startsWith('G8')) return 'The item switches hands';
  if (s.startsWith('G1')) return 'PixelLab returned an unexpected image';
  if (s.startsWith('H4')) return 'The item does not match its design in some frames';
  return s;
}

export const fmtGens = (n: number) => `${Math.round(n * 10) / 10} gens`;
export const fmtNum = (n: number) => Math.round(n).toLocaleString('en-US');
export const fmtTime = (s: number) => (s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(5, Math.round(s / 5) * 5)} s`);

export function selfTest() {
  const s = makeImg(48, 48);
  s.data.set([9, 9, 9, 255], 0);
  console.assert(nameFrom('a stocky dwarf, tan skin') === 'Dwarf' && nameFrom('a sturdy young dwarf with a friendly face') === 'Dwarf' && nameFrom('') === 'My character', 'nameFrom');
  console.assert(groupOf('off_hand').id === 'Hands' && groupOf('waist').id === 'Legs', 'groupOf');
  console.assert(crop(s)!.w === 1 && crop(makeImg(2, 2)) === null, 'crop');
  console.assert(plainReason('G4 walk/south: item missing').includes('missing'), 'plainReason');
}
