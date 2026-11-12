import type { Box, Placement, WorldArt } from './geometry.ts';

export interface ScenePoint {
	x: number;
	y: number;
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

export function sceneCamera(options: {
	value: number;
	anchor: ScenePoint;
	backdrop: Placement;
	plate: Pick<WorldArt, 'width' | 'height'>;
	viewport: Box;
	clearance: Box;
	art: readonly Box[];
}): SceneCamera {
	const { anchor, backdrop, plate, viewport, clearance, art } = options;
	const plateBox = {
		l: backdrop.x,
		r: backdrop.x + backdrop.scale * plate.width,
		t: backdrop.y,
		b: backdrop.y + backdrop.scale * plate.height
	};
	let minimum = 0;
	let maximum = 1.5;
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
		for (const box of art) {
			if (box[low] < pivot)
				maximum = Math.min(maximum, (pivot - clearance[low]) / (pivot - box[low]));
			if (box[high] > pivot)
				maximum = Math.min(maximum, (clearance[high] - pivot) / (box[high] - pivot));
		}
	}
	const min = Math.max(Number.EPSILON, Math.min(1, minimum));
	const max = Math.max(1, maximum);
	const value = Math.max(min, Math.min(max, Number.isFinite(options.value) ? options.value : 1));
	const position = zoomPoint(backdrop, anchor, value);
	return {
		value,
		min,
		max,
		anchor,
		backdrop:
			value === 1
				? backdrop
				: {
						...backdrop,
						x: position.x,
						y: position.y,
						scale: backdrop.scale * value,
						eye: anchor.y + (backdrop.eye - anchor.y) * value
					}
	};
}
