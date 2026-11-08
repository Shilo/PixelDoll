import {
	add3,
	sub3,
	mul3,
	length3,
	solveLimb,
	projectMotionPose,
	type Vec3,
	type Foot,
	type MotionCalibration,
	type MotionFrame,
	retargetMotion
} from './motion.ts';
export interface PlantWindow {
	foot: Foot;
	start: number;
	end: number;
	fade: number;
	anchor: Vec3;
}
export interface PlantingPlan {
	version: 1;
	velocity: [number, number];
	windows: PlantWindow[];
}
export function validatePlanting(plan: PlantingPlan, duration: number) {
	if (
		plan?.version !== 1 ||
		!Array.isArray(plan.velocity) ||
		plan.velocity.length !== 2 ||
		!plan.velocity.every(Number.isFinite) ||
		!Array.isArray(plan.windows) ||
		plan.windows.length > 32
	)
		throw new Error('Invalid authored contact plan.');
	for (const w of plan.windows)
		if (
			!['RIGHT LEG', 'LEFT LEG'].includes(w.foot) ||
			![w.start, w.end, w.fade].every(Number.isFinite) ||
			w.start < -duration ||
			w.end > duration ||
			w.end <= w.start ||
			w.fade < 0 ||
			w.fade > (w.end - w.start) / 2 ||
			!Array.isArray(w.anchor) ||
			w.anchor.length !== 3 ||
			!w.anchor.every(Number.isFinite)
		)
			throw new Error(
				'Contact windows need a valid foot, finite anchor, ordered times and bounded fades.'
			);
	for (const foot of ['RIGHT LEG', 'LEFT LEG']) {
		const windows = plan.windows
			.filter((w) => w.foot === foot)
			.flatMap((w) =>
				[-duration, 0, duration].map((offset) => ({ start: w.start + offset, end: w.end + offset }))
			)
			.sort((a, b) => a.start - b.start);
		for (let i = 1; i < windows.length; i++)
			if (windows[i].start < windows[i - 1].end - 1e-8)
				throw new Error('Authored contact windows for one foot overlap.');
	}
}
const smooth = (v: number) => {
	const t = Math.max(0, Math.min(1, v));
	return t * t * (3 - 2 * t);
};
export function contactAt(plan: PlantingPlan, time: number, duration: number, loop: boolean) {
	const result: { foot: Foot; weight: number; target: Vec3 }[] = [];
	for (const w of plan.windows)
		for (const cycle of loop ? [-1, 0, 1] : [0]) {
			const start = w.start + cycle * duration,
				end = w.end + cycle * duration,
				finalEndpoint = !loop && time === duration && end === duration;
			if (
				time < start ||
				time > end ||
				(time === end && !finalEndpoint) ||
				result.some((c) => c.foot === w.foot)
			)
				continue;
			const weight = w.fade
				? Math.min(smooth((time - start) / w.fade), smooth((end - time) / w.fade))
				: 1;
			if (!weight) continue;
			result.push({
				foot: w.foot,
				weight,
				target: [
					w.anchor[0] + plan.velocity[0] * (cycle * duration - time),
					w.anchor[1],
					w.anchor[2] + plan.velocity[1] * (cycle * duration - time)
				]
			});
		}
	return result;
}
/** Lock approved target-space contacts in world space; the source actor never supplies an anchor. */
export function plantMotion(
	result: ReturnType<typeof retargetMotion>,
	times: number[],
	calibration: MotionCalibration,
	plan: PlantingPlan,
	duration: number,
	loop: boolean
) {
	validatePlanting(plan, duration);
	if (times.length !== result.frames.length)
		throw new Error('Contact times do not match the target frames.');
	const frames: MotionFrame[] = result.frames.map((frame, index) => {
		const points = structuredClone(frame.points),
			contacts = contactAt(plan, times[index], duration, loop),
			issues = [...frame.issues];
		const targets = contacts.map((c) => ({
			...c,
			target: add3(points[c.foot], mul3(sub3(c.target, points[c.foot]), c.weight))
		}));
		let lower = -Infinity,
			upper = Infinity;
		for (const c of targets) {
			const side = c.foot.startsWith('RIGHT') ? 'RIGHT' : 'LEFT',
				hip = points[side + ' HIP'],
				knee = points[side + ' KNEE'],
				foot = points[c.foot],
				reach = length3(sub3(knee, hip)) + length3(sub3(foot, knee)) - 1e-5,
				horizontal = (hip[0] - c.target[0]) ** 2 + (hip[2] - c.target[2]) ** 2;
			if (horizontal >= reach * reach) {
				issues.push(`${side.toLowerCase()} authored contact is unreachable horizontally`);
				continue;
			}
			const y = Math.sqrt(reach * reach - horizontal);
			lower = Math.max(lower, c.target[1] - y - hip[1]);
			upper = Math.min(upper, c.target[1] + y - hip[1]);
		}
		if (lower > upper)
			issues.push('Authored contacts cannot be reached by both legs at this pelvis position.');
		const shift = lower <= upper ? Math.max(lower, Math.min(upper, 0)) : 0;
		if (shift)
			for (const label of Object.keys(points)) points[label] = add3(points[label], [0, shift, 0]);
		for (const c of targets) {
			const side = c.foot.startsWith('RIGHT') ? 'RIGHT' : 'LEFT',
				hip = side + ' HIP',
				knee = side + ' KNEE',
				solved = solveLimb(points[hip], points[knee], points[c.foot], c.target, points[knee]);
			points[knee] = solved.joint;
			points[c.foot] = solved.end;
			if (solved.unreachable)
				issues.push(`${side.toLowerCase()} authored contact is unreachable without stretching`);
		}
		const keypoints = projectMotionPose(
			points,
			calibration,
			result.camera,
			result.origin,
			result.depthScale
		);
		for (const k of keypoints) {
			if (![k.x, k.y, k.depth].every(Number.isFinite))
				throw new Error('Authored contact produced a nonfinite point.');
			if (k.x < 0 || k.x > 1 || k.y < 0 || k.y > 1 || k.depth < 0 || k.depth > 255)
				issues.push(`${k.label}: authored contact exceeds canvas or depth bounds`);
		}
		return {
			...frame,
			points,
			keypoints,
			issues: [...new Set(issues)],
			planting: contacts.map((c) => ({ ...c, error: length3(sub3(points[c.foot], c.target)) }))
		};
	});
	return { ...result, frames, issues: [...new Set(frames.flatMap((f) => f.issues))] };
}
