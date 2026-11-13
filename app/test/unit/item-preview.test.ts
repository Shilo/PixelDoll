import { expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { crop, itemCell, itemPreviewFrames, thumbCell } from '../../src/studio/model.ts';

test('animated item previews use one crop across all frames without losing artwork', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
	const cape = project.manifest.items.find((it) => it.name === 'Red cape')!;
	const clip = project.manifest.rig.animations.find((a) => a.id === 'walk')!;
	const originals = clip.frames.map((f) =>
		project.manifest.rig.directions.map((d) => itemCell(project, cape, clip.id, d.id, f.cell))
	);
	expect(new Set(originals.flat().map((im) => crop(im)?.h)).size).toBeGreaterThan(1);
	const preview = itemPreviewFrames(project, cape, clip.id);
	expect(preview).toHaveLength(clip.frames.length);
	expect(new Set(preview.flat().map((im) => `${im.w}x${im.h}`)).size).toBe(1);
	const opaquePixels = (im: (typeof preview)[number][number]) =>
		im.data.reduce((n, v, i) => n + Number(i % 4 === 3 && v > 0), 0);
	expect(preview.map((views) => views.map(opaquePixels))).toEqual(
		originals.map((views) => views.map(opaquePixels))
	);
	expect(itemPreviewFrames(project, cape, 'missing')).toEqual([]);
});

test('item-only thumbnails and inspector frames use canonical depth overrides', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
	const cape = project.manifest.items.find((item) => item.name === 'Red cape')!;
	project.manifest.rig.animations = [
		{
			id: 'walk',
			cells: 2,
			loop: true,
			frames: [
				{ cell: 0, ms: 100 },
				{ cell: 1, ms: 100 }
			]
		}
	];
	project.manifest.rig.directions = [
		{ id: 'south' },
		{ id: 'east' },
		{ id: 'west', mirrorOf: 'east' }
	];
	project.manifest.slots.find((slot) => slot.id === cape.slot)!.zOverrides = [
		{ layer: 'fg', anim: 'walk', cell: 0, z: 10 }
	];
	project.images.set('sha256:blue', { w: 1, h: 1, data: new Uint8ClampedArray([0, 0, 255, 255]) });
	project.images.set('sha256:red', { w: 1, h: 1, data: new Uint8ClampedArray([255, 0, 0, 255]) });
	cape.layers = [
		{
			id: 'bg',
			role: 'bg',
			z: 20,
			cell: { w: 1, h: 1 },
			pivot: { x: 0, y: 0 },
			cells: {
				walk: { south: ['sha256:blue', 'sha256:blue'], east: ['sha256:blue', 'sha256:blue'] }
			}
		},
		{
			id: 'fg',
			role: 'fg',
			z: 30,
			cell: { w: 1, h: 1 },
			pivot: { x: 0, y: 0 },
			cells: { walk: { south: ['sha256:red', 'sha256:red'], east: ['sha256:red', 'sha256:red'] } }
		}
	];
	for (const direction of ['south', 'east', 'west'] as const) {
		expect([...itemCell(project, cape, 'walk', direction, 0).data]).toEqual([0, 0, 255, 255]);
		expect([...itemCell(project, cape, 'walk', direction, 1).data]).toEqual([255, 0, 0, 255]);
	}
	expect([...thumbCell(project, cape)!.data]).toEqual([0, 0, 255, 255]);
	expect(
		itemPreviewFrames(project, cape, 'walk').map((frames) => frames.map((image) => [...image.data]))
	).toEqual([
		Array.from({ length: 3 }, () => [0, 0, 255, 255]),
		Array.from({ length: 3 }, () => [255, 0, 0, 255])
	]);
});
