import { expect, test } from 'vitest';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { slotLadder } from '../../src/lib/items/items.ts';
import { namesOffHandItem } from '../../src/studio/model.ts';
import type { Img } from '../../src/lib/image/png.ts';
import type { RigDirection } from '../../src/lib/rig/rig.ts';
import type { Item, Layer, Manifest, Project } from '../../src/lib/store/manifest.ts';

// One 3x1 cell (red channel = which layer shows): the held items overlap only on the center pixel, which a mirror keeps in place.
const px = (...r: number[]): Img => ({
	w: 3,
	h: 1,
	data: new Uint8ClampedArray(r.flatMap((v) => [v, 0, 0, v ? 255 : 0]))
});
const images = new Map<string, Img>([
	['sha256:body', px(1, 1, 1)],
	['sha256:main', px(2, 2, 0)],
	['sha256:off', px(0, 3, 3)]
]);
const layer = (z: number, h: string, dirs: string[]): Layer =>
	({
		id: 'fg',
		role: 'fg',
		z,
		cells: { idle: Object.fromEntries(dirs.map((d) => [d, [h]])) }
	}) as Layer;

function project(directions: RigDirection[]): Project {
	const generated = directions.filter((d) => !d.mirrorOf).map((d) => d.id),
		ladder = slotLadder({ directions });
	const slot = (id: string) => ladder.find((s) => s.id === id)!;
	const item = (id: string, slotId: string, z: number, h: string) =>
		({ id, slot: slotId, layers: [layer(z, h, generated)] }) as unknown as Item;
	return {
		manifest: {
			rig: { cell: { w: 3, h: 1 }, pivot: { x: 0, y: 0 }, baseItem: 'base', directions },
			slots: [slot('body'), slot('off_hand'), slot('main_hand')],
			items: [
				item('base', 'body', 10, 'sha256:body'),
				item('shield', 'off_hand', 140, 'sha256:off'),
				item('sword', 'main_hand', 150, 'sha256:main')
			]
		} as unknown as Manifest,
		images
	};
}
const both = { main_hand: 'sword', off_hand: 'shield' };
const front = (p: Project, dir: Parameters<typeof composeCell>[3]) =>
	composeCell(p, both, 'idle', dir, 0).data[4];

test('a main-hand and an off-hand item are worn together and both compose', () => {
	const p = project([{ id: 'south' }, { id: 'east' }]);
	const out = composeCell(p, both, 'idle', 'south', 0);
	expect([out.data[0], out.data[4], out.data[8]]).toEqual([2, 2, 3]);
	expect(composeCell(p, { main_hand: 'sword' }, 'idle', 'south', 0).data[8]).toBe(1);
	expect(composeCell(p, { off_hand: 'shield' }, 'idle', 'south', 0).data[0]).toBe(1);
});

test('the off hand draws over the main hand only in generated left-side views', () => {
	const generated = project([
		{ id: 'east' },
		{ id: 'west' },
		{ id: 'south-west' },
		{ id: 'north-west' }
	]);
	expect(front(generated, 'east')).toBe(2);
	for (const dir of ['west', 'south-west', 'north-west'] as const)
		expect(front(generated, dir), dir).toBe(3);
	// A mirrored west flips east's pixels, where the main hand is the near hand.
	const mirrored = project([{ id: 'east' }, { id: 'west', mirrorOf: 'east' }]);
	expect(front(mirrored, 'west')).toBe(2);
});

test('the default ladder only adds near-hand order for generated left-side views', () => {
	const offFg = (directions: RigDirection[]) =>
		slotLadder({ directions })
			.find((s) => s.id === 'off_hand')!
			.zOverrides!.filter((o) => o.layer === 'fg')
			.map((o) => o.dir);
	expect(offFg([{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }])).toEqual([]);
	expect(offFg([{ id: 'west' }, { id: 'south-west', mirrorOf: 'south-east' }])).toEqual(['west']);
	const main = slotLadder({ directions: [{ id: 'west' }] }).find((s) => s.id === 'main_hand')!;
	expect(main.zOverrides!.every((o) => o.layer === 'bg')).toBe(true);
});

test('the New item hint recognizes shields and bows by the item subject only', () => {
	for (const p of [
		'a wooden longbow',
		'short bow',
		'Round Shield',
		'a wooden targe',
		'a tall pavise',
		'a black and gold kite shield',
		'a pair of bucklers',
		'a wooden longbow with a leather grip'
	])
		expect(namesOffHandItem(p), p).toBe(true);
	for (const p of [
		'steel sword',
		'a crossbow',
		'elbow pads',
		'rainbow staff',
		'shield-breaker axe',
		'a steel sword with a scutum emblem',
		'a mace engraved with a bow'
	])
		expect(namesOffHandItem(p), p).toBe(false);
});
