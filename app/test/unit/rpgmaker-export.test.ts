import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { cellHash, playlist, type Keypoint } from '../../src/lib/rig/rig.ts'
import { rpgMakerFiles, type RpgLayout } from '../../src/lib/export/rpgmaker.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { exportManifest } from '../../src/lib/export/generic.ts'
import type { Manifest, Project } from '../../src/lib/store/manifest.ts'

// Square cells, pivot (3, 7). Each frame is one pixel whose red channel names it (standing 200, walk cell n = 10 + n), at x 3
// (south, north) or x 5 (east; west mirrors it to x 2), on row 6. `head` adds a marker (red 1) at x 3, row 2 to every frame.
type Source = { keypoints?: Keypoint[][]; measured?: Keypoint[][]; motion?: string }
type Options = { walk?: boolean; walkId?: string; dirs?: string[]; below?: number; size?: number; head?: boolean; names?: string[]; character?: string
  frames?: { cell: number; ms: number }[]; keys?: Record<string, Source> }
/** Ankle keypoints per cell for a view, where `lead` is how far the left ankle is ahead of the right along the facing. A wide
 *  side-to-side stance is added in front and back views: it must not read as a stride. */
const FACING: Record<string, [number, number]> = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] }
const gait = (dir: string, leads: number[]) => leads.map((lead) => {
  const [fx, fy] = FACING[dir], wide = fy ? 0.2 : 0
  return [{ label: 'LEFT LEG', x: 0.5 - wide + (fx * lead) / 2, y: 0.85 + (fy * lead) / 2 }, { label: 'RIGHT LEG', x: 0.5 + wide - (fx * lead) / 2, y: 0.85 - (fy * lead) / 2 }]
})
async function project(o: Options = {}): Promise<Project> {
  const W = o.size ?? 8, H = W, images = new Map<string, Img>()
  const frame = async (red: number, x: number, y = 6) => {
    const im = makeImg(W, H); im.data.set([red, 0, 0, 255], (y * W + x) * 4)
    if (o.head) im.data.set([1, 1, 1, 255], (2 * W + 3) * 4)
    const h = await cellHash(im); images.set(h, im); return h
  }
  const dirs = o.dirs ?? ['south', 'east', 'north'], xOf = (d: string) => (d === 'east' ? 5 : 3), walkId = o.walkId ?? 'walk'
  const standing: Record<string, string[]> = {}, walk: Record<string, string[]> = {}
  for (const d of dirs) {
    standing[d] = [await frame(200, xOf(d), o.below && d === 'south' ? 6 + o.below : 6)]
    walk[d] = await Promise.all([0, 1, 2, 3].map((n) => frame(10 + n, xOf(d))))
  }
  const base = [...images.keys()][0]
  const keys = o.keys ?? { south: { keypoints: gait('south', [0, 0.3, 0, -0.3]) } }
  const sources = Object.fromEntries(Object.entries(keys).map(([d, k]) => [d, { route: 'skeleton-v3', reference: base, provenance: [], ...k }]))
  const manifest = {
    format: 'pixeldoll/2', name: o.character ?? 'Hero Knight', app: 'PixelDoll',
    rig: {
      cell: { w: W, h: H }, pivot: { x: 3, y: 7 }, baseItem: 'body', baseHash: base,
      directions: [...dirs.map((id) => ({ id })), ...(dirs.includes('east') ? [{ id: 'west', mirrorOf: 'east' }] : [])],
      animations: [
        { id: 'default', cells: 1, loop: true, frames: playlist(1, 100) },
        ...(o.walk === false ? [] : [{ id: walkId, cells: 4, loop: true, frames: o.frames ?? playlist(4, 100), sources }]),
      ],
    },
    slots: [{ id: 'body', z: 10, class: 'base' }], materials: [],
    items: [{ id: 'body', name: 'Body', slot: 'body', status: 'accepted', baseHash: base, mirror: 'flip', materials: [], prompt: '', provenance: [],
      layers: [{ id: 'main', role: 'fg', z: 10, cells: { default: standing, ...(o.walk === false ? {} : { [walkId]: walk }) } }] }],
    presets: (o.names ?? ['Current look', 'Night', 'night']).map((name, i) => ({ id: i ? `p${i}` : 'current', name, items: { body: 'body' }, variants: {} })),
  } as unknown as Manifest
  return { manifest, images } as unknown as Project
}
const run = (p: Project, layout: RpgLayout = 'vx') => rpgMakerFiles(p, p.manifest, layout)
const sheet = (files: { name: string; data: unknown }[], name: string) => files.find((f) => f.name === name)!.data as Img
const vxOf = (p: Project, base = 'Hero_Knight') => sheet(run(p, 'vx').files, `$${base}.png`)
const xpOf = (p: Project, base = 'Hero_Knight') => sheet(run(p, 'xp').files, `${base}.png`)
/** The frame pixel of one cell (not the head marker): its red value and position inside the cell. */
const frameAt = (im: Img, cols: number, col: number, row: number) => {
  const cw = im.w / cols, ch = im.h / 4
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = ((row * ch + y) * im.w + col * cw + x) * 4
    if (im.data[i + 3] && im.data[i] !== 1) return { red: im.data[i], x, y }
  }
  return null
}
const reds = (im: Img, cols: number, row: number) => Array.from({ length: cols }, (_, c) => frameAt(im, cols, c, row)!.red)

test('each card writes only its own layout: $ sheets for MZ, MV, VX Ace and VX, plain 4 × 4 sheets for XP, at the zip root', async () => {
  const p = await project()
  const vx = run(p, 'vx'), xp = run(p, 'xp')
  expect(vx.warnings).toEqual([])
  expect(vx.files.map((f) => f.name)).toEqual(['$Hero_Knight.png', '$Hero_Knight_Night.png', '$Hero_Knight_night_2.png', 'README.txt'])
  expect(xp.files.map((f) => f.name)).toEqual(['Hero_Knight.png', 'Hero_Knight_Night.png', 'Hero_Knight_night_2.png', 'README.txt'])
  expect(sheet(vx.files, 'README.txt') as unknown as string).toMatch(/^Copy the PNG files into img\/characters \(RPG Maker MZ, MV\) or Graphics\/Characters \(VX Ace, VX\)/)
  expect(sheet(xp.files, 'README.txt') as unknown as string).toMatch(/^Copy the PNG files into Graphics\/Characters \(RPG Maker XP or Pokemon Essentials\)/)
})

test('cells are trimmed to the art: pivot centered on an even width, top at the highest pixel, feet on the bottom row', async () => {
  const p = await project({ head: true }), vx = vxOf(p), xp = xpOf(p)
  // pixels at x 2..5 around pivot x 3 → reach 3, width 6; head at row 2, feet line 7 → height 5
  expect([vx.w, vx.h, xp.w, xp.h]).toEqual([18, 20, 24, 20])
  expect(frameAt(vx, 3, 1, 0)).toEqual({ red: 200, x: 3, y: 4 }) // pivot x 3 → cell center 3; row 6 → 6 − 2
})

test('columns follow each engine: MZ/MV/VX [step, standing, step], XP [standing, step, passing, step]', async () => {
  const p = await project()
  // south: left foot leads in cell 1 and trails in cell 3 → step A cell 1, a quarter cycle later cell 2, half a cycle later cell 3
  expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13])
  expect(reds(xpOf(p), 4, 0)).toEqual([200, 11, 12, 13])
})

test('a square stance in front and back views is not a step; the left foot ahead along the facing is', async () => {
  // feet wide apart side to side in every frame (gait adds it), left foot ahead in cell 2, behind in cell 0
  const p = await project({ keys: { south: { keypoints: gait('south', [-0.2, 0, 0.2, 0]) }, north: { keypoints: gait('north', [0, -0.2, 0, 0.2]) } } })
  const vx = vxOf(p)
  expect(reds(vx, 3, 0)).toEqual([12, 200, 10])
  expect(reds(vx, 3, 3)).toEqual([13, 200, 11])
})

test('rows are down, left, right, up; left is mirrored right and uses its steps; views without keypoints start at frame 0', async () => {
  const p = await project({ keys: { south: { keypoints: gait('south', [0.3, 0, -0.3, 0]) }, east: { keypoints: gait('east', [-0.3, 0, 0.3, 0]) } } })
  const vx = vxOf(p)
  expect(reds(vx, 3, 0)).toEqual([10, 200, 12])
  expect(reds(vx, 3, 2)).toEqual([12, 200, 10]) // east: left foot leads in cell 2
  expect(reds(vx, 3, 1)).toEqual([12, 200, 10]) // west: east's choice
  expect([frameAt(vx, 3, 1, 1)!.x, frameAt(vx, 3, 1, 2)!.x]).toEqual([2, 5]) // west is east flipped
  expect(reds(vx, 3, 3)).toEqual([10, 200, 12]) // north: no keypoints
})

test('views of one managed template take the side view phase; other walks use their own', async () => {
  const motion = 'managed-skeleton-v3:walking-8-frames'
  // the south signal is weak and points at cell 0; the side view clearly leads with the left foot in cell 1
  const keys = (southMotion: string) => ({ south: { keypoints: gait('south', [0.02, 0, -0.02, 0.01]), motion: southMotion }, east: { keypoints: gait('east', [0, 0.3, 0, -0.3]), motion } })
  expect(reds(vxOf(await project({ keys: keys(motion) })), 3, 0)).toEqual([11, 200, 13])
  expect(reds(vxOf(await project({ keys: keys('pixminimax:walking') })), 3, 0)).toEqual([10, 200, 12])
})

test('keypoints measured on the frames win over the requested ones', async () => {
  const p = await project({ keys: { south: { keypoints: gait('south', [0, 0.3, 0, -0.3]), measured: gait('south', [0, -0.3, 0, 0.3]) } } })
  expect(reds(vxOf(p), 3, 0)).toEqual([13, 200, 11])
})

test('a held frame is picked while it is on screen, not the nearest frame start', async () => {
  // 0:100, 1:500, 2:100, 3:100 ms (800 ms). Step at cell 0 (t 0): a quarter (200 ms) and half (400 ms) later cell 1 shows.
  const p = await project({ frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 500 }, { cell: 2, ms: 100 }, { cell: 3, ms: 100 }], keys: { south: { keypoints: gait('south', [0.3, -0.3, 0, 0]) } } })
  expect(reds(xpOf(p), 4, 0)).toEqual([200, 10, 11, 11])
})

test('walk moves are found by word, such as walk-cycle', async () => {
  const p = await project({ walkId: 'walk-cycle' })
  expect(run(p).warnings).toEqual([])
  expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13])
})

test('refuses characters without front, side and back views', async () => {
  const partial = await project({ dirs: ['south', 'north'] })
  expect(() => run(partial)).toThrow(/^RPG Maker: .*no west, east view/)
  const r = await exportFiles(await project({ dirs: ['south', 'north'], size: 32 }), { engines: ['rpgmakerxp'], baked: false })
  expect(r.errors[0]).toMatch(/^RPG Maker: /)
  expect(r.entries).toEqual([])
})

test('without a walk move every column stands, with a warning; a walk missing a view stands there, with a warning', async () => {
  const still = await project({ walk: false })
  expect(run(still).warnings).toEqual(['RPG Maker: no walk move, so the sheets stand still. Add a walk move to animate them.'])
  expect(reds(xpOf(still), 4, 0)).toEqual([200, 200, 200, 200])
  const p = await project()
  const layer = p.manifest.items[0].layers[0] as unknown as { cells: Record<string, Record<string, unknown>> }
  delete layer.cells.walk.north
  expect(run(p).warnings).toEqual(['RPG Maker: the walk has no north view, so those rows stand still.'])
  expect(reds(vxOf(p), 3, 3)).toEqual([200, 200, 200])
})

test('art below the feet is kept; more than 2 px is reported per file, so repeated outfit names stay distinct', async () => {
  const small = await project({ below: 1 })
  expect(xpOf(small).h).toBe(8)
  expect(run(small).warnings).toEqual([])
  const big = await project({ below: 4, size: 16, names: ['Current look', 'Knight', 'Knight'] })
  expect(xpOf(big).h).toBe(20)
  expect(run(big).warnings).toEqual([
    'RPG Maker: Hero_Knight has 4 px below the feet, so it stands 4 px higher on the map.',
    'RPG Maker: Hero_Knight_Knight has 4 px below the feet, so it stands 4 px higher on the map.',
    'RPG Maker: Hero_Knight_Knight_2 has 4 px below the feet, so it stands 4 px higher on the map.',
  ])
})

test('file names are ASCII: accents dropped, other characters replaced, empty names fall back, device names escaped', async () => {
  const names = run(await project({ character: 'José Ñandú', names: ['Current look', 'Héroïne straße', '★★', 'nul'] }), 'xp').files.map((f) => f.name)
  expect(names).toEqual(['Jose_Nandu.png', 'Jose_Nandu_Heroine_stra_e.png', 'Jose_Nandu_p2.png', 'Jose_Nandu_nul.png', 'README.txt'])
  expect(run(await project({ character: 'CON' }), 'xp').files.map((f) => f.name)).toContain('CON_.png')
})

test('the zip holds only the sheets, README, credits and the editable copy, built from the exported manifest', async () => {
  const p = await project({ size: 32 })
  for (const [engine, sheetName] of [['rpgmaker', '$Hero_Knight.png'], ['rpgmakerxp', 'Hero_Knight.png']] as const) {
    const r = await exportFiles(p, { engines: [engine], baked: true })
    expect(r.errors).toEqual([])
    expect(r.warnings.filter((w) => w.startsWith('RPG Maker'))).toEqual([])
    const names = r.entries.map((e) => e.name)
    expect(names.filter((n) => !n.startsWith('cells/')).sort()).toEqual([sheetName, sheetName.replace('Hero_Knight', 'Hero_Knight_Night'), sheetName.replace('Hero_Knight', 'Hero_Knight_night_2'), 'CREDITS.txt', 'README.txt', 'project.json'].sort())
  }
  const { manifest } = exportManifest(p, { engines: ['rpgmaker'], baked: false })
  expect(reds(sheet(rpgMakerFiles(p, manifest, 'vx').files, '$Hero_Knight.png'), 3, 0)).toEqual([11, 200, 13])
  expect((await exportFiles(p, { engines: ['rpgmaker', 'generic'], baked: false })).errors).toEqual(['RPG Maker sheets export on their own; choose one format.'])
})

test('a view measured on only some frames uses its requested keypoints instead of dropping to frame 0', async () => {
  const measured = gait('south', [0, -0.3, 0, 0.3]); measured[2] = []
  const p = await project({ keys: { south: { keypoints: gait('south', [0, 0.3, 0, -0.3]), measured } } })
  expect(reds(vxOf(p), 3, 0)).toEqual([11, 200, 13])
})

test('credits name no layer sheets, since RPG Maker zips have none', async () => {
  const r = await exportFiles(await project({ size: 32 }), { engines: ['rpgmaker'], baked: false })
  const credits = new TextDecoder().decode(r.entries.find((e) => e.name === 'CREDITS.txt')!.data)
  expect(credits.split('\n')[1]).toMatch(/^"body","Body","body","",/) // empty sheets column
  expect(credits).not.toContain('layers/')
})
