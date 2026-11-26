// Compression/resampling warning on imported standing cells: pooling, the per-cell upscale gate, and dropped alpha.
import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { paletteStats } from '../../src/lib/image/resampling.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { detectUpscale } from '../../src/lib/image/upscale.ts';
import { archiveZip, cell, haloBelowThreshold, noisy, upscale } from './import-fixtures.ts';

const compressionWarnings = (warnings: string[]) =>
	warnings.filter((warning) => warning.includes('compressed or resampled'));
const hasCompressionWarning = (warnings: string[]) => compressionWarnings(warnings).length > 0;

test('import warns about a compressed or resampled standing cell and keeps it', async () => {
	const result = await readCharacterZip(await archiveZip(noisy()));
	expect(compressionWarnings(result.warnings)).toHaveLength(1);
	expect(result.warningKeys).toContainEqual({ key: 'import.warning.compressedBase' });
	expect(result.project.manifest.rig.cell.w).toBeGreaterThan(0);
});

test('native standing cells add no compression warning', async () => {
	expect(detectUpscale(cell())).toBe(1);
	const result = await readCharacterZip(await archiveZip(cell()));
	expect(hasCompressionWarning(result.warnings)).toBe(false);
});

test('colors the importer drops (alpha below the cutoff) do not count as compression', async () => {
	const art = haloBelowThreshold();
	// The halo has 300 unique colors, but all are below the binarization threshold and never imported.
	expect(paletteStats(art).colors).toBeLessThan(64);
	const result = await readCharacterZip(await archiveZip(art));
	expect(hasCompressionWarning(result.warnings)).toBe(false);
	expect(result.warningKeys).toContainEqual(
		expect.objectContaining({ key: 'import.warning.semiAlpha' })
	);
});

test('one damaged direction is enough to warn', async () => {
	const art = [cell(), noisy(32, 11), cell()];
	const result = await readCharacterZip(await archiveZip(art));
	expect(hasCompressionWarning(result.warnings)).toBe(true);
});

test('a mixed upscale and damaged set reports both causes', async () => {
	// South and east are a clean nearest-neighbor upscale; west is compressed.
	const art = [upscale(cell(), 4), upscale(cell(), 4), noisy(32, 5)];
	const result = await readCharacterZip(await archiveZip(art));
	expect(result.warnings.some((warning) => warning.includes('upscale'))).toBe(true);
	expect(hasCompressionWarning(result.warnings)).toBe(true);
});

test('a single clean direction among damaged ones still warns', async () => {
	const art: Img[] = [cell(), noisy(32, 2), noisy(32, 3)];
	const result = await readCharacterZip(await archiveZip(art));
	expect(hasCompressionWarning(result.warnings)).toBe(true);
});

test('a cell too small to judge never warns on its own', async () => {
	const small = makeImg(8, 8);
	for (let p = 0; p < small.w * small.h; p++)
		small.data.set([(p * 11) & 255, (p * 7) & 255, (p * 3) & 255, 255], p * 4);
	const result = await readCharacterZip(await archiveZip(small));
	// Three 8x8 cells pool to 192 painted pixels, still below the floor.
	expect(hasCompressionWarning(result.warnings)).toBe(false);
});
