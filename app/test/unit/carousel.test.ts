import { describe, expect, it } from 'vitest';
import { castPose, carouselFrames } from '../../src/studio/experience/carousel.ts';
import { heroScale, layout } from '../../src/studio/experience/geometry.ts';
import { groundedThumb, thumbAnchors } from '../../src/studio/experience/thumbnails.svelte.ts';
import { makeImg } from '../../src/lib/image/png.ts';

describe('character carousel geometry', () => {
	it('keeps subtly recessed companions separated and inside every responsive stage', () => {
		for (let width = 240; width <= 3840; width += 17) {
			for (let height = 240; height <= 2160; height += 31) {
				const geometry = layout(width, height, 'characters');
				const stage = geometry.stage.r - geometry.stage.l;
				const size = 64 * heroScale(geometry, 50, 48);
				for (const span of [0.4, 0.75, 1, 1.5]) {
					const hero = castPose(0, stage, size, span);
					const side = castPose(1, stage, size, span);
					const heroSize = size * hero.scale;
					const sideSize = size * side.scale;
					expect(sideSize / heroSize).toBeCloseTo(0.85);
					expect(side.y).toBeCloseTo(-heroSize * 0.0375);
					expect(side.x - (sideSize * span) / 2 - (heroSize * span) / 2).toBeGreaterThanOrEqual(
						8 - 1e-8
					);
					expect(side.x + (sideSize * span) / 2).toBeLessThanOrEqual(stage / 2 + 1e-8);
				}
			}
		}
	});
	it('centers one character and keeps companions slightly smaller and higher', () => {
		expect(castPose(0, 1000, 320)).toEqual({ x: 0, y: 0, scale: 1 });
		expect(castPose(-1, 1000, 320)).toEqual({ x: -312, y: -12, scale: 0.85 });
		expect(castPose(1, 1000, 320)).toEqual({ x: 312, y: -12, scale: 0.85 });
	});
	it('uses painted silhouettes instead of transparent frame padding for closer horizontal slots', () => {
		const full = castPose(1, 1000, 320);
		const trimmed = castPose(1, 1000, 320, 0.6);
		expect(trimmed.x).toBeCloseTo(193.6);
		expect(trimmed.x).toBeLessThan(full.x * 0.7);
		expect(trimmed.y).toBe(full.y);
		expect(trimmed.scale).toBe(full.scale);
	});
	it('packs asymmetric silhouettes with the same comfortable gap on both sides', () => {
		const hero = { l: -120, r: 40 };
		const side = { l: -30, r: 60 };
		const right = castPose(1, 1000, 320, 1, { hero, side });
		const left = castPose(-1, 1000, 320, 1, { hero, side });
		expect(right.x + side.l * right.scale - hero.r).toBeCloseTo(16);
		expect(hero.l - (left.x + side.r * left.scale)).toBeCloseTo(16);
		expect(right.x).toBeCloseTo(81.5);
		expect(left.x).toBeCloseTo(-187);
		expect(left.y).toBe(right.y);
	});
	it('keeps mixed-size and asymmetrically padded bodies on the same slot feet line', () => {
		for (const dpr of [1, 1.25, 1.5, 2, 3]) {
			for (const [w, h, left, top, bodyWidth, bodyHeight] of [
				[64, 64, 20, 8, 24, 50],
				[80, 80, 16, 18, 20, 40],
				[160, 112, 70, 24, 24, 50]
			]) {
				const image = makeImg(w, h);
				image.data[(top * w + left) * 4 + 3] = 255;
				image.data[((top + bodyHeight - 1) * w + left + bodyWidth - 1) * 4 + 3] = 255;
				const still = {
					image,
					frame: { w, h, x: w / 2, y: h },
					body: {
						w: bodyWidth,
						h: bodyHeight,
						x: w / 2 - left,
						y: h - top
					}
				};
				const art = groundedThumb(320, still, dpr);
				const anchors = thumbAnchors(320, still, dpr);
				expect(anchors.ground.x * art.scale + art.x).toBeCloseTo(0);
				expect(anchors.ground.y * art.scale + art.y).toBeCloseTo(0);
				expect(art.t).toBeCloseTo(-250);
				expect(art.b).toBeCloseTo(0);
				for (const offset of [-1, 0, 1]) {
					const pose = castPose(offset, 1000, 320);
					expect(art.b * pose.scale + pose.y).toBeCloseTo(offset ? -12 : 0);
				}
			}
		}
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
