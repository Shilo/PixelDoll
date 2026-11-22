import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import {
	displayScale,
	MAX_SIDE,
	planEvidence,
	type SheetSpec
} from '../../src/studio/automation/evidence.ts';
import { detachedPixels } from '../../src/studio/automation/defects.ts';

function image(w: number, h: number, points: [number, number][]) {
	const im = makeImg(w, h);
	for (const [x, y] of points) im.data[(y * w + x) * 4 + 3] = 255;
	return im;
}

describe('agent evidence', () => {
	it('shares a crop, scale and pivot across compared views while keeping source pixels at native size', () => {
		const item: SheetSpec = {
			label: 'Item',
			kind: 'item',
			pivot: { x: 12, y: 19 },
			columns: ['0'],
			rows: [{ label: 'east', cells: [{ image: image(20, 20, [[10, 5]]), covered: true }] }]
		};
		const worn: SheetSpec = {
			...item,
			label: 'Worn',
			kind: 'worn',
			rows: [{ label: 'east', cells: [{ image: image(20, 20, [[9, 14]]), covered: true }] }]
		};
		const raw = image(24, 22, [
			[1, 3],
			[22, 21]
		]);
		const source: SheetSpec = {
			label: 'Source',
			kind: 'source',
			columns: ['east'],
			rows: [{ label: '', cells: [{ image: raw, offset: { x: -2, y: -1 }, covered: true }] }]
		};
		const pages = planEvidence([item, worn, source], { w: 20, h: 20 }, 6, 'light');
		expect(pages.map(({ meta }) => meta.crop)).toEqual(
			Array(3).fill({ x: -2, y: 1, w: 24, h: 20 })
		);
		expect(pages.map(({ meta }) => [meta.scale, meta.background, meta.pivot])).toEqual([
			[6, 'light', item.pivot],
			[6, 'light', item.pivot],
			[6, 'light', null]
		]);
		expect(pages[2].spec.rows[0].cells[0].image).toBe(raw);
	});

	it('tiles rows and columns within MAX_SIDE, accounting for covered transparent and uncovered cells', () => {
		const frame = { w: 144, h: 144 };
		const columns = Array.from({ length: 12 }, (_, i) => String(i));
		const rows = Array.from({ length: 8 }, (_, r) => ({
			label: String(r),
			cells: columns.map((_, c) => ({ image: null, covered: r !== 7 || c !== 11 }))
		}));
		const pages = planEvidence([{ label: 'Walk', kind: 'frames', rows, columns }], frame, 4);
		expect(pages).toHaveLength(24);
		expect(pages.every(({ meta }) => meta.width <= MAX_SIDE && meta.height <= MAX_SIDE)).toBe(true);
		expect(pages.every(({ meta }) => meta.scale === 4)).toBe(true);
		const seen = pages.flatMap(({ meta }) =>
			meta.rows.flatMap((r) => meta.columns.map((c) => `${r}/${c}`))
		);
		expect(seen).toHaveLength(rows.length * columns.length);
		expect(new Set(seen).size).toBe(seen.length);
		expect(pages.at(-1)?.meta).toMatchObject({
			page: 24,
			coverage: { total: 4, covered: 3, uncovered: [{ row: '7', column: '11' }] }
		});
	});

	it('caps enlargement for a single large cell, then fits the display at a whole-pixel scale', () => {
		const spec: SheetSpec = {
			label: 'Frame',
			kind: 'frames',
			columns: ['0'],
			rows: [{ label: 'south', cells: [{ image: null, covered: false }] }]
		};
		const [{ spec: page, meta }] = planEvidence([spec], { w: 512, h: 512 }, 16);
		expect(meta.scale).toBe(2);
		expect(displayScale([page], 1200, 1100)).toBe(2);
		expect(displayScale([page], 1100, 1100)).toBe(1);
		expect(displayScale([page], 200, 200)).toBe(1);
	});
});

describe('detached-pixel evidence', () => {
	it('reports coordinates of small 8-connected components in the uncropped frame', () => {
		const im = image(32, 24, [
			[0, 0],
			[1, 1],
			[2, 2],
			[3, 3],
			[4, 4],
			[5, 5],
			[6, 6],
			[7, 7],
			[8, 8],
			[9, 9],
			[12, 6],
			[13, 6],
			[14, 6],
			[12, 7],
			[13, 7],
			[14, 7],
			[12, 8],
			[13, 8],
			[14, 8],
			[30, 9],
			[31, 10],
			[0, 15]
		]);
		expect(detachedPixels(im)).toEqual({
			componentCount: 2,
			pixelCount: 3,
			components: [
				[
					{ x: 30, y: 9 },
					{ x: 31, y: 10 }
				],
				[{ x: 0, y: 15 }]
			]
		});
		expect(detachedPixels(makeImg(32, 24))).toBeNull();
	});

	it('finds specks in the demo sword walk and reports mirrored coordinates', async () => {
		const p = await loadFixture((path) =>
			readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))
		);
		const sword = p.manifest.items.find((item) => item.id === 'sword_steel')!;
		const isolated = { ...p, manifest: { ...p.manifest, items: [sword] } };
		const outfit = { [sword.slot]: sword.id };
		for (const frame of [4, 5, 6, 7]) {
			const east = composeCell(isolated, outfit, 'walk', 'east', frame);
			const west = composeCell(isolated, outfit, 'walk', 'west', frame);
			const left = detachedPixels(east)?.components.flat() ?? [];
			const right = detachedPixels(west)?.components.flat() ?? [];
			expect(left.length).toBeGreaterThan(0);
			expect(new Set(right.map(({ x, y }) => `${x}/${y}`))).toEqual(
				new Set(left.map(({ x, y }) => `${east.w - 1 - x}/${y}`))
			);
		}
	});
});
