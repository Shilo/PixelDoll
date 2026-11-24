// Live Views settings: the State or Move each action plays, saved per character (liveRoles.ts) in this browser.
import { LIVE_ROLES, type LiveRole, type LiveRoleChoices } from './liveRoles.ts';
import { asObject, parseObject, preferenceStore } from './preferenceStore.ts';

export const LIVE_KEY = 'pixeldoll.liveViews';
export interface LivePreferences {
	/** Choices per character ID. */
	roles: Record<string, LiveRoleChoices>;
}

/** Keeps every valid character and role on its own, so one bad value never discards the others. */
export function parseLivePreferences(text: string | null): LivePreferences {
	const roles = asObject(parseObject(text).roles);
	return {
		roles: Object.fromEntries(
			Object.entries(roles).flatMap(([id, value]) => {
				const choices = Object.fromEntries(
					Object.entries(asObject(value)).filter(
						([role, clip]) =>
							LIVE_ROLES.includes(role as LiveRole) && typeof clip === 'string' && clip
					)
				) as LiveRoleChoices;
				return Object.keys(choices).length ? [[id, choices]] : [];
			})
		)
	};
}

export const livePreferences = preferenceStore(LIVE_KEY, parseLivePreferences);

/** Returns the new preferences and whether the browser saved them. */
export function setLiveRole(
	projectId: string,
	role: LiveRole,
	clip: string,
	base?: LivePreferences
) {
	return livePreferences.update((current) => {
		if ((current.roles[projectId]?.[role] ?? '') === clip) return current;
		const choices = { ...current.roles[projectId] };
		if (clip) choices[role] = clip;
		else delete choices[role];
		const roles = { ...current.roles };
		if (Object.keys(choices).length) roles[projectId] = choices;
		else delete roles[projectId];
		return { roles };
	}, base);
}

/** Forget a permanently deleted character's choices, or every choice of one deleted clip. */
export function forgetLiveRoles(projectId: string, clip?: string, base?: LivePreferences) {
	return livePreferences.update((current) => {
		const saved = current.roles[projectId];
		if (!saved) return current;
		const choices = Object.fromEntries(
			clip === undefined ? [] : Object.entries(saved).filter(([, chosen]) => chosen !== clip)
		) as LiveRoleChoices;
		if (Object.keys(choices).length === Object.keys(saved).length) return current;
		const roles = { ...current.roles };
		if (Object.keys(choices).length) roles[projectId] = choices;
		else delete roles[projectId];
		return { roles };
	}, base);
}

/** The page resets the open character's choices; Reset all (null) clears every character's. */
export function resetLiveRoles(projectId: string | null, base?: LivePreferences) {
	return livePreferences.update((current) => {
		if (projectId === null) return Object.keys(current.roles).length ? { roles: {} } : current;
		if (!current.roles[projectId]) return current;
		const roles = { ...current.roles };
		delete roles[projectId];
		return { roles };
	}, base);
}
