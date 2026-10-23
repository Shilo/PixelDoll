import { afterEach, expect, test, vi } from 'vitest';
import * as db from '../../src/lib/store/db.ts';
import { saveItem, type StoredProject } from '../../src/lib/store/project.ts';
import type { Item } from '../../src/lib/store/manifest.ts';
afterEach(() => vi.restoreAllMocks());
const item = (name: string): Item => ({ id: 'sword', name, slot: 'main_hand', status: 'accepted', mirror: 'generate', materials: [], layers: [], prompt: 'one sword', baseHash: 'sha256:body', provenance: [] });
function fixture(): StoredProject {
  return { id: 'rig-test', savedAt: 'before', manifest: { format: 'pixeldoll/1', app: 'test', name: 'Latest project name', rig: { cell: { w: 64, h: 64 }, pivot: { x: 32, y: 59 }, baseItem: 'base', baseHash: 'sha256:body', directions: [{ id: 'south' }], animations: [] }, slots: [{ id: 'main_hand', z: 150, class: 'held' }], materials: [], items: [item('Original sword')], presets: [{ id: 'new-outfit', name: 'Concurrent outfit edit', items: { main_hand: 'sword' }, variants: {} }] } };
}
test('item publication checks the latest transaction record before mutating any manifest field', async () => {
  const current = fixture(), before = structuredClone(current);
  vi.spyOn(db, 'updateCharacter').mockImplementation(async (_id, blobs, update) => { expect(blobs.size).toBe(0); update(current); });
  const guard = vi.fn((rec: StoredProject) => { expect(rec).toEqual(before); throw new Error('Body or item changed while fitting'); });
  await expect(saveItem(current.id, item('New generated sword'), new Map(), [], guard)).rejects.toThrow('Body or item changed');
  expect(guard).toHaveBeenCalledOnce();
  expect(current).toEqual(before);
});
test('guarded publication preserves unrelated latest outfit and name changes', async () => {
  const current = fixture(), outfit = structuredClone(current.manifest.presets);
  vi.spyOn(db, 'updateCharacter').mockImplementation(async (_id, _blobs, update) => { update(current); });
  const guard = vi.fn((rec: StoredProject) => { expect(rec.manifest.items[0].name).toBe('Original sword'); });
  await saveItem(current.id, item('New generated sword'), new Map(), [], guard);
  expect(guard).toHaveBeenCalledOnce();
  expect(current.manifest.items[0].name).toBe('New generated sword');
  expect(current.manifest.presets).toEqual(outfit);
  expect(current.manifest.name).toBe('Latest project name');
});
test('a deleted project cannot pass the optional publication guard or be recreated', async () => {
  vi.spyOn(db, 'updateCharacter').mockImplementation(async (_id, _blobs, update) => { update(undefined); });
  const guard = vi.fn();
  await expect(saveItem('deleted', item('New generated sword'), new Map(), [], guard)).rejects.toThrow('project deleted not found');
  expect(guard).not.toHaveBeenCalled();
});
