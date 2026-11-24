export type CastPose = { x: number; y: number; scale: number };

const SIDE_SCALE = 0.75;

export function castPose(
	offset: number,
	width: number,
	size: number,
	span = 1,
	art?: { hero: { l: number; r: number }; side: { l: number; r: number } }
): CastPose {
	const castSpan = (1 + 2 * SIDE_SCALE) * span;
	const fitted = Math.min(size, width / (castSpan + 4 * 0.18));
	const gap = Math.max(16, Math.min(80, fitted * 0.18));
	const hero = Math.min(size, Math.max(0, width - 4 * gap) / castSpan);
	const side = hero * SIDE_SCALE;
	const reach = art
		? (offset > 0 ? art.hero.r - art.side.l * SIDE_SCALE : art.side.r * SIDE_SCALE - art.hero.l) /
			size
		: ((1 + SIDE_SCALE) * span) / 2;
	const x = offset * (hero * reach + gap);
	return { x, y: offset ? -(hero - side) / 4 : 0, scale: (offset ? side : hero) / size };
}

export function castTransform(pose: CastPose): string {
	return `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale})`;
}

type CastHitEdge = { left: number; right: number };

/**
 * Extra hit reach in each slot's own unscaled pixels, splitting every painted gap between horizontally adjacent
 * slots at its midpoint so their hit areas meet without overlapping.
 */
export function castHitReach(
	slots: { id: string; x: number; scale: number; l: number; r: number }[]
): Map<string, CastHitEdge> {
	const reach = new Map<string, CastHitEdge>(slots.map((slot) => [slot.id, { left: 0, right: 0 }]));
	const ordered = [...slots].sort((left, right) => left.x - right.x);
	for (let i = 0; i < ordered.length - 1; i++) {
		const left = ordered[i];
		const right = ordered[i + 1];
		const leftEdge = left.x + left.scale * left.r;
		const rightEdge = right.x + right.scale * right.l;
		if (left.scale <= 0 || right.scale <= 0 || rightEdge <= leftEdge) continue;
		const midpoint = (leftEdge + rightEdge) / 2;
		reach.get(left.id)!.right = (midpoint - leftEdge) / left.scale;
		reach.get(right.id)!.left = (rightEdge - midpoint) / right.scale;
	}
	return reach;
}

export function carouselFrames(
	from: { transform: string; opacity: string },
	to: CastPose,
	slots: { exit: CastPose; enter: CastPose },
	wrap: boolean
): Keyframe[] {
	const end = { transform: castTransform(to), opacity: 1 };
	return wrap
		? [
				{ ...from, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
				{ transform: castTransform(slots.exit), opacity: 0, offset: 0.5 },
				{
					transform: castTransform(slots.enter),
					opacity: 0,
					offset: 0.5,
					easing: 'cubic-bezier(0.16, 1, 0.3, 1)'
				},
				end
			]
		: [from, end];
}

export function carouselRoute(from: number, to: number, shift: number) {
	const direction = Math.sign(shift) || -1;
	return {
		wrap: (to - from) * direction < 0,
		exit: 2 * direction,
		enter: -2 * direction
	};
}
