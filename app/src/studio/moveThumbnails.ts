import { composeCell } from '../lib/compose/compose.ts';
import { makeImg, type Img } from '../lib/image/png.ts';
import type { DirectionName, Preset, Project } from '../lib/store/manifest.ts';

function windowImage(image: Img): Img {
	if (image.w < 56 || image.h < 56 || image.w > 64 || image.h > 64) return image;
	const output = makeImg(56, 56);
	const left = (image.w - 56) >> 1;
	const top = image.h - 56;
	for (let row = 0; row < 56; row++)
		output.data.set(
			image.data.subarray(
				((top + row) * image.w + left) * 4,
				((top + row) * image.w + left + 56) * 4
			),
			row * 56 * 4
		);
	return output;
}

export function moveThumbnails(project: Project, items: Preset['items']) {
	const images = new Map<string, Img>();
	const budget = 4 * 1024 * 1024;
	let bytes = 0;
	return (animation: string, direction: DirectionName, cell: number): Img => {
		const key = JSON.stringify([animation, direction, cell]);
		const cached = images.get(key);
		if (cached) return cached;
		const image = windowImage(composeCell(project, items, animation, direction, cell));
		if (image.data.byteLength > budget) return image;
		while (bytes + image.data.byteLength > budget) {
			const oldest = images.keys().next().value!;
			bytes -= images.get(oldest)!.data.byteLength;
			images.delete(oldest);
		}
		images.set(key, image);
		bytes += image.data.byteLength;
		return image;
	};
}
