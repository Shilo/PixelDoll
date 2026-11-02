import { beforeEach, expect, test, vi } from 'vitest';
import type { Item, ItemQa, Manifest } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { slotOf } from '../../src/lib/items/items.ts';
import { acceptItemReview } from '../../src/lib/items/run.ts';

const state = vi.hoisted(() => ({ record: null as StoredProject | null, saved: null as Item | null, changedAtSave: false, imageWrites: -1, enqueue: vi.fn() }));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({ queue: { subscribe: (cb: (s: { jobs: [] }) => void) => { cb({ jobs: [] }); return () => {}; }, enqueue: state.enqueue } }));
vi.mock('../../src/lib/store/project.ts', () => ({
  loadProject: async () => ({ rec: structuredClone(state.record!), project: { manifest: structuredClone(state.record!.manifest), images: new Map() } }),
  saveItem: async (_id: string, item: Item, images: Map<string, unknown>, _slots: unknown, check: (rec: StoredProject) => void) => {
    if (state.changedAtSave) state.record!.manifest.items[0].qa!.maxPaletteDist++;
    check(state.record!); state.saved = structuredClone(item); state.imageWrites = images.size;
  },
}));

function artwork(): Item {
  const summary = { minKeyKept: 1, maxKeyOutside: 0, minAreaRatio: 0.3, maxAreaCV: 0.2, maxPaletteDist: 0, clipPx: 0, footwearReviewFrames: 1, status: 'warn' as const };
  const qa: ItemQa = { ...summary, rerolls: 0, cells: {}, clips: { 'walk/south': { ...summary } } };
  return { id: 'hat', name: 'Hat', slot: 'head', prompt: 'a hat', status: 'accepted', mirror: 'generate', baseHash: 'sha256:body', materials: [], provenance: [], designWarnings: ['D1 reviewable appearance'], qa,
    layers: [{ id: 'main', role: 'fg', z: 100, cells: { walk: { south: ['sha256:art'] } } }] };
}
beforeEach(() => {
  const item = artwork();
  const manifest: Manifest = { format: 'pixeldoll/2', app: 'test', name: 'Test', items: [item], materials: [], slots: [slotOf('head')], presets: [],
    rig: { baseItem: 'base', baseHash: item.baseHash, cell: { w: 64, h: 64 }, pivot: { x: 32, y: 63 }, directions: [{ id: 'south' }], animations: [] } };
  state.record = { id: 'character', savedAt: '', manifest }; state.saved = null; state.changedAtSave = false; state.imageWrites = -1; state.enqueue.mockClear();
});

test('explicit acceptance acknowledges checks while preserving all artwork and warning evidence, with no API call', async () => {
  const reviewed = structuredClone(state.record!.manifest.items[0]);
  await acceptItemReview('character', reviewed.id, reviewed);
  expect(state.enqueue).not.toHaveBeenCalled(); expect(state.imageWrites).toBe(0);
  expect(state.saved!.qa!.status).toBe('accepted'); expect(state.saved!.qa!.clips!['walk/south'].status).toBe('accepted');
  expect(state.saved!.layers).toEqual(reviewed.layers); expect(state.saved!.designWarnings).toEqual(reviewed.designWarnings);
  expect(state.saved!.qa!.footwearReviewFrames).toBe(1); expect(state.saved!.qa!.minAreaRatio).toBe(0.3);
  expect(state.saved!.provenance).toEqual(reviewed.provenance); expect(reviewed.qa!.status).toBe('warn');
});

test.each(['item', 'body', 'missing'] as const)('a stale %s cannot be accepted from an older review', async change => {
  const reviewed = structuredClone(state.record!.manifest.items[0]);
  if (change === 'item') state.record!.manifest.items[0].qa!.maxPaletteDist++;
  if (change === 'body') state.record!.manifest.rig.baseHash = 'sha256:changed';
  if (change === 'missing') state.record!.manifest.items.splice(0);
  await expect(acceptItemReview('character', reviewed.id, reviewed)).rejects.toThrow('changed');
  expect(state.saved).toBeNull(); expect(state.enqueue).not.toHaveBeenCalled();
});

test('an edit racing the atomic save cannot accept a newer set of warnings', async () => {
  const reviewed = structuredClone(state.record!.manifest.items[0]); state.changedAtSave = true;
  await expect(acceptItemReview('character', reviewed.id, reviewed)).rejects.toThrow('changed');
  expect(state.saved).toBeNull(); expect(state.imageWrites).toBe(-1); expect(state.enqueue).not.toHaveBeenCalled();
});
