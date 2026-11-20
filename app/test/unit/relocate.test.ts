import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { resolvePreset } from '../../src/lib/runtime/paperdoll.js';
import { canRelocateItem, relocateItem } from '../../src/lib/items/relocate.ts';
import { requireSlot } from '../../src/lib/items/slots.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';

test('Face to Hair keeps frame references and outfits without losing painted back layers', () => {
	const manifest: Manifest = JSON.parse(
		readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);
	const face = requireSlot(manifest, 'face_acc');
	const hair = requireSlot(manifest, 'hair');
	const cape = manifest.items.find(({ id }) => id === 'cape_red')!;
	const faceItem = {
		...cape,
		slot: face.id,
		exportId: 'same-export-id',
		layers: [{ ...cape.layers[0], z: face.z + 2 }]
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

	const moved = relocateItem(manifest, faceItem, hair)!;
	expect(moved).toEqual({
		...faceItem,
		slot: hair.id,
		layers: [
			{ ...faceItem.layers[0], id: 'fg', z: hair.z + 2 },
			{ id: 'bg', role: 'bg', z: hair.bgZ, cells: {} }
		]
	});
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
