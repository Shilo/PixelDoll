import { describe, expect, it } from 'vitest';
import {
	castHitReach,
	castPose,
	castTransform,
	carouselFrames,
	carouselRoute
} from '../../src/studio/experience/carousel.ts';
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
					const gap = side.x - (sideSize * span) / 2 - (heroSize * span) / 2;
					expect(sideSize / heroSize).toBeCloseTo(0.75);
					expect(side.y).toBeCloseTo(-heroSize * 0.0625);
					expect(gap).toBeCloseTo(Math.max(16, Math.min(80, heroSize * 0.18)));
					expect(side.x + (sideSize * span) / 2 + gap).toBeLessThanOrEqual(stage / 2 + 1e-8);
				}
			}
		}
	});
	it('centers one character and keeps companions slightly smaller and higher', () => {
		expect(castPose(0, 1200, 320)).toEqual({ x: 0, y: 0, scale: 1 });
		expect(castPose(-1, 1200, 320)).toEqual({ x: -337.6, y: -20, scale: 0.75 });
		expect(castPose(1, 1200, 320)).toEqual({ x: 337.6, y: -20, scale: 0.75 });
	});
	it('uses painted silhouettes instead of transparent frame padding for closer horizontal slots', () => {
		const full = castPose(1, 1200, 320);
		const trimmed = castPose(1, 1200, 320, 0.6);
		expect(trimmed.x).toBeCloseTo(225.6);
		expect(trimmed.x).toBeLessThan(full.x * 0.7);
		expect(trimmed.y).toBe(full.y);
		expect(trimmed.scale).toBe(full.scale);
	});
	it('packs asymmetric silhouettes with the same comfortable gap on both sides', () => {
		const hero = { l: -120, r: 40 };
		const side = { l: -30, r: 60 };
		const right = castPose(1, 1200, 320, 1, { hero, side });
		const left = castPose(-1, 1200, 320, 1, { hero, side });
		expect(right.x + side.l * right.scale - hero.r).toBeCloseTo(57.6);
		expect(hero.l - (left.x + side.r * left.scale)).toBeCloseTo(57.6);
		expect(right.x).toBeCloseTo(120.1);
		expect(left.x).toBeCloseTo(-222.6);
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
					const pose = castPose(offset, 1200, 320);
					expect(art.b * pose.scale + pose.y).toBeCloseTo(offset ? -20 : 0);
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
		expect(castPose(0, 300, 320).scale).toBeCloseTo(300 / 3.22 / 320);
		expect(castPose(1, 300, 320).scale).toBeCloseTo((300 / 3.22 / 320) * 0.75);
	});
	it('bounds wraps to virtual slots with an invisible midpoint and independently eased legs', () => {
		for (const direction of [-1, 1]) {
			for (const width of [300, 1000, 3440]) {
				const slots = {
					exit: castPose(-2 * direction, width, 320),
					enter: castPose(2 * direction, width, 320)
				};
				const from = {
					transform: castTransform(castPose(-direction, width, 320)),
					opacity: '0.7'
				};
				const target = castPose(direction, width, 320);
				const frames = carouselFrames(from, target, slots, true);
				expect(frames).toHaveLength(4);
				expect(frames[0]).toMatchObject(from);
				expect(frames[1]).toMatchObject({
					transform: castTransform(slots.exit),
					opacity: 0,
					offset: 0.5
				});
				expect(frames[2]).toMatchObject({
					transform: castTransform(slots.enter),
					opacity: 0,
					offset: 0.5
				});
				expect(frames[0].easing).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
				expect(frames[2].easing).toBe(frames[0].easing);
				expect(frames[3]).toEqual({ transform: castTransform(target), opacity: 1 });
				expect(Math.sign(slots.exit.x)).toBe(-direction);
				expect(Math.sign(slots.enter.x)).toBe(direction);
				expect(Math.abs(slots.enter.x)).toBeCloseTo(2 * Math.abs(target.x));
			}
		}
	});
	it('splits the painted gap between neighbors at its midpoint without overlap', () => {
		for (const [span, heroArt, rightArt, leftArt] of [
			[1, { l: -120, r: 40 }, { l: -30, r: 60 }, { l: -60, r: 30 }],
			[0.6, { l: -150, r: 150 }, { l: -150, r: 150 }, { l: -150, r: 150 }],
			[1.5, { l: -40, r: 110 }, { l: -90, r: 20 }, { l: -20, r: 90 }]
		] as const) {
			const width = 1000;
			const size = 320;
			const heroPose = castPose(0, width, size, span, { hero: heroArt, side: leftArt });
			const leftPose = castPose(-1, width, size, span, { hero: heroArt, side: leftArt });
			const rightPose = castPose(1, width, size, span, { hero: heroArt, side: rightArt });
			const slots = [
				{ id: 'left', ...leftPose, ...leftArt },
				{ id: 'hero', ...heroPose, ...heroArt },
				{ id: 'right', ...rightPose, ...rightArt }
			];
			const reach = castHitReach(slots);
			const edge = (slot: (typeof slots)[number], side: 'l' | 'r') => {
				const extra = side === 'l' ? reach.get(slot.id)!.left : reach.get(slot.id)!.right;
				return slot.x + slot.scale * (side === 'l' ? slot.l - extra : slot.r + extra);
			};
			for (const [a, b] of [
				[slots[0], slots[1]],
				[slots[1], slots[2]]
			]) {
				const paintedLeft = a.x + a.scale * a.r;
				const paintedRight = b.x + b.scale * b.l;
				expect(edge(a, 'r')).toBeCloseTo((paintedLeft + paintedRight) / 2);
				expect(edge(b, 'l')).toBeCloseTo((paintedLeft + paintedRight) / 2);
				expect(edge(b, 'l')).toBeGreaterThanOrEqual(paintedLeft);
				expect(edge(a, 'r')).toBeLessThanOrEqual(paintedRight);
			}
		}
	});
	it('leaves already overlapping or gapped-out silhouettes without added hit reach', () => {
		const reach = castHitReach([
			{ id: 'wide', x: 0, scale: 1, l: -100, r: 100 },
			{ id: 'close', x: 120, scale: 1, l: -50, r: 50 }
		]);
		expect(reach.get('wide')).toEqual({ left: 0, right: 0 });
		expect(reach.get('close')).toEqual({ left: 0, right: 0 });
		const single = castHitReach([{ id: 'only', x: 0, scale: 1, l: -20, r: 20 }]);
		expect(single.get('only')).toEqual({ left: 0, right: 0 });
	});
	it('adds no hit reach while the cast has no measurable scale', () => {
		const slots = [-1, 0, 1].map((offset) => ({
			id: `slot${offset}`,
			...castPose(offset, 0, 320),
			l: -100,
			r: 100
		}));
		const reach = castHitReach(slots);
		for (const slot of slots) expect(reach.get(slot.id)).toEqual({ left: 0, right: 0 });
	});
	it('retargets from the sampled pose instead of restarting', () => {
		const current = { transform: 'matrix(0.8, 0, 0, 0.8, 123, -15)', opacity: '0.7' };
		const slots = { exit: castPose(2, 1000, 320), enter: castPose(-2, 1000, 320) };
		const frames = carouselFrames(current, { x: 0, y: 0, scale: 1 }, slots, false);
		expect(frames).toHaveLength(2);
		expect(frames[0]).toEqual(current);
	});
	it('plans pair, trio, and two-step routes in both strip directions including hero arrivals', () => {
		for (const direction of [-1, 1]) {
			for (const [from, to, shift, wrap] of [
				[0, -1, -1, false],
				[-1, 0, -1, true],
				[-1, 1, -1, true],
				[1, 0, -1, false],
				[1, -1, -2, false],
				[-1, 0, -2, true]
			] as const) {
				const route = carouselRoute(from * direction, to * direction, shift * direction);
				expect(route).toEqual({ wrap, exit: -2 * direction, enter: 2 * direction });
				if (!wrap) continue;
				const frames = carouselFrames(
					{ transform: castTransform(castPose(from * direction, 1000, 320)), opacity: '1' },
					castPose(to * direction, 1000, 320),
					{ exit: castPose(route.exit, 1000, 320), enter: castPose(route.enter, 1000, 320) },
					route.wrap
				);
				expect(frames[1]).toMatchObject({ opacity: 0, offset: 0.5 });
				expect(frames[2]).toMatchObject({ opacity: 0, offset: 0.5 });
			}
		}
	});
});
