/** Presentation state only. Projects, saves and paid workflows stay in Studio state. */
import type { SceneCamera, SceneZoom } from './zoom.ts';
export type WorldMode = 'preview' | 'topdown' | 'side';
export const experience = $state({
	screen: 'characters' as 'characters' | 'studio',
	mode: 'preview' as WorldMode,
	presentation: 'animation' as string,
	/** The chosen zoom in CSS px per art px, shared by both screens; null shows each screen's fit. */
	sceneZoom: null as number | null,
	/** The shared upper zoom bound: twice the largest fit seen this session (zoom.ts zoomCeiling). */
	zoomCeiling: 0,
	/** Preview's camera and zoom, published by WorldStage for the controls and the world backdrop. */
	sceneCamera: null as (SceneCamera & { zoom: SceneZoom }) | null,
	/** Painted height of the hero above its feet in CSS px; the world scales its horizon to the hero's eye line. */
	heroHeight: 0,
	/** How far Preview raises the feet above the layout's feet line so its floor ring clears the playback bar. */
	lift: 0
});
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
