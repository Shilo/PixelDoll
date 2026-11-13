import type { Box, Placement, WorldArt } from './geometry.ts';

export interface ScenePoint {
	x: number;
	y: number;
}

/*
 * Zoom is absolute: a scale is CSS pixels per art pixel, shown as a percentage, so 100% is the character's true size and
 * 400% draws every art pixel 4 CSS pixels wide. Each screen fits its selected character as before (its "fit", kept
 * exactly); the camera multiplies that fit by scale / fit. Until the person zooms, nothing is stored and every screen
 * shows its own fit; once they do, the stored scale is shared, so a level reads and draws the same size on each screen.
 */

/** A pinch released this close to a fit or a whole multiple lands on it exactly. */
export const ZOOM_SNAP = 0.04;

/**
 * Every whole multiple from 100%, with even steps between n and n + 1 while a step would otherwise exceed 25%:
 * 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, ... up to `max`.
 */
export function zoomLadder(max: number): number[] {
	const levels: number[] = [];
	for (let whole = 1; whole <= max; whole++) {
		const parts = Math.ceil(4 / whole);
		for (let part = 0; part < parts; part++) {
			const level = whole + part / parts;
			if (level <= max) levels.push(level);
		}
	}
	return levels;
}

export interface SceneZoom {
	/** The scale shown, in CSS pixels per art pixel. */
	scale: number;
	/** This screen's fit. */
	fit: number;
	/** Both screens' latest fits (this one included), which every ladder includes so both step through the same levels. */
	stops: readonly number[];
	min: number;
	max: number;
	/** The shown scale differs from this screen's fit (as displayed), so the controls show to reset it. */
	zoomed: boolean;
}

/** A fit this close to a ladder level is shown at it (a sub-pixel change), so no two levels read the same percentage. */
const LEVEL_SNAP = 0.005;

/** The scale a fit is shown at: the fit, or a ladder level within 0.5% of it. */
export function fitLevel(fit: number): number {
	return (
		zoomLadder(Math.ceil(fit) + 1).find((level) => Math.abs(fit - level) <= LEVEL_SNAP * level) ??
		fit
	);
}

/**
 * One screen's view of the shared zoom. `stored` is the chosen scale, or null for each screen's fit; `fits` are both
 * screens' latest fits (0 while unknown). Bounds run from 100% (or a smaller fit) to `ceiling`, at least twice every fit.
 */
export function resolveZoom(
	stored: number | null,
	measured: number,
	fits: readonly number[],
	ceiling: number
): SceneZoom {
	const fit = fitLevel(measured);
	const stops = [...new Set([...fits.filter((value) => value > 0).map(fitLevel), fit])].sort(
		(a, b) => a - b
	);
	// A chosen scale stays in bounds even if a fit that allowed it has since grown, so it never silently changes.
	const chosen = stored !== null && Number.isFinite(stored) && stored > 0 ? [stored] : [];
	const min = Math.min(1, ...stops, ...chosen),
		max = stops.reduce(zoomCeiling, Math.max(ceiling, ...chosen));
	const scale =
		stored === null || !Number.isFinite(stored) ? fit : Math.min(max, Math.max(min, stored));
	return {
		scale,
		fit,
		stops,
		min,
		max,
		zoomed: Math.round(scale * 100) !== Math.round(fit * 100)
	};
}

/** The shared upper bound grows to twice the largest fit seen and never shrinks, so no screen clamps a stored scale. */
export function zoomCeiling(previous: number, fit: number): number {
	return Math.max(previous, Math.ceil(2 * fit));
}

/** The levels a wheel notch, key or button steps through: the whole ladder within the bounds plus both screens' fits.
 *  It is the same list on both screens, and a fit appearing or changing only adds a level, never removes one, so
 *  stepping one way and back retraces it wherever a level was reached. */
export function zoomLevels(zoom: Pick<SceneZoom, 'stops' | 'min' | 'max'>): number[] {
	const { stops, min, max } = zoom;
	return [
		...new Set([
			min,
			...zoomLadder(max).filter((level) => level >= min),
			...stops.filter((fit) => fit >= min && fit <= max),
			max
		])
	].sort((a, b) => a - b);
}

/** The next level in `direction` from the shown scale; a scale between levels (after a pinch) goes to the nearest level
 *  that way. */
export function zoomStep(zoom: SceneZoom, direction: 1 | -1): number {
	const levels = zoomLevels(zoom);
	return (
		(direction > 0
			? levels.find((level) => level > zoom.scale + 1e-9)
			: levels.findLast((level) => level < zoom.scale - 1e-9)) ?? zoom.scale
	);
}

/** Where a pinch released at `scale` settles: the nearest fit or whole multiple within 4% (this screen's fit on a tie),
 *  else exactly where it is. */
export function settleZoom(zoom: SceneZoom, scale: number): number {
	let best = Math.min(zoom.max, Math.max(zoom.min, scale)),
		distance = Infinity;
	for (const target of [zoom.fit, ...zoom.stops, Math.round(scale)]) {
		const gap = Math.abs(scale - target) / target;
		if (target >= zoom.min && target <= zoom.max && gap <= ZOOM_SNAP && gap < distance) {
			best = target;
			distance = gap;
		}
	}
	return best;
}

export interface SceneCamera {
	/** The camera multiplier over the screen's fit (the shown scale / the fit). */
	value: number;
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
 * The camera for a multiplier over the screen's fit. Zooming in may carry the selected character past the header or
 * panels, as zoom does anywhere; companions that would clip are hidden by sceneArtFits instead.
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
	const value = Number.isFinite(options.value) && options.value > 0 ? options.value : 1;
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
