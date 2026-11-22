// Mount settings: whether the test mount shows, which legs it hides, and the saved State each character holds as its
// Riding pose (docs/research/2026-11-21-riding-state/README.md). Choices persist through mountStorage.ts.
import { clipKind } from '../../lib/runtime/timeline.js';
import { DEFAULT_MOVE, type DirectionName } from '../../lib/rig/rig.ts';
import type { Manifest } from '../../lib/store/manifest.ts';
import type { MountLegMode } from './mountLegs.ts';
import {
	MOUNT_DEFAULTS,
	MOUNT_KEY,
	readMountPreferences,
	updateMountPreferences,
	type MountPreferences
} from './mountStorage.ts';
import { experience } from './state.svelte.ts';

export interface RiderPoseOption {
	id: string;
	/** Facings without body art, mirrors resolved; a pose is offered only when this is empty. */
	missing: DirectionName[];
}

/** Every saved State except Standing, with the facings it cannot show. */
export function riderPoseOptions(manifest: Manifest | undefined): RiderPoseOption[] {
	if (!manifest) return [];
	const { rig } = manifest;
	const body = manifest.items.find((item) => item.id === rig.baseItem)?.layers[0];
	// A mirrored facing is one hop from its drawn source (the rig validates that).
	const drawn = (clip: string, direction: DirectionName) => {
		const source = rig.directions.find(({ id }) => id === direction)?.mirrorOf ?? direction;
		return !!body?.cells?.[clip]?.[source]?.[0];
	};
	return rig.animations
		.filter((clip) => clipKind(clip) === 'state' && clip.id !== DEFAULT_MOVE)
		.map(({ id }) => ({
			id,
			missing: rig.directions.map((d) => d.id).filter((direction) => !drawn(id, direction))
		}));
}

/** A State other than Standing is drawn seated, so mounted leg cutting never applies to it. */
export function legsKept(manifest: Manifest | undefined, clip: string | null) {
	const animation = clip ? manifest?.rig.animations.find(({ id }) => id === clip) : undefined;
	return !!animation && clipKind(animation) === 'state' && animation.id !== DEFAULT_MOVE;
}

/** The Riding pose for this character, if it is still one of its States. */
export function activeRiderPose(projectId: string, manifest: Manifest | undefined) {
	const chosen = experience.ridingPoses[projectId];
	if (!chosen) return undefined;
	return riderPoseOptions(manifest).some(({ id }) => id === chosen) ? chosen : undefined;
}

/**
 * Preview shows the selected clip, so mounting with a Riding pose selects it there and dismounting restores what it
 * replaced, unless the selection has changed since. Returns the clip Preview should show.
 */
export function syncRiderPose(projectId: string, manifest: Manifest | undefined, selected: string) {
	const pose = experience.testMount ? activeRiderPose(projectId, manifest) : undefined;
	const replaced = experience.riderPoseReplaced;
	const own = replaced?.projectId === projectId ? replaced : null;
	if (own && own.pose !== pose) {
		experience.riderPoseReplaced = null;
		if (selected === own.pose) selected = own.clip;
	}
	if (pose && selected !== pose) {
		experience.riderPoseReplaced = { projectId, clip: selected, pose };
		selected = pose;
	}
	return selected;
}

function apply(preferences: MountPreferences) {
	experience.testMount = preferences.show;
	experience.mountLegs = preferences.legs;
	experience.ridingPoses = preferences.poses;
}
// After a refused save, this tab's choices are newer than storage, so later changes build on them instead.
let unsaved = false;
/** Each setter returns false when the browser refused to save; the choice still applies for this session. */
function update(change: (current: MountPreferences) => MountPreferences) {
	const { preferences, saved } = updateMountPreferences(
		change,
		unsaved
			? {
					show: experience.testMount,
					legs: experience.mountLegs,
					poses: { ...experience.ridingPoses }
				}
			: undefined
	);
	unsaved = !saved;
	apply(preferences);
	return saved;
}
export const setShowMount = (show: boolean) => update((current) => ({ ...current, show }));
export const setMountLegs = (legs: MountLegMode) => update((current) => ({ ...current, legs }));
export function setRidingPose(projectId: string, clip: string) {
	return update((current) => {
		const poses = { ...current.poses };
		if (clip) poses[projectId] = clip;
		else delete poses[projectId];
		return { ...current, poses };
	});
}
/** Forget a removed State or character, so a later State with the same ID is not chosen by itself. */
export function forgetRidingPose(projectId: string, clip?: string) {
	const saved = readMountPreferences().poses[projectId];
	if (saved !== undefined && (clip === undefined || saved === clip)) setRidingPose(projectId, '');
}

/** Like Wardrobe, the page resets the open character's Riding pose; Reset all clears every character's. */
export const mountAtDefaults = (projectId: string) =>
	experience.testMount === MOUNT_DEFAULTS.show &&
	experience.mountLegs === MOUNT_DEFAULTS.legs &&
	!experience.ridingPoses[projectId];
export const ridingPosesSaved = () => Object.keys(experience.ridingPoses).length > 0;
export function resetMount(projectId: string | null) {
	return update((current) => {
		const poses = { ...current.poses };
		if (projectId === null) for (const id of Object.keys(poses)) delete poses[id];
		else delete poses[projectId];
		return { ...MOUNT_DEFAULTS, poses };
	});
}

/** Another tab's mount choices apply here too; `changed` then lets Preview follow them. */
export function watchMountPreferences(changed: () => void) {
	const sync = (event: StorageEvent) => {
		if (event.key !== MOUNT_KEY && event.key !== null) return;
		try {
			if (event.storageArea !== localStorage) return;
		} catch {
			return;
		}
		apply(readMountPreferences());
		unsaved = false;
		changed();
	};
	addEventListener('storage', sync);
	return () => removeEventListener('storage', sync);
}
