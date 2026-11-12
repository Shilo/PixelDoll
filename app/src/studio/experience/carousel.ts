export type CastPose = { x: number; y: number; scale: number };

export function castPose(offset: number, width: number, size: number, sideSize: number): CastPose {
	const hero = Math.min(size, width * 0.48);
	const side = Math.min(sideSize, width * 0.3);
	const gap = width * 0.05;
	const x = offset * ((hero + side) / 2 + gap);
	return { x, y: offset ? -30 : 0, scale: (offset ? side : hero) / size };
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
