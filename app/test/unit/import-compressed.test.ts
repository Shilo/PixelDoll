// Compression/resampling warning on imported standing cells: per-cell verdicts, alpha handled like the importer does.
import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { paletteStats } from '../../src/lib/image/resampling.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { detectUpscale } from '../../src/lib/image/upscale.ts';
import {
	archiveZip,
	cell,
	DIRS8,
	haloBelowThreshold,
	noisy,
	paletteImage,
	upscale
} from './import-fixtures.ts';

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

test('a clean nearest-neighbor upscale is not reported as compression', async () => {
	const result = await readCharacterZip(await archiveZip(upscale(cell(), 4)));
	expect(result.warnings.some((warning) => warning.includes('upscale'))).toBe(true);
	expect(hasCompressionWarning(result.warnings)).toBe(false);
});

test('colors the importer drops (alpha below the cutoff) do not count as compression', async () => {
	const art = haloBelowThreshold();
	// The halo fills every transparent pixel with a unique color, all below the binarization threshold.
	expect(paletteStats(art).colors).toBeLessThan(64);
	const result = await readCharacterZip(await archiveZip(art));
	expect(hasCompressionWarning(result.warnings)).toBe(false);
	expect(result.warningKeys).toContainEqual(
		expect.objectContaining({ key: 'import.warning.semiAlpha' })
	);
});

test('one slightly damaged direction among clean ones still warns', async () => {
	// 30% one-off colors: over the share threshold on its own; pooling it with seven clean palettes would hide it.
	const mild = paletteImage(400, 120);
	const art = [cell(), cell(), cell(), cell(), cell(), cell(), cell(), mild];
	const result = await readCharacterZip(await archiveZip(art, DIRS8));
	expect(hasCompressionWarning(result.warnings)).toBe(true);
});

test('eight clean directions stay quiet', async () => {
	const art = Array.from({ length: 8 }, () => cell());
	const result = await readCharacterZip(await archiveZip(art, DIRS8));
	expect(hasCompressionWarning(result.warnings)).toBe(false);
});

test('a mixed upscale and damaged set reports both causes', async () => {
	const art = [upscale(cell(), 4), upscale(cell(), 4), noisy(32, 5)];
	const result = await readCharacterZip(await archiveZip(art));
	expect(result.warnings.some((warning) => warning.includes('upscale'))).toBe(true);
	expect(hasCompressionWarning(result.warnings)).toBe(true);
});

test('a cell too small to judge never warns', async () => {
	const small = makeImg(8, 8);
	for (let p = 0; p < small.w * small.h; p++)
		small.data.set([(p * 11) & 255, (p * 7) & 255, (p * 3) & 255, 255], p * 4);
	const result = await readCharacterZip(await archiveZip(small));
	expect(hasCompressionWarning(result.warnings)).toBe(false);
});
