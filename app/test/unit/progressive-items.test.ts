import { expect, test } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import { coverage, itemRoute, standingCoverage } from '../../src/studio/itemRoute.ts';
import { baseMoveSpecs, itemMoveOffer, missingItemMoves } from '../../src/studio/create.ts';
import { itemPlan, movePlan } from '../../src/studio/apiPlans.ts';
import { hasCells, hasCompleteCells, coverageGaps, missingAt } from '../../src/lib/dress/dress.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { DIRECTIONS, type DirectionName, type RigAnimation } from '../../src/lib/rig/rig.ts';
import type { RigCtx } from '../../src/lib/items/run.ts';
import { splitBase } from '../../src/lib/dress/regions.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { cellHash } from '../../src/lib/rig/rig.ts';
import { rigReady } from '../../src/lib/rig/setup.ts';

async function fixture(names: [string, number][] = [], dirs: DirectionName[] = ['south']) {
	const project = await equipmentFixture(),
		m = project.manifest,
		rig = m.rig,
		base = m.items[0],
		hash = base.layers[0].cells!.rest!.south![0]!;
	const points = LABELS.map((label) => ({ label, x: 0.5, y: 0.5 }));
	rig.directions = dirs.map((id) => ({ id }));
	rig.rest = Object.fromEntries(dirs.map((d) => [d, { image: hash, keypoints: points }]));
	rig.animations = [
		{ id: 'still-custom', cells: 1, frames: [{ cell: 0, ms: 100 }], loop: true },
		...names.map(
			([id, cells]) =>
				({
					id,
					cells,
					loop: true,
					frames: Array.from({ length: cells }, (_, cell) => ({ cell, ms: 100 })),
					sources: Object.fromEntries(
						dirs.map((d) => [
							d,
							{
								route: 'import',
								reference: hash,
								keypoints: Array.from({ length: cells }, () => points),
								motion: 'estimated:frozen-import',
								provenance: []
							}
						])
					)
				}) satisfies RigAnimation
		)
	];
	base.layers[0].cells = Object.fromEntries(
		rig.animations.map((a) => [
			a.id,
			Object.fromEntries(dirs.map((d) => [d, Array(a.cells).fill(hash)]))
		])
	);
	const item = m.items[1];
	item.route = 'skeleton-pose';
	item.key = 'green';
	item.dressed = Object.fromEntries(dirs.map((d) => [d, hash]));
	item.layers[0].cells = { 'still-custom': Object.fromEntries(dirs.map((d) => [d, [null]])) };
	item.coverage = dirs.map((d) => `still-custom/${d}/0` as const);
	return { rec: { id: 'rig-progressive', savedAt: '', manifest: m }, project } satisfies RigCtx;
}

test.each([0, 1, 40])(
	'initial item plans dress standing only with %i arbitrary animated moves',
	async (count) => {
		const ctx = await fixture(
				Array.from({ length: count }, (_, i) => [`custom_action_${i}`, (i % 19) + 2])
			),
			input = { name: 'Hat', slot: 'head', prompt: 'red hat' };
		const scope = standingCoverage(ctx),
			draft = itemRoute.draft(ctx, input, []);
		expect(scope).toMatchObject({ anims: ['still-custom'], standing: 'still-custom' });
		expect(coverage(ctx).anims).toHaveLength(count + 1);
		expect(draft.spec).toMatchObject({ ...scope, method: 'skel' });
		expect(draft.calls.map((c) => c.kind)).toEqual(['dress']);
		const calls = itemPlan(ctx, input).filter((c) => c.method === 'POST');
		expect(calls.map((c) => c.path)).toEqual(['/edit-animation-v2']);
		expect(calls.reduce((sum, c) => sum + c.generations!, 0)).toBe(10);
		expect(itemRoute.plan(ctx.rec.manifest.rig, ctx, input).gens).toBe(10);
		expect(missingItemMoves(ctx.rec.manifest, 'hat').map((s) => s.id)).toEqual(
			Array.from({ length: count }, (_, i) => `custom_action_${i}`)
		);
	}
);

test('eight-direction nine-frame imported motion costs 24 later, with no new body or dressing calls', async () => {
	const ctx = await fixture([['the_chest_rises_custom', 9]], DIRECTIONS),
		m = ctx.rec.manifest;
	const initial = itemPlan(ctx, { name: 'Hat', prompt: 'red hat', slot: 'head' }).filter(
		(c) => c.method === 'POST'
	);
	expect(initial).toHaveLength(1);
	expect(initial[0].generations).toBe(10);
	const [spec] = missingItemMoves(m, 'hat', 12),
		offer = itemMoveOffer(m, [spec]),
		calls = movePlan(ctx.rec, offer.specs[0]).filter((c) => c.method === 'POST');
	expect(offer.gens).toBe(24);
	expect(calls).toHaveLength(8);
	expect(calls.every((c) => c.path === '/animate-with-skeleton-v3')).toBe(true);
	expect(calls.reduce((sum, c) => sum + c.generations!, 0)).toBe(24);
	expect(offer.specs[0]).toMatchObject({
		itemsOnly: true,
		id: 'the_chest_rises_custom',
		items: ['hat']
	});
});

test('missing moves preserve sparse body directions, mirrors, existing and intentionally transparent item frames', async () => {
	const ctx = await fixture(
			[
				['spell_charge', 31],
				['blink_any_name', 2]
			],
			['south', 'east']
		),
		m = ctx.rec.manifest;
	m.rig.directions.push({ id: 'west', mirrorOf: 'east' });
	delete m.items[0].layers[0].cells!.blink_any_name!.east;
	m.items[1].layers[0].cells!.spell_charge = { east: Array(31).fill(null) };
	m.items[1].coverage!.push(
		...Array.from({ length: 31 }, (_, i) => `spell_charge/east/${i}` as const)
	);
	expect(missingItemMoves(m, 'hat', 1).map((s) => ({ id: s.id, dirs: s.dirs }))).toEqual([
		{ id: 'spell_charge', dirs: ['south'] },
		{ id: 'blink_any_name', dirs: ['south'] }
	]);
	expect(hasCells(m, m.items[1], 'spell_charge', 'west')).toBe(true);
	expect(missingAt(m, { head: 'hat' }, 'spell_charge', 'west')).toEqual([]);
	expect(coverageGaps(m, m.items[1])).toEqual(['spell_charge/south', 'blink_any_name/south']);
	const [long] = missingItemMoves(m, 'hat'),
		plan = movePlan(ctx.rec, long).filter((c) => c.method === 'POST');
	expect(plan.map((c) => c.generations)).toEqual([3, 3, 3]); // balanced 11/10/10-frame batches
	const still = m.items[1];
	still.coverage = [];
	expect(hasCells(m, still, 'spell_charge', 'west')).toBe(false); // pending placeholders cannot count as authored transparency
});

test('a bad move quote does not prevent a separate valid move offer', async () => {
	const ctx = await fixture([
			['valid_cast', 8],
			['invalid_cast', 8]
		]),
		m = ctx.rec.manifest;
	const specs = missingItemMoves(m, 'hat');
	specs[1].dirs = ['north']; // a stale offer names a direction the character no longer has
	expect(itemMoveOffer(m, [specs[1]])).toMatchObject({
		specs: [],
		gens: null,
		error: expect.any(String)
	});
	const valid = itemMoveOffer(m, [specs[0]]);
	expect(valid.gens).toBe(3);
	expect(valid.specs).toHaveLength(1);
	expect(valid.specs[0].id).toBe('valid_cast');
});

test('explicit partial imported coverage cannot be skipped as complete just because one frame has pixels', async () => {
	const ctx = await fixture([['custom_partial', 2]]),
		m = ctx.rec.manifest,
		item = m.items[1];
	item.layers[0].cells!.custom_partial = { south: [item.dressed!.south!, null] };
	item.coverage!.push('custom_partial/south/0');
	expect(hasCells(m, item, 'custom_partial', 'south')).toBe(true); // copied artwork remains previewable
	expect(hasCompleteCells(m, item, 'custom_partial', 'south')).toBe(false);
	const specs = missingItemMoves(m, item.id);
	expect(specs.map((s) => s.id)).toEqual(['custom_partial']);
	expect(itemMoveOffer(m, specs).gens).toBe(2);
	expect(movePlan(ctx.rec, specs[0]).filter((c) => c.method === 'POST')).toHaveLength(1);
	item.coverage!.push('custom_partial/south/1'); // explicitly generated transparency completes the view
	expect(hasCompleteCells(m, item, 'custom_partial', 'south')).toBe(true);
	expect(missingItemMoves(m, item.id)).toEqual([]);
});

test('replacing a custom standing clip with motion makes its new equipment frames available', async () => {
	const ctx = await fixture(),
		m = ctx.rec.manifest,
		item = m.items[1],
		standing = m.rig.animations[0],
		rest = m.rig.rest!.south!;
	item.standing = standing.id;
	standing.cells = 4;
	standing.frames = Array.from({ length: 4 }, (_, cell) => ({ cell, ms: 100 }));
	standing.sources = {
		south: {
			route: 'skeleton-v3',
			reference: rest.image,
			keypoints: Array(4).fill(rest.keypoints),
			motion: 'authored:cast',
			provenance: []
		}
	};
	m.items[0].layers[0].cells![standing.id] = { south: Array(4).fill(rest.image) };
	delete item.layers[0].cells![standing.id];
	expect(missingItemMoves(m, item.id).map((s) => ({ id: s.id, frames: s.frames }))).toEqual([
		{ id: standing.id, frames: 4 }
	]);
});

test('standing discovery never buys an animated clip or trusts its name', async () => {
	const ctx = await fixture([
			['idle', 9],
			['walk', 8]
		]),
		rig = ctx.rec.manifest.rig;
	rig.animations.shift();
	expect(() => standingCoverage(ctx)).toThrow('No complete standing move');
	expect(() => itemRoute.draft(ctx, { name: 'Hat', slot: 'head', prompt: 'red hat' }, [])).toThrow(
		'No generations were requested'
	);
	rig.animations = [];
	expect(() => standingCoverage(ctx)).toThrow('No complete standing move');
});

test('unrigged imports with renamed standing views use only those frames; ambiguous or incomplete stills stop', async () => {
	const ctx = await fixture([['cast_spell', 8]], ['south', 'east']),
		rig = ctx.rec.manifest.rig;
	delete rig.rest;
	const input = { name: 'Hat', slot: 'head', prompt: 'red hat' };
	expect(itemRoute.draft(ctx, input, []).spec).toMatchObject({
		anims: ['still-custom'],
		method: 'anchor',
		standing: 'still-custom'
	});
	expect(
		itemPlan(ctx, input)
			.filter((c) => c.method === 'POST')
			.map((c) => c.path)
	).toEqual(['/edit-animation-v2']);
	rig.animations.push({
		id: 'another_still',
		cells: 1,
		frames: [{ cell: 0, ms: 100 }],
		loop: true
	});
	ctx.rec.manifest.items[0].layers[0].cells!.another_still = structuredClone(
		ctx.rec.manifest.items[0].layers[0].cells!['still-custom']
	);
	expect(() => standingCoverage(ctx)).toThrow('No complete standing move');
	rig.animations.pop();
	delete ctx.rec.manifest.items[0].layers[0].cells!['still-custom'].east;
	expect(() => standingCoverage(ctx)).toThrow('No complete standing move');
});

test('quick body moves never automatically include existing equipment', async () => {
	const ctx = await fixture(),
		m = ctx.rec.manifest;
	m.items[1].status = 'accepted';
	const specs = baseMoveSpecs(m);
	expect(specs).toHaveLength(2);
	expect(specs.every((s) => !s.items.length && !s.sharedItems?.length)).toBe(true);
});

test('verified standing aliases share one paid dress and do not require source keypoints to be rig-ready', async () => {
	const ctx = await fixture(),
		m = ctx.rec.manifest;
	m.rig.animations.push({ ...m.rig.animations[0], id: 'still_alias' });
	m.items[0].layers[0].cells!.still_alias = structuredClone(
		m.items[0].layers[0].cells!['still-custom']
	);
	const input = { name: 'Hat', slot: 'head', prompt: 'hat' };
	expect(standingCoverage(ctx).anims).toEqual(['still-custom', 'still_alias']);
	expect(itemRoute.draft(ctx, input, []).calls.map((c) => c.kind)).toEqual(['dress']);
	expect(rigReady({ ...ctx.rec, character: { id: 'imported', looks: 'body' } })).toBe(true);
	m.rig.rest!.south!.keypoints = []; // the same alias mapping also avoids duplicate anchor input frames
	expect(itemRoute.draft(ctx, input, []).calls.map((c) => c.cells)).toEqual([
		['still-custom/south/0']
	]);
});

test('local garment-region color processing preserves verified standing identity but never adopts an unrelated still', async () => {
	const ctx = await fixture(),
		m = ctx.rec.manifest,
		image = makeImg(64, 64);
	for (let y = 12; y < 55; y++)
		for (let x = 24; x < 40; x++)
			image.data.set(y < 24 ? [180, 100, 90, 255] : [158, 172, 177, 255], (y * 64 + x) * 4);
	const hash = await cellHash(image);
	ctx.project.images.set(hash, image);
	m.items[0].layers[0].cells!['still-custom'].south = [hash];
	m.rig.rest!.south!.image = hash;
	m.rig.animations[0].sources = {
		south: { route: 'import', reference: hash, motion: 'imported-rest', provenance: [] }
	};
	expect((await splitBase(ctx.project)).changed).toBeGreaterThan(0);
	expect(m.items[0].layers[0].cells!['still-custom'].south![0]).not.toBe(hash);
	expect(standingCoverage(ctx).anims).toEqual(['still-custom']);
	m.rig.animations[0].sources!.south!.motion = 'estimated:frozen-import';
	expect(() => standingCoverage(ctx)).toThrow('No complete standing move');
});
