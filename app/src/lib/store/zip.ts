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

async function pipe(data: Uint8Array, t: CompressionStream | DecompressionStream): Promise<Uint8Array> {
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

export async function unzip(buf: Uint8Array): Promise<ZipEntry[]> {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = buf.length - 22;
  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('zip: no end of central directory');
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error('zip: bad central header');
    const method = v.getUint16(p + 10, true);
    const crc = v.getUint32(p + 16, true);
    const csize = v.getUint32(p + 20, true);
    const nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true);
    const lho = v.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
    const raw = buf.subarray(start, start + csize);
    const data = method === 0 ? raw.slice() : method === 8 ? await pipe(raw, new DecompressionStream('deflate-raw')) : null;
    if (!data) throw new Error(`zip: unsupported method ${method} (${name})`);
    if (crc32(data) !== crc) throw new Error(`zip: crc mismatch (${name})`);
    out.push({ name, data });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

export async function selfTest() {
  const enc = new TextEncoder();
  console.assert(crc32(enc.encode('123456789')) === 0xcbf43926, 'crc32 check value');
  const files = [{ name: 'a.txt', data: enc.encode('hello hello hello hello') }, { name: 'dir/ü.bin', data: new Uint8Array([0, 1, 2, 255]) }];
  for (const deflate of [false, true]) {
    const back = await unzip(await zip(files, { deflate }));
    console.assert(back.length === 2 && back[0].name === 'a.txt' && back[1].name === 'dir/ü.bin', `unzip names (deflate=${deflate})`);
    console.assert(new TextDecoder().decode(back[0].data) === 'hello hello hello hello' && back[1].data.join() === '0,1,2,255', `unzip data (deflate=${deflate})`);
  }
}
