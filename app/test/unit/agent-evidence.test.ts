import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { composeCell } from '../../src/lib/compose/compose.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import {
	emptyCells,
	fitScale,
	MAX_SIDE,
	planEvidence,
	type SheetSpec
} from '../../src/studio/automation/evidence.ts';
import { defectDigest, frameDefects } from '../../src/studio/automation/defects.ts';
import { AgentError } from '../../src/studio/automation/contract.ts';

function image(w: number, h: number, points: [number, number][]) {
	const im = makeImg(w, h);
	for (const [x, y] of points) im.data[(y * w + x) * 4 + 3] = 255;
	return im;
}

describe('agent evidence', () => {
	it('shares one scale; worn and source views share a crop and pivot, the item alone gets its own tight crop', () => {
		const item: SheetSpec = {
			label: 'Item',
			kind: 'item',
			axes,
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
			axes: { rows: '', columns: 'direction' },
			columns: ['east'],
			rows: [{ label: '', cells: [{ image: raw, offset: { x: -2, y: -1 }, covered: true }] }]
		};
		const pages = planEvidence([item, worn, source], { w: 20, h: 20 }, 6);
		// A one-pixel item is not lost in the body's crop: one pixel of margin on each side, pivot left out.
		expect(pages.map(({ meta }) => meta.crop)).toEqual([
			{ x: 9, y: 4, w: 3, h: 3 },
			{ x: -2, y: 1, w: 24, h: 20 },
			{ x: -2, y: 1, w: 24, h: 20 }
		]);
		expect(pages.map(({ meta }) => [meta.scale, meta.pivot])).toEqual([
			[6, item.pivot],
			[6, item.pivot],
			[6, null]
		]);
		expect(pages[0].meta).toMatchObject({ rowsAre: 'direction', columnsAre: 'frame' });
		expect(pages[2].spec.rows[0].cells[0].image).toBe(raw);
	});

	it('lowers the scale to stay within the page cap, tiling rows and columns within MAX_SIDE', () => {
		const frame = { w: 144, h: 144 };
		const columns = Array.from({ length: 12 }, (_, i) => String(i));
		const rows = Array.from({ length: 8 }, (_, r) => ({
			label: String(r),
			cells: columns.map((_, c) => ({ image: null, covered: r !== 7 || c !== 11 }))
		}));
		const pages = planEvidence([{ label: 'Walk', kind: 'frames', axes, rows, columns }], frame, 4);
		// Scale 4 would need 24 pages and 3 would need 12; 2 is the largest within MAX_SHEETS (8).
		expect(pages).toHaveLength(6);
		expect(pages.every(({ meta }) => meta.width <= MAX_SIDE && meta.height <= MAX_SIDE)).toBe(true);
		expect(pages.every(({ meta }) => meta.scale === 2)).toBe(true);
		const seen = pages.flatMap(({ meta }) =>
			meta.rows.flatMap((r) => meta.columns.map((c) => `${r}/${c}`))
		);
		expect(seen).toHaveLength(rows.length * columns.length);
		expect(new Set(seen).size).toBe(seen.length);
		expect(pages.at(-1)?.meta).toMatchObject({
			page: 6,
			coverage: { total: 12, covered: 11, uncovered: [{ row: '7', column: '11' }] }
		});
	});

	it('prefers one page per sheet at a readable scale, and refuses calls past the page cap', () => {
		const sheet = (columns: number): SheetSpec => ({
			label: 'Walk',
			kind: 'frames',
			axes,
			columns: Array.from({ length: columns }, (_, i) => String(i)),
			rows: Array.from({ length: 4 }, (_, r) => ({
				label: String(r),
				cells: Array.from({ length: columns }, () => ({ image: null, covered: true }))
			}))
		});
		const one = planEvidence([sheet(8), sheet(8)], { w: 64, h: 64 }, 4);
		expect(one.map(({ meta }) => [meta.pages, meta.scale])).toEqual([
			[1, 2],
			[1, 2]
		]);
		const big = [sheet(64), sheet(64)];
		expect(() => planEvidence(big, { w: 144, h: 144 }, 4)).toThrow(AgentError);
	});

	it('caps enlargement for a single large cell, then fits the one page shown at a whole CSS-pixel scale', () => {
		const spec: SheetSpec = {
			label: 'Frame',
			kind: 'frames',
			axes,
			columns: ['0'],
			rows: [{ label: 'south', cells: [{ image: null, covered: false }] }]
		};
		const [{ spec: page, meta }] = planEvidence([spec], { w: 512, h: 512 }, 16);
		expect(meta.scale).toBe(2);
		// 1132 x 1056 at scale 2: row labels and gaps keep their size.
		expect([meta.width, meta.height]).toEqual([1132, 1056]);
		expect(fitScale(page, { width: 1200, height: 1100 })).toBe(2);
		expect(fitScale(page, { width: 1100, height: 1100 })).toBe(1);
		expect(fitScale(page, { width: 200, height: 200 })).toBe(1);
	});

	it('tells an empty frame from a missing one', () => {
		const spec: SheetSpec = {
			label: 'Walk',
			kind: 'frames',
			axes,
			columns: ['0', '1', '2'],
			rows: [
				{
					label: 'east',
					cells: [
						{ image: image(8, 8, [[3, 3]]), covered: true },
						{ image: makeImg(8, 8), covered: true },
						{ image: null, covered: false }
					]
				}
			]
		};
		expect(emptyCells(spec)).toEqual([{ row: 'east', column: '1' }]);
		const [{ meta }] = planEvidence([spec], { w: 8, h: 8 }, 4);
		expect(meta.coverage).toEqual({
			total: 3,
			covered: 2,
			uncovered: [{ row: 'east', column: '2' }],
			empty: [{ row: 'east', column: '1' }]
		});
	});

	it('refuses a frame too large for a sheet at 1x as unsupported', () => {
		const spec: SheetSpec = {
			label: 'Frame',
			kind: 'frames',
			axes,
			columns: ['0'],
			rows: [{ label: 'south', cells: [{ image: null, covered: true }] }]
		};
		expect(() => planEvidence([spec], { w: 2000, h: 64 }, 1)).toThrow(
			expect.objectContaining({ code: 'unsupported' })
		);
	});
});

const axes = { rows: 'direction', columns: 'frame' };

const block = (x: number, y: number, w: number, h: number) =>
	Array.from({ length: w * h }, (_, i) => [x + (i % w), y + Math.floor(i / w)] as [number, number]);

describe('detached-pixel evidence', () => {
	it('reports boxes of small 8-connected parts in the uncropped frame', () => {
		const im = image(32, 24, [
			...Array.from({ length: 10 }, (_, i) => [i, i] as [number, number]),
			...block(12, 6, 3, 3),
			[30, 9],
			[31, 10],
			[0, 15]
		]);
		expect(frameDefects('east', 2, im)).toEqual({
			direction: 'east',
			frame: 2,
			main: { size: 10, x: 0, y: 0, w: 10, h: 10 },
			detached: [
				{ size: 2, x: 30, y: 9, w: 2, h: 2 },
				{ size: 1, x: 0, y: 15, w: 1, h: 1 }
			],
			detachedCount: 2
		});
		expect(frameDefects('east', 2, makeImg(32, 24))).toBeNull();
	});

	it('leaves legitimately separate parts alone and words small ones as possibly intentional', () => {
		const boots = image(24, 16, [...block(4, 10, 3, 4), ...block(14, 10, 3, 4)]);
		const sword = image(24, 24, [...block(10, 0, 2, 12), ...block(9, 13, 4, 3)]);
		const earrings = image(24, 16, [...block(4, 8, 2, 2), ...block(16, 8, 2, 2)]);
		for (const im of [boots, sword, earrings]) expect(frameDefects('south', 0, im)).toBeNull();
		const worn = image(24, 16, [
			...block(6, 2, 10, 10),
			...block(3, 8, 2, 2),
			...block(17, 8, 2, 2)
		]);
		const digest = defectDigest([{ direction: 'south', frame: 0, image: worn }]);
		expect(digest.frames[0].detachedCount).toBe(2);
		expect(digest).toMatchObject({ note: expect.stringContaining('may be intentional') });
		expect(defectDigest([{ direction: 'south', frame: 0, image: boots }])).not.toHaveProperty(
			'note'
		);
	});

	it('caps what the digest lists and names empty frames', () => {
		const strays = [8, 10, 12].flatMap((x) => [8, 10, 12].map((y) => [x, y] as [number, number]));
		const noisy = image(16, 16, [...block(0, 0, 4, 4), ...strays.slice(0, 8)]);
		const digest = defectDigest([
			...Array.from({ length: 17 }, (_, frame) => ({ direction: 'east', frame, image: noisy })),
			{ direction: 'west', frame: 0, image: null },
			{ direction: 'west', frame: 1, image: makeImg(16, 16) }
		]);
		expect(digest.framesChecked).toBe(19);
		expect(digest.frames).toHaveLength(16);
		expect(digest.moreFrames).toBe(1);
		expect(digest.frames[0].detached).toHaveLength(6);
		expect(digest.frames[0].detachedCount).toBe(8);
		expect(digest.emptyFrames).toEqual(['west frame 0', 'west frame 1']);
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
			const left = frameDefects('east', frame, east)?.detached ?? [];
			const right = frameDefects('west', frame, west)?.detached ?? [];
			expect(left.length).toBeGreaterThan(0);
			expect(new Set(right.map(({ x, y, w, h }) => `${x}/${y}/${w}/${h}`))).toEqual(
				new Set(left.map(({ x, y, w, h }) => `${east.w - x - w}/${y}/${w}/${h}`))
			);
		}
	});
});
