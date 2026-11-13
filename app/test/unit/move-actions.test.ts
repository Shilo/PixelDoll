import { beforeEach, expect, test, vi } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import { moveDeletionBlocked, removeMove } from '../../src/studio/moveActions.svelte.ts';
import {
	doc,
	store,
	gens,
	deletionBlocked,
	flushSave,
	openProject
} from '../../src/studio/state.svelte.ts';
import * as db from '../../src/lib/store/db.ts';

vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: { id: 'project' },
	store: { project: null },
	gens: [],
	deletionBlocked: vi.fn(() => ''),
	flushSave: vi.fn(),
	openProject: vi.fn(),
	toast: vi.fn()
}));
vi.mock('../../src/lib/store/db.ts', () => ({ get: vi.fn(), update: vi.fn() }));

let record: StoredProject;
beforeEach(async () => {
	vi.clearAllMocks();
	vi.mocked(deletionBlocked).mockReturnValue('');
	vi.mocked(flushSave).mockResolvedValue(undefined);
	const project = await equipmentFixture();
	project.manifest.rig.animations.push({ ...project.manifest.rig.animations[0], id: 'walk' });
	for (const item of project.manifest.items)
		item.layers[0].cells!.walk = structuredClone(item.layers[0].cells!.rest);
	doc.id = 'project';
	store.project = project;
	gens.length = 0;
	record = {
		id: doc.id,
		savedAt: '',
		origin: 'studio',
		manifest: structuredClone(project.manifest),
		skeletons: { 'rest/south/0': {}, 'walk/south/0': {} },
		rigQa: { clips: { 'rest/south': {}, 'walk/south': {} } }
	};
	vi.mocked(db.get).mockImplementation(async () => structuredClone(record));
	vi.mocked(db.update).mockImplementation(async (_store, _id, update) => {
		record = update(record) as StoredProject;
		return record;
	});
});

test('removing a move saves rebased tracks and metadata, then reloads the selected character', async () => {
	const oldHash = record.manifest.rig.baseHash;
	await removeMove('walk');
	expect(record.manifest.rig.animations.map((move) => move.id)).toEqual(['rest']);
	expect(record.manifest.rig.baseHash).not.toBe(oldHash);
	expect(
		record.manifest.items.every((item) => item.baseHash === record.manifest.rig.baseHash)
	).toBe(true);
	expect(record.manifest.items.every((item) => !item.layers[0].cells!.walk)).toBe(true);
	expect(record.rigQa).toEqual({ clips: { 'rest/south': {} } });
	expect(Object.keys(record.skeletons!)).toEqual(['rest/south/0']);
	expect(record.savedAt).not.toBe('');
	expect(openProject).toHaveBeenCalledWith('project');
});

test('move deletion protects the final move, demo, dependent standing designs, and paid drafts', async () => {
	store.project!.manifest.rig.animations = store.project!.manifest.rig.animations.slice(0, 1);
	expect(moveDeletionBlocked('rest')).toMatch('at least one move');
	store.project!.manifest.rig.animations.push({
		...store.project!.manifest.rig.animations[0],
		id: 'walk'
	});
	doc.id = 'fixture:s2';
	expect(moveDeletionBlocked('walk')).toMatch('Demo moves');
	doc.id = 'project';
	store.project!.manifest.items[1].standing = 'walk';
	expect(moveDeletionBlocked('walk')).toMatch('standing move');
	delete store.project!.manifest.items[1].standing;
	store.project!.manifest.items[1].route = 'ea2-anchor';
	store.project!.manifest.items[1].anchorCell = 'walk/south/0';
	expect(moveDeletionBlocked('walk')).toMatch('standing move');
	delete store.project!.manifest.items[1].anchorCell;
	gens.push({ phase: 'review', draft: { rigId: 'project' } } as (typeof gens)[number]);
	await expect(removeMove('walk')).rejects.toThrow('item drafts');
	expect(db.update).not.toHaveBeenCalled();
});

test('move deletion preserves Default even before any items need its standing reference', async () => {
	store.project!.manifest.rig.animations.push({
		...store.project!.manifest.rig.animations[0],
		id: 'default'
	});
	expect(moveDeletionBlocked('default')).toMatch('standing views');
	await expect(removeMove('default')).rejects.toThrow('standing views');
	expect(db.update).not.toHaveBeenCalled();
});

test('move deletion rechecks blockers and refuses concurrent record edits without overwriting them', async () => {
	vi.mocked(flushSave).mockImplementationOnce(async () => {
		vi.mocked(deletionBlocked).mockReturnValue('Pending generation work');
	});
	await expect(removeMove('walk')).rejects.toThrow('Pending generation work');
	expect(record.manifest.rig.animations).toHaveLength(2);
	vi.mocked(deletionBlocked).mockReturnValue('');
	vi.mocked(db.update).mockImplementationOnce(async (_store, _id, update) => {
		record.manifest.name = 'Newer name';
		return update(record);
	});
	await expect(removeMove('walk')).rejects.toThrow('changed before');
	expect(record.manifest.name).toBe('Newer name');
	expect(record.manifest.rig.animations).toHaveLength(2);
	expect(openProject).not.toHaveBeenCalled();
});
