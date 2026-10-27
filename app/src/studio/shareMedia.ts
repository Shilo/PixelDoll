import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { encodePngBytes } from '../lib/image/pngraw.ts'
import type { Img } from '../lib/image/png.ts'
import type { DirectionName, Preset } from '../lib/store/manifest.ts'
import { renderPresentation, type Presentation, type PresentationAvailability } from './experience/presentation.ts'
import { directionLabel } from './experience/movement.ts'

export const ALL_MOVES = '__all_moves__'
export const ALL_DIRECTIONS = '__all_directions__'
export const STANDING = '__standing__'

export interface ShareFrame { image: Img; ms: number }
export interface ShareMedia { frames: ShareFrame[]; still: Img; animated: boolean; repeat: number; mime: 'image/png' | 'image/gif'; extension: 'png' | 'gif' }

/** Remove only transparent outer padding for the small on-screen preview; downloads keep full frame alignment. */
export function sharePreviewFrames(media: ShareMedia): Img[] {
  const images = media.frames.map(frame => frame.image)
  let left = images[0].w, top = images[0].h, right = 0, bottom = 0
  for (const image of images) for (let y = 0; y < image.h; y++) for (let x = 0; x < image.w; x++) {
    if (image.data[(y * image.w + x) * 4 + 3] < 128) continue
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1)
  }
  if (right <= left || bottom <= top) return images
  left = Math.max(0, left - 2); top = Math.max(0, top - 2)
  right = Math.min(images[0].w, right + 2); bottom = Math.min(images[0].h, bottom + 2)
  return images.map(image => {
    const out: Img = { w: right - left, h: bottom - top, data: new Uint8ClampedArray((right - left) * (bottom - top) * 4) }
    for (let y = top; y < bottom; y++) out.data.set(image.data.subarray((y * image.w + left) * 4, (y * image.w + right) * 4), (y - top) * out.w * 4)
    return out
  })
}

function tile(images: Img[], columns: number, gap = 0): Img {
  if (!images.length) throw new Error('No artwork is available to share')
  const w = Math.max(...images.map(image => image.w)), h = Math.max(...images.map(image => image.h))
  const rows = Math.ceil(images.length / columns)
  const out: Img = { w: columns * w + (columns - 1) * gap, h: rows * h + (rows - 1) * gap, data: new Uint8ClampedArray((columns * w + (columns - 1) * gap) * (rows * h + (rows - 1) * gap) * 4) }
  images.forEach((image, index) => {
    const ox = (index % columns) * (w + gap), oy = Math.floor(index / columns) * (h + gap)
    for (let y = 0; y < image.h; y++) out.data.set(image.data.subarray(y * image.w * 4, (y + 1) * image.w * 4), ((oy + y) * out.w + ox) * 4)
  })
  return out
}

function rendered(a: PresentationAvailability, items: Preset['items'], move: string, direction: DirectionName, cell: number, standing: boolean): Img {
  const sequence = a.animations.get(move)?.get(direction)
  const rest = standing && a.rests.has(direction)
  const rescued = standing ? a.stills.get(direction) : undefined
  if (standing ? !rest && !rescued : !sequence) throw new Error(`${standing ? 'Standing' : move} facing ${directionLabel(direction)} has no complete artwork`)
  const presentation: Presentation = {
    kind: standing ? rest ? 'rest' : 'still' : 'animation', moving: false, requestedClip: move,
    intendedDirection: direction, direction, clip: standing ? rest ? null : rescued?.clip ?? null : move,
    cell: rest ? 0 : rescued?.cell ?? cell, sequence, issue: null, issueKey: null, loading: false,
  }
  const result = renderPresentation(a, items, presentation, presentation.cell)
  if (result.hiddenItems.length) throw new Error(`${result.hiddenItems.map(item => item.name).join(', ')} missing ${standing ? 'standing' : move} / ${directionLabel(direction)} artwork`)
  if (!result.image) throw new Error(`${standing ? 'Standing' : move} facing ${directionLabel(direction)} cannot be rendered`)
  return result.image
}

/** Compose the selected dressed artwork once. The preview, PNG and GIF all consume these same pixels. */
export function buildShareMedia(a: PresentationAvailability, items: Preset['items'], move: string, direction: string, animate: boolean): ShareMedia {
  if (a.loading) throw new Error('Character artwork is still loading')
  if (a.metadataIssues.length) throw new Error(a.metadataIssues[0])
  const moves = move === ALL_MOVES ? [STANDING, ...a.project.manifest.rig.animations.map(animation => animation.id)] : [move]
  const directions = direction === ALL_DIRECTIONS ? a.directions : a.directions.filter(id => id === direction)
  if (!directions.length || !moves.length) throw new Error('Select an available move and direction')
  const stills: Img[] = [], frames: ShareFrame[] = []
  for (const selectedMove of moves) {
    const standing = selectedMove === STANDING
    const timeline = standing ? [{ cell: 0, ms: 1000 }] : a.project.manifest.rig.animations.find(animation => animation.id === selectedMove)?.frames
    if (!timeline?.length) throw new Error(`${selectedMove} has no frames`)
    stills.push(...directions.map(id => rendered(a, items, selectedMove, id, timeline[0].cell, standing)))
    if (animate) for (const frame of timeline) {
      const images = directions.map(id => rendered(a, items, selectedMove, id, frame.cell, standing))
      frames.push({ image: tile(images, directions.length, directions.length > 1 ? 4 : 0), ms: frame.ms })
    }
  }
  const still = tile(stills, directions.length, stills.length > 1 ? 4 : 0)
  const animated = animate && frames.length > 1
  if (animated && (frames[0].image.w > 65535 || frames[0].image.h > 65535)) throw new Error('Selected GIF is too large')
  const repeat = moves.length === 1 && moves[0] !== STANDING && a.project.manifest.rig.animations.find(animation => animation.id === moves[0])?.loop === false ? -1 : 0
  return { frames: animated ? frames : [{ image: still, ms: 1000 }], still, animated, repeat, mime: animated ? 'image/gif' : 'image/png', extension: animated ? 'gif' : 'png' }
}

function paletteFor(image: Img): { colors: number[][]; indices: Uint8Array } {
  const exact = new Map<string, number>(), colors: number[][] = [[0, 0, 0]], indices = new Uint8Array(image.w * image.h)
  for (let p = 0; p < indices.length; p++) {
    const i = p * 4
    if (image.data[i + 3] < 128) continue
    const key = `${image.data[i]},${image.data[i + 1]},${image.data[i + 2]}`
    let index = exact.get(key)
    if (!index) {
      if (colors.length === 256) {
        const reduced = quantize(image.data, 255)
        const mapped = applyPalette(image.data, reduced)
        for (let n = 0; n < mapped.length; n++) indices[n] = image.data[n * 4 + 3] < 128 ? 0 : mapped[n] + 1
        return { colors: [[0, 0, 0], ...reduced], indices }
      }
      index = colors.length; colors.push(key.split(',').map(Number)); exact.set(key, index)
    }
    indices[p] = index
  }
  return { colors, indices }
}

export async function encodeShareMedia(media: ShareMedia): Promise<Uint8Array> {
  if (!media.animated) return encodePngBytes(media.still)
  const gif = GIFEncoder()
  for (const { image, ms } of media.frames) {
    const { colors, indices } = paletteFor(image)
    gif.writeFrame(indices, image.w, image.h, { palette: colors, transparent: true, transparentIndex: 0, delay: ms, repeat: media.repeat, dispose: 2 })
  }
  gif.finish()
  return gif.bytes()
}
