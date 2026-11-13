import { describe, expect, it } from 'vitest';
import { castPose, carouselFrames } from '../../src/studio/experience/carousel.ts';
import { heroScale, layout } from '../../src/studio/experience/geometry.ts';

describe('character carousel geometry', () => {
	it('keeps subtly recessed companions separated and inside every responsive stage', () => {
		for (let width = 240; width <= 3840; width += 17) {
			for (let height = 240; height <= 2160; height += 31) {
				const geometry = layout(width, height, 'characters');
				const stage = geometry.stage.r - geometry.stage.l;
				const size = 64 * heroScale(geometry, 50, 48);
				const hero = castPose(0, stage, size);
				const side = castPose(1, stage, size);
				const heroSize = size * hero.scale;
				const sideSize = size * side.scale;
				expect(sideSize / heroSize).toBeCloseTo(0.85);
				expect(side.y).toBeCloseTo(-heroSize * 0.0375);
				expect(side.x - sideSize / 2 - heroSize / 2).toBeGreaterThanOrEqual(8 - 1e-8);
				expect(side.x + sideSize / 2).toBeLessThanOrEqual(stage / 2 + 1e-8);
			}
		}
	});
	it('centers one character and keeps companions slightly smaller and higher', () => {
		expect(castPose(0, 1000, 320)).toEqual({ x: 0, y: 0, scale: 1 });
		expect(castPose(-1, 1000, 320)).toEqual({ x: -316, y: -12, scale: 0.85 });
		expect(castPose(1, 1000, 320)).toEqual({ x: 316, y: -12, scale: 0.85 });
	});
	it('keeps the selected slot centered even when one neighbor is absent', () => {
		for (const width of [300, 768, 1000, 1920]) {
			expect(castPose(0, width, 320).x).toBe(0);
			expect(castPose(-1, width, 320).x).toBe(-castPose(1, width, 320).x);
		}
	});
	it('fits narrow stages without changing the artwork backing size', () => {
		expect(castPose(0, 300, 320).scale).toBeCloseTo(268 / 2.7 / 320);
		expect(castPose(1, 300, 320).scale).toBeCloseTo((268 / 2.7 / 320) * 0.85);
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
