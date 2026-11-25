import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { cellImg, composeCell, layerFrame } from '../../src/lib/compose/compose.ts';
import { validate } from '../../src/lib/export/generic.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { DEFAULT_MOVE, cellHash, playlist } from '../../src/lib/rig/rig.ts';
import { projectEntries, readCharacterZip } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';
import {
	appearancePrompt,
	appearanceSource,
	editedCharacter,
	editedItem
} from '../../src/studio/appearanceSource.ts';

const fixture = () =>
	loadFixture((path) => readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)));

test('publishes edited Standing as a new character without carrying move art, skeletons, gear or mirror requests', async () => {
	const source = await fixture();
	const { rig, items } = source.manifest;
	const original = items.find(({ id }) => id === rig.baseItem)!;
	original.layers[0].cells![DEFAULT_MOVE] = Object.fromEntries(
		rig.directions
			.filter(({ mirrorOf }) => !mirrorOf)
			.map(({ id }) => [id, [original.layers[0].cells!.walk![id]![0]]])
	);
	rig.animations.push({ id: DEFAULT_MOVE, cells: 1, frames: playlist(1, 150), loop: true });
	const target = { projectId: 'rig-source' };
	const frozen = await appearanceSource(source, target);
	expect(frozen?.views.map(({ direction }) => direction)).toEqual(['south', 'east', 'north']);
	const results = await Promise.all(
		frozen!.views.map(async ({ direction, image }) => {
			const changed = structuredClone(image);
			for (let i = 0; i < changed.data.length; i += 4)
				if (changed.data[i + 3]) changed.data[i] ^= 1;
			return { direction, image: changed, hash: await cellHash(changed) };
		})
	);
	const copy = await editedCharacter(source, results, 'Change the shirt', []);
	expect(validate(copy)).toEqual([]);
	const reread = await readCharacterZip(await zip(await projectEntries(copy)));
	const after = await appearanceSource(reread.project, target);
	expect(after?.views.map(({ hash }) => hash)).toEqual(results.map(({ hash }) => hash));
	expect(reread.project.manifest.rig.pivot).toEqual(rig.pivot);
	expect(reread.project.manifest.rig.animations.map(({ id }) => id)).toEqual([DEFAULT_MOVE]);
	expect(reread.project.manifest.rig.rest).toBeUndefined();
	expect(reread.project.manifest.items).toHaveLength(1);
	expect(rig.animations.some(({ id }) => id === 'walk')).toBe(true);
	expect((await appearanceSource(source, target))?.version).toBe(frozen?.version);
});

test('edits an imported padded item using its pixels and keeps the reviewed move frame and pivot', async () => {
	const project = await fixture();
	const { rig, items } = project.manifest;
	const item = items.find(({ slot }) => slot === 'main_hand')!;
	const layer = item.layers[0];
	item.layers = [layer];
	layer.cell = { w: 96, h: 96 };
	layer.pivot = { x: rig.pivot.x + 16, y: rig.pivot.y + 16 };
	const pixels = makeImg(96, 96);
	pixels.data.set([218, 185, 143, 255], (54 * 96 + 55) * 4);
	const originalHash = await cellHash(pixels);
	project.images.set(originalHash, pixels);
	layer.cells = { walk: { south: [originalHash] } };
	item.prompt = '';
	const source = await appearanceSource(project, {
		projectId: 'rig-source',
		itemId: item.id,
		clip: 'walk'
	});
	expect(source?.size).toEqual({ width: 96, height: 96 });
	expect(source?.views.map(({ hash }) => hash)).toEqual([originalHash]);
	const changed = structuredClone(pixels);
	changed.data.set([233, 185, 100, 255], (55 * 96 + 55) * 4);
	const hash = await cellHash(changed);
	const result = await editedItem(
		project,
		source!,
		[{ hash, direction: 'south', image: changed }],
		'edited-sword',
		'Edited sword',
		'Change the hilt',
		[]
	);
	expect(result.item.coverage).toEqual(['walk/south/0']);
	expect(layerFrame(rig, result.item.layers[0])).toEqual(layerFrame(rig, layer));
	expect(result.item.id).not.toBe(item.id);
	expect(result.item.layers[0].cells!.walk!.south).toEqual([hash]);
	expect(cellImg(project, layer, 'walk', 'south', 0)).toBe(pixels);
	const combined = {
		manifest: { ...project.manifest, items: [...items, result.item] },
		images: new Map([...project.images, ...result.images])
	};
	expect(
		composeCell(
			combined,
			{ [item.slot]: result.item.id },
			'walk',
			'south',
			0,
			layerFrame(rig, layer)
		).w
	).toBe(96);
});

test('character presets change clothing without asking for a new pose or hairstyle', () => {
	expect(appearancePrompt('underwear', '', false)).toContain('plain white underwear');
	expect(appearancePrompt('bare', '', false)).toContain('nothing worn');
	expect(appearancePrompt('custom', '  ', false)).toBe('');
	expect(appearancePrompt('custom', 'Change the hilt', true)).toContain('only the equipment');
});
