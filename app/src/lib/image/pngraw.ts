// Pure PNG encode/decode (RGBA8 / RGB8, non-interlaced) via CompressionStream 'deflate' (zlib). Runs in browser and node,
// so export scripts and selftests share the browser code path. png.ts (canvas) stays for arbitrary input images.
import { crc32 } from '../store/zip.ts';
import type { Img } from './png.ts';

const pipe = async (data: Uint8Array, t: CompressionStream | DecompressionStream) =>
  new Uint8Array(await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t)).arrayBuffer());

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

// ponytail: filter type 0 on every row; add Sub/Paeth if sheet sizes ever matter.
export async function encodePngBytes(im: Img): Promise<Uint8Array> {
  const stride = im.w * 4;
  const raw = new Uint8Array((stride + 1) * im.h);
  for (let y = 0; y < im.h; y++) raw.set(im.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, im.w);
  v.setUint32(4, im.h);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', await pipe(raw, new CompressionStream('deflate'))), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function decodePngBytes(b: Uint8Array): Promise<Img> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length < 33 || v.getUint32(0) !== 0x89504e47 || v.getUint32(12) !== 0x49484452) throw new Error('png: not a PNG');
  const w = v.getUint32(16), h = v.getUint32(20), depth = b[24], type = b[25];
  if (!w || !h || w > 4096 || h > 4096) throw new Error(`png: size ${w}x${h} out of range`); // never allocate w*h*4 from junk bytes
  if (depth !== 8 || (type !== 6 && type !== 2) || b[28]) throw new Error(`png: only 8-bit RGB/RGBA non-interlaced (depth ${depth}, type ${type})`);
  const idat: Uint8Array[] = [];
  for (let p = 8; p < b.length; ) {
    const len = v.getUint32(p), t = String.fromCharCode(...b.subarray(p + 4, p + 8));
    if (t === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
    p += 12 + len;
  }
  const z = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
  idat.reduce((o, c) => (z.set(c, o), o + c.length), 0);
  const raw = await pipe(z, new DecompressionStream('deflate'));
  const bpp = type === 6 ? 4 : 3, stride = w * bpp;
  const px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, up = y ? px[o + x - stride] : 0, c = x >= bpp && y ? px[o + x - stride - bpp] : 0;
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : paeth(a, up, c);
      px[o + x] = (src[x] + pred) & 0xff;
    }
  }
  const data = new Uint8ClampedArray(w * h * 4);
  if (bpp === 4) data.set(px);
  else for (let i = 0, j = 0; i < px.length; i += 3, j += 4) data.set([px[i], px[i + 1], px[i + 2], 255], j);
  return { w, h, data };
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export async function selfTest() {
  const im: Img = { w: 3, h: 2, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 128]) };
  const back = await decodePngBytes(await encodePngBytes(im));
  console.assert(back.w === 3 && back.h === 2 && back.data.join() === im.data.join(), 'pngraw roundtrip');
}
