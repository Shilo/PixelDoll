import { ITEMS, OUTFITS, type Dir, type MoveId } from './data'

const q = new URLSearchParams(location.search)
export const LOOKS = ['AE', 'A', 'B', 'C', 'D', 'E'] as const
export type Look = (typeof LOOKS)[number]
export const SCREENS = ['studio', 'newitem', 'generating', 'create', 'review', 'connect', 'export', 'activity', 'colours', 'empty'] as const
export type Screen = (typeof SCREENS)[number]

const look = (LOOKS as readonly string[]).includes(q.get('look') ?? '') ? (q.get('look') as Look) : 'AE'
const screen = (SCREENS as readonly string[]).includes(q.get('screen') ?? '') ? (q.get('screen') as Screen) : 'studio'

export const ui = $state({
  look,
  screen,
  shot: q.has('shot'), // screenshot mode: hides the mockup switcher, freezes nothing else
  wearing: new Set(OUTFITS[0].wear) as Set<string>,
  selected: 'helmet_steel' as string,
  dir: 'south' as Dir,
  move: 'walk' as MoveId,
  all: false,
  playing: true,
  zoom: 0, // 0 = fit (largest integer)
  bg: 'checker' as 'checker' | 'solid',
  tab: (screen === 'colours' ? 'colours' : 'wardrobe') as 'wardrobe' | 'colours' | 'moves',
  inspTab: (screen === 'colours' ? 'colours' : 'item') as 'item' | 'colours' | 'moves',
  group: 'Head',
  colours: { cape: 'red', leather: 'brown', metal: 'steel', hair: 'brown' } as Record<string, string>,
  sidebar: true,
  inspector: true,
  frame: 0,
})

// One playback clock drives every visible sprite (D1 §3.6 rule 5).
setInterval(() => { if (ui.playing) ui.frame++ }, 100)

export const glass = () => ui.look === 'B'
export const pixelGlyphs = () => ui.look === 'AE' || ui.look === 'E'

export function toggleWear(id: string) {
  const it = ITEMS.find((i) => i.id === id)!
  const next = new Set(ui.wearing)
  if (next.has(id)) next.delete(id)
  else {
    for (const o of ITEMS) if (o.slot === it.slot) next.delete(o.id)
    next.add(id)
  }
  ui.wearing = next
  ui.selected = id
}

export function go(params: Record<string, string>) {
  const p = new URLSearchParams(location.search)
  for (const [k, v] of Object.entries(params)) p.set(k, v)
  location.search = p.toString()
}

/** GlassKit classes, only in look B. */
export const gk = (cls: string) => (ui.look === 'B' ? cls : '')

export type Size = 'expanded' | 'medium' | 'compact' | 'landscape'
const calc = (): Size => {
  const w = innerWidth, h = innerHeight
  if (h < 500 && w > h) return 'landscape'
  if (w < 600) return 'compact'
  if (w < 1024) return 'medium'
  return 'expanded'
}
export const view = $state({ size: calc() })
addEventListener('resize', () => (view.size = calc()))

export const JOBS = () => ui.screen === 'generating' || ui.screen === 'activity'
