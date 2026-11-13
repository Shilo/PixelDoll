import { describe, expect, test } from 'vitest';
import type { DirectionName } from '../../src/lib/rig/rig.ts';
import { PRESETS } from '../../src/studio/characterConfig.ts';
import {
	MIN_SHARE,
	focalSlot,
	inspectionLineup,
	pickFacings,
	planLineup
} from '../../src/studio/experience/lineup.ts';

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
/** Every preset, and custom sets of two to seven facings with fewer than a full row or with mirrored pairs. */
const rigs: readonly (readonly DirectionName[])[] = [
	...PRESETS.map((p) => p.selected),
	...['S N', 'S E N', 'S SE E NE N', 'S SE E NE N W', 'S SE E NE N W SW'].map(dirs)
];

describe('chosen-scale inspection lineup', () => {
	test.each([1, 1.25, 1.5, 2, 3])('selected slots do not depend on fit at DPR %s', (dpr) => {
		const body = { w: 40, h: 64, x: 10, y: 56 };
		const reach = { ...body, w: 90, x: 70 };
		for (const available of rigs)
			for (const selected of available) {
				let expected: number[] | undefined;
				for (let deviceScale = 1; deviceScale <= 24; deviceScale++) {
					const scale = deviceScale / dpr;
					const row = inspectionLineup({ available, selected, body, reach, scale });
					expect(row.offsets[row.facings.indexOf(selected)]).toBe(0);
					expect(row.facings).toEqual(pickFacings(available, selected, 5));
					const displayed = row.offsets.map((offset) => (offset * 9) / scale);
					if (expected)
						displayed.forEach((offset, index) => expect(offset).toBeCloseTo(expected![index], 8));
					expected = displayed;
				}
			}
	});
});

describe('lineup facings', () => {
	// [preset, selected, count, expected left-to-right]
	const cases: [string, string, number, string][] = [
		['eight', 'S', 1, 'S'],
		['eight', 'S', 2, 'S N'],
		['eight', 'S', 3, 'N S E'],
		['eight', 'S', 5, 'NE N S SE E'],
		['eight', 'E', 2, 'E S'],
		['eight', 'E', 3, 'S E N'],
		['eight', 'E', 5, 'S SE E NE N'],
		['eight', 'W', 2, 'W S'],
		['eight', 'W', 3, 'S W N'],
		['eight', 'W', 5, 'S SE W NE N'],
		['eight', 'NE', 3, 'S NE N'],
		['eight', 'NE', 5, 'SE E NE N S'],
		['eight', 'SW', 3, 'S SW N'],
		['eight', 'SW', 5, 'N S SW E NE'],
		['eight', 'NW', 5, 'SE E NW N S'],
		['unique', 'S', 5, 'NE N S SE E'],
		['four', 'S', 3, 'N S E'],
		['four', 'S', 5, 'N S E'],
		['four', 'N', 2, 'N S'],
		['four', 'E', 3, 'S E N'],
		['four', 'W', 5, 'S W N'],
		['diagonal', 'NE', 5, 'NE SE'],
		['diagonal', 'SE', 5, 'SE NE'],
		['diagonal', 'SW', 5, 'SW NE'],
		['diagonal', 'NW', 5, 'NW SE'],
		['side', 'E', 5, 'E'],
		['side', 'W', 5, 'W']
	];
	for (const [id, selected, count, expected] of cases)
		test(`${id}, ${selected} selected, room for ${count}: ${expected}`, () => {
			expect(pickFacings(preset(id), short[selected], count)).toEqual(dirs(expected));
		});

	test('custom direction sets', () => {
		expect(pickFacings(dirs('S'), 'south', 5)).toEqual(dirs('S'));
		expect(pickFacings(dirs('S E'), 'east', 5)).toEqual(dirs('E S'));
		expect(pickFacings(dirs('S N'), 'north', 5)).toEqual(dirs('N S'));
		expect(pickFacings(dirs('E W'), 'west', 5)).toEqual(dirs('W'));
		expect(pickFacings(dirs('N NE E'), 'north', 5)).toEqual(dirs('NE N E'));
		expect(pickFacings(dirs('W NW'), 'west', 5)).toEqual(dirs('W NW'));
		expect(pickFacings(dirs('SE SW'), 'south-west', 5)).toEqual(dirs('SW'));
	});

	test('an undeclared selection stands alone', () => {
		expect(pickFacings(dirs('S N'), 'east', 5)).toEqual(dirs('E'));
	});

	test('every selection on every preset: selected shown, no twins, no repeats', () => {
		const twins = [dirs('E W'), dirs('NE NW'), dirs('SE SW')];
		for (const available of rigs) {
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

	test('the selected facing stands at the focal slot, and selecting a shown neighbor turns the same row', () => {
		for (const available of rigs) {
			for (const selected of available)
				for (let count = 1; count <= 5; count++) {
					const shown = pickFacings(available, selected, count);
					expect(shown.indexOf(selected)).toBe(focalSlot(shown.length));
				}
		}
		expect([1, 2, 3, 4, 5].map(focalSlot)).toEqual([0, 0, 1, 1, 2]);
		const row = pickFacings(preset('four'), 'south', 3);
		for (const d of row)
			expect([...pickFacings(preset('four'), d, 3)].sort()).toEqual([...row].sort());
		expect(pickFacings(preset('four'), 'east', 3)).toEqual(dirs('S E N'));
	});
});

describe('lineup fitting', () => {
	// A 64 px body: about 40 px wide, the pivot 56 px below its top.
	const body = { w: 40, h: 64, x: 20, y: 56 },
		room = { above: 56 * 14 + 5, side: 433, below: 200 },
		four = preset('four');

	test('the target stays at the same slot across every facing, centered in odd rows', () => {
		for (const reach of [body, { ...body, w: 90, x: 70 }])
			for (const width of [200, 700, 1396, 2400, 3440]) {
				const rows = preset('eight').map((selected) =>
					planLineup({ available: preset('eight'), selected, body, reach, room, width })
				);
				for (const row of rows) {
					expect(row.offsets).toEqual(rows[0].offsets);
					expect(row.scale).toBe(rows[0].scale);
					if (row.facings.length % 2) expect(row.offsets[focalSlot(row.facings.length)]).toBe(0);
					if (row.facings.length === 1) continue;
					for (const offset of row.offsets) {
						expect(offset - reach.x * row.scale).toBeGreaterThanOrEqual(-width / 2 + 16);
						expect(offset + (reach.w - reach.x) * row.scale).toBeLessThanOrEqual(width / 2 - 16);
					}
				}
			}
	});

	test('a wide stage shows three equal facings at a smaller whole-pixel scale', () => {
		const row = planLineup({
			available: four,
			selected: 'south',
			body,
			reach: body,
			room,
			width: 1396
		});
		expect(row.facings).toEqual(dirs('N S E'));
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
		expect(row.facings).toEqual(dirs('N S E'));
		const left = row.offsets.map((o) => o - reach.x * row.scale),
			right = row.offsets.map((o) => o + (reach.w - reach.x) * row.scale);
		for (let i = 1; i < row.offsets.length; i++) expect(left[i]).toBeGreaterThan(right[i - 1]);
		expect(left[0]).toBeGreaterThanOrEqual(-1396 / 2 + 16);
		expect(right.at(-1)!).toBeLessThanOrEqual(1396 / 2 - 16);
		expect(row.offsets[focalSlot(row.facings.length)]).toBe(0);
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

	test('fixed slots reserve the shared reach and one gap for every facing', () => {
		const reach = { w: 56, h: 64, x: 28, y: 56 },
			packed = planLineup({
				available: four,
				selected: 'south',
				body,
				reach,
				room,
				width: 1396
			});
		expect(packed.facings).toEqual(dirs('N S E'));
		const gap = body.w * 0.25 * packed.scale;
		for (let i = 1; i < 3; i++) {
			const between =
				packed.offsets[i] -
				reach.x * packed.scale -
				(packed.offsets[i - 1] + (reach.w - reach.x) * packed.scale);
			expect(Math.abs(between - gap)).toBeLessThanOrEqual(1);
		}
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
