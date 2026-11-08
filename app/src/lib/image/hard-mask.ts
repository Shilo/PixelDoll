import type { Img } from './png.ts';

/** PixelLab hard-mask permission: opaque white edits, opaque black preserves. */
export function hardMaskBits(image: Img): Uint8Array {
	const bits = new Uint8Array(image.w * image.h);
	for (let p = 0; p < bits.length; p++) {
		const i = p * 4,
			v = image.data[i];
		if (
			image.data[i + 3] !== 255 ||
			(v !== 0 && v !== 255) ||
			image.data[i + 1] !== v ||
			image.data[i + 2] !== v
		) {
			throw new Error('Edit masks must be opaque binary hard masks.');
		}
		bits[p] = v === 255 ? 1 : 0;
	}
	return bits;
}
