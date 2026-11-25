// Where a presented rider sits on the test mount, shared by the stage and the Mount settings preview.
import { bakedFrame } from '../../lib/compose/compose.ts';
import { mountSeatOffset, reviewedSeatPoint } from '../../lib/rig/riderSeat.ts';
import type { MountSeatOffset } from '../../lib/rig/rig.ts';
import type { DirectionName, Project } from '../../lib/store/manifest.ts';
import { paintedFrame, type previewBounds } from './bounds.ts';
import { mountView, riderContact, TEST_MOUNT, type MountView } from './mounts.ts';
import type { Presentation } from './presentation.ts';

/** The same adjusted saddle is used for the marker, rider, bounds and selection thumbnails. */
export function offsetMountSeat(view: MountView, { x, y }: MountSeatOffset): MountView {
	if (!x && !y) return view;
	return {
		...view,
		frames: view.frames.map((frame) => ({
			...frame,
			seat: { x: frame.seat.x + x, y: frame.seat.y + y }
		}))
	};
}

/** The mount view, the rider's standing ground and seat contact in rider-image pixels, or why the mount is hidden. */
export function mountPlacement(
	project: Project,
	mountFacing: DirectionName | null,
	p: Presentation,
	/** previewBounds(project), which callers already hold. */
	grounding: ReturnType<typeof previewBounds> | null,
	/** A Mount settings draft also supplies zero when previewing Automatic. */
	offset?: MountSeatOffset
) {
	if (!mountFacing || p.kind === 'unavailable' || !p.direction || !p.clip) return null;
	const frame = bakedFrame(project.manifest),
		body = grounding?.body ?? paintedFrame(project, {});
	const mount = grounding?.facings.get(mountFacing);
	const rider = grounding?.facings.get(p.direction);
	const result = mountView(TEST_MOUNT, mountFacing, mount?.standingHeight ?? body.h);
	if (!result.ok) return { view: null, failure: result, direction: mountFacing } as const;
	const ground = { x: frame.x + (mount?.x ?? 0), y: frame.y + (mount?.y ?? 0) };
	const riderGround = { x: frame.x + (rider?.x ?? 0), y: frame.y + (rider?.y ?? 0) };
	const cell = p.kind === 'animation' ? (p.sequence?.frames[0]?.cell ?? p.cell) : p.cell;
	const { rig } = project.manifest;
	const clip = rig.animations.find(({ id }) => id === p.clip);
	const saved = cell === 0 && reviewedSeatPoint(project.manifest, clip, p.direction);
	const point = saved && project.images.has(saved.body) ? saved : null;
	const contact = point
		? {
				x: frame.x + point.x - rig.pivot.x,
				y: frame.y + point.y - rig.pivot.y,
				source: 'reviewed' as const
			}
		: riderContact(
				project.manifest.rig,
				frame,
				p.clip,
				p.direction,
				cell,
				riderGround,
				rider?.standingHeight ?? body.h
			);
	return {
		view: offsetMountSeat(result.view, offset ?? mountSeatOffset(rig, mountFacing)),
		ground,
		riderGround,
		contact
	} as const;
}
