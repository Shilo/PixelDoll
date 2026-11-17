import { expect, test } from 'vitest';
import { hiddenSlots, settleHands, twoHanded } from '../../src/lib/compose/compose.ts';
import { missingAt } from '../../src/lib/dress/dress.ts';
import { GDEVELOP_RUNTIME, gdCharacterKey, gdObjectName } from '../../src/lib/export/gdevelop.ts';
import { SLOTS } from '../../src/lib/items/items.ts';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import { gdFixture } from '../fixtures/gdevelop-native.ts';

const item = (id: string, slot: string, hides?: string[]) =>
	({
		id,
		name: id,
		slot,
		layers: [],
		materials: [],
		...(hides ? { hides } : {})
	}) as unknown as Item;
const manifest = (items: Item[]) =>
	({ slots: structuredClone(SLOTS), items, rig: { baseItem: 'base' } }) as unknown as Manifest;
const greatsword = item('greatsword', 'main_hand', ['off_hand']),
	bow = item('bow', 'off_hand', ['main_hand']),
	sword = item('sword', 'main_hand'),
	shield = item('shield', 'off_hand'),
	hood = item('hood', 'head', ['hair']),
	m = manifest([greatsword, bow, sword, shield, hood]);

test('a two-handed item is a hand item that hides the other hand', () => {
	expect([greatsword, bow, sword, shield, hood].map((i) => twoHanded(m, i))).toEqual([
		true,
		true,
		false,
		false,
		false
	]);
});

test('two-handed remains enabled when the opposite category has no saved definition yet', () => {
	for (const held of [greatsword, bow]) {
		const sparse = manifest([held]);
		sparse.slots = sparse.slots.filter((slot) => slot.id === held.slot);
		expect(twoHanded(sparse, held)).toBe(true);
		expect(twoHanded(sparse, { ...held, hides: [] })).toBe(false);
	}
});

test('copied hand slots preserve two-handed conflicts under unrelated keys', () => {
	const copiedBow = item('copied_bow', 'archery', ['main_hand']),
		copiedShield = item('copied_shield', 'shield_extra'),
		custom = manifest([greatsword, sword, copiedBow, copiedShield]);
	custom.slots.push(
		{ ...structuredClone(SLOTS.find((slot) => slot.id === 'off_hand')!), id: 'archery' },
		{ ...structuredClone(SLOTS.find((slot) => slot.id === 'off_hand')!), id: 'shield_extra' }
	);
	expect(twoHanded(custom, copiedBow)).toBe(true);
	expect([...hiddenSlots(custom, [greatsword, copiedShield])]).toContain('shield_extra');
	expect(
		settleHands(custom, { main_hand: 'sword', archery: 'copied_bow' }, 'archery').items
	).toEqual({ main_hand: null, archery: 'copied_bow' });
	expect(
		settleHands(
			custom,
			{ main_hand: 'greatsword', archery: 'copied_bow', shield_extra: 'copied_shield' },
			'main_hand'
		).items
	).toEqual({ main_hand: 'greatsword', archery: null, shield_extra: null });
});

test('a two-handed item and an item in the other hand are never worn together', () => {
	// wearing the two-handed item takes the other hand's item off
	const worn = settleHands(m, { main_hand: 'greatsword', off_hand: 'shield' }, 'main_hand');
	expect(worn.items).toEqual({ main_hand: 'greatsword', off_hand: null });
	expect([worn.removed?.id, worn.by?.id]).toEqual(['shield', 'greatsword']);
	// putting something in the other hand takes the two-handed item off
	const swapped = settleHands(m, { main_hand: 'greatsword', off_hand: 'shield' }, 'off_hand');
	expect(swapped.items).toEqual({ main_hand: null, off_hand: 'shield' });
	expect(swapped.removed?.id).toBe('greatsword');
	// an Off hand two-handed item works the same way
	expect(settleHands(m, { main_hand: 'sword', off_hand: 'bow' }, 'off_hand').items).toEqual({
		main_hand: null,
		off_hand: 'bow'
	});
	// a whole outfit or look keeps the Main hand
	expect(settleHands(m, { main_hand: 'sword', off_hand: 'bow' }).items.off_hand).toBeNull();
	expect(settleHands(m, { main_hand: 'greatsword', off_hand: 'bow' }).items).toEqual({
		main_hand: 'greatsword',
		off_hand: null
	});
	// nothing to settle: same object back
	const free = { main_hand: 'sword', off_hand: 'shield', head: 'hood' };
	expect(settleHands(m, free).items).toBe(free);
	expect(settleHands(m, { main_hand: 'greatsword' }).removed).toBeUndefined();
});

test('copied right-hand slots keep default priority regardless of item creation order', () => {
	const copiedSword = item('copied_sword', 'weapon_extra');
	for (const items of [
		[bow, copiedSword],
		[copiedSword, bow]
	]) {
		const custom = manifest(items);
		custom.slots.push({
			...structuredClone(SLOTS.find((slot) => slot.id === 'main_hand')!),
			id: 'weapon_extra'
		});
		expect(settleHands(custom, { off_hand: 'bow', weapon_extra: 'copied_sword' }).items).toEqual({
			off_hand: null,
			weapon_extra: 'copied_sword'
		});
		expect(
			settleHands(custom, { off_hand: 'bow', weapon_extra: 'copied_sword' }, 'off_hand').items
		).toEqual({ off_hand: 'bow', weapon_extra: null });
	}
});

test('two worn items that hide each other: the later slot stays visible, other hides are unchanged', () => {
	expect([...hiddenSlots(m, [greatsword, bow])]).toEqual(['off_hand']);
	expect([...hiddenSlots(m, [bow, greatsword])]).toEqual(['off_hand']);
	expect([...hiddenSlots(m, [greatsword, shield])]).toEqual(['off_hand']);
	expect([...hiddenSlots(m, [hood, sword])]).toEqual(['hair']);
	// a hidden item still hides what it hides, as before (only a mutual pair yields)
	const helmet = item('helmet', 'head', ['hair']),
		mask = item('mask', 'face_acc', ['head']);
	expect([...hiddenSlots(manifest([helmet, mask]), [helmet, mask])].sort()).toEqual([
		'hair',
		'head'
	]);
});

test('the exported GDevelop runtime keeps the Main hand visible when game code equips two two-handed items', () => {
	const g = gdFixture(),
		layer = structuredClone(g.items.find((i) => i.id !== g.rig.baseItem)!.layers[0]);
	g.slots.push(
		{ id: 'off_hand', z: 140, class: 'held' } as Manifest['slots'][number],
		{ id: 'main_hand', z: 150, class: 'held' } as Manifest['slots'][number]
	);
	g.items.push(
		{ ...item('bow', 'off_hand', ['main_hand']), layers: [layer] },
		{ ...item('greatsword', 'main_hand', ['off_hand']), layers: [layer] }
	);
	g.materials = [];
	const nodes: { name: string; hidden: boolean }[] = [];
	const scene = {
		createObject: (name: string) => {
			const n = {
				name,
				hidden: false,
				hide: (v = true) => {
					n.hidden = v;
				},
				setLayer() {},
				setAnimationName() {},
				setAnimationFrame() {},
				pauseAnimation() {},
				setPosition() {},
				setZOrder() {},
				updatePreRender() {},
				getRendererObject: () => ({}),
				deleteFromScene() {}
			};
			nodes.push(n);
			return n;
		},
		getGame: () => ({ getImageManager: () => ({ getPIXITexture: () => ({}) }) })
	};
	const names = Object.fromEntries(
		g.items.map((i) => [
			i.id,
			Object.fromEntries(i.layers.map((l) => [l.id, gdObjectName(i.id, l.id, gdCharacterKey(g))]))
		])
	);
	const d = new Function(GDEVELOP_RUNTIME + '\nreturn createPixelDoll;')()(scene, g, names);
	const hidden = (id: string) => d.nodes.get(gdObjectName(id, layer.id, gdCharacterKey(g))).hidden;
	d.equip('off_hand', 'bow');
	d.equip('main_hand', 'greatsword');
	d.update(1);
	expect([hidden('greatsword'), hidden('bow')]).toEqual([false, true]);
	d.equip('main_hand', null);
	d.update(1);
	expect(hidden('bow')).toBe(false);
});

test('the missing-frames warning follows the same rule: the visible one of two items that hide each other is checked', () => {
	const base = {
			...item('base', 'body'),
			layers: [{ id: 'main', role: 'fg', z: 10, cells: { walk: { south: ['sha256:a'] } } }]
		} as unknown as Item,
		cape = { ...item('cape', 'back', ['head']), coverage: [] } as Item,
		hat = { ...item('hat', 'head', ['back']), coverage: [] } as Item,
		mm = {
			...manifest([base, cape, hat]),
			rig: {
				baseItem: 'base',
				directions: [{ id: 'south' }],
				animations: [{ id: 'walk', cells: 1, frames: [{ cell: 0, ms: 100 }] }]
			}
		} as unknown as Manifest;
	// head comes after back in the slot order, so the hat stays visible and is the one reported (both were hidden before)
	expect(missingAt(mm, { head: 'hat', back: 'cape' }, 'walk', 'south').map((i) => i.id)).toEqual([
		'hat'
	]);
});
