import { expect, test } from 'vitest';
import {
	croppedThumbnail,
	characterStill,
	keepThumbnails,
	newest,
	stills
} from '../../src/studio/experience/thumbnails.svelte.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';

test('selected thumbnails share composition and cropping until their outfit or artwork changes', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL('../../public/fixtures/s2/' + path, import.meta.url)))
	);
	const items = project.manifest.presets[0].items;
	const first = characterStill(project, items, 1);
	const crop = croppedThumbnail(first.image!);
	expect(characterStill(project, { ...items }, 1)).toBe(first);
	expect(croppedThumbnail(characterStill(project, items, 1).image!)).toBe(crop);
	expect(first.facts).toBe('64 px · 4 directions · 2 moves · 6 items');
	const unequipped = Object.fromEntries(Object.keys(items).map((slot) => [slot, null]));
	const changed = characterStill(project, unequipped, 1);
	expect(changed).not.toBe(first);
	expect(changed.image?.data).not.toEqual(first.image?.data);
	expect(characterStill(project, unequipped, 1)).toBe(changed);
	const revised = characterStill(project, unequipped, 2);
	expect(revised).not.toBe(changed);
	expect(characterStill(project, unequipped, 2)).toBe(revised);
	const replaced = { ...project };
	expect(characterStill(replaced, unequipped, 2)).not.toBe(revised);
});

test('character list crops are shared per still image and preserve all visible pixels', () => {
	const image = makeImg(80, 64);
	image.data.set([30, 60, 90, 1], (7 * 80 + 6) * 4);
	image.data.set([90, 60, 30, 255], (51 * 80 + 69) * 4);
	const cropped = croppedThumbnail(image)!;
	expect([cropped.w, cropped.h]).toEqual([64, 45]);
	expect([...cropped.data.slice(0, 4)]).toEqual([30, 60, 90, 1]);
	expect([...cropped.data.slice(-4)]).toEqual([90, 60, 30, 255]);
	expect(croppedThumbnail(image)).toBe(cropped);
	expect(croppedThumbnail(cropped)).toBe(cropped);
	expect([image.w, image.h]).toEqual([80, 64]);
	const replacement = makeImg(80, 64);
	replacement.data.set([1, 2, 3, 255], (20 * 80 + 10) * 4);
	expect(croppedThumbnail(replacement)).not.toBe(cropped);
	expect(croppedThumbnail(replacement)?.w).toBe(1);
	const empty = makeImg(64, 64);
	expect(croppedThumbnail(empty)).toBeNull();
	expect(croppedThumbnail(empty)).toBeNull();
});

test('a complete listing drops the thumbnails of characters no longer listed', () => {
	const frame = { x: 0, y: 0, w: 64, h: 64 };
	const still = { look: '', image: null, frame, body: frame, facts: '' };
	stills.set('rig-kept', still);
	stills.set('rig-deleted', still);
	newest.set('rig-deleted', { look: '', reading: true }); // a read still running for it
	keepThumbnails(new Set(['fixture:s2', 'rig-kept']));
	expect([...stills.keys()]).toEqual(['rig-kept']);
	expect(newest.has('rig-deleted')).toBe(false);
});
