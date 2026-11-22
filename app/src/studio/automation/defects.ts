import { components } from '../../lib/image/chroma.ts';
import type { Img } from '../../lib/image/png.ts';
import { maskOf } from '../../lib/image/similarity.ts';

// Includes the small disconnected parts seen in the demo sword's walk.
const MAX_PART_SIZE = 8;
const MAX_REPORTED_PARTS = 16;

/** Review clues in uncropped frame coordinates. A separated detail can be intentional artwork. */
export function detachedPixels(image: Img) {
	const parts = components(maskOf(image), image.w, image.h);
	let largest = 0;
	for (const part of parts) largest = Math.max(largest, part.length);
	const small = parts.filter((part) => part.length <= MAX_PART_SIZE && part.length < largest);
	if (!small.length) return null;
	return {
		componentCount: small.length,
		pixelCount: small.reduce((sum, part) => sum + part.length, 0),
		components: small
			.slice(0, MAX_REPORTED_PARTS)
			.map((part) => part.map((p) => ({ x: p % image.w, y: Math.floor(p / image.w) })))
	};
}
