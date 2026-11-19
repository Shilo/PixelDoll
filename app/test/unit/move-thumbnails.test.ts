import { beforeAll, beforeEach, expect, test, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { bakedFrame, composeCell } from '../../src/lib/compose/compose.ts';
import { recolor } from '../../src/lib/dress/dress.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import type { Preset, Project } from '../../src/lib/store/manifest.ts';
import { moveThumbnails as createMoveThumbnails } from '../../src/studio/moveThumbnails.ts';
import { crop } from '../../src/studio/model.ts';
import {
	buildPresentation,
	renderPresentation,
	resolvePreview
} from '../../src/studio/experience/presentation.ts';
import { expectPixels } from './pixels.ts';

vi.mock('../../src/lib/compose/compose.ts', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../src/lib/compose/compose.ts')>();
	return { ...actual, composeCell: vi.fn(actual.composeCell) };
});

let source: Project;
const moveThumbnails = (project: Project, items: Preset['items']) =>
	createMoveThumbnails(buildPresentation(project), items);
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
	expect(preview('cross-punch', 'south', 0)).not.toBe(images[0]);
	expect(composeCell).toHaveBeenCalledTimes(5);
});

test('move thumbnails retain all visible pixels at a fixed scale without fitting to unworn gear', () => {
	const project = structuredClone(source);
	const items = { head: 'hat_wizard' };
	const clip = project.manifest.rig.animations[0];
	const unworn = project.manifest.items.find(({ id }) => id === 'sword_steel')!;
	unworn.layers[0].cell = { w: 256, h: 256 };
	const thumbnails = moveThumbnails(project, items);
	const first = thumbnails(clip.id, 'south', 0)!;
	for (const [index, { cell }] of clip.frames.entries()) {
		const stage = composeCell(project, items, clip.id, 'south', cell, bakedFrame(project.manifest));
		const image = thumbnails(clip.id, 'south', index)!;
		expectPixels(crop(image)!, crop(stage)!);
		expect([image.w, image.h]).toEqual([first.w, first.h]);
	}
	expect(first.h).toBeLessThan(64);
});

test('large move frames use a bounded FIFO pixel budget and oversized frames are not retained', () => {
	const project = structuredClone(source);
	const { rig, items } = project.manifest;
	const move = rig.animations[0];
	move.cells = 17;
	move.frames = Array.from({ length: move.cells }, (_, cell) => ({ cell, ms: 100 }));
	const base = items.find((item) => item.id === rig.baseItem)!;
	const setBodySize = (size: number) => {
		rig.cell = { w: size, h: size };
		const square = makeImg(size, size);
		square.data[3] = 255;
		square.data[square.data.length - 1] = 255;
		const hash = 'sha256:large';
		project.images.set(hash, square);
		for (const layer of base.layers) layer.cells![move.id].south = Array(move.cells).fill(hash);
	};
	setBodySize(256);
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
	setBodySize(1025);
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
	expect(unequipped!.data).not.toEqual(first!.data);
	const base = project.manifest.items.find((item) => item.id === project.manifest.rig.baseItem)!;
	const hash = base.layers[0].cells![clip].south![0]!;
	const revisedArt = makeImg(64, 64);
	revisedArt.data.set([255, 0, 0, 255]);
	project.images.set(hash, revisedArt);
	preview = moveThumbnails(project, { ...items });
	const revised = preview(clip, 'south', 0);
	expect(revised!.data).not.toEqual(unequipped!.data);
	for (const item of project.manifest.items)
		for (const layer of item.layers) layer.cell ??= project.manifest.rig.cell;
	project.manifest.rig.cell = { w: 96, h: 96 };
	preview = moveThumbnails(project, { ...items });
	expectPixels(preview(clip, 'south', 0)!, revised!);
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
	expect(image!.data).not.toEqual(original!.data);
	expect(preview(clip, 'south', 0)).toBe(image);
});

test('move thumbnails show hair when headgear lacks a later frame, matching the selected preview', () => {
	const project = structuredClone(source);
	const hat = project.manifest.items.find((item) => item.id === 'hat_wizard')!;
	hat.hides = ['hair'];
	const items = { head: hat.id, hair: 'hair_brown' };
	const clip = 'walk';
	const direction = 'south';
	const row = hat.layers[0].cells![clip][direction]!;
	row.pop();
	const assets = buildPresentation(project);
	const pose = resolvePreview(assets, { clip, direction });
	const stage = renderPresentation(assets, items, pose);
	expect(stage.hiddenItems.map((item) => item.id)).toEqual([hat.id]);
	const thumbnail = moveThumbnails(project, items)(clip, direction, 0)!;
	expectPixels(crop(thumbnail)!, crop(stage.image!)!);
	expect(crop(thumbnail)!.data).not.toEqual(
		crop(renderPresentation(assets, {}, pose).image!)!.data
	);
});
