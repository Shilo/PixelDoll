// Source frame -> rig cell: centre-align canvases, crop/pad (never rescale), binary alpha. Plus bbox / pivot / feet line.
import { binaryAlpha, makeImg, type Img } from '../image/png.ts';

export interface Box { x0: number; y0: number; x1: number; y1: number } // inclusive pixel indices
export interface Normalized {
  img: Img;
  offset: [number, number]; // where source (0,0) landed in the cell
  cutPx: number; // opaque source px that fell outside the cell (> 0 = crop failure)
  semiAlpha: number; // source px with 0 < alpha < 255 (before binarization)
}

// ponytail: canvas-centre alignment only (identity for 64 -> 64). Shift-to-fit for off-centre larger canvases if a route needs it.
export function normalize(src: Img, w: number, h: number, thr = 128): Normalized {
  const ox = Math.floor((w - src.w) / 2), oy = Math.floor((h - src.h) / 2);
  const out = makeImg(w, h);
  let cutPx = 0, semiAlpha = 0;
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4, a = src.data[i + 3];
      if (a > 0 && a < 255) semiAlpha++;
      const dx = x + ox, dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) { if (a >= thr) cutPx++; continue; }
      out.data.set(src.data.subarray(i, i + 4), (dy * w + dx) * 4);
    }
  return { img: binaryAlpha(out, thr), offset: [ox, oy], cutPx, semiAlpha };
}

export function opaqueBox(im: Img): Box | null {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (im.data[(y * im.w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Feet line in pixel-edge coords = bottom edge of the lowest opaque row. */
export const feetY = (im: Img) => (opaqueBox(im)?.y1 ?? im.h - 1) + 1;
/** Rig pivot from the reference cell (idle/south/0): x = w/2, y = feet line. */
export const pivotOf = (im: Img) => ({ x: im.w / 2, y: feetY(im) });

export function selfTest() {
  const src = makeImg(6, 6);
  src.data.set([9, 9, 9, 255], (4 * 6 + 2) * 4); // opaque at (2,4)
  src.data.set([9, 9, 9, 100], (1 * 6 + 1) * 4); // semi, below threshold
  const n = normalize(src, 4, 4);
  console.assert(n.offset.join() === '-1,-1' && n.cutPx === 0 && n.semiAlpha === 1, `crop offset ${n.offset} cut ${n.cutPx}`);
  console.assert(n.img.data[(3 * 4 + 1) * 4 + 3] === 255 && n.img.data[3] === 0, 'pixel moved by offset, semi alpha dropped');
  const big = normalize(src, 2, 2);
  console.assert(big.cutPx === 1, 'crop cutting opaque px is reported');
  const pad = normalize(makeImg(2, 2), 4, 4);
  console.assert(pad.offset.join() === '1,1' && pad.img.w === 4, 'pad centres');
  console.assert(JSON.stringify(opaqueBox(n.img)) === '{"x0":1,"y0":3,"x1":1,"y1":3}' && opaqueBox(makeImg(2, 2)) === null, 'opaqueBox');
  const p = pivotOf(n.img);
  console.assert(p.x === 2 && p.y === 4, `pivot ${p.x},${p.y}`);
}
