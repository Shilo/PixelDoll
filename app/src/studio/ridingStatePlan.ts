import { poseCallGens } from '../lib/rig/clips.ts';
import { authoredPoses, fromApi, hasAll, toApi } from '../lib/rig/poses.ts';
import { DEFAULT_MOVE, type Rig } from '../lib/rig/rig.ts';
import type { StateGenerationSource, StateSourceFrame } from './stateGenerationSource.ts';
import type { StateGenerationPlan } from './stateGenerationPlan.ts';

/** Only guide a Standing cell when its joints describe that exact saved art. */
export function ridingStatePlan(
	rig: Rig,
	frame: StateSourceFrame,
	source: StateGenerationSource
): Extract<StateGenerationPlan, { endpoint: '/animate-with-skeleton-v3' }> | undefined {
	if (
		frame.clip !== DEFAULT_MOVE ||
		frame.frame !== 0 ||
		(rig.template && rig.template !== 'mannequin')
	)
		return;
	const standing = rig.animations.find(({ id }) => id === DEFAULT_MOVE);
	const cell = standing?.frames[0]?.cell;
	if (cell === undefined) return;
	const guides: NonNullable<ReturnType<typeof ridingStatePlan>>['guides'][number][] = [];
	for (const { direction, hash } of source.views) {
		const rest = rig.rest?.[direction];
		const measured = standing?.sources?.[direction]?.measured?.[cell];
		const joints = hasAll(measured) ? measured : rest?.image === hash ? rest.keypoints : undefined;
		if (!joints || !hasAll(joints)) return;
		const [pose] = authoredPoses(
			'ride',
			fromApi(joints, rig.cell),
			direction,
			rig.cell.w,
			'riding-state'
		);
		const torso = Math.hypot(
			(pose['RIGHT HIP'].x + pose['LEFT HIP'].x) / 2 - pose.NECK.x,
			(pose['RIGHT HIP'].y + pose['LEFT HIP'].y) / 2 - pose.NECK.y
		);
		// The projection measured on the stocky rider overextends long legs. Limit their projected length
		// relative to the torso, then fit the chain inside the frame without changing either angle.
		for (const side of ['LEFT', 'RIGHT']) {
			for (const [root, middle, end] of [
				['HIP', 'KNEE', 'LEG'],
				['SHOULDER', 'ELBOW', 'ARM']
			]) {
				const start = pose[side + ' ' + root];
				const chain = [pose[side + ' ' + middle], pose[side + ' ' + end]];
				const length =
					Math.hypot(chain[0].x - start.x, chain[0].y - start.y) +
					Math.hypot(chain[1].x - chain[0].x, chain[1].y - chain[0].y);
				let scale = root === 'HIP' && length > 0 ? Math.min(1, (torso * 1.65) / length) : 1;
				for (const point of chain) {
					const dx = point.x - start.x;
					const dy = point.y - start.y;
					if (point.x < 1) scale = Math.min(scale, (1 - start.x) / dx);
					if (point.x > rig.cell.w - 2) scale = Math.min(scale, (rig.cell.w - 2 - start.x) / dx);
					if (point.y < 1) scale = Math.min(scale, (1 - start.y) / dy);
					if (point.y > rig.cell.h - 3) scale = Math.min(scale, (rig.cell.h - 3 - start.y) / dy);
				}
				if (scale <= 0) return;
				for (const joint of chain) {
					joint.x = start.x + (joint.x - start.x) * scale;
					joint.y = start.y + (joint.y - start.y) * scale;
				}
			}
		}
		const target = toApi(pose, rig.cell);
		guides.push({ direction, reference: hash, joints, poses: [target, target, target] });
	}
	const generations = guides.length * poseCallGens(3);
	return {
		kind: 'ready',
		endpoint: '/animate-with-skeleton-v3',
		method: 'text',
		view: rig.view ?? 'low top-down',
		cellSize: source.size,
		batches: guides.map(({ direction }) => ({ transport: 'cells', facingIds: [direction] })),
		guides,
		warnings: [],
		cost: { kind: 'estimate', minGenerations: generations, maxGenerations: generations }
	};
}
