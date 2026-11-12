import { describe, expect, test } from 'vitest';
import type { DirectionName } from '../../src/lib/rig/rig.ts';
import { PRESETS } from '../../src/studio/characterConfig.ts';
import { MIN_SHARE, pickFacings, planLineup } from '../../src/studio/experience/lineup.ts';

const short: Record<string, DirectionName> = {
	S: 'south',
	SE: 'south-east',
	E: 'east',
	NE: 'north-east',
	N: 'north',
	NW: 'north-west',
	W: 'west',
	SW: 'south-west'
};
const dirs = (s: string) => s.split(' ').map((d) => short[d]);
const preset = (id: string) => PRESETS.find((p) => p.id === id)!.selected;

describe('lineup facings', () => {
	// [preset, selected, count, expected left-to-right]
	const cases: [string, string, number, string][] = [
		['eight', 'S', 1, 'S'],
		['eight', 'S', 2, 'S N'],
		['eight', 'S', 3, 'S E N'],
		['eight', 'S', 5, 'S SE E NE N'],
		['eight', 'E', 2, 'S E'],
		['eight', 'E', 3, 'S E N'],
		['eight', 'E', 5, 'S SE E NE N'],
		['eight', 'W', 2, 'S W'],
		['eight', 'W', 3, 'S W N'],
		['eight', 'W', 5, 'S SE W NE N'],
		['eight', 'NE', 3, 'S NE N'],
		['eight', 'NE', 5, 'S SE E NE N'],
		['eight', 'SW', 3, 'S SW N'],
		['eight', 'SW', 5, 'S SW E NE N'],
		['eight', 'NW', 5, 'S SE E NW N'],
		['unique', 'S', 5, 'S SE E NE N'],
		['four', 'S', 3, 'S E N'],
		['four', 'S', 5, 'S E N'],
		['four', 'N', 2, 'S N'],
		['four', 'E', 3, 'S E N'],
		['four', 'W', 5, 'S W N'],
		['diagonal', 'NE', 5, 'SE NE'],
		['diagonal', 'SE', 5, 'SE NE'],
		['diagonal', 'SW', 5, 'SW NE'],
		['diagonal', 'NW', 5, 'SE NW'],
		['side', 'E', 5, 'E'],
		['side', 'W', 5, 'W']
	];
	for (const [id, selected, count, expected] of cases)
		test(`${id}, ${selected} selected, room for ${count}: ${expected}`, () => {
			expect(pickFacings(preset(id), short[selected], count)).toEqual(dirs(expected));
		});

	test('custom direction sets', () => {
		expect(pickFacings(dirs('S'), 'south', 5)).toEqual(dirs('S'));
		expect(pickFacings(dirs('S E'), 'east', 5)).toEqual(dirs('S E'));
		expect(pickFacings(dirs('S N'), 'north', 5)).toEqual(dirs('S N'));
		expect(pickFacings(dirs('E W'), 'west', 5)).toEqual(dirs('W'));
		expect(pickFacings(dirs('N NE E'), 'north', 5)).toEqual(dirs('E NE N'));
		expect(pickFacings(dirs('W NW'), 'west', 5)).toEqual(dirs('W NW'));
		expect(pickFacings(dirs('SE SW'), 'south-west', 5)).toEqual(dirs('SW'));
	});

	test('an undeclared selection stands alone', () => {
		expect(pickFacings(dirs('S N'), 'east', 5)).toEqual(dirs('E'));
	});

	test('every selection on every preset: selected shown, no twins, no repeats', () => {
		const twins = [dirs('E W'), dirs('NE NW'), dirs('SE SW')];
		for (const p of PRESETS) {
			const available: readonly DirectionName[] = p.selected;
			for (const selected of available)
				for (let count = 1; count <= 5; count++) {
					const shown = pickFacings(available, selected, count);
					expect(shown).toContain(selected);
					expect(new Set(shown).size).toBe(shown.length);
					expect(shown.length).toBeLessThanOrEqual(count);
					expect(shown.every((d) => available.includes(d))).toBe(true);
					for (const pair of twins) expect(pair.every((d) => shown.includes(d))).toBe(false);
				}
		}
	});

	test('clicking another shown facing keeps the row', () => {
		const row = pickFacings(preset('four'), 'south', 3);
		for (const d of row) expect(pickFacings(preset('four'), d, 3)).toEqual(row);
	});
});

describe('lineup fitting', () => {
	// A 64 px body: about 40 px wide, the pivot 56 px below its top.
	const body = { w: 40, h: 64, x: 20, y: 56 },
		room = { above: 56 * 14 + 5, side: 433, below: 200 },
		four = preset('four');

	test('a wide stage shows three equal facings at a smaller whole-pixel scale', () => {
		const row = planLineup({
			available: four,
			selected: 'south',
			body,
			reach: body,
			room,
			width: 1396
		});
		expect(row.facings).toEqual(dirs('S E N'));
		expect(row.scale).toBe(9);
		expect(row.scale).toBeGreaterThanOrEqual(MIN_SHARE * 14);
		expect(row.offsets[0]).toBe(-row.offsets[2]);
		expect(row.offsets[1]).toBe(0);
	});

	test('a medium stage shows two facings, centered as a group', () => {
		const row = planLineup({
			available: four,
			selected: 'south',
			body,
			reach: body,
			room: { ...room, above: 56 * 9 + 5 },
			width: 700
		});
		expect(row.facings).toEqual(dirs('S N'));
		expect(row.scale).toBe(7);
		expect(row.offsets[0]).toBe(-row.offsets[1]);
	});

	test('a stage whose width already limits the single facing keeps it alone', () => {
		const row = planLineup({
			available: four,
			selected: 'east',
			body,
			reach: body,
			room: { ...room, side: 180 },
			width: 600
		});
		expect(row).toEqual({ facings: ['east'], scale: 9, offsets: [0] });
	});

	test('a side-scroller rig never pairs its mirrored twins', () => {
		const row = planLineup({
			available: preset('side'),
			selected: 'east',
			body,
			reach: body,
			room,
			width: 3000
		});
		expect(row.facings).toEqual(['east']);
		expect(row.scale).toBe(14);
	});

	test('far-reaching gear keeps every facing clear of its neighbors and inside the stage', () => {
		const reach = { w: 50, h: 64, x: 30, y: 56 },
			row = planLineup({ available: four, selected: 'south', body, reach, room, width: 1396 });
		expect(row.facings).toEqual(dirs('S E N'));
		const left = row.offsets.map((o) => o - reach.x * row.scale),
			right = row.offsets.map((o) => o + (reach.w - reach.x) * row.scale);
		for (let i = 1; i < row.offsets.length; i++) expect(left[i]).toBeGreaterThan(right[i - 1]);
		expect(left[0]).toBeGreaterThanOrEqual(-1396 / 2 + 16);
		expect(right.at(-1)!).toBeLessThanOrEqual(1396 / 2 - 16);
		// The row's reach, not its pivots, is centered.
		expect(Math.abs(left[0] + right.at(-1)!)).toBeLessThanOrEqual(1);
	});

	test("a lineup never drops below half the single facing's scale", () => {
		const row = planLineup({
			available: four,
			selected: 'south',
			body,
			reach: { ...body, w: 90, x: 45 },
			room,
			width: 1396
		});
		expect(row.facings).toEqual(dirs('S N'));
		expect(row.scale).toBeGreaterThanOrEqual(MIN_SHARE * 14);
	});

	test('a small screen keeps its single facing rather than shrink below 2x', () => {
		const row = planLineup({
			available: four,
			selected: 'south',
			body,
			reach: body,
			room: { above: 56 * 2 + 5, side: 300, below: 40 },
			width: 200
		});
		expect(row).toEqual({ facings: ['south'], scale: 2, offsets: [0] });
	});

	test('facings pack by their own reach, one gap apart, near the stage center', () => {
		const reach = { w: 56, h: 64, x: 28, y: 56 },
			narrow = { w: 36, h: 64, x: 18, y: 56 },
			spread = planLineup({ available: four, selected: 'south', body, reach, room, width: 1396 }),
			packed = planLineup({
				available: four,
				selected: 'south',
				body,
				reach,
				facing: () => narrow,
				room,
				width: 1396
			});
		// Same count and scale as before; only the spacing tightens.
		expect(packed.facings).toEqual(spread.facings);
		expect(packed.scale).toBe(spread.scale);
		const gap = body.w * 0.25 * packed.scale;
		for (let i = 1; i < 3; i++) {
			const between =
				packed.offsets[i] - narrow.x * packed.scale - (packed.offsets[i - 1] + 18 * packed.scale);
			expect(Math.abs(between - gap)).toBeLessThanOrEqual(1);
		}
		expect(packed.offsets[2]).toBeLessThan(spread.offsets[2]);
		expect(packed.offsets[0]).toBe(-packed.offsets[2]);
	});

	test('high-density screens may use half-pixel scales', () => {
		const row = planLineup({
			available: four,
			selected: 'south',
			body,
			reach: body,
			room,
			width: 1396,
			dpr: 2
		});
		expect(row.scale).toBe(9.5);
	});
});
