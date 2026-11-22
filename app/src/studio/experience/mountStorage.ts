// Mount preferences survive reloads in this browser. Storage is optional: an unreadable or blocked store leaves the
// defaults in place. A workspace copy keeps its own in memory, like the other Studio preferences.
import { copyPreferences, workspaceCopy } from '../../lib/store/workspace-mode.ts';
import type { MountLegMode } from './mountLegs.ts';

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
	let saved: unknown;
	try {
		saved = JSON.parse(text ?? 'null');
	} catch {
		saved = null;
	}
	const value = (saved && typeof saved === 'object' ? saved : {}) as Partial<MountPreferences>;
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

export function readMountPreferences(): MountPreferences {
	try {
		return parseMountPreferences(
			workspaceCopy ? (copyPreferences.get(MOUNT_KEY) ?? null) : localStorage.getItem(MOUNT_KEY)
		);
	} catch {
		return parseMountPreferences(null);
	}
}

/**
 * Applies one change to what is saved now, not to this tab's snapshot, so another tab's choices survive. Returns the
 * result and whether the browser saved it; an unsaved change still applies for this session.
 */
export function updateMountPreferences(
	change: (current: MountPreferences) => MountPreferences,
	/** What to build on instead of storage, when this tab holds choices storage refused. */
	base?: MountPreferences
): {
	preferences: MountPreferences;
	saved: boolean;
} {
	const preferences = change(base ?? readMountPreferences());
	const text = JSON.stringify(preferences);
	try {
		if (workspaceCopy) copyPreferences.set(MOUNT_KEY, text);
		else localStorage.setItem(MOUNT_KEY, text);
		return { preferences, saved: true };
	} catch {
		return { preferences, saved: false };
	}
}
