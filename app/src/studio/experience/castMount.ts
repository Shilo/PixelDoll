// The selection cast's test mount: each character rides it as on stage while Show mount is on (Mount settings). Kept
// apart from thumbnails.svelte.ts so plain thumbnails do not depend on the Studio's presentation state.
import { makeImg } from '../../lib/image/png.ts';
import { over } from '../../lib/compose/compose.ts';
import { stableStringify } from '../../lib/image/hash.ts';
import type { Preset, Project } from '../../lib/store/manifest.ts';
import { characterFacts } from '../model.ts';
import { characterBodySize, previewBounds, standingFrame } from './bounds.ts';
import { hideMountedLegs, mountLegGeometry } from './mountLegs.ts';
import { mountPlacement } from './mountPlacement.ts';
import { placeRider } from './mounts.ts';
import {
	advancePlayback,
	buildPresentation,
	renderPresentation,
	resolveLive
} from './presentation.ts';
import { activeRiderPose, legsKept } from './riderPose.ts';
import { currentLiveClips } from './liveViews.ts';
import { experience } from './state.svelte.ts';
import { stills, type CharacterStill, type MountedVariant } from './thumbnails.svelte.ts';

/** The mount settings a character's cast still rides with, or '' while the mount is hidden. */
export function mountKey(id: string) {
	return experience.testMount
		? JSON.stringify([
				experience.mountLegs,
				experience.ridingPoses[id] ?? '',
				experience.liveRoles[id]?.idle ?? ''
			])
		: '';
}

const mountedRenders = new WeakMap<Project, { key: string; still: CharacterStill | null }>();
/**
 * The character in its default facing on the test mount's first gait frame, placed and leg-cut exactly as on stage, in the pose
 * Top-down and Side-scroller ride in (its Riding pose, else Ride, Riding, Idle or Standing). The body stays the standing body, so the cast keeps every character's size; the frame
 * moves the ground to the mount's feet. Null when the mount cannot carry this character (Preview hides it then too).
 */
export function mountedStill(
	id: string,
	project: Project,
	items: Preset['items'],
	revision = 0
): CharacterStill | null {
	const cacheKey = stableStringify([revision, items, mountKey(id)]);
	const cached = mountedRenders.get(project);
	if (cached?.key === cacheKey) return cached.still;
	const assets = buildPresentation(project);
	const p = resolveLive(assets, {
		velocity: { x: 0, y: 0 },
		riding: true,
		// Its default facing (south, else east for a side-view rig), so the Riding pose drawn for it applies.
		riderPose: activeRiderPose(id, project.manifest),
		items,
		clips: currentLiveClips(id, project.manifest.rig.animations)
	});
	const place = mountPlacement(project, p.intendedDirection, p, previewBounds(project));
	let still: CharacterStill | null = null;
	if (place?.view && p.clip && p.direction) {
		const cell = advancePlayback(p, undefined, 0).cell;
		const result = renderPresentation(assets, items, p, cell);
		if (result.image) {
			const legs = legsKept(project.manifest, p.clip) ? 'none' : experience.mountLegs;
			const rider = hideMountedLegs(
				result.image,
				result.frame,
				project.manifest.rig,
				p.clip,
				p.direction,
				cell,
				legs,
				legs === 'none' ? undefined : mountLegGeometry(project, p.clip, p.direction, cell)
			).image;
			const pose = place.view.frames[0];
			const at = placeRider(place.ground, place.contact, pose);
			const l = Math.min(at.mount.x, at.rider.x),
				t = Math.min(at.mount.y, at.rider.y);
			const image = makeImg(
				Math.max(at.mount.x + pose.back.w, at.rider.x + rider.w) - l,
				Math.max(at.mount.y + pose.back.h, at.rider.y + rider.h) - t
			);
			over(image, pose.back, at.mount.x - l, at.mount.y - t);
			over(image, rider, at.rider.x - l, at.rider.y - t);
			over(image, pose.front, at.mount.x - l, at.mount.y - t);
			const body = standingFrame(project, p.direction);
			still = {
				image,
				frame: {
					w: image.w,
					h: image.h,
					x: place.ground.x - l - body.w / 2 + body.x,
					y: place.ground.y - t - body.h + body.y
				},
				body,
				bodySize: characterBodySize(project),
				facts: characterFacts(project.manifest)
			};
		}
	}
	mountedRenders.set(project, { key: cacheKey, still });
	return still;
}

/** What the selection cast shows: the mounted still while the mount shows and it is drawn, else the plain one. */
export function castStill(
	id: string,
	entry: (CharacterStill & MountedVariant) | undefined = stills.get(id)
): CharacterStill | undefined {
	const key = mountKey(id);
	return (key && entry?.mount?.key === key && entry.mount.still) || entry;
}
