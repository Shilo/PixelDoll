/** Presentation state only. Projects, saves and paid workflows stay in Studio state. */
export type WorldMode = 'preview' | 'topdown' | 'side';
export const experience = $state({
	screen: 'characters' as 'characters' | 'studio',
	mode: 'preview' as WorldMode,
	presentation: 'animation' as string,
	/** Painted height of the hero above its feet in CSS px; the world scales its horizon to the hero's eye line. */
	heroHeight: 0
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
