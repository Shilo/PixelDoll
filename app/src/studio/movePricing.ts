// PixelLab prices of creating a character and adding a move, shared by the Studio's quotes and the cost estimate. Pure: no
// queue, transport or storage, so the lazily loaded cost estimate can price hypothetical characters without them.
import type { CreateSpec, MoveSpec } from './create.ts';
import type { DirectionName, Manifest } from '../lib/store/manifest.ts';
import { ACTIONS, authoredPoses, fromApi } from '../lib/rig/poses.ts';
import { poseCallGens } from '../lib/rig/clips.ts';
import {
	anchorable,
	itemPoseGens,
	planAnchoredMove,
	planGens,
	posable,
	repairGridPlan
} from '../lib/items/items.ts';
import { hasCompleteCells } from '../lib/dress/dress.ts';
import { characterReference, costBody } from './characterConfig.ts';
import { defaultMoveFrameCount } from './moveAnimationOptions.ts';
import { LocalizedError } from '../lib/message.ts';

/** Generations per uncached estimate-skeleton joint check. */
export const EST = 0.1;

/** Pro has no price quote and draws all eight views in one call: what it billed live (2026-11-13). */
export const PRO_RECEIPTS = [
	{ size: 48, gens: 10 },
	{ size: 128, gens: 25 }
] as const;
/** Pro's draw price at a size: exact at a receipt; elsewhere provisional, from a straight line through the receipts up
 * to the nearer receipt. */
export function proDrawGens(size: number): { lo: number; hi: number } {
	const [a, b] = PRO_RECEIPTS,
		line = a.gens + ((size - a.size) * (b.gens - a.gens)) / (b.size - a.size);
	return {
		lo: Math.ceil(Math.min(b.gens, Math.max(a.gens, line))),
		hi: size <= a.size ? a.gens : Math.ceil(Math.max(b.gens, line))
	};
}

/** Cost from measured prices: base 2 + import 0.25. Creation makes only the Default move (the standing views); idle, walk
 * and other moves are added later and priced by moveEstimate. */
export function estimate(spec: Pick<CreateSpec, 'directions' | 'size' | 'model' | 'reference'>) {
	const n = spec.directions.filter((d) => !d.mirrorOf).length,
		size = costBody(spec.size, spec.model);
	// Pro Flash's first image (GET /pro-flash/cost, provisional, 2026-11-12): 5 gens to 96 px, 6 to 208 px, then 9; V3's
	// costs 1. The eight rotations are priced alike.
	if (spec.model === 'pro') {
		const draw = proDrawGens(size);
		return { gens: draw.lo + 0.25, maxGens: +(draw.hi + 0.25 + n * EST).toFixed(2), minutes: 5 };
	}
	const source = !spec.model ? spec.reference : undefined;
	const first = source ? 0 : spec.model !== 'pro-flash' ? 1 : size <= 96 ? 5 : size <= 208 ? 6 : 9;
	// An oversized reference cannot be created, so it must not inflate the price either.
	const area = source
		? Math.min(source.width, characterReference.v3.max) *
			Math.min(source.height, characterReference.v3.max)
		: size * size;
	const gens =
		spec.model === 'standard' ? 1.25 : +(first + 0.25 + Math.ceil((area * 8) / 65536)).toFixed(2);
	// Missing managed rest joints may require one estimate per direction.
	return { gens, maxGens: +(gens + n * EST).toFixed(2), minutes: 5 };
}

export const genDirs = (m: Manifest) =>
	m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id);
/** Explicit subsets name authored views; mirrored children are handled at publication. */
export function moveDirections(m: Manifest, dirs?: readonly DirectionName[]): DirectionName[] {
	const all = genDirs(m);
	if (dirs === undefined) return all;
	if (!dirs.length || new Set(dirs).size !== dirs.length || dirs.some((d) => !all.includes(d)))
		throw new LocalizedError(
			'Choose one or more independently drawn directions for this move.',
			'create.errors.chooseOneMoreIndependently'
		);
	return all.filter((d) => dirs.includes(d));
}

/** The item, when frames for more moves can be made for it from its own standing design (copies without one cannot). */
export const extendable = (m: Manifest, itemId: string) =>
	[...posable(m), ...anchorable(m)].find((i) => i.id === itemId);

/** Frames of a move: the authored table's length, or the text frame count. */
export const isAuthoredAction = (action?: string): action is string =>
	!!action && Object.hasOwn(ACTIONS, action);
export type MoveFrameSpec = Pick<
	MoveSpec,
	'action' | 'frames' | 'animation' | 'motionSource' | 'startFrom'
>;
export const moveAnimationModel = (spec: MoveFrameSpec) => spec.animation?.model ?? 'skeleton-v3';
/** The motion source a Skeleton move uses. The managed character's motion always starts from the Standing PixelLab
 *  registered, so a described move that starts from a saved frame or State takes the standalone PixMiniMax route, which
 *  starts from that frame at the same price, whatever source was resolved for the character. */
export const moveMotionSource = (spec: MoveFrameSpec): MoveSpec['motionSource'] =>
	spec.startFrom && moveAnimationModel(spec) === 'skeleton-v3' && !isAuthoredAction(spec.action)
		? 'standalone'
		: spec.motionSource;
export const moveFrames = (m: Manifest, s: MoveFrameSpec) => {
	const dir = m.rig.directions.find((d) => !d.mirrorOf && m.rig.rest?.[d.id])?.id;
	const r = dir && m.rig.rest?.[dir];
	const preferred =
		s.action === 'walk'
			? 8
			: isAuthoredAction(s.action) && r && dir
				? authoredPoses(s.action, fromApi(r.keypoints, m.rig.cell), dir, m.rig.cell.w).length
				: s.frames;
	const model = moveAnimationModel(s);
	return (
		s.animation?.frameCount ??
		(s.animation ? defaultMoveFrameCount(model, m.rig.cell.w, preferred) : preferred)
	);
};

const verifiedPixminimaxSquareCosts: Partial<Record<number, readonly number[]>> = {
	32: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2],
	48: [1, 1, 1, 2, 2, 2, 2, 3, 3, 4],
	64: [1, 1, 2, 2, 3, 3, 4, 5, 5, 6],
	65: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2],
	80: [1, 1, 1, 1, 1, 2, 2, 2, 2, 3],
	96: [1, 1, 1, 2, 2, 2, 2, 3, 3, 4],
	112: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
	128: [1, 1, 2, 2, 3, 3, 4, 5, 5, 6],
	129: [1, 1, 1, 1, 1, 1, 1, 2, 2, 2],
	144: [1, 1, 1, 1, 1, 1, 2, 2, 2, 2],
	160: [1, 1, 1, 1, 1, 2, 2, 2, 2, 3],
	192: [1, 1, 1, 2, 2, 2, 2, 3, 3, 4],
	224: [1, 1, 2, 2, 2, 3, 3, 4, 4, 5],
	256: [1, 1, 2, 2, 3, 3, 4, 5, 5, 6]
};

export function nativeMoveGens(
	model: 'v3' | 'pixminimax',
	cell: Manifest['rig']['cell'],
	frames: number
): number {
	if (model === 'v3') return Math.ceil((cell.w * cell.h * frames) / 65_536);
	return (
		(cell.w === cell.h ? verifiedPixminimaxSquareCosts[cell.w]?.[frames / 4 - 1] : undefined) ?? 6
	);
}

export function moveMotionFrames(m: Manifest, spec: MoveFrameSpec): number {
	return spec.action === 'walk' && moveMotionSource(spec) === undefined
		? 8
		: Math.ceil(moveFrames(m, spec) / 4) * 4;
}

export function moveMotionGens(m: Manifest, spec: MoveFrameSpec): number {
	return spec.action === 'walk' && moveMotionSource(spec) === undefined
		? 3
		: nativeMoveGens('pixminimax', m.rig.cell, moveMotionFrames(m, spec));
}

export function moveEstimate(
	m: Manifest,
	s: Pick<
		MoveSpec,
		| 'id'
		| 'action'
		| 'motionSource'
		| 'frames'
		| 'animation'
		| 'items'
		| 'dirs'
		| 'itemMethod'
		| 'replace'
		| 'itemsOnly'
		| 'preferTierOneRepair'
		| 'redrawItem'
	>
) {
	const n = moveFrames(m, s),
		model = moveAnimationModel(s),
		dirs = moveDirections(m, s.dirs).length,
		poseRig = s.replace
			? { ...m.rig, animations: m.rig.animations.filter((animation) => animation.id !== s.id) }
			: m.rig,
		body =
			(s.itemsOnly || s.itemMethod === 'grid') && !s.replace
				? 0
				: dirs *
						(n * EST +
							(model !== 'skeleton-v3'
								? nativeMoveGens(model, m.rig.cell, n)
								: poseCallGens(n) +
									(isAuthoredAction(s.action)
										? 0
										: moveMotionGens(m, s) + moveMotionFrames(m, s) * EST))) +
					(model === 'skeleton-v3'
						? moveDirections(m, s.dirs).filter(
								(direction) => s.animation?.references?.[direction]?.start
							).length * EST
						: 0);
	const items =
		s.itemMethod === 'grid'
			? s.items.reduce((sum, id) => {
					const item = m.items.find((i) => i.id === id);
					if (!item)
						throw new LocalizedError(
							'The selected equipment is no longer available.',
							'create.errors.selectedEquipmentLongerAvailable'
						);
					const cell = item.layers[0]?.cell ?? m.rig.cell;
					return (
						sum +
						repairGridPlan(cell, n, s.preferTierOneRepair, s.redrawItem).reduce(
							(total, batch) => total + batch.gens,
							0
						) *
							dirs
					);
				}, 0)
			: s.items.reduce((sum, id) => {
					const item = m.items.find((i) => i.id === id)!;
					const targets = moveDirections(m, s.dirs).filter(
						(d) => !s.itemsOnly || s.replace || !hasCompleteCells(m, item, s.id, d)
					);
					return (
						sum +
						(s.itemMethod === 'anchor'
							? planGens(planAnchoredMove(m.rig, item, s.id, targets), m.rig.cell)
							: itemPoseGens(poseRig, item, s.id, n, targets, m))
					);
				}, 0);
	return { gens: body + items, body, items, frames: n, minutes: 4 + s.items.length * 3 };
}
