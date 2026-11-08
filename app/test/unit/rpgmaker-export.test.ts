import { expect, test } from 'vitest'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { cellHash, playlist, type Keypoint } from '../../src/lib/rig/rig.ts'
import { rpgMakerFiles } from '../../src/lib/export/rpgmaker.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { exportManifest } from '../../src/lib/export/generic.ts'
import type { Manifest, Project } from '../../src/lib/store/manifest.ts'

// Square cells, pivot (3, 7). Each frame is one pixel whose red channel names it (standing 200, walk cell n = 10 + n), at x 3
// (south, north) or x 5 (east; west mirrors it to x 2), on row 6. `head` adds a marker (red 1) at x 3, row 2 to every frame.
type Options = { walk?: boolean; walkId?: string; dirs?: string[]; below?: number; size?: number; head?: boolean; names?: string[]; character?: string
  frames?: { cell: number; ms: number }[]; keys?: Record<string, { keypoints?: Keypoint[][]; measured?: Keypoint[][] }> }
const legs = (spread: number) => [{ label: 'LEFT LEG', x: 0.5 - spread, y: 0.9 }, { label: 'RIGHT LEG', x: 0.5 + spread, y: 0.9 }]
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
  const keys = o.keys ?? { south: { keypoints: [legs(0.05), legs(0.3), legs(0.1), legs(0.2)] } }
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
const run = (p: Project) => rpgMakerFiles(p, p.manifest)
const sheet = (files: { name: string; data: unknown }[], name: string) => files.find((f) => f.name === name)!.data as Img
const vxOf = (files: { name: string; data: unknown }[], base = 'Hero_Knight') => sheet(files, `rpgmaker/mz-mv/img/characters/$${base}.png`)
const xpOf = (files: { name: string; data: unknown }[], base = 'Hero_Knight') => sheet(files, `rpgmaker/xp/Graphics/Characters/${base}.png`)
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

test('each outfit gets a $ sheet for MZ, MV, VX Ace and VX and a 4 × 4 sheet for XP, with unique names', async () => {
  const { files, warnings } = run(await project())
  expect(warnings).toEqual([])
  expect(files.map((f) => f.name).sort()).toEqual([
    'rpgmaker/README.txt',
    'rpgmaker/mz-mv/img/characters/$Hero_Knight.png', 'rpgmaker/mz-mv/img/characters/$Hero_Knight_Night.png', 'rpgmaker/mz-mv/img/characters/$Hero_Knight_night_2.png',
    'rpgmaker/vx-ace-vx/Graphics/Characters/$Hero_Knight.png', 'rpgmaker/vx-ace-vx/Graphics/Characters/$Hero_Knight_Night.png', 'rpgmaker/vx-ace-vx/Graphics/Characters/$Hero_Knight_night_2.png',
    'rpgmaker/xp/Graphics/Characters/Hero_Knight.png', 'rpgmaker/xp/Graphics/Characters/Hero_Knight_Night.png', 'rpgmaker/xp/Graphics/Characters/Hero_Knight_night_2.png',
  ].sort())
  expect(sheet(files, 'rpgmaker/vx-ace-vx/Graphics/Characters/$Hero_Knight.png')).toBe(vxOf(files))
})

test('cells are trimmed to the art: pivot centered on an even width, top at the highest pixel, feet on the bottom row', async () => {
  const { files } = run(await project({ head: true }))
  // pixels at x 2..5 around pivot x 3 → reach 3, width 6; head at row 2, feet line 7 → height 5
  const vx = vxOf(files), xp = xpOf(files)
  expect([vx.w, vx.h, xp.w, xp.h]).toEqual([18, 20, 24, 20])
  expect(frameAt(vx, 3, 1, 0)).toEqual({ red: 200, x: 3, y: 4 }) // pivot x 3 → cell center 3; row 6 → 6 − 2
})

test('columns follow each engine: MZ/MV/VX [stride, standing, stride], XP [standing, stride, passing, stride]', async () => {
  const { files } = run(await project())
  // south: widest stride is walk cell 1 (starts at 100 ms); a quarter cycle later cell 2 is on screen, half a cycle later cell 3
  expect(reds(vxOf(files), 3, 0)).toEqual([11, 200, 13])
  expect(reds(xpOf(files), 4, 0)).toEqual([200, 11, 12, 13])
})

test('rows are down, left, right, up; left is mirrored right and uses its strides; views without keypoints start at frame 0', async () => {
  const p = await project({ keys: { south: { keypoints: [legs(0.3), legs(0.1), legs(0.05), legs(0.2)] }, east: { keypoints: [legs(0.05), legs(0.1), legs(0.3), legs(0.2)] } } })
  const vx = vxOf(run(p).files)
  expect(reds(vx, 3, 0)).toEqual([10, 200, 12])
  expect(reds(vx, 3, 2)).toEqual([12, 200, 10]) // east: widest stride cell 2, half a cycle later cell 0
  expect(reds(vx, 3, 1)).toEqual([12, 200, 10]) // west: east's choice
  expect([frameAt(vx, 3, 1, 1)!.x, frameAt(vx, 3, 1, 2)!.x]).toEqual([2, 5]) // west is east flipped
  expect(reds(vx, 3, 3)).toEqual([10, 200, 12]) // north: no keypoints
})

test('stride choice prefers keypoints measured on the frames over the requested ones', async () => {
  const p = await project({ keys: { south: { keypoints: [legs(0.3), legs(0.1), legs(0.05), legs(0.2)], measured: [legs(0.05), legs(0.1), legs(0.05), legs(0.3)] } } })
  expect(reds(vxOf(run(p).files), 3, 0)).toEqual([13, 200, 11])
})

test('a held frame is picked while it is on screen, not the nearest frame start', async () => {
  // 0:100, 1:500, 2:100, 3:100 ms (800 ms). Stride at cell 0 (t 0): a quarter (200 ms) and half (400 ms) later cell 1 shows.
  const p = await project({ frames: [{ cell: 0, ms: 100 }, { cell: 1, ms: 500 }, { cell: 2, ms: 100 }, { cell: 3, ms: 100 }], keys: { south: { keypoints: [legs(0.3), legs(0.1), legs(0.05), legs(0.2)] } } })
  expect(reds(xpOf(run(p).files), 4, 0)).toEqual([200, 10, 11, 11])
})

test('walk moves are found by word, such as walk-cycle', async () => {
  const { files, warnings } = run(await project({ walkId: 'walk-cycle' }))
  expect(warnings).toEqual([])
  expect(reds(vxOf(files), 3, 0)).toEqual([11, 200, 13])
})

test('refuses characters without front, side and back views', async () => {
  const partial = await project({ dirs: ['south', 'north'] })
  expect(() => run(partial)).toThrow(/^RPG Maker: .*no west, east view/)
  const r = await exportFiles(await project({ dirs: ['south', 'north'], size: 32 }), { engines: ['rpgmaker'], baked: false })
  expect(r.errors[0]).toMatch(/^RPG Maker: /)
  expect(r.entries).toEqual([])
})

test('without a walk move every column stands, with a warning; a walk missing a view stands there, with a warning', async () => {
  const still = run(await project({ walk: false }))
  expect(still.warnings).toEqual(['RPG Maker: no walk move, so the sheets stand still. Add a walk move to animate them.'])
  expect(reds(xpOf(still.files), 4, 0)).toEqual([200, 200, 200, 200])
  const p = await project()
  const layer = p.manifest.items[0].layers[0] as unknown as { cells: Record<string, Record<string, unknown>> }
  delete layer.cells.walk.north
  const partial = run(p)
  expect(partial.warnings).toEqual(['RPG Maker: the walk has no north view, so those rows stand still.'])
  expect(reds(vxOf(partial.files), 3, 3)).toEqual([200, 200, 200])
})

test('art below the feet is kept; more than 2 px is reported per file, so repeated outfit names stay distinct', async () => {
  const small = run(await project({ below: 1 }))
  expect(xpOf(small.files).h).toBe(8)
  expect(small.warnings).toEqual([])
  const big = run(await project({ below: 4, size: 16, names: ['Current look', 'Knight', 'Knight'] }))
  expect(xpOf(big.files).h).toBe(20)
  expect(big.warnings).toEqual([
    'RPG Maker: Hero_Knight has 4 px below the feet, so it stands 4 px higher on the map.',
    'RPG Maker: Hero_Knight_Knight has 4 px below the feet, so it stands 4 px higher on the map.',
    'RPG Maker: Hero_Knight_Knight_2 has 4 px below the feet, so it stands 4 px higher on the map.',
  ])
})

test('file names are ASCII: accents dropped, other characters replaced, empty names fall back, device names escaped', async () => {
  const names = run(await project({ character: 'José Ñandú', names: ['Current look', 'Héroïne straße', '★★', 'nul'] })).files.map((f) => f.name).filter((n) => n.startsWith('rpgmaker/xp/'))
  expect(names).toEqual(['Jose_Nandu', 'Jose_Nandu_Heroine_stra_e', 'Jose_Nandu_p2', 'Jose_Nandu_nul'].map((n) => `rpgmaker/xp/Graphics/Characters/${n}.png`))
  expect(run(await project({ character: 'CON' })).files.map((f) => f.name)).toContain('rpgmaker/xp/Graphics/Characters/CON_.png')
})

test('the export pipeline writes animated sheets from the exported manifest, which has no cells', async () => {
  const p = await project({ size: 32 }), r = await exportFiles(p, { engines: ['rpgmaker'], baked: false })
  expect(r.errors).toEqual([])
  expect(r.warnings.filter((w) => w.startsWith('RPG Maker'))).toEqual([])
  expect(r.entries.map((e) => e.name)).toContain('rpgmaker/mz-mv/img/characters/$Hero_Knight.png')
  const { manifest } = exportManifest(p, { engines: ['rpgmaker'], baked: false })
  expect(reds(vxOf(rpgMakerFiles(p, manifest).files), 3, 0)).toEqual([11, 200, 13])
})
