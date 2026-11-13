import { expect, test, vi } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import {
	reflectionPixels,
	reflectionPlacement,
	reflectionStyle,
	reflectionCanvas,
	drawReflection
} from '../../src/studio/experience/reflection.ts';

test('reflection contact and fade ignore transparent equipment padding', () => {
	const image = makeImg(4, 8);
	for (let row = 1; row < 6; row++) image.data.set([50, 100, 150, 255], (row * 4 + 1) * 4);
	const padded = makeImg(10, 18);
	for (let row = 0; row < image.h; row++)
		padded.data.set(image.data.subarray(row * 16, (row + 1) * 16), ((row + 3) * 10 + 2) * 4);
	const plain = reflectionPixels(image, 6, 5)!;
	const wide = reflectionPixels(padded, 9, 5)!;
	for (let row = 0; row < 6; row++)
		expect([
			...wide.data.subarray(((row + 3) * wide.w + 3) * 4, ((row + 3) * wide.w + 3) * 4 + 4)
		]).toEqual([...plain.data.subarray((row * plain.w + 1) * 4, (row * plain.w + 1) * 4 + 4)]);
	const at = reflectionPlacement({ x: 20, y: 30, scale: 3, groundRow: 6 }, plain.h, 0.3);
	const other = reflectionPlacement({ x: 14, y: 21, scale: 3, groundRow: 9 }, wide.h, 0.3);
	expect(at.floor).toBe(48);
	expect(other.floor).toBe(at.floor);
	expect(at.top).toBe(at.floor);
	expect(at.height).toBeGreaterThan(0);
});

test('reflection clips below the standing feet and preserves airborne separation', () => {
	const image = makeImg(2, 10);
	image.data.set([255, 0, 0, 255], 4 * 2 * 4);
	image.data.set([0, 0, 255, 255], 8 * 2 * 4);
	const reflected = reflectionPixels(image, 7, 7)!;
	expect(reflected.h).toBe(7);
	expect(reflected.data[4 * 2 * 4 + 3]).toBeGreaterThan(0);
	expect(reflected.data.some((value, index) => index % 4 === 2 && value > 0)).toBe(false);
	const airborne = makeImg(2, 5);
	airborne.data.set([255, 0, 0, 255], 4 * 2 * 4);
	const airborneReflection = reflectionPixels(airborne, 8, 8)!;
	expect(airborneReflection.h).toBe(5);
	const at = reflectionPlacement(
		{ x: 0, y: 0, scale: 2, groundRow: 8 },
		airborneReflection.h,
		0.35
	);
	expect(at.top).toBeCloseTo(at.floor + 3 * 2 * 0.35);
	expect(at.top).toBeGreaterThan(at.floor);
	expect(reflectionPixels(makeImg(2, 10), 7, 7)).toBeNull();
});

test('floor perspective is bounded, camera-side and less reflective from above', () => {
	const side = reflectionStyle(500, 450, 800);
	const overhead = reflectionStyle(500, -400, 800);
	expect(side.compression).toBeGreaterThan(overhead.compression);
	expect(side.opacity).toBeGreaterThan(overhead.opacity);
	for (const style of [side, overhead, reflectionStyle(500, 500, 800)]) {
		expect(style.compression).toBeGreaterThan(0);
		expect(style.compression).toBeLessThanOrEqual(1);
		expect(style.opacity).toBeLessThan(0.25);
	}
});

test('camera-only placement reuses prepared pixels and reflects without horizontal flipping', () => {
	const context = {
		putImageData: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		drawImage: vi.fn(),
		globalAlpha: 1,
		imageSmoothingEnabled: true
	};
	const canvas = { width: 0, height: 0, getContext: () => context };
	vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
	vi.stubGlobal(
		'ImageData',
		class {
			constructor(
				public data: Uint8ClampedArray,
				public width: number,
				public height: number
			) {}
		}
	);
	try {
		const image = makeImg(2, 6);
		image.data.set([200, 50, 100, 255], 4 * 2 * 4);
		const source = reflectionCanvas(image, 5, 5);
		expect(reflectionCanvas(image, 5, 5)).toBe(source);
		const style = { opacity: 0.12, compression: 0.3 };
		drawReflection(
			context as unknown as CanvasRenderingContext2D,
			source,
			{ x: 12, y: 20, groundRow: 5, scale: 2 },
			style
		);
		drawReflection(
			context as unknown as CanvasRenderingContext2D,
			source,
			{ x: 22, y: 30, groundRow: 5, scale: 2 },
			style
		);
		expect(context.putImageData).toHaveBeenCalledTimes(1);
		expect(context.translate.mock.calls).toEqual([
			[12, 33],
			[22, 43]
		]);
		expect(context.scale.mock.calls).toEqual([
			[1, -1],
			[1, -1]
		]);
		expect(context.drawImage).toHaveBeenLastCalledWith(canvas, 0, 0, 4, 3);
		reflectionCanvas(image, 6, 5);
		expect(context.putImageData).toHaveBeenCalledTimes(2);
	} finally {
		vi.unstubAllGlobals();
	}
});
