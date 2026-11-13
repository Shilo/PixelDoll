import { describe, expect, test } from 'vitest';
import { worldArt } from '../../src/studio/experience/config.ts';
import { castPose } from '../../src/studio/experience/carousel.ts';
import { heroRoom, heroScale, layout, placeWorld } from '../../src/studio/experience/geometry.ts';
import { planLineup } from '../../src/studio/experience/lineup.ts';
import {
	ZOOM_MAX,
	ZOOM_MIN,
	sceneArtFits,
	sceneCamera,
	ZOOM_STEPS,
	zoomBox,
	zoomPoint,
	zoomStep
} from '../../src/studio/experience/zoom.ts';

const anchor = { x: 400, y: 400 };
const backdrop = { x: -200, y: -200, scale: 1, eye: 200, coverBottom: 600, centered: true };
const options = {
	anchor,
	backdrop,
	plate: { width: 1200, height: 1000 },
	viewport: { l: 0, t: 0, r: 800, b: 600 }
};
const clearance = { l: 40, t: 100, r: 760, b: 500 };
const target = { l: 300, t: 200, r: 500, b: 450 };

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
			viewport: { l: 0, t: 0, r: geometry.w, b: geometry.h }
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
		[1920, 1080],
		[390, 844],
		[844, 390]
	])('selection and Customize at %sx%s share the same zoom bounds', (width, height) => {
		const plate = worldArt('dark');
		for (const screen of ['characters', 'studio'] as const) {
			const geometry = layout(width, height, screen);
			const base = placeWorld(geometry, plate, geometry.feet, 50 * heroScale(geometry, 50, 48));
			const camera = (value: number) =>
				sceneCamera({
					value,
					anchor: geometry.feet,
					backdrop: base,
					plate,
					viewport: { l: 0, t: 0, r: width, b: base.coverBottom }
				});
			expect(camera(1.5).value, `${screen}: 150% is reachable`).toBe(ZOOM_MAX);
			expect(camera(3).value, `${screen}: capped at 150%`).toBe(ZOOM_MAX);
			expect(camera(0.1).value, `${screen}: floored at 50%`).toBe(ZOOM_MIN);
			expect([camera(1).min, camera(1).max]).toEqual([ZOOM_MIN, ZOOM_MAX]);
		}
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
		expect(zoomBox(target, anchor, 1)).toEqual(target);
	});

	test('stops the background at the tightest plate margin while characters shrink to their minimum', () => {
		const camera = sceneCamera({ ...options, value: 0.1 });
		expect(camera.min).toBe(ZOOM_MIN);
		expect(camera.value).toBe(camera.min);
		expect(camera.backdrop.scale).toBeCloseTo((backdrop.scale * 2) / 3);
		expect(camera.backdrop.x).toBeCloseTo(0);
		expect(camera.backdrop.y).toBeCloseTo(0);
		// Both zoom together down to the background's limit.
		const together = sceneCamera({ ...options, value: 0.8 });
		expect(together.backdrop.scale).toBeCloseTo(backdrop.scale * 0.8);
	});

	test('a plate already touching an edge keeps the background at fit while characters still zoom out', () => {
		const camera = sceneCamera({ ...options, backdrop: { ...backdrop, x: 0 }, value: 0.1 });
		expect(camera.min).toBe(ZOOM_MIN);
		expect(camera.value).toBe(ZOOM_MIN);
		expect(camera.backdrop).toEqual({ ...backdrop, x: 0 });
		// The characters' grounded anchor never moves, so their feet stay on the unchanged floor.
		expect(zoomPoint(anchor, anchor, camera.value)).toEqual(anchor);
	});

	test('the selected actor may grow past its clearance; the bounds never depend on it', () => {
		const camera = sceneCamera({ ...options, value: 1.5 });
		expect(camera.value).toBe(1.5);
		// A tall selected actor that reaches near the header at the fit.
		const tall = { l: 300, t: 150, r: 500, b: 450 };
		expect(sceneArtFits(tall, { anchor, value: 1 }, clearance)).toBe(true);
		expect(sceneArtFits(tall, camera, clearance)).toBe(false);
	});

	test('transforms plate, eye line, art and pick boxes by the same uniform camera', () => {
		const camera = sceneCamera({ ...options, value: 1.25 });
		expect(zoomPoint(anchor, anchor, camera.value)).toEqual(anchor);
		expect(camera.backdrop.scale).toBe(1.25);
		expect(camera.backdrop.x).toBe(zoomPoint(backdrop, anchor, camera.value).x);
		expect(camera.backdrop.eye).toBe(zoomPoint({ x: 0, y: backdrop.eye }, anchor, camera.value).y);
		const shown = zoomBox(target, anchor, camera.value);
		expect(shown.r - shown.l).toBe((target.r - target.l) * camera.value);
		expect(shown.b - shown.t).toBe((target.b - target.t) * camera.value);
		expect(zoomBox(shown, anchor, 1 / camera.value)).toEqual(target);
	});

	test('culls companions without changing their original offsets or the selected actor scale', () => {
		const companion = { l: 50, t: 200, r: 250, b: 450 };
		const camera = sceneCamera({ ...options, value: 1.5 });
		expect(camera.max).toBe(1.5);
		expect(sceneArtFits(companion, { anchor, value: 1 }, clearance)).toBe(true);
		expect(sceneArtFits(companion, camera, clearance)).toBe(false);
		expect(sceneArtFits(target, camera, clearance)).toBe(true);
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
					expect(camera.min).toBe(ZOOM_MIN);
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

describe('zoom steps', () => {
	test('stepping out and back in retraces the same levels to exactly 100%', () => {
		const below = ZOOM_STEPS.filter((level) => level < 1).length,
			above = ZOOM_STEPS.filter((level) => level > 1).length;
		for (const [direction, levels] of [
			[-1, below],
			[1, above]
		] as const)
			for (let count = 1; count <= levels; count++) {
				let value = 1;
				const path = [1];
				for (let i = 0; i < count; i++) path.push((value = zoomStep(value, direction, 0.5, 1.5)));
				expect(new Set(path).size, 'every step reaches a new level').toBe(count + 1);
				for (let i = count - 1; i >= 0; i--)
					expect((value = zoomStep(value, direction === 1 ? -1 : 1, 0.5, 1.5))).toBe(path[i]);
				expect(value).toBe(1);
			}
	});

	test('a value between levels steps to the nearest level that way', () => {
		expect(zoomStep(1.03, 1, 0.5, 1.5)).toBe(1.1);
		expect(zoomStep(1.03, -1, 0.5, 1.5)).toBe(1);
		expect(zoomStep(0.97, 1, 0.5, 1.5)).toBe(1);
	});

	test('a screen-specific bound between levels is reached, then left for the ladder', () => {
		expect(zoomStep(1.25, 1, 0.5, 1.37)).toBe(1.37);
		expect(zoomStep(1.37, 1, 0.5, 1.37)).toBe(1.37);
		expect(zoomStep(1.37, -1, 0.5, 1.37)).toBe(1.25);
		expect(zoomStep(1, 1, 0.5, 1)).toBe(1);
		expect(zoomStep(0.5, -1, 0.5, 1.5)).toBe(0.5);
	});
});
