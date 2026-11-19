import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import { makeImg, type Img } from '../lib/image/png.ts';
import type { DirectionName, Preset } from '../lib/store/manifest.ts';
import {
	buildPresentation,
	renderPresentation,
	resolveLive,
	resolvePreview,
	type PresentationOptions,
	type PresentationAvailability
} from './experience/presentation.ts';
import { LocalizedError } from '../lib/message.ts';

export const ALL_MOVES = '__all_moves__';
export const ALL_DIRECTIONS = '__all_directions__';
export const SHARE_SCALES = [1, 2, 3, 4, 6, 8, 10] as const;

export interface ShareFrame {
	image: Img;
	ms: number;
}
export interface ShareMedia {
	frames: ShareFrame[];
	still: Img;
	animated: boolean;
	grid: boolean;
	previewRows: number;
	omitted: { move: string; direction: DirectionName }[];
	empty: boolean;
	mime: 'image/png' | 'image/gif';
	extension: 'png' | 'gif';
}

/** Remove only transparent outer padding for the small on-screen preview; downloads keep full frame alignment. */
export function sharePreviewFrames(media: ShareMedia): Img[] {
	const images = media.frames.map((frame) => frame.image);
	if (media.grid) return images;
	let left = images[0].w,
		top = images[0].h,
		right = 0,
		bottom = 0;
	for (const image of images)
		for (let y = 0; y < image.h; y++)
			for (let x = 0; x < image.w; x++) {
				if (image.data[(y * image.w + x) * 4 + 3] < 128) continue;
				left = Math.min(left, x);
				top = Math.min(top, y);
				right = Math.max(right, x + 1);
				bottom = Math.max(bottom, y + 1);
			}
	if (right <= left || bottom <= top) return images;
	left = Math.max(0, left - 2);
	top = Math.max(0, top - 2);
	right = Math.min(images[0].w, right + 2);
	bottom = Math.min(images[0].h, bottom + 2);
	return images.map((image) => {
		const out: Img = {
			w: right - left,
			h: bottom - top,
			data: new Uint8ClampedArray((right - left) * (bottom - top) * 4)
		};
		for (let y = top; y < bottom; y++)
			out.data.set(
				image.data.subarray((y * image.w + left) * 4, (y * image.w + right) * 4),
				(y - top) * out.w * 4
			);
		return out;
	});
}

function tile(images: (Img | null)[], columns: number, gap = 0): Img {
	const available = images.filter((image): image is Img => !!image);
	if (!available.length)
		throw new LocalizedError('No artwork is available to share', 'share.error.noArtwork');
	const w = Math.max(...available.map((image) => image.w)),
		h = Math.max(...available.map((image) => image.h));
	const rows = Math.ceil(images.length / columns);
	const out: Img = {
		w: columns * w + (columns - 1) * gap,
		h: rows * h + (rows - 1) * gap,
		data: new Uint8ClampedArray(
			(columns * w + (columns - 1) * gap) * (rows * h + (rows - 1) * gap) * 4
		)
	};
	images.forEach((image, index) => {
		if (!image) return;
		const ox = (index % columns) * (w + gap),
			oy = Math.floor(index / columns) * (h + gap);
		for (let y = 0; y < image.h; y++)
			out.data.set(
				image.data.subarray(y * image.w * 4, (y + 1) * image.w * 4),
				((oy + y) * out.w + ox) * 4
			);
	});
	return out;
}

export const buildSharePresentation = (
	project: PresentationAvailability['project'],
	options?: PresentationOptions
) => buildPresentation(project, { ...options, allowPartialAnimations: true });

const selectedMoves = (a: PresentationAvailability, move: string) =>
	a.project.manifest.rig.animations.filter(
		(animation) => move === ALL_MOVES || animation.id === move
	);
const selectedDirections = (a: PresentationAvailability, direction: string) =>
	direction === ALL_DIRECTIONS ? a.directions : a.directions.filter((id) => id === direction);

/** A GIF needs at least two authored moments among the renderable selected moves. */
export function canAnimateShare(
	a: PresentationAvailability,
	move: string,
	direction: string
): boolean {
	const directions = selectedDirections(a, direction);
	let moments = 0;
	for (const { id, frames } of selectedMoves(a, move)) {
		const views = a.animations.get(id);
		const available = new Set(directions.flatMap((facing) => views?.get(facing)?.frames ?? []));
		moments += frames.filter((frame) => available.has(frame)).length;
		if (moments > 1) return true;
	}
	return false;
}

/** Compose the selected dressed artwork once. The preview, PNG and GIF all consume these same pixels. */
export function buildShareMedia(
	a: PresentationAvailability,
	items: Preset['items'],
	move: string,
	direction: string,
	animate: boolean
): ShareMedia {
	if (a.loading)
		throw new LocalizedError('Character artwork is still loading', 'share.error.loading');
	const moves = selectedMoves(a, move);
	const directions = selectedDirections(a, direction);
	const omitted: ShareMedia['omitted'] = [];
	const entries: {
		timeline: { cell: number; ms: number }[];
		views: Map<DirectionName, Map<number, Img>>;
	}[] = [];
	for (const { id: selectedMove, frames: timeline } of moves) {
		const views = new Map<DirectionName, Map<number, Img>>();
		for (const id of directions) {
			const presentation = resolvePreview(a, { clip: selectedMove, direction: id });
			const frames = presentation.sequence?.frames ?? [];
			const images = new Map<number, Img>();
			for (const { cell } of animate ? frames : frames.slice(0, 1)) {
				if (images.has(cell)) continue;
				const { image } = renderPresentation(a, items, presentation, cell);
				if (image) images.set(cell, image);
			}
			if (images.size) views.set(id, images);
			else omitted.push({ move: selectedMove, direction: id });
		}
		if (views.size) entries.push({ timeline, views });
	}
	if (!entries.length) {
		const facing = directions.find((id) => a.stills.has(id));
		const presentation = facing
			? resolvePreview(a, { clip: move, direction: facing })
			: resolveLive(a, { velocity: { x: 0, y: 0 }, defaultDirection: directions[0] });
		const { image, frame } = renderPresentation(a, items, presentation);
		const still = image ?? makeImg(frame.w, frame.h);
		return {
			frames: [{ image: still, ms: 1000 }],
			still,
			animated: false,
			grid: false,
			previewRows: 1,
			omitted,
			empty: !image,
			mime: 'image/png',
			extension: 'png'
		};
	}
	const layoutDirections = directions.filter((id) => entries.some((entry) => entry.views.has(id)));
	const columns =
		layoutDirections.length <= 4 ? layoutDirections.length : layoutDirections.length <= 6 ? 3 : 4;
	const rowsPerMove = Math.ceil(layoutDirections.length / columns);
	const gap = columns > 1 || entries.length > 1 ? 4 : 0;
	const still = tile(
		entries.flatMap((entry) => [
			...layoutDirections.map((id) => entry.views.get(id)?.values().next().value ?? null),
			...Array<null>(columns * rowsPerMove - layoutDirections.length).fill(null)
		]),
		columns,
		gap
	);
	const frames: ShareFrame[] = [];
	if (animate)
		for (const entry of entries)
			for (const { cell, ms } of entry.timeline) {
				const images = layoutDirections.map((id) => entry.views.get(id)?.get(cell) ?? null);
				if (!images.some(Boolean)) continue;
				frames.push({
					image: tile(images, columns, columns > 1 ? 4 : 0),
					ms
				});
			}
	const animated = animate && frames.length > 1;
	if (animated && (frames[0].image.w > 65535 || frames[0].image.h > 65535))
		throw new LocalizedError('Selected GIF is too large', 'share.error.gifTooLarge');
	return {
		frames: animated ? frames : [{ image: still, ms: 1000 }],
		still,
		animated,
		grid: columns > 1 || entries.length > 1,
		previewRows: animated ? rowsPerMove : entries.length * rowsPerMove,
		omitted,
		empty: false,
		mime: animated ? 'image/gif' : 'image/png',
		extension: animated ? 'gif' : 'png'
	};
}

function paletteFor(image: Img): { colors: number[][]; indices: Uint8Array } {
	const exact = new Map<string, number>(),
		colors: number[][] = [[0, 0, 0]],
		indices = new Uint8Array(image.w * image.h);
	for (let p = 0; p < indices.length; p++) {
		const i = p * 4;
		if (image.data[i + 3] < 128) continue;
		const key = `${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`;
		let index = exact.get(key);
		if (!index) {
			if (colors.length === 256) {
				const reduced = quantize(image.data, 255);
				const mapped = applyPalette(image.data, reduced);
				for (let n = 0; n < mapped.length; n++)
					indices[n] = image.data[n * 4 + 3] < 128 ? 0 : mapped[n] + 1;
				return { colors: [[0, 0, 0], ...reduced], indices };
			}
			index = colors.length;
			colors.push(key.split(',').map(Number));
			exact.set(key, index);
		}
		indices[p] = index;
	}
	return { colors, indices };
}

const outputImage = (media: ShareMedia) => (media.animated ? media.frames[0].image : media.still);

export function shareDimensions(media: ShareMedia, scale = 1): { w: number; h: number } {
	const image = outputImage(media);
	return { w: image.w * scale, h: image.h * scale };
}

function scaled(image: Img, scale: number): Img {
	if (!SHARE_SCALES.some((value) => value === scale))
		throw new LocalizedError('Select an available image size', 'share.error.size');
	const w = image.w * scale,
		h = image.h * scale;
	// Bound the working raster, PNG scanlines and GIF palette buffers on small devices.
	if (w * h > 16_777_216)
		throw new LocalizedError(
			'Selected image is too large. Choose a smaller size or fewer views',
			'share.error.imageTooLarge'
		);
	if (scale === 1) return image;
	const data = new Uint8ClampedArray(w * h * 4);
	for (let y = 0; y < image.h; y++) {
		const row = y * scale * w * 4;
		for (let x = 0; x < image.w; x++) {
			const pixel = image.data.subarray((y * image.w + x) * 4, (y * image.w + x + 1) * 4);
			for (let n = 0; n < scale; n++) data.set(pixel, row + (x * scale + n) * 4);
		}
		for (let n = 1; n < scale; n++) data.copyWithin(row + n * w * 4, row, row + w * 4);
	}
	return { w, h, data };
}

/** Clipboard PNG represents the fixed first output frame, even while preview playback advances. */
export function encodeSharePng(media: ShareMedia, scale = 1): Promise<Uint8Array> {
	return encodePngBytes(scaled(outputImage(media), scale));
}

export async function encodeShareMedia(
	media: ShareMedia,
	scale = 1,
	signal?: AbortSignal
): Promise<Uint8Array> {
	signal?.throwIfAborted();
	if (!media.animated) return encodeSharePng(media, scale);
	const gif = GIFEncoder();
	for (const { image, ms } of media.frames) {
		signal?.throwIfAborted();
		const frame = scaled(image, scale);
		if (frame.w > 65535 || frame.h > 65535)
			throw new LocalizedError(
				'Selected GIF dimensions are too large. Choose a smaller size or fewer views',
				'share.error.gifDimensions'
			);
		const { colors, indices } = paletteFor(frame);
		// Shared previews repeat continuously regardless of exported playback metadata.
		gif.writeFrame(indices, frame.w, frame.h, {
			palette: colors,
			transparent: true,
			transparentIndex: 0,
			delay: ms,
			repeat: 0,
			dispose: 2
		});
		// Release each scaled frame and allow selection changes to cancel remaining work.
		await new Promise<void>((resolve) => setTimeout(resolve, 0));
	}
	signal?.throwIfAborted();
	gif.finish();
	return gif.bytes();
}
