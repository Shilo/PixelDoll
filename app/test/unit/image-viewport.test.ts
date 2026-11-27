import { describe, expect, test } from 'vitest';
import {
	centered,
	clampViewport,
	fitScale,
	viewerZoomStep,
	zoomAround
} from '../../src/studio/imageViewport.ts';

describe('image viewport', () => {
	test('fit snaps to whole device pixels at or above 100%, and shrinks freely below', () => {
		expect(fitScale({ w: 500, h: 300 }, { w: 64, h: 64 })).toBe(4);
		expect(fitScale({ w: 500, h: 300 }, { w: 64, h: 64 }, 1.5)).toBeCloseTo(7 / 1.5);
		expect(fitScale({ w: 32, h: 64 }, { w: 64, h: 64 })).toBe(0.5);
		expect(fitScale({ w: 0, h: 300 }, { w: 64, h: 64 })).toBe(1);
	});

	test('zooming keeps the pixel under the pointer in place', () => {
		const start = centered({ w: 400, h: 400 }, { w: 50, h: 50 }, 2);
		const point = { x: 210, y: 190 };
		const imageX = (point.x - start.x) / start.scale,
			imageY = (point.y - start.y) / start.scale;
		const zoomed = zoomAround(start, point, 8);
		expect(zoomed.x + imageX * zoomed.scale).toBeCloseTo(point.x);
		expect(zoomed.y + imageY * zoomed.scale).toBeCloseTo(point.y);
	});

	test('a larger image covers the view and a smaller one stays inside it', () => {
		const view = { w: 300, h: 200 },
			image = { w: 100, h: 100 };
		expect(clampViewport({ scale: 4, x: 50, y: -900 }, view, image)).toEqual({
			scale: 4,
			x: 0,
			y: -200
		});
		expect(clampViewport({ scale: 1, x: -40, y: 500 }, view, image)).toEqual({
			scale: 1,
			x: 0,
			y: 100
		});
	});
});

describe('viewer zoom steps', () => {
	const zoom = { scale: 27, fit: 27, min: 1, max: 54 };
	test('steps are proportional and land on the fit when passing it', () => {
		expect(viewerZoomStep(zoom, 1)).toBe(40.5);
		expect(viewerZoomStep(zoom, -1)).toBe(18);
		expect(viewerZoomStep({ ...zoom, scale: 20 }, 1)).toBe(27);
		expect(viewerZoomStep({ ...zoom, scale: 40 }, -1)).toBe(27);
		expect(viewerZoomStep({ ...zoom, scale: 50 }, 1)).toBe(54);
	});
});
