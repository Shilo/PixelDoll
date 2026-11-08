import { beforeEach, expect, test, vi } from 'vitest';
import { equipmentFixture } from './equipment-fixture.ts';
import type { RigCtx } from '../../src/lib/items/run.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { addMove, itemMoveOffer, type MoveSpec } from '../../src/studio/create.ts';

const state = vi.hoisted(() => ({ ctx: null as RigCtx | null, pose: vi.fn() }));
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
	splitBase: async () => ({ dirty: false })
}));

beforeEach(() => state.pose.mockReset().mockResolvedValue(undefined));
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
	state.ctx = { rec: { id: 'rig-scoped-readiness', savedAt: '', manifest: m }, project };
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
		fitIds: [],
		warnings: []
	});
	expect(state.pose).toHaveBeenCalledOnce();
	expect(state.pose.mock.calls[0][2]).toBe('valid_custom');
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
	const run = async () => {
		const { manifest, spec } = await fixture(),
			offer = itemMoveOffer(manifest, [spec]);
		// A local mock: a rejection recorded by the module-level one fails the test in this Vitest version.
		const shared = state.pose;
		state.pose = vi.fn(async () => {
			throw new PartialMoveError('Hat valid_custom east: lost.', ['south', 'north-west']);
		});
		try {
			return (
				(await addMove('rig-scoped-readiness', offer.specs[0]).catch((e: Error) => e)) as Error
			).message;
		} finally {
			state.pose = shared;
		}
	};
	expect(await run()).toBe(
		'Hat valid_custom east: lost. The finished views were saved (South, North-west); Try again requests only the missing ones.'
	);
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
