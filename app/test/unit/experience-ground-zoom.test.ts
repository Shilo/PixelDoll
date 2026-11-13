import { describe, expect, test } from 'vitest';
import { project, projection, type RenderOptions } from '../../src/studio/experience/ground.ts';
import { sceneCamera, zoomPoint } from '../../src/studio/experience/zoom.ts';

describe('playable ground camera', () => {
	test('padded standing artwork uses its painted center and height without moving the fit', () => {
		const anchor = { x: 200, y: 400 };
		const center = { x: 208, y: 344 };
		const options = {
			anchor,
			center,
			bodyHeight: 80,
			backdrop: { x: -500, y: -500, scale: 1, eye: 200, coverBottom: 600, centered: true },
			plate: { width: 1600, height: 1600 },
			viewport: { l: 0, t: 0, r: 800, b: 600 },
			framing: { l: 0, t: 100, r: 800, b: 300 }
		};
		const fit = sceneCamera({ ...options, value: 1 });
		expect(zoomPoint(anchor, fit.anchor, fit.value, fit.offset)).toEqual(anchor);
		const middle = sceneCamera({ ...options, value: 1.75 });
		const shown = zoomPoint(center, middle.anchor, middle.value, middle.offset);
		expect(shown).toEqual({ x: 304, y: 272 });
		const full = sceneCamera({ ...options, value: 2.5 });
		expect(zoomPoint(center, full.anchor, full.value, full.offset)).toEqual({ x: 400, y: 200 });
	});
	for (const mode of ['topdown', 'side'] as const)
		for (const value of [0.25, 0.75, 1, 1.25, 4])
			for (const dpr of [1, 1.25, 2, 3])
				test(`${mode} projects and inverts the same ground at ${value} and DPR ${dpr}`, () => {
					const baseline: RenderOptions = {
						width: 951,
						height: 574,
						dpr,
						theme: 'dark',
						mode,
						anchor: { x: 310.5, y: 470 },
						camera: { x: 30, y: -10 },
						eye: 275
					};
					const zoom = { value, anchor: { x: 310.5, y: 350 }, offset: { x: 0.5, y: -31 } };
					const options = { ...baseline, zoom };
					const original = projection(baseline),
						shown = projection(options);
					expect(shown.depth).toBe(original.depth);
					expect(shown.height).toBe(original.height);
					for (const point of [
						{ x: 30, y: -10 },
						{ x: -150, y: 70 },
						{ x: 190, y: -70 }
					]) {
						const screen = project(point, options);
						const expected = zoomPoint(project(point, baseline), zoom.anchor, value, zoom.offset);
						expect(screen.x).toBeCloseTo(expected.x, 9);
						expect(screen.y).toBeCloseTo(expected.y, 9);
						const depth = (shown.focal * shown.height) / (screen.y - shown.horizon);
						expect(
							shown.camera.x + ((screen.x - shown.anchor.x) * depth) / shown.focal
						).toBeCloseTo(point.x, 9);
						expect(shown.camera.y + depth - shown.depth).toBeCloseTo(point.y, 9);
					}
				});
});
