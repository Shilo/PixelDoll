import { describe, expect, it } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { opaqueBox } from '../../src/lib/rig/normalize.ts';
import { groundToSource } from '../../src/studio/stateGrounding.ts';

function column(top: number, bottom: number, x = 4): Img {
	const image = makeImg(8, 16);
	for (let y = top; y <= bottom; y++) image.data.set([200, 100, 50, 255], (y * 8 + x) * 4);
	return image;
}

describe('State grounding', () => {
	it('moves a generated view that drifted up back onto the source ground, losslessly', () => {
		const source = column(4, 15);
		const drifted = column(2, 10, 6);
		const { image, shift } = groundToSource(drifted, source);
		expect(shift).toBe(5);
		expect(opaqueBox(image)).toEqual({ x0: 6, x1: 6, y0: 7, y1: 15 });
		expect(image.data.filter((value) => value === 200)).toHaveLength(9);
	});

	it('leaves grounded views and moves that would crop pixels unchanged', () => {
		const source = column(4, 15);
		const grounded = column(6, 15);
		expect(groundToSource(grounded, source)).toEqual({ image: grounded, shift: 0 });
		// Raising a low view by 3 would push its top row out of the cell.
		const sunk = column(0, 12);
		const low = column(2, 9);
		expect(groundToSource(sunk, low).shift).toBe(0);
	});
});
