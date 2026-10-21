// PNG decode/encode in the browser (createImageBitmap + OffscreenCanvas). Image layout = ImageData (RGBA, row-major).

export interface Img { w: number; h: number; data: Uint8ClampedArray }

export const makeImg = (w: number, h: number): Img => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });

export async function decodePng(src: Blob | Uint8Array): Promise<Img> {
  const blob = src instanceof Blob ? src : new Blob([src as Uint8Array<ArrayBuffer>], { type: 'image/png' });
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  return { w: c.width, h: c.height, data: g.getImageData(0, 0, c.width, c.height).data };
}

// ponytail: canvas encode un-premultiplies, which is lossy for semi-alpha; fine because cells are binary alpha.
export async function encodePng(im: Img): Promise<Blob> {
  const c = new OffscreenCanvas(im.w, im.h);
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0);
  return c.convertToBlob({ type: 'image/png' });
}

// alpha >= thr -> 255 (RGB kept), else 0/0/0/0. Returns a new image.
export function binaryAlpha(im: Img, thr = 128): Img {
  const d = new Uint8ClampedArray(im.data);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] >= thr) d[i + 3] = 255;
    else d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
  }
  return { w: im.w, h: im.h, data: d };
}

// Width/height from the IHDR chunk, without decoding.
export function pngSize(b: Uint8Array): { w: number; h: number } | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64.replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function bytesToBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function selfTestNode() {
  const im = binaryAlpha({ w: 2, h: 1, data: new Uint8ClampedArray([10, 20, 30, 127, 10, 20, 30, 128]) });
  console.assert(im.data.join() === '0,0,0,0,10,20,30,255', 'binaryAlpha');
  console.assert(bytesToBase64(base64ToBytes('iVBORw0KGgo=')) === 'iVBORw0KGgo=', 'base64 roundtrip');
  const ihdr = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 92]);
  console.assert(pngSize(ihdr)?.w === 64 && pngSize(ihdr)?.h === 92, 'pngSize');
}

export async function selfTest() {
  selfTestNode();
  const src = makeImg(3, 2);
  src.data.set([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255]);
  const back = await decodePng(await encodePng(src));
  console.assert(back.w === 3 && back.h === 2 && back.data.join() === src.data.join(), 'png roundtrip exact');
}
