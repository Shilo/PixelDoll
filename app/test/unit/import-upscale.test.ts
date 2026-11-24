// Integer upscale detection on imported cells, plus the import warning it drives.
import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { detectUpscale } from '../../src/lib/image/upscale.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { zip, type ZipEntry } from '../../src/lib/store/zip.ts';

// Irregular band boundaries: a native cell cannot fit them on one mod-s lattice, while their nearest-neighbor upscales can.
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

function cell(): Img {
	const im = makeImg(32, 32);
	for (let j = 0; j < BANDS.length - 1; j++)
		for (let i = 0; i < BANDS.length - 1; i++) {
			const color = COLORS[(i + j) % COLORS.length];
			for (let y = BANDS[j]; y < BANDS[j + 1]; y++)
				for (let x = BANDS[i]; x < BANDS[i + 1]; x++) im.data.set(color, (y * im.w + x) * 4);
		}
	return im;
}

function upscale(src: Img, scale: number): Img {
	const im = makeImg(src.w * scale, src.h * scale);
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++) {
			const at = (Math.floor(y / scale) * src.w + Math.floor(x / scale)) * 4;
			im.data.set(src.data.subarray(at, at + 4), (y * im.w + x) * 4);
		}
	return im;
}

function rectangle(): Img {
	const im = makeImg(32, 32);
	for (let y = 8; y < 24; y++)
		for (let x = 10; x < 22; x++) im.data.set([180, 60, 40, 255], (y * im.w + x) * 4);
	return im;
}

test('the detector leaves native pixel art at 1x', () => {
	expect(detectUpscale(cell())).toBe(1);
});

test('the detector reports nearest-neighbor 2x and 4x upscales', () => {
	expect(detectUpscale(upscale(cell(), 2))).toBe(2);
	expect(detectUpscale(upscale(cell(), 4))).toBe(4);
});

test('a plain rectangle has too few edges to prove a lattice and stays native', () => {
	expect(detectUpscale(rectangle())).toBe(1);
});

const DIRS = ['south', 'east', 'west'] as const;

async function archive(art: Img): Promise<ZipEntry[]> {
	const enc = new TextEncoder();
	return [
		{
			name: 'metadata.json',
			data: enc.encode(
				JSON.stringify({
					character: {
						id: 'scale-check',
						name: 'Scale check',
						size: { width: art.w, height: art.h }
					},
					frames: {
						rotations: Object.fromEntries(DIRS.map((dir) => [dir, `rotations/${dir}.png`])),
						animations: {}
					}
				})
			)
		},
		...(await Promise.all(
			DIRS.map(async (dir) => ({ name: `rotations/${dir}.png`, data: await encodePngBytes(art) }))
		))
	];
}

test('import warns once, with the scale, about an upscaled standing cell and keeps it as it is', async () => {
	const result = await readCharacterZip(await zip(await archive(upscale(cell(), 4))));
	const warnings = result.warnings.filter((warning) => warning.includes('upscale'));
	expect(warnings).toHaveLength(1);
	expect(warnings[0]).toContain('4x upscale');
	expect(result.warningKeys).toContainEqual({
		key: 'import.warning.upscaledBase',
		vars: { scale: 4 }
	});
	expect(result.project.manifest.rig.cell.w).toBeGreaterThanOrEqual(128);
});

test('import adds no upscale warning for native standing cells', async () => {
	const result = await readCharacterZip(await zip(await archive(cell())));
	expect(result.warnings.some((warning) => warning.includes('upscale'))).toBe(false);
	expect(result.warningKeys).not.toContainEqual(
		expect.objectContaining({ key: 'import.warning.upscaledBase' })
	);
});
