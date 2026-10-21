// RGBA image helpers. Image = { w, h, d: Uint8ClampedArray (RGBA) } — same layout as browser ImageData.
// Only decode/encode use pngjs (node); in the browser swap those two for canvas getImageData/toBlob.
import { PNG } from 'pngjs';

export const make = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });
export const clone = im => ({ w: im.w, h: im.h, d: new Uint8ClampedArray(im.d) });
export function decode(bytes) {
  const p = PNG.sync.read(Buffer.from(bytes));
  return { w: p.width, h: p.height, d: new Uint8ClampedArray(p.data.buffer, p.data.byteOffset, p.data.length).slice() };
}
export function encode(im) {
  const p = new PNG({ width: im.w, height: im.h });
  p.data = Buffer.from(im.d.buffer, im.d.byteOffset, im.d.length);
  return PNG.sync.write(p);
}
export const fromB64 = b64 => decode(Buffer.from(b64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
export const toB64 = im => encode(im).toString('base64');

// Raw RGBA base64 (some PixelLab responses use type "rgba_bytes"): needs w,h.
export function fromRawB64(b64, w, h) { const b = Buffer.from(b64, 'base64'); return { w, h, d: new Uint8ClampedArray(b) }; }

// Source-over composite of top onto bottom (both same size), returns new image.
export function over(bottom, top) {
  const o = clone(bottom), a = o.d, b = top.d;
  for (let i = 0; i < a.length; i += 4) {
    const ta = b[i + 3] / 255; if (!ta) continue;
    const ba = a[i + 3] / 255, oa = ta + ba * (1 - ta);
    for (let c = 0; c < 3; c++) a[i + c] = Math.round((b[i + c] * ta + a[i + c] * ba * (1 - ta)) / oa);
    a[i + 3] = Math.round(oa * 255);
  }
  return o;
}

// Nearest-neighbour upscale.
export function scale(im, s) {
  const o = make(im.w * s, im.h * s);
  for (let y = 0; y < o.h; y++) for (let x = 0; x < o.w; x++) {
    const si = ((y / s | 0) * im.w + (x / s | 0)) * 4, di = (y * o.w + x) * 4;
    for (let c = 0; c < 4; c++) o.d[di + c] = im.d[si + c];
  }
  return o;
}

export function blit(dst, src, ox, oy) { // opaque copy (alpha-over onto dst)
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const dx = ox + x, dy = oy + y; if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
    const si = (y * src.w + x) * 4, di = (dy * dst.w + dx) * 4, a = src.d[si + 3] / 255;
    for (let c = 0; c < 3; c++) dst.d[di + c] = Math.round(src.d[si + c] * a + dst.d[di + c] * (1 - a));
    dst.d[di + 3] = 255;
  }
}

// Pad/crop to w,h anchored at given offset (no resampling).
export function canvasTo(im, w, h, ox = 0, oy = 0) { const o = make(w, h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const dx = x + ox, dy = y + oy; if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue; o.d.set(im.d.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (dy * w + dx) * 4); } return o; }

// Bounding box of alpha>0 pixels.
export function bbox(im, thr = 0) {
  let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.d[(y * im.w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export const opaqueCount = (im, thr = 0) => { let n = 0; for (let i = 3; i < im.d.length; i += 4) if (im.d[i] > thr) n++; return n; };

// Unique colour count among opaque pixels.
export function colors(im) { const s = new Set(); for (let i = 0; i < im.d.length; i += 4) if (im.d[i + 3] > 0) s.add((im.d[i] << 16) | (im.d[i + 1] << 8) | im.d[i + 2]); return s; }
