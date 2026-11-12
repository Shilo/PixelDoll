import { expect, test } from 'vitest';
import { hiddenSlots, settleHands, twoHanded } from '../../src/lib/compose/compose.ts';
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
