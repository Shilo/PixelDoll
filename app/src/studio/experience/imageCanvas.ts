import type { Img } from '../../lib/image/png.ts';

/** A canvas holding `image`'s pixels, made once per image and kept in `cache`. */
export function imageCanvas(image: Img, cache: WeakMap<Img, HTMLCanvasElement>) {
	let canvas = cache.get(image);
	if (!canvas) {
		canvas = document.createElement('canvas');
		canvas.width = image.w;
		canvas.height = image.h;
		canvas
			.getContext('2d')!
			.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.w, image.h), 0, 0);
		cache.set(image, canvas);
	}
	return canvas;
}
