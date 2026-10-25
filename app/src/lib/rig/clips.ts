// Rig v1.3 clip helpers (architecture §3.1–3.2): the raw skeleton-v3 request shared by base and item poses, motion-smear
// cleanup, and the freeze gate. Pure over Img; the queue orchestration lives in studio/create.ts.
import { components } from '../image/chroma.ts';
import { binaryAlpha, makeImg, type Img } from '../image/png.ts';
import { feetY, opaqueBox } from './normalize.ts';
import { adherence, fromApi, hasAll, LABELS } from './poses.ts';
import { routes, png, type Direction, type Req } from '../pixellab/routes.ts';
import { DIRECTIONS, type DirectionName, type Keypoint } from './rig.ts';

// Previously saved aligned copies contain transformed pixels/rest poses, but their server character
// remains in its original coordinates. Keep those copies usable; no new alignment is suggested/applied.
export function managedMotionOffsets(character: { motionOffsets?: Partial<Record<DirectionName, number>> } | undefined, size: number): Partial<Record<DirectionName, number>> {
  const offsets = character?.motionOffsets ?? {};
  if (typeof offsets !== 'object' || Array.isArray(offsets)) throw new Error('The saved managed-motion alignment is invalid.');
  for (const [dir, dy] of Object.entries(offsets)) if (!DIRECTIONS.includes(dir as DirectionName) || !Number.isSafeInteger(dy) || Math.abs(dy!) > size) throw new Error('The saved managed-motion alignment is invalid.');
  return offsets;
}
export function shiftMotionPoses(poses: Keypoint[][], dy: number, size: number): Keypoint[][] {
  if (!Number.isSafeInteger(dy) || Math.abs(dy) > size) throw new Error('Invalid managed-motion alignment offset.');
  if (!dy) return poses;
  return poses.map(pose => pose.map(k => {
    const y = k.y + dy / size;
    if (!Number.isFinite(k.x) || !Number.isFinite(y) || k.x < 0 || k.x > 1 || y < 0 || y > 1) throw new Error('Managed motion: alignment moves a rig point outside its frame.');
    return { ...k, y };
  }));
}

/** The `action` label of a clip. Base frames and item poses send the same one (same request shape, S3). */
export const actionOf = (anim: string) => (anim.includes('idle') ? 'breathing idle' : anim.includes('walk') ? 'walking' : anim.includes('run') ? 'running' : anim);
export const loops = (anim: string) => /idle|walk|run/.test(anim);

/** Raw /animate-with-skeleton-v3: pose `first` (in pose `rest`) through `keypoints`; one output frame per entry. */
export const rawClip = (o: { first: string; rest: Keypoint[]; keypoints: Keypoint[][]; description: string; action: string; dir: Direction; seed: number; view?: 'low top-down' | 'high top-down' | 'side' }): Req =>
  routes.animateWithSkeletonV3({
    description: o.description, action: o.action, direction: o.dir, view: o.view ?? 'low top-down', first_frame: png(o.first),
    first_frame_keypoints: o.rest, keypoints: o.keypoints, seed: o.seed, no_background: true,
  });

/** Connectivity is evidence for review, not proof that detached hands, feet or details are unwanted. */
export function bodyComponents(img: Img): { count: number; detachedPixels: number } {
  const m = new Uint8Array(img.w * img.h);
  for (let p = 0; p < m.length; p++) m[p] = img.data[p * 4 + 3] ? 1 : 0;
  const comps = components(m, img.w, img.h).sort((a, b) => b.length - a.length);
  return { count: comps.length, detachedPixels: comps.slice(1).reduce((sum, c) => sum + c.length, 0) };
}

/** Reconstruct historical processed frames for offline audit/recovery. New generation retains detached pixels. */
export function largestComponent(src: Img): { img: Img; stray: number } {
  const img = binaryAlpha(src), m = new Uint8Array(img.w * img.h);
  for (let p = 0; p < m.length; p++) m[p] = img.data[p * 4 + 3] ? 1 : 0;
  const comps = components(m, img.w, img.h).sort((a, b) => b.length - a.length);
  let stray = 0;
  for (const c of comps.slice(1)) for (const p of c) { img.data.fill(0, p * 4, p * 4 + 4); stray++; }
  return { img, stray };
}

const rgbOf = (im: Img) => {
  const s = new Set<number>();
  for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) s.add((im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]);
  return [...s];
};
const near = (a: number, b: number, t: number) => Math.abs((a >> 16) - (b >> 16)) <= t && Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)) <= t && Math.abs((a & 255) - (b & 255)) <= t;
/** Share of opaque px whose color is within `tol` (max channel) of a rest-view color. */
export function paletteFit(rest: Img, frames: Img[], tol = 12): number {
  const ref = rgbOf(rest), memo = new Map<number, boolean>();
  let n = 0, ok = 0;
  for (const f of frames)
    for (let i = 0; i < f.data.length; i += 4) {
      if (!f.data[i + 3]) continue;
      const c = (f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2];
      let v = memo.get(c);
      if (v == null) memo.set(c, (v = ref.some((r) => near(c, r, tol))));
      n++;
      if (v) ok++;
    }
  return n ? ok / n : 1;
}
export const borderPx = (im: Img) => {
  let n = 0;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if ((x === 0 || y === 0 || x === im.w - 1 || y === im.h - 1) && im.data[(y * im.w + x) * 4 + 3]) n++;
  return n;
};

// Review thresholds only. Estimator error, silhouette extents, color changes and border contact cannot prove bad art.
export const RIG_GATES = { adherence: 2, silhouetteBottomDelta: 1, paletteFit: 0.97, border: 0 };
export interface ClipQa { adherence: number | null; feetDrift: number; paletteFit: number; border: number; stray: number; disconnectedPixels: number; fails: string[]; warnings: string[] }
/** `feetDrift` is the historical storage field for silhouette-bottom displacement, not measured foot contact/sliding. */
/** Shoulder width (character's left minus right, signed) of each frame relative to the standing pose, in front and back views. */
export function facingRatios(dir: string, rest: Keypoint[], frames: (Keypoint[] | undefined)[]): (number | null)[] {
  const width = (k?: Keypoint[]) => { const l = k?.find((p) => p.label === 'LEFT SHOULDER'), r = k?.find((p) => p.label === 'RIGHT SHOULDER'); return l && r ? l.x - r.x : null; };
  const w0 = width(rest);
  return frames.map((k) => { const w = width(k); return dir !== 'south' && dir !== 'north' || !w0 || w == null ? null : w / w0; });
}
/** Text-described moves can turn the body side-on (round 5, measured joints: a pixminimax slash south fell to 0.06 of the standing
 * shoulder width and a north one flipped sign; walk, idle, run and hurt stayed >= 0.85). Review threshold only. */
export const FACING_MIN = 0.5;
export function clipQa(o: { anim: string; rest: Img; frames: Img[]; requested?: Keypoint[][]; measured: (Keypoint[] | undefined)[]; stray: number; disconnectedPixels?: number; facing?: { dir: string; rest: Keypoint[] } }): ClipQa {
  const cell = { w: o.rest.w, h: o.rest.h };
  const complete = o.frames.length > 0 && o.measured.length === o.frames.length && o.measured.every(k => hasAll(k));
  const countMatches = !o.requested || o.requested.length === o.frames.length;
  const adh = o.requested && complete && countMatches ? adherence(o.requested.map((k) => fromApi(k, cell)), o.measured.map((k) => k && fromApi(k, cell))) : null;
  const feet = Math.max(0, ...o.frames.map((f) => Math.abs(feetY(f) - feetY(o.rest))));
  const fit = paletteFit(o.rest, o.frames), border = o.frames.reduce((s, f) => s + borderPx(f), 0);
  const ratios = o.facing ? facingRatios(o.facing.dir, o.facing.rest, o.measured) : [], turned = ratios.flatMap((r, i) => (r != null && r < FACING_MIN ? [i + 1] : []));
  const fails = [
    (!o.frames.length || o.frames.some(f => !opaqueBox(f))) && 'empty animation frame',
    !complete && 'missing or invalid frame joints',
    !countMatches && 'requested pose count does not match frames',
  ].filter((s): s is string => !!s);
  const warnings = [
    adh !== null && adh > RIG_GATES.adherence && `estimated arm-joint difference ${adh.toFixed(1)} px from requested pose; review`,
    feet > RIG_GATES.silhouetteBottomDelta && `silhouette bottom differs up to ${feet} px from standing reference`,
    fit < RIG_GATES.paletteFit && `palette similarity ${fit.toFixed(3)}; review shading`,
    border > RIG_GATES.border && `${border} opaque pixels touch the frame border; check framing`,
    (o.disconnectedPixels ?? 0) > 0 && `${o.disconnectedPixels} disconnected pixels retained; review details`,
    turned.length > 0 && `the body turns side-on or falls in frame${turned.length > 1 ? 's' : ''} ${turned.join(', ')} (shoulders down to ${Math.max(0, Math.round(100 * Math.min(...ratios.filter((r): r is number => r != null))))} % of the standing width); check that it still faces ${o.facing!.dir}`,
  ].filter((s): s is string => !!s);
  return { adherence: adh === null ? null : +adh.toFixed(2), feetDrift: feet, paletteFit: +fit.toFixed(3), border, stray: o.stray, disconnectedPixels: o.disconnectedPixels ?? 0, fails, warnings };
}

/** Balanced batches respect skeleton-v3's maximum; one/two-frame clips repeat their last pose to the minimum of three. */
export function poseBatches(cells: number): { start: number; count: number }[] {
  const n = Math.ceil(cells / 15), size = Math.floor(cells / n), extra = cells % n;
  let start = 0;
  return Array.from({ length: n }, (_, i) => { const count = size + (i < extra ? 1 : 0), out = { start, count }; start += count; return out; });
}
/** Raw skeleton-v3 price of one call: 3 frames 2 gens, up to 12 frames 3 (measured, round 4), 15 frames 4 (docs). */
export const poseCallGens = (frames: number) => frames <= 3 ? 2 : frames <= 12 ? 3 : 4;
/** Gens to pose `cells` frames in poseBatches calls. */
export const poseGensFor = (cells: number) => poseBatches(cells).reduce((sum, b) => sum + poseCallGens(b.count), 0);
export const paddedPoses = (poses: Keypoint[][]): Keypoint[][] => poses.length >= 3 ? poses : [...poses, ...Array.from({ length: 3 - poses.length }, () => poses.at(-1)!)];

export function selfTest() {
  const im = makeImg(8, 8);
  for (let y = 2; y < 7; y++) for (let x = 3; x < 5; x++) im.data.set([100, 100, 100, 255], (y * 8 + x) * 4);
  im.data.set([200, 0, 0, 255], (1 * 8 + 7) * 4); // detached speck (touches the border)
  im.data.set([9, 9, 9, 90], 0); // semi-alpha, binarized away
  const original = im.data.slice(), parts = bodyComponents(im);
  console.assert(parts.count === 3 && parts.detachedPixels === 2 && im.data.every((v, i) => v === original[i]), 'body connectivity inspection never erases pixels');
  const clean = makeImg(8, 8); clean.data.set(im.data); clean.data.fill(0, (1 * 8 + 7) * 4, (1 * 8 + 7) * 4 + 4); clean.data.fill(0, 0, 4);
  console.assert(paletteFit(clean, [clean]) === 1 && paletteFit(clean, [im]) < 1, 'paletteFit');
  const k = LABELS.map(label => ({ label, x: 0.5, y: 0.5 })), k2 = k.map(p => ({ ...p, y: 0.8 })); // joints 2.4 px apart on 8 px
  const ok = clipQa({ anim: 'slash', rest: clean, frames: [clean], requested: [k], measured: [k], stray: 0 });
  const bad = clipQa({ anim: 'slash', rest: clean, frames: [im], requested: [k], measured: [k2], stray: 0 });
  console.assert(!ok.fails.length && ok.adherence === 0, `clean clip passes: ${ok.fails}`);
  console.assert(bad.fails.length === 0 && bad.warnings.length === 3 && bad.adherence === 2.4 && bad.border === 2, `observations: ${bad.warnings} ${bad.adherence} ${bad.border}`);
  console.assert(actionOf('walk') === 'walking' && actionOf('slash') === 'slash' && loops('idle') && !loops('slash'), 'clip kinds');
}
