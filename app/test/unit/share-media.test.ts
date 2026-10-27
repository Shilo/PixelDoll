import { describe, expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { decodePngBytes } from '../../src/lib/image/pngraw.ts'
import type { Item, Layer, Manifest, Project, Sha256 } from '../../src/lib/store/manifest.ts'
import { buildPresentation } from '../../src/studio/experience/presentation.ts'
import { ALL_DIRECTIONS, ALL_MOVES, STANDING, buildShareMedia, canShareDirection, encodeShareMedia, sharePreviewFrames } from '../../src/studio/shareMedia.ts'

const hash = (name: string) => `sha256:${name}` as Sha256
function fixture(): Project {
  const body0 = hash('body0'), body1 = hash('body1'), rest = hash('rest'), hat = hash('hat')
  const image = (r: number, x: number) => { const out = makeImg(2, 1); out.data.set([r, 0, 0, 255], x * 4); return out }
  const directions = ['south', 'east'] as const
  const cells = (a: Sha256, b: Sha256) => Object.fromEntries(directions.map(direction => [direction, [a, b]]))
  const item = (id: string, slot: string, layer: Layer): Item => ({ id, slot, layers: [layer], name: id, prompt: '', baseHash: body0, status: 'accepted', mirror: 'flip', materials: [], provenance: [] })
  const manifest: Manifest = {
    format: 'pixeldoll/2', name: 'Test character', app: '', materials: [], presets: [],
    rig: { cell: { w: 2, h: 1 }, pivot: { x: 1, y: 1 }, baseItem: 'base', baseHash: body0,
      directions: directions.map(id => ({ id })), rest: Object.fromEntries(directions.map(id => [id, { image: rest, keypoints: [] }])),
      animations: [{ id: 'walk', cells: 2, loop: true, frames: [{ cell: 0, ms: 70 }, { cell: 1, ms: 120 }] }],
    },
    slots: [{ id: 'body', z: 1, class: 'base' }, { id: 'head', z: 2, class: 'rigid' }],
    items: [
      item('base', 'body', { id: 'main', role: 'fg', z: 1, cells: { walk: cells(body0, body1) } }),
      item('hat', 'head', { id: 'main', role: 'fg', z: 2, cells: { walk: cells(hat, hat), rest: Object.fromEntries(directions.map(id => [id, [hat]])) } }),
    ],
  }
  return { manifest, images: new Map([[body0, image(40, 0)], [body1, image(50, 0)], [rest, image(60, 0)], [hat, image(90, 1)]]) }
}

describe('share media', () => {
  test('Standing is a dressed first-frame PNG and all selections make a deterministic contact sheet', async () => {
    const project = fixture(), a = buildPresentation(project, { sourceProject: project })
    const standing = buildShareMedia(a, { head: 'hat' }, STANDING, 'south', true)
    expect(standing.extension).toBe('png')
    expect([...standing.still.data]).toEqual([60, 0, 0, 255, 90, 0, 0, 255])
    const decoded = await decodePngBytes(await encodeShareMedia(standing))
    expect([...decoded.data]).toEqual([...standing.still.data])
    const all = buildShareMedia(a, { head: 'hat' }, ALL_MOVES, ALL_DIRECTIONS, false)
    expect([all.still.w, all.still.h, all.extension]).toEqual([8, 6, 'png'])
    expect([...all.still.data.slice(0, 8)]).toEqual([...standing.still.data])
  })

  test('GIF uses authored frame delays, transparency and the same composed frames as preview', async () => {
    const project = fixture(), a = buildPresentation(project, { sourceProject: project })
    const media = buildShareMedia(a, { head: 'hat' }, 'walk', 'south', true)
    expect(media.frames.map(frame => frame.ms)).toEqual([70, 120])
    expect(media.frames.map(frame => frame.image.data[0])).toEqual([40, 50])
    expect(sharePreviewFrames(media).map(frame => [frame.w, frame.h])).toEqual([[2, 1], [2, 1]])
    const bytes = await encodeShareMedia(media)
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe('GIF89a')
    const delays: number[] = []
    for (let i = 0; i < bytes.length - 7; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) delays.push(bytes[i + 4] | bytes[i + 5] << 8)
    expect(delays).toEqual([7, 12])
  })

  test('aggregate choices omit unavailable pairs, while an explicit pair never substitutes artwork', () => {
    const project = fixture()
    delete project.manifest.items[0].layers[0].cells!.walk.east
    const a = buildPresentation(project, { sourceProject: project })
    expect(canShareDirection(a, {}, 'walk', 'east')).toBe(false)
    expect(canShareDirection(a, {}, ALL_MOVES, 'east')).toBe(true)
    expect(() => buildShareMedia(a, {}, 'walk', 'east', true)).toThrow(/East has no complete artwork/)
    const oneMove = buildShareMedia(a, {}, 'walk', ALL_DIRECTIONS, true)
    expect(oneMove.omitted.map(pair => [pair.move, pair.direction])).toEqual([['walk', 'east']])
    expect(oneMove.frames.map(frame => [frame.image.w, frame.image.h])).toEqual([[2, 1], [2, 1]])
    const oneFacing = buildShareMedia(a, {}, ALL_MOVES, 'east', true)
    expect(oneFacing.omitted.map(pair => [pair.move, pair.direction])).toEqual([['walk', 'east']])
    expect(oneFacing.extension).toBe('png')
    const all = buildShareMedia(a, {}, ALL_MOVES, ALL_DIRECTIONS, true)
    expect(all.omitted.map(pair => [pair.move, pair.direction])).toEqual([['walk', 'east']])
    expect(all.frames.map(frame => [frame.image.w, frame.image.h])).toEqual([[8, 1], [8, 1], [8, 1]])
    expect(sharePreviewFrames(all).map(frame => [frame.w, frame.h])).toEqual([[8, 1], [8, 1], [8, 1]])
    expect([all.still.w, all.still.h]).toEqual([8, 6])
    delete project.manifest.items[0].layers[0].cells!.walk.south
    expect(() => buildShareMedia(buildPresentation(project), {}, 'walk', ALL_DIRECTIONS, true)).toThrow(/No complete move and direction pairs/)
  })
})
