import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import type { Project } from '../../src/lib/store/manifest.ts';
import { moveThumbnails } from '../../src/studio/moveThumbnails.ts';
import { expectPixels } from './pixels.ts';

vi.mock('../../src/lib/compose/compose.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/lib/compose/compose.ts')>();
	return { ...actual, composeCell: vi.fn(actual.composeCell) };
});

let source: Project;
beforeAll(async () => {
	source = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
});
beforeEach(() => {
	vi.mocked(composeCell).mockClear();
});

test('move thumbnails lazily compose each distinct cell once across repeated loops', () => {
	const items = source.manifest.presets[0].items;
	const clip = source.manifest.rig.animations[0];
	const cells = [0, 1, 0, 2, 1, 2, 0, 1, 2, 0, 1, 2];
	for (const cell of cells) composeCell(source, items, clip.id, 'south', cell);
	expect(composeCell).toHaveBeenCalledTimes(12);
	vi.mocked(composeCell).mockClear();
	const preview = moveThumbnails(source, items);
	expect(composeCell).not.toHaveBeenCalled();
	const images = cells.map((cell) => preview(clip.id, 'south', cell));
	expect(composeCell).toHaveBeenCalledTimes(3);
	expect(images[2]).toBe(images[0]);
	expect(images[4]).toBe(images[1]);
	expect(images[5]).toBe(images[3]);
	expect(preview(clip.id, 'east', 0)).not.toBe(images[0]);
	expect(preview('another-move', 'south', 0)).not.toBe(images[0]);
	expect(composeCell).toHaveBeenCalledTimes(5);
});

test('move thumbnails retain the fixed bottom-centered window without per-frame trim', () => {
	const items = source.manifest.presets[0].items;
	const clip = source.manifest.rig.animations[0];
	const original = composeCell(source, items, clip.id, 'south', 0);
	const image = moveThumbnails(source, items)(clip.id, 'south', 0);
	expect([image.w, image.h]).toEqual([56, 56]);
	for (let row = 0; row < 56; row++)
		expect(image.data.slice(row * 56 * 4, (row + 1) * 56 * 4)).toEqual(
			original.data.slice(((row + 8) * 64 + 4) * 4, ((row + 8) * 64 + 60) * 4)
		);
	const smaller = structuredClone(source);
	smaller.manifest.rig.cell = { w: 48, h: 48 };
	const untrimmed = moveThumbnails(smaller, items)(clip.id, 'south', 0);
	expectPixels(untrimmed, composeCell(smaller, items, clip.id, 'south', 0));
});

test('large move frames use a bounded FIFO pixel budget and oversized frames are not retained', () => {
	const project = structuredClone(source);
	project.manifest.rig.cell = { w: 256, h: 256 };
	const preview = moveThumbnails(project, {});
	const clip = project.manifest.rig.animations[0].id;
	const first = preview(clip, 'south', 0);
	const second = preview(clip, 'south', 1);
	for (let cell = 2; cell < 16; cell++) preview(clip, 'south', cell);
	expect(preview(clip, 'south', 0)).toBe(first);
	preview(clip, 'south', 16);
	expect(preview(clip, 'south', 1)).toBe(second);
	expect(preview(clip, 'south', 0) === first).toBe(false);
	expect(composeCell).toHaveBeenCalledTimes(18);
	project.manifest.rig.cell = { w: 1025, h: 1025 };
	const oversized = moveThumbnails(project, {});
	expect(oversized(clip, 'south', 0) === oversized(clip, 'south', 0)).toBe(false);
});

test('a new generation reflects replacement projects, in-place slots, raw artwork and metadata revisions', () => {
	const project = structuredClone(source);
	const items = { ...project.manifest.presets[0].items };
	const clip = project.manifest.rig.animations[0].id;
	let preview = moveThumbnails(project, { ...items });
	const first = preview(clip, 'south', 0);
	for (const slot of Object.keys(items)) items[slot] = null;
	preview = moveThumbnails(project, { ...items });
	const unequipped = preview(clip, 'south', 0);
	expect(unequipped.data).not.toEqual(first.data);
	const base = project.manifest.items.find((item) => item.id === project.manifest.rig.baseItem)!;
	const hash = base.layers[0].cells![clip].south![0]!;
	project.images.set(hash, makeImg(64, 64));
	preview = moveThumbnails(project, { ...items });
	const revised = preview(clip, 'south', 0);
	expect(revised.data).not.toEqual(unequipped.data);
	project.manifest.rig.cell = { w: 96, h: 96 };
	preview = moveThumbnails(project, { ...items });
	expect(preview(clip, 'south', 0).w).toBe(96);
	const replaced = moveThumbnails(structuredClone(project), { ...items });
	expect(replaced(clip, 'south', 0)).not.toBe(preview(clip, 'south', 0));
});

test('recolored project generations do not reuse pixels from another palette', () => {
	const project = structuredClone(source);
	const items = {};
	const clip = project.manifest.rig.animations[0].id;
	const base = project.manifest.items.find((item) => item.id === project.manifest.rig.baseItem)!;
	const hash = base.layers[0].cells![clip].south![0]!;
	const art = makeImg(64, 64);
	art.data.set([17, 34, 51, 255], (32 * 64 + 32) * 4);
	project.images.set(hash, art);
	project.manifest.materials = [
		{
			id: 'skin',
			label: 'Skin',
			owner: base.id,
			ramp: ['#112233'],
			variants: { pink: ['#ff00ff'] }
		}
	];
	base.materials = ['skin'];
	const original = moveThumbnails(project, items)(clip, 'south', 0);
	const colored = recolor(project, { skin: 'pink' });
	const preview = moveThumbnails(colored, items);
	const image = preview(clip, 'south', 0);
	expect(image.data).not.toEqual(original.data);
	expect(preview(clip, 'south', 0)).toBe(image);
});
