import { dot3, motionCamera, type Foot } from '../../lib/rig/motion.ts';
import type { DirectionName } from '../../lib/rig/rig.ts';
import type { PlantingPlan } from '../../lib/rig/planting.ts';
import { stableStringify } from '../../lib/image/hash.ts';
export interface SolePoint {
	x: number;
	y: number;
	landmark: 'heel' | 'toe';
}
export interface SoleBinding {
	jobId: string;
	hashes: string[];
	cell: { w: number; h: number };
	direction: DirectionName;
	elevation: number;
	azimuth: number;
	times: number[];
	duration: number;
	loop: boolean;
	plan: PlantingPlan;
}
export interface SoleReview {
	version: 1;
	kind: 'pixeldoll-rendered-sole-review';
	binding: SoleBinding;
	frames: Partial<Record<Foot, SolePoint>>[];
	notes: string;
}
export function validateSoles(value: unknown, binding: SoleBinding): SoleReview {
	const d = value as SoleReview;
	if (
		d?.version !== 1 ||
		d.kind !== 'pixeldoll-rendered-sole-review' ||
		stableStringify(d.binding) !== stableStringify(binding) ||
		!Array.isArray(d.frames) ||
		d.frames.length !== binding.hashes.length ||
		typeof d.notes !== 'string'
	)
		throw new Error('Sole measurements must match the exact frozen frames and authored motion.');
	for (const f of d.frames) {
		if (!f || typeof f !== 'object') throw new Error('Invalid sole measurement frame.');
		for (const [foot, p] of Object.entries(f))
			if (
				!['RIGHT LEG', 'LEFT LEG'].includes(foot) ||
				!p ||
				!['heel', 'toe'].includes(p.landmark) ||
				![p.x, p.y].every(Number.isFinite) ||
				p.x < 0 ||
				p.y < 0 ||
				p.x >= binding.cell.w ||
				p.y >= binding.cell.h
			)
				throw new Error('Mark a visible heel or toe inside its native image.');
	}
	return d;
}
/** Measure artist-picked visible landmarks after applying the authored world root trajectory.
 * Wrapped samples are brought into the same cycle as each stance anchor. No pixel inference occurs. */
export function measureSoles(review: SoleReview) {
	const b = review.binding,
		camera = motionCamera(b.direction, b.elevation, b.azimuth),
		v: [number, number, number] = [b.plan.velocity[0], 0, b.plan.velocity[1]],
		vx = dot3(v, camera.right),
		vy = -dot3(v, camera.up);
	return b.plan.windows.map((window, wi) => {
		const samples: {
			index: number;
			t: number;
			point?: SolePoint;
			world?: { x: number; y: number };
		}[] = [];
		for (let i = 0; i < b.times.length; i++)
			for (const cycle of b.loop ? [-1, 0, 1] : [0]) {
				const t = b.times[i] - cycle * b.duration;
				if (t < window.start + window.fade - 1e-8 || t > window.end - window.fade + 1e-8) continue;
				const point = review.frames[i]?.[window.foot];
				samples.push({
					index: i,
					t,
					point,
					...(point ? { world: { x: point.x + vx * t, y: point.y + vy * t } } : {})
				});
				break;
			}
		const observed = samples.filter((s) => s.point),
			consistent = new Set(observed.map((s) => s.point!.landmark)).size <= 1,
			temporalSpan = observed.length
				? Math.max(...observed.map((s) => s.t)) - Math.min(...observed.map((s) => s.t))
				: 0,
			complete =
				samples.length >= 2 &&
				temporalSpan > 1e-8 &&
				observed.length === samples.length &&
				consistent;
		let span = 0;
		for (const a of observed)
			for (const c of observed)
				span = Math.max(span, Math.hypot(a.world!.x - c.world!.x, a.world!.y - c.world!.y));
		return {
			window: wi,
			foot: window.foot,
			expected: samples.length,
			marked: observed.length,
			consistent,
			complete,
			temporalSpan,
			supportDuration: window.end - window.start - 2 * window.fade,
			worldSpan: complete ? span : null,
			samples
		};
	});
}
