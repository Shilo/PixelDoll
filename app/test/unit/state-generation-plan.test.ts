import { expect, test } from 'vitest';
import { DIRECTIONS } from '../../src/lib/rig/rig.ts';
import {
	planStateGeneration,
	type StateGenerationInput
} from '../../src/studio/stateGenerationPlan.ts';

const square = (side: number) => ({ width: side, height: side });
const facingIds = Object.freeze([...DIRECTIONS]);
const pro = (side: number, count: number, options?: Partial<StateGenerationInput>) =>
	planStateGeneration({
		model: 'pro',
		cellSize: square(side),
		facingIds: facingIds.slice(0, count),
		...options
	});

test('only size-compatible verified Pro text uses the managed parent', () => {
	const managedParent = Object.freeze({
		id: 'verified-parent',
		size: Object.freeze(square(96)),
		facingCount: 8 as const
	});
	const plan = pro(96, 3, { managedParent });
	expect(plan).toMatchObject({
		kind: 'ready',
		endpoint: '/create-character-state',
		parentId: managedParent.id,
		remoteFacingCount: 8,
		batches: [{ facingIds: facingIds.slice(0, 3), transport: 'cells' }]
	});
	expect(plan).not.toHaveProperty('cost');
	expect(pro(95, 3, { managedParent })).toMatchObject({ endpoint: '/edit-images-v2' });
	expect(pro(96, 5, { managedParent: { ...managedParent, facingCount: 4 } })).toMatchObject({
		endpoint: '/edit-images-v2'
	});
	expect(pro(96, 3, { managedParent, referenceSize: square(130) })).toMatchObject({
		endpoint: '/edit-images-v2',
		method: 'reference',
		referenceSize: square(130),
		batches: [{ facingIds: facingIds.slice(0, 3), transport: 'cells' }]
	});
});

test.each([
	{ side: 32, count: 8 },
	{ side: 64, count: 8 },
	{ side: 65, count: 8 },
	{ side: 80, count: 8 },
	{ side: 81, count: 3 },
	{ side: 128, count: 3 },
	{ side: 129, count: 1 },
	{ side: 512, count: 1 }
])(
	'Pro reference edits $count native $side px cells without dropping the reference',
	({ side, count }) => {
		expect(pro(side, count, { referenceSize: square(512) })).toMatchObject({
			endpoint: '/edit-images-v2',
			method: 'reference',
			referenceSize: square(512),
			batches: [{ facingIds: facingIds.slice(0, count), transport: 'cells' }]
		});
	}
);

test('prefers native cells until the reference uses a slot, then packs a full sheet', () => {
	const cellSize = { width: 80, height: 81 };
	expect(pro(81, 4, { cellSize })).toMatchObject({
		batches: [{ facingIds: facingIds.slice(0, 4), transport: 'cells' }],
		warnings: []
	});
	expect(pro(81, 4, { cellSize, referenceSize: square(128) })).toMatchObject({
		endpoint: '/edit-images-v2',
		method: 'reference',
		cellSize,
		referenceSize: square(128),
		batches: [
			{
				facingIds: facingIds.slice(0, 4),
				transport: 'sheet',
				canvas: { width: 160, height: 162 },
				columns: 2,
				rows: 2
			}
		],
		warnings: ['sheet-quality-unverified'],
		cost: { kind: 'estimate', minGenerations: 10, maxGenerations: 10 }
	});
	expect(pro(128, 8)).toMatchObject({
		batches: [{ transport: 'sheet', canvas: { width: 512, height: 256 } }]
	});
});

test.each([
	{ side: 171, count: 5, sizes: [3, 2], endpoint: '/edit-animation-v2', generations: 50 },
	{ side: 256, count: 5, sizes: [3, 2], endpoint: '/edit-animation-v2', generations: 50 },
	{
		side: 171,
		count: 7,
		sizes: [3, 2, 2],
		endpoint: '/transfer-outfit-v2',
		referenceSize: square(256),
		generations: 75
	},
	{
		side: 256,
		count: 5,
		sizes: [3, 2],
		endpoint: '/transfer-outfit-v2',
		referenceSize: square(256),
		generations: 50
	}
])(
	'balances $endpoint batches at $side px without duplicate facings',
	({ side, count, sizes, endpoint, referenceSize, generations }) => {
		const plan = pro(side, count, { referenceSize });
		expect(plan).toMatchObject({
			endpoint,
			cost: { kind: 'estimate', minGenerations: generations, maxGenerations: generations }
		});
		if (plan.kind !== 'ready') throw new Error(plan.reason);
		expect(plan.batches.map((batch) => batch.facingIds.length)).toEqual(sizes);
		expect(plan.batches.flatMap((batch) => batch.facingIds)).toEqual(facingIds.slice(0, count));
		expect(plan.batches.every((batch) => batch.transport === 'cells')).toBe(true);
	}
);

test('uses single-frame Pro edits above one known limit or when transfer cannot keep the reference', () => {
	const referenceSize = { width: 257, height: 128 };
	expect(pro(256, 5, { referenceSize })).toMatchObject({
		endpoint: '/edit-images-v2',
		method: 'reference',
		referenceSize,
		batches: facingIds.slice(0, 5).map((id) => ({ facingIds: [id], transport: 'cells' }))
	});
	expect(pro(257, 2)).toMatchObject({
		endpoint: '/edit-images-v2',
		batches: [{ transport: 'cells' }, { transport: 'cells' }]
	});
	expect(pro(256, 1)).toMatchObject({
		endpoint: '/edit-images-v2',
		batches: [{ facingIds: ['south'], transport: 'cells' }]
	});
	expect(pro(64, 1, { referenceSize: square(513) })).toEqual({
		kind: 'rejected',
		reason: 'reference-too-large'
	});
	expect(pro(513, 1)).toEqual({ kind: 'rejected', reason: 'unsupported-cell-size' });
});

test('uses the 16 px animation minimum only when multiple text targets are available', () => {
	expect(pro(16, 2)).toMatchObject({
		endpoint: '/edit-animation-v2',
		batches: [{ transport: 'cells', facingIds: facingIds.slice(0, 2) }]
	});
	expect(pro(16, 1)).toEqual({ kind: 'rejected', reason: 'unsupported-cell-size' });
	expect(pro(15, 2)).toEqual({ kind: 'rejected', reason: 'unsupported-cell-size' });
});

test('pads Pixen sheets at their edges, keeps the native cell stride, and splits in order', () => {
	const cellSize = { width: 93, height: 101 };
	const input = { model: 'pixen', cellSize, facingIds } as const;
	expect(planStateGeneration(input)).toMatchObject({
		endpoint: '/edit-image-pixen',
		cellSize,
		batches: [0, 4].map((offset) => ({
			transport: 'sheet',
			facingIds: facingIds.slice(offset, offset + 4),
			canvas: { width: 188, height: 204 },
			columns: 2,
			rows: 2
		})),
		cost: { kind: 'fixed', minGenerations: 2, maxGenerations: 2 }
	});
	expect(
		planStateGeneration({ ...input, cellSize: square(4), facingIds: ['south'] })
	).toMatchObject({
		cellSize: square(4),
		batches: [{ transport: 'sheet', canvas: square(16), columns: 1, rows: 1 }]
	});
	expect(planStateGeneration({ ...input, cellSize: square(257) })).toEqual({
		kind: 'rejected',
		reason: 'unsupported-cell-size'
	});
	expect(planStateGeneration({ ...input, referenceSize: square(32) })).toEqual({
		kind: 'rejected',
		reason: 'pixen-reference-unsupported'
	});
});

test('Flash uses confirmed canvases and pads or splits without resizing', () => {
	const input = {
		model: 'pro-flash',
		cellSize: square(64),
		facingIds: facingIds.slice(0, 4)
	} as const;
	expect(planStateGeneration(input)).toEqual({
		kind: 'rejected',
		reason: 'flash-shapes-unconfirmed'
	});
	expect(planStateGeneration({ ...input, flashNativeShapes: [square(63)] })).toEqual({
		kind: 'rejected',
		reason: 'flash-canvas-unsupported'
	});
	const packed = { ...input, flashNativeShapes: [square(128)], referenceSize: square(90) };
	const plan = planStateGeneration(packed);
	expect(plan).toMatchObject({
		endpoint: '/edit-image-pro-flash',
		method: 'reference',
		referenceSize: square(90),
		batches: [
			{ transport: 'sheet', facingIds: input.facingIds, canvas: square(128), columns: 2, rows: 2 }
		]
	});
	expect(plan).not.toHaveProperty('cost');
	expect(planStateGeneration({ ...packed, flashNativeShapes: [square(64)] })).toEqual({
		kind: 'rejected',
		reason: 'reference-too-large'
	});
	expect(planStateGeneration({ ...input, flashNativeShapes: [square(64)] })).toMatchObject({
		endpoint: '/edit-image-pro-flash',
		method: 'text',
		batches: input.facingIds.map((id) => ({ facingIds: [id], transport: 'cells' }))
	});
	expect(
		planStateGeneration({
			...input,
			cellSize: square(65),
			flashNativeShapes: [{ width: 132, height: 68 }]
		})
	).toMatchObject({
		batches: [
			{ transport: 'sheet', facingIds: input.facingIds.slice(0, 2), columns: 2, rows: 1 },
			{ transport: 'sheet', facingIds: input.facingIds.slice(2), columns: 2, rows: 1 }
		]
	});
});

test('rejects invalid geometry and duplicate or empty facing lists', () => {
	expect(pro(64, 0)).toEqual({ kind: 'rejected', reason: 'no-facings' });
	expect(pro(64, 2, { facingIds: ['south', 'south'] })).toEqual({
		kind: 'rejected',
		reason: 'duplicate-facings'
	});
	expect(pro(64.5, 2)).toEqual({ kind: 'rejected', reason: 'invalid-cell-size' });
	expect(pro(64, 2, { referenceSize: square(0) })).toEqual({
		kind: 'rejected',
		reason: 'invalid-reference-size'
	});
});
