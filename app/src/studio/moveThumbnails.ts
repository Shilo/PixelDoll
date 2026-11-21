import type { Img } from '../lib/image/png.ts';
import { cellImg, type Frame } from '../lib/compose/compose.ts';
import type { DirectionName, Preset, Project } from '../lib/store/manifest.ts';
import {
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
		const cell = frames ? frames[frame % frames.length].cell : pose.cell;
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

/** The base body's last frame of a clip, for picker rows: the facing when drawn, else the first drawn one. */
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
	const drawn = (id: DirectionName) => !!cells[id]?.[cell];
	const shown = rig.directions.find(
		({ id, mirrorOf }) => id === facing && drawn(mirrorOf ?? id)
	)?.id;
	const fallback = rig.directions.find(({ id, mirrorOf }) => !mirrorOf && drawn(id))?.id;
	const direction = shown ?? fallback;
	return direction ? (cellImg(project, body, key, direction, cell) ?? null) : null;
}
