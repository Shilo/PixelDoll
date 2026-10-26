import { beforeEach, expect, test, vi } from 'vitest'
import type { JobRec } from '../../src/lib/pixellab/queue.ts'
import type { Req } from '../../src/lib/pixellab/routes.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { sha256 } from '../../src/lib/image/hash.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { cellHash, type DirectionName } from '../../src/lib/rig/rig.ts'
import * as db from '../../src/lib/store/db.ts'
import { itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts'
import { gridFallback, MAX_REROLLS, rerollCall, runItem, type Draft, type ItemResult, type RigCtx } from '../../src/lib/items/run.ts'
import { plainReason } from '../../src/studio/model.ts'
import type { Manifest } from '../../src/lib/store/manifest.ts'

// A fake ledger: enqueue records requests in order, the test lands them one at a time.
// Record ids stay unique across tests, so a run a test leaves waiting never wakes on a later test's record.
const q = vi.hoisted(() => ({ recs: new Map<string, JobRec>(), order: [] as { id: string; path: string; label: string }[], listeners: new Set<(s: { jobs: JobRec[] }) => void>(), blocked: null as string | null, n: 0 }))
vi.mock('../../src/lib/pixellab/queue.ts', () => {
  const emit = () => { for (const l of [...q.listeners]) l({ jobs: [...q.recs.values()] }) }
  return {
    queue: {
      subscribe: (cb: (s: { jobs: JobRec[] }) => void) => { q.listeners.add(cb); cb({ jobs: [...q.recs.values()] }); return () => q.listeners.delete(cb) },
      enqueue: vi.fn(async (req: Req, meta: { label: string }) => {
        const id = `r${q.n++}`, rec = { id, label: meta.label, method: 'POST', endpoint: req.path, params: req.body, inputs: [], requestHash: id, state: 'queued', attempts: 0, nextAt: 0, createdAt: q.order.length, jobs: [], gens: 0, usd: 0 } as unknown as JobRec
        q.recs.set(id, rec); q.order.push({ id, path: req.path, label: meta.label }); emit()
        return rec
      }),
      planBlocks: vi.fn(() => q.blocked),
      emit,
    },
  }
})
const { queue } = await import('../../src/lib/pixellab/queue.ts')
const blobs = new Map<string, Blob>()
beforeEach(() => {
  q.recs.clear(); q.order.splice(0); q.blocked = null; blobs.clear() // listeners stay: run.ts reads the ledger through one
  vi.mocked(queue.enqueue).mockClear(); vi.mocked(queue.planBlocks).mockClear()
  vi.spyOn(db, 'getBlob').mockImplementation(async (sha) => blobs.get(sha))
})
async function land(id: string, outs: Img[]) {
  const results = await Promise.all(outs.map(async (im, i) => { const bytes = await encodePngBytes(im), sha = await sha256(bytes); blobs.set(sha, new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' })); return { label: String(i), sha } }))
  Object.assign(q.recs.get(id)!, { state: 'done', jobs: [{ id: `${id}-job`, status: 'completed', done: true, results }] })
  ;(queue as unknown as { emit: () => void }).emit()
}
const call = (path: string, dir?: string) => q.order.find((o) => o.path === path && (!dir || o.label.includes(`/${dir}`)))

// 16 px body in two drawn views; a 4-frame walk with stored keypoints; the item is a gray band across the chest.
async function fixture() {
  const body = makeImg(16, 16)
  for (let y = 3; y < 16; y++) for (let x = 5; x < 11; x++) body.data.set([200, 150, 120, 255], (y * 16 + x) * 4)
  const h = await cellHash(body), dirs: DirectionName[] = ['south', 'east'], points = LABELS.map((label) => ({ label, x: 0.5, y: label === 'NECK' ? 0.3 : 0.6 }))
  const manifest: Manifest = {
    format: 'pixeldoll/1', name: 'Test', app: '', slots: [], materials: [], presets: [],
    rig: { cell: { w: 16, h: 16 }, pivot: { x: 8, y: 15 }, baseHash: h, baseItem: 'base', directions: dirs.map((id) => ({ id })), rest: Object.fromEntries(dirs.map((d) => [d, { image: h, keypoints: points }])),
      animations: [{ id: 'walk', cells: 4, loop: true, frames: [0, 1, 2, 3].map((cell) => ({ cell, ms: 100 })), sources: Object.fromEntries(dirs.map((d) => [d, { route: 'skeleton-v3', reference: h, keypoints: Array(4).fill(points), provenance: [] }])) }] },
    items: [{ id: 'base', name: 'Body', slot: 'body', status: 'accepted', mirror: 'generate', materials: [], prompt: '', baseHash: h, provenance: [], layers: [{ id: 'main', role: 'fg', z: 10, cells: { walk: Object.fromEntries(dirs.map((d) => [d, Array(4).fill(h)])) } }] }],
  } as unknown as Manifest
  const ctx = { rec: { id: 'rig', savedAt: '', manifest }, project: { manifest, images: new Map([[h, body]]) } } as unknown as RigCtx
  const dressed = toChroma(body, 'green')
  for (let y = 7; y < 10; y++) for (let x = 5; x < 11; x++) dressed.data.set([120, 120, 130, 255], (y * 16 + x) * 4)
  const d: Draft = {
    spec: { id: 'armor', name: 'Armor', slot: 'torso_outer', prompt: 'iron armor', key: 'green', anims: ['walk'], dirs, method: 'skel' }, rigId: 'rig', keySwitched: false, log: [],
    calls: [{ kind: 'dress' as const, cells: ['rest/south/0'] }, { kind: 'dress' as const, cells: ['rest/east/0'] }, ...dirs.map((dir) => ({ kind: 'pose' as const, cells: [0, 1, 2, 3].map((i) => `walk/${dir}/${i}`) }))].map((c, i) => ({ ...c, seed: i + 1, rerolls: 0, old: [] })),
  }
  return { ctx, d, dressed }
}

test('after a key switch a direction poses as soon as its own dress chunk passes, and the preview streams landed cells with the rest pending', async () => {
  const { ctx, d, dressed } = await fixture(), results: ItemResult[] = []
  d.keySwitched = true // no later chunk can switch the key again, so early poses are never restarted
  const run = runItem(d, ctx, { result: (r) => results.push(r) })
  await vi.waitFor(() => expect(call('/edit-animation-v2')).toBeDefined())
  await land(q.order[0].id, [dressed])
  // south poses while the east dress chunk is still generating; east waits for its own keyframe
  await vi.waitFor(() => expect(call('/animate-with-skeleton-v3', 'south')).toBeDefined())
  const east = q.order.filter((o) => o.path === '/edit-animation-v2')[1]
  expect(east).toBeDefined()
  expect(q.recs.get(east.id)!.state).toBe('queued')
  expect(call('/animate-with-skeleton-v3', 'east')).toBeUndefined()
  await land(east.id, [dressed, dressed]) // anchored chunk: its first output is the anchor's
  await vi.waitFor(() => expect(call('/animate-with-skeleton-v3', 'east')).toBeDefined())
  // the south walk lands: the preview shows it while east is still pending (loading, not transparent)
  await land(call('/animate-with-skeleton-v3', 'south')!.id, Array(4).fill(dressed))
  await vi.waitFor(() => expect(results.some((r) => r.cells.some((c) => c.key.startsWith('walk/south')))).toBe(true))
  const streamed = results.find((r) => r.preview)!.preview!.manifest.items.find((i) => i.id === 'armor')!
  expect(streamed.coverage).toEqual(['walk/south/0', 'walk/south/1', 'walk/south/2', 'walk/south/3'])
  expect(streamed.pending).toEqual(['walk/east/0', 'walk/east/1', 'walk/east/2', 'walk/east/3'])
  expect(streamed.layers[0].cells!.walk.east).toEqual([null, null, null, null])
  await land(call('/animate-with-skeleton-v3', 'east')!.id, Array(4).fill(dressed))
  const res = await run
  expect(d.log.at(-1)).toMatch(/^gates passed/)
  expect(q.order.map((o) => o.path).sort()).toEqual(['/animate-with-skeleton-v3', '/animate-with-skeleton-v3', '/edit-animation-v2', '/edit-animation-v2']) // no call twice
  const done = res!.preview!.manifest.items.find((i) => i.id === 'armor')!
  expect(done.pending).toBeUndefined()
  expect(done.coverage).toHaveLength(8)
})

test('a failing design call poses nothing early (its re-roll drops every later call)', async () => {
  const { ctx, d } = await fixture()
  const empty = toChroma(makeImg(16, 16), 'green') // the item is missing: G4 on the keyframe
  void runItem(d, ctx, {})
  await vi.waitFor(() => expect(call('/edit-animation-v2')).toBeDefined())
  await land(q.order[0].id, [empty])
  await vi.waitFor(() => expect(q.order.filter((o) => o.path === '/edit-animation-v2')).toHaveLength(2))
  await land(q.order[1].id, [empty, empty])
  await vi.waitFor(() => expect(d.calls[0].rerolls).toBe(1)) // re-rolled at the checkpoint
  expect(call('/animate-with-skeleton-v3')).toBeUndefined()
})

test('a pose fallback grid the account plan cannot run is never enqueued: the pose roll stays for review', async () => {
  const { ctx, d, dressed } = await fixture()
  for (const [k, c] of d.calls.entries()) {
    const id = `done${k}`, outs = c.kind === 'pose' ? Array(4).fill(dressed) : k ? [dressed, dressed] : [dressed]
    q.recs.set(id, { id, state: 'queued', jobs: [] } as unknown as JobRec)
    c.recId = id
    await land(id, outs)
  }
  Object.assign(d.calls[2], { rerolls: MAX_REROLLS })
  q.blocked = 'Needs PixelLab Tier 2 or higher. No request sent.'
  expect(await gridFallback(d, 2, ctx)).toBe(false)
  expect(d.calls[2]).toMatchObject({ kind: 'pose', recId: 'done2' })
  expect(d.calls[2].fallback).toBeUndefined()
  expect(d.log).toEqual(['call 3: no inpaint-v3 grid fallback (Needs PixelLab Tier 2 or higher. No request sent.); kept the best pose roll for review'])
  expect(vi.mocked(queue.planBlocks).mock.calls[0][0].path).toBe('/inpaint-v3')
  expect(vi.mocked(queue.planBlocks).mock.calls[0][1]).toBe(1)
  expect(queue.enqueue).not.toHaveBeenCalled()
  q.blocked = null
  expect(await gridFallback(d, 2, ctx)).toBe(true) // a plan that can run it gets the grid
  expect(d.calls[2]).toMatchObject({ kind: 'grid', recId: undefined, fallback: { recId: 'done2' } })
})

test('a held item pasted on near-rest frames says so in review, without changing its pixels', () => {
  const rig = { cell: { w: 8, h: 8 }, animations: [{ id: 'idle', cells: 2 }], directions: [{ id: 'east' }] } as unknown as Manifest['rig']
  const layer = makeImg(8, 8)
  for (const p of [27, 28, 35, 36, 43, 44]) layer.data.set([150, 150, 160, 255], p * 4)
  const mask = Uint8Array.from({ length: 64 }, (_, p) => +(layer.data[p * 4 + 3] > 0))
  const cell = (i: number, repaired: boolean): CellOut => ({ key: `idle/east/${i}`, call: 1, base: makeImg(8, 8), input: makeImg(8, 8), out: layer, layer, mask, area: 6, outBand: 0, baseBand: 0, specks: 0, pinholes: 0, shifted: false, offset: [0, 0], stray: 0, posed: true, ...(repaired ? { repaired } : {}) })
  const q2 = itemQa(rig, slotOf('main_hand'), 'green', [cell(0, true), cell(1, true)], 0)
  const r1 = q2.warnings.find((w) => w.startsWith('R1'))
  expect(r1).toBe('R1 idle/east: dressed item pasted on 2 near-rest frames; check that it moves')
  expect(plainReason(r1!)).toBe('Held item pasted on 2 idle frames (east); check that it moves')
  expect(q2.qa.status).not.toBe('pass')
  expect(q2.qa.cells['idle/east/0']?.repaired).toBe(true)
  expect(itemQa(rig, slotOf('main_hand'), 'green', [cell(0, false), cell(1, false)], 0).warnings.some((w) => w.startsWith('R1'))).toBe(false)
})

/** The dressed keyframe with key-colored px outside the body: a key/item color collision (G3). */
function collision(dressed: Img) {
  const im = makeImg(16, 16)
  im.data.set(dressed.data)
  const key = dressed.data.slice((4 * 16 + 6) * 4, (4 * 16 + 6) * 4 + 4) // a body px above the item band: key-colored
  for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) im.data.set(key, (y * 16 + x) * 4)
  return im
}

test('several dress chunks on the first key pose nothing until all landed: a later G3 switches the key with no pose sent', async () => {
  const { ctx, d, dressed } = await fixture()
  void runItem(d, ctx, {})
  await vi.waitFor(() => expect(call('/edit-animation-v2')).toBeDefined())
  await land(q.order[0].id, [dressed]) // south passes its gates
  await vi.waitFor(() => expect(q.order.filter((o) => o.path === '/edit-animation-v2')).toHaveLength(2))
  const east = q.order.filter((o) => o.path === '/edit-animation-v2')[1]
  await land(east.id, [dressed, collision(dressed)])
  await vi.waitFor(() => expect(d.keySwitched).toBe(true))
  expect(d.log.some((l) => l.startsWith('switch key') && l.includes('G3'))).toBe(true)
  expect(call('/animate-with-skeleton-v3')).toBeUndefined() // the old flow posed south first, then restarted it on the new key
})

test('a call re-rolled while its request is built keeps the paid record counted but never uses it', async () => {
  const { ctx, d, dressed } = await fixture()
  let release!: () => void
  const hold = new Promise<void>((r) => { release = r })
  d.keySwitched = true
  let holding = false, held = false
  vi.mocked(db.getBlob).mockImplementation(async (sha) => { if (holding) { held = true; await hold } return blobs.get(sha) })
  void runItem(d, ctx, { result: () => { holding = true } }) // the next blob read after the gate evaluation is the pose's keyframe
  await vi.waitFor(() => expect(call('/edit-animation-v2')).toBeDefined())
  await land(q.order[0].id, [dressed])
  await vi.waitFor(() => expect(held).toBe(true))
  rerollCall(d, 0, 'a new design') // drops the south pose while its request is being built
  holding = false; release()
  await vi.waitFor(() => expect(call('/animate-with-skeleton-v3', 'south')).toBeDefined())
  const pose = call('/animate-with-skeleton-v3', 'south')!.id
  await vi.waitFor(() => expect(d.calls[2].old).toContain(pose))
  expect(d.calls[2].recId).toBeUndefined()
})

test('an early pose that fails is handled where the run awaits it, never as an unhandled rejection', async () => {
  const { ctx, d, dressed } = await fixture(), enqueue = vi.mocked(queue.enqueue).getMockImplementation()!
  d.keySwitched = true
  vi.mocked(queue.enqueue).mockImplementation(async (req, meta) => { if (req.path === '/animate-with-skeleton-v3') throw new Error('offline'); return enqueue(req, meta) })
  try {
    const run = runItem(d, ctx, {})
    await vi.waitFor(() => expect(call('/edit-animation-v2')).toBeDefined())
    await land(q.order[0].id, [dressed]) // the south pose fails at once, long before the coverage step
    await vi.waitFor(() => expect(q.order.filter((o) => o.path === '/edit-animation-v2')).toHaveLength(2))
    await new Promise((r) => setTimeout(r, 50))
    await land(q.order.filter((o) => o.path === '/edit-animation-v2')[1].id, [dressed, dressed])
    await run
    expect(d.log.at(-1)).toBe('error: offline')
  } finally { vi.mocked(queue.enqueue).mockImplementation(enqueue) }
})
