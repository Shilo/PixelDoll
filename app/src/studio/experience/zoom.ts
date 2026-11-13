import type { Box, Placement, WorldArt } from './geometry.ts';

export interface ScenePoint {
	x: number;
	y: number;
}

/** The levels a wheel notch, key or button steps through. Stepping one way and back retraces the same levels, so it
 * always returns to exactly 100%. Its ends bound every zoom: characters shrink to half their automatic fit at most,
 * since smaller sprites lose too much detail to dress, and grow to 150%. */
export const ZOOM_STEPS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;
export const ZOOM_MIN = ZOOM_STEPS[0];
export const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];

/** A pinch released this close to the automatic fit lands on it exactly. */
export const ZOOM_FIT_SNAP = 0.04;

/** The next level in `direction` from `value`, within the current bounds. A value between levels (after a pinch, or a
 * bound that falls between them) goes to the nearest level that way, so the next step lands back on the ladder. */
export function zoomStep(value: number, direction: 1 | -1, min: number, max: number): number {
	const next =
		direction > 0
			? ZOOM_STEPS.find((level) => level > value + 1e-6)
			: ZOOM_STEPS.findLast((level) => level < value - 1e-6);
	return Math.min(max, Math.max(min, next ?? (direction > 0 ? max : min)));
}

export interface SceneCamera {
	value: number;
	min: number;
	max: number;
	anchor: ScenePoint;
	backdrop: Placement;
}

export function zoomPoint(point: ScenePoint, anchor: ScenePoint, value: number): ScenePoint {
	if (value === 1) return { x: point.x, y: point.y };
	return {
		x: anchor.x + (point.x - anchor.x) * value,
		y: anchor.y + (point.y - anchor.y) * value
	};
}

export function zoomBox(box: Box, anchor: ScenePoint, value: number): Box {
	const topLeft = zoomPoint({ x: box.l, y: box.t }, anchor, value);
	const bottomRight = zoomPoint({ x: box.r, y: box.b }, anchor, value);
	return { l: topLeft.x, t: topLeft.y, r: bottomRight.x, b: bottomRight.y };
}

export function sceneArtFits(
	box: Box,
	camera: Pick<SceneCamera, 'anchor' | 'value'>,
	clearance: Box
): boolean {
	const shown = zoomBox(box, camera.anchor, camera.value);
	return (
		shown.l >= clearance.l &&
		shown.r <= clearance.r &&
		shown.t >= clearance.t &&
		shown.b <= clearance.b
	);
}

/**
 * Both screens share one zoom with the same bounds, so a level chosen on one reads and scales the same on the other and
 * survives resizing. Zooming in may carry the selected character past the header or panels, as zoom does anywhere;
 * companions that would clip are hidden by sceneArtFits instead.
 */
export function sceneCamera(options: {
	value: number;
	anchor: ScenePoint;
	backdrop: Placement;
	plate: Pick<WorldArt, 'width' | 'height'>;
	viewport: Box;
	/** The selected actor's top at the fit, and the highest it may be shown: zooming in pans up to keep it in view. */
	head?: { top: number; limit: number };
}): SceneCamera {
	const { backdrop, plate, viewport, head } = options;
	const plateBox = {
		l: backdrop.x,
		r: backdrop.x + backdrop.scale * plate.width,
		t: backdrop.y,
		b: backdrop.y + backdrop.scale * plate.height
	};
	const value = Math.max(
		ZOOM_MIN,
		Math.min(ZOOM_MAX, Number.isFinite(options.value) ? options.value : 1)
	);
	// Zoom grows up from the feet, so a tall character's head would leave the top first, and the head is where people
	// look when they zoom in. Past that point the pivot rises just enough to hold the head at its limit; the feet go
	// lower instead.
	let anchor = options.anchor;
	if (head && value > 1 && head.top >= head.limit) {
		const shownTop = anchor.y + (head.top - anchor.y) * value;
		if (shownTop < head.limit)
			anchor = { x: anchor.x, y: (head.limit - head.top * value) / (1 - value) };
	}
	let minimum = 0;
	for (const [axis, low, high] of [
		['x', 'l', 'r'],
		['y', 't', 'b']
	] as const) {
		const pivot = anchor[axis];
		for (const [distance, margin] of [
			[pivot - viewport[low], pivot - plateBox[low]],
			[viewport[high] - pivot, plateBox[high] - pivot]
		]) {
			if (distance > 0) minimum = Math.max(minimum, margin > 0 ? distance / margin : 1);
		}
	}
	// The finite background plate stops zooming out where it would expose an edge; past that only the characters (with
	// their floor rings and hit regions) keep shrinking around the grounded anchor, so their feet stay on the floor.
	const backdropMin = Math.max(Number.EPSILON, Math.min(1, minimum));
	const shown = Math.max(value, backdropMin);
	const position = zoomPoint(backdrop, anchor, shown);
	return {
		value,
		min: ZOOM_MIN,
		max: ZOOM_MAX,
		anchor,
		backdrop:
			shown === 1
				? backdrop
				: {
						...backdrop,
						x: position.x,
						y: position.y,
						scale: backdrop.scale * shown,
						eye: anchor.y + (backdrop.eye - anchor.y) * shown
					}
	};
}
