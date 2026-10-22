// Minimal zip writer/reader: store (0) and deflate (8, via native CompressionStream 'deflate-raw'). No zip64, no encryption.

export interface ZipEntry { name: string; data: Uint8Array }

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function pipe(data: Uint8Array, t: CompressionStream): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t)).arrayBuffer());
}

// deflate: compress entries (PNG gains nothing, so callers usually leave it off).
export async function zip(entries: ZipEntry[], { deflate = false } = {}): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    let body = e.data, method = 0;
    if (deflate) {
      const d = await pipe(e.data, new CompressionStream('deflate-raw'));
      if (d.length < e.data.length) { body = d; method = 8; }
    }
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint16(12, 0x0021, true); // 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, e.data.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(14, 0x0021, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, e.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    parts.push(local, body);
    central.push(cen);
    offset += local.length + body.length;
  }
  const cenSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cenSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) { out.set(p, o); o += p.length; }
  return out;
}

export const MAX_ZIP_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED = 128 * 1024 * 1024;

/** Read bounded, ordinary ZIPs from a device. Verify sizes, paths and CRC before trusting any entry. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.length > MAX_ZIP_BYTES) throw new Error('Choose a ZIP smaller than 64 MB.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error('This file is not a supported ZIP archive.');
  const count = v.getUint16(end + 10, true), start = v.getUint32(end + 16, true), size = v.getUint32(end + 12, true);
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true) || count !== v.getUint16(end + 8, true) || count > 5000 || start + size > end) throw new Error('Split, ZIP64 or oversized archives are not supported.');
  const files = new Map<string, Uint8Array>();
  let at = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (at + 46 > start + size || v.getUint32(at, true) !== 0x02014b50) throw new Error('The ZIP directory is damaged.');
    const flags = v.getUint16(at + 8, true), method = v.getUint16(at + 10, true), crc = v.getUint32(at + 16, true);
    const packed = v.getUint32(at + 20, true), unpacked = v.getUint32(at + 24, true), len = v.getUint16(at + 28, true);
    const extra = v.getUint16(at + 30, true), comment = v.getUint16(at + 32, true), local = v.getUint32(at + 42, true);
    total += unpacked;
    if (total > MAX_EXPANDED || unpacked > MAX_ZIP_BYTES || flags & 1 || ![0, 8].includes(method)) throw new Error('This ZIP is too large, encrypted, or uses unsupported compression.');
    if (at + 46 + len + extra + comment > start + size || local + 30 > start || v.getUint32(local, true) !== 0x04034b50) throw new Error('The ZIP headers are damaged.');
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at + 46, at + 46 + len));
    if (!name || name.includes('\\') || name.startsWith('/') || name.includes(':') || name.split('/').some((s) => s === '..' || s === '.')) throw new Error('This ZIP contains an unsafe file path.');
    const body = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (body + packed > start) throw new Error('The ZIP file data is damaged.');
    const raw = bytes.subarray(body, body + packed);
    let data: Uint8Array;
    if (method === 0) data = raw;
    else {
      const reader = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks: Uint8Array[] = [];
      let n = 0;
      try {
        for (;;) { const r = await reader.read(); if (r.done) break; n += r.value.length; if (n > unpacked) throw new Error('The ZIP expands beyond its declared size.'); chunks.push(r.value); }
      } finally { await reader.cancel(); }
      data = new Uint8Array(n);
      let offset = 0;
      for (const c of chunks) { data.set(c, offset); offset += c.length; }
    }
    if (data.length !== unpacked || crc32(data) !== crc) throw new Error(`The ZIP entry ${name} is damaged.`);
    if (!name.endsWith('/')) { if (files.has(name)) throw new Error(`Duplicate ZIP entry: ${name}`); files.set(name, data); }
    at += 46 + len + extra + comment;
  }
  if (at !== start + size) throw new Error('The ZIP directory size is incorrect.');
  return files;
}

export async function selfTest() {
  const enc = new TextEncoder();
  console.assert(crc32(enc.encode('123456789')) === 0xcbf43926, 'crc32 check value');
  const files = [{ name: 'a.txt', data: enc.encode('hello hello hello hello') }, { name: 'dir/ü.bin', data: new Uint8Array([0, 1, 2, 255]) }];
  for (const deflate of [false, true]) {
    const z = await zip(files, { deflate }), v = new DataView(z.buffer, z.byteOffset, z.byteLength), e = z.length - 22;
    console.assert(v.getUint32(0, true) === 0x04034b50 && v.getUint32(e, true) === 0x06054b50 && v.getUint16(e + 10, true) === 2, `zip headers (deflate=${deflate})`);
    console.assert(v.getUint32(14, true) === crc32(files[0].data) && v.getUint16(8, true) === (deflate ? 8 : 0), `zip entry crc + method (deflate=${deflate})`);
  }
}
