import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { drawList, resolvePreset } from '../../src/lib/runtime/paperdoll.js';
import { hasCompleteCells, missingFrames } from '../../src/lib/dress/dress.ts';
import { canRelocateItem, relocateItem } from '../../src/lib/items/relocate.ts';
import { requireSlot } from '../../src/lib/items/slots.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';

test('Face to Hair keeps frame references and outfits without losing painted back layers', () => {
	const manifest: Manifest = JSON.parse(
		readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);
	const face = requireSlot(manifest, 'face_acc');
	const hair = requireSlot(manifest, 'hair');
	hair.zOverrides = [{ layer: 'bg', z: 5, dir: 'south' }];
	const cape = manifest.items.find(({ id }) => id === 'cape_red')!;
	const faceItem = {
		...cape,
		slot: face.id,
		exportId: 'same-export-id',
		layers: [
			{
				...cape.layers[0],
				z: face.z + 2,
				cell: manifest.rig.cell,
				pivot: manifest.rig.pivot,
				cells: { walk: { south: Array.from({ length: 8 }, () => null) } }
			}
		]
	};
	manifest.items = manifest.items.map((item) => (item === cape ? faceItem : item));
	manifest.slots.push(face);
	manifest.presets = [
		{ id: 'on', name: 'On', items: { face_acc: faceItem.id }, variants: {} },
		{
			id: 'full',
			name: 'Full',
			items: { face_acc: faceItem.id, hair: 'hair_brown' },
			variants: {}
		},
		{ id: 'off', name: 'Off', items: { face_acc: null, hair: 'hair_brown' }, variants: {} }
	];

	expect(canRelocateItem(manifest, faceItem, requireSlot(manifest, 'head'))).toBe(true);
	expect(relocateItem(manifest, faceItem, requireSlot(manifest, 'neck'))).toBeUndefined();
	expect(relocateItem(manifest, faceItem, { ...hair, class: 'worn' })).toBeUndefined();
	expect(manifest.items.find(({ id }) => id === faceItem.id)).toBe(faceItem);
	const moved = relocateItem(manifest, faceItem, hair)!;
	expect(moved).toEqual({
		...faceItem,
		slot: hair.id,
		layers: [
			{ ...faceItem.layers[0], id: 'fg', z: hair.z + 2 },
			{
				id: 'bg',
				role: 'bg',
				z: hair.bgZ,
				cell: faceItem.layers[0].cell,
				pivot: faceItem.layers[0].pivot,
				cells: { walk: { south: Array.from({ length: 8 }, () => null) } }
			}
		]
	});
	expect(
		drawList(manifest, { hair: moved.id }, 'walk', 'south', 0)
			.filter(({ item }) => item.id === moved.id)
			.map(({ layer, z }) => [layer.role, z])
	).toEqual([
		['bg', 5],
		['fg', hair.z + 2]
	]);
	expect(hasCompleteCells(manifest, moved, 'walk', 'south')).toBe(true);
	expect(hasCompleteCells(manifest, moved, 'walk', 'east')).toBe(false);
	expect(missingFrames(manifest, moved, 'walk', 'south')).toEqual([]);
	expect(resolvePreset(manifest, 'on').items).toMatchObject({ face_acc: null, hair: moved.id });
	expect(resolvePreset(manifest, 'off').items).toMatchObject({
		face_acc: null,
		hair: 'hair_brown'
	});
	expect(resolvePreset(manifest, 'full').items).toMatchObject({
		face_acc: null,
		hair: 'hair_brown'
	});
	expect(canRelocateItem(manifest, moved, requireSlot(manifest, 'main_hand'))).toBe(false);
	expect(canRelocateItem(manifest, moved, face)).toBe(true);
	moved.layers[1].cells = { walk: { south: [`sha256:${'b'.repeat(64)}`] } };
	expect(relocateItem(manifest, moved, face)).toBeUndefined();
	expect(manifest.items.find(({ id }) => id === moved.id)).toBe(moved);
});
