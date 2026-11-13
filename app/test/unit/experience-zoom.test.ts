import { describe, expect, test } from 'vitest';
import { worldArt } from '../../src/studio/experience/config.ts';
import { castPose } from '../../src/studio/experience/carousel.ts';
import { heroRoom, heroScale, layout, placeWorld } from '../../src/studio/experience/geometry.ts';
import { planLineup } from '../../src/studio/experience/lineup.ts';
import { thumbAnchors, thumbScale } from '../../src/studio/experience/thumbnails.svelte.ts';
import { framePosition } from '../../src/studio/experience/bounds.ts';
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
	test('nearly full-height framing stays continuous while resizing through capacity', () => {
		const center = { x: 200, y: 200 };
		const ground = { x: 200, y: 256 };
		const positions = [113, 112.000001, 112, 111.999999, 111].map((height) => {
			const camera = sceneCamera({
				...options,
				anchor: ground,
				center,
				value: 1.1,
				framing: { l: 0, r: 390, t: 158, b: 158 + height }
			});
			return zoomPoint(center, camera.anchor, camera.value, camera.offset);
		});
		for (let index = 1; index < positions.length; index++)
			expect(Math.abs(positions[index].y - positions[index - 1].y)).toBeLessThan(0.51);
	});

	test('translated magnification cannot expose a tightly covered plate edge', () => {
		const camera = sceneCamera({
			value: 1.001,
			anchor: { x: 100, y: 250 },
			center: { x: 100, y: 200 },
			framing: { l: 0, r: 400, t: 150, b: 251 },
			backdrop: { ...backdrop, x: 0, y: 0 },
			plate: { width: 400, height: 300 },
			viewport: { l: 0, r: 400, t: 0, b: 300 }
		});
		expect(camera.backdrop.x).toBeLessThanOrEqual(1e-9);
		expect(camera.backdrop.y).toBeLessThanOrEqual(1e-9);
		expect(camera.backdrop.x + camera.backdrop.scale * 400).toBeGreaterThanOrEqual(400 - 1e-9);
		expect(camera.backdrop.y + camera.backdrop.scale * 300).toBeGreaterThanOrEqual(300 - 1e-9);
	});

	test('magnification centers the painted body in the usable stage instead of preserving its low fit position', () => {
		const center = { x: 420, y: 350 };
		const framing = { l: 20, r: 700, t: 80, b: 460 };
		const camera = sceneCamera({ ...options, center, value: 4, framing });
		const shown = zoomPoint(center, camera.anchor, camera.value, camera.offset);
		expect(shown.x).toBeCloseTo((framing.l + framing.r) / 2, 8);
		expect(shown.y).toBeCloseTo((framing.t + framing.b) / 2, 8);
	});

	test.each([1, 1.25, 1.5, 2, 3])(
		'usable-space centering is continuous, reversible and pixel-padding independent at DPR %s',
		(dpr) => {
			const framing = { l: 0, r: 719, t: 76, b: 863 };
			const frame = { x: 32.5, y: 100 };
			const fit = 7;
			const drawn = framePosition(frame, { x: 410, y: 800 }, fit, dpr);
			const ground = { x: drawn.x + frame.x * fit, y: drawn.y + frame.y * fit };
			const height = 39 * fit;
			const center = { x: ground.x, y: ground.y - height / 2 };
			const midpoint = { x: (framing.l + framing.r) / 2, y: (framing.t + framing.b) / 2 };
			const fills = (framing.b - framing.t) / height;
			const at = (value: number) =>
				sceneCamera({ ...options, anchor: ground, center, framing, value });
			const shown = (value: number) => {
				const camera = at(value);
				return zoomPoint(center, camera.anchor, value, camera.offset);
			};
			for (const value of [1 - 1e-8, 1, 1 + 1e-8]) {
				expect(shown(value).x).toBeCloseTo(center.x, 5);
				expect(shown(value).y).toBeCloseTo(center.y, 5);
			}
			const halfway = shown((1 + fills) / 2);
			expect(halfway.x).toBeCloseTo((center.x + midpoint.x) / 2, 8);
			expect(halfway.y).toBeCloseTo((center.y + midpoint.y) / 2, 8);
			for (const value of [fills, fills + 1e-8, 16, fills]) {
				expect(shown(value).x).toBeCloseTo(midpoint.x, 8);
				expect(shown(value).y).toBeCloseTo(midpoint.y, 8);
			}
			for (const value of [0.1, 0.5, 1]) {
				const camera = at(value);
				expect(zoomPoint(ground, camera.anchor, value, camera.offset)).toEqual(ground);
			}
			const camera = at(fills);
			const body = { l: center.x - 20, r: center.x + 20, t: center.y - height / 2, b: ground.y };
			const box = zoomBox(body, camera.anchor, camera.value, camera.offset);
			expect(box.t).toBeCloseTo(framing.t, 8);
			expect(box.b).toBeCloseTo(framing.b, 8);
		}
	);

	test.each([380, 380.000001, 500])(
		'an already full-height body of %s stays finite and leaves fit continuously',
		(height) => {
			const framing = { l: 20, r: 700, t: 80, b: 460 };
			const center = { x: 420, y: anchor.y - height / 2 };
			const at = (value: number) => sceneCamera({ ...options, center, framing, value });
			const near = at(1 + 1e-8);
			expect(zoomPoint(center, near.anchor, near.value, near.offset).y).toBeCloseTo(center.y, 5);
			const full = at(2);
			expect(zoomPoint(center, full.anchor, full.value, full.offset)).toEqual({ x: 360, y: 270 });
		}
	);

	test.each([1, 1.25, 1.5, 2])(
		'odd-width body centers stay fixed through retained-ceiling zoom at DPR %s',
		(dpr) => {
			const frame = { x: 32.5, y: 64 };
			const fit = 3;
			const position = framePosition(frame, anchor, fit, dpr);
			const ground = { x: position.x + frame.x * fit, y: position.y + frame.y * fit };
			const center = { x: ground.x, y: ground.y - (39 * fit) / 2 };
			for (const value of [0.3, 2, 3, 4]) {
				const camera = sceneCamera({ ...options, anchor: ground, center, value });
				const fixed = value > 1 ? center : ground;
				expect(zoomPoint(fixed, camera.anchor, camera.value)).toEqual(fixed);
			}
		}
	);

	test.each([1.01, 2, 4])(
		'zoom-in %s keeps the painted body center fixed instead of pinning the head',
		(value) => {
			const center = { x: 380, y: 300 };
			const camera = sceneCamera({ ...options, value, center });
			expect(camera.anchor).toEqual(center);
			expect(zoomPoint(center, camera.anchor, camera.value)).toEqual(center);
			expect(camera.backdrop.scale).toBe(backdrop.scale * value);
		}
	);
	test.each([0.1, 0.5, 1])(
		'zoom-out %s keeps the body ground fixed regardless of the enlargement pivot',
		(value) => {
			const camera = sceneCamera({ ...options, value, center: { x: 380, y: 300 } });
			expect(camera.anchor).toEqual(anchor);
			expect(zoomPoint(anchor, camera.anchor, camera.value)).toEqual(anchor);
		}
	);

	test('crossing fit is continuous and reversing zoom does not change its position', () => {
		const center = { x: 380, y: 300 };
		for (const value of [1 - 1e-8, 1, 1 + 1e-8]) {
			const camera = sceneCamera({ ...options, value, center });
			const shown = zoomPoint(center, camera.anchor, camera.value);
			expect(shown.x).toBeCloseTo(center.x, 5);
			expect(shown.y).toBeCloseTo(center.y, 5);
		}
		const at = (value: number) => sceneCamera({ ...options, value, center });
		expect([2, 3, 2].map((value) => at(value).anchor)).toEqual([center, center, center]);
	});

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
				[568, 320],
				[390, 844],
				[844, 390],
				[768, 1024],
				[1024, 768],
				[1280, 720],
				[900, 1440],
				[1440, 900],
				[1920, 1080],
				[2560, 1080],
				[1080, 2560]
			]) {
				test(`${theme} ${screen} ${width}x${height} never reveals a plate edge`, () => {
					const geometry = layout(width, height, screen);
					const plate = worldArt(theme);
					const base = placeWorld(geometry, plate, geometry.feet, 50 * heroScale(geometry, 50, 48));
					for (const value of [0.05, 1, 1.01, 2, 4, 16]) {
						for (const shift of [-0.1, 0, 0.1]) {
							const height = 50 * heroScale(geometry, 50, 48);
							const ground = {
								x: geometry.feet.x + (geometry.stage.r - geometry.stage.l) * shift,
								y: geometry.feet.y
							};
							const camera = sceneCamera({
								...options,
								value,
								anchor: ground,
								center: { x: ground.x, y: ground.y - height / 2 },
								framing: {
									l: geometry.stage.l,
									r: geometry.stage.r,
									t: geometry.stage.t + 16,
									b: screen === 'studio' ? geometry.playbackTop - 2 : geometry.feet.y
								},
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
						}
					}
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

	test.each([
		[6.162, 7],
		[2.03, 3],
		[6.966, 7],
		[1.997, 3],
		[4.952, 2.4],
		[3.05, 3.5]
	])(
		'fits %s and %s give both screens one ladder, and every level retraces after switching',
		(a, b) => {
			const onA = (scale: number | null) => resolveZoom(scale, a, [b], 0),
				onB = (scale: number | null) => resolveZoom(scale, b, [a], 0);
			const levels = zoomLevels(onA(null));
			expect(zoomLevels(onB(null)), 'the same list on both screens').toEqual(levels);
			expect(levels).toEqual(expect.arrayContaining([a, b]));
			// Reach each level on one screen, switch, and step away and back on the other.
			for (const level of levels)
				for (const [here, there] of [
					[onA, onB],
					[onB, onA]
				]) {
					const shown = there(here(level).scale);
					for (const direction of [1, -1] as const) {
						const away = there(zoomStep(shown, direction));
						if (away.scale === shown.scale) continue;
						expect(zoomStep(away, direction === 1 ? -1 : 1), `${level} via the other screen`).toBe(
							level
						);
					}
				}
			// Every whole multiple stays and steps never exceed 25%.
			for (let whole = 1; whole <= levels.at(-1)!; whole++) expect(levels).toContain(whole);
			for (let i = 1; i < levels.length; i++) {
				expect(levels[i] / levels[i - 1]).toBeLessThanOrEqual(1.25 + 1e-9);
			}
		}
	);

	test('a fit appearing or changing after a level is chosen never removes that level', () => {
		// Characters fits at 320% before Customize is seen; 250% is chosen; Customize then fits at 245%.
		const before = resolveZoom(2.5, 3.2, [0], 0);
		expect(zoomLevels(before)).toContain(2.5);
		const after = resolveZoom(2.5, 2.45, [3.2], 0);
		expect(zoomStep(resolveZoom(zoomStep(after, -1), 2.45, [3.2], 0), 1)).toBe(2.5);
		expect(zoomStep(resolveZoom(zoomStep(after, 1), 2.45, [3.2], 0), -1)).toBe(2.5);
	});

	test('a chosen scale is shown as chosen, even after the fit that allowed it has grown', () => {
		const chosen = resolveZoom(0.8, 0.9, [2], 8);
		expect(chosen.scale).toBe(0.8);
		expect(chosen.min).toBe(0.8);
		expect(resolveZoom(9, 3, [], 6).scale, 'or after a ceiling it reached').toBe(9);
	});

	test('a fit is kept exactly, even right beside a ladder level', () => {
		expect(resolveZoom(null, 2.997, [], 0).scale).toBe(2.997);
		expect(zoomLevels(resolveZoom(null, 6.966, [], 0))).toEqual(expect.arrayContaining([6.966, 7]));
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

	test('at a bound, a step returns the same scale, which the input then ignores', () => {
		const smallFit = zoom(null, 0.8, 3);
		expect(zoomStep(smallFit, -1), 'at the minimum, zooming out stays put').toBe(smallFit.scale);
	});

	test('input stays from 100% (or a smaller fit) to at least twice every fit', () => {
		expect(zoom(null, 3)).toMatchObject({ min: 1, max: 6 });
		expect(zoom(null, 3, 4)).toMatchObject({ min: 1, max: 8 });
		expect(zoom(null, 0.75)).toMatchObject({ min: 0.75, scale: 0.75 });
		expect(zoomStep(zoom(1, 3), -1)).toBe(1);
		expect(zoomStep(zoom(6, 3), 1)).toBe(6);
		expect(zoomStep(zoom(null, 0.75), -1)).toBe(0.75);
		expect(settleZoom(zoom(null, 3), 9)).toBe(6);
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

describe('character thumbnail scale', () => {
	test.each([1, 1.25, 2])(
		'asymmetric non-square padding uses the body ground and center at DPR %s',
		(dpr) => {
			const padded = {
				image: { w: 80, h: 112, data: new Uint8ClampedArray(0) },
				frame: { w: 80, h: 112, x: 40, y: 100 },
				body: { w: 12, h: 32, x: 23, y: 77 }
			};
			const scale = thumbScale(160, padded, dpr);
			const anchors = thumbAnchors(160, padded, dpr);
			expect(anchors.ground).toEqual({ x: -17 * scale, y: -57 * scale });
			expect(anchors.center).toEqual({ x: -17 * scale, y: -73 * scale });
			const camera = sceneCamera({
				...options,
				anchor: anchors.ground,
				center: anchors.center,
				value: 0.5
			});
			expect(zoomPoint(anchors.ground, camera.anchor, camera.value)).toEqual(anchors.ground);
		}
	);

	const still = (w: number, h: number) =>
		({
			image: { w, h, data: new Uint8ClampedArray(0) },
			frame: { x: 0, y: 0, w, h }
		}) as Parameters<typeof thumbScale>[1];
	test.each([
		// size, frame, devicePixelRatio, CSS px per art px
		[256, 64, 1, 4],
		[256, 48, 1, 5],
		[256, 128, 1, 2],
		[256, 32, 1.25, 8],
		[200, 64, 2, 3],
		[200, 96, 1.5, 2]
	])(
		'a %s px box draws a %s px frame at DPR %s in whole device pixels: %s',
		(size, frame, dpr, scale) => {
			const shown = thumbScale(size, still(frame, frame), dpr);
			expect(shown).toBe(scale);
			expect(Number.isInteger(shown * dpr), 'whole device pixels per art pixel').toBe(true);
			expect(frame * shown).toBeLessThanOrEqual(size);
		}
	);

	test('a frame larger than its box shrinks to fit it', () => {
		expect(thumbScale(64, still(128, 128), 1)).toBe(0.5);
	});

	test('before its still loads, a thumbnail assumes a 64 px frame', () => {
		expect(thumbScale(256, undefined, 1)).toBe(4);
	});
});
