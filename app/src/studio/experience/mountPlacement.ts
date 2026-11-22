// Where a presented rider sits on the test mount, shared by the stage and the Mount settings preview.
import { bakedFrame } from '../../lib/compose/compose.ts';
import type { Project } from '../../lib/store/manifest.ts';
import { paintedFrame, previewBounds } from './bounds.ts';
import { mountView, riderContact, TEST_MOUNT } from './mounts.ts';
import type { Presentation } from './presentation.ts';

/** The mount view, the rider's standing ground and seat contact in rider-image pixels, or why the mount is hidden. */
export function mountPlacement(
	project: Project,
	p: Presentation,
	grounding: ReturnType<typeof previewBounds> = previewBounds(project)
) {
	if (p.kind === 'unavailable' || !p.direction || !p.clip) return null;
	const frame = bakedFrame(project.manifest),
		body = grounding?.body ?? paintedFrame(project, {});
	const facing = grounding?.facings.get(p.direction);
	const height = facing?.standingHeight ?? body.h;
	const result = mountView(TEST_MOUNT, p.direction, height);
	if (!result.ok) return { view: null, failure: result, direction: p.direction } as const;
	const ground = { x: frame.x + (facing?.x ?? 0), y: frame.y + (facing?.y ?? 0) };
	const cell = p.kind === 'animation' ? (p.sequence?.frames[0]?.cell ?? p.cell) : p.cell;
	const contact = riderContact(
		project.manifest.rig,
		frame,
		p.clip,
		p.direction,
		cell,
		ground,
		height
	);
	return { view: result.view, ground, contact } as const;
}
