import { expect, test } from 'vitest';
import { toChroma } from '../../src/lib/image/chroma.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { extractCell, itemQa, slotOf } from '../../src/lib/items/items.ts';
import type { Rig } from '../../src/lib/rig/rig.ts';

const clip = (id: string, cells: number) => ({
	id,
	cells,
	loop: false,
	frames: Array.from({ length: cells }, (_, cell) => ({ cell, ms: 100 }))
});
const rig: Rig = {
	cell: { w: 64, h: 64 },
	pivot: { x: 32, y: 60 },
	baseItem: 'body',
	baseHash: 'sha256:synthetic',
	directions: [{ id: 'south' }],
	animations: [clip('default', 1), clip('slash', 2)]
};
const base = makeImg(64, 64);
for (let y = 12; y < 52; y++)
	for (let x = 20; x < 40; x++) base.data.set([180, 100, 60, 255], (y * 64 + x) * 4);

/** A 12 x 5 blade beside the body: solid, or only its outline (the fill lost, as a 2026-11-23 report's knife). */
function cell(key: string, call: number, hollow = false) {
	const out = toChroma(base, 'green');
	for (let y = 20; y < 25; y++)
		for (let x = 44; x < 56; x++) {
			const edge = y === 20 || y === 24 || x === 44 || x === 55;
			if (!hollow || edge) out.data.set([200, 200, 210, 255], (y * 64 + x) * 4);
		}
	return extractCell({
		key,
		call,
		base,
		out,
		route: 'green',
		band: { x: 0, y: 0, w: 64, h: 64 },
		posed: true,
		held: true
	});
}

test('G17 asks for review when a held item loses its fill in a posed frame', () => {
	const design = cell('default/south/0', 0);
	const hollow = itemQa(
		rig,
		slotOf('main_hand'),
		'green',
		[design, cell('slash/south/0', 1), cell('slash/south/1', 1, true)],
		0
	);
	expect(hollow.warnings.filter((w) => w.startsWith('G17'))).toEqual([
		'G17 slash/south: the item lost its fill in frame 1 (outline only); inspect its shape'
	]);
	expect(hollow.qa.fillReviewClips).toBe(1);
	expect(hollow.qa.clips['slash/south'].fillReviewClips).toBe(1);
	expect(hollow.failCalls.size).toBe(0);

	const solid = itemQa(
		rig,
		slotOf('main_hand'),
		'green',
		[design, cell('slash/south/0', 1), cell('slash/south/1', 1)],
		0
	);
	expect(solid.warnings.some((w) => w.startsWith('G17'))).toBe(false);
	expect(solid.qa.fillReviewClips).toBeUndefined();
});
