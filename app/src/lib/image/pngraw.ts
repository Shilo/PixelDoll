// Pure PNG encode/decode (RGBA8 / RGB8, non-interlaced) via CompressionStream 'deflate' (zlib). Runs in browser and node,
// so export scripts and selftests share the browser code path. png.ts (canvas) stays for arbitrary input images.
import { crc32 } from '../store/zip.ts';
import type { Img } from './png.ts';
import { decodePngBytes } from '../runtime/png.js';

export { decodePngBytes };

const pipe = async (data: Uint8Array, t: CompressionStream | DecompressionStream) =>
	new Uint8Array(
		await new Response(
			new Blob([data as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t)
		).arrayBuffer()
	);

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
	for (let y = 0; y < im.h; y++)
		raw.set(im.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
	const ihdr = new Uint8Array(13);
	const v = new DataView(ihdr.buffer);
	v.setUint32(0, im.w);
	v.setUint32(4, im.h);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const parts = [
		new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', await pipe(raw, new CompressionStream('deflate'))),
		chunk('IEND', new Uint8Array())
	];
	const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
	let o = 0;
	for (const p of parts) {
		out.set(p, o);
		o += p.length;
	}
	return out;
}

export async function selfTest() {
	const im: Img = {
		w: 3,
		h: 2,
		data: new Uint8ClampedArray([
			255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 128
		])
	};
	const back = await decodePngBytes(await encodePngBytes(im));
	console.assert(
		back.w === 3 && back.h === 2 && back.data.join() === im.data.join(),
		'pngraw roundtrip'
	);
}
