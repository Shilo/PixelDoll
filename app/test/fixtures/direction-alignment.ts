// Browser-compatible synthetic fixture shared by zero-credit unit and UI alignment checks.
import { makeImg, type Img } from '../../src/lib/image/png.ts'
import { baseHashOf, cellHash, cellKey, ANCHORS, type Keypoint, type Sha256 } from '../../src/lib/rig/rig.ts'
import { LABELS, fromApi } from '../../src/lib/rig/poses.ts'
import { flipH } from '../../src/lib/rig/mirror.ts'
import { restStamp } from '../../src/lib/equipment/design.ts'
import { targetStamp } from '../../src/lib/equipment/copy.ts'
import { targetAudit } from '../../src/lib/equipment/compatibility.ts'
import type { Item, Layer, Manifest, Project } from '../../src/lib/store/manifest.ts'
import type { StoredProject } from '../../src/lib/store/project.ts'
export const H = `sha256:${'1'.repeat(64)}` as Sha256
export const box = (size: number, bottom: number, rgb = [120, 80, 60], x = 28, height = 30): Img => {
  const im = makeImg(size, size)
  for (let y = bottom - height; y < bottom; y++) for (let col = x; col < x + 6; col++) im.data.set([...rgb, 255], (y * size + col) * 4)
  return im
}
export const points = (ground: number): Keypoint[] => LABELS.map((label, i) => ({ label, x: (29 + i % 4) / 64, y: (ground - 28 + i) / 64 }))
export async function makeAlignmentFixture(mirror = false) {
  const images = new Map<string, Img>(), skeletons: NonNullable<StoredProject['skeletons']> = {}
  const save = async (im: Img) => { const h = await cellHash(im); images.set(h, im); return h }
  const layer = (): Layer => ({ id: 'main', role: 'fg', z: 10, cells: {} })
  const base: Item = { id: 'base', name: 'Body', slot: 'body', status: 'accepted', mirror: 'flip', materials: [], prompt: '', layers: [layer()], baseHash: H, provenance: [] }
  const gear: Item = { ...structuredClone(base), id: 'gear', name: 'Gear', slot: 'head', layers: [
    { ...layer(), z: 60 }, { ...layer(), id: 'bg', role: 'bg', z: 4, cell: { w: 96, h: 96 }, pivot: { x: 48, y: 76 } },
  ], dressed: {}, key: 'green', route: 'skeleton-pose', coverage: [] }
  const m: Manifest = { format: 'pixeldoll/2', name: 'Alignment fixture', app: 'test', rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 60 }, baseItem: 'base', baseHash: H, view: 'low top-down', template: 'mannequin', directions: [{ id: 'south' }, { id: 'north' }, ...(mirror ? [{ id: 'east' as const }, { id: 'west' as const, mirrorOf: 'east' as const }] : [])], animations: [], rest: {}, anchors: {} }, materials: [], slots: [{ id: 'body', class: 'base', z: 10 }, { id: 'head', class: 'rigid', z: 60, anchor: 'head' }], items: [base, gear], presets: [{ id: 'default', name: 'Default', items: { body: 'base', head: 'gear' }, variants: {} }] }
  for (const dir of m.rig.directions) {
    const ground = dir.id === 'south' ? 60 : 55
    const body = box(64, ground), rest = dir.mirrorOf ? flipH(body) : body
    m.rig.rest![dir.id] = { image: await save(rest), keypoints: points(ground) }
    const dressed = box(64, ground, [0, 255, 0]); dressed.data.set([255, 0, 0, 255], ((ground - 31) * 64 + 30) * 4)
    gear.dressed![dir.id] = await save(dressed)
  }
  for (const [id, motion] of [['idle', [0, 0]], ['walk', [0, 1, -1]], ['jump', [-15, -20]]] as const) {
    const a: Manifest['rig']['animations'][number] = { id, cells: motion.length, loop: id !== 'jump', frames: motion.map((_, cell) => ({ cell, ms: 100 })), sources: {} }
    m.rig.animations.push(a)
    for (const dir of m.rig.directions) {
      const ground = dir.id === 'south' ? 60 : 55, poses = motion.map(dy => points(ground + dy))
      for (const l of [base.layers[0], ...gear.layers]) (l.cells![id] ??= {})[dir.id] = []
      for (const [i, dy] of motion.entries()) {
        const b = box(64, ground + dy)
        base.layers[0].cells![id][dir.id]!.push(await save(dir.mirrorOf ? flipH(b) : b))
        gear.layers[0].cells![id][dir.id]!.push(i === 1 ? null : await save(box(64, ground + dy - 30, [255, 0, 0], 28, 3)))
        gear.layers[1].cells![id][dir.id]!.push(await save(box(96, ground + dy + 16 - 12, [0, 0, 255], 44, 3)))
        const key = cellKey(id, dir.id, i); skeletons[key] = fromApi(poses[i], m.rig.cell); gear.coverage!.push(key as NonNullable<Item['coverage']>[number])
      }
      if (!dir.mirrorOf) a.sources![dir.id] = { route: 'skeleton-v3', reference: m.rig.rest![dir.id]!.image, keypoints: structuredClone(poses), measured: poses.map(pose => pose.map(p => ({ ...p, x: p.x + (id === 'walk' && dir.id === 'north' ? 3 / 64 : 0) }))), motion: id === 'idle' ? 'authored:idle' : 'managed-skeleton-v3:test', provenance: [] }
      for (const anchor of ANCHORS) (((m.rig.anchors![anchor] ??= {})[id] ??= {})[dir.id]) = motion.map(dy => [30, ground + dy - 10])
    }
  }
  const hashes = Object.fromEntries(m.rig.animations.flatMap(a => m.rig.directions.flatMap(d => Array.from({ length: a.cells }, (_, i) => [cellKey(a.id, d.id, i), base.layers[0].cells![a.id][d.id]![i]!]))))
  m.rig.baseHash = await baseHashOf(m.rig, hashes); base.baseHash = gear.baseHash = m.rig.baseHash
  const project: Project = { manifest: m, images }
  const snapshot = { kind: 'equipment-design' as const, format: 'pixeldoll-design/1' as const, id: 'equipment-design:test', revision: H, name: 'Gear source', slot: 'head', itemId: 'gear', createdAt: '2026-10-23', source: structuredClone(m), imageHashes: [...images.keys()] as Sha256[], variants: {}, warnings: [] }
  gear.design = { designId: snapshot.id, revision: H, snapshot, roleMaterials: {}, targetAudit: await targetAudit(project), targetStamp: targetStamp(m, 'head'), dressedStamp: restStamp(m) }
  const record: StoredProject = { id: 'rig-original', savedAt: '2026-10-23', origin: 'studio', manifest: m, skeletons, character: { id: 'server-character', looks: 'test' }, rigQa: { warnings: ['walk/north: arms 3 px off requested pose'], clips: { 'walk/north': { adherence: 3, fails: ['arms'] } } } }
  return { project, record }
}

