import { describe, expect, it } from 'vitest';
import { castPose, carouselFrames } from '../../src/studio/experience/carousel.ts';

describe('character carousel geometry', () => {
	it('centers one character and preserves side height and scale', () => {
		expect(castPose(0, 1, 1000, 320, 192)).toEqual({ x: 0, y: 0, scale: 1 });
		expect(castPose(-1, 3, 1000, 320, 192)).toEqual({ x: -306, y: -30, scale: 0.6 });
		expect(castPose(1, 3, 1000, 320, 192)).toEqual({ x: 306, y: -30, scale: 0.6 });
	});
	it('centers the two-character pair without a duplicate', () => {
		expect(castPose(-1, 2, 1000, 320, 192).x).toBe(-185);
		expect(castPose(0, 2, 1000, 320, 192).x).toBe(121);
	});
	it('fits narrow stages without changing the artwork backing size', () => {
		expect(castPose(0, 3, 300, 320, 192).scale).toBe(0.45);
		expect(castPose(1, 3, 300, 320, 192).scale).toBe(0.28125);
	});
	it('routes wrapped actors invisibly around the edges', () => {
		const frames = carouselFrames(
			{ transform: 'translate(-306px, -30px) scale(0.6)', opacity: '1' },
			{ x: 306, y: -30, scale: 0.6 },
			820,
			true,
			1
		);
		expect(frames).toHaveLength(4);
		expect(frames[1]).toMatchObject({ opacity: 0, offset: 0.45 });
		expect(frames[2]).toMatchObject({ opacity: 0, offset: 0.46 });
		expect(frames[1].transform).toContain('-820px');
		expect(frames[2].transform).toContain('820px');
		expect(frames[3]).toMatchObject({ opacity: 1 });
	});
	it('retargets from the sampled pose instead of restarting', () => {
		const current = { transform: 'matrix(0.8, 0, 0, 0.8, 123, -15)', opacity: '0.7' };
		const frames = carouselFrames(current, { x: 0, y: 0, scale: 1 }, 820, false, -1);
		expect(frames).toHaveLength(2);
		expect(frames[0]).toEqual(current);
	});
});
