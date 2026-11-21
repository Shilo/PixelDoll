import { describe, expect, it } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { groundingShift, groundToSource, shiftRows } from '../../src/studio/stateGrounding.ts';

const W = 32;
const H = 64;

function paint(image: Img, x0: number, y0: number, x1: number, y1: number, value = 200) {
	for (let y = y0; y <= y1; y++)
		for (let x = x0; x <= x1; x++) image.data.set([value, 80, 60, 255], (y * image.w + x) * 4);
}

/** A small planted figure: torso, two legs and wider feet whose soles sit on `ground`. */
function figure(ground: number): Img {
	const image = makeImg(W, H);
	paint(image, 12, ground - 24, 19, ground - 12); // torso
	paint(image, 12, ground - 11, 14, ground - 2); // left leg
	paint(image, 17, ground - 11, 19, ground - 2); // right leg
	paint(image, 10, ground - 1, 14, ground); // left foot
	paint(image, 17, ground - 1, 21, ground); // right foot
	return image;
}

describe('State grounding', () => {
	const source = figure(38);

	it('moves a view whose feet came back higher or lower onto the source feet, losslessly', () => {
		expect(groundingShift(figure(29), source)).toBe(9);
		expect(groundingShift(figure(35), source)).toBe(3);
		const sunk = figure(38);
		const low = figure(34);
		expect(groundingShift(sunk, low)).toBe(-4);
		const { image, shift } = groundToSource(figure(29), source);
		expect(shift).toBe(9);
		expect(Array.from(image.data)).toEqual(Array.from(source.data));
	});

	it('leaves views alone when the feet already match or the match is not certain', () => {
		expect(groundToSource(source, source)).toEqual({ image: source, shift: 0 });
		// A prop below the feet: shifting would leave substantial art under the source ground.
		const sword = figure(29);
		paint(sword, 24, 30, 25, 39);
		expect(groundingShift(sword, source)).toBe(0);
		// Feet redrawn into a different shape (a new pose) give no sole match.
		const kneel = figure(29);
		paint(kneel, 10, 28, 21, 29, 0);
		for (let y = 28; y <= 29; y++)
			for (let x = 10; x <= 21; x++) kneel.data[(y * W + x) * 4 + 3] = 0;
		expect(groundingShift(kneel, source)).toBe(0);
	});

	it('decides from the body, never from a detached prop that moved', () => {
		// Feet already aligned; only a detached staff below and beside them came back 9 px higher.
		const before = figure(38);
		paint(before, 24, 40, 26, 52);
		const after = figure(38);
		paint(after, 24, 31, 26, 43);
		expect(groundingShift(after, before)).toBe(0);
	});

	it('abstains when a second height fits the soles almost as well', () => {
		// Feet joined by a bar with thin middle legs, so soles at two heights are both clear bottom edges.
		const bridged = (ground: number) => {
			const image = makeImg(W, H);
			paint(image, 12, ground - 24, 19, ground - 13); // torso
			paint(image, 15, ground - 12, 16, ground - 3); // legs
			paint(image, 10, ground - 2, 21, ground - 2); // bar
			paint(image, 10, ground - 1, 14, ground); // left foot
			paint(image, 17, ground - 1, 21, ground); // right foot
			return image;
		};
		const view = bridged(33);
		// A higher pair of feet, joined at the side, matches 10 of the 12 sole pixels against the real feet's 12.
		paint(view, 10, 28, 14, 29);
		paint(view, 17, 28, 21, 29);
		paint(view, 9, 28, 9, 31);
		expect(groundingShift(view, bridged(38))).toBe(0);
		expect(groundingShift(bridged(33), bridged(38))).toBe(5);
	});

	it('never follows a larger detached prop that moved while the body stayed', () => {
		const shifted = (ground: number, propTop: number) => {
			const image = makeImg(W, H);
			const body = figure(ground);
			for (let y = 0; y < H; y++)
				for (let x = 0; x + 8 < W; x++)
					image.data.set(
						body.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4),
						(y * W + x + 8) * 4
					);
			paint(image, 0, propTop, 15, propTop + 19);
			return image;
		};
		expect(groundingShift(shifted(38, 24), shifted(38, 33))).toBe(0);
	});

	it('never follows a prop larger than the body that moved alone', () => {
		const before = figure(38);
		paint(before, 24, 20, 31, 52);
		const after = figure(38);
		paint(after, 24, 11, 31, 43);
		expect(groundingShift(after, before)).toBe(0);
	});

	it('matches nothing when the source has no solid art', () => {
		const blank = makeImg(W, H);
		const block = makeImg(W, H);
		paint(block, 0, 43, W - 1, 54);
		expect(groundingShift(block, blank)).toBe(0);
	});

	it('abstains when the feet were redrawn instead of moved', () => {
		// The same height change, but the generated feet are narrower and stepped: no sole match.
		const redrawn = figure(29);
		for (let y = 28; y <= 29; y++)
			for (let x = 10; x <= 21; x++) redrawn.data[(y * W + x) * 4 + 3] = 0;
		paint(redrawn, 13, 28, 14, 28);
		paint(redrawn, 17, 29, 18, 29);
		expect(groundingShift(redrawn, source)).toBe(0);
	});

	it('ignores isolated specks when finding the feet', () => {
		const specked = figure(29);
		specked.data.set([255, 255, 255, 255], (39 * W + 2) * 4);
		expect(groundingShift(specked, source)).toBe(9);
	});

	it('never crops: a move that would push pixels out of the cell is skipped', () => {
		// The view sits 2 rows below a source whose feet are higher; raising it would cut its top row.
		const view = figure(38);
		paint(view, 15, 0, 16, 1);
		expect(groundingShift(view, figure(36))).toBe(0);
		expect(groundingShift(figure(38), figure(36))).toBe(-2);
		expect(shiftRows(view, 0)).toBe(view);
	});
});
