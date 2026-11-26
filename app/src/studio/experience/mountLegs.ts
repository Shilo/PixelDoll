import type { Frame } from '../../lib/compose/compose.ts';
import { makeImg, type Img } from '../../lib/image/png.ts';
import type { Project } from '../../lib/store/manifest.ts';
import { cellImg } from '../../lib/compose/compose.ts';
import { flipH } from '../../lib/rig/mirror.ts';
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

export function mountLegGeometry(
	project: Project,
	clip: string,
	direction: DirectionName,
	cell: number
) {
	const rig = project.manifest.rig;
	const base = project.manifest.items.find((item) => item.id === rig.baseItem);
	let resolvedSource = direction;
	const visited = new Set<DirectionName>();
	while (
		!base?.layers.some((layer) => layer.cells?.[clip]?.[resolvedSource] !== undefined) &&
		!visited.has(resolvedSource)
	) {
		visited.add(resolvedSource);
		const mirror = rig.directions.find((entry) => entry.id === resolvedSource)?.mirrorOf;
		if (!mirror) break;
		resolvedSource = mirror;
	}
	const animation = rig.animations.find((entry) => entry.id === clip);
	const sources = animation?.sources;
	const imageAt = (source: DirectionName) =>
		base?.layers.map((layer) => layer.cells?.[clip]?.[source]?.[cell]).find(Boolean);
	while (
		base?.layers.length &&
		!Object.hasOwn(sources ?? {}, resolvedSource) &&
		!visited.has(resolvedSource)
	) {
		if (
			clip === DEFAULT_MOVE &&
			cell === 0 &&
			animation &&
			matchesStanding(rig, animation, resolvedSource, imageAt(resolvedSource))
		)
			break;
		visited.add(resolvedSource);
		const mirror = rig.directions.find((entry) => entry.id === resolvedSource)?.mirrorOf;
		if (
			!mirror ||
			!base.layers.every((layer) => {
				const displayed = cellImg(project, layer, clip, resolvedSource, cell);
				const source = cellImg(project, layer, clip, mirror, cell);
				if (!displayed || !source || displayed.w !== source.w || displayed.h !== source.h)
					return false;
				const reflected = flipH(source);
				return displayed.data.every((value, index) => value === reflected.data[index]);
			})
		)
			break;
		resolvedSource = mirror;
	}
	const baseImage = imageAt(resolvedSource);
	return { resolvedSource, baseImage };
}

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
): { image: Img; behind?: Img; issue: string | null; source?: 'measured' | 'requested' | 'rest' } {
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
	const jointPoint = (label: string): Point | undefined => {
		const matches = Array.isArray(points) ? points.filter((point) => point?.label === label) : [];
		const point = matches[0];
		if (
			matches.length !== 1 ||
			!point ||
			![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
		)
			return;
		const bodyX = point.x * rig.cell.w;
		return {
			x: offsetX + (mirrored ? rig.cell.w - 1 - bodyX : bodyX),
			y: offsetY + point.y * rig.cell.h
		};
	};
	const legs: Leg[] = [];
	for (const side of ['LEFT', 'RIGHT']) {
		const joints = ['HIP', 'KNEE', 'LEG'].map((joint) => jointPoint(side + ' ' + joint));
		if (joints.some((point) => !point))
			return { image, issue: 'Invalid ' + source + ' mounted-leg joints.', source };
		legs.push(joints as Leg);
	}
	const arms: [Point, Point][] = [];
	if (mode === 'both') {
		for (const side of ['LEFT', 'RIGHT']) {
			const elbow = jointPoint(side + ' ELBOW'),
				wrist = jointPoint(side + ' ARM');
			if (!elbow || !wrist)
				return { image, issue: 'Invalid ' + source + ' mounted-arm joints.', source };
			arms.push([elbow, wrist]);
		}
	}
	if (
		offsetX >= image.w ||
		offsetX + rig.cell.w <= 0 ||
		offsetY >= image.h ||
		offsetY + rig.cell.h <= 0
	)
		return { image, issue: null, source };
	const [left, right] = legs as [Leg, Leg],
		hipY = (left[0].y + right[0].y) / 2,
		radius = Math.max(
			Math.min(rig.cell.w, rig.cell.h) * 0.04,
			Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y) * 0.4
		),
		far = resolved.endsWith('west') ? right : left,
		near = far === left ? right : left,
		candidates = mode === 'both' ? [...left, ...right] : far,
		minX =
			mode === 'both'
				? 0
				: Math.max(0, Math.ceil(Math.min(...candidates.map((point) => point.x)) - radius)),
		maxX =
			mode === 'both'
				? image.w - 1
				: Math.min(
						image.w - 1,
						Math.floor(Math.max(...candidates.map((point) => point.x)) + radius)
					),
		minY = Math.max(
			0,
			Math.floor(hipY) + 1,
			Math.ceil(Math.min(...candidates.map((point) => point.y)) - radius)
		),
		maxY =
			mode === 'both'
				? image.h - 1
				: Math.min(
						image.h - 1,
						Math.floor(Math.max(...candidates.map((point) => point.y)) + radius)
					);
	let output: Img | undefined, behind: Img | undefined;
	const moveBehind = (foreground: Img, background: Img, index: number) => {
		background.data.set(image.data.subarray(index, index + 4), index);
		foreground.data.fill(0, index, index + 4);
	};
	const removed: number[] = [];
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
						? !arms.some(([elbow, wrist]) => segmentDistance(point, elbow, wrist) <= radius)
						: candidateDistance <= radius && candidateDistance < otherDistance && !ambiguous;
			if (!cut) continue;
			output ??= { w: image.w, h: image.h, data: new Uint8ClampedArray(image.data) };
			behind ??= makeImg(image.w, image.h);
			moveBehind(output, behind, index);
			if (mode === 'far') removed.push(y * image.w + x);
		}
	if (output && behind && removed.length) {
		const visited = new Set<number>();
		for (const removedPixel of removed) {
			const removedX = removedPixel % image.w,
				removedY = Math.floor(removedPixel / image.w);
			for (let deltaY = -1; deltaY <= 1; deltaY++)
				for (let deltaX = -1; deltaX <= 1; deltaX++) {
					const seedX = removedX + deltaX,
						seedY = removedY + deltaY;
					if (seedX < 0 || seedX >= image.w || seedY < 0 || seedY >= image.h) continue;
					const seed = seedY * image.w + seedX;
					if (visited.has(seed) || !output.data[seed * 4 + 3]) continue;
					const component = [seed];
					visited.add(seed);
					let fragment = true;
					for (let cursor = 0; cursor < component.length; cursor++) {
						const pixel = component[cursor],
							point = { x: pixel % image.w, y: Math.floor(pixel / image.w) };
						if (
							point.y <= hipY ||
							legDistance(point, far) > radius * 2 ||
							legDistance(point, near) <= radius
						)
							fragment = false;
						for (
							let neighborY = Math.max(0, point.y - 1);
							neighborY <= Math.min(image.h - 1, point.y + 1);
							neighborY++
						)
							for (
								let neighborX = Math.max(0, point.x - 1);
								neighborX <= Math.min(image.w - 1, point.x + 1);
								neighborX++
							) {
								const neighbor = neighborY * image.w + neighborX;
								if (!visited.has(neighbor) && output.data[neighbor * 4 + 3]) {
									visited.add(neighbor);
									component.push(neighbor);
								}
							}
					}
					if (fragment) for (const pixel of component) moveBehind(output, behind, pixel * 4);
				}
		}
	}
	return { image: output ?? image, behind, issue: null, source };
}
