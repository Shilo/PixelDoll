import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { packGrid, cutGrid } from '../../src/lib/items/items.ts';

const fixture = () => ({
	cells: [makeImg(3, 2), makeImg(3, 2)],
	masks: [new Uint8Array(6), new Uint8Array(6)]
});

test.each(['short', 'extra'] as const)(
	'grid packing rejects a %s mask list before assigning frame permissions',
	(mode) => {
		const f = fixture();
		const masks = mode === 'short' ? f.masks.slice(0, 1) : [...f.masks, new Uint8Array(6)];
		expect(() => packGrid(f.cells, masks, 2)).toThrow('one mask entry per frame');
	}
);

test.each([5, 7, 12])('grid packing rejects a %i-pixel mask for a 6-pixel cell', (length) => {
	const f = fixture(),
		masks = [new Uint8Array(length), f.masks[1]!];
	masks[0]!.fill(1);
	expect(() => packGrid(f.cells, masks, 2)).toThrow('matching the cell canvas');
});

test('an oversized mask cannot grant permission in another frame cell', () => {
	const cells = [makeImg(3, 2), makeImg(3, 2), makeImg(3, 2)],
		oversized = new Uint8Array(7);
	// The old loop places this seventh source-mask pixel in protected frame 3, not frame 1.
	oversized[6] = 1;
	expect(() => packGrid(cells, [oversized, null, null], 2)).toThrow('matching the cell canvas');
});

test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
	'grid packing rejects invalid column count %s',
	(cols) => {
		const f = fixture();
		expect(() => packGrid(f.cells, f.masks, cols)).toThrow('positive integer column count');
	}
);

test('grid packing rejects empty frames before reading the first canvas', () => {
	expect(() => packGrid([], [], 2)).toThrow('at least one frame');
});

test('grid packing rejects mixed frame canvases instead of overlapping or dropping pixels', () => {
	const f = fixture();
	expect(() => packGrid([f.cells[0]!, makeImg(2, 2)], f.masks, 2)).toThrow(
		'same positive integer canvas'
	);
});

test.each([0, 1.5, -2])('grid packing rejects frame width %s', (width) => {
	const f = fixture(),
		invalid = { ...f.cells[0]!, w: width };
	expect(() => packGrid([invalid, f.cells[1]!], f.masks, 2)).toThrow(
		'same positive integer canvas'
	);
});

test('grid packing rejects truncated frame RGBA buffers before copying pixels', () => {
	const f = fixture(),
		invalid = { ...f.cells[1]!, data: new Uint8ClampedArray(20) };
	expect(() => packGrid([f.cells[0]!, invalid], f.masks, 2)).toThrow('complete RGBA buffer');
});

test('valid grids preserve frame bytes, null masks, nonzero occupancy and protected tail cells', () => {
	const f = fixture();
	f.cells[0]!.data.set([10, 20, 30, 255], 4);
	f.cells[1]!.data.set([40, 50, 60, 255], 12);
	f.masks[0]![1] = 128;
	f.masks[0]![4] = 255;
	const before = f.cells.map((c) => c.data.slice()),
		maskBefore = f.masks[0]!.slice();
	const packed = packGrid(f.cells, [f.masks[0]!, null], 3);
	expect(packed.image.w).toBe(9);
	expect(packed.image.h).toBe(2);
	expect(cutGrid(packed.image, 2, 3, 2, 3).map((c) => c.data)).toEqual(before);
	for (let y = 0; y < 2; y++)
		for (let x = 0; x < 9; x++) {
			const generated = x < 3 && Boolean(maskBefore[y * 3 + x]);
			expect([...packed.mask.data.subarray((y * 9 + x) * 4, (y * 9 + x + 1) * 4)]).toEqual(
				generated ? [255, 255, 255, 255] : [0, 0, 0, 255]
			);
		}
	expect(f.cells.map((c) => c.data)).toEqual(before);
	expect(f.masks[0]).toEqual(maskBefore);
});
