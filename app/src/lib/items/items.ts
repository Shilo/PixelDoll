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
import { png, routes, type Req } from '../pixellab/routes.ts';

/**
 * Item routes (S4 §Q4), swappable without touching extraction, QA or the UI:
 * - `skel` (default on v1.3 rigs): ONE edit-animation-v2 call dresses the chroma REST VIEWS (S/E/N), then each clip ×
 *   direction poses its dressed keyframe via raw animate-with-skeleton-v3 with EXACTLY the stored keypoint sequence the base
 *   clip was rendered from (rig.animations[].sources[dir].keypoints, first frame keypoints = rig.rest[dir].keypoints): same
 *   request shape as the base, so the layers align (S3). No estimated fallback: rigs without stored sources use `anchor`.
 * - `anchor` (S2): edit-animation-v2 on ≤16 packed chroma cells per call, later calls carry one dressed anchor cell.
 */
export type Method = 'skel' | 'anchor';
export type CallKind = 'edit' | 'dress' | 'pose';
export const itemRoute = {
  name: 'skeleton-posed keyframe / edit-animation-v2',
  maxFrames: 16, // edit-animation-v2 frames per call at ≤ 64 px, anchor cell included
  edit: (framesPngB64: string[], description: string, seed: number, cell: { w: number; h: number }): Req => {
    const size = { width: cell.w, height: cell.h };
    return routes.editAnimationV2({ description, frames: framesPngB64.map((b) => ({ image: png(b), size })), image_size: size, no_background: true, seed });
  },
  /** Pose a dressed chroma keyframe (in pose `rest`) through a stored keypoint sequence; returns frames in keypoint order. */
  pose: (o: { keyframePngB64: string; rest: Keypoint[]; poses: Keypoint[][]; item: string; held: boolean; key: Key; anim: string; dir: DirectionName; seed: number }): Req =>
    rawClip({
      // B7 live: "slash" drew a blade into a helmet layer although the action said "no weapon" -> say it in the looks too
      description: `solid ${o.key === 'green' ? 'bright green' : 'magenta'} mannequin (chroma key colour) ${o.held ? 'holding' : 'wearing'} ${o.item}${o.held ? '' : ', empty hands, no weapon'}`,
      // M3: a "slash" pose made the model draw a sword into a helmet layer -> unarmed unless the item is the held object
      action: actionOf(o.anim) + (o.held ? '' : ', empty hands, no weapon, no effects'),
      dir: o.dir, first: o.keyframePngB64, rest: o.rest, keypoints: o.poses, seed: o.seed,
    }),
};
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
  { id: 'hair', z: 110, bgZ: 3, class: 'rigid', anchor: 'head' },
  { id: 'face_acc', z: 120, class: 'rigid', anchor: 'head', band: true },
  { id: 'head', z: 130, class: 'rigid', anchor: 'head', hides: ['hair'], band: true },
  { id: 'off_hand', z: 140, bgZ: 2, class: 'held', anchor: 'hand_l' },
  { id: 'main_hand', z: 150, bgZ: 1, class: 'held', anchor: 'hand_r' },
];
export const slotOf = (id: string) => SLOTS.find((s) => s.id === id)!;

export type Route = Key | 'none'; // 'none' = diff fallback on the real base
export interface ItemSpec { id: string; name: string; slot: string; prompt: string; key: Route; anims: string[]; dirs: DirectionName[]; method?: Method }

/** Calls of an item. skel: [dress the rest cells, pose clip × dir ...]; anchor: packed edit calls (planCalls). */
export function planItem(rig: Rig, spec: Pick<ItemSpec, 'anims' | 'dirs' | 'method' | 'key'>): { kind: CallKind; cells: string[] }[] {
  if (spec.method !== 'skel' || spec.key === 'none') return planCalls(rig, spec).map((cells) => ({ kind: 'edit', cells }));
  return [
    { kind: 'dress', cells: spec.dirs.map(restKey) },
    ...spec.anims.flatMap((a) => spec.dirs.map((d) => ({ kind: 'pose' as const, cells: Array.from({ length: rig.animations.find((x) => x.id === a)!.cells }, (_, i) => cellKey(a, d, i)) }))),
  ];
}
export const planGens = (p: { kind: CallKind; cells: string[] }[]) => p.reduce((s, c) => s + (c.kind === 'pose' ? (c.cells.length <= 3 ? 2 : c.cells.length <= 8 ? 3 : 4) : 10), 0);

/** Clips (anim × generated dir) packed whole into calls: design call ≤ maxFrames cells, later calls ≤ maxFrames − 1 + 1 anchor cell. */
export function planCalls(rig: Rig, spec: Pick<ItemSpec, 'anims' | 'dirs'>): string[][] {
  const clips = spec.anims.flatMap((a) => spec.dirs.map((d) => ({ a, d, n: rig.animations.find((x) => x.id === a)?.cells ?? 0 }))).filter((c) => c.n);
  clips.sort((x, y) => y.n - x.n); // stable: walk S, E, N before idle
  const bins: { cap: number; clips: typeof clips }[] = [];
  for (const c of clips) {
    const max = itemRoute.maxFrames;
    if (c.n > max - 1) throw new Error(`${c.a}/${c.d}: ${c.n} cells do not fit one call`);
    const bin = bins.find((b) => b.cap - b.clips.reduce((s, x) => s + x.n, 0) >= c.n) ?? (bins.push({ cap: bins.length ? max - 1 : max, clips: [] }), bins.at(-1)!);
    bin.clips.push(c);
  }
  return bins.map((b) => b.clips.flatMap((c) => Array.from({ length: c.n }, (_, i) => cellKey(c.a, c.d, i))));
}

const facing = (d: string) => `facing ${d}${d === 'south' ? ' (front view)' : d === 'north' ? ' (back view)' : ' (side view)'}`;
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
    ...(kk && route !== 'none' ? { keyKept: kk.kept, erased: kk.erased, keyOutside: keyOutside(base, out, route, undefined, r.mask, tol) } : {}),
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
export const GATES = { keyKept: 0.97, keyOutside: 0.02, keyOutsidePosed: 0.05, areaRatio: 0.5, areaCV: 0.15, paletteDist: 15, heldIoU: 0.4 };
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

export function itemQa(rig: Rig, slot: Slot, route: Route, cells: CellOut[], rerolls: number, keyOutsideMax = GATES.keyOutside): QaResult {
  const { w, h } = rig.cell, fail = new Map<number, string[]>(), warnings: string[] = [];
  const flag = (call: number, why: string) => (fail.get(call) ?? (fail.set(call, []), fail.get(call)!)).push(why);
  const cellsQa: Record<CellKey, CellQa> = {};
  let clipPx = 0, minKept = 1, maxOut = 0, splitExact = true;
  for (const c of cells) {
    if (c.shifted) flag(c.call, `G10 ${c.key}: misregistered (fits the base better 1 px off)`);
    cellsQa[c.key as CellKey] = { route: route === 'none' ? 'diff' : c.posed ? 'posed' : 'ea2', provenance: c.call, area: c.area, ...(c.offset[0] || c.offset[1] ? { offset: c.offset } : {}), ...(c.keyKept != null ? { keyKept: +c.keyKept.toFixed(3) } : {}) };
    if (c.keyKept != null && c.keyKept < GATES.keyKept) flag(c.call, `G2 ${c.key} key kept ${c.keyKept.toFixed(3)}`);
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
  const handTrack = (id: 'hand_r' | 'hand_l', a: string, d: string) => rig.anchors?.[id]?.[a]?.[d as DirectionName];
  for (const [clip, cs] of byClip) {
    const [a, d] = clip.split('/'), areas = cs.map((c) => c.area), med = median(areas);
    const cvOf = (v: number[]) => { const m = v.reduce((s, x) => s + x, 0) / v.length; return m ? Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length) / m : 0; };
    // G5 allows the item area to vary as much as the body region it covers (legs crossing in a side walk: boots/pants)
    const cv = cvOf(areas), baseCv = cvOf(cs.map((c) => c.baseBand)), cvMax = Math.max(GATES.areaCV, baseCv + 0.05);
    const minRatio = med ? Math.min(...areas) / med : 0;
    if (!med) flag(cs[0].call, `G4 ${clip}: item missing`);
    else if (minRatio < GATES.areaRatio) flag(cs[0].call, `G4 ${clip}: min area ${(minRatio * 100).toFixed(0)} % of median`);
    if (cv > cvMax && !isAction(clip)) flag(cs[0].call, `G5 ${clip}: area CV ${cv.toFixed(2)} > ${cvMax.toFixed(2)}`);
    // placement: centroid spread relative to the slot anchor (info)
    const anc = slot.anchor ? rig.anchors?.[slot.anchor as 'head']?.[a]?.[d as DirectionName] : undefined;
    const rel = cs.map((c) => { const ct = centroid(c.mask, w), i = +c.key.split('/')[2]; return ct && anc?.[i] ? [ct[0] - anc[i][0], ct[1] - anc[i][1]] : null; }).filter(Boolean) as number[][];
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
      hand = r > l ? 'r' : l > r ? 'l' : '?';
    }
    // G9 (held): a rigid object keeps its shape frame to frame (S2/M3: a sword flipped from vertical to horizontal mid-walk)
    const ord = [...cs].sort((x, y) => +x.key.split('/')[2] - +y.key.split('/')[2]);
    const minIoU = Math.min(1, ...ord.map((c, i) => alignedIoU(c.mask, ord[(i + 1) % ord.length].mask, w)));
    if (slot.class === 'held' && minIoU < GATES.heldIoU && !isAction(clip)) flag(cs[0].call, `G9 ${clip}: shape jump (aligned IoU ${minIoU.toFixed(2)})`);
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
export const H4 = { own: 0.75, oppMargin: 0.1 };
/**
 * H4: a posed layer must look like its own direction's dressed keyframe layer. Rigid (head) items: own < 0.75 fails in every
 * view (S5: a visor on a back view; B7 live: a blade drawn into a helmet's slash frames); worn items (torso, back): front/back
 * review warning only (cloth deforms). Off for feet and held items. Thresholds from S5's labelled helmet run (good ≥ 0.93).
 */
export function dirGate(slot: Slot, cells: CellOut[], keys: Partial<Record<DirectionName, Img>>): { fails: Map<number, string[]>; warnings: string[] } {
  const fails = new Map<number, string[]>(), warnings: string[] = [];
  if (slot.class === 'held' || slot.id === 'feet') return { fails, warnings };
  for (const c of cells) {
    const dir = c.key.split('/')[1] as DirectionName, opp = OPP[dir];
    if (!c.posed || !keys[dir] || !c.area || (slot.class !== 'rigid' && !opp)) continue;
    const L = despeck(c.layer), occ = new Uint8Array(c.mask.length);
    for (let p = 0; p < occ.length; p++) occ[p] = c.out.data[p * 4 + 3] && !c.mask[p] ? 1 : 0;
    const own = simAligned(L, despeck(keys[dir]!), occ);
    if (own >= H4.own) continue;
    const other = opp && keys[opp] ? simAligned(L, despeck(keys[opp]!), occ) : 0;
    const why = `H4 ${c.key}: ${other >= own - H4.oppMargin ? 'looks like the opposite view' : 'does not match its keyframe (extra or missing parts)'} (own ${own.toFixed(2)}${opp ? `, opposite ${other.toFixed(2)}` : ''})`;
    if (slot.class === 'rigid') (fails.get(c.call) ?? (fails.set(c.call, []), fails.get(c.call)!)).push(why);
    else warnings.push(why);
  }
  return { fails, warnings };
}

// ---------- manifest Item ----------
/** Accepted item: layers (main, or fg + bg for slots with bgZ) with cell hashes for every selected anim × generated dir. */
export async function buildItem(o: {
  spec: ItemSpec; rig: Rig; cells: CellOut[]; route: Route; provenance: Provenance[]; qa: ItemQa; anchorCell?: string; dressed?: Partial<Record<DirectionName, Img>>;
}): Promise<{ item: Item; images: Map<Sha256, Img> }> {
  const { spec, rig, cells } = o, slot = slotOf(spec.slot), images = new Map<Sha256, Img>();
  const put = async (im: Img): Promise<Sha256 | null> => {
    if (!im.data.some((v, i) => i % 4 === 3 && v)) return null;
    const k = await cellHash(im);
    images.set(k, im);
    return k;
  };
  const layers: Layer[] = slot.bgZ != null
    ? [{ id: 'fg', role: 'fg', z: slot.z, cells: {} }, { id: 'bg', role: 'bg', z: slot.bgZ, cells: {} }]
    : [{ id: 'main', role: 'fg', z: slot.z, cells: {} }];
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
}
