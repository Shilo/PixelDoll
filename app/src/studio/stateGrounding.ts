import { makeImg, type Img } from '../lib/image/png.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';

/**
 * Puts a generated State view back on the source's ground. Image edits can return the character shifted up or down
 * in its cell (measured: feet 9 px above the source's ground line), which would make the State float and misalign
 * equipment. The shift is a lossless whole-pixel move of the lowest opaque row onto the source's; it is skipped when
 * it would push any pixel out of the cell. Never resizes or moves sideways: a changed pose may legitimately widen.
 */
export function groundToSource(generated: Img, source: Img): { image: Img; shift: number } {
	const target = opaqueBox(source);
	const box = opaqueBox(generated);
	if (!target || !box || generated.w !== source.w || generated.h !== source.h)
		return { image: generated, shift: 0 };
	const shift = target.y1 - box.y1;
	if (!shift || box.y0 + shift < 0 || box.y1 + shift >= generated.h)
		return { image: generated, shift: 0 };
	const image = makeImg(generated.w, generated.h);
	const row = generated.w * 4;
	for (let y = box.y0; y <= box.y1; y++)
		image.data.set(generated.data.subarray(y * row, (y + 1) * row), (y + shift) * row);
	return { image, shift };
}
