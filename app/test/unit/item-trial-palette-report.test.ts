import { expect, test } from 'vitest';
import {
	edgeComparison,
	nearestPalette,
	paletteMembership,
	pixelAgreement
} from '../../scripts/item-trial-palette-report.ts';
import { evaluateTrialFrames } from '../../scripts/item-trial-evaluate.ts';
import { bytesToBase64, makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { inputCell } from '../../src/lib/items/items.ts';
import type { TrialPacket } from '../../src/ui/item-trial/trial.ts';

test('nearest RGB ties follow palette order while alpha, hidden RGB and the input stay exact', () => {
	const source = makeImg(3, 1);
	source.data.set([1, 0, 0, 180, 1, 0, 0, 0, 2, 0, 0, 255]);
	const before = source.data.slice(),
		matched = nearestPalette(source, [0x020000, 0]);
	expect([...matched.data]).toEqual([2, 0, 0, 180, 1, 0, 0, 0, 2, 0, 0, 255]);
	expect(source.data).toEqual(before);
	expect(pixelAgreement(source, matched)).toMatchObject({
		alphaMaskDifferentPixels: 0,
		alphaValueDifferentPixels: 0,
		sharedVisiblePixels: 2,
		sharedVisibleRgbSamePixels: 1
	});
});

test('palette membership separates visible, opaque, fractional and transparent pixels', () => {
	const source = makeImg(3, 1);
	source.data.set([0, 0, 0, 180, 3, 0, 0, 0, 3, 0, 0, 255]);
	expect(paletteMembership(source, new Set([0]))).toEqual({
		visiblePixels: 2,
		fullyOpaquePixels: 1,
		fractionalAlphaPixels: 1,
		palettePixels: 1,
		outsidePalettePixels: 1,
		fraction: 0.5
	});
	expect(paletteMembership(makeImg(1, 1), new Set([0])).fraction).toBeNull();
});

test('edge losses count four-neighbor opaque pairs once and exclude changed geometry', () => {
	const source = makeImg(2, 2),
		flat = makeImg(2, 2);
	[0, 1, 2, 3].forEach((color, p) => source.data.set([color, 0, 0, 255], p * 4));
	for (let p = 0; p < 4; p++) flat.data.set([0, 0, 0, 255], p * 4);
	expect(edgeComparison(source, flat)).toEqual({
		sharedOpaquePairs: 4,
		distinctControlEdges: 4,
		collapsedControlEdges: 4,
		newColorEdges: 0
	});
	flat.data[7] = 0;
	expect(edgeComparison(source, flat)).toEqual({
		sharedOpaquePairs: 2,
		distinctControlEdges: 2,
		collapsedControlEdges: 2,
		newColorEdges: 0
	});
	expect(pixelAgreement(source, flat)).toMatchObject({
		alphaMaskDifferentPixels: 1,
		alphaValueDifferentPixels: 1,
		sharedVisiblePixels: 3
	});
});

test('new color boundaries are separate from collapsed control boundaries', () => {
	const source = makeImg(2, 2);
	for (let p = 0; p < 4; p++) source.data.set([0, 0, 0, 255], p * 4);
	const changed = { ...source, data: source.data.slice() };
	changed.data[4] = 100;
	expect(edgeComparison(source, changed)).toEqual({
		sharedOpaquePairs: 4,
		distinctControlEdges: 0,
		collapsedControlEdges: 0,
		newColorEdges: 2
	});
	expect(() => edgeComparison(source, makeImg(4, 1))).toThrow('widths differ');
});

test('alpha-preserving remapping can still erase gear during production extraction', async () => {
	const base = makeImg(32, 32),
		layer = makeImg(32, 32);
	for (let y = 5; y < 29; y++)
		for (let x = 10; x < 22; x++) base.data.set([180, 100, 60, 255], (y * 32 + x) * 4);
	const dressed = inputCell(base, 'green');
	for (let y = 12; y < 22; y++)
		for (let x = 12; x < 20; x++) {
			const i = (y * 32 + x) * 4;
			layer.data.set([0, 0, 255, 255], i);
			dressed.data.set([0, 0, 255, 255], i);
		}
	const encoded = async (image: typeof base) => bytesToBase64(await encodePngBytes(image));
	const packet: TrialPacket = {
		version: 1,
		id: 'synthetic-key-collapse',
		label: 'Synthetic key collapse',
		caseId: 'synthetic',
		conditioning: 'raw',
		direction: 'south',
		anim: 'walk',
		seed: 1,
		prompt: 'a blue tunic',
		slot: 'torso_inner',
		key: 'green',
		cell: { w: 32, h: 32 },
		rig: {
			cell: { w: 32, h: 32 },
			pivot: { x: 16, y: 30 },
			baseItem: 'base',
			baseHash: 'sha256:test',
			directions: [{ id: 'south' }],
			animations: []
		},
		reference: {
			base: await encoded(base),
			raw: await encoded(dressed),
			layer: await encoded(layer)
		},
		targets: await Promise.all(
			Array.from({ length: 8 }, async (_, i) => ({
				key: `walk/south/${i}`,
				base: await encoded(base),
				expectedLayer: await encoded(layer)
			}))
		)
	};
	const outputs = Array.from({ length: 9 }, () => ({ ...dressed, data: dressed.data.slice() }));
	const remapped = outputs.map((image) => nearestPalette(image, [0x00c800, 0x00ff00]));
	expect(pixelAgreement(outputs[1], remapped[1]).alphaValueDifferentPixels).toBe(0);
	const [raw, nearest] = await Promise.all([
		evaluateTrialFrames(packet, 'edit', outputs),
		evaluateTrialFrames(packet, 'edit', remapped)
	]);
	expect(raw.cells.every((cell) => cell.area === 80)).toBe(true);
	expect(nearest.cells.every((cell) => cell.area === 0)).toBe(true);
	expect(nearest.qa.qa.status).toBe('fail');
});
