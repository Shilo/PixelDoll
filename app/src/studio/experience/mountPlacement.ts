// Where a presented rider sits on the test mount, shared by the stage and the Mount settings preview.
import { bakedFrame } from '../../lib/compose/compose.ts';
import { reviewedSeatPoint } from '../../lib/rig/riderSeat.ts';
import type { RiderSeatPoint } from '../../lib/rig/rig.ts';
import type { DirectionName, Project } from '../../lib/store/manifest.ts';
import { paintedFrame, type previewBounds } from './bounds.ts';
import { mountView, riderContact, TEST_MOUNT } from './mounts.ts';
import type { Presentation } from './presentation.ts';

/** The mount view, the rider's standing ground and seat contact in rider-image pixels, or why the mount is hidden. */
export function mountPlacement(
	project: Project,
	mountFacing: DirectionName | null,
	p: Presentation,
	/** previewBounds(project), which callers already hold. */
	grounding: ReturnType<typeof previewBounds> | null,
	/** A settings draft can show a different point, or null to preview automatic placement. */
	override?: Pick<RiderSeatPoint, 'x' | 'y'> | null
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
	const point =
		override === undefined ? (saved && project.images.has(saved.body) ? saved : null) : override;
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
	return { view: result.view, ground, riderGround, contact } as const;
}
