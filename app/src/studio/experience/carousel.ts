export type CastPose = { x: number; y: number; scale: number };

const SIDE_SCALE = 0.85;

export function castPose(
	offset: number,
	width: number,
	size: number,
	span = 1,
	art?: { hero: { l: number; r: number }; side: { l: number; r: number } }
): CastPose {
	const gap = Math.max(8, Math.min(16, width * 0.02));
	const hero = Math.min(size, Math.max(0, width - 4 * gap) / ((1 + 2 * SIDE_SCALE) * span));
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

export function carouselFrames(
	from: { transform: string; opacity: string },
	to: CastPose,
	edge: number,
	wrap: boolean,
	direction: number
): Keyframe[] {
	const end = { transform: castTransform(to), opacity: 1 };
	return wrap
		? [
				from,
				{ transform: castTransform({ ...to, x: -direction * edge }), opacity: 0, offset: 0.45 },
				{ transform: castTransform({ ...to, x: direction * edge }), opacity: 0, offset: 0.46 },
				end
			]
		: [from, end];
}
