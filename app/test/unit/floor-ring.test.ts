import { describe, expect, test } from 'vitest';
import { floorRing } from '../../src/studio/experience/floorRing.ts';
import { ringRadius, ringRise } from '../../src/studio/experience/geometry.ts';
import { floorFlatness } from '../../src/studio/experience/reflection.ts';

describe('shared floor ring', () => {
	test('preserves Customize geometry across camera magnifications and device densities', () => {
		for (const magnification of [0.5, 1, 1.75, 4])
			for (const dpr of [1, 1.25, 2, 3])
				for (const belowHorizon of [-10, 0, 180, 1200]) {
					const rx = ringRadius(32, 3, magnification);
					const ry = rx * floorFlatness(belowHorizon, 600);
					expect(floorRing(32, 50, 3, magnification, belowHorizon, 600, dpr)).toEqual({
						rx,
						ry,
						rise: ringRise(50, 3 * magnification, ry * magnification, dpr) / magnification,
						stroke: 1.5 / magnification
					});
				}
	});

	test('keeps the minimum radius and stroke fixed in screen pixels', () => {
		const ring = floorRing(4, 50, 1, 2, 100, 200, 2);
		expect(ring).toEqual({ rx: 6, ry: 3, rise: 1.5, stroke: 0.75 });
	});
});
