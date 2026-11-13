import { describe, expect, test } from 'vitest';
import { worldArt } from '../../src/studio/experience/config.ts';
import { castPose } from '../../src/studio/experience/carousel.ts';
import { heroRoom, heroScale, layout, placeWorld } from '../../src/studio/experience/geometry.ts';
import { planLineup } from '../../src/studio/experience/lineup.ts';
import {
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
	/** One screen's zoom with this fit, the other screen's fit and the ceiling the session reached. */
	const zoom = (stored: number | null, fit: number, other = 0, ceiling = 0): SceneZoom =>
		resolveZoom(stored, fit, [other], ceiling);
	/** Step `count` times one way, then the same count back, from `start`. */
	function roundTrip(start: SceneZoom, direction: 1 | -1, count: number) {
		const at = (scale: number) => resolveZoom(scale, start.fit, start.stops, start.max);
		let shown = start;
		const path = [shown.scale];
		for (let i = 0; i < count; i++) path.push((shown = at(zoomStep(shown, direction))).scale);
		const back = [];
		for (let i = 0; i < count; i++)
			back.push((shown = at(zoomStep(shown, direction === 1 ? -1 : 1))).scale);
		return { path, back };
	}

	test('the ladder holds every whole multiple, with even steps of at most 25% between them', () => {
		expect(zoomLadder(12).map((level) => Math.round(level * 100))).toEqual([
			100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200
		]);
		const big = zoomLadder(40);
		for (let whole = 1; whole <= 40; whole++) expect(big).toContain(whole);
		for (let i = 1; i < big.length; i++) {
			expect(big[i]).toBeGreaterThan(big[i - 1]);
			expect(big[i] / big[i - 1]).toBeLessThanOrEqual(1.25 + 1e-9);
		}
	});

	test.each([
		[0.75, 0],
		[1, 0],
		[2.5, 3],
		[3.333, 4],
		[3.6, 4],
		[3.96, 3.6],
		[4, 3],
		[7.2, 6],
		[12.5, 9],
		[20, 16]
	])(
		'from a %s fit (other screen %s), every step one way and back retraces exactly',
		(fit, other) => {
			const start = zoom(null, fit, other);
			expect(start.scale, 'the default keeps the fit exactly').toBe(fit);
			expect(start.zoomed).toBe(false);
			const levels = zoomLevels(start);
			for (const [direction, count] of [
				[-1, levels.filter((level) => level < fit).length],
				[1, levels.filter((level) => level > fit).length]
			] as const)
				for (let n = 1; n <= count; n++) {
					const { path, back } = roundTrip(start, direction, n);
					expect(new Set(path).size, 'every step reaches a new level').toBe(n + 1);
					expect(back, 'stepping back retraces the same levels').toEqual(
						path.slice(0, -1).reverse()
					);
				}
			expect(levels[0]).toBe(Math.min(1, fit, other || Infinity));
			for (let whole = 1; whole <= start.max; whole++) expect(levels).toContain(whole);
			expect(levels).toContain(fit);
			// The other screen's fit is a stop unless a level already sits within 3% of it.
			if (other && !levels.includes(other))
				expect(levels.some((level) => Math.abs(level - other) <= 0.03 * other)).toBe(true);
		}
	);

	test('both screens step through the same levels, so a level reached on one retraces on the other', () => {
		const characters = zoom(null, 3.75, 2.4),
			customize = zoom(null, 2.4, 3.75);
		expect(zoomLevels(characters)).toEqual(zoomLevels(customize));
		// 375% (Characters' fit) chosen there, then stepped on Customize, returns to 375% exactly.
		const chosen = resolveZoom(3.75, 2.4, [3.75], 0);
		expect(zoomStep(resolveZoom(zoomStep(chosen, 1), 2.4, [3.75], 0), -1)).toBe(3.75);
		expect(zoomStep(resolveZoom(zoomStep(chosen, -1), 2.4, [3.75], 0), 1)).toBe(3.75);
	});

	test("the other screen's fit is dropped when a level sits within 3%, so no step is invisible", () => {
		// 1440x900: Characters fits at 696.6%, Customize at 700%.
		const customize = zoom(null, 7, 6.966);
		expect(zoomLevels(customize)).not.toContain(6.966);
		expect(zoomLevels(customize)).toContain(7);
		// Its own fit always stays, even beside a whole multiple.
		expect(zoomLevels(zoom(null, 6.966, 7))).toEqual(expect.arrayContaining([6.966, 7]));
	});

	test('a chosen scale reads the same on both screens, and controls show only away from each fit', () => {
		const ceiling = zoomCeiling(zoomCeiling(0, 3.6), 4);
		expect(ceiling).toBe(8);
		const characters = resolveZoom(4, 3.6, [4], ceiling),
			customize = resolveZoom(4, 4, [3.6], ceiling);
		expect([characters.scale, customize.scale]).toEqual([4, 4]);
		expect(characters.max).toBe(customize.max);
		expect(characters.zoomed, '400% on a 360% fit shows the controls').toBe(true);
		expect(customize.zoomed, '400% on a 400% fit is the default view').toBe(false);
		// The ceiling only grows: a smaller window later never clamps a level chosen earlier.
		expect(zoomCeiling(ceiling, 2)).toBe(8);
		expect(resolveZoom(7, 2, [], ceiling).scale).toBe(7);
		// Unzoomed, each screen shows its own fit.
		expect(resolveZoom(null, 3.6, [4], ceiling).scale).toBe(3.6);
		expect(resolveZoom(null, 4, [3.6], ceiling).scale).toBe(4);
	});

	test('a scale between levels steps to the nearest level that way', () => {
		const pinched = zoom(4.4, 3.6);
		expect(zoomStep(pinched, 1)).toBe(5);
		expect(zoomStep(pinched, -1)).toBe(4);
		expect(zoomStep(zoom(3.7, 3.6), -1)).toBe(3.6);
	});

	test('bounds run from 100% (or a smaller fit) to at least twice every fit', () => {
		expect(zoom(0.2, 3).scale).toBe(1);
		expect(zoom(50, 3).scale).toBe(6);
		expect(zoom(50, 3, 4).scale).toBe(8);
		expect(zoom(null, 0.75)).toMatchObject({ min: 0.75, scale: 0.75 });
		expect(zoom(0.5, 0.75).scale).toBe(0.75);
		expect(zoomStep(zoom(1, 3), -1)).toBe(1);
		expect(zoomStep(zoom(6, 3), 1)).toBe(6);
	});

	test('a pinch settles on a fit or a whole multiple within 4%, else stays exact', () => {
		const at = zoom(null, 3.6, 2.4);
		expect(settleZoom(at, 3.7)).toBe(3.6);
		expect(settleZoom(at, 2.45)).toBe(2.4);
		expect(settleZoom(at, 5.1)).toBe(5);
		expect(settleZoom(at, 4.6)).toBe(4.6);
		expect(settleZoom(at, 0.4)).toBe(1);
	});
});
