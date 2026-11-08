import { expect, test } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { hiddenViews } from '../../src/lib/items/items.ts';

const w = 64;
const paint = (im: Img, x0: number, y0: number, x1: number, y1: number) => {
	for (let y = y0; y <= y1; y++)
		for (let x = x0; x <= x1; x++) im.data.set([120, 80, 40, 255], (y * w + x) * 4);
};
const body = () => {
	const b = makeImg(w, w);
	for (let y = 10; y < 60; y++)
		for (let x = 24; x < 40; x++) b.data.set([170, 120, 90, 255], (y * w + x) * 4);
	return b;
};
function views(draw: Partial<Record<'south' | 'east' | 'north', (im: Img) => void>>) {
	const keys: Record<string, Img> = {},
		cells = (['south', 'east', 'north'] as const).map((d) => {
			const layer = makeImg(w, w);
			draw[d]?.(layer);
			keys[d] = layer;
			let area = 0;
			for (let i = 3; i < layer.data.length; i += 4) if (layer.data[i]) area++;
			return { key: `rest/${d}/0`, area, base: body() };
		});
	return { cells, keys };
}

test('a backpack lying on the back is hidden from the front', () => {
	// east faces +x, so the pack sits left of the body's center there
	const v = views({
		east: (im) => paint(im, 20, 20, 25, 34),
		north: (im) => paint(im, 27, 18, 36, 34)
	});
	expect([...hiddenViews(v.cells, v.keys, 'back')]).toEqual(['south']);
	expect([...hiddenViews(v.cells, v.keys, 'torso_outer')]).toEqual([]); // only the Back slot is attached behind
});

test('a cape that covers the back is not excused when its front view is empty', () => {
	const v = views({
		east: (im) => paint(im, 34, 14, 41, 58),
		north: (im) => paint(im, 22, 12, 41, 58)
	});
	expect([...hiddenViews(v.cells, v.keys, 'back')]).toEqual([]);
});

test('a back item drawn mostly off the body is not excused', () => {
	const v = views({
		east: (im) => paint(im, 40, 20, 46, 34),
		north: (im) => paint(im, 40, 18, 50, 34)
	});
	expect([...hiddenViews(v.cells, v.keys, 'back')]).toEqual([]);
});

test('small accessories keep the back-view rule only', () => {
	// earrings from the front missing, visible from behind: still a failed front dress
	const v = views({
		east: (im) => paint(im, 30, 14, 31, 16),
		north: (im) => {
			paint(im, 24, 14, 25, 16);
			paint(im, 38, 14, 39, 16);
		}
	});
	expect([...hiddenViews(v.cells, v.keys, 'face_acc')]).toEqual([]);
});

test('a capelet that shows in front of the body in the side view is not excused', () => {
	const v = views({
		east: (im) => paint(im, 26, 14, 41, 22),
		north: (im) => paint(im, 26, 14, 37, 22)
	});
	expect([...hiddenViews(v.cells, v.keys, 'back')]).toEqual([]);
});

test('a thin strip left by a failed back view does not excuse an empty front', () => {
	const v = views({
		east: (im) => paint(im, 18, 14, 27, 50),
		north: (im) => paint(im, 28, 14, 35, 15)
	});
	expect([...hiddenViews(v.cells, v.keys, 'back')]).toEqual([]);
});

test('a view the dressed design hides stays empty in every posed frame', async () => {
	const { itemQa, slotOf } = await import('../../src/lib/items/items.ts');
	const rig = {
		cell: { w, h: w },
		pivot: { x: 32, y: 60 },
		baseItem: 'base',
		baseHash: 'sha256:x',
		directions: [{ id: 'south' }],
		animations: [{ id: 'walk', cells: 3, loop: true, frames: [] }]
	} as never;
	const cell = (i: number, drawn: boolean) => {
		const layer = makeImg(w, w);
		if (drawn) paint(layer, 27, 18, 36, 34);
		const mask = new Uint8Array(w * w);
		for (let p = 0; p < mask.length; p++) mask[p] = layer.data[p * 4 + 3] ? 1 : 0;
		return {
			key: `walk/south/${i}`,
			call: 0,
			base: body(),
			input: body(),
			out: layer,
			layer,
			mask,
			area: mask.reduce((s, v) => s + v, 0),
			outBand: 0,
			baseBand: 0,
			specks: 0,
			pinholes: 0,
			shifted: false,
			offset: [0, 0] as [number, number],
			stray: 0,
			posed: true
		};
	};
	const fails = (cs: ReturnType<typeof cell>[]) =>
		[
			...itemQa(
				rig,
				slotOf('back'),
				'green',
				cs,
				0,
				undefined,
				0,
				new Set(['south'])
			).failCalls.values()
		].flat();
	expect(fails([0, 1, 2].map((i) => cell(i, false)))).toEqual([]);
	expect(fails([0, 1, 2].map((i) => cell(i, true)))).toEqual([
		'G4 walk/south: the item appears in a view its dressed view hides'
	]);
});
