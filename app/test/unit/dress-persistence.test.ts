import { expect, test, vi } from 'vitest';
import { CURRENT_FORMAT, type Manifest, type Slot } from '../../src/lib/store/manifest.ts';
import { mergeSlotEdits, saveDress, saveSplit } from '../../src/lib/dress/project.ts';
import { deleteItem, deleteItems, type StoredProject } from '../../src/lib/store/project.ts';
import { rigArtworkVersion } from '../../src/lib/rig/rig.ts';

const { records } = vi.hoisted(() => ({ records: new Map<string, unknown>() }));
vi.mock('../../src/lib/store/db.ts', () => ({
	updateCharacter: async (key: string, _blobs: unknown, fn: (r: unknown) => unknown) => {
		const next = fn(structuredClone(records.get(key)));
		records.set(key, next);
		return next;
	},
	update: async (
		_store: string,
		key: string,
		fn: (r: unknown) => unknown,
		_related: unknown,
		preserve?: (r: unknown) => { key: string; record: unknown } | undefined
	) => {
		const previous = structuredClone(records.get(key));
		const archive = preserve?.(previous);
		const next = fn(previous);
		if (archive) records.set(archive.key, archive.record);
		records.set(key, next);
		return next;
	}
}));

test('saving the demo keeps an incompatible outfit unchanged and preserves it only once', async () => {
	const key = 'dress-fixture:s2';
	const old = {
		id: key,
		kind: 'dress',
		format: 'pixeldoll/2',
		presets: [{ name: 'Older outfit' }]
	};
	records.set(key, old);
	const manifest = record().manifest as unknown as Manifest;
	const current = { items: {}, variants: {} };
	await saveDress('fixture:s2', manifest, current);
	await saveDress('fixture:s2', manifest, current);
	const archived = [...records].filter(([id]) => id.startsWith('dress-archived:'));
	expect(archived).toHaveLength(1);
	expect(archived[0][1]).toEqual({ id: archived[0][0], kind: 'dress', source: key, original: old });
	expect(records.get(key)).toMatchObject({ id: key, format: CURRENT_FORMAT });
});

function record() {
	const material = (owner: string) => ({
		id: `${owner}_1`,
		owner,
		label: 'Cloth',
		ramp: ['#112233'],
		variants: {}
	});
	return {
		id: 'rig-test',
		manifest: {
			items: [
				{ id: 'base', materials: ['base_1'] },
				{ id: 'hat', materials: ['hat_1'] }
			],
			materials: [material('base'), material('hat')],
			slots: [{ id: 'head' }],
			rig: {
				baseItem: 'base',
				directions: [{ id: 'south' }],
				animations: [{ id: 'idle', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }]
			},
			presets: [{ id: 'look', items: { body: 'base', head: 'hat' }, variants: { hat_1: 'gold' } }]
		},
		dress: { current: { items: { head: 'hat' }, variants: { hat_1: 'gold' } } }
	} as unknown as StoredProject & {
		dress: { current: { items: Record<string, string | null>; variants: Record<string, string> } };
	};
}

test('a delayed autosave preserves materials introduced by an accepted generation', async () => {
	const live = record(),
		snapshot = structuredClone(live.manifest);
	snapshot.items = snapshot.items.filter((it) => it.id !== 'hat');
	snapshot.materials = snapshot.materials.filter((mat) => mat.owner !== 'hat');
	records.set(live.id, live);
	await saveDress(live.id, snapshot, { items: { body: 'base' }, variants: {} });
	const saved = records.get(live.id) as StoredProject;
	expect(saved.manifest.materials.some((mat) => mat.id === 'hat_1')).toBe(true);
	expect(saved.manifest.items.find((it) => it.id === 'hat')!.materials).toEqual(['hat_1']);
});

test('an autosave from before an item move cannot restore its old equipment key', async () => {
	const live = record();
	const hat = live.manifest.items.find(({ id }) => id === 'hat')!;
	hat.slot = 'head';
	const stale = structuredClone(live.manifest);
	hat.slot = 'face_acc';
	live.manifest.slots.push({ id: 'face_acc', class: 'rigid', z: 120 });
	records.set(live.id, live);
	await saveDress(live.id, stale, { items: { head: 'hat' }, variants: {} });
	const saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.dress.current.items).toEqual({ head: null, face_acc: 'hat' });
	expect(saved.manifest.presets[0].items).toMatchObject({ head: null, face_acc: 'hat' });
});

test('deleting equipment cleans current and saved outfits, and stale autosaves cannot revive references', async () => {
	const live = record(),
		stale = structuredClone(live.manifest);
	records.set(live.id, live);
	await deleteItem(live.id, 'hat');
	let saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.manifest.items.map((it) => it.id)).toEqual(['base']);
	expect(saved.manifest.materials.map((mat) => mat.id)).toEqual(['base_1']);
	expect(saved.manifest.presets[0].items.head).toBeNull();
	expect(saved.dress.current.items.head).toBeNull();
	expect(saved.dress.current.variants).toEqual({});
	await saveDress(live.id, stale as Manifest, {
		items: { head: 'hat' },
		variants: { hat_1: 'gold' }
	});
	saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.manifest.presets[0].items.head).toBeNull();
	expect(saved.dress.current.items.head).toBeNull();
	expect(saved.manifest.materials.map((mat) => mat.id)).toEqual(['base_1']);
	expect(saved.dress.current.variants).toEqual({});
});

test('deleting several items is all or nothing: a missing item or a refused finish keeps every item', async () => {
	const live = record();
	live.manifest.items.push({ id: 'cap', materials: [] } as never);
	live.manifest.presets[0].items.back = 'cap';
	records.set(live.id, live);
	await expect(deleteItems(live.id, ['hat', 'gone'], () => {})).rejects.toThrow('changed');
	await expect(
		deleteItems(live.id, ['hat', 'cap'], () => {
			throw new Error('refused');
		})
	).rejects.toThrow('refused');
	expect(records.get(live.id)).toEqual(live);
	await deleteItems(live.id, ['hat', 'cap'], (rec) => delete rec.manifest.presets[0].items.back);
	const saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.manifest.items.map((it) => it.id)).toEqual(['base']);
	expect(saved.manifest.materials.map((mat) => mat.id)).toEqual(['base_1']);
	expect(saved.manifest.presets[0].items).toEqual({ body: 'base', head: null });
	expect(saved.dress.current).toEqual({ items: { head: null }, variants: {} });
});

test('region preparation cannot overwrite a newer frozen base, and metadata-only splits still persist', async () => {
	const live = record(),
		incoming = structuredClone(live.manifest);
	live.manifest.rig.baseHash = 'sha256:newer';
	incoming.rig.baseHash = 'sha256:split';
	records.set(live.id, live);
	await expect(
		saveSplit(live.id, incoming, { oldHash: 'sha256:old', images: new Map() })
	).rejects.toThrow('changed while preparing');
	expect((records.get(live.id) as StoredProject).manifest.rig.baseHash).toBe('sha256:newer');
	incoming.rig.baseHash = 'sha256:newer';
	incoming.items[0].regions = 'shirt-shorts';
	await saveSplit(live.id, incoming, { oldHash: 'sha256:newer', images: new Map() });
	expect((records.get(live.id) as StoredProject).manifest.items[0].regions).toBe('shirt-shorts');
});

test('legitimate color-region preparation advances only the exact current body publication receipt', async () => {
	const live = record();
	live.manifest.rig.baseHash = 'sha256:before';
	live.character = { id: 'managed', looks: 'body' };
	live.moveRecovery = {
		id: 'consent',
		originalRigVersion: 'original',
		bodyRigVersion: rigArtworkVersion(live.manifest.rig, live.character),
		specHash: 'exact-spec'
	};
	const incoming = structuredClone(live.manifest);
	incoming.rig.baseHash = 'sha256:regions';
	incoming.items[0].regions = 'shirt-shorts';
	records.set(live.id, live);
	await saveSplit(live.id, incoming, { oldHash: 'sha256:before', images: new Map() });
	const next = records.get(live.id) as StoredProject;
	expect(next.moveRecovery).toEqual({
		...live.moveRecovery,
		bodyRigVersion: rigArtworkVersion(next.manifest.rig, next.character)
	});
	expect(next.moveRecovery?.bodyRigVersion).not.toBe(live.moveRecovery.bodyRigVersion);
});
test('a stale body receipt cannot be blessed by a later color-region split', async () => {
	const live = record();
	live.manifest.rig.baseHash = 'sha256:before';
	live.moveRecovery = {
		id: 'consent',
		originalRigVersion: 'original',
		bodyRigVersion: rigArtworkVersion(live.manifest.rig, live.character),
		specHash: 'exact-spec'
	};
	const receipt = structuredClone(live.moveRecovery);
	live.manifest.rig.rest = { south: { image: 'sha256:changed-reference', keypoints: [] } };
	const incoming = structuredClone(live.manifest);
	incoming.rig.baseHash = 'sha256:regions';
	incoming.items[0].regions = 'shirt-shorts';
	records.set(live.id, live);
	await saveSplit(live.id, incoming, { oldHash: 'sha256:before', images: new Map() });
	const next = records.get(live.id) as StoredProject;
	expect(next.moveRecovery).toEqual(receipt);
	expect(next.moveRecovery?.bodyRigVersion).not.toBe(
		rigArtworkVersion(next.manifest.rig, next.character)
	);
});

test('a delayed snapshot retains newly fitted current equipment and its independent color variant', async () => {
	const live = record(),
		snapshot = structuredClone(live.manifest);
	snapshot.items = snapshot.items.filter((it) => it.id !== 'hat');
	snapshot.materials = snapshot.materials.filter((mat) => mat.owner !== 'hat');
	records.set(live.id, live);
	await saveDress(live.id, snapshot, { items: { body: 'base', head: null }, variants: {} });
	const saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.dress.current.items.head).toBe('hat');
	expect(saved.dress.current.variants).toEqual({ hat_1: 'gold' });
	expect(saved.manifest.items.find((it) => it.id === 'hat')!.materials).toEqual(['hat_1']);
});

test('covered items can still be deliberately unequipped and stale links to deleted materials stay removed', async () => {
	const live = record(),
		snapshot = structuredClone(live.manifest);
	records.set(live.id, live);
	await saveDress(live.id, snapshot, { items: { head: null }, variants: {} });
	let saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.dress.current.items.head).toBeNull();
	expect(saved.dress.current.variants).toEqual({});
	snapshot.materials[0].linkTo = 'hat_1';
	await deleteItem(live.id, 'hat');
	await saveDress(live.id, snapshot, { items: { head: 'hat' }, variants: { hat_1: 'gold' } });
	saved = records.get(live.id) as ReturnType<typeof record>;
	expect(saved.manifest.materials[0].linkTo).toBeUndefined();
	expect(saved.dress.current.items.head).toBeNull();
	expect(saved.dress.current.variants).toEqual({});
});

test('slot definitions persist with organization, keep newer fitted slots and drop a deleted empty custom slot', async () => {
	const live = record(),
		snapshot = structuredClone(live.manifest);
	live.manifest.slots.push({ id: 'old_charm', z: 55, class: 'worn', label: 'Old charm' });
	live.manifest.slots.push({ id: 'quiver', z: 90, class: 'worn', label: 'Quiver' });
	live.manifest.items.push({ id: 'arrows', slot: 'quiver', materials: [] } as never);
	snapshot.slots = [
		{
			id: 'brooch',
			z: 62,
			class: 'worn',
			label: 'Brooch',
			wardrobeHidden: false,
			zOverrides: [{ layer: 'fg', z: 62 }]
		},
		{ id: 'head', z: 130, class: 'rigid', wardrobeOrder: 4 }
	] as never;
	records.set(live.id, live);
	await saveDress(live.id, snapshot as Manifest, { items: {}, variants: {} });
	const saved = records.get(live.id) as StoredProject;
	expect(saved.manifest.slots.map((s) => s.id)).toEqual(['brooch', 'quiver', 'head']);
	expect(saved.manifest.slots[0]).toMatchObject({
		label: 'Brooch',
		zOverrides: [{ layer: 'fg', z: 62 }]
	});
	expect(saved.manifest.slots[2].wardrobeOrder).toBe(4);
});

const slot = (id: string, z: number, extra: Partial<Slot> = {}) =>
	({ id, z, class: 'worn', anchor: 'neck', label: id, ...extra }) as Slot;
const ids = (list: Slot[]) => list.map((s) => s.id);

test('a stale tab’s routine save keeps a category another tab just added, even while an attempt is pending there', async () => {
	const live = record(),
		stale = structuredClone(live.manifest) as unknown as Manifest;
	const base = structuredClone(stale.slots);
	// Another tab added Brooch and started an item there: no saved item holds it yet.
	live.manifest.slots.push(slot('brooch', 55));
	records.set(live.id, live);
	const saved = await saveDress(live.id, stale, { items: { head: 'hat' }, variants: {} }, { base });
	expect(ids((records.get(live.id) as StoredProject).manifest.slots)).toEqual(['head', 'brooch']);
	expect(ids(saved.slots)).toEqual(['head', 'brooch']);
});

test('a stale tab never brings back an empty category deleted elsewhere, even after editing it', async () => {
	const live = record(),
		stale = structuredClone(live.manifest) as unknown as Manifest;
	stale.slots.push(slot('charm', 55));
	const base = structuredClone(stale.slots);
	stale.slots[1].label = 'Lucky charm';
	records.set(live.id, live); // the record no longer has Charm
	await saveDress(live.id, stale, { items: {}, variants: {} }, { base });
	expect(ids((records.get(live.id) as StoredProject).manifest.slots)).toEqual(['head']);
});

test('a stale tab’s save keeps its own outfit changes and never brings back one moved to the Trash elsewhere', async () => {
	const live = record();
	const look = (id: string, name = id) => ({ id, name, items: {}, variants: {} });
	live.manifest.presets = [look('a'), look('b')];
	const stale = structuredClone(live.manifest) as unknown as Manifest;
	const base = structuredClone(stale.slots),
		presets = structuredClone(stale.presets);
	// Another tab moved A to the Trash; this one renamed B and saved C meanwhile.
	live.manifest.presets = [look('b')];
	records.set(live.id, live);
	stale.presets = [look('a'), look('b', 'Bee'), look('c')];
	const saved = await saveDress(live.id, stale, { items: {}, variants: {} }, { base, presets });
	const names = (list: { name: string }[]) => list.map((preset) => preset.name);
	expect(names((records.get(live.id) as StoredProject).manifest.presets)).toEqual(['Bee', 'c']);
	expect(names(saved.presets)).toEqual(['Bee', 'c']);
});

test('a stale slot edit cannot restore overrides for a removed facing', async () => {
	const live = record();
	const stale = structuredClone(live.manifest);
	stale.rig.directions.push({ id: 'west' });
	const base = structuredClone(stale.slots);
	stale.slots[0].zOverrides = [
		{ layer: 'fg', dir: 'west', z: 12 },
		{ layer: 'fg', dir: 'south', z: 13 },
		{ layer: 'bg', z: 4 }
	];
	records.set(live.id, live);
	const saved = await saveDress(live.id, stale, { items: {}, variants: {} }, { base });
	expect(saved.slots[0].zOverrides).toEqual(stale.slots[0].zOverrides.slice(1));
});

test('a deliberate removal is saved, but never of a category holding attempts or changed elsewhere since', async () => {
	const start = [{ id: 'head' } as Slot, slot('charm', 55)];
	const saveWithout = async (record_: ReturnType<typeof record>, keep: string[] = []) => {
		records.set(record_.id, record_);
		const mine = structuredClone(record_.manifest) as unknown as Manifest;
		mine.slots = [{ id: 'head' } as Slot];
		await saveDress(record_.id, mine, { items: {}, variants: {} }, { base: start, keep });
		return ids((records.get(record_.id) as StoredProject).manifest.slots);
	};
	const plain = record();
	plain.manifest.slots = structuredClone(start) as never;
	expect(await saveWithout(plain)).toEqual(['head']);
	const drafting = record();
	drafting.manifest.slots = structuredClone(start) as never;
	expect(await saveWithout(drafting, ['charm'])).toEqual(['head', 'charm']);
	const renamed = record();
	renamed.manifest.slots = structuredClone(start) as never;
	(renamed.manifest.slots[1] as Slot).label = 'Renamed elsewhere';
	expect(await saveWithout(renamed)).toEqual(['head', 'charm']);
});

test('a slot edit lands on the latest list: its own change wins, other tabs’ additions and order stay', async () => {
	const live = record();
	live.manifest.slots = [slot('head', 130)] as never;
	const mine = structuredClone(live.manifest) as unknown as Manifest;
	const base = structuredClone(mine.slots);
	mine.slots[0].wardrobeOrder = 7;
	mine.slots.push(slot('brooch', 62));
	live.manifest.slots.unshift(slot('quiver', 20) as never);
	records.set(live.id, live);
	await saveDress(live.id, mine, { items: {}, variants: {} }, { base });
	const saved = (records.get(live.id) as StoredProject).manifest.slots;
	expect(ids(saved)).toEqual(['quiver', 'brooch', 'head']);
	expect(saved.find((s) => s.id === 'head')!.wardrobeOrder).toBe(7);
});

test('undoing Add category keeps it while an attempt there is pending, and an old undo never removes newer slots', () => {
	const head = slot('head', 130),
		brooch = slot('brooch', 55);
	// Undo of Add Brooch: after the step [head, brooch], back to [head]; meanwhile an item is being made in Brooch.
	expect(ids(mergeSlotEdits([brooch, head], [head], [brooch, head], new Set(['brooch'])))).toEqual([
		'brooch',
		'head'
	]);
	expect(ids(mergeSlotEdits([brooch, head], [head], [brooch, head]))).toEqual(['head']);
	// Undo of an older color step: its snapshot predates Quiver (another tab or a later step), which stays.
	const quiver = slot('quiver', 90);
	expect(ids(mergeSlotEdits([head], [head], [head, quiver]))).toEqual(['head', 'quiver']);
	// Equal depths keep the view's order: a category set to draw directly above another stays after it.
	const pin = slot('pin', 55);
	expect(
		ids(mergeSlotEdits([brooch, head], [brooch, pin, head], [slot('belt', 55), brooch, head]))
	).toEqual(['belt', 'brooch', 'pin', 'head']);
});
