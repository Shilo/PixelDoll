import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { equipmentFixture } from './equipment-fixture.ts'
import { animateAnchoredItem, ITEM_MOVE_SAVE_CONFLICT, type RigCtx } from '../../src/lib/items/run.ts'
import { planAnchoredMove } from '../../src/lib/items/items.ts'
import { missingItemMoves, itemMoveOffer } from '../../src/studio/create.ts'
import { movePlan } from '../../src/studio/apiPlans.ts'
import { bytesToBase64 } from '../../src/lib/image/png.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { encodePngBytes, decodePngBytes } from '../../src/lib/image/pngraw.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import * as db from '../../src/lib/store/db.ts'
import { saveItem } from '../../src/lib/store/project.ts'
import { queue, requestIdentity, type JobRec } from '../../src/lib/pixellab/queue.ts'
import { sha256 } from '../../src/lib/image/hash.ts'
import type { Req } from '../../src/lib/pixellab/routes.ts'

const ledger = vi.hoisted(() => ({ records: [] as JobRec[], listeners: new Set<(s: { jobs: JobRec[] }) => void>(), blobs: new Map<string, Blob>(), failAt: -1, billed: 0, transparent: false, colors: [] as number[][] }))
vi.mock('../../src/lib/pixellab/queue.ts', async original => ({ ...await original<typeof import('../../src/lib/pixellab/queue.ts')>(), queue: {
  subscribe: (cb: (s: { jobs: JobRec[] }) => void) => { ledger.listeners.add(cb); cb({ jobs: ledger.records }); return () => ledger.listeners.delete(cb) },
  enqueue: vi.fn(), planBlocks: () => null,
} }))
vi.mock('../../src/lib/store/project.ts', async original => ({ ...await original<typeof import('../../src/lib/store/project.ts')>(), saveItem: vi.fn(async () => {}) }))
beforeEach(() => { ledger.records.splice(0); ledger.blobs.clear(); ledger.failAt = -1; ledger.billed = 0; ledger.transparent = false; ledger.colors = []; vi.mocked(saveItem).mockClear() })
afterEach(() => vi.restoreAllMocks())

async function fixture(frames = 18): Promise<RigCtx> {
  const project = await equipmentFixture(), m = project.manifest, body = m.items[0].layers[0].cells!.rest!.south![0]!
  m.rig.directions = [{ id: 'east' }, { id: 'west' }]
  m.rig.animations = [{ id: 'stand_any_name', cells: 1, frames: [{ cell: 0, ms: 100 }], loop: true }, { id: 'custom_18', cells: frames, frames: Array.from({ length: frames }, (_, cell) => ({ cell, ms: 100 })), loop: true }]
  m.items[0].layers[0].cells = { stand_any_name: { east: [body], west: [body] }, custom_18: { east: Array(frames).fill(body) } }
  const raw = toChroma(project.images.get(body)!, 'green')
  raw.data.set([180, 20, 30, 255], (18 * 64 + 20) * 4)
  const reference = await cellHash(raw)
  project.images.set(reference, raw)
  ledger.blobs.set(reference.slice(7), new Blob([(await encodePngBytes(raw)) as Uint8Array<ArrayBuffer>]))
  const item = m.items[1]
  item.route = 'ea2-anchor'; item.key = 'green'; item.standing = 'stand_any_name'; item.dressed = { east: reference, west: reference }
  item.layers[0].cells = { stand_any_name: { east: [null], west: [null] } }
  item.coverage = ['stand_any_name/east/0', 'stand_any_name/west/0'] // accepted standing output declares authored transparency
  vi.spyOn(db, 'getBlob').mockImplementation(async h => ledger.blobs.get(h))
  vi.mocked(queue.enqueue).mockReset().mockImplementation(async (req: Req) => {
    expect(req.path).toBe('/edit-animation-v2')
    const { requestHash: id } = await requestIdentity(req), old = ledger.records.find(r => r.id === id)
    if (old) return old
    const params = req.body as { frames: { image: { base64: string } }[] }
    const outputs = []
    for (const [i, frame] of params.frames.entries()) {
      const image = await decodePngBytes(Uint8Array.from(atob(frame.image.base64), ch => ch.charCodeAt(0)))
      if (!ledger.transparent || i === 0) image.data.set([180, 20, 30, 255], (18 * 64 + 20) * 4)
      const paint = i > 0 && ledger.colors[i - 1];
      if (paint) for (let x = 20; x < 24; x++) image.data.set(paint, (18 * 64 + x) * 4)
      const bytes = await encodePngBytes(image), hash = await sha256(bytes)
      ledger.blobs.set(hash, new Blob([bytes as Uint8Array<ArrayBuffer>]))
      outputs.push({ label: String(i), sha: hash })
    }
    const rec = { id, state: ledger.billed++ === ledger.failAt ? 'failed' : 'done', method: req.method, endpoint: req.path, params: req.body, requestHash: id, createdAt: 0, gens: 10, usd: 0, jobs: [{ results: outputs, done: true }] } as unknown as JobRec
    ledger.records.push(rec); ledger.listeners.forEach(cb => cb({ jobs: ledger.records }))
    return rec
  })
  return { rec: { id: 'rig-imported-two-view', savedAt: '', manifest: m }, project }
}

test('two-view unrigged imports extend just the chosen sparse move, reusing their standing purchase', async () => {
  const ctx = await fixture(), m = ctx.rec.manifest, item = m.items[1], original = structuredClone(item)
  const [spec] = missingItemMoves(m, item.id, 77), offer = itemMoveOffer(m, [spec])
  expect(spec).toMatchObject({ id: 'custom_18', dirs: ['east'], itemsOnly: true, itemMethod: 'anchor' })
  expect(offer.gens).toBe(20)
  const preview = movePlan(ctx.rec, spec).filter(c => c.method === 'POST')
  expect(preview.map(c => c.path)).toEqual(['/edit-animation-v2', '/edit-animation-v2'])
  const saved = vi.mocked(saveItem)
  await animateAnchoredItem(ctx, item, spec.id, spec.dirs!, spec.seed)
  expect(saved).toHaveBeenCalledOnce()
  const result = saved.mock.calls[0][1]
  expect(result.route).toBe('ea2-anchor'); expect(result.dressed).toEqual(original.dressed)
  expect(result.layers[0].cells!.stand_any_name).toEqual(original.layers[0].cells!.stand_any_name)
  expect(result.layers[0].cells!.custom_18!.east).toHaveLength(18)
  expect(result.layers[0].cells!.custom_18!.west).toBeUndefined()
  expect(result.provenance).toHaveLength(2)
  expect(result.provenance.flatMap(p => p.produced)).toHaveLength(18)
  for (const [i, call] of vi.mocked(queue.enqueue).mock.calls.entries()) {
    const body = call[0].body as { frames: { image: { base64: string } }[]; description: string }
    expect(body.frames).toHaveLength((i ? 3 : 15) + 1)
    expect(body.frames[0].image.base64).toBe(bytesToBase64(new Uint8Array(await ledger.blobs.get(item.dressed!.east!.slice(7))!.arrayBuffer())))
    expect(body.description).toContain('frame 1')
    expect(call[1]).toMatchObject({ minimumTier: 0 })
  }
  expect(ledger.billed).toBe(2)
})

test('resuming an interrupted anchored move reattaches deterministic paid calls and never resends terminal failures', async () => {
  const ctx = await fixture(), item = ctx.rec.manifest.items[1]
  ledger.failAt = 1
  await expect(animateAnchoredItem(ctx, item, 'custom_18', ['east'], 99)).rejects.toThrow()
  const hashes = ledger.records.map(r => r.requestHash)
  expect(hashes).toHaveLength(2)
  await expect(animateAnchoredItem(ctx, item, 'custom_18', ['east'], 99)).rejects.toThrow()
  expect(ledger.billed).toBe(2)
  expect(ledger.records.map(r => r.requestHash)).toEqual(hashes)
  expect(saveItem).not.toHaveBeenCalled()
})

test('anchored extension validates standing reference dimensions and presence before the first paid call', async () => {
  const ctx = await fixture(1), item = ctx.rec.manifest.items[1]
  ctx.project.images.delete(item.dressed!.east!)
  await expect(animateAnchoredItem(ctx, item, 'custom_18', ['east'], 99)).rejects.toThrow('same frame size')
  expect(queue.enqueue).not.toHaveBeenCalled()
  delete item.dressed!.east
  expect(() => planAnchoredMove(ctx.rec.manifest.rig, item, 'custom_18', ['east'])).toThrow('No saved standing design')
})

test('recovery publishes the same completed requests without enqueuing or changing their seed', async () => {
  const ctx = await fixture(), item = ctx.rec.manifest.items[1], stored = structuredClone(ctx.rec)
  const save = vi.mocked(saveItem)
  stored.manifest.items[1].prompt = 'different artwork'
  save.mockImplementationOnce(async (_id, _item, _images, _ladder, guard) => guard!(stored))
  await expect(animateAnchoredItem(ctx, item, 'custom_18', ['east'], 99)).rejects.toThrow(ITEM_MOVE_SAVE_CONFLICT)
  expect(ledger.billed).toBe(2)

  const enqueue = vi.mocked(queue.enqueue)
  enqueue.mockClear()
  await expect(animateAnchoredItem(ctx, item, 'custom_18', ['east'], 100, undefined, { savedOnly: true })).rejects.toThrow('No generation was requested')
  expect(save).toHaveBeenCalledOnce()

  stored.manifest.items[1] = { ...item, materials: ['saved-dye'], hides: ['hair'] }
  save.mockImplementationOnce(async (_id, _item, _images, _ladder, guard) => guard!(stored))
  await animateAnchoredItem(ctx, item, 'custom_18', ['east'], 99, undefined, { savedOnly: true })
  expect(enqueue).not.toHaveBeenCalled()
  expect(ledger.billed).toBe(2)
  expect(save.mock.calls[1][1]).toMatchObject({ materials: ['saved-dye'], hides: ['hair'] })
  expect(save.mock.calls[1][1].provenance.map(p => p.requestHash)).toEqual(ledger.records.map(r => `sha256:${r.requestHash}`))
})

test('recovery can publish the remaining view with its original paid seed', async () => {
  const ctx = await fixture(3), item = ctx.rec.manifest.items[1];
  ctx.rec.manifest.items[0].layers[0].cells!.custom_18!.west = [...ctx.rec.manifest.items[0].layers[0].cells!.custom_18!.east!];
  await animateAnchoredItem(ctx, item, 'custom_18', ['east', 'west'], 71);
  const enqueue = vi.mocked(queue.enqueue);
  enqueue.mockClear();
  await animateAnchoredItem(ctx, item, 'custom_18', ['west'], 71, undefined, { savedOnly: true, plannedDirs: ['east', 'west'] });
  expect(enqueue).not.toHaveBeenCalled();
  const saved = vi.mocked(saveItem).mock.calls.at(-1)![1];
  expect(saved.provenance).toHaveLength(1);
  expect(saved.provenance[0].requestHash).toBe(`sha256:${ledger.records[1].requestHash}`);
});

test('saved transparent generated views retain explicit coverage and are never offered for purchase again', async () => {
  const ctx = await fixture(2), item = ctx.rec.manifest.items[1]
  ledger.transparent = true
  await animateAnchoredItem(ctx, item, 'custom_18', ['east'], 77)
  const saved = vi.mocked(saveItem).mock.calls[0][1]
  expect(saved.layers[0].cells!.custom_18!.east).toEqual([null, null])
  expect(saved.coverage).toContain('custom_18/east/0')
  expect(saved.coverage).toContain('custom_18/east/1')
  ctx.rec.manifest.items[1] = saved
  expect(missingItemMoves(ctx.rec.manifest, saved.id)).toEqual([])
})

test.each([false, true])('matches close generated dyes and flags a distant frame when the standing dyes are unsaved: %s', async unsaved => {
  const ctx = await fixture(8), item = ctx.rec.manifest.items[1]
  const approved = [...ctx.project.images.values()][1], standing = await cellHash(approved)
  item.layers[0].cells!.stand_any_name!.east = [standing]
  if (unsaved) {
    item.materials = []
    ctx.rec.manifest.materials = ctx.rec.manifest.materials.filter(m => m.owner !== item.id)
  }
  const stored = structuredClone(ctx.rec)
  vi.mocked(saveItem).mockImplementationOnce(async (_id, _item, _images, _ladder, guard) => guard!(stored))
  ledger.colors = Array.from({ length: 8 }, (_, i) => i === 3 ? [220, 220, 220, 255] : [113, 122, 125, 255])

  await animateAnchoredItem(ctx, item, 'custom_18', ['east'], 77)
  const [, saved, images] = vi.mocked(saveItem).mock.calls[0], frames = saved.layers[0].cells!.custom_18!.east!
  const at = (18 * 64 + 20) * 4
  expect(images.get(frames[0]!)!.data.slice(at, at + 4)).toEqual(new Uint8ClampedArray([120, 120, 120, 255]))
  expect(images.get(frames[3]!)!.data.slice(at, at + 4)).toEqual(new Uint8ClampedArray([220, 220, 220, 255]))
  expect(saved.qa?.clips?.['custom_18/east']).toMatchObject({ status: 'warn', maxPaletteDist: 100 })
  expect(stored.manifest.materials.find(m => m.owner === saved.id)?.ramp).toEqual(['#787878'])
  expect(saved.materials).toEqual(stored.manifest.materials.filter(m => m.owner === saved.id).map(m => m.id))
  const raw = await decodePngBytes(new Uint8Array(await ledger.blobs.get(ledger.records[0].jobs[0].results[1].sha)!.arrayBuffer()))
  expect(raw.data.slice(at, at + 4)).toEqual(new Uint8ClampedArray([113, 122, 125, 255]))
})
