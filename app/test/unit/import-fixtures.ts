// Shared PixelLab-ZIP fixtures for the import-quality warnings (upscale and compression).
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { zip, type ZipEntry } from '../../src/lib/store/zip.ts';

export const DIRS = ['south', 'east', 'west'] as const;
const BANDS = [2, 5, 9, 12, 16, 19, 23, 27, 30];
const COLORS = [
	[200, 48, 48, 255],
	[48, 180, 64, 255],
	[48, 72, 200, 255],
	[220, 196, 48, 255],
	[32, 192, 192, 255],
	[176, 64, 200, 255],
	[232, 232, 232, 255],
	[24, 24, 24, 255]
];

/** Irregular band boundaries: native art cannot fit them on one mod-s lattice, while nearest-neighbor upscales can. */
export function cell(): Img {
	const im = makeImg(32, 32);
	for (let j = 0; j < BANDS.length - 1; j++)
		for (let i = 0; i < BANDS.length - 1; i++) {
			const color = COLORS[(i + j) % COLORS.length];
			for (let y = BANDS[j]; y < BANDS[j + 1]; y++)
				for (let x = BANDS[i]; x < BANDS[i + 1]; x++) im.data.set(color, (y * im.w + x) * 4);
		}
	return im;
}

export function upscale(src: Img, scale: number): Img {
	const im = makeImg(src.w * scale, src.h * scale);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const at = (Math.floor(y / scale) * src.w + Math.floor(x / scale)) * 4;
			im.data.set(src.data.subarray(at, at + 4), (y * im.w + x) * 4);
		}
	return im;
}

/** Every pixel a slightly different color, like JPEG ringing. `seed` makes directions differ. */
export function noisy(size = 32, seed = 0): Img {
	const im = makeImg(size, size);
	for (let y = 0; y < size; y++)
		for (let x = 0; x < size; x++)
			im.data.set(
				[
					(x * 7 + y * 3 + seed) & 255,
					(x * 5 + y * 11 + seed * 3) & 255,
					(x * 13 + y + seed) & 255,
					255
				],
				(y * size + x) * 4
			);
	return im;
}

/** Native bands with a wide, fully transparent-free halo below the binarization threshold: unique colors the importer drops. */
export function haloBelowThreshold(): Img {
	const im = cell();
	let n = 0;
	for (let p = 0; p < im.w * im.h && n < 300; p++) {
		if (im.data[p * 4 + 3]) continue; // only overwrite transparent pixels, so the kept art stays intact
		im.data.set([n & 255, (n * 3) & 255, (n * 7) & 255, 64], p * 4);
		n++;
	}
	return im;
}

/** A PixelLab-character ZIP with one image per standing direction. */
export async function archive(arts: Img | readonly Img[]): Promise<ZipEntry[]> {
	const list = Array.isArray(arts) ? [...arts] : [arts as Img];
	const enc = new TextEncoder();
	return [
		{
			name: 'metadata.json',
			data: enc.encode(
				JSON.stringify({
					character: {
						id: 'quality-check',
						name: 'Quality check',
						size: { width: list[0].w, height: list[0].h }
					},
					frames: {
						rotations: Object.fromEntries(DIRS.map((dir) => [dir, `rotations/${dir}.png`])),
						animations: {}
					}
				})
			)
		},
		...(await Promise.all(
			DIRS.map(async (dir, index) => ({
				name: `rotations/${dir}.png`,
				data: await encodePngBytes(list[index % list.length])
			}))
		))
	];
}

export const archiveZip = async (arts: Img | readonly Img[]) => zip(await archive(arts));
