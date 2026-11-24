// The open tab's Live Views choices (experience.liveRoles), saved through liveSettings.ts.
import type { RigAnimation } from '../../lib/store/manifest.ts';
import { liveClips, type LiveRole } from './liveRoles.ts';
import {
	forgetLiveRoles,
	livePreferences,
	resetLiveRoles,
	setLiveRole,
	type LivePreferences
} from './liveSettings.ts';
import { experience } from './state.svelte.ts';

// After a refused save, this tab's choices are newer than storage, so later changes build on them instead.
let unsaved = false;
function apply(result: { preferences: LivePreferences; saved: boolean }) {
	unsaved = !result.saved;
	experience.liveRoles = result.preferences.roles;
	return result.saved;
}
const base = () => (unsaved ? { roles: { ...experience.liveRoles } } : undefined);

/** False when the browser refused to save; the choice still applies for this session. An empty clip is Automatic. */
export const chooseLiveRole = (projectId: string, role: LiveRole, clip: string) =>
	apply(setLiveRole(projectId, role, clip, base()));
export const forgetLiveChoices = (projectId: string, clip?: string) =>
	apply(forgetLiveRoles(projectId, clip, base()));
export const resetLiveViews = (projectId: string | null) =>
	apply(resetLiveRoles(projectId, base()));
export const liveViewsAtDefaults = (projectId: string) => !experience.liveRoles[projectId];
export const liveRolesSaved = () => Object.keys(experience.liveRoles).length > 0;

/** The clips the open character plays in Top-down and Side-scroller. */
export const currentLiveClips = (projectId: string, animations: readonly RigAnimation[]) =>
	liveClips(animations, experience.liveRoles[projectId]);

/** Another tab's choices apply here too. */
export const watchLivePreferences = () =>
	livePreferences.watch(() => {
		experience.liveRoles = livePreferences.read().roles;
		unsaved = false;
	});
