// The open tab's Live Views choices (experience.liveRoles), saved through liveSettings.ts.
import type { RigAnimation } from '../../lib/store/manifest.ts';
import { liveClips, type LiveRole } from './liveRoles.ts';
import {
	DEFAULT_LIVE_LAYERING,
	forgetLiveRoles,
	livePreferences,
	resetLiveRoles,
	setLiveRole,
	setLiveLayering,
	type LiveLayering,
	type LivePreferences
} from './liveSettings.ts';
import { experience } from './state.svelte.ts';

// After a refused save, this tab's choices are newer than storage, so later changes build on them instead.
let unsaved = false;
function apply(result: { preferences: LivePreferences; saved: boolean }) {
	unsaved = !result.saved;
	experience.liveRoles = result.preferences.roles;
	experience.liveLayering = result.preferences.layering ?? {};
	return result.saved;
}
const base = () =>
	unsaved
		? { roles: { ...experience.liveRoles }, layering: { ...experience.liveLayering } }
		: undefined;

export const currentLiveLayering = (projectId: string) =>
	experience.liveLayering[projectId] ?? DEFAULT_LIVE_LAYERING;
export const chooseLiveLayering = (projectId: string, value: LiveLayering) =>
	apply(setLiveLayering(projectId, value, base()));

/** False when the browser refused to save; the choice still applies for this session. An empty clip is Automatic. */
export const chooseLiveRole = (projectId: string, role: LiveRole, clip: string) =>
	apply(setLiveRole(projectId, role, clip, base()));
export const forgetLiveChoices = (projectId: string, clip?: string) =>
	apply(forgetLiveRoles(projectId, clip, base()));
export const resetLiveViews = (projectId: string | null) =>
	apply(resetLiveRoles(projectId, base()));
export const liveViewsAtDefaults = (projectId: string) =>
	!experience.liveRoles[projectId] && !experience.liveLayering[projectId];
export const liveRolesSaved = () =>
	Object.keys(experience.liveRoles).length + Object.keys(experience.liveLayering).length > 0;

/** The clips the open character plays in Top-down and Side-scroller. */
export const currentLiveClips = (projectId: string, animations: readonly RigAnimation[]) =>
	liveClips(animations, experience.liveRoles[projectId]);

/** Another tab's choices apply here too. */
export const watchLivePreferences = () =>
	livePreferences.watch(() => {
		const preferences = livePreferences.read();
		experience.liveRoles = preferences.roles;
		experience.liveLayering = preferences.layering ?? {};
		unsaved = false;
	});
