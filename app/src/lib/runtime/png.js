// Exact PNG decoding (8-bit RGB/RGBA, non-interlaced: every PNG PixelDoll writes) to straight RGBA. Canvas readback
// premultiplies alpha and changes the RGB of translucent pixels, so exact palette lookups decode the file itself.
/** @typedef {import('./types.d.ts').Img} PngImg */

/** @param {Uint8Array} b @param {number} [limit] the largest side accepted, so junk bytes never allocate w*h*4 @returns {Promise<PngImg>} */
export async function decodePngBytes(b, limit = 4096) {
	const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
	if (b.length < 33 || v.getUint32(0) !== 0x89504e47 || v.getUint32(12) !== 0x49484452)
		throw new Error('png: not a PNG');
	const w = v.getUint32(16),
		h = v.getUint32(20),
		depth = b[24],
		type = b[25];
	if (!w || !h || w > limit || h > limit) throw new Error(`png: size ${w}x${h} out of range`);
	if (depth !== 8 || (type !== 6 && type !== 2) || b[28])
		throw new Error(`png: only 8-bit RGB/RGBA non-interlaced (depth ${depth}, type ${type})`);
	/** @type {Uint8Array[]} */
	const idat = [];
	for (let p = 8; p < b.length;) {
		if (p + 12 > b.length) throw new Error('png: truncated chunk');
		const len = v.getUint32(p),
			t = String.fromCharCode(...b.subarray(p + 4, p + 8));
		if (p + 12 + len > b.length) throw new Error('png: truncated chunk data');
		if (t === 'IDAT') idat.push(b.subarray(p + 8, p + 8 + len));
		p += 12 + len;
	}
	const z = new Uint8Array(idat.reduce((n, c) => n + c.length, 0));
	idat.reduce((o, c) => (z.set(c, o), o + c.length), 0);
	const bpp = type === 6 ? 4 : 3,
		stride = w * bpp;
	const raw = new Uint8Array((stride + 1) * h);
	const reader = new Blob([z]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
	let count = 0;
	try {
		for (;;) {
			const r = await reader.read();
			if (r.done) break;
			if (count + r.value.length > raw.length)
				throw new Error('png: inflated data exceeds image dimensions');
			raw.set(r.value, count);
			count += r.value.length;
		}
	} finally {
		await reader.cancel();
	}
	if (count !== raw.length) throw new Error('png: incomplete image data');
	const px = new Uint8Array(stride * h);
	for (let y = 0; y < h; y++) {
		const f = raw[y * (stride + 1)],
			src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)),
			o = y * stride;
		if (f > 4) throw new Error('png: invalid row filter');
		for (let x = 0; x < stride; x++) {
			const a = x >= bpp ? px[o + x - bpp] : 0,
				up = y ? px[o + x - stride] : 0,
				c = x >= bpp && y ? px[o + x - stride - bpp] : 0;
			const pred =
				f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : pngPaeth(a, up, c);
			px[o + x] = (src[x] + pred) & 0xff;
		}
	}
	const data = new Uint8ClampedArray(w * h * 4);
	if (bpp === 4) data.set(px);
	else
		for (let i = 0, j = 0; i < px.length; i += 3, j += 4)
			data.set([px[i], px[i + 1], px[i + 2], 255], j);
	return { w, h, data };
}

/** @param {number} a @param {number} b @param {number} c */
function pngPaeth(a, b, c) {
	const p = a + b - c,
		pa = Math.abs(p - a),
		pb = Math.abs(p - b),
		pc = Math.abs(p - c);
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
