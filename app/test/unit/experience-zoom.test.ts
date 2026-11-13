import { describe, expect, test } from 'vitest';
import { worldArt } from '../../src/studio/experience/config.ts';
import { castPose } from '../../src/studio/experience/carousel.ts';
import { heroRoom, heroScale, layout, placeWorld } from '../../src/studio/experience/geometry.ts';
import { planLineup } from '../../src/studio/experience/lineup.ts';
import {
	fitLevel,
	resolveZoom,
	sceneArtFits,
	sceneCamera,
	settleZoom,
	zoomBox,
	zoomCeiling,
	zoomLadder,
	zoomLevels,
	zoomPoint,
	zoomStep,
	type SceneZoom
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
		expect(camera.value).toBe(1.5);
		expect(sceneArtFits(boxes[selected], camera, clearance)).toBe(true);
		expect(boxes.filter((box) => sceneArtFits(box, camera, clearance)).length).toBeLessThan(
			boxes.length
		);
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
		expect(camera.value).toBe(0.1);
		expect(camera.backdrop.scale).toBeCloseTo((backdrop.scale * 2) / 3);
		expect(camera.backdrop.x).toBeCloseTo(0);
		expect(camera.backdrop.y).toBeCloseTo(0);
		// Both zoom together down to the background's limit.
		const together = sceneCamera({ ...options, value: 0.8 });
		expect(together.backdrop.scale).toBeCloseTo(backdrop.scale * 0.8);
	});

	test('a plate already touching an edge keeps the background at fit while characters still zoom out', () => {
		const camera = sceneCamera({ ...options, backdrop: { ...backdrop, x: 0 }, value: 0.1 });
		expect(camera.value).toBe(0.1);
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
		expect(sceneArtFits(companion, { anchor, value: 1 }, clearance)).toBe(true);
		expect(sceneArtFits(companion, camera, clearance)).toBe(false);
		expect(sceneArtFits(target, camera, clearance)).toBe(true);
		expect(zoomBox(companion, anchor, camera.value)).toEqual({ l: -125, t: 100, r: 175, b: 475 });
		expect(companion).toEqual({ l: 50, t: 200, r: 250, b: 450 });
	});

	test.each([NaN, Infinity, -Infinity, 0, -1])(
		'rejects a nonfinite or empty camera multiplier %s',
		(value) => {
			expect(sceneCamera({ ...options, value }).value).toBe(1);
		}
	);

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
						// 100% of a 20x fit: the deepest zoom-out a large screen allows.
						value: 0.05,
						anchor: geometry.feet,
						backdrop: base,
						plate,
						viewport: { l: 0, t: 0, r: width, b: base.coverBottom }
					});
					const result = camera.backdrop;
					expect(result.x).toBeLessThanOrEqual(1e-9);
					expect(result.y).toBeLessThanOrEqual(1e-9);
					expect(result.x + result.scale * plate.width).toBeGreaterThanOrEqual(width - 1e-9);
					expect(result.y + result.scale * plate.height).toBeGreaterThanOrEqual(
						base.coverBottom - 1e-9
					);
				});
			}
});

describe('absolute zoom', () => {
	const zoom = (stored: number | null, fit: number, ceiling = 0): SceneZoom =>
		resolveZoom(stored, fit, zoomCeiling(ceiling, fit));
	/** Step `count` times one way and back, returning every level visited and where it ends. */
	function roundTrip(start: SceneZoom, direction: 1 | -1, count: number) {
		let stored: number | null = start.zoomed ? start.scale : null;
		const at = (value: number | null) => resolveZoom(value, start.fit, start.max);
		const path = [at(stored).scale];
		for (let i = 0; i < count; i++) path.push(at((stored = zoomStep(at(stored), direction))).scale);
		const back = [];
		for (let i = 0; i < count; i++)
			back.push(at((stored = zoomStep(at(stored), direction === 1 ? -1 : 1))).scale);
		return { path, back, stored };
	}

	test('the ladder holds every whole multiple, with even steps of at most 25% between them', () => {
		const ladder = zoomLadder(12);
		expect(ladder.map((level) => Math.round(level * 100))).toEqual([
			100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200
		]);
		for (let whole = 1; whole <= 40; whole++) expect(zoomLadder(40)).toContain(whole);
		const big = zoomLadder(40);
		for (let i = 1; i < big.length; i++) {
			expect(big[i]).toBeGreaterThan(big[i - 1]);
			expect(big[i] / big[i - 1]).toBeLessThanOrEqual(1.25 + 1e-9);
		}
	});

	test('a fit within 3% of a whole multiple shows that multiple; others show exactly', () => {
		expect(fitLevel(3.96)).toBe(4);
		expect(fitLevel(4.1)).toBe(4);
		expect(fitLevel(3.6)).toBe(3.6);
		expect(fitLevel(2.5)).toBe(2.5);
		expect(fitLevel(0.75)).toBe(0.75);
	});

	test.each([0.75, 1, 2, 2.5, 3.333, 3.6, 3.96, 4, 7.2, 12.5, 20])(
		'from a %s fit, every step one way and back retraces the same levels to the fit',
		(fit) => {
			const start = zoom(null, fit);
			const levels = zoomLevels(start);
			const below = levels.filter((level) => level < start.fit).length;
			const above = levels.filter((level) => level > start.fit).length;
			for (const [direction, count] of [
				[-1, below],
				[1, above]
			] as const)
				for (let n = 1; n <= count; n++) {
					const { path, back, stored } = roundTrip(start, direction, n);
					expect(new Set(path).size, 'every step reaches a new level').toBe(n + 1);
					expect(back, 'stepping back retraces the same levels').toEqual(
						path.slice(0, -1).reverse()
					);
					expect(stored, 'back at the fit, nothing is stored').toBeNull();
				}
			expect(levels[0]).toBe(Math.min(1, start.fit));
			for (let whole = 1; whole <= start.max; whole++)
				if (whole >= start.min) expect(levels).toContain(whole);
		}
	);

	test('steps near the fit are never too small to see', () => {
		for (const fit of [1.3, 2.4, 3.6, 3.96, 5.5, 7.2]) {
			const levels = zoomLevels(zoom(null, fit));
			for (let i = 1; i < levels.length; i++)
				if (levels[i] !== Math.round(levels[i]) || levels[i - 1] !== Math.round(levels[i - 1]))
					expect(
						levels[i] / levels[i - 1],
						`${fit}: ${levels[i - 1]} to ${levels[i]}`
					).toBeGreaterThan(1.03);
		}
	});

	test('a scale between levels steps to the nearest level that way', () => {
		const pinched = zoom(4.4, 3.6);
		expect(zoomStep(pinched, 1)).toBe(5);
		expect(zoomStep(pinched, -1)).toBe(4);
		expect(zoomStep(zoom(3.7, 3.6), -1)).toBeNull();
	});

	test('both screens share the stored scale and one ceiling, so a level never reads differently', () => {
		const ceiling = zoomCeiling(zoomCeiling(0, 3.6), 4);
		const characters = resolveZoom(7, 3.6, ceiling),
			customize = resolveZoom(7, 4, ceiling);
		expect([characters.scale, customize.scale]).toEqual([7, 7]);
		expect(characters.max).toBe(customize.max);
		expect(ceiling).toBe(8);
		// It only grows: a smaller window later never clamps a level chosen earlier.
		expect(zoomCeiling(ceiling, 2)).toBe(8);
		// Unzoomed, each screen shows its own fit.
		expect(resolveZoom(null, 3.6, ceiling)).toMatchObject({ scale: 3.6, zoomed: false });
		expect(resolveZoom(null, 4, ceiling)).toMatchObject({ scale: 4, zoomed: false });
	});

	test('bounds run from 100% (or a smaller fit) to the shared ceiling', () => {
		expect(zoom(0.2, 3).scale).toBe(1);
		expect(zoom(50, 3).scale).toBe(6);
		expect(zoom(null, 0.75)).toMatchObject({ min: 0.75, scale: 0.75 });
		expect(zoom(0.5, 0.75).scale).toBe(0.75);
		expect(zoomStep(zoom(1, 3), -1)).toBe(1);
		expect(zoomStep(zoom(6, 3), 1)).toBe(6);
	});

	test('a pinch settles on the fit or a whole multiple within 4%, else stays exact', () => {
		const at = zoom(null, 3.6);
		expect(settleZoom(at, 3.7)).toBeNull();
		expect(settleZoom(at, 5.1)).toBe(5);
		expect(settleZoom(at, 4.6)).toBe(4.6);
		expect(settleZoom(at, 0.4)).toBe(1);
	});
});
