import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { StoredProject } from '../../src/lib/store/project.ts'
import type { Keypoint } from '../../src/lib/rig/rig.ts'
import type { Req } from '../../src/lib/pixellab/routes.ts'

const state = vi.hoisted(() => ({
  projects: new Map<string, StoredProject>(), blobs: new Map<string, Blob>(), requests: [] as Req[],
  estimate: [] as Keypoint[], motionHash: '', motionFrames: 3,
}))
vi.mock('../../src/lib/store/db.ts', () => ({
  get: async (_store: string, id: string) => structuredClone(state.projects.get(id)),
  getBlob: async (id: string) => state.blobs.get(id),
  put: async (store: string, id: string, value: unknown) => {
    if (store === 'blobs') state.blobs.set(id, value as Blob)
    else state.projects.set(id, structuredClone(value as StoredProject))
  },
  updateCharacter: async (id: string, blobs: Map<string, Blob>, update: (record: StoredProject | undefined) => StoredProject) => {
    const record = update(structuredClone(state.projects.get(id)))
    for (const [hash, blob] of blobs) state.blobs.set(hash, blob)
    state.projects.set(id, structuredClone(record))
  },
}))
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
  live: () => false,
  queue: {
    subscribe: (fn: (snapshot: { jobs: unknown[] }) => void) => { fn({ jobs: [] }); return () => {} },
    enqueue: async (request: Req) => {
      state.requests.push(structuredClone(request))
      // Stop at the real raw-render request boundary. No renderer or network is involved.
      if (request.path === '/animate-with-skeleton-v3') throw new Error('Captured aligned raw request')
      const response = request.path === '/estimate-skeleton' ? { keypoints: state.estimate }
        : request.path === '/create-character-v3' ? { character_id: 'new-local-registration' } : { directions: ['south'] }
      return {
        id: `offline-${state.requests.length}`, state: 'done', endpoint: request.path, params: request.body,
        requestHash: 'a'.repeat(64), createdAt: 0, gens: 0, usd: 0, response,
        jobs: request.path === '/characters/animations'
          ? [{ results: Array.from({ length: state.motionFrames }, (_, i) => ({ label: `${i}`, sha: state.motionHash })) }]
          : [],
      }
    },
  },
}))

import { addMove } from '../../src/studio/create.ts'
import { setupCharacter } from '../../src/studio/setup.ts'
import { equipmentFixture, bodyOnly } from './equipment-fixture.ts'
import { makeImg } from '../../src/lib/image/png.ts'
import { encodePngBytes } from '../../src/lib/image/pngraw.ts'
import { cellHash } from '../../src/lib/rig/rig.ts'
import { LABELS, authoredPoses, fromApi, toApi } from '../../src/lib/rig/poses.ts'

const points = (y: number): Keypoint[] => LABELS.map(label => ({ label, x: 0.5, y }))

beforeEach(async () => {
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Network is forbidden in offline alignment tests') }))
  state.projects.clear(); state.blobs.clear(); state.requests = []; state.estimate = points(0.5); state.motionFrames = 3
  const project = bodyOnly(await equipmentFixture()), m = project.manifest, rig = m.rig
  const image = makeImg(64, 64)
  for (let y = 12; y < 55; y++) for (let x = 25; x < 35; x++) image.data.set([180, 120, 90, 255], (y * 64 + x) * 4)
  const hash = await cellHash(image), png = new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
  state.motionHash = hash.slice(7); state.blobs.set(hash.slice(7), png)
  m.items[0].layers[0].cells = { rest: { south: [hash] } }
  const local = points(0.5625)
  rig.rest = Object.fromEntries(['south', 'east', 'north', 'west'].map(dir => [dir, { image: hash, keypoints: local }]))
  rig.animations[0].sources = { south: { route: 'import', reference: hash, keypoints: [local], provenance: [] } }
  state.projects.set('rig-aligned', {
    id: 'rig-aligned', savedAt: '', manifest: m,
    character: { id: 'original-server-registration', looks: 'A humanoid', motionOffsets: { south: 4 } },
  })
})

afterEach(() => {
  try { expect(fetch).not.toHaveBeenCalled() } finally { vi.unstubAllGlobals() }
})

type RawBody = { first_frame_keypoints: Keypoint[]; keypoints: Keypoint[][] }
const raw = () => state.requests.find(request => request.path === '/animate-with-skeleton-v3')!.body as RawBody

test.each(['walk', undefined])('actual Add move shifts %s managed motion once into local coordinates', async action => {
  state.motionFrames = action === 'walk' ? 8 : 3
  await expect(addMove('rig-aligned', { id: 'new', action, text: 'a small dance', frames: 3, items: [], seed: 1 }))
    .rejects.toThrow('Captured aligned raw request')
  const managed = state.requests.find(request => request.path === '/characters/animations')!.body as { character_id: string; mode: string }
  expect(managed.character_id).toBe('original-server-registration')
  expect(managed.mode).toBe(action === 'walk' ? 'skeleton-v3' : 'pixminimax')
  expect(raw().keypoints).toEqual(Array.from({ length: state.motionFrames }, () => points(0.5625)))
  expect(raw().first_frame_keypoints).toEqual(points(0.5625))
  // The estimator's historical server observation must stay untouched.
  expect(state.estimate).toEqual(points(0.5))
})

test('actual authored Add move uses already aligned rest without adding managed offset again', async () => {
  const record = state.projects.get('rig-aligned')!, rig = record.manifest.rig
  const expected = authoredPoses('slash', fromApi(points(0.5625), rig.cell), 'south', rig.cell.w).map(pose => toApi(pose, rig.cell))
  await expect(addMove('rig-aligned', { id: 'slash', action: 'slash', frames: expected.length, items: [], seed: 1 }))
    .rejects.toThrow('Captured aligned raw request')
  expect(state.requests.map(request => request.path)).toEqual(['/animate-with-skeleton-v3'])
  expect(raw().keypoints).toEqual(expected)
  expect(raw().first_frame_keypoints).toEqual(points(0.5625))
})

test('actual setup re-registration discards old server-motion offsets before future moves', async () => {
  state.estimate = points(0.5625)
  const record = state.projects.get('rig-aligned')!
  await setupCharacter({ projectId: record.id, baseHash: record.manifest.rig.baseHash, restAnim: 'rest', looks: 'A local aligned humanoid', seed: 1 }, () => {})
  expect(state.projects.get(record.id)!.character).toEqual({ id: 'new-local-registration', looks: 'A local aligned humanoid' })
  state.requests = []
  await expect(addMove(record.id, { id: 'dance', text: 'a small dance', frames: 3, items: [], seed: 2 }))
    .rejects.toThrow('Captured aligned raw request')
  expect((state.requests.find(request => request.path === '/characters/animations')!.body as { character_id: string }).character_id).toBe('new-local-registration')
  expect(raw().keypoints).toEqual(Array.from({ length: 3 }, () => points(0.5625)))
})
