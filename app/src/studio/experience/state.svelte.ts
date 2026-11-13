/** Presentation state only. Projects, saves and paid workflows stay in Studio state. */
import { resolveZoom, type SceneCamera } from './zoom.ts';
export type WorldMode = 'preview' | 'topdown' | 'side';
export const experience = $state({
	screen: 'characters' as 'characters' | 'studio',
	mode: 'preview' as WorldMode,
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
	experience.mode = mode;
}
