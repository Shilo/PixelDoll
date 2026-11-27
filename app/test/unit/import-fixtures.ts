// Shared PixelLab-ZIP fixtures for the import-quality warnings (upscale and compression).
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { zip, type ZipEntry } from '../../src/lib/store/zip.ts';

export const DIRS = ['south', 'east', 'west'] as const;
export const DIRS8 = [
	'south',
	'south-east',
	'east',
	'north-east',
	'north',
	'north-west',
	'west',
	'south-west'
] as const;
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
export function cell(size = 32): Img {
	const im = makeImg(size, size);
	const scale = size / 32;
	for (let j = 0; j < BANDS.length - 1; j++)
		for (let i = 0; i < BANDS.length - 1; i++) {
			const color = COLORS[(i + j) % COLORS.length];
			for (let y = BANDS[j] * scale; y < BANDS[j + 1] * scale; y++)
				for (let x = BANDS[i] * scale; x < BANDS[i + 1] * scale; x++)
					im.data.set(color, (Math.floor(y) * im.w + Math.floor(x)) * 4);
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

/** A cell with exactly `colors` distinct colors, of which `singles` appear once (needs `singles < colors`); the rest
 *  repeat a fill color. */
export function paletteImage(colors: number, singles: number): Img {
	const im = makeImg(32, 32);
	const color = (i: number) => [i & 255, (i >> 8) & 255, 0, 255] as const;
	let p = 0;
	const put = (i: number) => im.data.set(color(i), p++ * 4);
	for (let i = 0; i < singles; i++) put(i);
	for (let i = 0; i < colors - singles; i++) {
		put(singles + i);
		put(singles + i);
	}
	const fill = singles; // in the repeated range, so no singleton is consumed
	while (p < 32 * 32) put(fill);
	return im;
}

/** Native bands plus a halo of unique colors at alpha 64: colors the importer drops at its binarization cutoff. */
export function haloBelowThreshold(): Img {
	const im = cell();
	let n = 0;
	for (let p = 0; p < im.w * im.h; p++) {
		if (im.data[p * 4 + 3]) continue; // only fill transparent pixels, so the kept art stays intact
		im.data.set([n & 255, (n * 3) & 255, (n * 7) & 255, 64], p * 4);
		n++;
	}
	return im;
}

/** A PixelLab-character ZIP with one image per standing direction (3 by default, 8 on request). */
export async function archive(
	arts: Img | readonly Img[],
	dirs: readonly string[] = DIRS
): Promise<ZipEntry[]> {
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
						rotations: Object.fromEntries(dirs.map((dir) => [dir, `rotations/${dir}.png`])),
						animations: {}
					}
				})
			)
		},
		...(await Promise.all(
			dirs.map(async (dir, index) => ({
				name: `rotations/${dir}.png`,
				data: await encodePngBytes(list[index % list.length])
			}))
		))
	];
}

export const archiveZip = async (arts: Img | readonly Img[], dirs?: readonly string[]) =>
	zip(await archive(arts, dirs));
