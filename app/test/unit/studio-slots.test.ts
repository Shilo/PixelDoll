import { expect, test } from 'vitest';
import type { Item, Manifest } from '../../src/lib/store/manifest.ts';
import { SLOTS, slotLadder } from '../../src/lib/items/slots.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import {
	addCustom,
	applySettings,
	busyReason,
	changesAttachment,
	categories,
	deleteCustom,
	drawsAbove,
	hintProblem,
	keyFor,
	labelProblem,
	moveCategory,
	renameCustom,
	setDrawsAbove,
	setHand,
	setHidden,
	shownCategories,
	slotLabel,
	slotUse
} from '../../src/studio/slots.ts';

const item = (id: string, slot: string) =>
	({ id, name: id, slot, layers: [], materials: [] }) as unknown as Item;
function character(items: Item[] = []) {
	const used = new Set(items.map((it) => it.slot));
	return {
		slots: structuredClone(SLOTS.filter((s) => s.id === 'body' || used.has(s.id))),
		items,
		presets: [{ id: 'look', name: 'Look', items: {}, variants: {} }],
		rig: { baseItem: 'base', directions: [{ id: 'south' }] }
	} as unknown as Manifest;
}
const none = new Set<string>();
/** What compositing reads: slot ids in array order with their depths (organization fields excluded). */
const render = (m: Manifest) =>
	m.slots.map((s) => ({ id: s.id, z: s.z, bgZ: s.bgZ, zOverrides: s.zOverrides }));

test('every built-in is its own category: ten shown, six not shown, Base excluded', () => {
	const m = character();
	expect(shownCategories(m, none).map((c) => c.label)).toEqual([
		'Head',
		'Hair',
		'Face',
		'Body',
		'Hands',
		'Legs',
		'Feet',
		'Back',
		'Main hand',
		'Off hand'
	]);
	expect(
		categories(m)
			.filter((c) => c.hidden)
			.map((c) => c.label)
	).toEqual(['Facial hair', 'Outerwear', 'Underwear', 'Waist', 'Neck', 'Shoulders']);
	expect(categories(m).some((c) => c.key === 'body')).toBe(false);
	expect(slotLabel(m, 'torso_inner')).toBe('Body');
	expect(slotLabel(m, 'body')).toBe('Base');
});

test('a hidden category holding items or attempts stays in Wardrobe', () => {
	const m = character([item('beard', 'facial_hair')]);
	expect(shownCategories(m, new Set(['facial_hair', 'waist'])).map((c) => c.key)).toContain(
		'facial_hair'
	);
	expect(shownCategories(m, new Set(['waist'])).map((c) => c.key)).toContain('waist');
});

test('blank names become Accessory, then the next free number, with permanent portable keys', () => {
	const m = character();
	const first = addCustom(m, {}, none),
		second = addCustom(m, { label: '  ' }, none);
	expect([first, second]).toEqual(['accessory', 'accessory_2']);
	expect([slotLabel(m, first), slotLabel(m, second)]).toEqual(['Accessory', 'Accessory 2']);
	expect(keyFor(m, '盾')).toBe('slot');
	addCustom(m, { label: '盾' }, none);
	expect(keyFor(m, '剣')).toBe('slot_2');
	expect(keyFor(m, 'Con')).toBe('con_slot');
	expect(keyFor(m, '2nd ring')).toBe('slot_2nd_ring');
	// Hidden built-ins keep their keys and names.
	expect(keyFor(m, 'Neck')).toBe('neck_2');
	expect(labelProblem(m, ' neck ')).toBe('Neck already exists.');
	expect(labelProblem(m, 'base')).toBe('Base already exists.');
	expect(() => addCustom(m, { label: 'ACCESSORY' }, none)).toThrow('already exists');
});

test('renaming changes only the label: the key, items and outfits keep their references', () => {
	const m = character();
	const key = addCustom(m, { label: 'Quiver' }, none);
	m.items.push(item('arrows', key));
	m.presets[0].items[key] = 'arrows';
	renameCustom(m, key, 'Arrows');
	expect(slotLabel(m, key)).toBe('Arrows');
	expect(key).toBe('quiver');
	expect(m.items[0].slot).toBe('quiver');
	expect(m.presets[0].items.quiver).toBe('arrows');
	expect(() => renameCustom(m, 'torso_inner', 'Chest')).toThrow();
});

test('Wardrobe order is separate from drawing order', () => {
	const m = character([item('hat', 'head'), item('boots', 'feet')]);
	const before = render(m);
	moveCategory(m, 'feet', 0, none);
	moveCategory(m, 'head', 5, none);
	expect(
		shownCategories(m, none)
			.map((c) => c.key)
			.slice(0, 3)
	).toEqual(['feet', 'hair', 'face_acc']);
	// Existing slots keep their relative render order and depths; organization only adds empty definitions.
	const after = render(m).filter((s) => before.some((b) => b.id === s.id));
	expect(after).toEqual(before);
});

test('showing a category puts it at the end of the shown list', () => {
	const m = character();
	setHidden(m, 'neck', false, none);
	expect(shownCategories(m, none).at(-1)?.key).toBe('neck');
	setHidden(m, 'neck', true, none);
	expect(shownCategories(m, none).some((c) => c.key === 'neck')).toBe(false);
});

test('empty means no items, attempts being made, or stopped attempts on this character', () => {
	const m = character([item('beard', 'facial_hair')]);
	const drafts = [
		{ rigId: 'rig-a', slot: 'waist', phase: 'running' as const },
		{ rigId: 'rig-a', slot: 'neck', phase: 'failed' as const },
		{ rigId: 'rig-b', slot: 'shoulders', phase: 'review' as const }
	];
	expect(slotUse(m, 'rig-a', 'facial_hair', drafts)).toEqual({ items: 1, making: 0, stopped: 0 });
	expect(busyReason('Waist', slotUse(m, 'rig-a', 'waist', drafts), 'be hidden')).toBe(
		'Waist has 1 item being made. Only an empty category can be hidden.'
	);
	expect(busyReason('Neck', slotUse(m, 'rig-a', 'neck', drafts), 'be hidden')).toContain(
		'1 stopped attempt'
	);
	expect(busyReason('Shoulders', slotUse(m, 'rig-a', 'shoulders', drafts), 'be hidden')).toBe('');
});

test('a new accessory draws over basic clothing; moving it keeps existing art in step', () => {
	const m = character([item('shirt', 'torso_inner'), item('trousers', 'legs')]);
	const key = addCustom(m, {}, none);
	expect(drawsAbove(m, key)).toBe('waist');
	const ids = m.slots.map((s) => s.id);
	expect(ids.indexOf(key)).toBeGreaterThan(ids.indexOf('torso_inner'));
	m.items.push(item('brooch', key));
	setDrawsAbove(m, key, 'torso_outer');
	const slot = m.slots.find((s) => s.id === key)!;
	expect(slot.z).toBe(62);
	expect(slot.zOverrides).toEqual([{ layer: 'fg', z: 62 }]);
	expect(drawsAbove(m, key)).toBe('torso_outer');
	expect(() => setDrawsAbove(m, 'head', 'hair')).toThrow();
});

test('a copied left-hand slot keeps its hand behavior under a new key', () => {
	const m = character();
	const key = addCustom(m, { label: 'Second shield', like: 'off_hand' }, none);
	const slot = m.slots.find((s) => s.id === key)!;
	expect([key, slot.class, slot.anchor, slot.profile]).toEqual([
		'second_shield',
		'held',
		'hand_l',
		'off_hand'
	]);
});

test('only empty custom categories can be deleted, and outfits forget their key', () => {
	const m = character([item('cape', 'back')]);
	const key = addCustom(m, { label: 'Charm' }, none);
	m.presets[0].items[key] = null;
	m.items[0].hides = [key, 'hair'];
	m.slots.find((slot) => slot.id === 'back')!.hides = [key];
	deleteCustom(m, key);
	expect(m.slots.some((s) => s.id === key)).toBe(false);
	expect(key in m.presets[0].items).toBe(false);
	expect(m.items.at(-1)!.hides).toEqual(['hair']);
	expect(m.slots.find((slot) => slot.id === 'back')!.hides).toEqual([]);
	expect(() => deleteCustom(m, 'neck')).toThrow();
	const used = addCustom(m, { label: 'Charm' }, none);
	m.items.push(item('pouch', used));
	expect(() => deleteCustom(m, used)).toThrow();
});

test('creative hints describe the item and leave protected wording to PixelDoll', () => {
	expect(hintProblem('small and shiny, pinned to the chest')).toBe('');
	expect(hintProblem('a picture frame pendant with a gem grid')).toBe('');
	expect(hintProblem('on a green screen background')).toContain('PixelDoll handles');
	expect(hintProblem('{{description}}')).toBe('Describe the item in plain words.');
});

test('Draws above moves the drawn pixels of items already made, not only the setting', () => {
	const pixel = (rgb: [number, number, number]) => {
		const im = makeImg(1, 1);
		im.data.set([...rgb, 255]);
		return im;
	};
	const layered = (id: string, slot: string, z: number) =>
		({
			...item(id, slot),
			layers: [{ id: 'main', role: 'fg', z, cells: { idle: { south: [`sha256:${id}`] } } }]
		}) as unknown as Item;
	const m = character([layered('base', 'body', 10), layered('coat', 'torso_outer', 60)]);
	Object.assign(m.rig, {
		cell: { w: 1, h: 1 },
		pivot: { x: 0, y: 0 },
		animations: [{ id: 'idle', frames: [{ cell: 0, ms: 100 }] }]
	});
	const key = addCustom(m, { label: 'Brooch' }, none);
	m.items.push(layered('brooch', key, 55));
	const project = {
		manifest: m,
		images: new Map([
			['sha256:base', pixel([200, 0, 0])],
			['sha256:coat', pixel([0, 0, 200])],
			['sha256:brooch', pixel([0, 200, 0])]
		])
	} as never;
	const top = () => [
		...composeCell(
			project,
			{ torso_outer: 'coat', [key]: 'brooch' },
			'idle',
			'south',
			0
		).data.slice(0, 3)
	];
	expect(top()).toEqual([0, 0, 200]); // over basic clothing, under the coat
	setDrawsAbove(m, key, 'torso_outer');
	expect(top()).toEqual([0, 200, 0]);
	expect(m.items.at(-1)!.layers[0].z).toBe(55); // baked art is untouched: the slot override moves it
});

test('Draws above shifts directional front overrides with the whole front and keeps back depths', () => {
	const m = character();
	const key = addCustom(m, { label: 'Spare shield', like: 'off_hand' }, none);
	const slot = m.slots.find((s) => s.id === key)!;
	slot.zOverrides = [
		{ layer: 'bg', z: 5, dir: 'south' },
		{ layer: 'fg', z: 145, dir: 'west' }
	];
	setDrawsAbove(m, key, 'torso_outer');
	expect(slot.z).toBe(62);
	expect(slot.zOverrides).toEqual([
		{ layer: 'bg', z: 5, dir: 'south' },
		{ layer: 'fg', z: 67, dir: 'west' },
		{ layer: 'fg', z: 62 }
	]);
});

test('switching a held custom category to the other hand rebuilds its whole attachment from that hand', () => {
	const m = character();
	m.rig.directions = [{ id: 'south' }, { id: 'west' }] as never;
	const key = addCustom(m, { label: 'Spare sword', like: 'main_hand' }, none);
	setHand(m, key, 'left');
	const slot = m.slots.find((s) => s.id === key)!,
		off = slotLadder(m.rig).find((s) => s.id === 'off_hand')!;
	expect([slot.anchor, slot.z, slot.bgZ, slot.zOverrides]).toEqual([
		'hand_l',
		off.z,
		off.bgZ,
		off.zOverrides
	]);
	// What it generates stays a main-hand item; only the hand and its layering change.
	expect([slot.profile, slot.label]).toEqual(['main_hand', 'Spare sword']);
	setHand(m, key, 'right');
	const main = slotLadder(m.rig).find((s) => s.id === 'main_hand')!;
	expect([
		m.slots.find((s) => s.id === key)!.z,
		m.slots.find((s) => s.id === key)!.zOverrides
	]).toEqual([main.z, main.zOverrides]);
});

test('saving settings applies a picked drawing order, but a new behavior keeps its own depth when order was not picked', () => {
	const m = character();
	const key = addCustom(m, { label: 'Charm' }, none);
	const form = { label: 'Lucky charm', profile: 'back' as const, hint: 'small and shiny' };
	expect(changesAttachment(m, key, form)).toBe(true);
	applySettings(m, key, form);
	const back = SLOTS.find((s) => s.id === 'back')!;
	let slot = m.slots.find((s) => s.id === key)!;
	expect([slot.label, slot.profile, slot.z, slot.bgZ, slot.promptTemplate]).toEqual([
		'Lucky charm',
		'back',
		back.z,
		back.bgZ,
		'small and shiny'
	]);
	applySettings(m, key, { ...form, above: 'torso_outer' });
	expect(drawsAbove(m, key)).toBe('torso_outer');
	expect(changesAttachment(m, key, form)).toBe(false);
	// A refused part refuses the whole form: nothing on the copy may be kept by the caller.
	const copy = structuredClone(m);
	expect(() => applySettings(copy, key, { ...form, label: 'Head' })).toThrow('already exists');
});
