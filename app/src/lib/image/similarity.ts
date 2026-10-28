import type { Img } from './png.ts';

export const centroid = (m: Uint8Array, w: number): [number, number] | null => {
  let n = 0, sx = 0, sy = 0;
  for (let p = 0; p < m.length; p++) if (m[p]) { n++; sx += p % w; sy += (p / w) | 0; }
  return n ? [sx / n, sy / n] : null;
};

export const maskOf = (im: Img) => { const m = new Uint8Array(im.w * im.h); for (let p = 0; p < m.length; p++) m[p] = im.data[p * 4 + 3] ? 1 : 0; return m; };

/** Appearance similarity of layer A to keyframe layer K after centroid alignment (±1 px): over the union of both masks a pixel
 * scores 1 − maxChannelDiff/128 when both are opaque, 0 when only one is; K px landing on `occ` (visible mannequin) are skipped.
 * Optional `shift` maps layer coordinates to keyframe coordinates using stored joints instead of a partial mask's centroid. */
export function simAligned(A: Img, K: Img, occ?: Uint8Array, shift?: [number, number]): number {
  const { w, h } = A, a = maskOf(A), b = maskOf(K), ca = centroid(a, w), cb = centroid(b, w);
  if (!ca || !cb) return 0;
  let best = 0;
  for (let ey = -1; ey <= 1; ey++)
    for (let ex = -1; ex <= 1; ex++) {
      const dx = (shift?.[0] ?? Math.round(cb[0] - ca[0])) + ex, dy = (shift?.[1] ?? Math.round(cb[1] - ca[1])) + ey;
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
