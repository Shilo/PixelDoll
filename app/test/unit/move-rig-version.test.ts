import { expect, test } from 'vitest'
import { moveRigVersion } from '../../src/studio/replaceMove.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'

const record = () => ({
  character: { id: 'c1', looks: 'bare' },
  manifest: { rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: 'sha256:before', directions: [{ id: 'south' }], animations: [{ id: 'default', cells: 1, loop: true, frames: [] }] } },
}) as unknown as Pick<StoredProject, 'manifest' | 'character'>

test('the first-open garment split (body hash only) does not invalidate a move in progress', () => {
  // 2026-11-07 live test: Add idle + walk from the creator failed at publication because the Studio's first open split the base.
  const a = record(), b = record()
  b.manifest.rig.baseHash = 'sha256:after-split' as never
  expect(moveRigVersion(b)).toBe(moveRigVersion(a))
})

test('real rig and character changes still invalidate it', () => {
  const a = record(), moved = record(), recast = record()
  moved.manifest.rig.animations.push({ id: 'walk', cells: 8, loop: true, frames: [] } as never)
  ;(recast.character as { looks: string }).looks = 'other'
  expect(moveRigVersion(moved)).not.toBe(moveRigVersion(a))
  expect(moveRigVersion(recast)).not.toBe(moveRigVersion(a))
})
