import { beforeEach, expect, test, vi } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import {
	KEEP_MS,
	MAX_ENTRIES,
	RECENTLY_DELETED_PREFIX,
	deletedEntry,
	draftCallIds,
	listEntries,
	pruneKeys,
	readEntry,
	restoreCharacter,
	restoreParts
} from '../../src/lib/store/recently-deleted.ts';
import { restoreRemoved, type DressedRecord } from '../../src/lib/store/project.ts';
import { retainMoveMetadata, retainMoves, restoreMove } from '../../src/lib/rig/moves.ts';
import { stableStringify } from '../../src/lib/image/hash.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import type { Preset, Sha256 } from '../../src/lib/store/manifest.ts';

// IndexedDB is a browser API: this stand-in keeps the saved records and artwork the Trash restores read and write.
const saved = vi.hoisted(() => ({
	projects: new Map<string, unknown>(),
	blobs: new Set<string>()
}));
vi.mock(import('../../src/lib/store/db.ts'), async (original) => ({
	...(await original()),
	get: async <T>(_store: string, key: string) =>
		structuredClone(saved.projects.get(key)) as T | undefined,
	readCharacters: async (hashes: readonly string[]) => ({
		records: new Map(),
		stored: new Set(hashes.filter((hash) => saved.blobs.has(hash)))
	}),
	async editIdleCharacter(
		_id: string,
		_action: string,
		edit: (
			projects: { delete(key: string): void; put(value: unknown, key: string): void },
			records: unknown[]
		) => void
	) {
		edit(
			{
				delete: (key) => saved.projects.delete(key),
				put: (value, key) => saved.projects.set(key, structuredClone(value))
			},
			[...saved.projects.values()].map((value) => structuredClone(value))
		);
	},
	async update<T>(
		_store: string,
		key: string,
		fn: (value: T | undefined, related: <R>(key: string) => R | undefined) => T,
		relatedKeys: readonly string[] = [],
		_preserve?: unknown,
		consume: readonly string[] = []
	) {
		const next = fn(
			structuredClone(saved.projects.get(key)) as T | undefined,
			<R>(related: string) =>
				relatedKeys.includes(related)
					? (structuredClone(saved.projects.get(related)) as R | undefined)
					: undefined
		);
		saved.projects.set(key, structuredClone(next));
		for (const gone of consume) saved.projects.delete(gone);
		return next;
	}
}));
beforeEach(() => {
	saved.projects.clear();
	saved.blobs.clear();
});

async function stored(): Promise<StoredProject> {
	const project = await equipmentFixture();
	return {
		id: 'rig-test',
		savedAt: new Date().toISOString(),
		manifest: project.manifest,
		origin: 'studio'
	};
}

const outfit = (items: Preset['items'], variants: Preset['variants'] = {}) => ({
	current: { items, variants }
});

/** A dressed record as the delete leaves it: the item gone with its materials, outfit entry and color. */
function withoutHat(record: DressedRecord): DressedRecord {
	const rec = structuredClone(record),
		m = rec.manifest;
	m.items = m.items.filter((item) => item.id !== 'hat');
	m.materials = m.materials.filter((mat) => mat.id !== 'hat');
	delete m.presets[0].items.head;
	delete m.presets[0].variants.hat;
	if (rec.dress?.current) {
		delete rec.dress.current.items.head;
		delete rec.dress.current.variants.hat;
	}
	return rec;
}

test('an entry is accepted only when it is one this version can restore', async () => {
	const record = await stored();
	const entry = deletedEntry({
		kind: 'items',
		record,
		name: 'hat',
		context: 'Fixture',
		scope: { itemIds: ['hat'] }
	});
	expect(readEntry(entry)?.name).toBe('hat');
	expect(readEntry({ ...entry, version: 2 })).toBeUndefined();
	expect(readEntry({ ...entry, id: 'elsewhere' })).toBeUndefined();
	expect(readEntry({ ...entry, before: { ...entry.before, id: 'rig-other' } })).toBeUndefined();
	expect(readEntry({ ...entry, deletedAt: 'not a date' })).toBeUndefined();
	expect(readEntry({ ...entry, kind: 'unknown' })).toBeUndefined();
	expect(readEntry(null)).toBeUndefined();
});

test('expired and over-cap entries are pruned, newest kept', async () => {
	const record = await stored();
	const make = (id: string, at: number) => ({
		...deletedEntry({
			kind: 'items',
			record,
			name: id,
			context: 'Fixture',
			scope: { itemIds: ['hat'] }
		}),
		id: `${RECENTLY_DELETED_PREFIX}${id}`,
		deletedAt: new Date(at).toISOString()
	});
	const now = Date.now(),
		expired = make('expired', now - KEEP_MS - 1000),
		old = make('old', now - KEEP_MS + 60_000),
		fresh = make('fresh', now);
	expect(listEntries([expired, old, fresh]).map((e) => e.name)).toEqual(['fresh', 'old']);
	expect(pruneKeys([expired, old, fresh])).toEqual([expired.id]);
	const many = Array.from({ length: MAX_ENTRIES + 1 }, (_, index) =>
		make(`entry-${index}`, now - (MAX_ENTRIES - index) * 1000)
	);
	// One room is kept for the entry about to be written: the two oldest go.
	expect(pruneKeys(many).sort()).toEqual([many[0].id, many[1].id].sort());
	expect(pruneKeys(many, now, 0)).toEqual([many[0].id]);
});

test('deleting an item and restoring it puts the item, material, outfit and color back', async () => {
	const record = await stored();
	const before: DressedRecord = {
		...record,
		manifest: structuredClone(record.manifest),
		dress: outfit({ body: 'base', head: 'hat' }, { hat: 'blue' })
	};
	before.manifest.presets[0].items.head = 'hat';
	before.manifest.presets[0].variants.hat = 'blue';
	const rec = withoutHat(structuredClone(before));
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.items).toBe(1);
	expect(rec.manifest.items.some((item) => item.id === 'hat')).toBe(true);
	expect(rec.manifest.materials.some((mat) => mat.id === 'hat')).toBe(true);
	expect(rec.manifest.presets[0].items.head).toBe('hat');
	expect(rec.dress?.current?.items.head).toBe('hat');
	expect(rec.manifest.presets[0].variants.hat).toBe('blue');
	expect(rec.dress?.current?.variants.hat).toBe('blue');
	// Nothing is duplicated when it is restored again.
	restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(rec.manifest.items.filter((item) => item.id === 'hat')).toHaveLength(1);
});

test('a restored item leaves an outfit slot alone when something newer holds it', async () => {
	const record = await stored();
	const before: DressedRecord = {
		...record,
		manifest: structuredClone(record.manifest),
		dress: outfit({ body: 'base', head: 'hat' })
	};
	const rec = withoutHat(structuredClone(before));
	// Worn meanwhile by another item: the restore must not take its place.
	rec.manifest.presets[0].items.head = 'base';
	rec.dress!.current!.items.head = 'base';
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.items).toBe(1);
	expect(result.skipped).toBe(2);
	expect(rec.manifest.presets[0].items.head).toBe('base');
	expect(rec.dress?.current?.items.head).toBe('base');
});

test('a restored item brings its deleted category back, shown again', async () => {
	const record = await stored();
	const before: DressedRecord = {
		...record,
		manifest: structuredClone(record.manifest),
		dress: outfit({ body: 'base' })
	};
	before.manifest.presets[0].items.head = 'hat';
	const rec = withoutHat(structuredClone(before));
	rec.manifest.slots = rec.manifest.slots.filter((slot) => slot.id !== 'head');
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.items).toBe(1);
	expect(rec.manifest.slots.map((slot) => slot.id)).toEqual(['body', 'head']);
	expect(rec.manifest.slots[1].wardrobeHidden).toBeFalsy();
	expect(rec.manifest.presets[0].items.head).toBe('hat');
});

test('an entry this version cannot read still expires instead of pinning its artwork forever', async () => {
	const record = await stored();
	const entry = deletedEntry({
		kind: 'items',
		record,
		name: 'hat',
		context: 'Fixture',
		scope: { itemIds: ['hat'] }
	});
	const future = { ...entry, version: 99, deletedAt: new Date().toISOString() };
	const old = {
		...entry,
		id: `${RECENTLY_DELETED_PREFIX}old`,
		version: 99,
		deletedAt: new Date(Date.now() - KEEP_MS - 1000).toISOString()
	};
	expect(readEntry(future)).toBeUndefined();
	expect(pruneKeys([future])).toEqual([]);
	expect(pruneKeys([old])).toEqual([old.id]);
});

test('restoring an item after the frame changed is refused and changes nothing', async () => {
	const record = await stored();
	const before: DressedRecord = {
		...record,
		manifest: structuredClone(record.manifest),
		dress: outfit({ body: 'base', head: 'hat' })
	};
	const rec = withoutHat(structuredClone(before));
	rec.manifest.rig.cell = { w: 128, h: 96 };
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.refused).toBe('geometry');
	expect(result.items).toBe(0);
	expect(rec.manifest.items.some((item) => item.id === 'hat')).toBe(false);
});

test('a restored item brings back the hides edge another item had on its category', async () => {
	const record = await stored();
	const before: DressedRecord = {
		...record,
		manifest: structuredClone(record.manifest),
		dress: outfit({ body: 'base' })
	};
	before.manifest.slots[1].wardrobeHidden = true;
	before.manifest.items.find((item) => item.id === 'base')!.hides = ['head'];
	const rec = withoutHat(structuredClone(before));
	rec.manifest.slots = rec.manifest.slots.filter((slot) => slot.id !== 'head');
	rec.manifest.items.find((item) => item.id === 'base')!.hides = [];
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.items).toBe(1);
	expect(rec.manifest.slots.find((slot) => slot.id === 'head')?.wardrobeHidden).toBe(true);
	expect(rec.manifest.items.find((item) => item.id === 'base')?.hides).toEqual(['head']);
});

test('a live material link into a deleted item is put back', async () => {
	const record = await stored();
	const before: DressedRecord = {
		...record,
		manifest: structuredClone(record.manifest),
		dress: outfit({ body: 'base' })
	};
	before.manifest.materials.find((mat) => mat.id === 'base')!.linkTo = 'hat';
	const rec = withoutHat(structuredClone(before));
	rec.manifest.materials.find((mat) => mat.id === 'base')!.linkTo = undefined;
	delete rec.manifest.materials.find((mat) => mat.id === 'base')!.linkTo;
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.items).toBe(1);
	expect(rec.manifest.materials.find((mat) => mat.id === 'base')?.linkTo).toBe('hat');
});

test('a restored item drops frames for a move deleted since', async () => {
	const project = await equipmentFixture();
	const record: StoredProject = {
		id: 'rig-test',
		savedAt: new Date().toISOString(),
		manifest: project.manifest,
		origin: 'studio'
	};
	const source = record.manifest;
	source.rig.animations.push({ ...source.rig.animations[0], id: 'walk' });
	for (const item of source.items)
		item.layers[0].cells!.walk = structuredClone(item.layers[0].cells!.rest);
	const before: DressedRecord = { ...record, manifest: structuredClone(source) };
	const rec = withoutHat(structuredClone(before));
	rec.manifest.rig.animations = rec.manifest.rig.animations.filter((clip) => clip.id !== 'walk');
	const result = restoreRemoved(rec, before, { itemIds: ['hat'] });
	expect(result.items).toBe(1);
	expect(
		rec.manifest.items.find((item) => item.id === 'hat')?.layers[0].cells?.walk
	).toBeUndefined();
});

test('a child entry of a restored copy survives its original entry expiring', async () => {
	const record = await stored();
	const original = deletedEntry({
		kind: 'character',
		record,
		name: 'Fixture',
		context: '',
		scope: {}
	});
	const expired = {
		...original,
		id: `${RECENTLY_DELETED_PREFIX}old`,
		deletedAt: new Date(Date.now() - KEEP_MS - 1000).toISOString()
	};
	const child = {
		...deletedEntry({
			kind: 'items',
			record,
			name: 'hat',
			context: 'Fixture copy',
			scope: { itemIds: ['hat'] }
		}),
		id: `${RECENTLY_DELETED_PREFIX}child`,
		projectId: 'rig-copy',
		lineageId: original.lineageId,
		before: { ...record, id: 'rig-copy' }
	};
	// The copy still exists, so its item entry must not be pruned with the original character entry.
	expect(pruneKeys([expired, child])).toEqual([expired.id]);
});

test('a deleted draft keeps the ledger ids its results resolve to', async () => {
	const record = await stored();
	const entry = deletedEntry({
		kind: 'character',
		record,
		name: 'Fixture',
		context: '',
		scope: {},
		drafts: [
			{
				list: 'gens',
				entry: { draft: { rigId: record.id, calls: [{ recId: 'job-1', old: ['job-0'] }] } }
			}
		]
	});
	expect(draftCallIds(entry).sort()).toEqual(['job-0', 'job-1']);
});

test('a deleted move comes back with its clip, item frames and pose records', async () => {
	const project = await equipmentFixture();
	const source = project.manifest;
	source.rig.animations.push({ ...source.rig.animations[0], id: 'walk' });
	for (const item of source.items)
		item.layers[0].cells!.walk = structuredClone(item.layers[0].cells!.rest);
	const before: Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa'> = {
		manifest: structuredClone(source),
		skeletons: { 'walk/south/0': { points: [] } as never },
		rigQa: { clips: { 'walk/south/0': { status: 'pass' } }, warnings: ['walk/south/0 smudge'] }
	};
	const removed = await retainMoves(source, new Set(['rest']));
	const record: Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa'> = {
		manifest: structuredClone(removed),
		skeletons: {},
		rigQa: { clips: {}, warnings: [] }
	};
	// What the hash is when the move was never removed: the body hash covers the restored clip again.
	const whole = await retainMoves(before.manifest, new Set(['rest', 'walk']));
	expect(await restoreMove(record, before, 'walk')).toBe('restored');
	expect(record.manifest.rig.animations.map((clip) => clip.id)).toEqual(['rest', 'walk']);
	expect(record.manifest.items[1].layers[0].cells?.walk).toBeDefined();
	expect(record.manifest.rig.baseHash).toBe(whole.rig.baseHash);
	expect(record.skeletons?.['walk/south/0']).toBeDefined();
	expect(record.rigQa).toMatchObject({ warnings: ['walk/south/0 smudge'] });
	// Restoring twice changes nothing.
	expect(await restoreMove(record, before, 'walk')).toBe('exists');
});

test('a deleted move without poses leaves the redo list and comes back on it with its artwork', async () => {
	const project = await equipmentFixture();
	const source = project.manifest;
	source.rig.animations.push({ ...source.rig.animations[0], id: 'walk', sources: undefined });
	for (const item of source.items)
		item.layers[0].cells!.walk = structuredClone(item.layers[0].cells!.rest);
	const before: Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa'> = {
		manifest: structuredClone(source),
		skeletons: {},
		rigQa: { clips: {}, warnings: [], redo: ['walk', 'walk/south', 'rest/east'] }
	};
	// Deleting it drops its own entries only.
	expect(retainMoveMetadata(before, new Set(['rest'])).rigQa).toMatchObject({
		redo: ['rest/east']
	});
	const removed = await retainMoves(source, new Set(['rest']));
	// Setup ran again while it was deleted: live QA exists without the move's entries.
	const record: Pick<StoredProject, 'manifest' | 'skeletons' | 'rigQa'> = {
		manifest: structuredClone(removed),
		skeletons: {},
		rigQa: { clips: {}, warnings: [], redo: ['rest/east'] }
	};
	expect(await restoreMove(record, before, 'walk')).toBe('restored');
	expect((record.rigQa as { redo: string[] }).redo).toEqual(['rest/east', 'walk', 'walk/south']);
});

test('a move waits for a deleted item that owns its frames', async () => {
	const project = await equipmentFixture();
	const source = project.manifest;
	source.rig.animations.push({ ...source.rig.animations[0], id: 'walk' });
	for (const item of source.items)
		item.layers[0].cells!.walk = structuredClone(item.layers[0].cells!.rest);
	const before = { manifest: structuredClone(source) };
	const removed = await retainMoves(source, new Set(['rest']));
	const record = { manifest: structuredClone(removed) };
	record.manifest.items = record.manifest.items.filter((item) => item.id !== 'hat');
	expect(await restoreMove(record, before, 'walk')).toBe('itemsMissing');
});

test('a move is refused when the character no longer fits its frames', async () => {
	const project = await equipmentFixture();
	const source = project.manifest;
	source.rig.animations.push({ ...source.rig.animations[0], id: 'walk' });
	const before = { manifest: structuredClone(source) };
	const removed = await retainMoves(source, new Set(['rest']));
	removed.rig.cell = { w: 128, h: 128 };
	const record = { manifest: structuredClone(removed) };
	expect(await restoreMove(record, before, 'walk')).toBe('geometry');
	expect(stableStringify(record.manifest.rig.animations.map((clip) => clip.id))).toBe(
		stableStringify(['rest'])
	);
});

/** The fixture with Undo history on the hat: a Fix frames edit and a palette repair whose snapshots are gone, and one Fix
 *  frames edit whose snapshot is still saved. Returns the record with every hash it shows saved. */
async function withHistory() {
	const record = await stored();
	const hat = record.manifest.items.find((item) => item.id === 'hat')!;
	const shown = hat.layers[0].cells!.rest.south![0]!;
	const gone = `sha256:${'d'.repeat(64)}` as Sha256,
		kept = `sha256:${'e'.repeat(64)}` as Sha256;
	const edit = (id: string, before: Sha256) => ({
		version: 'frames-v1' as const,
		id,
		anim: 'rest',
		frames: [
			{
				dir: 'south' as const,
				cell: 0,
				layers: [{ id: 'main' as const, before, after: shown }],
				cut: { before: null, after: null }
			}
		]
	});
	hat.frameEdits = [edit('lost', gone), edit('kept', kept)];
	hat.paletteRepairs = [
		{
			version: 'neutral-owned-v1',
			materialId: 'hat',
			anim: 'rest',
			dir: 'south',
			frames: [{ cell: 0, changedPixels: 1, layers: [{ id: 'main', before: gone, after: shown }] }]
		}
	];
	for (const item of record.manifest.items)
		for (const hash of item.layers[0].cells!.rest.south!) saved.blobs.add(hash!.slice(7));
	saved.blobs.add(kept.slice(7));
	return { record, shown };
}

test('a deleted character restores without Undo history whose artwork is gone', async () => {
	const { record } = await withHistory();
	const entry = deletedEntry({
		kind: 'character',
		record,
		name: 'Fixture',
		context: '',
		scope: {}
	});
	saved.projects.set(entry.id, entry);
	await restoreCharacter(entry.id, { copyName: (name) => `${name} copy` });
	const hat = (saved.projects.get(record.id) as StoredProject).manifest.items.find(
		(item) => item.id === 'hat'
	)!;
	expect(hat.frameEdits?.map((edit) => edit.id)).toEqual(['kept']);
	expect(hat.paletteRepairs).toEqual([]);
	expect(saved.projects.has(entry.id)).toBe(false);
});

test('a deleted item restores without Undo history whose artwork is gone', async () => {
	const { record } = await withHistory();
	const entry = deletedEntry({
		kind: 'items',
		record,
		name: 'hat',
		context: 'Fixture',
		scope: { itemIds: ['hat'] }
	});
	saved.projects.set(record.id, withoutHat(structuredClone(record) as DressedRecord));
	saved.projects.set(entry.id, entry);
	await restoreParts(entry.id);
	const hat = (saved.projects.get(record.id) as StoredProject).manifest.items.find(
		(item) => item.id === 'hat'
	)!;
	expect(hat.frameEdits?.map((edit) => edit.id)).toEqual(['kept']);
	expect(hat.paletteRepairs).toEqual([]);
});

test('a deleted character missing artwork it shows is still refused', async () => {
	const { record, shown } = await withHistory();
	saved.blobs.delete(shown.slice(7));
	const entry = deletedEntry({
		kind: 'character',
		record,
		name: 'Fixture',
		context: '',
		scope: {}
	});
	saved.projects.set(entry.id, entry);
	await expect(
		restoreCharacter(entry.id, { copyName: (name) => `${name} copy` })
	).rejects.toMatchObject({
		// Only the shown frame counts: the missing history snapshot is dropped, not reported.
		translation: { key: 'recentlyDeleted.errors.missingArtwork', vars: { count: 1 } }
	});
	expect(saved.projects.has(record.id)).toBe(false);
	expect(saved.projects.has(entry.id)).toBe(true);
});
