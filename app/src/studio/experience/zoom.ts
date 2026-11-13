import type { Box, Placement, WorldArt } from './geometry.ts';

export interface ScenePoint {
	x: number;
	y: number;
}

/*
 * Zoom is absolute: a scale is CSS pixels per art pixel, shown as a percentage, so 100% is the character's true size and
 * 400% draws every art pixel 4 CSS pixels wide. Each screen fits its selected character as before (the "fit"); the camera
 * multiplies that fit by scale / fit. Both screens share the stored scale, so a level reads and draws the same size on
 * each. Until the person zooms, the stored scale is null and every screen shows its own fit.
 */

/** A fit within this share of a whole multiple uses the multiple, so stepping off it is never a step too small to see. */
const WHOLE_SNAP = 0.03;
/** Between-levels closer than this share to the fit are dropped, for the same reason. */
const FIT_GAP = 0.06;
/** A pinch released this close to the fit or a whole multiple lands on it exactly. */
export const ZOOM_SNAP = 0.04;

/** The scale a screen shows by default for a fit: the fit itself, or a whole multiple within 3% of it. */
export function fitLevel(fit: number): number {
	const whole = Math.round(fit);
	return whole >= 1 && Math.abs(fit - whole) <= WHOLE_SNAP * whole ? whole : fit;
}

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
	/** This screen's default scale (fitLevel of its fit). */
	fit: number;
	min: number;
	max: number;
	/** The person chose this scale; otherwise the screen shows its fit. */
	zoomed: boolean;
}

/** The shared zoom on one screen: the stored scale (null for the fit) within the shared bounds. */
export function resolveZoom(stored: number | null, fit: number, ceiling: number): SceneZoom {
	const level = fitLevel(fit);
	const min = Math.min(1, level),
		max = Math.max(ceiling, level);
	const scale =
		stored === null || !Number.isFinite(stored) ? level : Math.min(max, Math.max(min, stored));
	return { scale, fit: level, min, max, zoomed: stored !== null && Number.isFinite(stored) };
}

/** The shared upper bound grows to twice the largest fit seen and never shrinks, so no screen clamps a stored scale. */
export function zoomCeiling(previous: number, fit: number): number {
	return Math.max(previous, Math.ceil(2 * fitLevel(fit)));
}

/** The levels a wheel notch, key or button steps through on a screen: the ladder within its bounds, plus its fit. Every
 *  level, the fit included, is on the list, so stepping one way and back always retraces the same levels. */
export function zoomLevels(zoom: Pick<SceneZoom, 'fit' | 'min' | 'max'>): number[] {
	const { fit, min, max } = zoom;
	const levels = zoomLadder(max).filter(
		(level) =>
			level >= min &&
			(Number.isInteger(level) || Math.abs(level - fit) > FIT_GAP * fit || level === fit)
	);
	return [...new Set([min, ...levels, fit, max])].sort((a, b) => a - b);
}

/** The next level in `direction` from `scale`; a scale between levels (after a pinch) goes to the nearest level that
 *  way. Returns null when the step lands on the screen's fit, which is stored as "not zoomed". */
export function zoomStep(zoom: SceneZoom, direction: 1 | -1): number | null {
	const levels = zoomLevels(zoom);
	const next =
		(direction > 0
			? levels.find((level) => level > zoom.scale + 1e-9)
			: levels.findLast((level) => level < zoom.scale - 1e-9)) ?? zoom.scale;
	return next === zoom.fit ? null : next;
}

/** Where a pinch released at `scale` settles: the fit (null) or a whole multiple within 4%, else exactly where it is. */
export function settleZoom(zoom: SceneZoom, scale: number): number | null {
	if (Math.abs(scale - zoom.fit) <= ZOOM_SNAP * zoom.fit) return null;
	const whole = Math.round(scale);
	return whole >= zoom.min && whole <= zoom.max && Math.abs(scale - whole) <= ZOOM_SNAP * whole
		? whole
		: Math.min(zoom.max, Math.max(zoom.min, scale));
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
