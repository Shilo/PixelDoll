import { makeImg, type Img } from '../../lib/image/png.ts';

export const REFLECTION = {
	enabled: true,
	selection: true,
	preview: true,
	topdown: true,
	side: true,
	opacity: 0.16,
	compression: 0.35,
	fadeHeight: 0.7,
	overheadCompression: 0.35,
	overheadOpacity: 0.5
};

export const floorFlatness = (belowHorizon: number, focal: number) =>
	Math.min(1, Math.max(0, belowHorizon) / Math.max(1, focal));

export function reflectionStyle(floor: number, horizon: number, focal: number) {
	const flat = floorFlatness(floor - horizon, focal);
	return {
		opacity: REFLECTION.opacity * (1 - flat * (1 - REFLECTION.overheadOpacity)),
		compression: REFLECTION.compression * (1 - flat * (1 - REFLECTION.overheadCompression))
	};
}

export function reflectionPixels(
	image: Img,
	groundRow: number,
	standingHeight: number
): Img | null {
	const height = Math.max(0, Math.min(image.h, Math.ceil(groundRow)));
	if (!height) return null;
	const reflected = makeImg(image.w, height);
	const fade = Math.max(1, standingHeight * REFLECTION.fadeHeight);
	let visible = false;
	for (let row = 0; row < height; row++) {
		const strength = Math.max(0, Math.min(1, 1 - (groundRow - row - 0.5) / fade));
		if (!strength) continue;
		for (let column = 0; column < image.w; column++) {
			const offset = (row * image.w + column) * 4;
			const alpha = Math.round(image.data[offset + 3]! * strength);
			if (!alpha) continue;
			reflected.data.set(image.data.subarray(offset, offset + 3), offset);
			reflected.data[offset + 3] = alpha;
			visible = true;
		}
	}
	return visible ? reflected : null;
}

const prepared = new WeakMap<
	Img,
	{
		groundRow: number;
		standingHeight: number;
		fadeHeight: number;
		canvas: HTMLCanvasElement | null;
	}
>();

export function reflectionCanvas(image: Img, groundRow: number, standingHeight: number) {
	const cached = prepared.get(image);
	if (
		cached &&
		cached.groundRow === groundRow &&
		cached.standingHeight === standingHeight &&
		cached.fadeHeight === REFLECTION.fadeHeight
	)
		return cached.canvas;
	const pixels = reflectionPixels(image, groundRow, standingHeight);
	let canvas: HTMLCanvasElement | null = null;
	if (pixels) {
		canvas = document.createElement('canvas');
		canvas.width = pixels.w;
		canvas.height = pixels.h;
		canvas
			.getContext('2d')!
			.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.w, pixels.h), 0, 0);
	}
	prepared.set(image, { groundRow, standingHeight, fadeHeight: REFLECTION.fadeHeight, canvas });
	return canvas;
}

interface Actor {
	x: number;
	y: number;
	scale: number;
	groundRow: number;
}

export function reflectionPlacement(actor: Actor, height: number, compression: number) {
	const floor = actor.y + actor.groundRow * actor.scale;
	return {
		floor,
		top: floor + (actor.groundRow - height) * actor.scale * compression,
		height: height * actor.scale * compression
	};
}

export function drawReflection(
	context: CanvasRenderingContext2D,
	source: HTMLCanvasElement | null,
	actor: Actor,
	style: ReturnType<typeof reflectionStyle>
) {
	if (!source) return;
	const at = reflectionPlacement(actor, source.height, style.compression);
	context.save();
	context.imageSmoothingEnabled = false;
	context.globalAlpha = style.opacity;
	context.translate(actor.x, at.top + at.height);
	context.scale(1, -1);
	context.drawImage(source, 0, 0, source.width * actor.scale, at.height);
	context.restore();
}
