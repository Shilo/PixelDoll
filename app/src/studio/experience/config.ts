// Approved round-six scene art controls. UI appearance remains owned by Bronze.
export type WorldTheme = 'dark' | 'light'
export type WorldMode = 'preview' | 'topdown' | 'side'
type RGB = readonly [number, number, number]
type Sample = readonly [number, number, number, number]

// Custom-property URLs otherwise resolve relative to the bundled CSS in /assets/.
// Resolve once against the page, retaining Vite's relative GitHub Pages base.
const pageBase = typeof document === 'undefined' ? 'http://localhost/' : document.baseURI
const asset = (name: string) => new URL(`${import.meta.env.BASE_URL}worlds/${name}-stage.png`, pageBase).href
export const BACKGROUNDS = { dark: asset('obsidian'), light: asset('porcelain') } as const
const backgrounds = (url: string) => ({ selection: url, creation: url, preview: url, topdown: url, side: url })

export const WORLDS: Record<WorldTheme, {
  backgrounds: ReturnType<typeof backgrounds>
  floor: RGB; seam: RGB; fog: RGB; horizon: number; sample: Sample
}> = {
  dark: {
    backgrounds: backgrounds(BACKGROUNDS.dark),
    floor: [.085, .095, .105], seam: [.49, .40, .27], fog: [.145, .155, .165],
    horizon: .53, sample: [.58, .82, .055, .055],
  },
  light: {
    backgrounds: backgrounds(BACKGROUNDS.light),
    floor: [.92, .90, .85], seam: [.48, .36, .22], fog: [.94, .92, .88],
    horizon: .475, sample: [.57, .82, .055, .055],
  },
}

// Code-only controls, intentionally absent from the user preferences.
export const REFLECTION = { enabled: true, selection: true, preview: true, topdown: true, side: true, opacity: .12, compression: .35 }
export const MOTION = { speed: 95, cameraResponse: 9, joystickRadius: 46, deadZone: 8, tileSize: 100 }
