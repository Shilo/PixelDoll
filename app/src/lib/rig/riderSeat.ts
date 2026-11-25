import type { Manifest } from '../store/manifest.ts';
import {
	DEFAULT_MOVE,
	type DirectionName,
	type MountSeatOffset,
	type Rig,
	type RigAnimation,
	type RiderSeatPoint
} from './rig.ts';

export const MAX_MOUNT_SEAT_OFFSET = 32;
export const AUTOMATIC_MOUNT_SEAT: Readonly<MountSeatOffset> = { x: 0, y: 0 };

export function validMountSeatOffset(
	offset: MountSeatOffset | undefined
): offset is MountSeatOffset {
	return (
		!!offset &&
		Number.isInteger(offset.x) &&
		Math.abs(offset.x) <= MAX_MOUNT_SEAT_OFFSET &&
		Number.isInteger(offset.y) &&
		Math.abs(offset.y) <= MAX_MOUNT_SEAT_OFFSET
	);
}

export function mountSeatOffset(
	rig: Pick<Rig, 'mountSeatOffsets'> | undefined,
	direction: DirectionName
): MountSeatOffset {
	const offset = rig?.mountSeatOffsets?.[direction];
	return validMountSeatOffset(offset) ? offset : AUTOMATIC_MOUNT_SEAT;
}

/** The signed pixel offset written to the engine manifest. */
export function riderSeatOffset(
	point: Pick<RiderSeatPoint, 'x' | 'y'>,
	pivot: Manifest['rig']['pivot']
) {
	return { x: point.x - pivot.x, y: point.y - pivot.y };
}

/** A repeated timeline entry still displays the same cell. Standing and multi-cell clips have no seat edit. */
export function seatPose(clip: RigAnimation | undefined) {
	return (
		!!clip &&
		clip.id !== DEFAULT_MOVE &&
		clip.cells === 1 &&
		clip.frames.length > 0 &&
		clip.frames.every(({ cell }) => cell === 0)
	);
}

/** Match the compositor's rule: an explicit row, even an empty one, takes precedence over a mirror. */
export function riderSeatArt(
	manifest: Manifest,
	clip: RigAnimation | undefined,
	direction: DirectionName
) {
	if (!clip || !seatPose(clip)) return;
	const facing = manifest.rig.directions.find(({ id }) => id === direction);
	if (!facing) return;
	const base = manifest.items.find(({ id }) => id === manifest.rig.baseItem);
	const rows = base?.layers[0]?.cells?.[clip.id];
	const source = rows?.[direction] ? direction : (facing.mirrorOf ?? direction);
	const body = rows?.[source]?.[0];
	if (body) return { body, source };
}

export function validSeatPoint({ cell }: Manifest['rig'], point: Pick<RiderSeatPoint, 'x' | 'y'>) {
	return (
		Number.isInteger(point.x) &&
		Number.isInteger(point.y) &&
		point.x >= 0 &&
		point.x <= cell.w &&
		point.y >= 0 &&
		point.y <= cell.h
	);
}

export function reviewedSeatPoint(
	manifest: Manifest,
	clip: RigAnimation | undefined,
	direction: DirectionName
) {
	const point = clip?.seatPoints?.[direction];
	if (!point || !validSeatPoint(manifest.rig, point)) return;
	const art = riderSeatArt(manifest, clip, direction);
	if (art && art.body === point.body && art.source === point.source) return point;
}
