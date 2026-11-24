// Mount preferences survive reloads in this browser (preferenceStore.ts).
import type { MountLegMode } from './mountLegs.ts';
import { parseObject, preferenceStore } from './preferenceStore.ts';

export const MOUNT_KEY = 'pixeldoll.mount';
const LEG_MODES: readonly MountLegMode[] = ['none', 'far', 'both'];
export interface MountPreferences {
	show: boolean;
	legs: MountLegMode;
	/** The Riding pose chosen per character ID. */
	poses: Record<string, string>;
}
export const MOUNT_DEFAULTS: Readonly<MountPreferences> = Object.freeze({
	show: false,
	legs: 'far',
	poses: {}
});

/** Validates every field on its own, so one bad value never discards the others. */
export function parseMountPreferences(text: string | null): MountPreferences {
	const value = parseObject(text) as Partial<MountPreferences>;
	return {
		show: value.show === true,
		legs: LEG_MODES.includes(value.legs as MountLegMode)
			? (value.legs as MountLegMode)
			: MOUNT_DEFAULTS.legs,
		poses:
			value.poses && typeof value.poses === 'object'
				? Object.fromEntries(
						Object.entries(value.poses).filter(([, clip]) => typeof clip === 'string')
					)
				: {}
	};
}

export const mountPreferences = preferenceStore(MOUNT_KEY, parseMountPreferences);
export const readMountPreferences = mountPreferences.read;
export const updateMountPreferences = mountPreferences.update;
