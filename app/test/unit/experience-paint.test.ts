import { expect, test } from 'vitest';
import { frameRecorder } from '../../src/studio/experience/paint.ts';

function fakeContext() {
	const log: unknown[][] = [];
	const target = {
		imageSmoothingEnabled: true,
		setTransform: (...args: unknown[]) => log.push(['setTransform', ...args]),
		clearRect: (...args: unknown[]) => log.push(['clearRect', ...args]),
		drawImage: (...args: unknown[]) => log.push(['drawImage', ...args])
	};
	return { target, log, context: target as unknown as CanvasRenderingContext2D };
}

function frame(g: CanvasRenderingContext2D, image: object, x: number) {
	g.setTransform(2, 0, 0, 2, 0, 0);
	g.clearRect(0, 0, 100, 50);
	g.imageSmoothingEnabled = false;
	g.drawImage(image as CanvasImageSource, x, 4, 8, 8);
}

test('an unchanged frame does not repaint the canvas', () => {
	const { target, log, context } = fakeContext();
	const paint = frameRecorder(context),
		image = {};
	frame(paint.context, image, 3);
	expect(paint.commit()).toBe(true);
	expect(log).toEqual([
		['setTransform', 2, 0, 0, 2, 0, 0],
		['clearRect', 0, 0, 100, 50],
		['drawImage', image, 3, 4, 8, 8]
	]);
	expect(target.imageSmoothingEnabled).toBe(false);
	log.length = 0;
	frame(paint.context, image, 3);
	expect(paint.commit()).toBe(false);
	expect(log).toEqual([]);
});

test('a moved, different or redrawn image and a cleared canvas repaint', () => {
	const { log, context } = fakeContext();
	const paint = frameRecorder(context),
		image = {};
	const paints = (draw: () => void) => {
		draw();
		log.length = 0;
		const painted = paint.commit();
		expect(painted).toBe(log.length > 0);
		return painted;
	};
	expect(paints(() => frame(paint.context, image, 3))).toBe(true);
	expect(paints(() => frame(paint.context, image, 4))).toBe(true);
	expect(paints(() => frame(paint.context, {}, 4))).toBe(true);
	expect(paints(() => frame(paint.context, image, 4))).toBe(true);
	expect(paints(() => frame(paint.context, image, 4))).toBe(false);
	paint.redrawn();
	expect(paints(() => frame(paint.context, image, 4))).toBe(true);
	paint.invalidate();
	expect(paints(() => frame(paint.context, image, 4))).toBe(true);
	expect(paints(() => frame(paint.context, image, 4))).toBe(false);
});
