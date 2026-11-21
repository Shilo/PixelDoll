import { stableStringify } from '../lib/image/hash.ts';
import { hasAll } from '../lib/rig/poses.ts';
import type { DirectionName, RestView } from '../lib/rig/rig.ts';
import { lastPlaybackCell } from '../lib/runtime/timeline.js';
import type { Manifest } from '../lib/store/manifest.ts';

export type MoveSourceSelection = { clip: string; cell?: number };
export type MoveSource = MoveSourceSelection & {
	replacement?: true;
	geometry: string;
	views: Partial<Record<DirectionName, RestView>>;
};

const sourceGeometry = ({ rig }: Manifest) =>
	stableStringify([rig.cell, rig.pivot, rig.directions, rig.view]);

export const moveSourceFitsGeometry = (manifest: Manifest, source: MoveSource) =>
	source.geometry === sourceGeometry(manifest);

export function savedReplacementSource(
	manifest: Manifest,
	clip: string,
	directions: readonly DirectionName[]
): MoveSource | undefined {
	const previous = manifest.rig.animations.find((entry) => entry.id === clip)?.sources;
	if (!directions.some((direction) => previous?.[direction]?.referenceKeypoints)) return;
	const views: MoveSource['views'] = {};
	for (const direction of directions) {
		const source = previous?.[direction];
		const rest = manifest.rig.rest?.[direction];
		if (source?.referenceKeypoints)
			views[direction] = { image: source.reference, keypoints: source.referenceKeypoints };
		else if (rest) views[direction] = rest;
	}
	return { clip, replacement: true, geometry: sourceGeometry(manifest), views };
}

export function resolveMoveSource(
	manifest: Manifest,
	selection: MoveSourceSelection,
	directions: readonly DirectionName[]
): MoveSource | undefined {
	const rig = manifest.rig;
	const clip = rig.animations.find((entry) => entry.id === selection.clip);
	const cell = selection.cell ?? (clip && lastPlaybackCell(clip));
	if (!clip || cell === undefined || !Number.isInteger(cell) || cell < 0 || cell >= clip.cells)
		return;
	const body = manifest.items.find((item) => item.id === rig.baseItem);
	const layers = body?.layers;
	if (layers?.length !== 1) return;
	const views: MoveSource['views'] = {};
	for (const direction of directions) {
		const image = layers[0].cells?.[clip.id]?.[direction]?.[cell];
		const keypoints = clip.sources?.[direction]?.measured?.[cell];
		if (!image || !keypoints || !hasAll(keypoints)) return;
		if (
			body?.frameEdits?.some(
				(edit) =>
					edit.anim === clip.id &&
					edit.frames.some(
						(frame) =>
							frame.dir === direction &&
							frame.cell === cell &&
							frame.layers.some(({ before, after }) => before !== after && after === image)
					)
			)
		)
			return;
		views[direction] = { image, keypoints };
	}
	return {
		clip: selection.clip,
		cell: selection.cell,
		geometry: sourceGeometry(manifest),
		views
	};
}

export function moveSourceMatches(
	manifest: Manifest,
	source: MoveSource,
	directions: readonly DirectionName[]
): boolean {
	const current = source.replacement
		? savedReplacementSource(manifest, source.clip, directions)
		: resolveMoveSource(manifest, source, directions);
	return stableStringify(current ?? null) === stableStringify(source);
}
