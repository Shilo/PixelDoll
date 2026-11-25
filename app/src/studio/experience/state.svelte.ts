/** Presentation state only. Projects, saves and paid workflows stay in Studio state. */
import { cancelStartupUpdate } from '../../lib/startup-update.ts';
import { resolveZoom, type SceneCamera } from './zoom.ts';
import type { MountLegMode } from './mountLegs.ts';
import { readMountPreferences } from './mountStorage.ts';
import { livePreferences } from './liveSettings.ts';
import { layout } from './geometry.ts';
import { panelSettings } from './panelSettings.svelte.ts';
export type WorldMode = 'preview' | 'topdown' | 'side';
const saved = readMountPreferences();
const liveSaved = livePreferences.read();
export const experience = $state({
	screen: 'characters' as 'characters' | 'studio',
	mode: 'preview' as WorldMode,
	previewPanelOpen: true,
	/** A separate visibility choice for one compact touch visit. Null shares Preview's visibility. */
	livePanelOpen: null as boolean | null,
	/** A closed panel still slides out over its own space, which the stage takes only once it has gone. */
	panelClosing: false,
	playbackHeight: 0,
	testMount: saved.show,
	mountLegs: saved.legs as MountLegMode,
	/** The Riding pose per character ID; a character without one rides with Ride or Standing. */
	ridingPoses: saved.poses,
	/** The Preview selection a rider pose replaced, restored on dismount. */
	riderPoseReplaced: null as { projectId: string; clip: string; pose: string } | null,
	/** The Live Views clip chosen per character ID and action (liveRoles.ts); a missing one plays Automatic. */
	liveRoles: liveSaved.roles,
	liveLayering: liveSaved.layering ?? {},
	mountLegIssue: '',
	presentation: 'animation' as string,
	/** The chosen zoom in CSS px per art px, shared by all views; null shows each view's fit. */
	sceneZoom: null as number | null,
	/** The shared upper zoom bound: twice the largest fit seen this session (zoom.ts zoomCeiling). */
	zoomCeiling: 0,
	/** Latest screen and presentation fits in CSS px per art px (0 until seen); all join the shared zoom ladder. */
	zoomFits: { characters: 0, studio: 0, preview: 0, topdown: 0, side: 0 },
	/** The active Studio camera, published by WorldStage for the world backdrop. */
	sceneCamera: null as SceneCamera | null,
	/** Painted height of the hero above its feet in CSS px; the world scales its horizon to the hero's eye line. */
	heroHeight: 0,
	/** How far Preview raises the feet above the layout's feet line so its floor ring clears the playback bar. */
	lift: 0
});
/** One screen's view of the shared zoom, given its current fit; the other screen's fit joins the ladder. */
export function sharedZoom(screen: 'characters' | 'studio', fit: number) {
	return resolveZoom(
		experience.sceneZoom,
		fit || 1,
		Object.values(experience.zoomFits),
		experience.zoomCeiling
	);
}
export function customize() {
	experience.screen = 'studio';
	experience.mode = 'preview';
}
export function characters() {
	experience.screen = 'characters';
}
export function setMode(mode: WorldMode) {
	if (mode !== 'preview') cancelStartupUpdate();
	experience.mode = mode;
}

export function setPanelOpen(open: boolean) {
	if (experience.mode !== 'preview' && experience.livePanelOpen !== null)
		experience.livePanelOpen = open;
	else experience.previewPanelOpen = open;
}

export function panelIsOpen() {
	return experience.mode === 'preview'
		? experience.previewPanelOpen
		: (experience.livePanelOpen ?? experience.previewPanelOpen);
}

export function experienceLayout(width: number, height: number) {
	return layout(
		width,
		height,
		experience.screen,
		experience.mode === 'preview' ? experience.playbackHeight : 0,
		panelIsOpen() || experience.panelClosing,
		panelSettings.side
	);
}
