// Rig v1.3 clip helpers (architecture §3.1–3.2): the raw skeleton-v3 request shared by base and item poses, motion-smear
// cleanup, and the freeze gate. Pure over Img; the queue orchestration lives in studio/create.ts.
import { components } from '../image/chroma.ts';
import { binaryAlpha, makeImg, type Img } from '../image/png.ts';
import { feetY, opaqueBox } from './normalize.ts';
import { adherence, fromApi, hasAll, LABELS } from './poses.ts';
import { routes, png, type Direction, type Req } from '../pixellab/routes.ts';
import type { Keypoint } from './rig.ts';

/** The `action` label of a clip. Base frames and item poses send the same one (same request shape, S3). */
export const actionOf = (anim: string) => (anim.includes('idle') ? 'breathing idle' : anim.includes('walk') ? 'walking' : anim.includes('run') ? 'running' : anim);
/** Standing clips are held to the feet-drift gate; locomotion strides and falls are not. */
export const standing = (anim: string) => !/walk|run|death|fall/.test(anim);
export const loops = (anim: string) => /idle|walk|run/.test(anim);

/** Raw /animate-with-skeleton-v3: pose `first` (in pose `rest`) through `keypoints`; one output frame per entry. */
export const rawClip = (o: { first: string; rest: Keypoint[]; keypoints: Keypoint[][]; description: string; action: string; dir: Direction; seed: number; view?: 'low top-down' | 'high top-down' | 'side' }): Req =>
  routes.animateWithSkeletonV3({
    description: o.description, action: o.action, direction: o.dir, view: o.view ?? 'low top-down', first_frame: png(o.first),
    first_frame_keypoints: o.rest, keypoints: o.keypoints, seed: o.seed, no_background: true,
  });

/** Binary alpha + keep only the largest 8-connected component (skeleton-v3 adds detached motion smears, S3). */
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
/** Share of opaque px whose colour is within `tol` (max channel) of a rest-view colour. */
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

export const RIG_GATES = { adherence: 2, adherenceLying: 3, feetDrift: 1, paletteFit: 0.97, border: 0 };
export interface ClipQa { adherence: number | null; feetDrift: number; paletteFit: number; border: number; stray: number; fails: string[] }
/** Freeze gate (architecture §3.2) for one clip-direction: requested vs re-estimated arms, feet, palette, cell border. */
export function clipQa(o: { anim: string; rest: Img; frames: Img[]; requested?: Keypoint[][]; measured: (Keypoint[] | undefined)[]; stray: number }): ClipQa {
  const cell = { w: o.rest.w, h: o.rest.h };
  const complete = o.frames.length > 0 && o.measured.length === o.frames.length && o.measured.every(k => hasAll(k));
  const countMatches = !o.requested || o.requested.length === o.frames.length;
  const adh = o.requested && complete && countMatches ? adherence(o.requested.map((k) => fromApi(k, cell)), o.measured.map((k) => k && fromApi(k, cell))) : null;
  const feet = Math.max(0, ...o.frames.map((f) => Math.abs(feetY(f) - feetY(o.rest))));
  const fit = paletteFit(o.rest, o.frames), border = o.frames.reduce((s, f) => s + borderPx(f), 0);
  const maxAdh = /death|fall/.test(o.anim) ? RIG_GATES.adherenceLying : RIG_GATES.adherence;
  const fails = [
    (!o.frames.length || o.frames.some(f => !opaqueBox(f))) && 'empty animation frame',
    !complete && 'missing or invalid frame joints',
    !countMatches && 'requested pose count does not match frames',
    adh !== null && adh > maxAdh && `arms ${adh.toFixed(1)} px off the requested pose`,
    standing(o.anim) && feet > RIG_GATES.feetDrift && `feet drift ${feet} px`,
    fit < RIG_GATES.paletteFit && `palette fit ${fit.toFixed(3)}`,
    border > RIG_GATES.border && `${border} px on the cell border`,
  ].filter((s): s is string => !!s);
  return { adherence: adh === null ? null : +adh.toFixed(2), feetDrift: feet, paletteFit: +fit.toFixed(3), border, stray: o.stray, fails };
}

/** Balanced batches respect skeleton-v3's maximum; one/two-frame clips repeat their last pose to the minimum of three. */
export function poseBatches(cells: number): { start: number; count: number }[] {
  const n = Math.ceil(cells / 15), size = Math.floor(cells / n), extra = cells % n;
  let start = 0;
  return Array.from({ length: n }, (_, i) => { const count = size + (i < extra ? 1 : 0), out = { start, count }; start += count; return out; });
}
export const paddedPoses = (poses: Keypoint[][]): Keypoint[][] => poses.length >= 3 ? poses : [...poses, ...Array.from({ length: 3 - poses.length }, () => poses.at(-1)!)];

export function selfTest() {
  const im = makeImg(8, 8);
  for (let y = 2; y < 7; y++) for (let x = 3; x < 5; x++) im.data.set([100, 100, 100, 255], (y * 8 + x) * 4);
  im.data.set([200, 0, 0, 255], (1 * 8 + 7) * 4); // detached speck (touches the border)
  im.data.set([9, 9, 9, 90], 0); // semi-alpha, binarized away
  const r = largestComponent(im);
  console.assert(r.stray === 1 && r.img.data[(1 * 8 + 7) * 4 + 3] === 0 && r.img.data[(2 * 8 + 3) * 4 + 3] === 255 && borderPx(r.img) === 0 && borderPx(im) === 2, `largestComponent stray ${r.stray}`);
  console.assert(paletteFit(r.img, [r.img]) === 1 && paletteFit(r.img, [im]) < 1, 'paletteFit');
  const k = LABELS.map(label => ({ label, x: 0.5, y: 0.5 })), k2 = k.map(p => ({ ...p, y: 0.8 })); // joints 2.4 px apart on 8 px
  const ok = clipQa({ anim: 'slash', rest: r.img, frames: [r.img], requested: [k], measured: [k], stray: 0 });
  const bad = clipQa({ anim: 'slash', rest: r.img, frames: [im], requested: [k], measured: [k2], stray: 0 });
  console.assert(!ok.fails.length && ok.adherence === 0, `clean clip passes: ${ok.fails}`);
  console.assert(bad.fails.length === 3 && bad.adherence === 2.4 && bad.border === 2, `gates: ${bad.fails} ${bad.adherence} ${bad.border}`);
  console.assert(actionOf('walk') === 'walking' && actionOf('slash') === 'slash' && standing('idle') && !standing('walk') && loops('idle') && !loops('slash'), 'clip kinds');
}
