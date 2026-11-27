// Integer upscale detection on imported cells, plus the import warning it drives.
import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { detectUpscale } from '../../src/lib/image/upscale.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { archiveZip, cell, upscale } from './import-fixtures.ts';

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

test('import warns once, with the scale, about an upscaled standing cell and keeps it as it is', async () => {
	const result = await readCharacterZip(await archiveZip(upscale(cell(), 4)));
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
	const result = await readCharacterZip(await archiveZip(cell()));
	expect(result.warnings.some((warning) => warning.includes('upscale'))).toBe(false);
	expect(result.warningKeys).not.toContainEqual(
		expect.objectContaining({ key: 'import.warning.upscaledBase' })
	);
});
