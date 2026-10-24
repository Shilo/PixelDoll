import { beforeEach, expect, test, vi } from 'vitest'
import { equipmentFixture, bodyOnly } from './equipment-fixture.ts'
import { createDesign } from '../../src/lib/equipment/design.ts'
import { prepareCopy } from '../../src/lib/equipment/copy.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { readCharacterZip, saveImportedCharacter } from '../../src/lib/store/import.ts'
import { loadProject } from '../../src/lib/store/project.ts'
import { zip } from '../../src/lib/store/zip.ts'
import { composeCell } from '../../src/lib/compose/compose.ts'
import { recolor } from '../../src/lib/dress/dress.ts'
const memory = vi.hoisted(() => ({ records: new Map<string, unknown>(), blobs: new Map<string, Blob>() }))
vi.mock('../../src/lib/store/db.ts', () => ({
  get: async (_s: string, id: string) => structuredClone(memory.records.get(id)),
  getBlob: async (hash: string) => memory.blobs.get(hash), askPersist: () => {},
  putCharacter: async (id: string, record: unknown, blobs: Map<string, Blob>) => {
    if (memory.records.has(id)) throw new Error('duplicate')
    for (const [hash, blob] of blobs) memory.blobs.set(hash, blob)
    memory.records.set(id, structuredClone(record))
  },
}))
beforeEach(() => { memory.records.clear(); memory.blobs.clear() })

test.each(['engine-only', 'engine-with-source-blobs', 'editable'] as const)('saved shared equipment can reopen after %s ZIP import', async (kind) => {
  const source = await equipmentFixture(), extra = [...source.images.keys()].at(-1)! as `sha256:${string}`
  source.manifest.items[1].dressed = { south: extra }; source.manifest.items[1].key = 'green'; source.manifest.items[1].route = 'skeleton-pose'
  const design = await createDesign(source, 'hat', { hat: 'blue' }), candidate = await prepareCopy(design, bodyOnly(source))
  candidate.project.manifest.presets[0].items.head = candidate.itemId
  const exported = await exportFiles(candidate.project, { engines: ['generic'], baked: true })
  expect(exported.errors).toEqual([])
  const entries = exported.entries.filter(e => kind === 'editable' || (e.name !== 'project.json' && (kind === 'engine-with-source-blobs' || !e.name.startsWith('cells/'))))
  const restored = await readCharacterZip(await zip(entries)), item = restored.project.manifest.items.find(i => i.id === candidate.itemId)!
  expect(item.coverage).toEqual(candidate.project.manifest.items.find(i => i.id === candidate.itemId)!.coverage)
  if (kind === 'engine-only') {
    expect(item.design).toBeUndefined()
    expect(restored.warnings.some(w => w.includes('reusable-design links were removed'))).toBe(true)
  } else {
    expect(item.design).toEqual(candidate.project.manifest.items.find(i => i.id === candidate.itemId)!.design)
    for (const hash of item.design!.snapshot.imageHashes) expect(restored.project.images.has(hash)).toBe(true)
  }
  const expected = composeCell(recolor(restored.project, {}), restored.project.manifest.presets[0].items, 'rest', 'south', 0)
  // Reopen from only the newly persisted records/blobs, not the export's in-memory image map.
  const id = await saveImportedCharacter(restored, 'Restored shared equipment'), reopened = await loadProject(id)
  expect(composeCell(recolor(reopened.project, {}), reopened.project.manifest.presets[0].items, 'rest', 'south', 0)).toEqual(expected)
})
