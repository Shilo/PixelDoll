// estimate-skeleton keypoints -> anchors, refined by patch tracking on the frozen base (architecture §5.3).
import type { Img } from '../image/png.ts';
import type { AnchorId } from './rig.ts';

export interface Kp { x: number; y: number; z: number } // continuous pixel coords (0..w)
export type Skeleton = Record<string, Kp>; // PixelLab label ("NOSE", "RIGHT ARM", ...) -> point
export type Anchors = Partial<Record<AnchorId, [number, number]>>; // pixel index [col, row]

/** API keypoints are normalized 0-1 (S1); labels are the character's left/right. */
export const parseSkeleton = (kps: { x: number; y: number; label: string; z_index: number }[], w: number, h: number): Skeleton =>
  Object.fromEntries(kps.map((k) => [k.label, { x: k.x * w, y: k.y * h, z: k.z_index }]));

// ponytail: labels are kept on flip, so a mirrored direction's hand_r is the flipped source hand_r (handedness flips with the pixels, §2).
export const flipSkeleton = (s: Skeleton, w: number): Skeleton =>
  Object.fromEntries(Object.entries(s).map(([l, k]) => [l, { ...k, x: w - k.x }]));

const SOURCES: Record<AnchorId, string[]> = {
  head: ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'],
  neck: ['NECK'],
  hand_r: ['RIGHT ARM'], // "ARM" = wrist end of the arm chain
  hand_l: ['LEFT ARM'],
  hip: ['LEFT HIP', 'RIGHT HIP'],
  foot_r: ['RIGHT LEG'], // "LEG" = ankle end
  foot_l: ['LEFT LEG'],
};
export function anchorsOf(s: Skeleton): Anchors {
  const out: Anchors = {};
  for (const [id, labels] of Object.entries(SOURCES) as [AnchorId, string[]][]) {
    const ks = labels.map((l) => s[l]).filter(Boolean);
    if (ks.length) out[id] = [Math.floor(ks.reduce((n, k) => n + k.x, 0) / ks.length), Math.floor(ks.reduce((n, k) => n + k.y, 0) / ks.length)];
  }
  return out;
}

/** Patch half-size per anchor: head 13x13, the rest 9x9. */
export const PATCH_R: Record<AnchorId, number> = { head: 6, neck: 4, hand_r: 4, hand_l: 4, hip: 4, foot_r: 4, foot_l: 4 };

/**
 * Integer translation d (|d - seed| <= R per axis) minimizing the SAD (premultiplied RGB + alpha) between the patch of A
 * centred at p and B shifted by d. Ties go to the shift closest to seed. sad = mean per patch pixel.
 */
export function trackPatch(A: Img, B: Img, p: [number, number], r: number, seed: [number, number] = [0, 0], R = 4): { d: [number, number]; sad: number } {
  const px = (im: Img, x: number, y: number, c: number) => {
    if (x < 0 || y < 0 || x >= im.w || y >= im.h) return 0; // outside = transparent
    const i = (y * im.w + x) * 4;
    return c < 3 ? (im.data[i + c] * im.data[i + 3]) / 255 : im.data[i + 3];
  };
  let best = { d: [0, 0] as [number, number], sad: Infinity, dist: Infinity };
  for (let dy = seed[1] - R; dy <= seed[1] + R; dy++)
    for (let dx = seed[0] - R; dx <= seed[0] + R; dx++) {
      let s = 0;
      for (let y = p[1] - r; y <= p[1] + r; y++)
        for (let x = p[0] - r; x <= p[0] + r; x++)
          for (let c = 0; c < 4; c++) s += Math.abs(px(A, x, y, c) - px(B, x + dx, y + dy, c));
      const dist = Math.abs(dx - seed[0]) + Math.abs(dy - seed[1]);
      if (s < best.sad || (s === best.sad && dist < best.dist)) best = { d: [dx, dy], sad: s, dist };
    }
  return { d: best.d, sad: best.sad / (2 * r + 1) ** 2 };
}

/** Anchor in `cell`: keyframe anchor + tracked translation, search seeded by the cell's own keypoint anchor. */
export function refineAnchor(key: Img, keyAt: [number, number], cell: Img, seedAt: [number, number] | undefined, r: number) {
  const seed: [number, number] = seedAt ? [seedAt[0] - keyAt[0], seedAt[1] - keyAt[1]] : [0, 0];
  const t = trackPatch(key, cell, keyAt, r, seed);
  return { at: [keyAt[0] + t.d[0], keyAt[1] + t.d[1]] as [number, number], sad: t.sad };
}

export function selfTest() {
  const s = parseSkeleton([{ x: 0.5, y: 0.25, label: 'NOSE', z_index: 0 }, { x: 0.25, y: 0.5, label: 'LEFT HIP', z_index: -1 }, { x: 0.75, y: 0.5, label: 'RIGHT HIP', z_index: -1 }], 64, 64);
  console.assert(s.NOSE.x === 32 && s.NOSE.y === 16, 'parseSkeleton scales 0-1 to px');
  const a = anchorsOf(s);
  console.assert(a.head?.join() === '32,16' && a.hip?.join() === '32,32' && !a.hand_r, `anchorsOf ${JSON.stringify(a)}`);
  console.assert(flipSkeleton(s, 64)['LEFT HIP'].x === 48, 'flipSkeleton');
  // textured blob moved by (+2, -1)
  const mk = (ox: number, oy: number): Img => {
    const im = { w: 32, h: 32, data: new Uint8ClampedArray(32 * 32 * 4) };
    for (let y = 0; y < 7; y++) for (let x = 0; x < 6; x++) im.data.set([x * 40, y * 30, (x * y * 13) % 255, 255], ((12 + oy + y) * 32 + 12 + ox + x) * 4);
    return im;
  };
  const A = mk(0, 0), B = mk(2, -1);
  const t = trackPatch(A, B, [14, 15], 4);
  console.assert(t.d.join() === '2,-1' && t.sad === 0, `trackPatch ${t.d} sad ${t.sad}`);
  const far = mk(6, 0); // outside ±4 unless seeded
  console.assert(refineAnchor(A, [14, 15], far, [20, 15], 4).at.join() === '20,15', 'seeded search reaches beyond ±4');
}
