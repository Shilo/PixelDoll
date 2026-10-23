import { expect, test } from 'vitest'
import { makeImg } from '../../src/lib/image/png.ts'
import { buildRig } from '../../src/lib/rig/freeze.ts'

const frame = (bottom: number) => {
  const im = makeImg(64, 64)
  for (let y = 10; y < bottom; y++) for (let x = 28; x < 36; x++) im.data.set([100, 80, 60, 255], (y * 64 + x) * 4)
  return im
}
test('a fixed direction baseline is not described as idle foot drift', async () => {
  const b = await buildRig([{ id: 'idle', dirs: { south: [frame(60), frame(60)], north: [frame(55), frame(55)] } }], { directions: [{ id: 'south' }, { id: 'north' }] })
  expect(b.errors).toEqual([])
  expect(b.warnings.some(w => /ground line is|shared pivot/.test(w))).toBe(false)
  expect(b.warnings.some(w => /feet drift/.test(w))).toBe(false)
})
test('stride footprint movement is distinguished from planted-foot drift', async () => {
  const b = await buildRig([
    { id: 'idle', dirs: { south: [frame(60), frame(60)] } },
    { id: 'walk', dirs: { south: [frame(58), frame(60)] } },
  ], { directions: [{ id: 'south' }] })
  expect(b.warnings).toContain('walk/south: silhouette bottom differs up to 2 px from the idle reference')
  expect(b.warnings.some(w => /walk.*feet drift/.test(w))).toBe(false)
})
test('actual standing-frame movement is still reported', async () => {
  const b = await buildRig([{ id: 'idle', dirs: { south: [frame(60), frame(58)] } }], { directions: [{ id: 'south' }] })
  expect(b.warnings).toContain('idle/south: silhouette bottom differs up to 2 px from the idle reference')
})
