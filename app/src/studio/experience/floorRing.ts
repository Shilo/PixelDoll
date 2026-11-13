import { ringRadius, ringRise } from './geometry.ts';
import { floorFlatness } from './reflection.ts';

export const RING_GAP = 12;
export const RING_STROKE = 1.5;

export function floorRing(
	bodyWidth: number,
	standingHeight: number,
	scale: number,
	magnification: number,
	belowHorizon: number,
	focal: number,
	dpr: number
) {
	const rx = ringRadius(bodyWidth, scale, magnification);
	const ry = rx * floorFlatness(belowHorizon, focal);
	const rise =
		ringRise(standingHeight, scale * magnification, ry * magnification, dpr) / magnification;
	return { rx, ry, rise, stroke: RING_STROKE / magnification };
}
