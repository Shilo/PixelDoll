import { expect, test } from 'vitest';
import { HAND_MARK, heldPhrase, markHand } from '../../src/lib/items/items.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import type { Keypoint } from '../../src/lib/rig/rig.ts';

const rest: Keypoint[] = [
	{ label: 'RIGHT ARM', x: 0.25, y: 0.5 },
	{ label: 'LEFT ARM', x: 0.75, y: 0.5 }
] as Keypoint[];
const body = () => {
	const im = makeImg(48, 48);
	for (let y = 10; y < 40; y++)
		for (let x = 10; x < 38; x++) im.data.set([40, 200, 40, 255], (y * 48 + x) * 4);
	return im;
};
const red = (im: ReturnType<typeof makeImg>) => {
	const at: [number, number][] = [];
	for (let p = 0; p < im.w * im.h; p++)
		if (im.data[p * 4] === HAND_MARK[0] && im.data[p * 4 + 1] === HAND_MARK[1])
			at.push([p % im.w, (p / im.w) | 0]);
	return at;
};

test('the dot lands on the held wrist of the padded rest view, on opaque px only', () => {
	const src = body(),
		main = red(markHand(src, rest, 'main_hand', { w: 32, h: 32 }, 8)),
		off = red(markHand(src, rest, 'off_hand', { w: 32, h: 32 }, 8));
	expect(main.length).toBeGreaterThan(8);
	expect(main.every(([x, y]) => Math.hypot(x - 16, y - 24) <= 2.2)).toBe(true); // 0.25 * 32 + 8, 0.5 * 32 + 8
	expect(off.every(([x, y]) => Math.hypot(x - 32, y - 24) <= 2.2)).toBe(true);
	expect(red(src)).toEqual([]); // the input is not modified
});

test('an estimated wrist just off the hand moves the dot onto the nearest body px; no body nearby fails', () => {
	const im = makeImg(48, 48);
	for (let y = 22; y < 27; y++)
		for (let x = 20; x < 24; x++) im.data.set([40, 200, 40, 255], (y * 48 + x) * 4);
	const dots = red(markHand(im, rest, 'main_hand', { w: 32, h: 32 }, 8)); // wrist (16, 24) is 4 px left of the hand
	expect(dots.length).toBeGreaterThan(0);
	expect(dots.every(([x, y]) => x >= 20 && x < 24 && y >= 22 && y < 27)).toBe(true);
	expect(() => markHand(makeImg(48, 48), rest, 'main_hand', { w: 32, h: 32 }, 8)).toThrow(
		/cannot be marked/
	);
});

test('a rest pose without the wrist fails instead of sending an unmarked request', () => {
	expect(() => markHand(body(), [], 'main_hand', { w: 32, h: 32 })).toThrow(/right arm/);
});

test('the held wording names the dot and the hand, with no direction or weapon words', () => {
	const p = heldPhrase('a lit candle', 'main_hand');
	expect(p).toContain('right hand, the hand marked with a small red dot');
	expect(p).not.toMatch(/pointing|weapon|scabbard|shield/);
	expect(heldPhrase('a lantern', 'off_hand')).toContain('left hand, the hand marked');
});
