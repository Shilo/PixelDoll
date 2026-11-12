import { describe, expect, test } from 'vitest';
import { worldArt } from '../../src/studio/experience/config.ts';
import { castPose } from '../../src/studio/experience/carousel.ts';
import { heroRoom, heroScale, layout, placeWorld } from '../../src/studio/experience/geometry.ts';
import { planLineup } from '../../src/studio/experience/lineup.ts';
import { sceneArtFits, sceneCamera, zoomBox, zoomPoint } from '../../src/studio/experience/zoom.ts';

const anchor = { x: 400, y: 400 };
const backdrop = { x: -200, y: -200, scale: 1, eye: 200, coverBottom: 600, centered: true };
const options = {
	anchor,
	backdrop,
	plate: { width: 1200, height: 1000 },
	viewport: { l: 0, t: 0, r: 800, b: 600 },
	clearance: { l: 40, t: 100, r: 760, b: 500 },
	art: [{ l: 300, t: 200, r: 500, b: 450 }]
};

describe('finite scene camera', () => {
	test('a full Preview lineup can zoom while edge companions cull at their baseline offsets', () => {
		const geometry = layout(1440, 900, 'studio');
		const body = { w: 24, h: 50, x: 12, y: 50 };
		const row = planLineup({
			available: ['south', 'south-east', 'east', 'north-east', 'north'],
			selected: 'south',
			body,
			reach: body,
			room: heroRoom(geometry),
			width: geometry.stage.r
		});
		expect(row.facings).toHaveLength(5);
		const boxes = row.offsets.map((offset) => ({
			l: geometry.feet.x + offset - body.x * row.scale,
			r: geometry.feet.x + offset + (body.w - body.x) * row.scale,
			t: geometry.feet.y - body.y * row.scale,
			b: geometry.feet.y
		}));
		const selected = row.facings.indexOf('south');
		const plate = worldArt('dark');
		const clearance = {
			l: geometry.stage.l + 8,
			r: geometry.stage.r - 8,
			t: geometry.stage.t + 16,
			b: geometry.playbackTop - 2
		};
		const camera = sceneCamera({
			...options,
			value: 1.5,
			anchor: geometry.feet,
			backdrop: placeWorld(geometry, plate, geometry.feet, body.y * row.scale),
			plate,
			viewport: { l: 0, t: 0, r: geometry.w, b: geometry.h },
			clearance,
			art: [boxes[selected]]
		});
		expect(camera.max).toBe(1.5);
		expect(camera.value).toBe(1.5);
		expect(sceneArtFits(boxes[selected], camera, clearance)).toBe(true);
		expect(boxes.filter((box) => sceneArtFits(box, camera, clearance)).length).toBeLessThan(
			boxes.length
		);
	});

	test.each([
		[1280, 720],
		[1440, 900],
		[1920, 1080]
	])('selection at %sx%s has useful zoom without fitting faded reflections', (width, height) => {
		const geometry = layout(width, height, 'characters');
		const scale = heroScale(geometry, 50, 48);
		const size = 64 * scale;
		const pose = castPose(0, geometry.stage.r - geometry.stage.l, size, size * 0.56);
		const shownSize = size * pose.scale;
		const plate = worldArt('dark');
		const base = placeWorld(geometry, plate, geometry.feet, 50 * scale * pose.scale);
		const camera = sceneCamera({
			...options,
			value: 1.5,
			anchor: geometry.feet,
			backdrop: base,
			plate,
			viewport: { l: 0, t: 0, r: width, b: base.coverBottom },
			clearance: {
				l: geometry.stage.l,
				r: geometry.stage.r,
				t: geometry.headerBottom + 16,
				b: height
			},
			art: [
				{
					l: geometry.feet.x - shownSize / 2,
					r: geometry.feet.x + shownSize / 2,
					t: geometry.feet.y - shownSize,
					b: geometry.feet.y
				}
			]
		});
		expect(camera.max).toBeGreaterThan(1.2);
		expect(camera.value).toBeGreaterThan(1.2);
	});

	test('mobile world eye line uses the capped cast size, not its uncapped layout scale', () => {
		const geometry = layout(390, 844, 'characters');
		const scale = heroScale(geometry, 50, 48);
		const pose = castPose(
			0,
			geometry.stage.r,
			64 * scale,
			64 * Math.max(1, Math.round(scale * 0.56))
		);
		const hero = 50 * scale * pose.scale;
		expect(pose.scale).toBeLessThan(1);
		expect(hero).toBeCloseTo((50 * geometry.stage.r * 0.48) / 64);
		const base = placeWorld(geometry, worldArt('dark'), geometry.feet, hero);
		expect(base.eye).toBeCloseTo(geometry.feet.y - hero * 0.86);
	});

	test('preserves the default placement exactly and resets to one', () => {
		const camera = sceneCamera({ ...options, value: 1 });
		expect(camera.backdrop).toBe(backdrop);
		expect(camera.value).toBe(1);
		expect(zoomBox(options.art[0], anchor, 1)).toEqual(options.art[0]);
	});

	test('derives the lower limit from the tightest plate margin', () => {
		const camera = sceneCamera({ ...options, value: 0.1 });
		expect(camera.min).toBeCloseTo(2 / 3);
		expect(camera.value).toBe(camera.min);
		expect(camera.backdrop.x).toBeCloseTo(0);
		expect(camera.backdrop.y).toBeCloseTo(0);
	});

	test('a plate already touching an edge prohibits zooming out', () => {
		const camera = sceneCamera({ ...options, backdrop: { ...backdrop, x: 0 }, value: 0.5 });
		expect(camera.min).toBe(1);
		expect(camera.value).toBe(1);
	});

	test('fits selected actor and ring bounds, not the decorative reflection', () => {
		const camera = sceneCamera({
			...options,
			value: 1.5,
			art: [...options.art, { l: 100, t: 250, r: 700, b: 480 }]
		});
		expect(camera.max).toBeCloseTo(1.2);
		expect(camera.value).toBe(camera.max);
		const ring = zoomBox({ l: 100, t: 250, r: 700, b: 480 }, anchor, camera.value);
		expect(ring.l).toBeCloseTo(options.clearance.l);
		expect(ring.r).toBeCloseTo(options.clearance.r);
		expect(ring.b).toBeLessThanOrEqual(options.clearance.b);
	});

	test('bounds zoom by header clearance and never above 150%', () => {
		expect(sceneCamera({ ...options, value: 3 }).value).toBe(1.5);
		const camera = sceneCamera({
			...options,
			value: 1.5,
			art: [{ l: 300, t: 150, r: 500, b: 450 }]
		});
		expect(camera.max).toBe(1.2);
		expect(zoomBox({ l: 300, t: 150, r: 500, b: 450 }, anchor, camera.value).t).toBe(100);
	});

	test('does not change an already clipped actor default to manufacture zoom room', () => {
		const camera = sceneCamera({
			...options,
			value: 1.5,
			art: [{ l: 300, t: 200, r: 500, b: 550 }]
		});
		expect(camera.max).toBe(1);
		expect(camera.value).toBe(1);
		expect(camera.backdrop).toBe(backdrop);
	});

	test('transforms plate, eye line, art and pick boxes by the same uniform camera', () => {
		const camera = sceneCamera({ ...options, value: 1.25 });
		expect(zoomPoint(anchor, anchor, camera.value)).toEqual(anchor);
		expect(camera.backdrop.scale).toBe(1.25);
		expect(camera.backdrop.x).toBe(zoomPoint(backdrop, anchor, camera.value).x);
		expect(camera.backdrop.eye).toBe(zoomPoint({ x: 0, y: backdrop.eye }, anchor, camera.value).y);
		const target = zoomBox(options.art[0], anchor, camera.value);
		expect(target.r - target.l).toBe((options.art[0].r - options.art[0].l) * camera.value);
		expect(target.b - target.t).toBe((options.art[0].b - options.art[0].t) * camera.value);
		expect(zoomBox(target, anchor, 1 / camera.value)).toEqual(options.art[0]);
	});

	test('culls companions without changing their original offsets or the selected actor scale', () => {
		const companion = { l: 50, t: 200, r: 250, b: 450 };
		const camera = sceneCamera({ ...options, value: 1.5 });
		expect(camera.max).toBe(1.5);
		expect(sceneArtFits(companion, { anchor, value: 1 }, options.clearance)).toBe(true);
		expect(sceneArtFits(companion, camera, options.clearance)).toBe(false);
		expect(sceneArtFits(options.art[0], camera, options.clearance)).toBe(true);
		expect(zoomBox(companion, anchor, camera.value)).toEqual({ l: -125, t: 100, r: 175, b: 475 });
		expect(companion).toEqual({ l: 50, t: 200, r: 250, b: 450 });
	});

	test.each([NaN, Infinity, -Infinity])('rejects nonfinite requested zoom %s', (value) => {
		expect(sceneCamera({ ...options, value }).value).toBe(1);
	});

	for (const theme of ['dark', 'light'] as const)
		for (const screen of ['characters', 'studio'] as const)
			for (const [width, height] of [
				[320, 568],
				[390, 844],
				[844, 390],
				[768, 1024],
				[1280, 720],
				[1920, 1080]
			]) {
				test(`${theme} ${screen} ${width}x${height} never reveals a plate edge`, () => {
					const geometry = layout(width, height, screen);
					const plate = worldArt(theme);
					const base = placeWorld(geometry, plate, geometry.feet, 50 * heroScale(geometry, 50, 48));
					const camera = sceneCamera({
						...options,
						value: 0,
						anchor: geometry.feet,
						backdrop: base,
						plate,
						viewport: { l: 0, t: 0, r: width, b: base.coverBottom }
					});
					const result = camera.backdrop;
					expect(camera.min).toBeGreaterThan(0);
					expect(camera.min).toBeLessThanOrEqual(1);
					expect(result.x).toBeLessThanOrEqual(1e-9);
					expect(result.y).toBeLessThanOrEqual(1e-9);
					expect(result.x + result.scale * plate.width).toBeGreaterThanOrEqual(width - 1e-9);
					expect(result.y + result.scale * plate.height).toBeGreaterThanOrEqual(
						base.coverBottom - 1e-9
					);
				});
			}
});
