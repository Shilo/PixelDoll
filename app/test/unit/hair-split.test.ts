import { expect, test } from 'vitest';
import { splitFgBg } from '../../src/lib/compose/split.ts';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { buildItem, itemQa, neckY, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';

// 10 × 10 cell, neck at y = 4. The bare body covers columns 3..6 on every row.
const body = (): Img => {
	const im = makeImg(10, 10);
	for (let y = 0; y < 10; y++)
		for (let x = 3; x <= 6; x++) im.data.set([90, 60, 40, 255], (y * 10 + x) * 4);
	return im;
};
const hair = (pixels: [number, number][]): Img => {
	const im = makeImg(10, 10);
	for (const [x, y] of pixels) im.data.set([10, 10, 10, 255], (y * 10 + x) * 4);
	return im;
};
const column = (x: number, y0: number, y1: number) =>
	Array.from({ length: y1 - y0 + 1 }, (_, i) => [x, y0 + i] as [number, number]);
const at = (im: Img, x: number, y: number) => im.data[(y * 10 + x) * 4 + 3] > 0;
// Front-falling hair: on-body strand at x 3 from the head (y 0) down to the chest (y 7), with its outer edge at x 2 just past the
// outline (beside the face and the shoulder); separate back hair at x 0, y 6..8, seen between arm and torso.
const front = () => hair([...column(3, 0, 7), ...column(2, 1, 6), ...column(0, 6, 8)]);
// Back-falling hair: on-body only on the head (above the neck), its outer edge at x 2 beside the face and down past the neck.
const back = () => hair([...column(3, 0, 2), ...column(2, 1, 7)]);

test('without a neck line the split follows body alpha only', () => {
	const { fg, bg } = splitFgBg(front(), body());
	expect(at(fg, 3, 5)).toBe(true);
	expect(at(bg, 2, 5)).toBe(true);
});

test('the outer edge of a strand falling in front of the body stays in front at every height', () => {
	const { fg, bg } = splitFgBg(front(), body(), 4);
	for (let y = 1; y <= 6; y++) {
		expect(at(fg, 2, y)).toBe(true);
		expect(at(bg, 2, y)).toBe(false);
	}
	for (let y = 6; y <= 8; y++) expect(at(bg, 0, y)).toBe(true); // 3 px from the strand: hair seen between arm and torso
});

test('off-body hair connected to a front strand but beyond its edge reach stays behind', () => {
	// a back mass joined to the strand's edge: x 1 is 2 px from the strand (moves), x 0 is 3 px (stays behind pauldrons)
	const { fg, bg } = splitFgBg(
		hair([...column(3, 0, 7), ...column(2, 1, 6), [1, 3], [0, 3]]),
		body(),
		4
	);
	expect(at(fg, 1, 3)).toBe(true);
	expect(at(bg, 0, 3)).toBe(true);
});

test('a row whose center lies on the neck line is not below it', () => {
	// the on-body strand ends on row 3 (center 3.5): with the neck at 3.5 it covers only the head, so its edge stays behind
	const l = hair([...column(3, 0, 3), ...column(2, 1, 3)]);
	expect(at(splitFgBg(l, body(), 3.5).bg, 2, 2)).toBe(true);
	expect(at(splitFgBg(l, body(), 3.4).fg, 2, 2)).toBe(true);
});

test('hair covering only the head keeps its off-body edge behind', () => {
	const { bg } = splitFgBg(back(), body(), 4);
	for (let y = 1; y <= 7; y++) expect(at(bg, 2, y)).toBe(true);
});

test('moved pixels are off the body, so bg → base → fg still reproduces base + layer', () => {
	const b = body(),
		l = front(),
		{ fg, bg } = splitFgBg(l, b, 4);
	for (let p = 0; p < 100; p++) {
		const want = l.data[p * 4 + 3]
			? [...l.data.subarray(p * 4, p * 4 + 4)]
			: [...b.data.subarray(p * 4, p * 4 + 4)];
		const got = fg.data[p * 4 + 3]
			? fg.data.subarray(p * 4, p * 4 + 4)
			: b.data[p * 4 + 3]
				? b.data.subarray(p * 4, p * 4 + 4)
				: bg.data.subarray(p * 4, p * 4 + 4);
		expect([...got]).toEqual(want);
	}
});

test('neckY reads posed keypoints, falls back to the rest view for standing cells, and is undefined without either', () => {
	const kp = (y: number) =>
		LABELS.map((label) => ({ label, x: 0.5, y: label === 'NECK' ? y : 0.5, z: 0 }));
	const rig = {
		cell: { w: 80, h: 80 },
		rest: { south: { image: 'sha256:r', keypoints: kp(0.25) } },
		animations: [
			{ id: 'default', cells: 1 },
			{ id: 'walk', cells: 1, sources: { south: { keypoints: [kp(0.3)] } } }
		]
	} as unknown as Rig;
	expect(neckY(rig, 'walk/south/0')).toBe(24);
	expect(neckY(rig, 'default/south/0')).toBe(20);
	expect(neckY(rig, 'default/south/0', 8)).toBe(28);
	expect(neckY(rig, 'default/east/0')).toBeUndefined();
});

test('buildItem applies the neck rule to hair cells and stores the moved edge in the fg layer', async () => {
	const kp = LABELS.map((label) => ({ label, x: 0.5, y: label === 'NECK' ? 0.4 : 0.5, z: 0 }));
	const rig = {
		cell: { w: 10, h: 10 },
		pivot: { x: 5, y: 10 },
		baseItem: 'base',
		baseHash: 'sha256:test',
		directions: [{ id: 'south' }],
		animations: [{ id: 'default', cells: 1, loop: true, frames: [] }],
		rest: { south: { image: 'sha256:r', keypoints: kp } }
	} as unknown as Rig;
	const layer = front(),
		base = body(),
		mask = Uint8Array.from({ length: 100 }, (_, p) => (layer.data[p * 4 + 3] ? 1 : 0));
	const cells: CellOut[] = [
		{
			key: 'default/south/0',
			call: 0,
			base,
			input: base,
			out: layer,
			layer,
			mask,
			area: mask.reduce((n, v) => n + v, 0),
			outBand: 0,
			baseBand: 0,
			specks: 0,
			pinholes: 0,
			shifted: false,
			offset: [0, 0],
			stray: 0,
			posed: false
		}
	];
	const { item, images } = await buildItem({
		spec: {
			id: 'long_hair',
			name: 'Long hair',
			slot: 'hair',
			prompt: '',
			key: 'green',
			anims: ['default'],
			dirs: ['south']
		},
		rig,
		cells,
		route: 'green',
		provenance: [],
		qa: itemQa(rig, slotOf('hair'), 'green', cells, 0).qa
	});
	const image = (role: string) =>
		images.get(item.layers.find((l) => l.id === role)!.cells!.default!.south![0]!)!;
	for (let y = 1; y <= 6; y++) expect(at(image('fg'), 2, y)).toBe(true);
	expect(at(image('bg'), 0, 7)).toBe(true);
});
