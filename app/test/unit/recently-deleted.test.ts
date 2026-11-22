import { expect, test } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import {
	KEEP_MS,
	MAX_ENTRIES,
	RECENTLY_DELETED_PREFIX,
	deletedEntry,
	listEntries,
	pruneKeys,
	readEntry
} from '../../src/lib/store/recently-deleted.ts';
import { restoreRemoved, type DressedRecord } from '../../src/lib/store/project.ts';
import { retainMoves, restoreMove } from '../../src/lib/rig/moves.ts';
import { stableStringify } from '../../src/lib/image/hash.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import type { Preset } from '../../src/lib/store/manifest.ts';

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
