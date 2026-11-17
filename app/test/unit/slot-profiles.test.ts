import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import {
	bandOf,
	cutRows,
	designGraySmudges,
	dressItem,
	f0Last,
	HAND_MARK,
	markHand,
	padOf,
	planItem,
	putItem,
	slotLadder,
	slotOf
} from '../../src/lib/items/items.ts';
import {
	behaviorOf,
	createSlot,
	creativePrompt,
	DEFAULT_WARDROBE_ORDER,
	handOf,
	requireSlot,
	SLOTS
} from '../../src/lib/items/slots.ts';
import { materialNames } from '../../src/lib/dress/dress.ts';
import type { Item, Slot } from '../../src/lib/store/manifest.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';
import type { Skeleton } from '../../src/lib/rig/skeleton.ts';

const rig: Rig = {
	cell: { w: 64, h: 64 },
	pivot: { x: 32, y: 63 },
	baseItem: 'base',
	baseHash: 'sha256:base',
	directions: [
		{ id: 'south' },
		{ id: 'south-east' },
		{ id: 'west' },
		{ id: 'south-west', mirrorOf: 'south-east' }
	],
	animations: [
		{ id: 'idle', cells: 1, frames: [], loop: true },
		{ id: 'walk', cells: 8, frames: [], loop: true }
	]
};
const skeleton = {
	NECK: { x: 32, y: 12, z: 0 },
	'LEFT SHOULDER': { x: 24, y: 15, z: 0 },
	'RIGHT SHOULDER': { x: 40, y: 15, z: 0 },
	'LEFT HIP': { x: 28, y: 32, z: 0 },
	'RIGHT HIP': { x: 36, y: 32, z: 0 },
	'LEFT KNEE': { x: 28, y: 46, z: 0 },
	'RIGHT KNEE': { x: 36, y: 46, z: 0 }
} satisfies Skeleton;

test('the default Wardrobe order is separate from render order and names Body and Base', () => {
	const slots = slotLadder(rig);
	expect(
		slots
			.filter((slot) => !slot.wardrobeHidden)
			.sort((first, second) => first.wardrobeOrder! - second.wardrobeOrder!)
			.map((slot) => slot.id)
	).toEqual(DEFAULT_WARDROBE_ORDER.slice(0, 10));
	expect(slots.find((slot) => slot.id === 'body')?.label).toBe('Base');
	expect(slots.find((slot) => slot.id === 'torso_inner')?.label).toBe('Body');
	expect(slots.map((slot) => slot.z)).toEqual(
		[...slots.map((slot) => slot.z)].sort((first, second) => first - second)
	);
	expect(slots.filter((slot) => slot.id !== 'body' && slot.wardrobeHidden)).toHaveLength(6);
});

test('a copied face profile keeps the tiny-glyph palette exemption', () => {
	const layer = makeImg(64, 64);
	for (let pixel = 0; pixel < 4; pixel++)
		layer.data.set(pixel < 2 ? [90, 90, 90, 255] : [220, 40, 40, 255], pixel * 4);
	expect(designGraySmudges(createSlot('studs', 'face_acc'), 'ornament', layer)).toBe(false);
	expect(designGraySmudges('torso_inner', 'ornament', layer)).toBe(true);
});

test('manifest slots win, custom copies are independent, and unknown behavior never becomes a right hand', () => {
	const original = slotLadder(rig).find((slot) => slot.id === 'off_hand')!;
	const copy = createSlot('lantern', original, 'Lantern');
	expect(copy).toMatchObject({
		id: 'lantern',
		profile: 'off_hand',
		origin: 'off_hand',
		anchor: 'hand_l'
	});
	expect(requireSlot({ slots: [copy] }, copy.id)).toBe(copy);
	const configured = { ...slotOf('head'), z: 132 };
	expect(requireSlot([configured], 'head')).toBe(configured);
	expect(behaviorOf(copy)).toBe('off_hand');
	copy.zOverrides![0].z = 999;
	expect(original.zOverrides![0].z).not.toBe(999);
	expect(slotLadder(rig).find((slot) => slot.id === 'off_hand')?.zOverrides).toEqual(
		original.zOverrides
	);
	expect(() => requireSlot([], 'unknown')).toThrow('Unknown equipment slot');
	expect(() => behaviorOf({ id: 'unknown', class: 'held', z: 150 })).toThrow('behavior profile');
	expect(() => handOf({ id: 'unknown', class: 'held', profile: 'off_hand', z: 150 })).toThrow(
		'explicit left or right'
	);
	expect(() => createSlot('body')).toThrow('reserved');
});

test('slot ladders freshly clone nested clipping and near-off-hand overrides', () => {
	const first = slotLadder(rig),
		second = slotLadder(rig);
	const off = first.find((slot) => slot.id === 'off_hand')!;
	expect(off.zOverrides).toContainEqual({ layer: 'fg', z: 155, dir: 'west' });
	expect(
		off.zOverrides?.some((override) => override.layer === 'fg' && override.dir === 'south-west')
	).toBe(false);
	first.find((slot) => slot.id === 'head')!.clips!.push('lantern');
	expect(second.find((slot) => slot.id === 'head')!.clips).toEqual(['hair']);
	expect(SLOTS.find((slot) => slot.id === 'head')!.clips).toEqual(['hair']);
});

test.each(SLOTS.filter((slot) => slot.id !== 'body'))(
	'copying $id to an unrelated key preserves generation behavior',
	(original) => {
		const copy = createSlot('unrelated_key', original);
		expect(bandOf(copy, skeleton, 64)).toEqual(bandOf(original, skeleton, 64));
		expect(cutRows(copy, skeleton, 64)).toEqual(cutRows(original, skeleton, 64));
		expect(padOf(copy, 'skel', rig.cell)).toBe(padOf(original, 'skel', rig.cell));
		expect(
			dressItem({ slot: copy.id, slotConfig: copy, prompt: 'gold ornament', method: 'skel' })
		).toBe(dressItem({ slot: original.id, prompt: 'gold ornament', method: 'skel' }));
	}
);

test('copied off-hand slots mark the left wrist, keep padding and plan identical calls', () => {
	const copy = createSlot('lantern', 'off_hand');
	const image = makeImg(32, 32);
	for (let pixel = 0; pixel < 32 * 32; pixel++) image.data.set([80, 90, 100, 255], pixel * 4);
	const rest = [
		{ label: 'LEFT ARM', x: 0.25, y: 0.5, z: 0 },
		{ label: 'RIGHT ARM', x: 0.75, y: 0.5, z: 0 }
	];
	const marked = markHand(image, rest, copy, { w: 32, h: 32 });
	expect([...marked.data.slice((16 * 32 + 8) * 4, (16 * 32 + 8) * 4 + 4)]).toEqual(HAND_MARK);
	expect([...marked.data.slice((16 * 32 + 24) * 4, (16 * 32 + 24) * 4 + 4)]).toEqual([
		80, 90, 100, 255
	]);
	expect(padOf(copy, 'skel')).toBe(16);
	expect(f0Last(copy, rest, [rest, rest], rig.cell)).toBe(true);
	expect(
		dressItem({ slot: copy.id, slotConfig: copy, prompt: 'lantern', method: 'skel' })
	).toContain("character's left hand");
	const scope = {
		anims: ['idle', 'walk'],
		dirs: ['south'] as const,
		method: 'skel' as const,
		key: 'green' as const
	};
	expect(
		planItem(rig, { ...scope, dirs: [...scope.dirs], slot: copy.id, slotConfig: copy })
	).toEqual(planItem(rig, { ...scope, dirs: [...scope.dirs], slot: 'off_hand' }));
});

test.each(['underwear', 'torso_inner', 'torso_outer'] as const)(
	'%s uses the full clothing band',
	(id) => {
		expect(bandOf(id, skeleton, 64)).toEqual({ x: 0, y: 0, w: 1000, h: 64 });
		const repair = bandOf(id, skeleton, 64, 'repair');
		expect(repair.y).toBeGreaterThan(0);
		expect(repair.y + repair.h).toBeLessThan(64);
		expect(bandOf(createSlot('costume', id), skeleton, 64, 'repair')).toEqual(repair);
	}
);

test('Accessory defaults are worn, unrestricted, and above Body, Legs and Waist but below Outerwear', () => {
	const accessory = createSlot('trinket');
	expect(accessory).toMatchObject({
		label: 'Accessory',
		profile: 'accessory',
		class: 'worn',
		anchor: 'neck',
		z: 55
	});
	expect(padOf(accessory, 'skel')).toBe(0);
	expect(bandOf(accessory, skeleton, 64)).toEqual({ x: 0, y: 0, w: 1000, h: 64 });
	expect(slotOf('underwear')).toMatchObject({ class: 'worn', anchor: 'hip', z: 15 });
});

test('creative templates retain the description and do not replace protected held wording', () => {
	const slot = createSlot('lantern', 'off_hand');
	for (const template of [
		'ornate {{description}}',
		'ornate',
		'{{description}} and {{description}}'
	]) {
		slot.promptTemplate = template;
		expect(creativePrompt('copper lantern', slot)).toContain('copper lantern');
		const prompt = dressItem({
			slot: slot.id,
			slotConfig: slot,
			prompt: 'copper lantern',
			method: 'skel'
		});
		expect(prompt).toContain('copper lantern');
		expect(prompt).toContain('exactly one held item');
		expect(prompt).toContain("character's left hand");
	}
});

test('adding an item preserves custom render tie order and slot snapshots', () => {
	const accessory = createSlot('trinket');
	const hair = createSlot('strands', 'hair');
	const manifest: { slots: Slot[]; items: Item[] } = { slots: [hair, accessory], items: [] };
	const item = { id: 'charm', slot: accessory.id } as Item;
	putItem(manifest, item, slotLadder(rig));
	expect(manifest.slots).toEqual([hair, accessory]);
	expect(manifest.slots[1]).toBe(accessory);
});

test('copied slots retain material defaults independently of their keys', () => {
	const slot = createSlot('lantern', 'off_hand');
	expect(materialNames({ slot: slot.id, name: '', prompt: '' }, [['#aa6633']], [slot])).toEqual([
		'Wood'
	]);
});
