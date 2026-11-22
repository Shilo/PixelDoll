import { stableStringify } from '../lib/image/hash.ts';
import type { Img } from '../lib/image/png.ts';
import type { Size } from '../lib/pixellab/routes.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import { cellHash, DIRECTIONS, type DirectionName, type Sha256 } from '../lib/rig/rig.ts';
import { clipKind } from '../lib/runtime/timeline.js';
import type { Project } from '../lib/store/manifest.ts';

export interface StateGenerationSource {
	size: Size;
	version: string;
	views: { direction: DirectionName; hash: Sha256; image: Img }[];
}

/** A saved frame a State starts from: any State or Move frame, by position in its frames. */
export interface StateSourceFrame {
	clip: string;
	frame: number;
}

/** The drawn (non-mirrored) views of one saved frame; null when a drawn view is unusable. */
export function stateGenerationSource(
	project: Project,
	{ clip: id, frame: position }: StateSourceFrame
): StateGenerationSource | null {
	const { rig } = project.manifest;
	const clip = rig.animations.find((candidate) => candidate.id === id);
	const layer = project.manifest.items.find((item) => item.id === rig.baseItem)?.layers[0];
	const cells = layer?.cells?.[id];
	const frame = clip?.frames[position];
	if (!clip || !cells || !frame) return null;
	const views: StateGenerationSource['views'] = [];
	const size = { width: rig.cell.w, height: rig.cell.h };
	for (const { id: direction, mirrorOf } of rig.directions) {
		if (mirrorOf) continue;
		const hash = cells[direction]?.[frame.cell];
		if (!hash) continue;
		const image = project.images.get(hash);
		if (!image || image.w !== size.width || image.h !== size.height || !opaqueBox(image))
			return null;
		views.push({ direction, image, hash });
	}
	if (!views.length) return null;
	return {
		size,
		views,
		version: stableStringify({
			id,
			kind: clipKind(clip),
			frame: position,
			cell: frame.cell,
			base: rig.baseItem,
			size,
			pivot: rig.pivot,
			directions: rig.directions,
			hashes: views.map(({ direction, hash }) => [direction, hash])
		})
	};
}

export interface ManagedStateDetail {
	id: string;
	status?: string;
	size: Size;
	directions: number;
	state_name?: string | null;
	rotation_urls?: Partial<Record<DirectionName, string | null>> | null;
}

export function managedStateRotations(remote: ManagedStateDetail | null | undefined): {
	rotations: NonNullable<ManagedStateDetail['rotation_urls']>;
	count: 4 | 8;
} | null {
	const count = remote?.directions;
	const rotations = remote?.rotation_urls;
	if ((count !== 4 && count !== 8) || !rotations) return null;
	const directions =
		count === 8 ? DIRECTIONS : DIRECTIONS.filter((direction) => !direction.includes('-'));
	return directions.every(
		(direction) => typeof rotations[direction] === 'string' && rotations[direction]?.trim()
	)
		? { rotations, count }
		: null;
}

export async function verifyManagedStateParent(
	local: StateGenerationSource,
	storedId: string,
	remote: ManagedStateDetail,
	readRotation: (url: string) => Promise<Img | null>
) {
	const inventory = managedStateRotations(remote);
	const size = remote?.size;
	if (
		remote?.id !== storedId ||
		(remote.status ?? 'completed') !== 'completed' ||
		!inventory ||
		size?.width !== local.size.width ||
		size.height !== local.size.height
	)
		return null;
	for (const { direction, hash } of local.views) {
		const url = inventory.rotations[direction];
		if (!url) return null;
		const image = await readRotation(url);
		if (
			!image ||
			image.w !== size.width ||
			image.h !== size.height ||
			(await cellHash(image)) !== hash
		)
			return null;
	}
	return { id: storedId, size, facingCount: inventory.count, name: remote.state_name ?? null };
}
