import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { loadFixture } from '../../src/lib/compose/fixture.ts'
import { crop, itemCell, itemPreviewFrames } from '../../src/studio/model.ts'

test('animated item previews use one crop across all frames without losing artwork', async () => {
  const project = await loadFixture(async (path) => new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))))
  const cape = project.manifest.items.find((it) => it.name === 'Red cape')!
  const clip = project.manifest.rig.animations.find((a) => a.id === 'walk')!
  const originals = clip.frames.map((f) => project.manifest.rig.directions.map((d) => itemCell(project, cape, clip.id, d.id, f.cell)))
  expect(new Set(originals.flat().map((im) => crop(im)?.h)).size).toBeGreaterThan(1)
  const preview = itemPreviewFrames(project, cape, clip.id)
  expect(preview).toHaveLength(clip.frames.length)
  expect(new Set(preview.flat().map((im) => `${im.w}x${im.h}`)).size).toBe(1)
  const opaquePixels = (im: (typeof preview)[number][number]) => im.data.reduce((n, v, i) => n + Number(i % 4 === 3 && v > 0), 0)
  expect(preview.map((views) => views.map(opaquePixels))).toEqual(originals.map((views) => views.map(opaquePixels)))
  expect(itemPreviewFrames(project, cape, 'missing')).toEqual([])
})
