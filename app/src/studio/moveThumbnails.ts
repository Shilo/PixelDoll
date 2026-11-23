import type { Img } from '../lib/image/png.ts';
import { cellImg, type Frame } from '../lib/compose/compose.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import type { DirectionName, Preset, Project } from '../lib/store/manifest.ts';
import { stableStringify } from '../lib/image/hash.ts';
import {
	buildPresentation,
	renderPresentation,
	resolvePreview,
	type PresentationAvailability
} from './experience/presentation.ts';
import { paintedFrame } from './experience/bounds.ts';

export function moveThumbnails(assets: PresentationAvailability, items: Preset['items']) {
	const images = new Map<string, Img>();
	const framesByMove = new Map<string, Frame>();
	const budget = 4 * 1024 * 1024;
	let bytes = 0;
	return (animation: string, direction: DirectionName, frame: number): Img | null => {
		const pose = resolvePreview(assets, { clip: animation, direction });
		if (!pose.clip || !pose.direction) return null;
		const clip = pose.clip;
		const facing = pose.direction;
		const frames = pose.sequence?.frames;
		const cell = frames ? frames.at(frame % frames.length)!.cell : pose.cell;
		const key = JSON.stringify([animation, direction, cell]);
		const cached = images.get(key);
		if (cached) return cached;
		const { image } = renderPresentation(assets, items, pose, cell, (visible, cells) => {
			const frameKey = JSON.stringify([animation, direction]);
			const existing = framesByMove.get(frameKey);
			if (existing) return existing;
			const fitted = paintedFrame(assets.project, visible, facing, { clip, cells });
			framesByMove.set(frameKey, fitted);
			return fitted;
		});
		if (!image) return null;
		if (image.data.byteLength > budget) return image;
		while (bytes + image.data.byteLength > budget) {
			const oldest = images.keys().next().value!;
			bytes -= images.get(oldest)!.data.byteLength;
			images.delete(oldest);
		}
		images.set(key, image);
		bytes += image.data.byteLength;
		return image;
	};
}

const looks = new WeakMap<Project, { key: string; thumbnail: ReturnType<typeof moveThumbnails> }>();

/** The dressed look's clip thumbnails, one cache per shown project and outfit, shared by the Moves and States tabs and
 *  every clip picker. A negative frame counts from the end. */
export function lookThumbnails(project: Project, items: Preset['items']) {
	const key = stableStringify(items);
	const cached = looks.get(project);
	if (cached?.key === key) return cached.thumbnail;
	const thumbnail = moveThumbnails(buildPresentation(project), items);
	looks.set(project, { key, thumbnail });
	return thumbnail;
}

/** A picker row: the dressed look's last frame of a clip, in the given facing when it has art, else any facing. */
export function lookClipThumbnail(
	project: Project,
	items: Preset['items'],
	key: string,
	facing: DirectionName
): Img | null {
	const thumbnail = lookThumbnails(project, items);
	const facings = [facing, ...project.manifest.rig.directions.map(({ id }) => id)];
	for (const direction of new Set(facings)) {
		const image = thumbnail(key, direction, -1);
		if (image && opaqueBox(image)) return image;
	}
	return null;
}

/** The base body’s last frame of a clip for picker rows, in the given facing when it has art. */
export function bodyClipThumbnail(
	project: Project,
	key: string,
	facing: DirectionName
): Img | null {
	const { rig } = project.manifest;
	const body = project.manifest.items.find((item) => item.id === rig.baseItem)?.layers[0];
	const cells = body?.cells?.[key];
	const cell = rig.animations.find((clip) => clip.id === key)?.frames.at(-1)?.cell;
	if (!body || !cells || cell === undefined) return null;
	// The requested facing as the runtime resolves it (stored override first, then its mirror), else any facing with art.
	const art = (direction: DirectionName) => {
		const image = cellImg(project, body, key, direction, cell);
		return image && opaqueBox(image) ? image : null;
	};
	const shown = art(facing);
	if (shown) return shown;
	for (const { id } of rig.directions) {
		const image = id === facing ? null : art(id);
		if (image) return image;
	}
	return null;
}
