import { expect, test, vi } from 'vitest'
import { buildItem, itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { mergeClip, type RigCtx } from '../../src/lib/items/run.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { saveItem } from '../../src/lib/store/project.ts'
import type { CellKey, Item, Provenance } from '../../src/lib/store/manifest.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'

vi.mock('../../src/lib/store/project.ts', () => ({ saveItem: vi.fn(async () => {}) }))
const rig: Rig = { cell: { w: 8, h: 8 }, pivot: { x: 4, y: 7 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [] }, { id: 'slash', cells: 2, loop: true, frames: [] }] }
function cell(key: CellKey, call = 0): CellOut {
  const layer = makeImg(8, 8), base = makeImg(8, 8), mask = new Uint8Array(64)
  for (let y = 2; y < 5; y++) for (let x = 2; x < 5; x++) { mask[y * 8 + x] = 1; layer.data.set([90, 90, 100, 255], (y * 8 + x) * 4) }
  return { key, call, base, input: base, out: layer, layer, mask, area: 9, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true }
}
const qa = (cells: CellOut[]) => itemQa(rig, slotOf('head'), 'green', cells, 0)
const source = (produced: CellKey[], endpoint = '/animate-with-skeleton-v3'): Provenance => ({ produced, endpoint, params: {}, seed: 1, requestHash: 'sha256:test', createdAt: '2026-10-22T00:00:00Z' })
async function existing() {
  const cells = [cell('idle/south/0'), cell('idle/east/0'), cell('idle/north/0')]
  const { item } = await buildItem({ spec: { id: 'helmet', name: 'Helmet', slot: 'head', prompt: 'iron helmet', key: 'green', anims: ['idle'], dirs: ['south', 'east', 'north'] }, rig, cells, route: 'green', provenance: [source(cells.map(c => c.key as CellKey), '/edit-animation-v2')], qa: qa(cells).qa })
  return item
}
const ctx = { rec: { id: 'rig-test', manifest: { rig } } } as unknown as RigCtx
const saved = () => vi.mocked(saveItem).mock.calls.at(-1)![1] as Item

test('appended and replaced clip cells resolve chosen sources despite async order, batches and grid fallback', async () => {
  const item = await existing(), before = structuredClone(item)
  const cells = ['south', 'east', 'north'].flatMap((d, call) => [0, 1].map(i => cell(`slash/${d}/${i}` as CellKey, call)))
  const q = qa(cells), originalQa = structuredClone(q.qa)
  const records = [source(['slash/north/0', 'slash/north/1']), source(['slash/east/0']), source(['slash/south/0', 'slash/south/1']), source(['slash/east/1'], '/inpaint-v3')]
  await mergeClip(ctx, item, 'slash', ['south', 'east', 'north'], cells, records, q)
  const out = saved()
  for (const [key, c] of Object.entries(out.qa!.cells)) { expect(c.provenance).toBeDefined(); expect(out.provenance[c.provenance!].produced).toContain(key) }
  expect(out.qa!.cells['slash/south/0'].provenance).toBe(3)
  expect(out.qa!.cells['slash/east/0'].provenance).toBe(2)
  expect(out.qa!.cells['slash/east/1'].provenance).toBe(4)
  expect(out.qa!.cells['idle/south/0']).toEqual(item.qa!.cells['idle/south/0'])
  expect(item).toEqual(before); expect(q.qa).toEqual(originalQa)
  const east = cells.filter(c => c.key.includes('/east/')), grid = source(['slash/east/0', 'slash/east/1'], '/inpaint-v3')
  await mergeClip(ctx, out, 'slash', ['east'], east, [grid], qa(east))
  const replaced = saved()
  expect(replaced.qa!.cells['slash/east/0'].provenance).toBe(5)
  expect(replaced.qa!.cells['slash/east/1'].provenance).toBe(5)
  expect(replaced.qa!.cells['slash/south/0']).toEqual(out.qa!.cells['slash/south/0'])
  expect(replaced.qa!.cells['idle/south/0']).toEqual(item.qa!.cells['idle/south/0'])
})

test('a missing source record cannot silently publish incorrect cell provenance', async () => {
  const item = await existing(), cells = [cell('slash/south/0'), cell('slash/south/1')]
  vi.mocked(saveItem).mockClear()
  await expect(mergeClip(ctx, item, 'slash', ['south'], cells, [source(['slash/south/0'])], qa(cells))).rejects.toThrow('No source record for slash/south/1')
  expect(saveItem).not.toHaveBeenCalled()
})
