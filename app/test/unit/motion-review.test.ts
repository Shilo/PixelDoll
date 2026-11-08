import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { expect, test } from 'vitest';
import { makeImg } from '../../src/lib/image/png.ts';
import { GATES, isAction, itemQa, slotOf, type CellOut } from '../../src/lib/items/items.ts';
import { acceptQa, mergeQa } from '../../src/lib/items/qa-summary.ts';
import type { Keypoint, Rig } from '../../src/lib/rig/rig.ts';
import type { Item, ItemQa } from '../../src/lib/store/manifest.ts';
import { healthOf, plainReason, qaReasons } from '../../src/studio/model.ts';
import { isClean } from '../../src/lib/items/run.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { exportFiles } from '../../src/lib/export/export.ts';
import { readCharacterZip } from '../../src/lib/store/import.ts';
import { zip } from '../../src/lib/store/zip.ts';

// A frozen, bone-preserving stride with exactly one wrong measured hip. Metadata, not artwork, creates the override.
const data = JSON.parse(
	readFileSync(new URL('../fixtures/motion-review.json', import.meta.url), 'utf8')
) as { rest: Keypoint[]; requested: Keypoint[]; measured: Keypoint[] };
type Change =
	| 'clean'
	| 'flip'
	| 'turn'
	| 'unsigned'
	| 'shrink'
	| 'small-size-change'
	| 'shape'
	| 'empty'
	| 'seam';
function fixture(change: Change = 'clean', id = 'walk', badHip = true, dirs = ['south']) {
	const requested = [
		data.rest,
		data.rest,
		data.requested,
		data.rest,
		data.rest,
		data.rest,
		data.rest,
		data.rest
	];
	const measured = requested.map((p, i) => (badHip && i === 2 ? data.measured : p));
	const rig = {
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		baseItem: 'body',
		baseHash: 'sha256:test',
		directions: dirs.map((id) => ({ id })),
		rest: Object.fromEntries(dirs.map((d) => [d, { image: 'sha256:test', keypoints: data.rest }])),
		animations: [
			{
				id,
				cells: requested.length,
				loop: change === 'seam',
				frames: requested.map((_, cell) => ({ cell, ms: 100 })),
				sources: Object.fromEntries(
					dirs.map((d) => [
						d,
						{
							route: 'skeleton-v3',
							reference: 'sha256:test',
							keypoints: requested,
							measured,
							provenance: []
						}
					])
				)
			}
		]
	} as unknown as Rig;
	if (change === 'shape') {
		// A measured-only imported pose uses hand anchors and the silhouette check instead of forearm-relative angles.
		rig.anchors = Object.fromEntries(
			['RIGHT', 'LEFT'].map((side) => [
				side === 'RIGHT' ? 'hand_r' : 'hand_l',
				{
					[id]: Object.fromEntries(
						dirs.map((d) => [
							d,
							requested.map((pose) => {
								const wr = pose.find((p) => p.label === `${side} ARM`)!;
								return [wr.x * 64 - 0.5, wr.y * 64 - 0.5];
							})
						])
					)
				}
			])
		);
		for (const src of Object.values(rig.animations[0].sources!)) delete src!.keypoints;
	}
	const cells: CellOut[] = dirs.flatMap((d) =>
		requested.map((pose, i) => {
			const base = makeImg(64, 64),
				layer = makeImg(64, 64),
				mask = new Uint8Array(4096),
				wrist = pose.find((p) => p.label === 'RIGHT ARM')!;
			const deg =
				change === 'seam'
					? i * 10 + (i === 2 ? 35 : 0)
					: i === 2
						? 35 + (change === 'flip' ? 180 : change === 'turn' || change === 'unsigned' ? 60 : 0)
						: 0;
			const t = (deg * Math.PI) / 180,
				length =
					change === 'empty' && i === 2
						? 0
						: change === 'shrink' && i === 2
							? 7
							: change === 'small-size-change' && i === 2
								? 9
								: change === 'unsigned'
									? 8
									: 16;
			if (change === 'shape' && i === 2) {
				for (let y = 0; y < 64; y++)
					for (let x = 0; x < 64; x++)
						if (Math.abs(x + 0.5 - wrist.x * 64) <= 3 && Math.abs(y + 0.5 - wrist.y * 64) <= 3) {
							mask[y * 64 + x] = 1;
							layer.data.set([150, 90, 40, 255], (y * 64 + x) * 4);
						}
			} else
				for (let s = 0; s < length; s += 0.25)
					for (const o of [-0.5, 0.5]) {
						const x = Math.floor(wrist.x * 64 + s * Math.sin(t) + o * Math.cos(t)),
							y = Math.floor(wrist.y * 64 - s * Math.cos(t) + o * Math.sin(t));
						if (x >= 0 && y >= 0 && x < 64 && y < 64) {
							mask[y * 64 + x] = 1;
							layer.data.set([150, 90, 40, 255], (y * 64 + x) * 4);
						}
					}
			return {
				key: `${id}/${d}/${i}`,
				call: 0,
				base,
				input: base,
				out: layer,
				layer,
				mask,
				area: mask.reduce((a, b) => a + b, 0),
				outBand: 0,
				baseBand: 0,
				specks: 0,
				pinholes: 0,
				shifted: false,
				offset: [0, 0],
				stray: 0,
				posed: true,
				keyKept: 1,
				keyOutside: 0
			};
		})
	);
	const q = itemQa(rig, slotOf('main_hand'), 'green', cells, 0);
	return { rig, cells, q };
}
const reasons = (q: ItemQa, rig: Rig) => qaReasons(q, true, true, rig);
const reason = "Check the item's size and angle as it moves";
const item = (qa: ItemQa): Item => ({
	id: 'rod',
	name: 'Rod',
	slot: 'main_hand',
	status: 'accepted',
	mirror: 'flip',
	materials: [],
	prompt: '',
	baseHash: 'sha256:test',
	provenance: [],
	layers: [
		{
			id: 'main',
			role: 'fg',
			z: 8,
			cells: { walk: { south: Array(8).fill(null), east: Array(8).fill(null) } }
		}
	],
	qa
});

test('one wrong hip cannot silently waive a held-item reversal, and review never authorizes a retry', () => {
	const { rig, cells, q } = fixture('flip');
	expect(isAction('walk/south', rig)).toBe(true); // Preserve classification rather than guessing that valid action art is broken.
	expect(q.qa).toMatchObject({
		status: 'warn',
		motionReviewClips: 1,
		clips: { 'walk/south': { status: 'warn', motionReviewClips: 1 } }
	});
	expect(q.failCalls.size).toBe(0);
	expect(q.softCalls.size).toBe(0);
	expect(isClean({ cells, qa: q, g1: new Map(), preview: null })).toBe(false);
	expect(reasons(q.qa, rig)).toContain(reason);
	expect(q.warnings.filter((w) => w.startsWith('G16 '))).toHaveLength(1);
	expect(plainReason(q.warnings.find((w) => w.startsWith('G16 '))!)).toBe(reason);
});

test('clean art, declared actions and ordinary locomotion retain their policies', () => {
	expect(fixture().q.qa.status).toBe('pass');
	expect(fixture().q.qa).not.toHaveProperty('motionReviewClips');
	expect(fixture('flip', 'dodge').q.qa.status).toBe('pass');
	expect(fixture('flip', 'rune-blast').q.qa.status).toBe('pass');
	const strict = fixture('flip', 'walk', false).q;
	expect([...strict.failCalls.values()].flat().some((w) => w.startsWith('G9 '))).toBe(true);
	expect(strict.qa).not.toHaveProperty('motionReviewClips');
});

test('unsigned turns, shape changes and size changes become review, never new hard failures', () => {
	for (const change of ['turn', 'unsigned', 'shape', 'shrink'] as const) {
		const { q } = fixture(change);
		if (change === 'shrink') expect(q.qa.maxAreaCV).toBeGreaterThan(GATES.areaCV);
		expect(q.qa.status, `${change}: ${JSON.stringify(q.clips)}`).toBe('warn');
		expect(q.qa.motionReviewClips, change).toBe(1);
		expect(q.failCalls.size, change).toBe(0);
		expect(q.softCalls.size, change).toBe(0);
	}
	// Missing art keeps the independent presence failure; the motion warning must never excuse it.
	expect([...fixture('empty').q.failCalls.values()].flat().some((w) => w.startsWith('G4 '))).toBe(
		true
	);
});

test('a change only at the loop seam receives one durable review note', () => {
	const { q } = fixture('seam');
	expect(q.qa).toMatchObject({ status: 'warn', motionReviewClips: 1 });
	expect(q.failCalls.size).toBe(0);
	expect(q.softCalls.size).toBe(0);
	expect(q.warnings.filter((w) => w.startsWith('G16 '))).toHaveLength(1);
});

test('size variation below the existing check limit does not create a motion review', () => {
	const { q } = fixture('small-size-change');
	expect(q.qa.maxAreaCV).toBeLessThan(GATES.areaCV);
	expect(q.qa.status).toBe('pass');
	expect(q.qa).not.toHaveProperty('motionReviewClips');
});

test('acceptance, JSON reload and replacement preserve only the current motion reviews', () => {
	const first = fixture('flip', 'walk', true, ['south', 'east']),
		loaded = JSON.parse(JSON.stringify(item(acceptQa(first.q.qa)))) as Item;
	expect(loaded.qa).toMatchObject({ status: 'accepted', motionReviewClips: 2 });
	expect(healthOf({ rig: first.rig } as Parameters<typeof healthOf>[0], loaded)).toBe('accepted');
	expect(reasons(loaded.qa!, first.rig)).toContain(reason);
	const south = fixture('clean'),
		partial = mergeQa(loaded, south.q.qa, south.q.qa.cells);
	expect(partial.motionReviewClips).toBe(1);
	expect(reasons(partial, first.rig)).toContain(reason);
	const east = fixture('clean', 'walk', true, ['east']),
		final = mergeQa(item(partial), east.q.qa, east.q.qa.cells);
	expect(final).not.toHaveProperty('motionReviewClips');
	expect(final.status).toBe('pass');
	expect(reasons(final, first.rig)).not.toContain(reason);
});

test('the saved review reason survives an editable ZIP export and import', async () => {
	const project = await loadFixture(
		async (path) =>
			new Uint8Array(await readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url)))
	);
	const saved = project.manifest.items.find((i) => i.slot !== 'body')!;
	saved.qa = acceptQa(fixture('flip').q.qa);
	const exported = await exportFiles(project, { engines: ['generic'], baked: false });
	expect(exported.errors).toEqual([]);
	const restored = (
		await readCharacterZip(await zip(exported.entries))
	).project.manifest.items.find((i) => i.id === saved.id)!;
	expect(restored.qa).toMatchObject({ status: 'accepted', motionReviewClips: 1 });
	expect(reasons(restored.qa!, project.manifest.rig)).toContain(reason);
});
