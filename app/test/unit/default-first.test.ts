import { afterEach, expect, test, vi } from 'vitest'
import { baseMoveSpecs, createCharacter, estimate, missingItemMoves, moveEstimate, reservedMove, upgradeDefault, type CreateSpec } from '../../src/studio/create.ts'
import { ALL_DIRECTIONS, buildShareMedia } from '../../src/studio/shareMedia.ts'
import { toChroma } from '../../src/lib/image/chroma.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { movePlan } from '../../src/studio/apiPlans.ts'
import { coverage } from '../../src/studio/itemRoute.ts'
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts'
import * as db from '../../src/lib/store/db.ts'
import { LABELS } from '../../src/lib/rig/poses.ts'
import { DIRECTIONS, baseHashOf, cellHash, cellKeys, needsDefault, standingMove, validateRig, type DirectionName, type Keypoint, type Sha256 } from '../../src/lib/rig/rig.ts'
import { rigReady } from '../../src/lib/rig/setup.ts'
import { planItem } from '../../src/lib/items/items.ts'
import type { RigCtx } from '../../src/lib/items/run.ts'
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { exportFiles } from '../../src/lib/export/export.ts'
import { buildPresentation, renderPresentation, resolveLive, resolvePreview } from '../../src/studio/experience/presentation.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'
import type { Project } from '../../src/lib/store/manifest.ts'

afterEach(() => vi.restoreAllMocks())
const points = (i: number): Keypoint[] => LABELS.map((label, k) => ({ label, x: 0.3 + k * 0.01 + i * 0.001, y: 0.3 + k * 0.02 }))

/** Runs createCharacter offline: draw, re-import and standing joints answer from memory; anything else is a test failure. */
async function create(spec: CreateSpec) {
  const view = (i: number) => { const im = makeImg(spec.size, spec.size); for (let y = 8; y < spec.size - 4; y++) for (let x = 18; x < 28; x++) im.data.set([60 + i * 20, 90, 120, 255], (y * spec.size + x) * 4); return im }
  const pngs = new Map(await Promise.all(DIRECTIONS.map(async (d, i) => [d, new Blob([(await encodePngBytes(view(i))) as Uint8Array<ArrayBuffer>], { type: 'image/png' })] as const)))
  const refs = Object.fromEntries(DIRECTIONS.map((d, i) => [d, { keypoints: Object.fromEntries(points(i).map(({ label, x, y }) => [label, { x, y }])) }]))
  vi.spyOn(db, 'get').mockResolvedValue(undefined)
  vi.spyOn(db, 'getBlob').mockImplementation(async (sha) => pngs.get(sha as DirectionName))
  vi.spyOn(db, 'askPersist').mockImplementation(() => {})
  let saved!: { rec: StoredProject; blobs: Map<string, Blob> }
  vi.spyOn(db, 'putCharacter').mockImplementation(async (_id, rec, blobs) => { saved = { rec: rec as StoredProject, blobs } })
  const done = (req: { path: string; body?: unknown }, extra: object) => ({ state: 'done', endpoint: req.path, params: req.body, requestHash: req.path, createdAt: 0, gens: 0, usd: 0, jobs: [], ...extra }) as unknown as JobRec
  const enqueue = vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
    if (req.path === '/create-character-v3' && !(req.body as { reference_image?: unknown }).reference_image)
      return done(req, { jobs: [{ results: DIRECTIONS.map((label) => ({ label, sha: label })) }] })
    if (req.path === '/create-character-v3') return done(req, { response: { character_id: 'managed' } })
    if (req.path === '/characters/managed') return done(req, { response: { skeletons: { '2d_references': refs } } })
    throw new Error(`Creation must not send ${req.path}`)
  })
  const views: { id: DirectionName; img: Img }[][] = []
  await createCharacter(spec, () => {}, (v) => views.push(v))
  const images = new Map<string, Img>(await Promise.all([...saved.blobs].map(async ([h, b]) => [`sha256:${h}`, await decodePngBytes(new Uint8Array(await b.arrayBuffer()))] as [string, Img])))
  const project: Project = { manifest: saved.rec.manifest, images }
  return { rec: saved.rec, project, views, paths: enqueue.mock.calls.map(([req]) => req.path) }
}

test('creation publishes a Default-only rig that items, moves, exports and live modes accept', async () => {
  const { rec, project, views, paths } = await create({ name: 'Default', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-default-first' })
  // two v3 creates and one free skeleton read: no animation, motion or estimate calls
  expect(paths).toEqual(['/create-character-v3', '/create-character-v3', '/characters/managed'])
  const rig = rec.manifest.rig, base = rec.manifest.items[0].layers[0]
  expect(rig.directions).toEqual([{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west', mirrorOf: 'east' }])
  expect(views).toHaveLength(1)
  expect(views[0].map((v) => v.id)).toEqual(rig.directions.map((d) => d.id))
  expect(rig.animations.map(({ sources: _, ...a }) => a)).toEqual([{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }])
  for (const d of ['south', 'east', 'north'] as const) {
    expect(rig.animations[0].sources![d]).toMatchObject({ motion: 'imported-rest', reference: rig.rest![d]!.image, keypoints: [rig.rest![d]!.keypoints] })
    expect(base.cells!.default![d]).toEqual([rig.rest![d]!.image]) // the cell is the standing view itself, so dressed views fit it
  }
  expect(rig.pivot).toEqual({ x: expect.any(Number), y: expect.any(Number) })
  expect(validateRig(rig, Object.fromEntries(cellKeys(rig).map((k) => { const [a, d, i] = k.split('/'); return [k, base.cells![a][d as DirectionName]![+i]!] })) as Record<string, Sha256>)).toEqual([])
  expect(Object.keys(rec.skeletons!).sort()).toEqual(cellKeys(rig).sort())
  expect(rigReady(rec)).toBe(true)
  // an item is dressed only: Default reuses the dressed standing view, nothing to pose yet
  const plan = planItem(rig, { ...coverage({ rec } as RigCtx), method: 'skel', key: 'green', slot: 'back' })
  expect(plan.map((c) => c.kind)).toEqual(['dress'])
  // live modes and Preview show the Default move while idle and walk are missing
  const a = buildPresentation(project)
  expect(resolveLive(a, { velocity: { x: 0, y: 0 } })).toMatchObject({ kind: 'animation', clip: 'default', direction: 'south' })
  expect(resolveLive(a, { velocity: { x: 1, y: 0 } })).toMatchObject({ kind: 'animation', clip: 'default', direction: 'east' })
  expect(resolvePreview(a, { clip: 'default', direction: 'west' })).toMatchObject({ kind: 'animation', clip: 'default', issue: null })
  // every exporter accepts a one-frame move
  const exported = await exportFiles(project, { engines: ['generic', 'godot', 'phaser', 'unity', 'aseprite', 'gdevelop'], baked: true })
  expect(exported.errors).toEqual([])
  expect(exported.entries.some((e) => e.name.includes('default'))).toBe(true)
})

test('"Add idle + walk" restores what creation used to make, at the old price', async () => {
  const { rec } = await create({ name: 'Default', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-default-moves' })
  const specs = baseMoveSpecs(rec.manifest, 7)
  expect(specs).toEqual([{ id: 'idle', action: 'idle', frames: 4, items: [], sharedItems: [], seed: 7 }, { id: 'walk', action: 'walk', frames: 8, items: [], sharedItems: [], seed: 7 }]) // the items it is priced for
  // Creation + idle + walk = the pre-Default-first creation estimate (35.25 gens for Top-down 4).
  expect(estimate(4).gens + specs.reduce((n, s) => n + moveEstimate(rec.manifest, s).gens, 0)).toBeCloseTo(35.25)
  const calls = specs.flatMap((s) => movePlan(rec, s))
  expect(calls.filter((c) => c.path === '/animate-with-skeleton-v3')).toHaveLength(3 * 2)
  expect(calls.filter((c) => c.path === '/characters/animations')).toHaveLength(3)
  expect(calls.filter((c) => c.path === '/estimate-skeleton')).toHaveLength(3 * (4 + 8 + 8))
  // the same request shapes creation sent: no unarmed suffix (poseStyle), raw seed + 101
  expect(calls.filter((c) => c.path === '/animate-with-skeleton-v3').map((c) => (c.body as { action: string; seed: number }))).toEqual([...Array(3).fill({ action: 'breathing idle' }), ...Array(3).fill({ action: 'walking' })].map((b) => expect.objectContaining({ ...b, seed: 108 })))
  // existing moves are not offered again
  rec.manifest.rig.animations.push({ id: 'idle', cells: 4, loop: true, frames: [] })
  expect(baseMoveSpecs(rec.manifest).map((s) => s.id)).toEqual(['walk'])
})

test('an item saved before idle and walk existed gets items-only poses for exactly the moves it lacks', async () => {
  const { rec } = await create({ name: 'Default', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-default-extend' })
  const m = rec.manifest, dirs = m.rig.directions.filter((d) => !d.mirrorOf).map((d) => d.id)
  const cells = (n: number) => Object.fromEntries(dirs.map((d) => [d, Array.from({ length: n }, () => 'x' as Sha256)]))
  m.rig.animations.push({ id: 'walk', cells: 8, loop: true, frames: [], sources: Object.fromEntries(dirs.map((d) => [d, { route: 'skeleton-v3', reference: 'r' as Sha256, keypoints: Array.from({ length: 8 }, () => points(0)), motion: 'managed-skeleton-v3:walking-8-frames' }])) })
  const cape = { id: 'cape', name: 'Cape', slot: 'back', status: 'accepted', route: 'skeleton-pose', key: 'green', dressed: {}, baseHash: m.rig.baseHash, layers: [{ cells: { default: cells(1) } }] }
  m.items.push(cape as never)
  const base = m.items.find((i) => i.id === m.rig.baseItem)!.layers[0]
  base.cells = { ...base.cells, walk: { ...cells(8), [dirs[0]]: [] } } // the body lacks walk facing the first direction
  // the Default move (standing views) is never re-posed; walk is, with this item only, where the body has frames
  expect(missingItemMoves(m, 'cape', 9)).toEqual([{ id: 'walk', frames: 8, items: ['cape'], dirs: dirs.slice(1), itemsOnly: true, seed: 9 }])
  cape.layers[0].cells = { default: cells(1), walk: cells(8) } as never
  expect(missingItemMoves(m, 'cape', 9)).toEqual([])
  expect(missingItemMoves(m, 'no-such-item', 9)).toEqual([])
  // without stored keypoints (e.g. a demo copy), nothing can be posed, so nothing is offered
  cape.layers[0].cells = { default: cells(1) } as never
  for (const src of Object.values(m.rig.animations.find((a) => a.id === 'walk')!.sources!)) src!.keypoints = []
  expect(missingItemMoves(m, 'cape', 9)).toEqual([])
})

// ---------- characters saved before Default ----------
/** A Default-first character turned into what older versions saved: `standing` = the import's standing move name, else the
 * created kind (rig.rest only, an idle move). Items: an armor with dressed standing views (skeleton-pose), an anchor item
 * without them, and one made for another body. Stored behind a fake updateCharacter and blob store. */
async function legacy(standing?: string) {
  const { rec, project } = await create({ name: 'Old', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-old' })
  const m = rec.manifest, rig = m.rig, base = m.items[0].layers[0], gen = ['south', 'east', 'north'] as DirectionName[]
  if (standing) {
    for (const a of rig.animations) a.id = standing
    base.cells = { [standing]: base.cells!.default }
    for (const t of Object.values(rig.anchors!)) { t![standing] = t!.default; delete t!.default }
    rec.skeletons = Object.fromEntries(Object.entries(rec.skeletons!).map(([k, v]) => [k.replace('default/', `${standing}/`), v]))
    // an animation of the ZIP's own called default (not the standing views)
    rig.animations.push({ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }], sources: Object.fromEntries(gen.map((d) => [d, { route: 'import', reference: rig.rest![d]!.image, keypoints: [points(1)], motion: 'estimated:frozen-import', provenance: [] }])) })
    base.cells.default = Object.fromEntries(rig.directions.map((d) => [d.id, [base.cells![standing][d.id]![0]]]))
  } else {
    rig.animations = [{ id: 'idle', cells: 2, loop: true, frames: [{ cell: 0, ms: 150 }, { cell: 1, ms: 150 }], sources: Object.fromEntries(gen.map((d) => [d, { route: 'skeleton-v3', reference: rig.rest![d]!.image, keypoints: [points(0), points(1)], motion: 'authored:idle', provenance: [] }])) }]
    base.cells = { idle: Object.fromEntries(Object.entries(base.cells!.default).map(([d, c]) => [d, [c![0], c![0]]])) }
    delete rig.anchors
    rec.skeletons = {}
  }
  const hashes = Object.fromEntries(cellKeys(rig).map((k) => { const [a, d, i] = k.split('/'); return [k, base.cells![a][d as DirectionName]![+i]!] })) as Record<string, Sha256>
  rig.baseHash = m.items[0].baseHash = await baseHashOf(rig, hashes)
  const blobs = new Map<string, Blob>(), dressed: Partial<Record<DirectionName, Sha256>> = {}
  for (const d of gen) {
    const im = toChroma(project.images.get(rig.rest![d]!.image)!, 'green')
    for (let y = 28; y < 36; y++) for (let x = 18; x < 28; x++) im.data.set([120, 120, 130, 255], (y * im.w + x) * 4) // an armor band
    const h = dressed[d] = await cellHash(im)
    blobs.set(h.slice(7), new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' }))
  }
  const first = rig.animations[0], item = (id: string, extra: object) => ({ id, name: id, slot: 'torso_outer', status: 'accepted', mirror: 'flip', materials: [], prompt: 'iron armor', provenance: [], baseHash: rig.baseHash,
    layers: [{ id: 'main', role: 'fg', z: 60, cells: { [first.id]: Object.fromEntries(gen.map((d) => [d, Array(first.cells).fill(null)])) } }], ...extra })
  m.items.push(item('armor', { route: 'skeleton-pose', key: 'green', dressed, coverage: gen.map((d) => `${first.id}/${d}/0`) }) as never, item('scarf', { route: 'ea2-anchor' }) as never, item('old', { baseHash: 'sha256:another-body' }) as never)
  let stored: StoredProject = structuredClone(rec), saves = 0
  vi.spyOn(db, 'getBlob').mockImplementation(async (sha) => blobs.get(sha))
  vi.spyOn(db, 'updateCharacter').mockImplementation(async (_id, added, fn) => { saves++; for (const [h, b] of added) blobs.set(h, b); stored = (fn as (r: StoredProject) => StoredProject)(structuredClone(stored)) })
  return { project: { manifest: structuredClone(m), images: new Map(project.images) } as Project, oldHash: rig.baseHash, stored: () => stored, saves: () => saves }
}
const southDefault = (p: Project, items: Record<string, string>) => { const a = buildPresentation(p); return renderPresentation(a, items, resolvePreview(a, { clip: 'default', direction: 'south' })) }

test('a created character saved before Default gains it from its standing views, items rebased with Default cells, once', async () => {
  const { project, oldHash, stored, saves } = await legacy(), m = project.manifest, rig = m.rig
  expect(needsDefault(m)).toBe(true)
  await upgradeDefault('rig-old', project)
  expect(rig.animations.map((a) => a.id)).toEqual(['default', 'idle'])
  const base = m.items[0].layers[0].cells!
  for (const d of ['south', 'east', 'north'] as const) expect(base.default[d]).toEqual([rig.rest![d]!.image])
  expect(project.images.get(base.default.west![0]!)!.data).toEqual(flipH(project.images.get(rig.rest!.east!.image)!).data)
  expect(planItem(rig, { ...coverage({ rec: { manifest: m } } as RigCtx), method: 'skel', key: 'green', slot: 'back' }).flatMap((c) => c.cells).filter((k) => k.startsWith('default/'))).toEqual([]) // imported-rest: never posed
  expect(rig.baseHash).not.toBe(oldHash)
  expect(m.items.map((i) => [i.id, i.baseHash === rig.baseHash])).toEqual([['base', true], ['armor', true], ['scarf', true], ['old', false]]) // never "made for another body"
  const armor = m.items.find((i) => i.id === 'armor')!
  for (const d of ['south', 'east', 'north'] as const) expect(armor.layers[0].cells!.default[d]).toHaveLength(1)
  expect(armor.layers[0].cells!.default.south![0]).not.toBeNull()
  expect(armor.coverage).toContain('default/south/0')
  expect(southDefault(project, { torso_outer: 'armor' }).hiddenItems).toEqual([])
  expect(southDefault(project, { torso_outer: 'scarf' }).hiddenItems.map((i) => i.id)).toEqual(['scarf']) // no offline source: an honest gap
  expect(buildShareMedia(buildPresentation(project), { torso_outer: 'armor' }, 'default', ALL_DIRECTIONS, false).omitted).toEqual([])
  // the same upgrade is saved, with the Default joints, and the saved character stays rig-ready
  const rec = stored()
  expect({ rig: rec.manifest.rig, items: rec.manifest.items }).toEqual({ rig, items: m.items })
  expect(Object.keys(rec.skeletons!).filter((k) => k.startsWith('default/')).sort()).toEqual(['default/east/0', 'default/north/0', 'default/south/0', 'default/west/0'])
  expect(rigReady(rec)).toBe(true)
  // idempotent: nothing left to do, nothing saved again
  const before = JSON.stringify(m)
  await upgradeDefault('rig-old', project)
  expect([JSON.stringify(m), saves()]).toEqual([before, 1])
})

test('an imported character saved before Default has its standing move renamed, never duplicated', async () => {
  const { project, oldHash, stored } = await legacy('rest'), m = project.manifest
  for (const it of [m, stored().manifest].map((x) => x.items.find((i) => i.id === 'armor')!)) it.layers[0].cells!.rest = { south: ['sha256:dressed' as Sha256] } // made after setup: has a standing cell
  stored().rigQa = { clips: { 'rest/south': 'standing checks', 'default/south': 'zip default checks' } }
  expect(standingMove(m)?.id).toBe('rest')
  await upgradeDefault('rig-old', project)
  expect(m.rig.animations.map((a) => a.id)).toEqual(['default', 'default-copy']) // the ZIP's own "default" steps aside
  expect(m.rig.animations.filter((a) => a.sources?.south?.motion === 'imported-rest')).toHaveLength(1)
  // setup's imported-rest sources travel with the rename, so items and fits never pose or price Default cells
  expect(['south', 'east', 'north'].map((d) => m.rig.animations[0].sources![d as DirectionName]!.motion)).toEqual(Array(3).fill('imported-rest'))
  expect(planItem(m.rig, { ...coverage({ rec: { manifest: m } } as RigCtx), method: 'skel', key: 'green', slot: 'back' }).flatMap((c) => c.cells).filter((k) => k.startsWith('default/'))).toEqual([])
  expect(JSON.stringify(m.items)).not.toMatch(/"rest"|"rest\//)
  const armor = m.items.find((i) => i.id === 'armor')!
  expect(armor.layers[0].cells!.default.south).toEqual(['sha256:dressed']) // kept, not re-extracted
  expect(armor.layers[0].cells!.default.east).toHaveLength(1) // filled from its dressed view
  expect(armor.coverage).toEqual(['default/south/0', 'default/east/0', 'default/north/0'])
  expect(m.items.filter((i) => i.baseHash !== m.rig.baseHash).map((i) => i.id)).toEqual(['old']) // a rename keeps the cell order: oldHash stays valid
  expect(m.rig.baseHash).toBe(oldHash)
  expect(Object.keys(stored().skeletons!).filter((k) => !k.startsWith('default/'))).toEqual([])
  expect(stored().rigQa).toEqual({ clips: { 'default/south': 'standing checks', 'default-copy/south': 'zip default checks' } })
  expect(needsDefault(stored().manifest)).toBe(false)
})

test('an import saved before Default and before rig setup is upgraded by its first standing move', async () => {
  const { project } = await create({ name: 'Zip', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-zip' }), m = project.manifest
  delete m.rig.rest
  delete m.rig.animations[0].sources
  m.rig.animations[0].id = 'rest-pose'
  m.items[0].layers[0].cells = { 'rest-pose': m.items[0].layers[0].cells!.default }
  expect(needsDefault(m)).toBe(true)
  const update = vi.spyOn(db, 'updateCharacter')
  await upgradeDefault('fixture:zip', project) // a fixture changes in memory only
  expect([m.rig.animations.map((a) => a.id), Object.keys(m.items[0].layers[0].cells!)]).toEqual([['default'], ['default']])
  expect(needsDefault(m)).toBe(false)
  expect(update).not.toHaveBeenCalled()
})

test('a character that already has Default, or has no standing views at all, is left alone', async () => {
  const { rec, project } = await create({ name: 'New', description: 'body', size: 48, seed: 7, dirs: 4, projectId: 'rig-new' })
  const update = vi.spyOn(db, 'updateCharacter'), before = JSON.stringify(project.manifest)
  expect(needsDefault(rec.manifest)).toBe(false)
  await upgradeDefault('rig-new', project)
  expect(JSON.stringify(project.manifest)).toBe(before)
  expect(update).not.toHaveBeenCalled()
  delete rec.manifest.rig.rest
  delete rec.manifest.rig.animations[0].sources
  rec.manifest.rig.animations[0].id = 'walk'
  expect(needsDefault(rec.manifest)).toBe(false) // like the demo: nothing standing to make Default from
})

test('Default is a reserved move name', () => {
  expect(reservedMove('default')).toMatch(/Default is the standing pose/)
  expect(reservedMove('dance')).toBe('')
})
