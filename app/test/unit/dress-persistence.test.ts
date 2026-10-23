import { expect, test, vi } from 'vitest'
import type { Manifest } from '../../src/lib/store/manifest.ts'
import { saveDress, saveSplit } from '../../src/lib/dress/project.ts'
import { deleteItem, type StoredProject } from '../../src/lib/store/project.ts'

const { records } = vi.hoisted(() => ({ records: new Map<string, unknown>() }))
vi.mock('../../src/lib/store/db.ts', () => ({
  updateCharacter: async (key: string, _blobs: unknown, fn: (r: unknown) => unknown) => {
    const next = fn(structuredClone(records.get(key))); records.set(key, next); return next
  },
  update: async (_store: string, key: string, fn: (r: unknown) => unknown) => {
    const next = fn(structuredClone(records.get(key))); records.set(key, next); return next
  },
}))

function record() {
  const material = (owner: string) => ({ id: `${owner}_1`, owner, label: 'Cloth', ramp: ['#112233'], variants: {} })
  return { id: 'rig-test', manifest: { items: [{ id: 'base', materials: ['base_1'] }, { id: 'hat', materials: ['hat_1'] }],
    materials: [material('base'), material('hat')], slots: [{ id: 'head' }], rig: { baseItem: 'base' },
    presets: [{ id: 'look', items: { body: 'base', head: 'hat' }, variants: { hat_1: 'gold' } }],
  }, dress: { current: { items: { head: 'hat' }, variants: { hat_1: 'gold' } } } } as unknown as StoredProject & { dress: { current: { items: Record<string, string | null>; variants: Record<string, string> } } }
}

test('a delayed autosave preserves materials introduced by an accepted generation', async () => {
  const live = record(), snapshot = structuredClone(live.manifest)
  snapshot.items = snapshot.items.filter((it) => it.id !== 'hat')
  snapshot.materials = snapshot.materials.filter((mat) => mat.owner !== 'hat')
  records.set(live.id, live)
  await saveDress(live.id, snapshot, { items: { body: 'base' }, variants: {} })
  const saved = records.get(live.id) as StoredProject
  expect(saved.manifest.materials.some((mat) => mat.id === 'hat_1')).toBe(true)
  expect(saved.manifest.items.find((it) => it.id === 'hat')!.materials).toEqual(['hat_1'])
})

test('deleting equipment cleans current and saved outfits, and stale autosaves cannot revive references', async () => {
  const live = record(), stale = structuredClone(live.manifest)
  records.set(live.id, live)
  await deleteItem(live.id, 'hat')
  let saved = records.get(live.id) as ReturnType<typeof record>
  expect(saved.manifest.items.map((it) => it.id)).toEqual(['base'])
  expect(saved.manifest.materials.map((mat) => mat.id)).toEqual(['base_1'])
  expect(saved.manifest.presets[0].items.head).toBeNull()
  expect(saved.dress.current.items.head).toBeNull()
  expect(saved.dress.current.variants).toEqual({})
  await saveDress(live.id, stale as Manifest, { items: { head: 'hat' }, variants: { hat_1: 'gold' } })
  saved = records.get(live.id) as ReturnType<typeof record>
  expect(saved.manifest.presets[0].items.head).toBeNull()
  expect(saved.dress.current.items.head).toBeNull()
  expect(saved.manifest.materials.map((mat) => mat.id)).toEqual(['base_1'])
  expect(saved.dress.current.variants).toEqual({})
})


test('region preparation cannot overwrite a newer frozen base, and metadata-only splits still persist', async () => {
  const live = record(), incoming = structuredClone(live.manifest)
  live.manifest.rig.baseHash = 'sha256:newer'
  incoming.rig.baseHash = 'sha256:split'
  records.set(live.id, live)
  await expect(saveSplit(live.id, incoming, { oldHash: 'sha256:old', images: new Map() })).rejects.toThrow('changed while preparing')
  expect((records.get(live.id) as StoredProject).manifest.rig.baseHash).toBe('sha256:newer')
  incoming.rig.baseHash = 'sha256:newer'
  incoming.items[0].regions = 'shirt-shorts'
  await saveSplit(live.id, incoming, { oldHash: 'sha256:newer', images: new Map() })
  expect((records.get(live.id) as StoredProject).manifest.items[0].regions).toBe('shirt-shorts')
})

test('legitimate colour-region preparation advances only the exact current body publication receipt', async () => {
  const { stableStringify } = await import('../../src/lib/image/hash.ts')
  const live = record(); live.manifest.rig.baseHash = 'sha256:before'; live.character = { id: 'managed', looks: 'body' }
  live.moveRecovery = { id: 'consent', originalRigVersion: 'original', bodyRigVersion: stableStringify({ rig: live.manifest.rig, character: live.character }), specHash: 'exact-spec' }
  const incoming = structuredClone(live.manifest); incoming.rig.baseHash = 'sha256:regions'; incoming.items[0].regions = 'shirt-shorts'
  records.set(live.id, live)
  await saveSplit(live.id, incoming, { oldHash: 'sha256:before', images: new Map() })
  const next = records.get(live.id) as StoredProject
  expect(next.moveRecovery).toEqual({ ...live.moveRecovery, bodyRigVersion: stableStringify({ rig: next.manifest.rig, character: next.character }) })
  expect(next.moveRecovery?.bodyRigVersion).not.toBe(live.moveRecovery.bodyRigVersion)
})
test('a stale body receipt cannot be blessed by a later colour-region split', async () => {
  const { stableStringify } = await import('../../src/lib/image/hash.ts')
  const live = record(); live.manifest.rig.baseHash = 'sha256:before'
  live.moveRecovery = { id: 'consent', originalRigVersion: 'original', bodyRigVersion: stableStringify({ rig: live.manifest.rig, character: live.character }), specHash: 'exact-spec' }
  const receipt = structuredClone(live.moveRecovery)
  live.manifest.rig.rest = { south: { image: 'sha256:changed-reference', keypoints: [] } }
  const incoming = structuredClone(live.manifest); incoming.rig.baseHash = 'sha256:regions'; incoming.items[0].regions = 'shirt-shorts'
  records.set(live.id, live)
  await saveSplit(live.id, incoming, { oldHash: 'sha256:before', images: new Map() })
  const next = records.get(live.id) as StoredProject
  expect(next.moveRecovery).toEqual(receipt)
  expect(next.moveRecovery?.bodyRigVersion).not.toBe(stableStringify({ rig: next.manifest.rig, character: next.character }))
})


test('a delayed snapshot retains newly fitted current equipment and its independent colour variant', async () => {
  const live = record(), snapshot = structuredClone(live.manifest)
  snapshot.items = snapshot.items.filter(it => it.id !== 'hat')
  snapshot.materials = snapshot.materials.filter(mat => mat.owner !== 'hat')
  records.set(live.id, live)
  await saveDress(live.id, snapshot, { items: { body: 'base', head: null }, variants: {} })
  const saved = records.get(live.id) as ReturnType<typeof record>
  expect(saved.dress.current.items.head).toBe('hat')
  expect(saved.dress.current.variants).toEqual({ hat_1: 'gold' })
  expect(saved.manifest.items.find(it => it.id === 'hat')!.materials).toEqual(['hat_1'])
})

test('covered items can still be deliberately unequipped and stale links to deleted materials stay removed', async () => {
  const live = record(), snapshot = structuredClone(live.manifest)
  records.set(live.id, live)
  await saveDress(live.id, snapshot, { items: { head: null }, variants: {} })
  let saved = records.get(live.id) as ReturnType<typeof record>
  expect(saved.dress.current.items.head).toBeNull(); expect(saved.dress.current.variants).toEqual({})
  snapshot.materials[0].linkTo = 'hat_1'
  await deleteItem(live.id, 'hat')
  await saveDress(live.id, snapshot, { items: { head: 'hat' }, variants: { hat_1: 'gold' } })
  saved = records.get(live.id) as ReturnType<typeof record>
  expect(saved.manifest.materials[0].linkTo).toBeUndefined()
  expect(saved.dress.current.items.head).toBeNull(); expect(saved.dress.current.variants).toEqual({})
})
