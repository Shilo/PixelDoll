/** Presentation state only. Projects, saves and paid workflows stay in Studio state. */
export type WorldMode = 'preview' | 'topdown' | 'side'
export const experience = $state({ screen: 'characters' as 'characters' | 'studio', mode: 'preview' as WorldMode, expanded: false, presentation: 'animation' as string })
export function customize() { experience.screen = 'studio'; experience.mode = 'preview' }
export function characters() { experience.screen = 'characters' }
export function setMode(mode: WorldMode) { experience.mode = mode }
