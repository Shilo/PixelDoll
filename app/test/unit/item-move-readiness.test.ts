import { beforeEach, expect, test, vi } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import type { RigCtx } from '../../src/lib/items/run.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { addMove, itemMoveOffer, type MoveSpec } from '../../src/studio/create.ts';
import { LocalizedError } from '../../src/lib/message.ts';

const state = vi.hoisted(() => ({ ctx: null as RigCtx | null, pose: vi.fn(), split: vi.fn() }));
vi.mock('../../src/lib/store/project.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/project.ts')>()),
	loadProject: async () => state.ctx!
}));
vi.mock('../../src/lib/items/run.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/items/run.ts')>()),
	poseItemClip: (...args: unknown[]) => state.pose(...args)
}));
vi.mock('../../src/lib/dress/regions.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/dress/regions.ts')>()),
	splitBase: (...args: unknown[]) => state.split(...args)
}));

beforeEach(() => {
	state.pose.mockReset().mockResolvedValue(undefined);
	state.split.mockReset().mockResolvedValue({ dirty: false });
});
async function fixture() {
	const project = await equipmentFixture(),
		m = project.manifest,
		reference = m.items[0].layers[0].cells!.rest!.south![0]!;
	const points = LABELS.map((label) => ({ label, x: 0.5, y: 0.5 }));
	m.rig.rest = { south: { image: reference, keypoints: points } };
	m.rig.animations[0].sources = {
		south: {
			route: 'import',
			reference,
			keypoints: [points],
			motion: 'imported-rest',
			provenance: []
		}
	};
	for (const id of ['valid_custom', 'unrelated_missing_joints']) {
		m.rig.animations.push({
			id,
			cells: 8,
			loop: true,
			frames: Array.from({ length: 8 }, (_, cell) => ({ cell, ms: 100 })),
			...(id === 'valid_custom'
				? {
						sources: {
							south: {
								route: 'import' as const,
								reference,
								keypoints: Array(8).fill(points),
								provenance: []
							}
						}
					}
				: {})
		});
		m.items[0].layers[0].cells![id] = { south: Array(8).fill(reference) };
	}
	Object.assign(m.items[1], {
		route: 'skeleton-pose',
		key: 'green',
		dressed: { south: reference }
	});
	state.ctx = {
		rec: { id: 'rig-scoped-readiness', savedAt: '', origin: 'studio', manifest: m },
		project
	};
	return {
		manifest: m,
		spec: {
			id: 'valid_custom',
			frames: 8,
			items: ['hat'],
			dirs: ['south'],
			itemsOnly: true,
			seed: 43
		} satisfies MoveSpec
	};
}

test('a priced existing item move executes without joints on unrelated moves or a managed character ID', async () => {
	const { manifest, spec } = await fixture(),
		offer = itemMoveOffer(manifest, [spec]);
	expect(offer.gens).toBe(3);
	await expect(addMove('rig-scoped-readiness', offer.specs[0])).resolves.toEqual({
		warnings: []
	});
	expect(state.pose).toHaveBeenCalledOnce();
	expect(state.pose.mock.calls[0][2]).toBe('valid_custom');
	// A body never split is split before posing; once split, item work on a move it already has rewrites no body frame.
	expect(state.split).toHaveBeenCalledOnce();
	state.split.mockClear();
	manifest.items[0].regions = 'shirt-shorts';
	await addMove('rig-scoped-readiness', offer.specs[0]);
	expect(state.split).not.toHaveBeenCalled();
	// A move request resumed after its body frames were saved (a reload cut it off before the split) still splits them.
	state.ctx!.rec.character = { id: 'managed', looks: 'a body' };
	manifest.rig.animations = manifest.rig.animations.filter(
		(move) => move.id !== 'unrelated_missing_joints'
	);
	delete manifest.items[0].layers[0].cells!.unrelated_missing_joints;
	await addMove('rig-scoped-readiness', { ...spec, itemsOnly: undefined });
	expect(state.split).toHaveBeenCalledOnce();
	expect(state.split.mock.calls[0][1]).toBe('valid_custom');
});

test('invalid joints on the selected move stop before generation', async () => {
	const { manifest, spec } = await fixture();
	manifest.rig.animations[1].sources!.south!.keypoints![0] = [];
	expect(itemMoveOffer(manifest, [spec])).toMatchObject({ gens: null, specs: [] });
	await expect(addMove('rig-scoped-readiness', spec)).rejects.toThrow(/joints/);
	expect(state.pose).not.toHaveBeenCalled();
});

test('a partly failed item move names the saved views and says Try again requests only the missing ones', async () => {
	const { PartialMoveError } = await import('../../src/lib/items/run.ts');
	const run = async (reason: string | Error) => {
		const { manifest, spec } = await fixture(),
			offer = itemMoveOffer(manifest, [spec]);
		// A local mock: a rejection recorded by the module-level one fails the test in this Vitest version.
		const shared = state.pose;
		state.pose = vi.fn(async () => {
			throw new PartialMoveError(reason, ['south', 'north-west']);
		});
		try {
			return (await addMove('rig-scoped-readiness', offer.specs[0]).catch(
				(e: Error) => e
			)) as LocalizedError;
		} finally {
			state.pose = shared;
		}
	};
	expect((await run('Hat valid_custom east: lost.')).message).toBe(
		'Hat valid_custom east: lost. The finished views were saved (South, North-west); Try again requests only the missing ones.'
	);
	// A translated reason stays a Message inside the translated stop, so neither part reaches the user in English.
	const lost = new LocalizedError('east: lost', 'create.errors.resultMissingStorage', {
		label: 'east/0'
	});
	expect((await run(lost)).translation).toEqual({
		key: 'create.errors.partialSavedRetry',
		vars: { reason: lost.translation, views: 'South, North-west' }
	});
});

test('saved-frame recovery passes through to posing and never covers a body clip or a replace', async () => {
	const { manifest, spec } = await fixture(),
		offer = itemMoveOffer(manifest, [spec]);
	const reviewed = { ...offer.specs[0] };
	delete reviewed.itemReview;
	await addMove('rig-scoped-readiness', { ...reviewed, reuseItemFrames: true });
	expect(state.pose.mock.calls[0][7]).toBe(true); // savedOnly
	state.pose.mockClear();
	for (const bad of [
		{ ...reviewed, reuseItemFrames: true as const, itemsOnly: undefined },
		{ ...reviewed, reuseItemFrames: true as const, replace: true },
		{ ...reviewed, reuseItemFrames: true as const, id: 'brand_new' },
		{ ...reviewed, reuseItemFrames: true as const, itemMethod: 'grid' as const }
	])
		await expect(addMove('rig-scoped-readiness', bad as MoveSpec)).rejects.toThrow(
			'Saved equipment recovery needs an existing move and its equipment only. No generation was requested.'
		);
	expect(state.pose).not.toHaveBeenCalled();
});
