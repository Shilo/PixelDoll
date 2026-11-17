import type { Frame } from '../../lib/compose/compose.ts';
import type { Img } from '../../lib/image/png.ts';
import {
	DEFAULT_MOVE,
	matchesStanding,
	type DirectionName,
	type Keypoint,
	type Rig,
	type Sha256
} from '../../lib/rig/rig.ts';

export type MountLegMode = 'none' | 'far' | 'both';
type Point = { x: number; y: number };
type Leg = [Point, Point, Point];

function segmentDistance(point: Point, start: Point, end: Point): number {
	const dx = end.x - start.x,
		dy = end.y - start.y,
		lengthSquared = dx * dx + dy * dy,
		along = lengthSquared
			? Math.max(
					0,
					Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)
				)
			: 0;
	return Math.hypot(point.x - start.x - along * dx, point.y - start.y - along * dy);
}

function legDistance(point: Point, leg: Leg): number {
	return Math.min(segmentDistance(point, leg[0], leg[1]), segmentDistance(point, leg[1], leg[2]));
}

export function hideMountedLegs(
	image: Img,
	frame: Pick<Frame, 'x' | 'y'>,
	rig: Rig,
	clip: string,
	direction: DirectionName,
	cell: number,
	mode: MountLegMode,
	geometry?: { resolvedSource?: DirectionName; baseImage?: Sha256 | null }
): { image: Img; issue: string | null; source?: 'measured' | 'requested' | 'rest' } {
	const unchanged = (issue: string) => ({ image, issue });
	if (mode === 'none') return { image, issue: null };
	if (mode !== 'far' && mode !== 'both') return unchanged('Unknown mounted-leg cutout mode.');
	if (mode === 'far' && (direction === 'north' || direction === 'south'))
		return unchanged('Far-leg geometry is unavailable for north/south views.');
	const offsetX = frame.x - rig.pivot.x,
		offsetY = frame.y - rig.pivot.y;
	if (
		![image.w, image.h, rig.cell.w, rig.cell.h].every(
			(value) => Number.isSafeInteger(value) && value > 0
		) ||
		!Number.isSafeInteger(image.w * image.h * 4) ||
		image.data.length !== image.w * image.h * 4 ||
		![frame.x, frame.y, rig.pivot.x, rig.pivot.y, offsetX, offsetY].every(Number.isSafeInteger)
	)
		return unchanged('Invalid image dimensions or frame pivot geometry.');
	const animation = rig.animations.find((entry) => entry.id === clip);
	if (
		!animation ||
		!Number.isSafeInteger(animation.cells) ||
		!Number.isInteger(cell) ||
		cell < 0 ||
		cell >= animation.cells
	)
		return unchanged('Mounted-leg geometry is unavailable for this clip/cell.');
	let resolved = direction,
		mirrored = false;
	const visited = new Set<DirectionName>();
	while (true) {
		if (visited.has(resolved)) return unchanged('Cyclic mounted-leg mirror geometry.');
		visited.add(resolved);
		const entry = rig.directions.find((candidate) => candidate.id === resolved);
		if (!entry) return unchanged('Missing mounted-leg direction geometry.');
		if (geometry?.resolvedSource === resolved) break;
		if (!entry.mirrorOf) {
			if (geometry?.resolvedSource !== undefined)
				return unchanged('Resolved base direction is not on the displayed mirror chain.');
			break;
		}
		resolved = entry.mirrorOf;
		mirrored = !mirrored;
	}
	if (mode === 'far' && (resolved === 'north' || resolved === 'south'))
		return unchanged('Far-leg geometry is unavailable for a north/south source.');
	const provenance = animation.sources?.[resolved];
	if (provenance && Object.hasOwn(provenance, 'measured') && !Array.isArray(provenance.measured))
		return { image, issue: 'Invalid measured mounted-leg frames.', source: 'measured' };
	let points: Keypoint[] | undefined, source: 'measured' | 'requested' | 'rest';
	if (provenance?.measured && Object.hasOwn(provenance.measured, cell)) {
		points = provenance.measured[cell];
		source = 'measured';
	} else if (provenance?.keypoints && Object.hasOwn(provenance.keypoints, cell)) {
		points = provenance.keypoints[cell];
		source = 'requested';
	} else if (
		clip === DEFAULT_MOVE &&
		cell === 0 &&
		matchesStanding(rig, animation, resolved, geometry?.baseImage)
	) {
		points = rig.rest?.[resolved]?.keypoints;
		source = 'rest';
	} else return unchanged('No per-cell mounted-leg geometry or matching standing provenance.');
	const legs: Leg[] = [];
	for (const side of ['LEFT', 'RIGHT']) {
		const joints: Point[] = [];
		for (const joint of ['HIP', 'KNEE', 'LEG']) {
			const matches = Array.isArray(points)
				? points.filter((point) => point?.label === side + ' ' + joint)
				: [];
			const point = matches[0];
			if (
				matches.length !== 1 ||
				!point ||
				![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
			)
				return { image, issue: 'Invalid ' + source + ' mounted-leg joints.', source };
			const bodyX = point.x * rig.cell.w;
			joints.push({
				x: offsetX + (mirrored ? rig.cell.w - 1 - bodyX : bodyX),
				y: offsetY + point.y * rig.cell.h
			});
		}
		legs.push(joints as Leg);
	}
	const [left, right] = legs as [Leg, Leg],
		hipY = (left[0].y + right[0].y) / 2,
		radius = Math.max(
			Math.min(rig.cell.w, rig.cell.h) * 0.04,
			Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y) * 0.4
		),
		far = resolved.endsWith('west') ? right : left,
		near = far === left ? right : left,
		candidates = mode === 'both' ? [...left, ...right] : far,
		minX = Math.max(0, Math.ceil(Math.min(...candidates.map((point) => point.x)) - radius)),
		maxX = Math.min(
			image.w - 1,
			Math.floor(Math.max(...candidates.map((point) => point.x)) + radius)
		),
		minY = Math.max(
			0,
			Math.floor(hipY) + 1,
			Math.ceil(Math.min(...candidates.map((point) => point.y)) - radius)
		),
		maxY = Math.min(
			image.h - 1,
			Math.floor(Math.max(...candidates.map((point) => point.y)) + radius)
		);
	let output: Img | undefined;
	for (let y = minY; y <= maxY; y++)
		for (let x = minX; x <= maxX; x++) {
			const index = (y * image.w + x) * 4;
			if (!image.data[index + 3]) continue;
			const point = { x, y },
				candidateDistance = legDistance(point, far),
				otherDistance = legDistance(point, near),
				ambiguous =
					Math.max(candidateDistance, otherDistance) <= radius &&
					Math.abs(candidateDistance - otherDistance) <= 1,
				cut =
					mode === 'both'
						? Math.min(candidateDistance, otherDistance) <= radius
						: candidateDistance <= radius && candidateDistance < otherDistance && !ambiguous;
			if (!cut) continue;
			output ??= { w: image.w, h: image.h, data: new Uint8ClampedArray(image.data) };
			output.data.fill(0, index, index + 4);
		}
	return { image: output ?? image, issue: null, source };
}
