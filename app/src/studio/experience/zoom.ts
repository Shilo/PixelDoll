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

/**
 * One screen's view of the shared zoom. `stored` is the chosen scale, or null for each screen's fit; `fits` are both
 * screens' latest fits (0 while unknown). Bounds run from 100% (or a smaller fit) to `ceiling`, at least twice every fit.
 */
export function resolveZoom(
	stored: number | null,
	fit: number,
	fits: readonly number[],
	ceiling: number
): SceneZoom {
	// The fit is kept exactly, so the default view draws exactly as before; a fit right beside a ladder level (696.6% next
	// to 700%) leaves that small step.
	const stops = [...new Set([...fits.filter((value) => value > 0), fit])].sort((a, b) => a - b);
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
	offset: ScenePoint;
	backdrop: Placement;
}

export function zoomPoint(
	point: ScenePoint,
	anchor: ScenePoint,
	value: number,
	offset?: ScenePoint
): ScenePoint {
	if (value === 1) return { x: point.x + (offset?.x ?? 0), y: point.y + (offset?.y ?? 0) };
	return {
		x: anchor.x + (point.x - anchor.x) * value + (offset?.x ?? 0),
		y: anchor.y + (point.y - anchor.y) * value + (offset?.y ?? 0)
	};
}

export function zoomBox(box: Box, anchor: ScenePoint, value: number, offset?: ScenePoint): Box {
	const topLeft = zoomPoint({ x: box.l, y: box.t }, anchor, value, offset);
	const bottomRight = zoomPoint({ x: box.r, y: box.b }, anchor, value, offset);
	return { l: topLeft.x, t: topLeft.y, r: bottomRight.x, b: bottomRight.y };
}

export function cameraFramePosition(
	frame: ScenePoint,
	point: ScenePoint,
	scale: number,
	camera: SceneCamera,
	dpr = 1
): ScenePoint {
	const shown = zoomPoint(
		{ x: point.x - frame.x * scale, y: point.y - frame.y * scale },
		camera.anchor,
		camera.value,
		camera.offset
	);
	return {
		x:
			camera.anchor.x +
			(Math.round(shown.x * dpr) / dpr - camera.anchor.x - camera.offset.x) / camera.value,
		y:
			camera.anchor.y +
			(Math.round(shown.y * dpr) / dpr - camera.anchor.y - camera.offset.y) / camera.value
	};
}

export function sceneArtFits(
	box: Box,
	camera: Pick<SceneCamera, 'anchor' | 'value'> & Partial<Pick<SceneCamera, 'offset'>>,
	clearance: Box
): boolean {
	const shown = zoomBox(box, camera.anchor, camera.value, camera.offset);
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
	center?: ScenePoint;
	framing?: Box;
	centerX?: number;
}): SceneCamera {
	const { backdrop, plate, viewport } = options;
	const plateBox = {
		l: backdrop.x,
		r: backdrop.x + backdrop.scale * plate.width,
		t: backdrop.y,
		b: backdrop.y + backdrop.scale * plate.height
	};
	const value = Number.isFinite(options.value) && options.value > 0 ? options.value : 1;
	const anchor = value > 1 ? (options.center ?? options.anchor) : options.anchor;
	const offset = { x: 0, y: 0 };
	const { center, framing } = options;
	if (value > 1 && center && framing) {
		const height = 2 * (options.anchor.y - center.y);
		const available = framing.b - framing.t;
		if (height > 0 && available > 0 && framing.r > framing.l) {
			const range = Math.max(0.25, available / height - 1);
			const progress = Math.min(1, (value - 1) / range);
			offset.x = ((framing.l + framing.r) / 2 - center.x) * progress;
			offset.y = ((framing.t + framing.b) / 2 - center.y) * progress;
		}
	}
	if (center && options.centerX !== undefined) offset.x = options.centerX - center.x;
	let minimum = 0;
	for (const [axis, low, high] of [
		['x', 'l', 'r'],
		['y', 't', 'b']
	] as const) {
		const pivot = anchor[axis];
		for (const [distance, margin] of [
			[pivot + offset[axis] - viewport[low], pivot - plateBox[low]],
			[viewport[high] - pivot - offset[axis], plateBox[high] - pivot]
		]) {
			if (distance > 0) minimum = Math.max(minimum, margin > 0 ? distance / margin : 1);
		}
	}
	// The finite background plate stops zooming out where it would expose an edge; past that only the characters (with
	// their floor rings and hit regions) keep shrinking around the grounded anchor, so their feet stay on the floor.
	const backdropMin = Math.max(
		Number.EPSILON,
		value > 1 || offset.x !== 0 || offset.y !== 0 ? minimum : Math.min(1, minimum)
	);
	const shown = Math.max(value, backdropMin);
	const position = zoomPoint(backdrop, anchor, shown, offset);
	return {
		value,
		anchor,
		offset,
		backdrop:
			shown === 1 && offset.x === 0 && offset.y === 0
				? backdrop
				: {
						...backdrop,
						x: position.x,
						y: position.y,
						scale: backdrop.scale * shown,
						eye: anchor.y + (backdrop.eye - anchor.y) * shown + offset.y
					}
	};
}
