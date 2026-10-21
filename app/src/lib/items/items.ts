// Item lab core (architecture §3.1–3.4, §4): slot ladder, call packing, prompts, per-cell extraction, gates G1–G8, fg/bg split,
// manifest Item. Pure over Img; the UI (ui/M3.svelte) only runs calls through the queue and persists.
import { chromaLayer, chromaPrompt, components, fillHoles, keyKept, keyOutside, toChroma, type Key } from '../image/chroma.ts';
import { diffLayer, type Rect } from '../image/diff.ts';
import { makeImg, type Img } from '../image/png.ts';
import { over } from '../compose/compose.ts';
import { splitFgBg } from '../compose/split.ts';
import { cellHash, cellKey, type DirectionName, type Keypoint, type Rig, type Sha256 } from '../rig/rig.ts';
import type { Skeleton } from '../rig/skeleton.ts';
import { hasAll } from '../rig/poses.ts';
import { actionOf, rawClip } from '../rig/clips.ts';
import type { CellKey, CellQa, Item, ItemQa, Layer, Provenance, Slot } from '../store/manifest.ts';
import { editFrameCap, png, routes, type Req } from '../pixellab/routes.ts';

/**
 * Item routes (S4 §Q4), swappable without touching extraction, QA or the UI:
 * - `skel` (default on v1.3 rigs): ONE edit-animation-v2 call dresses the chroma REST VIEWS (S/E/N), then each clip ×
 *   direction poses its dressed keyframe via raw animate-with-skeleton-v3 with EXACTLY the stored keypoint sequence the base
 *   clip was rendered from (rig.animations[].sources[dir].keypoints, first frame keypoints = rig.rest[dir].keypoints): same
 *   request shape as the base, so the layers align (S3). No estimated fallback: rigs without stored sources use `anchor`.
 * - `anchor` (S2): edit-animation-v2 on ≤16 packed chroma cells per call, later calls carry one dressed anchor cell.
 */
export type Method = 'skel' | 'anchor';
export type CallKind = 'edit' | 'dress' | 'pose' | 'grid'; // grid: B14 per clip-direction fallback (inpaint-v3)
export const itemRoute = {
  name: 'skeleton-posed keyframe / edit-animation-v2',
  edit: (framesPngB64: string[], description: string, seed: number, cell: { w: number; h: number }): Req => {
    const size = { width: cell.w, height: cell.h };
    return routes.editAnimationV2({ description, frames: framesPngB64.map((b) => ({ image: png(b), size })), image_size: size, no_background: true, seed });
  },
  /**
   * Pose a dressed chroma keyframe (in pose `rest`) through a stored keypoint sequence (rig-cell API coords; `pad` moves them
   * onto the oversize canvas). Held items send frame 0 LAST when it is the rest pose (S5); undo with `unrotate`.
   */
  pose: (o: { keyframePngB64: string; rest: Keypoint[]; poses: Keypoint[][]; item: string; slot: string; key: Key; anim: string; dir: DirectionName; seed: number; cell: { w: number; h: number }; pad?: number }): Req => {
    const held = slotOf(o.slot).class === 'held', p = o.pad ?? 0, k = (s: Keypoint[]) => padKeypoints(s, o.cell, p);
    const poses = f0Last(o.slot, o.rest, o.poses, o.cell) ? [...o.poses.slice(1), o.poses[0]] : o.poses;
    return rawClip({
      // B7 live: "slash" drew a blade into a helmet layer although the action said "no weapon" -> say it in the looks too
      description: `solid ${o.key === 'green' ? 'bright green' : 'magenta'} mannequin (chroma key colour) ${held ? `holding ${o.item} in the ${handOf(o.slot)} hand; ${oneHeld(o.slot)}` : `wearing ${o.item}, empty hands, no weapon`}`,
      // M3: a "slash" pose made the model draw a sword into a helmet layer -> unarmed unless the item is the held object
      action: actionOf(o.anim) + (held ? '' : ', empty hands, no weapon, no effects'),
      dir: o.dir, first: o.keyframePngB64, rest: k(o.rest), keypoints: poses.map(k), seed: o.seed,
    });
  },
};

// ---------- B14 fallback: one clip-direction as a Pro inpaint-v3 packed masked grid (S4 inv3, S5 H3) ----------
export const GRID_COLS = 4;
/** Pack cells into one grid (row-major, `cols` wide) plus its mask: white = generate (the cell's mask px), black = keep. */
export function packGrid(cells: Img[], masks: (Uint8Array | null)[], cols = GRID_COLS): { image: Img; mask: Img } {
  const { w, h } = cells[0], rows = Math.ceil(cells.length / cols), image = makeImg(cols * w, rows * h), mask = makeImg(cols * w, rows * h);
  for (let i = 0; i < mask.data.length; i += 4) mask.data.set([0, 0, 0, 255], i);
  cells.forEach((c, k) => {
    const ox = (k % cols) * w, oy = ((k / cols) | 0) * h, m = masks[k];
    over(image, c, ox, oy);
    if (m) for (let p = 0; p < m.length; p++) if (m[p]) mask.data.set([255, 255, 255, 255], ((oy + ((p / w) | 0)) * mask.w + ox + (p % w)) * 4);
  });
  return { image, mask };
}
/** The first `n` cells of a grid made by packGrid. */
export function cutGrid(g: Img, n: number, w: number, h: number, cols = GRID_COLS): Img[] {
  return Array.from({ length: n }, (_, k) => {
    const o = makeImg(w, h), ox = (k % cols) * w, oy = ((k / cols) | 0) * h;
    for (let y = 0; y < h; y++) o.data.set(g.data.subarray(((oy + y) * g.w + ox) * 4, ((oy + y) * g.w + ox + w) * 4), y * w * 4);
    return o;
  });
}
/** Mask of a slot band (full width) for one cell. */
export const bandMask = (r: Rect, w: number, h: number) => { const m = new Uint8Array(w * h); for (let y = Math.max(0, r.y); y < Math.min(h, r.y + r.h); y++) m.fill(1, y * w, y * w + w); return m; };
/** S5 H3 wording: what the grid is, which cells are the reference design, one design everywhere; back items hang behind the arms. */
export function gridPrompt(o: { item: string; slot: string; key: Key; anim: string; dir: DirectionName; n: number; refs: DirectionName[]; cell: { w: number; h: number } }): string {
  const cols = GRID_COLS, rows = Math.ceil((o.n + o.refs.length) / cols), colour = o.key === 'green' ? 'bright green' : 'magenta';
  const hint = o.slot === 'back' ? '; it hangs from the shoulders down the back and never wraps around or follows the arms' : '';
  return `This image is a sprite sheet: a ${cols}x${rows} grid of ${o.cell.w}x${o.cell.h} px frames of the same pixel art character, a solid ${colour} mannequin. ` +
    `The first ${o.n} frames (left to right, top to bottom) are a ${o.n}-frame ${actionOf(o.anim)} animation ${facing(o.dir)}. ` +
    `The next ${o.refs.length} frames show the reference design (${o.refs.map((d) => facing(d)).join(', ')}): ${o.item}. ` +
    `The ${colour} colour is intentional (a chroma key) and must stay exactly the same ${colour}. ` +
    `Draw the identical ${o.item} on every animation frame, following each frame's pose${hint}; empty hands, no weapon, no effects. ` +
    `Keep every other pixel, the poses, the outlines, the grid layout and the transparent background unchanged.`;
}

// ---------- S5 held route: oversize canvas, held wording, frame 0 last ----------
/** S5: held items are generated on a 96 px canvas around the same pivot (64 + 2 × 16): no blade px on the border, no flips. */
export const HELD_PAD = 16;
/** Oversize padding of an item's layers (skeleton-pose held items only; the anchor route stays on the rig cell). */
export const padOf = (slot: string, method?: Method) => (method === 'skel' && slotOf(slot).class === 'held' ? HELD_PAD : 0);
/** Grow a cell by `p` transparent px on every side (same pivot, never resampled). */
export function padImg(im: Img, p: number): Img {
  if (!p) return im;
  const o = makeImg(im.w + 2 * p, im.h + 2 * p);
  over(o, im, p, p);
  return o;
}
/** API keypoints (0–1 of the rig cell) -> the same body points on the padded canvas. */
export const padKeypoints = (k: Keypoint[], cell: { w: number; h: number }, p: number): Keypoint[] =>
  p ? k.map((q) => ({ ...q, x: +((q.x * cell.w + p) / (cell.w + 2 * p)).toFixed(4), y: +((q.y * cell.h + p) / (cell.h + 2 * p)).toFixed(4) })) : k;
const handOf = (slot: string) => (slot === 'off_hand' ? 'left' : 'right');
const oneHeld = (slot: string) => (slot === 'off_hand' ? 'exactly one held item, nothing in the right hand' : 'exactly one weapon, no other weapons, no scabbard, no shield');
/** S5 dress wording: continue the forearm ("upright" bent the arm and broke posing), one object only. */
export const heldPhrase = (item: string, slot: string) => `${item}, held in the character's ${handOf(slot)} hand, pointing down and slightly outward; ${oneHeld(slot)}; the arms stay exactly as they are`;
/** Mean joint distance (px) between two keypoint sets. */
export const poseDist = (a: Keypoint[], b: Keypoint[], cell: { w: number; h: number }) => {
  const d = a.map((p) => b.find((q) => q.label === p.label)).map((q, i) => (q ? Math.hypot((q.x - a[i].x) * cell.w, (q.y - a[i].y) * cell.h) : 0));
  return d.reduce((s, v) => s + v, 0) / (d.length || 1);
};
/** S5: skeleton-v3 drops a held item on the FIRST output frame when that pose is ~the rest pose -> send frame 0 last. */
export const f0Last = (slot: string, rest: Keypoint[], poses: Keypoint[][], cell: { w: number; h: number }) => slotOf(slot).class === 'held' && poses.length > 1 && poseDist(rest, poses[0], cell) <= 1;
/** Outputs of a pose call back in keypoint order. */
export const unrotate = <T>(outs: T[], rotated: boolean) => (rotated ? [outs.at(-1)!, ...outs.slice(0, -1)] : outs);
/** Pseudo cell key of a direction's rest view (the dress call's input and its keyframe output). */
export const restKey = (dir: DirectionName) => cellKey('rest', dir, 0);
/** The stored keypoint sequence of a clip-direction (v1.3), or undefined. */
export const clipKeypoints = (rig: Rig, anim: string, dir: DirectionName) => {
  const a = rig.animations.find((x) => x.id === anim), k = a?.sources?.[dir]?.keypoints;
  return k && k.length === a!.cells && k.every(hasAll) ? k : undefined;
};
/** Can the skel route run? Needs the v1.3 rest views and the stored keypoint sequence of every chosen clip-direction. */
export const canPose = (rig: Rig, spec: Pick<ItemSpec, 'anims' | 'dirs'>) =>
  spec.dirs.every((d) => hasAll(rig.rest?.[d]?.keypoints) && spec.anims.every((a) => !!clipKeypoints(rig, a, d)));

/** M4/T3: a held item's bg (blade outside the body) sits above the cape's bg (z 4) in S/E/W, else the cape hides the hilt and
 * blade (T3 Ranger: 220 sword px hidden over walk S); from behind (north) the cape stays over it (bg z as built). */
const heldBgOverCape = (): Slot['zOverrides'] => (['south', 'south-east', 'east', 'west', 'south-west'] as const).map((dir) => ({ layer: 'bg', z: 5, dir })); // B15: + the front 3/4 views of 8-dir rigs
/** Default slot ladder (architecture §4). Array order = tie-break for equal z. */
export const SLOTS: Slot[] = [
  { id: 'body', z: 10, class: 'base', required: true },
  { id: 'feet', z: 20, class: 'worn', anchor: 'foot_r' },
  { id: 'legs', z: 30, class: 'worn', anchor: 'hip' },
  { id: 'torso_inner', z: 40, class: 'worn', anchor: 'neck' },
  { id: 'waist', z: 50, class: 'worn', anchor: 'hip' },
  { id: 'torso_outer', z: 60, class: 'worn', anchor: 'neck' },
  { id: 'shoulders', z: 65, class: 'worn', anchor: 'neck' },
  { id: 'arms', z: 70, class: 'worn', anchor: 'hand_r' },
  { id: 'neck', z: 80, class: 'rigid', anchor: 'neck' },
  { id: 'back', z: 90, bgZ: 4, class: 'worn', anchor: 'neck' },
  { id: 'facial_hair', z: 100, class: 'rigid', anchor: 'head' },
  { id: 'hair', z: 110, bgZ: 3, class: 'rigid', anchor: 'head', zOverrides: [{ layer: 'bg', z: 5 }] }, // T3: long hair lies over the cape (bg 4) in every view: 359 hair px hidden over walk E
  { id: 'face_acc', z: 120, class: 'rigid', anchor: 'head', band: true },
  // B14: hair is tucked under a helmet (only what hangs below the brim shows) instead of hidden (T3: hides erased long hair);
  // a hood or full mask ticks "hide hair" (item.hides)
  { id: 'head', z: 130, class: 'rigid', anchor: 'head', clips: ['hair'], band: true },
  { id: 'off_hand', z: 140, bgZ: 2, class: 'held', anchor: 'hand_l', zOverrides: heldBgOverCape() },
  { id: 'main_hand', z: 150, bgZ: 1, class: 'held', anchor: 'hand_r', zOverrides: heldBgOverCape() },
];
export const slotOf = (id: string) => SLOTS.find((s) => s.id === id)!;

export type Route = Key | 'none'; // 'none' = diff fallback on the real base
export interface ItemSpec { id: string; name: string; slot: string; prompt: string; key: Route; anims: string[]; dirs: DirectionName[]; method?: Method }

/** Calls of an item. skel: [dress the rest cells (chunked to the frame cap), pose clip × dir ...]; anchor: packed edit calls (planCalls). */
export function planItem(rig: Rig, spec: Pick<ItemSpec, 'anims' | 'dirs' | 'method' | 'key'> & { slot?: string }): { kind: CallKind; cells: string[] }[] {
  if (spec.method !== 'skel' || spec.key === 'none') return planCalls(rig, spec).map((cells) => ({ kind: 'edit', cells }));
  // B16: a 96 px held dress takes ≤ 4 frames, an 8-direction rig has 5 rest views -> later chunks carry chunk 1's dressed cell 0
  const cap = editFrameCap(Math.max(rig.cell.w, rig.cell.h) + 2 * (spec.slot ? padOf(spec.slot, spec.method) : 0));
  return [
    ...anchorChunks(spec.dirs.map(restKey), cap).map((cells) => ({ kind: 'dress' as const, cells })),
    ...spec.anims.flatMap((a) => spec.dirs.map((d) => ({ kind: 'pose' as const, cells: Array.from({ length: rig.animations.find((x) => x.id === a)!.cells }, (_, i) => cellKey(a, d, i)) }))),
  ];
}
/** Split cells for a capped multi-frame call: the first call takes `cap`, later ones `cap − 1` plus the anchor cell (S2). */
export const anchorChunks = <T>(cells: T[], cap: number): T[][] => [cells.slice(0, cap), ...Array.from({ length: Math.ceil(Math.max(0, cells.length - cap) / (cap - 1)) }, (_, i) => cells.slice(cap + i * (cap - 1), cap + (i + 1) * (cap - 1)))];
/** Does call k lead with the anchor cell (edit-animation-v2 after the first call)? Its first output is then dropped. */
export const anchored = (k: number, kind: CallKind = 'edit') => k > 0 && (kind === 'edit' || kind === 'dress');
export const planGens = (p: { kind: CallKind; cells: string[] }[]) => p.reduce((s, c) => s + (c.kind === 'pose' ? (c.cells.length <= 3 ? 2 : c.cells.length <= 8 ? 3 : 4) : 10), 0);

/** Clips (anim × generated dir) packed whole into calls: design call ≤ cap cells, later calls ≤ cap − 1 + 1 anchor cell. */
export function planCalls(rig: Rig, spec: Pick<ItemSpec, 'anims' | 'dirs'>): string[][] {
  const clips = spec.anims.flatMap((a) => spec.dirs.map((d) => ({ a, d, n: rig.animations.find((x) => x.id === a)?.cells ?? 0 }))).filter((c) => c.n);
  clips.sort((x, y) => y.n - x.n); // stable: walk S, E, N before idle
  const bins: { cap: number; clips: typeof clips }[] = [], max = editFrameCap(Math.max(rig.cell.w, rig.cell.h));
  for (const c of clips) {
    if (c.n > max - 1) throw new Error(`${c.a}/${c.d}: ${c.n} cells do not fit one call`);
    const bin = bins.find((b) => b.cap - b.clips.reduce((s, x) => s + x.n, 0) >= c.n) ?? (bins.push({ cap: bins.length ? max - 1 : max, clips: [] }), bins.at(-1)!);
    bin.clips.push(c);
  }
  return bins.map((b) => b.clips.flatMap((c) => Array.from({ length: c.n }, (_, i) => cellKey(c.a, c.d, i))));
}

const facing = (d: string) => `facing ${d}${d === 'south' ? ' (front view)' : d === 'north' ? ' (back view)' : d.includes('-') ? ` (${d.startsWith('south') ? 'front' : 'back'} three-quarter view)` : ' (side view)'}`;
/** "Cells in order: 8 cells walk facing south (front view), …" */
export function cellsNote(cells: string[], anchor?: string): string {
  const groups: [string, number][] = [];
  for (const k of cells) {
    const [a, d] = k.split('/'), g = `${a} ${facing(d)}`;
    if (groups.at(-1)?.[0] === g) groups.at(-1)![1]++;
    else groups.push([g, 1]);
  }
  const ref = anchor ? `frame 1 = reference (${anchor.split('/')[0]} ${facing(anchor.split('/')[1])}), then ` : '';
  return `Cells in order: ${ref}${groups.map(([g, n]) => `${n} cells ${g}`).join(', ')}. `;
}

export function itemPrompt(item: string, route: Route, cells: string[], anchor?: string): string {
  if (route !== 'none') return chromaPrompt(item, route, cellsNote(cells, anchor), !!anchor);
  return (
    `Add only ${item} to this pixel art character, drawn in its own colours, identical design in all frames. ` +
    (anchor ? `Frame 1 already wears ${item}: copy exactly that design, colours and size onto the other frames. ` : '') +
    `${cellsNote(cells, anchor)}Keep every other pixel, the pose, the outline and the transparent background exactly unchanged.`
  );
}

/** Model input for one base cell. */
export const inputCell = (B: Img, route: Route) => (route === 'none' ? B : toChroma(B, route));

/** Keypoint y-band of a slot (S2 algorithm spec §4.2); used to clip the diff fallback and to report out-of-band px. */
export function bandOf(slot: string, s: Skeleton | undefined, h: number): Rect {
  const all = { x: 0, y: 0, w: 1e3, h };
  const y = (l: string) => s?.[l]?.y;
  const ys = (...l: string[]) => l.map(y).filter((v): v is number => v != null);
  const neck = y('NECK'), hips = ys('LEFT HIP', 'RIGHT HIP'), knees = ys('LEFT KNEE', 'RIGHT KNEE'), sh = ys('LEFT SHOULDER', 'RIGHT SHOULDER');
  const from = (y0: number) => ({ ...all, y: Math.max(0, Math.floor(y0)), h: h - Math.max(0, Math.floor(y0)) });
  const to = (y1: number) => ({ ...all, h: Math.ceil(y1) });
  if (!s) return all;
  if (['head', 'face_acc', 'facial_hair'].includes(slot) && neck != null) return to(neck + 3);
  if (slot === 'hair' && sh.length) return to(Math.max(...sh) + 8);
  if (['torso_inner', 'torso_outer', 'shoulders', 'waist'].includes(slot) && neck != null && hips.length) return { ...all, y: Math.floor(neck - 3), h: Math.ceil(Math.max(...hips) + 6 - (neck - 3)) };
  if (slot === 'legs' && hips.length) return from(Math.min(...hips) - 4);
  if (slot === 'feet' && knees.length) return from(Math.min(...knees) - 3);
  if (slot === 'back' && neck != null) return from(neck - 4);
  return all;
}

// ---------- per cell ----------
export interface CellOut {
  key: string;
  call: number;
  base: Img; // real frozen base cell
  input: Img; // what PixelLab got (key mannequin, or the base for 'none')
  out: Img; // PixelLab composite
  layer: Img;
  mask: Uint8Array;
  area: number;
  keyKept?: number;
  keyLost?: number; // body px no longer key (G2 counts them too: a nearly covered body has few px left)
  erased?: number;
  keyOutside?: number;
  outBand: number; // layer px outside the slot band (info)
  baseBand: number; // base opaque px inside the slot band (how much the covered body region itself changes per frame)
  specks: number; // components <= 2 px
  pinholes: number; // enclosed empty regions <= 2 px
  shifted: boolean; // still misregistered after re-registration (S4: shifted frames must be 0)
  offset: [number, number]; // posed cells: 1-px re-registration applied to the PixelLab output (skeleton-v3 is not exact)
  stray: number; // px removed by the largest-component filter
  posed: boolean;
  repaired?: boolean; // held: dressed keyframe pasted (S5 frame-0 repair)
}

const sum = (m: Uint8Array) => m.reduce((a, b) => a + b, 0);
function cleanliness(mask: Uint8Array, w: number, h: number) {
  const specks = components(mask, w, h).filter((c) => c.length <= 2).length;
  const filled = fillHoles(mask, { w, h, data: new Uint8ClampedArray(w * h * 4).fill(255) }, 2);
  return { specks, pinholes: sum(filled) - sum(mask) };
}

/** Keep components >= max(4 px, 15 % of the largest): skeleton-v3 adds detached motion-smear specks (S3). */
function majorComponents(r: { layer: Img; mask: Uint8Array }, w: number, h: number) {
  const comps = components(r.mask, w, h), big = Math.max(0, ...comps.map((c) => c.length));
  let stray = 0;
  for (const c of comps) if (c.length < Math.max(4, 0.15 * big)) for (const p of c) { r.mask[p] = 0; r.layer.data.fill(0, p * 4, p * 4 + 4); stray++; }
  return { ...r, stray };
}
// ---------- clip post-processing (B9): streak trim, held attachment, frame-0 repair ----------
const setMask = (c: CellOut, keep: Uint8Array) => {
  let removed = 0;
  for (let p = 0; p < c.mask.length; p++) if (c.mask[p] && !keep[p]) { c.mask[p] = 0; c.layer.data.fill(0, p * 4, p * 4 + 4); removed++; }
  c.area -= removed;
  c.stray += removed;
  return removed;
};
const dilate = (m: Uint8Array, w: number, r: number) => {
  const h = m.length / w, o = new Uint8Array(m.length);
  for (let p = 0; p < m.length; p++) {
    if (!m[p]) continue;
    const x = p % w, y = (p / w) | 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; }
  }
  return o;
};
const shiftMask = (m: Uint8Array, w: number, dx: number, dy: number) => {
  const h = m.length / w, o = new Uint8Array(m.length);
  for (let p = 0; p < m.length; p++) if (m[p]) { const X = (p % w) + dx, Y = ((p / w) | 0) + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1; }
  return o;
};
/** Mean px position of keypoint labels on a (padded) canvas. */
const kpAt = (k: Keypoint[] | undefined, labels: string[], cell: { w: number; h: number }, pad: number): [number, number] | undefined => {
  const ps = labels.map((l) => k?.find((q) => q.label === l)).filter((q): q is Keypoint => !!q);
  return ps.length ? [ps.reduce((s, q) => s + q.x * cell.w, 0) / ps.length + pad, ps.reduce((s, q) => s + q.y * cell.h, 0) / ps.length + pad] : undefined;
};
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
/** Requested keypoints of a posed cell (the clip's stored sequence) and of its direction's rest view. */
const posedKps = (rig: Rig, key: string) => {
  const [a, d, i] = key.split('/') as [string, DirectionName, string];
  return { pose: clipKeypoints(rig, a, d)?.[+i], rest: rig.rest?.[d]?.keypoints, poses: clipKeypoints(rig, a, d) };
};
export const TRIM = { support: 2, minOverlap: 0.5 };

/**
 * Rigid head-class items (slot.band): the dressed keyframe is the design. Per frame the keyframe mask is aligned (the requested
 * head move, refined ±2 px by overlap) and dilated by 2 px; item px outside that support are streaks/props the pose invented
 * (B7: helmet slash streaks) UNLESS temporal consensus keeps them: the same keyframe-relative px is item in at least half of the
 * other frames of that direction (a real part the keyframe lacks). Frames whose aligned overlap is < 50 % of the keyframe
 * (occluded, lying) are left alone. Returns px removed.
 */
export function trimToKeyframe(rig: Rig, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>, pad = 0): number {
  let removed = 0;
  const byDir = new Map<DirectionName, CellOut[]>();
  for (const c of cells) if (c.posed && c.area) { const d = c.key.split('/')[1] as DirectionName; (byDir.get(d) ?? (byDir.set(d, []), byDir.get(d)!)).push(c); }
  for (const [dir, cs] of byDir) {
    const K = keys[dir] && despeck(keys[dir]!);
    if (!K) continue;
    const w = K.w, km = maskOf(K), kn = sum(km);
    if (!kn) continue;
    // alignment of each frame: keyframe px (x, y) sits at (x + s[0], y + s[1]) in the frame
    const al = cs.map((c) => {
      const { pose, rest } = posedKps(rig, c.key), h0 = kpAt(rest, HEAD, rig.cell, pad), h1 = kpAt(pose, HEAD, rig.cell, pad);
      const g = h0 && h1 ? [Math.round(h1[0] - h0[0]), Math.round(h1[1] - h0[1])] : [0, 0];
      let best = { s: [0, 0] as [number, number], ov: -1 };
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const s: [number, number] = [g[0] + dx, g[1] + dy], m = shiftMask(km, w, s[0], s[1]);
          let ov = 0;
          for (let p = 0; p < m.length; p++) if (m[p] && c.mask[p]) ov++;
          if (ov > best.ov || (ov === best.ov && Math.abs(dx) + Math.abs(dy) < Math.abs(best.s[0] - g[0]) + Math.abs(best.s[1] - g[1]))) best = { s, ov };
        }
      return best;
    });
    // consensus in keyframe coords: frames (3x3 tolerant) that have item px there
    const back = cs.map((c, i) => dilate(shiftMask(c.mask, w, -al[i].s[0], -al[i].s[1]), w, 1));
    for (const [i, c] of cs.entries()) {
      if (al[i].ov < TRIM.minOverlap * kn) continue;
      const support = dilate(shiftMask(km, w, al[i].s[0], al[i].s[1]), w, TRIM.support), keep = new Uint8Array(c.mask.length), need = Math.ceil((cs.length - 1) / 2);
      for (let p = 0; p < keep.length; p++) {
        if (!c.mask[p]) continue;
        if (support[p]) { keep[p] = 1; continue; }
        const X = (p % w) - al[i].s[0], Y = ((p / w) | 0) - al[i].s[1], q = Y * w + X;
        let n = 0;
        if (X >= 0 && Y >= 0 && X < w && q < keep.length) for (const [j, b] of back.entries()) if (j !== i && b[q]) n++;
        if (need && n >= need) keep[p] = 1;
      }
      removed += setMask(c, keep);
    }
  }
  return removed;
}

/**
 * Held items: keep the largest component plus every component attached to it or to the gripping wrist (≤ 3 px: a blade split by
 * the fist or the forearm), drop the rest (detached smears). Returns px removed.
 */
export function attachHeld(rig: Rig, slot: Slot, cells: CellOut[], pad = 0): number {
  let removed = 0;
  const wristL = slot.id === 'off_hand' ? ['LEFT ARM'] : ['RIGHT ARM'];
  for (const c of cells) {
    if (!c.posed || !c.area) continue;
    const w = c.layer.w, comps = components(c.mask, w, c.mask.length / w).sort((a, b) => b.length - a.length);
    if (comps.length < 2) continue;
    const wr = kpAt(posedKps(rig, c.key).pose, wristL, rig.cell, pad), big = new Uint8Array(c.mask.length);
    for (const p of comps[0]) big[p] = 1;
    const near = dilate(big, w, 3);
    const keep = new Uint8Array(c.mask.length);
    for (const [i, comp] of comps.entries()) {
      const ok = !i || comp.some((p) => near[p] || (wr && Math.hypot((p % w) + 0.5 - wr[0], ((p / w) | 0) + 0.5 - wr[1]) <= 3));
      if (ok) for (const p of comp) keep[p] = 1;
    }
    removed += setMask(c, keep);
  }
  return removed;
}

/**
 * S5 free fallback: a held item lost on a near-rest frame (area < 50 % of the clip median, pose ≤ 1 px from the rest pose) gets
 * the dressed keyframe layer pasted, shifted by the requested wrist move. Returns the repaired cell keys.
 */
export function repairDropped(rig: Rig, slot: Slot, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>, pad = 0): string[] {
  const fixed: string[] = [], wristL = slot.id === 'off_hand' ? ['LEFT ARM'] : ['RIGHT ARM'], byClip = new Map<string, CellOut[]>();
  for (const c of cells) if (c.posed) { const k = c.key.split('/').slice(0, 2).join('/'); (byClip.get(k) ?? (byClip.set(k, []), byClip.get(k)!)).push(c); }
  for (const cs of byClip.values()) {
    const med = median(cs.map((c) => c.area));
    for (const c of cs) {
      const { pose, rest } = posedKps(rig, c.key), K = keys[c.key.split('/')[1] as DirectionName];
      if (!K || !pose || !rest || c.area >= 0.5 * med || poseDist(rest, pose, rig.cell) > 1) continue;
      const a = kpAt(rest, wristL, rig.cell, pad)!, b = kpAt(pose, wristL, rig.cell, pad)!;
      c.layer = translate(K, Math.round(b[0] - a[0]), Math.round(b[1] - a[1]));
      c.mask = maskOf(c.layer);
      c.area = sum(c.mask);
      c.repaired = true;
      fixed.push(c.key);
    }
  }
  return fixed;
}

/** Clip-level cleanup after extraction (posed cells): streak trim for head items, attachment + repair for held items. */
export function postProcess(rig: Rig, slot: Slot, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>, pad = 0): { removed: number; repaired: string[] } {
  if (slot.class === 'held') { const removed = attachHeld(rig, slot, cells, pad); return { removed, repaired: repairDropped(rig, slot, cells, keys, pad) }; }
  return { removed: slot.band ? trimToKeyframe(rig, cells, keys, pad) : slot.class === 'worn' && slot.bgZ == null ? dropOffBody(cells) : 0, repaired: [] };
}

/**
 * Body-hugging worn items (torso, legs, feet, arms; not capes or hair, which swing away from the body): a detached component
 * with fewer than half its px on the body silhouette is a motion smear the pose drew (T3 live: chest armour slash E grey swoosh
 * and brown hand streaks, 13–30 px, 0 px on the body; real parts split off by a forearm lie 90–100 % on the body). Returns px removed.
 */
export function dropOffBody(cells: CellOut[]): number {
  let removed = 0;
  for (const c of cells) {
    if (!c.posed || !c.area) continue;
    const comps = components(c.mask, c.layer.w, c.mask.length / c.layer.w).sort((a, b) => b.length - a.length), keep = new Uint8Array(c.mask.length);
    for (const [i, comp] of comps.entries()) if (!i || comp.filter((p) => c.base.data[p * 4 + 3]).length * 2 >= comp.length) for (const p of comp) keep[p] = 1;
    removed += setMask(c, keep);
  }
  return removed;
}

/** Best 1-px shift (dx, dy) of C against B by silhouette IoU; [0, 0] unless a shift beats no shift by > 0.02. */
function bestShift(B: Img, C: Img): [number, number] {
  const { w, h } = B;
  const iou = (dx: number, dy: number) => {
    let i = 0, u = 0;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = C.data[(y * w + x) * 4 + 3] >= 128, X = x - dx, Y = y - dy, b = X >= 0 && Y >= 0 && X < w && Y < h && B.data[(Y * w + X) * 4 + 3] > 0;
        if (c && b) i++;
        if (c || b) u++;
      }
    return u ? i / u : 1;
  };
  let best: [number, number] = [0, 0], bi = iou(0, 0) + 0.02;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) { const v = iou(dx, dy); if (v > bi) { bi = v; best = [dx, dy]; } }
  return best;
}
/** Translate an image by (dx, dy) px (never resampled; px moved off the canvas are dropped). */
function translate(im: Img, dx: number, dy: number): Img {
  const o = makeImg(im.w, im.h);
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++) {
      const X = x + dx, Y = y + dy;
      if (X >= 0 && Y >= 0 && X < im.w && Y < im.h) o.data.set(im.data.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (Y * im.w + X) * 4);
    }
  return o;
}

export function extractCell(o: { key: string; call: number; base: Img; out: Img; route: Route; band: Rect; useCc?: boolean; posed?: boolean; clip?: boolean }): CellOut {
  const { base, route, band } = o, { w, h } = base;
  // posed frames are another skeleton-v3 sample of the same keypoints: re-register a systematic 1 px offset (M3: walk/south/7)
  const reg = o.posed ? bestShift(base, o.out) : ([0, 0] as [number, number]);
  const out = reg[0] || reg[1] ? translate(o.out, -reg[0], -reg[1]) : o.out;
  let r: { layer: Img; mask: Uint8Array; stray?: number } = route === 'none' ? diffLayer(base, out, band, o.useCc) : chromaLayer(out, route, base);
  if (o.posed && o.clip) { // head items live above the neck: px below the band are smears/props the pose invented (B7 live)
    for (let p = 0; p < r.mask.length; p++) if (r.mask[p] && ((p / w) | 0) >= band.y + band.h) { r.mask[p] = 0; r.layer.data.fill(0, p * 4, p * 4 + 4); r.stray = (r.stray ?? 0) + 1; }
  }
  if (o.posed) { const st = r.stray ?? 0; r = majorComponents(r, w, h); r.stray = (r.stray ?? 0) + st; }
  let outBand = 0, baseBand = 0;
  for (let p = 0; p < r.mask.length; p++) {
    const inBand = (p / w | 0) >= band.y && (p / w | 0) < band.y + band.h;
    if (r.mask[p] && !inBand) outBand++;
    if (base.data[p * 4 + 3] && inBand) baseBand++;
  }
  const tol = o.posed ? 1 : 0, kk = route === 'none' ? null : keyKept(base, out, route, r.mask, undefined, tol);
  return {
    key: o.key, call: o.call, base, input: inputCell(base, route), out, layer: r.layer, mask: r.mask, area: sum(r.mask), outBand, baseBand,
    ...(kk && route !== 'none' ? { keyKept: kk.kept, keyLost: kk.lost, erased: kk.erased, keyOutside: keyOutside(base, out, route, undefined, r.mask, tol) } : {}),
    ...cleanliness(r.mask, w, h), shifted: bestShift(base, out).some(Boolean), offset: [-reg[0], -reg[1]], stray: r.stray ?? 0, posed: !!o.posed,
  };
}

/** Layer drawn over the real base (what the game shows). */
export function recompose(c: Pick<CellOut, 'base' | 'layer'>): Img {
  const o = makeImg(c.base.w, c.base.h);
  over(o, c.base);
  over(o, c.layer);
  return o;
}

// ---------- QA (gates G1–G8, architecture §3.3) ----------
/** Action clips (slash, cast, punch...) legitimately change an item's area and shape; G5/G9 apply to locomotion only. */
export const isAction = (key: string) => !/idle|walk|run/.test(key.split('/')[0]);
export const GATES = { keyKept: 0.97, keyLostPx: 8, keyOutside: 0.02, keyOutsidePosed: 0.05, areaRatio: 0.5, areaCV: 0.15, paletteDist: 15, heldIoU: 0.3, heldTurn: 30 }; // heldIoU: S5 (0.4 false-fails a 96 px axe walk E at 0.38); heldTurn: deg, B9
/** G2: the body was redrawn. T3: a cape covering the back leaves ~126 body px in north, so 6 olive outline px (27,40,4: key
 * score 32 < 35) read as 0.952 kept and re-rolled a clean keyframe (10 gens) -> also require more than 8 lost px. */
export const g2Fails = (c: Pick<CellOut, 'keyKept' | 'keyLost'>) => c.keyKept != null && c.keyKept < GATES.keyKept && (c.keyLost ?? Infinity) > GATES.keyLostPx;
export interface ClipQa { clip: string; call: number; median: number; cv: number; baseCv: number; minRatio: number; hand?: 'r' | 'l' | '?'; spread: number; minIoU: number }
export interface QaResult { qa: ItemQa; clips: ClipQa[]; failCalls: Map<number, string[]>; softCalls: Map<number, string[]>; warnings: string[]; paletteDist: number[]; splitExact: boolean }

const colours = (im: Img) => {
  const s = new Set<number>();
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) s.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]);
  return [...s];
};
const cdist = (a: number, b: number) => Math.max(Math.abs((a >> 16) - (b >> 16)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)), Math.abs((a & 255) - (b & 255)));
/** Pixel-weighted mean distance (max-channel RGB) from each layer px to the nearest colour of `ref` (design lock; 0 = same
 * palette). S2 averaged over the colour SET, where one 2-px highlight outlier reads as drift (51 on a visibly identical vest). */
export function paletteDistance(ref: number[], cells: Img[]): number {
  if (!ref.length) return 0;
  const memo = new Map<number, number>();
  let n = 0, sum = 0;
  for (const im of cells)
    for (let i = 0; i < im.data.length; i += 4) {
      if (!im.data[i + 3]) continue;
      const c = (im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2];
      let d = memo.get(c);
      if (d == null) memo.set(c, (d = Math.min(...ref.map((r) => cdist(c, r)))));
      n++;
      sum += d;
    }
  return n ? sum / n : 0;
}
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const nearest = (m: Uint8Array, w: number, [x, y]: [number, number]) => {
  let d = 1e9;
  for (let p = 0; p < m.length; p++) if (m[p]) d = Math.min(d, Math.hypot((p % w) - x, ((p / w) | 0) - y));
  return d;
};
/** Principal-axis angle (rad) of a mask, or null for < 6 px. */
export function axisOf(m: Uint8Array, w: number): number | null {
  const c = centroid(m, w);
  if (!c || sum(m) < 6) return null;
  let a = 0, b = 0, d = 0;
  for (let p = 0; p < m.length; p++) if (m[p]) { const x = (p % w) - c[0], y = ((p / w) | 0) - c[1]; a += x * x; b += x * y; d += y * y; }
  return 0.5 * Math.atan2(2 * b, a - d);
}
/** Difference of two axis angles in degrees, 0..90 (axes have no direction). */
export const angleDiff = (x: number, y: number) => { const d = Math.abs((((x - y) * 180) / Math.PI) % 180); return Math.min(d, 180 - d); };
/** IoU of two masks after aligning their centroids (rounded): shape similarity independent of position. */
export function alignedIoU(a: Uint8Array, b: Uint8Array, w: number): number {
  const ca = centroid(a, w), cb = centroid(b, w);
  if (!ca || !cb) return ca === cb ? 1 : 0;
  const dx = Math.round(cb[0] - ca[0]), dy = Math.round(cb[1] - ca[1]), h = a.length / w;
  let i = 0;
  for (let p = 0; p < a.length; p++) {
    const x = (p % w) + dx, y = ((p / w) | 0) + dy;
    if (a[p] && x >= 0 && y >= 0 && x < w && y < h && b[y * w + x]) i++;
  }
  return i / (sum(a) + sum(b) - i);
}
const centroid = (m: Uint8Array, w: number): [number, number] | null => {
  let n = 0, sx = 0, sy = 0;
  for (let p = 0; p < m.length; p++) if (m[p]) { n++; sx += p % w; sy += (p / w) | 0; }
  return n ? [sx / n, sy / n] : null;
};

/** `pad`: oversize layers (held, S5) are gated on their own canvas; hand positions move by the pad. */
export function itemQa(rig: Rig, slot: Slot, route: Route, cells: CellOut[], rerolls: number, keyOutsideMax = GATES.keyOutside, pad = 0): QaResult {
  const w = rig.cell.w + 2 * pad, h = rig.cell.h + 2 * pad, fail = new Map<number, string[]>(), warnings: string[] = [];
  const flag = (call: number, why: string) => (fail.get(call) ?? (fail.set(call, []), fail.get(call)!)).push(why);
  const cellsQa: Record<CellKey, CellQa> = {};
  let clipPx = 0, minKept = 1, maxOut = 0, splitExact = true;
  for (const c of cells) {
    if (c.shifted) flag(c.call, `G10 ${c.key}: misregistered (fits the base better 1 px off)`);
    // B14: a repaired frame (S5 frame-0 repair) is the designed fix, recorded in cells[].repaired, not a review warning
    cellsQa[c.key as CellKey] = { route: route === 'none' ? 'diff' : c.posed ? 'posed' : 'ea2', provenance: c.call, area: c.area, ...(c.repaired ? { repaired: true } : {}), ...(c.offset[0] || c.offset[1] ? { offset: c.offset } : {}), ...(c.keyKept != null ? { keyKept: +c.keyKept.toFixed(3) } : {}) };
    if (g2Fails(c)) flag(c.call, `G2 ${c.key} key kept ${c.keyKept!.toFixed(3)} (${c.keyLost} px)`);
    if (c.keyOutside != null && c.keyOutside > keyOutsideMax) flag(c.call, `G3 ${c.key} key outside ${c.keyOutside.toFixed(3)}`);
    minKept = Math.min(minKept, c.keyKept ?? 1);
    maxOut = Math.max(maxOut, c.keyOutside ?? 0);
    // top row + sides; the bottom row only where the base has no foot within ±2 px (feet/boots sit on row h−1 of the 48→64 rig)
    const foot = (x: number) => [-2, -1, 0, 1, 2].some((d) => x + d >= 0 && x + d < w && c.base.data[((h - 1) * w + x + d) * 4 + 3]);
    let border = 0;
    for (let p = 0; p < c.mask.length; p++) if (c.mask[p] && (p < w || p % w === 0 || p % w === w - 1 || (p >= (h - 1) * w && !foot(p % w)))) border++;
    // an overhead swing leaving a 64 px cell is geometry, not a bad roll: warn on action clips, re-roll on locomotion
    if (border) (isAction(c.key) ? warnings.push.bind(warnings) : (w: string) => flag(c.call, w))(`G7 ${c.key} ${border} px on the cell border (clipped)`);
    clipPx += border;
    if (slot.bgZ != null) {
      const { fg, bg } = splitFgBg(c.layer, c.base), a = makeImg(w, h), b = recompose(c);
      over(a, bg); over(a, c.base); over(a, fg);
      if (a.data.some((v, i) => v !== b.data[i])) splitExact = false;
    }
  }
  if (!splitExact) warnings.push('fg/bg split does not recompose exactly');

  // per clip: presence, stability, placement, handedness
  const clips: ClipQa[] = [];
  const byClip = new Map<string, CellOut[]>(), grip = { R: 0, L: 0, amb: 0, none: 0 };
  for (const c of cells) { const k = c.key.split('/').slice(0, 2).join('/'); (byClip.get(k) ?? (byClip.set(k, []), byClip.get(k)!)).push(c); }
  // wrists: the clip's requested keypoints (what the item was posed with, S5 gripSide), else the tracked hand anchors
  const handTrack = (id: 'hand_r' | 'hand_l', a: string, d: string): [number, number][] | undefined => {
    const k = clipKeypoints(rig, a, d as DirectionName), lab = id === 'hand_r' ? ['RIGHT ARM'] : ['LEFT ARM'];
    return k ? k.map((f) => kpAt(f, lab, rig.cell, pad)!) : rig.anchors?.[id]?.[a]?.[d as DirectionName]?.map(([x, y]) => [x + pad, y + pad] as [number, number]);
  };
  for (const [clip, cs] of byClip) {
    const [a, d] = clip.split('/'), areas = cs.map((c) => c.area), med = median(areas);
    const cvOf = (v: number[]) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return m ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) / m : 0; };
    // G5 allows the item area to vary with the body region it covers (legs crossing in a side walk: boots/pants). T3: the
    // far trouser leg hides behind the near one, so the visible item varies ~2x the body band (walk E: CV 0.20-0.22 vs band
    // 0.11 on 3 seeds, frames visually consistent); a lost item is G4's job
    const cv = cvOf(areas), baseCv = cvOf(cs.map((c) => c.baseBand)), cvMax = Math.max(GATES.areaCV, 2 * baseCv);
    const minRatio = med ? Math.min(...areas) / med : 0;
    if (!med) flag(cs[0].call, `G4 ${clip}: item missing`);
    // S5: a held item swung behind the body in a back-view action is true occlusion -> review, not re-roll
    else if (minRatio < GATES.areaRatio) (slot.class === 'held' && d.startsWith('north') && isAction(clip) ? (m: string) => warnings.push(m) : (m: string) => flag(cs[0].call, m))(`G4 ${clip}: min area ${(minRatio * 100).toFixed(0)} % of median`);
    if (cv > cvMax && !isAction(clip)) flag(cs[0].call, `G5 ${clip}: area CV ${cv.toFixed(2)} > ${cvMax.toFixed(2)}`);
    // placement: centroid spread relative to the slot anchor (info)
    const anc = slot.anchor ? rig.anchors?.[slot.anchor as 'head']?.[a]?.[d as DirectionName] : undefined;
    const rel = cs.map((c) => { const ct = centroid(c.mask, w), i = +c.key.split('/')[2]; return ct && anc?.[i] ? [ct[0] - anc[i][0] - pad, ct[1] - anc[i][1] - pad] : null; }).filter(Boolean) as number[][];
    const spread = rel.length ? Math.max(...[0, 1].map((k) => Math.max(...rel.map((r) => r[k])) - Math.min(...rel.map((r) => r[k])))) : 0;
    let hand: ClipQa['hand'];
    const hr = handTrack('hand_r', a, d), hl = handTrack('hand_l', a, d);
    if (slot.class === 'held' && hr && hl) {
      let r = 0, l = 0;
      for (const c of cs) {
        const i = +c.key.split('/')[2], dr = nearest(c.mask, w, hr[i]), dl = nearest(c.mask, w, hl[i]);
        if (dr + 2 < dl) r++;
        else if (dl + 2 < dr) l++;
        grip[Math.min(dr, dl) > 6 ? 'none' : dr + 2 < dl ? 'R' : dl + 2 < dr ? 'L' : 'amb']++; // S3 gripSide
      }
      // B14: one decided frame of six (sword hurt E: 0 R / 1 L) is not a hand switch; a clip decides with half its frames
      hand = (r + l) * 2 < cs.length ? '?' : r > l ? 'r' : l > r ? 'l' : '?';
      const want = slot.anchor === 'hand_l' ? 'l' : 'r';
      if (hand !== '?' && hand !== want) flag(cs[0].call, `G8 ${clip}: held in the ${hand === 'r' ? 'right' : 'left'} hand (${r} R / ${l} L frames)`);
    }
    // G9 (held): a rigid object keeps its shape frame to frame (S2/M3: a sword flipped from vertical to horizontal mid-walk)
    const ord = [...cs].sort((x, y) => +x.key.split('/')[2] - +y.key.split('/')[2]);
    const minIoU = Math.min(1, ...ord.map((c, i) => alignedIoU(c.mask, ord[(i + 1) % ord.length].mask, w)));
    // B9: a held blade legitimately turns with the swinging arm (walk E: blade 29° -> 74° while the forearm goes 68° -> 92°),
    // which drops the IoU to 0.2 on every seed. With posed keypoints, G9 checks the blade angle RELATIVE to the forearm
    // instead (a flip changes it, a swing does not); the IoU stays the gate where no keypoints exist (anchor route).
    const fore = clipKeypoints(rig, a, d as DirectionName)?.map((f) => { const lab = slot.anchor === 'hand_l' ? 'LEFT' : 'RIGHT', e = kpAt(f, [`${lab} ELBOW`], rig.cell, 0)!, wr = kpAt(f, [`${lab} ARM`], rig.cell, 0)!; return Math.atan2(wr[1] - e[1], wr[0] - e[0]); });
    const turn = fore ? Math.max(0, ...ord.map((c, i) => { const n = ord[(i + 1) % ord.length], j = +c.key.split('/')[2], k = +n.key.split('/')[2], x = axisOf(c.mask, w), y = axisOf(n.mask, w); return x == null || y == null ? 0 : angleDiff(x - fore[j], y - fore[k]); })) : undefined;
    if (slot.class === 'held' && !isAction(clip) && (turn != null ? turn > GATES.heldTurn : minIoU < GATES.heldIoU))
      flag(cs[0].call, turn != null ? `G9 ${clip}: the item turns ${turn.toFixed(0)}° against the hand between frames` : `G9 ${clip}: shape jump (aligned IoU ${minIoU.toFixed(2)})`);
    clips.push({ clip, call: cs[0].call, median: med, cv: +cv.toFixed(3), baseCv: +baseCv.toFixed(3), minIoU: +minIoU.toFixed(2), minRatio: +minRatio.toFixed(2), hand, spread: +spread.toFixed(1) });
  }
  // G8: every clip holds the item in the same hand (majority over clips; the slot anchor names the expected one)
  let handedness: ItemQa['handedness'];
  const decided = clips.filter((c) => c.hand === 'r' || c.hand === 'l');
  if (decided.length) {
    const r = decided.filter((c) => c.hand === 'r').length, major = r * 2 >= decided.length ? 'r' : 'l';
    handedness = 'ok';
    for (const c of decided.filter((c) => c.hand !== major)) { handedness = 'switched'; flag(c.call, `G8 ${c.clip}: held in the ${c.hand === 'r' ? 'right' : 'left'} hand, other clips ${major === 'r' ? 'right' : 'left'}`); }
    if (slot.anchor && slot.anchor.endsWith(major === 'r' ? 'l' : 'r')) warnings.push(`held in the ${major === 'r' ? 'right' : 'left'} hand; slot ${slot.id} expects ${slot.anchor}`);
  }
  if (slot.class === 'held' && !decided.length) warnings.push('G8 handedness not checked (no hand anchors: run skeletons in M2)');

  // G6 design lock: palette distance of each later call to the design call (call 0)
  const k0 = Math.min(...cells.map((c) => c.call)); // design call (anchor route) or the first posed clip (skel route)
  const ref = [...new Set(cells.filter((c) => c.call === k0).flatMap((c) => colours(c.layer)))];
  const calls = [...new Set(cells.map((c) => c.call))].sort((a, b) => a - b);
  const paletteDist = Array.from({ length: Math.max(...calls) + 1 }, (_, k) => +paletteDistance(ref, cells.filter((c) => c.call === k).map((c) => c.layer)).toFixed(1));
  // soft gate: the UI re-rolls a drifting call while it has re-rolls left, then keeps it with a warning
  const softCalls = new Map<number, string[]>();
  paletteDist.forEach((pd, k) => { if (pd > GATES.paletteDist) { warnings.push(`G6 call ${k + 1}: palette distance ${pd} to the design call`); softCalls.set(k, [`G6 palette distance ${pd}`]); } });

  const minAreaRatio = Math.min(1, ...clips.map((c) => c.minRatio)), maxAreaCV = Math.max(0, ...clips.map((c) => c.cv));
  const status: ItemQa['status'] = fail.size ? 'fail' : warnings.length || route === 'none' ? 'warn' : 'pass';
  return {
    qa: {
      minKeyKept: +minKept.toFixed(3), maxKeyOutside: +maxOut.toFixed(4), minAreaRatio, maxAreaCV, maxPaletteDist: Math.max(0, ...paletteDist), clipPx, handedness,
      shiftedFrames: cells.filter((c) => c.shifted).length, strayPx: cells.reduce((s, c) => s + c.stray, 0), ...(slot.class === 'held' ? { grip } : {}), rerolls, status, cells: cellsQa,
    },
    clips, failCalls: fail, softCalls, warnings, paletteDist, splitExact,
  };
}

// ---------- B14 dress design check (0 gens): grey smudges in a colourful keyframe ----------
/** Share of near-grey px (HSV saturation < 0.25) in a colourful layer (median saturation ≥ 0.4), else 0. T3 Ranger keyframes:
 *  the red cape's smudged north hem 0.113; every clean view of hair, chest, trousers and cape ≤ 0.022 (grey items: median < 0.4). */
export function greyShare(L: Img): number {
  const sat: number[] = [];
  for (let i = 0; i < L.data.length; i += 4) if (L.data[i + 3]) { const mx = Math.max(L.data[i], L.data[i + 1], L.data[i + 2]), mn = Math.min(L.data[i], L.data[i + 1], L.data[i + 2]); sat.push(mx ? (mx - mn) / mx : 0); }
  return sat.length && median(sat) >= 0.4 ? sat.filter((v) => v < 0.25).length / sat.length : 0;
}
export const DESIGN = { grey: 0.05 };
/** Prompts that ask for grey/black/white parts: the grey check does not apply. */
export const GREYISH = /gr[ae]y|silver|steel|iron|metal|chain|white|black|fur|stone|ash/i;

// ---------- H4 keyframe-consistency gate (port of S5 s5_dircheck.mjs, 0 gens) ----------
const maskOf = (im: Img) => { const m = new Uint8Array(im.w * im.h); for (let p = 0; p < m.length; p++) m[p] = im.data[p * 4 + 3] ? 1 : 0; return m; };
const despeck = (im: Img) => {
  const o = makeImg(im.w, im.h);
  for (const c of components(maskOf(im), im.w, im.h)) if (c.length >= 4) for (const p of c) o.data.set(im.data.subarray(p * 4, p * 4 + 4), p * 4);
  return o;
};
/** Appearance similarity of layer A to keyframe layer K after centroid alignment (±1 px): over the union of both masks a pixel
 * scores 1 − maxChannelDiff/128 when both are opaque, 0 when only one is; K px landing on `occ` (visible mannequin) are skipped. */
export function simAligned(A: Img, K: Img, occ?: Uint8Array): number {
  const { w, h } = A, a = maskOf(A), b = maskOf(K), ca = centroid(a, w), cb = centroid(b, w);
  if (!ca || !cb) return 0;
  let best = 0;
  for (let ey = -1; ey <= 1; ey++)
    for (let ex = -1; ex <= 1; ex++) {
      const dx = Math.round(cb[0] - ca[0]) + ex, dy = Math.round(cb[1] - ca[1]) + ey;
      let S = 0, U = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const p = y * w + x, X = x + dx, Y = y + dy, inB = X >= 0 && Y >= 0 && X < w && Y < h && b[Y * w + X];
          if ((!a[p] && !inB) || (!a[p] && occ?.[p])) continue;
          U++;
          const q = (Y * w + X) * 4;
          if (a[p] && inB) S += Math.max(0, 1 - Math.max(Math.abs(A.data[p * 4] - K.data[q]), Math.abs(A.data[p * 4 + 1] - K.data[q + 1]), Math.abs(A.data[p * 4 + 2] - K.data[q + 2])) / 128);
        }
      best = Math.max(best, U ? S / U : 0);
    }
  return best;
}
const OPP: Partial<Record<DirectionName, DirectionName>> = { south: 'north', north: 'south' };
/** cover: B14, soft items (cloth, hair) are only judged in a view where the item covers at least half of the body (a cape from
 *  behind, not the cape edges from the front); soft: their own-similarity floor there. */
export const H4 = { own: 0.75, oppMargin: 0.1, soft: 0.5, cover: 0.5 };
/**
 * H4: a posed layer must look like its own direction's dressed keyframe layer. Band items (helmet, face): own < 0.75 fails in every
 * view (S5: a visor on a back view; B7 live: a blade drawn into a helmet's slash frames). Soft items (worn torso/back, hair) only
 * warn, and only where the item covers ≥ 50 % of the body in some frame of the clip and own < 0.5 (B14 on the Ranger's stored
 * frames: hair, chest and the cape's front view scored 0.20–0.74 on 31 frames that look right; the cape wrapping the raised arm
 * from behind scored 0.31–0.46). Off for legs, feet (S and N look alike: trousers own ≈ opposite on 13 good frames) and held items.
 */
export function dirGate(slot: Slot, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>): { fails: Map<number, string[]>; warnings: string[] } {
  const fails = new Map<number, string[]>(), warnings: string[] = [];
  if (slot.class === 'held' || slot.id === 'feet' || slot.id === 'legs') return { fails, warnings };
  // soft items: the clip's best body coverage (item px on the base silhouette / base px)
  const cover = new Map<string, number>();
  if (!slot.band)
    for (const c of cells) {
      let on = 0, body = 0;
      for (let p = 0; p < c.mask.length; p++) if (c.base.data[p * 4 + 3]) { body++; if (c.mask[p]) on++; }
      const k = c.key.split('/').slice(0, 2).join('/');
      cover.set(k, Math.max(cover.get(k) ?? 0, body ? on / body : 0));
    }
  for (const c of cells) {
    const dir = c.key.split('/')[1] as DirectionName, opp = OPP[dir];
    if (!c.posed || !keys[dir] || !c.area || (slot.class !== 'rigid' && !opp)) continue;
    if (!slot.band && (cover.get(c.key.split('/').slice(0, 2).join('/')) ?? 0) < H4.cover) continue;
    const L = despeck(c.layer), occ = new Uint8Array(c.mask.length);
    for (let p = 0; p < occ.length; p++) occ[p] = c.out.data[p * 4 + 3] && !c.mask[p] ? 1 : 0;
    const own = simAligned(L, despeck(keys[dir]!), occ);
    if (own >= (slot.band ? H4.own : H4.soft)) continue;
    const other = opp && keys[opp] ? simAligned(L, despeck(keys[opp]!), occ) : 0;
    const why = `H4 ${c.key}: ${other >= own - H4.oppMargin ? 'looks like the opposite view' : 'does not match its keyframe (extra or missing parts)'} (own ${own.toFixed(2)}${opp ? `, opposite ${other.toFixed(2)}` : ''})`;
    if (slot.band) (fails.get(c.call) ?? (fails.set(c.call, []), fails.get(c.call)!)).push(why);
    else warnings.push(why);
  }
  return { fails, warnings };
}

// ---------- manifest Item ----------
/** Accepted item: layers (main, or fg + bg for slots with bgZ) with cell hashes for every selected anim × generated dir. */
export async function buildItem(o: {
  spec: ItemSpec; rig: Rig; cells: CellOut[]; route: Route; provenance: Provenance[]; qa: ItemQa; anchorCell?: string; dressed?: Partial<Record<DirectionName, Img>>; pad?: number;
}): Promise<{ item: Item; images: Map<Sha256, Img> }> {
  const { spec, rig, cells } = o, slot = slotOf(spec.slot), images = new Map<Sha256, Img>(), p = o.pad ?? 0;
  // v1.3.1 oversize layer (S5 held): own cell + pivot, aligned to the base by pivot
  const size = p ? { cell: { w: rig.cell.w + 2 * p, h: rig.cell.h + 2 * p }, pivot: { x: rig.pivot.x + p, y: rig.pivot.y + p } } : {};
  const put = async (im: Img): Promise<Sha256 | null> => {
    if (!im.data.some((v, i) => i % 4 === 3 && v)) return null;
    const k = await cellHash(im);
    images.set(k, im);
    return k;
  };
  const layers: Layer[] = slot.bgZ != null
    ? [{ id: 'fg', role: 'fg', z: slot.z, cells: {}, ...size }, { id: 'bg', role: 'bg', z: slot.bgZ, cells: {}, ...size }]
    : [{ id: 'main', role: 'fg', z: slot.z, cells: {}, ...size }];
  const byKey = new Map(cells.map((c) => [c.key, c]));
  for (const a of spec.anims) {
    const n = rig.animations.find((x) => x.id === a)!.cells;
    for (const l of layers) l.cells![a] = {};
    for (const d of spec.dirs)
      for (let i = 0; i < n; i++) {
        const c = byKey.get(cellKey(a, d, i));
        const parts = !c ? [null, null] : slot.bgZ != null ? (({ fg, bg }) => [fg, bg])(splitFgBg(c.layer, c.base)) : [c.layer];
        for (const [j, l] of layers.entries()) ((l.cells![a]![d] ??= Array(n).fill(null)) as (Sha256 | null)[])[i] = parts[j] ? await put(parts[j]!) : null;
      }
  }
  const item: Item = {
    id: spec.id, name: spec.name, slot: spec.slot, status: 'accepted', mirror: 'flip', materials: [], prompt: spec.prompt, layers,
    baseHash: rig.baseHash, route: o.route === 'none' ? 'diff' : spec.method === 'skel' ? 'skeleton-pose' : 'ea2-anchor',
    extractor: o.route === 'none' ? 'diff' : 'chroma', ...(o.route !== 'none' ? { key: o.route } : {}),
    ...(o.anchorCell && spec.method !== 'skel' ? { anchorCell: o.anchorCell as CellKey } : {}), provenance: o.provenance, qa: o.qa,
  };
  if (o.dressed) {
    item.dressed = {};
    for (const [d, im] of Object.entries(o.dressed) as [DirectionName, Img][]) { const k = await cellHash(im); images.set(k, im); item.dressed[d] = k; }
  }
  return { item, images };
}

/** Contact sheet: rows of cells, nearest-neighbour scaled, 2 px grey gutters (transparent cells stay checker-free). */
export function contactSheet(rows: (Img | null)[][], s = 2, gap = 2): Img {
  const w = Math.max(1, ...rows.flat().map((im) => im?.w ?? 0)), h = Math.max(1, ...rows.flat().map((im) => im?.h ?? 0));
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const o = makeImg(cols * (w * s + gap) + gap, rows.length * (h * s + gap) + gap);
  o.data.fill(0);
  for (let i = 0; i < o.data.length; i += 4) o.data.set([40, 40, 48, 255], i);
  rows.forEach((r, ry) => r.forEach((im, cx) => {
    const ox = gap + cx * (w * s + gap), oy = gap + ry * (h * s + gap);
    for (let y = 0; y < h * s; y++)
      for (let x = 0; x < w * s; x++) {
        const d = ((oy + y) * o.w + ox + x) * 4, chk = ((x >> 3) + (y >> 3)) & 1 ? 200 : 230;
        const si = im ? (((y / s) | 0) * im.w + ((x / s) | 0)) * 4 : -1;
        o.data.set(si >= 0 && im!.data[si + 3] ? im!.data.subarray(si, si + 4) : [chk, chk, chk, 255], d);
      }
  }));
  return o;
}

export async function selfTest() {
  const rig = {
    cell: { w: 8, h: 8 }, pivot: { x: 4, y: 8 }, baseItem: 'base', baseHash: 'sha256:x',
    directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west', mirrorOf: 'east' }],
    animations: [{ id: 'idle', cells: 4, loop: true, frames: [] }, { id: 'walk', cells: 8, loop: true, frames: [] }],
  } as unknown as Rig;
  const calls = planCalls(rig, { anims: ['idle', 'walk'], dirs: ['south', 'east', 'north'] });
  console.assert(calls.map((c) => c.length).join() === '16,12,8' && calls[0][0] === 'walk/south/0' && calls[1][8] === 'idle/south/0', `packing ${calls.map((c) => c.length)}`);
  const sk = planItem(rig, { anims: ['idle', 'walk'], dirs: ['south', 'east', 'north'], method: 'skel', key: 'green' });
  console.assert(sk.length === 7 && sk[0].kind === 'dress' && sk[0].cells.join() === 'rest/south/0,rest/east/0,rest/north/0' && sk[6].cells.length === 8 && planGens(sk) === 10 + 3 * 3 + 3 * 3, `planItem skel ${planGens(sk)}`);
  const two: Img = { w: 2, h: 1, data: new Uint8ClampedArray([10, 0, 0, 255, 250, 0, 0, 255]) };
  console.assert(paletteDistance([10 << 16], [two]) === 120, 'paletteDistance is pixel-weighted');
  console.assert(cellsNote(calls[1], 'walk/south/0') === 'Cells in order: frame 1 = reference (walk facing south (front view)), then 8 cells walk facing north (back view), 4 cells idle facing south (front view). ', 'cellsNote');
  const m1 = new Uint8Array(16), m2 = new Uint8Array(16);
  m1.set([1, 1], 0); m2.set([1, 1], 10); // same 2-px bar, moved
  console.assert(axisOf(new Uint8Array(64).fill(1, 8, 16), 8) === 0 && Math.abs(Math.abs(axisOf(new Uint8Array(64).map((_, p) => +(p % 8 === 3)), 8)!) - Math.PI / 2) < 1e-9 && angleDiff(0.1, 0.1 + Math.PI) < 1e-6 && Math.round(angleDiff(0, Math.PI / 4)) === 45, 'axisOf / angleDiff');
  console.assert(alignedIoU(m1, m2, 4) === 1 && alignedIoU(m1, new Uint8Array(16).fill(1), 4) === 2 / 16, 'alignedIoU');
  console.assert(bandOf('head', { NECK: { x: 4, y: 3, z: 0 } }, 8).h === 6 && bandOf('main_hand', undefined, 8).h === 8, 'bands');

  // synthetic: base = 4x6 block, the item = a 3 px bar inside it, green key route
  const base = makeImg(8, 8);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 6; x++) base.data.set([180, 140, 120, 255], (y * 8 + x) * 4);
  const mk = (k: string, call: number, dx = 0) => {
    const out = toChroma(base, 'green');
    out.data.set([90, 90, 100, 255], (4 * 8 + 3 + dx) * 4);
    out.data.set([90, 90, 100, 255], (5 * 8 + 3 + dx) * 4);
    out.data.set([90, 90, 100, 255], (6 * 8 + 3 + dx) * 4);
    return extractCell({ key: k, call, base, out, route: 'green', band: bandOf('head', undefined, 8) });
  };
  const cs = [0, 1, 2, 3].map((i) => mk(`idle/south/${i}`, 0));
  console.assert(cs[0].area === 3 && cs[0].keyKept === 1 && cs[0].specks === 0, `extractCell area ${cs[0].area}`);
  const q = itemQa(rig, slotOf('head'), 'green', cs, 0);
  console.assert(q.qa.status === 'pass' && q.qa.maxAreaCV === 0 && q.failCalls.size === 0, `qa pass ${JSON.stringify(q.failCalls)}`);
  const missing = itemQa(rig, slotOf('head'), 'green', [...cs.slice(0, 3), { ...cs[3], area: 0, mask: new Uint8Array(64) }], 0);
  console.assert(missing.failCalls.get(0)?.some((s) => s.startsWith('G4')) === true, 'G4 catches a missing cell');
  const cape = itemQa(rig, slotOf('back'), 'green', cs, 0);
  console.assert(cape.splitExact, 'split recomposes exactly');
  const { item, images } = await buildItem({ spec: { id: 'h', name: 'H', slot: 'back', prompt: 'p', key: 'green', anims: ['idle'], dirs: ['south'] }, rig, cells: cs, route: 'green', provenance: [], qa: q.qa });
  console.assert(item.layers.map((l) => l.id).join() === 'fg,bg' && item.layers[0].cells!.idle!.south!.length === 4 && images.size === 1, 'buildItem split layers');
  console.assert(item.layers[1].cells!.idle!.south![0] === null, 'bg empty -> transparent cell');
  const block = makeImg(8, 8);
  for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) block.data.set([90, 90, 100, 255], (y * 8 + x) * 4);
  const cell = { ...cs[0], posed: true, layer: block, mask: new Uint8Array(64), area: 9 };
  console.assert(simAligned(block, block) === 1 && !dirGate(slotOf('head'), [cell], { south: block }).fails.size, 'H4: same layer passes');
  const blade = { ...cell, layer: makeImg(8, 8) };
  blade.layer.data.set(block.data);
  for (const p of [0, 1, 2, 8, 9, 10, 16]) blade.layer.data.set([200, 200, 210, 255], p * 4); // a foreign object attached to the item
  console.assert(dirGate(slotOf('head'), [blade], { south: block }).fails.get(0)?.[0].startsWith('H4') === true && !dirGate(slotOf('main_hand'), [blade], { south: block }).fails.size, 'H4: extra parts fail rigid items, held items are skipped');
  // B14: soft items (hair, cloth) warn only where they cover >= half the body and own < 0.5; never fail
  const red = makeImg(8, 8);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 6; x++) red.data.set([250, 10, 10, 255], (y * 8 + x) * 4);
  const cloak = { ...cell, layer: red, mask: maskOf(red), area: 24, out: red }, edge = { ...blade, mask: maskOf(blade.layer), area: 16 };
  const hairH4 = dirGate(slotOf('hair'), [cloak], { south: block }), backH4 = dirGate(slotOf('back'), [edge], { south: block });
  console.assert(!hairH4.fails.size && hairH4.warnings.length === 1 && !backH4.warnings.length && !dirGate(slotOf('legs'), [cloak], { south: block }).warnings.length, 'H4: soft items warn only when covering the body (T3/B14), legs off');
  const smudged = makeImg(10, 10);
  for (let p = 0; p < 100; p++) smudged.data.set(p < 8 ? [90, 85, 80, 255] : [200, 30, 40, 255], p * 4);
  console.assert(greyShare(smudged) === 0.08 && greyShare(block) === 0 && GREYISH.test('an iron helmet'), 'D1: grey share of a colourful design');
  console.assert(!g2Fails({ keyKept: 0.952, keyLost: 6 }) && g2Fails({ keyKept: 0.952, keyLost: 30 }) && !g2Fails({ keyKept: 0.99, keyLost: 30 }), 'G2: a nearly covered body needs > 8 lost px (T3 cape north)');

  // B14 grid fallback: pack + cut round-trips, mask white only on the cells' band rows, references kept
  const gm = bandMask({ x: 0, y: 4, w: 1e3, h: 4 }, 8, 8), pg = packGrid([base, block, base], [gm, null, gm]);
  console.assert(pg.image.w === 32 && pg.image.h === 8 && cutGrid(pg.image, 2, 8, 8)[1].data.join() === block.data.join(), 'packGrid/cutGrid');
  console.assert(pg.mask.data[(5 * 32 + 1) * 4] === 255 && pg.mask.data[(1 * 32 + 1) * 4] === 0 && pg.mask.data[(5 * 32 + 9) * 4] === 0 && pg.mask.data[(5 * 32 + 17) * 4] === 255, 'grid mask: band rows of posed cells only');
  console.assert(gridPrompt({ item: 'a red cape', slot: 'back', key: 'green', anim: 'slash', dir: 'north', n: 8, refs: ['south', 'east', 'north'], cell: { w: 64, h: 64 } }).includes('4x3 grid') , 'gridPrompt');

  // B9 held route: pad, keypoints, frame 0 last, oversize layer
  const c64 = { w: 64, h: 64 }, kp = (x: number, y: number) => [{ label: 'RIGHT ARM', x, y }, { label: 'NOSE', x: 0.5, y: 0.3 }];
  console.assert(padOf('main_hand', 'skel') === 16 && padOf('main_hand', 'anchor') === 0 && padOf('head', 'skel') === 0, 'padOf: held + skel only');
  console.assert(padKeypoints(kp(0.5, 0.5), c64, 16)[0].x === 0.5 && padKeypoints(kp(0, 1), c64, 16)[0].y === +(80 / 96).toFixed(4), 'padKeypoints keeps the body point');
  const pb = padImg(base, 2);
  console.assert(pb.w === 12 && pb.data[((2 + 2) * 12 + 2 + 2) * 4 + 3] === 255 && pb.data[(2 * 12 + 2) * 4 + 3] === 0, 'padImg');
  const rest0 = kp(0.6, 0.6), seq = [kp(0.6, 0.605), kp(0.7, 0.4), kp(0.8, 0.3)];
  console.assert(f0Last('main_hand', rest0, seq, c64) && !f0Last('head', rest0, seq, c64) && !f0Last('main_hand', rest0, seq.slice(1), c64), 'f0Last: held + near-rest first frame');
  const req = itemRoute.pose({ keyframePngB64: 'x', rest: rest0, poses: seq, item: 'a sword', slot: 'main_hand', key: 'green', anim: 'slash', dir: 'south', seed: 1, cell: c64, pad: 16 }).body as { keypoints: Keypoint[][]; description: string };
  console.assert(req.keypoints[2][0].x === padKeypoints(seq[0], c64, 16)[0].x && unrotate([1, 2, 0], true).join() === '0,1,2' && req.description.includes('exactly one weapon'), 'pose: frame 0 sent last, padded, one weapon');
  const helm = itemRoute.pose({ keyframePngB64: 'x', rest: rest0, poses: seq, item: 'a helmet', slot: 'head', key: 'green', anim: 'slash', dir: 'south', seed: 1, cell: c64 }).body as { keypoints: Keypoint[][]; description: string };
  console.assert(helm.keypoints[0] === seq[0] && helm.description === 'solid bright green mannequin (chroma key colour) wearing a helmet, empty hands, no weapon', 'non-held pose request unchanged (ledger cache hits)');
  const held = await buildItem({ spec: { id: 's', name: 'S', slot: 'main_hand', prompt: 'p', key: 'green', anims: ['idle'], dirs: ['south'], method: 'skel' }, rig, cells: cs.map((c) => ({ ...c, base: padImg(c.base, 16), layer: padImg(c.layer, 16) })), route: 'green', provenance: [], qa: q.qa, pad: 16 });
  console.assert(held.item.layers.every((l) => l.cell?.w === 40 && l.pivot?.x === 4 + 16 && l.pivot?.y === 8 + 16), 'held layers carry cell + pivot');

  // B9 cleanup: a streak outside the keyframe support is trimmed, a split item inside it is kept, consensus keeps real parts
  const kr = { ...rig, cell: { w: 16, h: 16 }, rest: { south: { image: 'sha256:x', keypoints: [] } }, animations: [{ id: 'walk', cells: 3, loop: true, frames: [] }] } as unknown as Rig;
  const K = makeImg(16, 16);
  for (let y = 4; y < 8; y++) for (let x = 5; x < 9; x++) K.data.set([90, 90, 100, 255], (y * 16 + x) * 4);
  const cell16 = (extra: number[], hole = false) => {
    const L = makeImg(16, 16); L.data.set(K.data);
    if (hole) for (let y = 4; y < 8; y++) L.data.fill(0, (y * 16 + 6) * 4, (y * 16 + 7) * 4 + 4); // split in two by a forearm
    for (const p of extra) L.data.set([200, 200, 210, 255], p * 4);
    const mask = maskOf(L);
    return { ...cs[0], key: '', posed: true, layer: L, mask, area: sum(mask), out: L, base: L, stray: 0 } as CellOut;
  };
  const streak = [13 * 16 + 1, 14 * 16 + 1, 15 * 16 + 1], plume = [3 * 16 + 11, 2 * 16 + 11];
  const t = [cell16([...streak, ...plume]), cell16(plume, true), cell16(plume)].map((c, i) => ({ ...c, key: `walk/south/${i}` }));
  const gone = trimToKeyframe(kr, t, { south: K });
  // T3: worn items drop detached off-body smears, keep a part split off on the body
  const wb = makeImg(16, 16);
  for (let y = 4; y < 12; y++) for (let x = 4; x < 10; x++) wb.data.set([150, 150, 150, 255], (y * 16 + x) * 4);
  const wl = makeImg(16, 16);
  for (const p of [4 * 16 + 4, 4 * 16 + 5, 5 * 16 + 4, 5 * 16 + 5, 5 * 16 + 6, 9 * 16 + 8, 9 * 16 + 9, 10 * 16 + 8, 1 * 16 + 13, 2 * 16 + 13, 2 * 16 + 14]) wl.data.set([120, 70, 30, 255], p * 4);
  const wc = { ...cs[0], key: 'slash/east/0', posed: true, base: wb, layer: wl, mask: maskOf(wl), area: 11, stray: 0 } as CellOut;
  console.assert(dropOffBody([wc]) === 3 && wc.area === 8 && wc.mask[9 * 16 + 8] === 1 && !wc.mask[1 * 16 + 13], 'dropOffBody: off-body smear removed, on-body split part kept');
  console.assert(gone === 3 && t[0].area === 16 + 2 && t[1].area === 8 + 2 && !t[0].mask[13 * 16 + 1] && t[0].mask[3 * 16 + 11] === 1, `trimToKeyframe ${gone} ${t.map((c) => c.area)}`);
}
