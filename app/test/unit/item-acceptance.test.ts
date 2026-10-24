import { beforeEach, expect, test, vi } from 'vitest'
import type { JobRec } from '../../src/lib/pixellab/queue.ts'
import type { Rig } from '../../src/lib/rig/rig.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { acceptItem, evaluateItem, gensOf, hasStructuralFailure, usdOf, type Draft, type ItemResult, type RigCtx } from '../../src/lib/items/run.ts'
import { saveItem } from '../../src/lib/store/project.ts'
import * as db from '../../src/lib/store/db.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'

const ledger = vi.hoisted(() => ({ records: [] as JobRec[] }))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { subscribe: (cb: (s: { jobs: JobRec[] }) => void) => { cb({ jobs: ledger.records }); return () => {} } } }))
vi.mock('../../src/lib/store/project.ts', () => ({ saveItem: vi.fn(async () => {}) }))
beforeEach(() => { ledger.records.splice(0); vi.mocked(saveItem).mockClear(); vi.restoreAllMocks() })

const rig: Rig = { cell: { w: 8, h: 8 }, pivot: { x: 4, y: 7 }, baseItem: 'base', baseHash: 'sha256:test', directions: [{ id: 'south' }], animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }] }
function fixture() {
  const base = makeImg(8, 8), layer = makeImg(8, 8), mask = new Uint8Array(64)
  for (const p of [18, 19, 20, 26, 27, 28, 34, 35, 36]) { mask[p] = 1; layer.data.set([90, 90, 100, 255], p * 4) }
  const cell: CellOut = { key: 'idle/south/0', call: 0, base, input: base, out: layer, layer, mask, area: 9, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: false, keyKept: 1, keyOutside: 0 }
  const draft: Draft = { spec: { id: 'helmet', name: 'Helmet', slot: 'head', prompt: 'iron helmet', key: 'green', anims: ['idle'], dirs: ['south'], method: 'anchor' }, rigId: 'rig', calls: [{ kind: 'edit', cells: ['idle/south/0'], seed: 1, recId: 'current', old: [], rerolls: 0 }], keySwitched: false, log: [] }
  const ctx = { rec: { id: 'rig', manifest: { rig } }, project: { manifest: { rig }, images: new Map() } } as unknown as RigCtx
  const result: ItemResult = { cells: [cell], qa: itemQa(rig, slotOf('head'), 'green', [cell], 0), g1: new Map(), preview: null }
  ledger.records.push(record('current', 10, 0))
  return { draft, ctx, result }
}
function record(id: string, gens: number, usd: number): JobRec {
  return { id, label: id, method: 'POST', endpoint: '/edit-animation-v2', params: {}, inputs: [], requestHash: id, state: 'done', attempts: 1, nextAt: 0, createdAt: 1, jobs: [], gens, usd }
}

test.each(['G1 1 outputs for 2 requested frames', 'G1 grid 128x64, expected 256x64', 'G1 output 32x32; G2 keyframe key kept 0.8'])('malformed complete API batch never writes an accepted partial item: %s', async (why) => {
  const { draft, ctx, result } = fixture()
  expect(result.qa?.qa.status).toBe('pass')
  result.g1.set(1, why)
  await expect(acceptItem(draft, ctx, result)).rejects.toThrow('missing or malformed frames')
  expect(saveItem).not.toHaveBeenCalled()
  expect(draft.acceptedAt).toBeUndefined()
})

test.each(['G2 keyframe rest/south/0 key kept 0.8', 'G3 keyframe rest/south/0 key outside 0.3', 'G4 keyframe rest/south/0: item missing', 'D1 keyframe rest/south/0: 20 % gray smudges'])('complete flagged artwork remains explicitly acceptable: %s', async (why) => {
  const { draft, ctx, result } = fixture()
  result.g1.set(0, why)
  expect(hasStructuralFailure(result)).toBe(false)
  const saved = await acceptItem(draft, ctx, result)
  expect(saveItem).toHaveBeenCalledOnce()
  expect(saved.item.qa?.status).toBe('pass')
  expect(saved.item.designWarnings).toEqual([why])
  expect(draft.acceptedAt).toBeDefined()
})

test('ordinary failed cell-art QA remains explicitly acceptable', async () => {
  const { draft, ctx, result } = fixture()
  result.cells[0].shifted = true
  result.qa = itemQa(rig, slotOf('head'), 'green', result.cells, 0)
  expect(result.qa.qa.status).toBe('fail')
  const saved = await acceptItem(draft, ctx, result)
  expect(saved.item.qa?.status).toBe('accepted')
  expect(saveItem).toHaveBeenCalledOnce()
})

test('draft cost includes mixed-currency retries and fallback history once per ledger record', () => {
  const { draft } = fixture()
  draft.calls[0].old = ['old', 'old', 'current', 'gone']
  draft.calls.push({ kind: 'grid', cells: [], seed: 2, recId: 'grid', old: ['old', 'usd-retry'], rerolls: 2 })
  ledger.records.push(record('old', 10, 0), record('grid', 0, 0.08), record('usd-retry', 0, 0.04), record('unrelated', 99, 99))
  expect(gensOf(draft)).toBe(20)
  expect(usdOf(draft)).toBeCloseTo(0.12)
  const later = ledger.records.map((r) => r.id === 'grid' ? { ...r, usd: 0.1 } : r)
  expect(usdOf(draft, later)).toBeCloseTo(0.14)
  expect(gensOf(draft, later)).toBe(20)
})


test('missing expected frame coverage blocks saving even without a G1 diagnostic', async () => {
  const { draft, ctx, result } = fixture()
  ctx.rec.manifest.rig = structuredClone(rig)
  ctx.rec.manifest.rig.animations[0].cells = 2
  await expect(acceptItem(draft, ctx, result)).rejects.toThrow('missing or malformed frames')
  expect(saveItem).not.toHaveBeenCalled()
})

test('accepted keyframe design reasons are retained individually without rewriting clean clip QA', async () => {
  const { draft, ctx, result } = fixture()
  result.g1.set(0, 'G2 keyframe rest/south/0 key kept 0.8; D1 keyframe rest/south/0: gray smudges')
  const saved = await acceptItem(draft, ctx, result)
  expect(saved.item.designWarnings).toEqual(['G2 keyframe rest/south/0 key kept 0.8', 'D1 keyframe rest/south/0: gray smudges'])
  expect(saved.item.qa?.status).toBe('pass')
  expect(saved.item.qa?.clips?.['idle/south'].status).toBe('pass')
})


test('dressed imported-rest cells survive a design-art warning and retain their real coverage', async () => {
  const { draft, ctx } = fixture()
  const base = makeImg(8, 8)
  for (let y = 2; y < 7; y++) for (let x = 2; x < 6; x++) base.data.set([180, 140, 120, 255], (y * 8 + x) * 4)
  const hash = await cellHash(base), localRig = structuredClone(rig)
  const pose = LABELS.map((label) => ({ label, x: 0.5, y: label === 'NECK' ? 0.5 : 0.25 }))
  localRig.rest = { south: { image: hash, keypoints: pose } }
  localRig.animations[0].sources = { south: { route: 'import', reference: hash, keypoints: [pose], motion: 'imported-rest', provenance: [] } }
  const manifest: Manifest = { format: 'pixeldoll/1', app: 'test', name: 'test', rig: localRig, materials: [], slots: [slotOf('body')], presets: [], items: [{ id: 'base', name: 'Body', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt: '', baseHash: hash, provenance: [], layers: [{ id: 'main', role: 'fg', z: 10, cells: { idle: { south: [hash] } } }] }] }
  ctx.rec.manifest = manifest
  ctx.project = { manifest, images: new Map([[hash, base]]) }
  draft.spec.method = 'skel'
  draft.spec.prompt = 'crimson helmet'
  draft.calls[0].kind = 'dress'
  draft.calls[0].cells = ['rest/south/0']
  const composite = toChroma(base, 'green')
  for (let y = 0; y < 3; y++) for (let x = 2; x < 6; x++) composite.data.set(y === 0 ? [95, 90, 85, 255] : [220, 20, 30, 255], (y * 8 + x) * 4)
  ledger.records[0].jobs = [{ id: 'job', status: 'completed', done: true, results: [{ label: '0', sha: 'design-warning-fixture' }] }]
  const blob = new Blob([(await encodePngBytes(composite)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
  vi.spyOn(db, 'getBlob').mockResolvedValue(blob)
  const result = await evaluateItem(draft, ctx)
  expect(result.g1.get(0)).toContain('D1 keyframe')
  expect(hasStructuralFailure(result)).toBe(false)
  expect(result.cells.map((c) => c.key)).toEqual(['idle/south/0'])
  expect(result.cells[0].area).toBeGreaterThan(0)
  const saved = await acceptItem(draft, ctx, result)
  expect(saved.item.designWarnings?.some((why) => why.startsWith('D1'))).toBe(true)
  expect(saveItem).toHaveBeenCalledOnce()
})
