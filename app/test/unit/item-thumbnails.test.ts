import { beforeAll, expect, test } from 'vitest';
import { readFile } from 'node:fs/promises';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import type { Item, Project } from '../../src/lib/store/manifest.ts';
import type { Sha256 } from '../../src/lib/rig/rig.ts';
import { flipH } from '../../src/lib/rig/mirror.ts';
import { crop, thumbCell } from '../../src/studio/model.ts';
import { expectPixels } from './pixels.ts';

let source: Project;
const hash = (id: number): Sha256 => `sha256:${id.toString(16).padStart(64, '0')}`;
beforeAll(async () => {
	source = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
});

function fixture(images: Map<string, Img>, cells: NonNullable<Item['layers'][number]['cells']>) {
	const clip = source.manifest.rig.animations[0];
	const item: Item = {
		...structuredClone(source.manifest.items.find((i) => i.slot === 'head')!),
		layers: [{ id: 'main', role: 'fg', z: 1, cells }]
	};
	const project: Project = {
		images,
		manifest: {
			...source.manifest,
			items: [item],
			rig: {
				...source.manifest.rig,
				directions: [{ id: 'east' }, { id: 'south' }, { id: 'west', mirrorOf: 'east' }],
				animations: [
					{
						...clip,
						cells: 2,
						frames: [
							{ ...clip.frames[0], cell: 0 },
							{ ...clip.frames[0], cell: 1 }
						]
					}
				]
			}
		}
	};
	return { project, item, anim: clip.id };
}
function art(
	w: number,
	h: number,
	x: number,
	y: number,
	width: number,
	height: number,
	alpha = 255
) {
	const im = makeImg(w, h);
	for (let row = y; row < y + height; row++)
		for (let col = x; col < x + width; col++)
			im.data.set([37, 89, 173, alpha], (row * w + col) * 4);
	return im;
}

test('thumbnails prefer south, fall back to a landed direction, and find later populated frames', () => {
	const south = art(64, 64, 10, 12, 24, 5),
		east = art(64, 64, 2, 2, 6, 30),
		empty = makeImg(64, 64);
	const f = fixture(
		new Map([
			[hash(1), south],
			[hash(2), east],
			[hash(3), empty]
		]),
		{}
	);
	f.item.layers[0].cells = { [f.anim]: { east: [hash(2)], south: [hash(1)] } };
	expectPixels(crop(thumbCell(f.project, f.item)!), crop(south));
	f.item.layers[0].cells![f.anim].south = [null];
	expectPixels(crop(thumbCell(f.project, f.item)!), crop(east));
	f.item.layers[0].cells![f.anim].south = [hash(3), hash(1)];
	expectPixels(crop(thumbCell(f.project, f.item)!), crop(south));
});

test.each([
	[64, 64, 16, 20, 32, 5, 255], // Padded hair.
	[160, 4, 0, 0, 160, 4, 255], // Wide, opaque and unpadded.
	[3, 144, 0, 0, 3, 144, 255], // Tall, opaque and unpadded.
	[96, 96, 0, 0, 96, 96, 255], // Opaque oversized layer.
	[64, 64, 63, 63, 1, 1, 1], // An almost-transparent edge pixel still belongs to the item.
	[64, 64, 6, 9, 28, 17, 127] // Partial alpha.
])('crop preserves every visible pixel for %ix%i artwork', (w, h, x, y, width, height, alpha) => {
	const im = art(w, h, x, y, width, height, alpha),
		f = fixture(new Map([[hash(1), im]]), {});
	f.item.layers[0] = {
		...f.item.layers[0],
		cell: { w, h },
		cells: { [f.anim]: { south: [hash(1)] } }
	};
	const thumb = crop(thumbCell(f.project, f.item)!)!;
	expect([thumb.w, thumb.h]).toEqual([width, height]);
	expectPixels(thumb, art(width, height, 0, 0, width, height, alpha));
});

test('empty, missing and fully transparent items have no thumbnail', () => {
	const f = fixture(new Map([[hash(1), makeImg(64, 64)]]), {});
	expect(thumbCell(f.project, f.item)).toBeNull();
	f.item.layers[0].cells = { [f.anim]: { south: [hash(2), hash(1)] } };
	expect(thumbCell(f.project, f.item)).toBeNull();
	f.item.layers = [];
	expect(thumbCell(f.project, f.item)).toBeNull();
});

test('preferred mirrored views flip the item, while an explicit transparent view stays transparent', () => {
	const image = art(64, 64, 4, 7, 2, 2);
	image.data.set([211, 32, 71, 255], (7 * 64 + 5) * 4);
	const f = fixture(new Map([[hash(1), image]]), {});
	f.project.manifest.rig.directions = [{ id: 'south', mirrorOf: 'east' }, { id: 'east' }];
	f.item.layers[0].cells = { [f.anim]: { east: [hash(1)] } };
	expectPixels(crop(thumbCell(f.project, f.item)!), flipH(crop(image)!));
	f.item.layers[0].cells![f.anim].south = [null];
	expectPixels(crop(thumbCell(f.project, f.item)!), crop(image));
});

test('thumbnail composition preserves bg/fg pixels and oversized layer pivots', () => {
	const bg = art(96, 96, 0, 0, 2, 2),
		fg = art(64, 64, 4, 7, 2, 2),
		f = fixture(
			new Map([
				[hash(1), bg],
				[hash(2), fg]
			]),
			{}
		);
	const pivot = source.manifest.rig.pivot;
	f.item.layers = [
		{ id: 'fg', role: 'fg', z: 2, cells: { [f.anim]: { south: [hash(2)] } } },
		{
			id: 'bg',
			role: 'bg',
			z: 1,
			cell: { w: 96, h: 96 },
			pivot: { x: pivot.x + 16, y: pivot.y + 16 },
			cells: { [f.anim]: { south: [hash(1)] } }
		}
	];
	const thumb = crop(thumbCell(f.project, f.item)!)!;
	expect([thumb.w, thumb.h]).toEqual([22, 25]);
	expect(thumb.data.slice(0, 4)).toEqual(bg.data.slice(0, 4));
	expect(thumb.data.slice((23 * thumb.w + 20) * 4, (23 * thumb.w + 20) * 4 + 4)).toEqual(
		fg.data.slice((7 * 64 + 4) * 4, (7 * 64 + 4) * 4 + 4)
	);
});

test('shared hashes use each layer owner’s rendered palette and reflect a replacement image', () => {
	const original = art(64, 64, 0, 0, 2, 2),
		colored = art(64, 64, 0, 0, 2, 2);
	colored.data.set([211, 32, 71, 255], 0);
	const f = fixture(new Map([[hash(1), original]]), {});
	f.item.layers[0].cells = { [f.anim]: { south: [hash(1)] } };
	const other = { ...f.item, layers: [{ ...f.item.layers[0] }] };
	f.project.layerImages = new Map([[other.layers[0], new Map([[hash(1), colored]])]]);
	expectPixels(crop(thumbCell(f.project, f.item)!), crop(original));
	expectPixels(crop(thumbCell(f.project, other)!), crop(colored));
	f.project.images.set(hash(1), colored);
	expectPixels(crop(thumbCell(f.project, f.item)!), crop(colored));
});
