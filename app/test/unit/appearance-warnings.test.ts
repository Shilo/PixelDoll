import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { loadFixture } from '../../src/lib/compose/fixture.ts'
import { mergeQa } from '../../src/lib/items/qa-summary.ts'
import { invalidateMoveItems } from '../../src/studio/replaceMove.ts'
import { healthOf } from '../../src/studio/model.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { projectEntries, readCharacterZip } from '../../src/lib/store/import.ts'
import { zip } from '../../src/lib/store/zip.ts'
import type { ItemQa } from '../../src/lib/store/manifest.ts'

const framePass = (): ItemQa => ({ minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 1, maxAreaCV: 0, maxPaletteDist: 0, clipPx: 0, status: 'pass', rerolls: 0, cells: {}, clips: {} })

test('accepted appearance exceptions survive frame replacement, all-QA invalidation and editable ZIP roundtrip', async () => {
  const p = await loadFixture(async (path) => new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))))
  const item = p.manifest.items.find((it) => it.slot !== 'body')!
  const warnings = ['D1 keyframe rest/south/0: grey smudges', 'G2 keyframe rest/south/0: changed pixels']
  item.designWarnings = [...warnings]
  item.qa = framePass()
  expect(healthOf(p.manifest, item)).toBe('look')
  item.qa = mergeQa(item, framePass(), {})
  expect(item.qa.status).toBe('pass') // No fake clip failure is required to retain the appearance exception.
  expect(item.designWarnings).toEqual(warnings)
  expect(healthOf(p.manifest, item)).toBe('look')
  const moves = p.manifest.rig.animations.map((a) => a.id)
  for (const move of moves) invalidateMoveItems(p.manifest, move)
  expect(item.qa).toBeUndefined()
  expect(item.designWarnings).toEqual(warnings)
  expect(healthOf(p.manifest, item)).toBe('look')
  const out = await exportFiles(p, { engines: ['generic'], baked: false })
  expect(out.errors).toEqual([])
  const restored = (await readCharacterZip(await zip(out.entries))).project
  const saved = restored.manifest.items.find((it) => it.id === item.id)!
  expect(saved.designWarnings).toEqual(warnings)
  expect(healthOf(restored.manifest, saved)).toBe('look')
  delete saved.designWarnings
  expect(healthOf(restored.manifest, saved)).toBe('demo')
}, 20_000)


test('untrusted appearance-warning metadata is rejected before an imported item reaches the UI', async () => {
  const p = await loadFixture(async (path) => new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))))
  const entries = await projectEntries(p), editable = entries.find((e) => e.name === 'project.json')!
  const source = JSON.parse(new TextDecoder().decode(editable.data))
  for (const invalid of ['not-an-array', { length: 1 }, [42], [''], ['x'.repeat(2001)], Array(101).fill('D1 warning')]) {
    source.manifest.items[1].designWarnings = invalid
    editable.data = new TextEncoder().encode(JSON.stringify(source))
    await expect(readCharacterZip(await zip(entries))).rejects.toThrow('invalid accepted appearance warnings')
  }
}, 20_000)
