import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { base64ToBytes, bytesToBase64, makeImg } from '../../src/lib/image/png.ts';
import { decodePngBytes, encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { png, type B64Image } from '../../src/lib/pixellab/routes.ts';
import { DEFAULT_MOVE, DIRECTIONS, type Rig } from '../../src/lib/rig/rig.ts';
import {
	planStateGeneration,
	type StateGenerationInput
} from '../../src/studio/stateGenerationPlan.ts';
import { ridingStatePlan } from '../../src/studio/ridingStatePlan.ts';
import type { StateGenerationSource } from '../../src/studio/stateGenerationSource.ts';
import { decodeStateBatch, stateRequests } from '../../src/studio/stateGenerationTransport.ts';

const square = (side: number) => ({ width: side, height: side });
const description = 'Add a silver crown';
const controls = { seed: 41, no_background: true };
const encoded = expect.objectContaining({
	type: 'base64',
	format: 'png',
	base64: expect.any(String)
});

function setup(input: StateGenerationInput) {
	const plan = planStateGeneration(input);
	if (plan.kind !== 'ready') throw new Error(plan.reason);
	const source: StateGenerationSource = {
		size: input.cellSize,
		version: 'frozen',
		views: input.facingIds.map((direction, index) => {
			const image = makeImg(input.cellSize.width, input.cellSize.height);
			image.data.set([10, 20, 30, 0, 40, 50, 60, index + 1]);
			image.data.set([70, 80, 90, 255], image.data.length - 4);
			return { direction, image, hash: `sha256:${direction}` };
		})
	};
	return { plan, source };
}

async function makeReference() {
	const image = makeImg(32, 36);
	image.data.set([9, 8, 7, 255]);
	return { width: image.w, height: image.h, base64: bytesToBase64(await encodePngBytes(image)) };
}

const referenceSize = ({ width, height }: { width: number; height: number }) => ({ width, height });

test('managed States request a child from the parent, not local images', async () => {
	const cellSize = square(64);
	const { plan, source } = setup({
		model: 'pro',
		cellSize,
		facingIds: DIRECTIONS.slice(0, 3),
		managedParent: { id: 'provider-parent', size: cellSize, facingCount: 8 }
	});
	expect(await stateRequests(plan, source, 'crowned', description, controls.seed)).toEqual([
		{
			method: 'POST',
			path: '/create-character-state',
			body: {
				character_id: 'provider-parent',
				state_name: 'crowned',
				edit_description: description,
				...controls
			}
		}
	]);
	expect(() => decodeStateBatch(plan, plan.batches[0], [])).toThrow('child character');
});

test('Pro image edits use native dimensions and the exact text or reference body', async () => {
	const cellSize = square(64);
	const facingIds = DIRECTIONS.slice(0, 2);
	const text = setup({ model: 'pro', cellSize, facingIds });
	const edit_images = facingIds.map(() => ({ image: encoded, ...cellSize }));
	const common = { edit_images, image_size: cellSize, description, ...controls };
	const reference = await makeReference();
	const guided = setup({
		model: 'pro',
		cellSize,
		facingIds,
		referenceSize: referenceSize(reference)
	});
	const { base64, ...size } = reference;
	for (const [state, ref, body] of [
		[text, undefined, { ...common, method: 'edit_with_text' }],
		[
			guided,
			reference,
			{ ...common, method: 'edit_with_reference', reference_image: { image: png(base64), ...size } }
		]
	] as const) {
		expect(
			await stateRequests(state.plan, state.source, 'crowned', description, controls.seed, ref)
		).toEqual([{ method: 'POST', path: '/edit-images-v2', body }]);
	}
	await expect(
		stateRequests(guided.plan, guided.source, 'crowned', description, controls.seed)
	).rejects.toThrow('planned method');
	await expect(
		stateRequests(guided.plan, guided.source, 'crowned', description, controls.seed, {
			...reference,
			width: 36
		})
	).rejects.toThrow('planned dimensions');
});

test.each(['/edit-animation-v2', '/transfer-outfit-v2'] as const)(
	'%s sends balanced native frame batches with the correct prompt field',
	async (endpoint) => {
		const reference = endpoint === '/transfer-outfit-v2' ? await makeReference() : undefined;
		const cellSize = square(171);
		const { plan, source } = setup({
			model: 'pro',
			cellSize,
			facingIds: DIRECTIONS.slice(0, 5),
			referenceSize: reference && referenceSize(reference)
		});
		const requests = await stateRequests(
			plan,
			source,
			'crowned',
			description,
			controls.seed,
			reference
		);
		expect(requests).toEqual(
			[3, 2].map((count, index) => ({
				method: 'POST',
				path: endpoint,
				body: {
					frames: Array.from({ length: count }, () => ({ image: encoded, size: cellSize })),
					image_size: cellSize,
					...controls,
					seed: controls.seed + index,
					...(reference
						? {
								reference_image: {
									image: png(reference.base64),
									size: { width: reference.width, height: reference.height }
								},
								additional_instructions: description
							}
						: { description })
				}
			}))
		);
	}
);

test.each(['text', 'reference'] as const)(
	'Flash %s sends a single native image',
	async (method) => {
		const reference = method === 'reference' ? await makeReference() : undefined;
		const cellSize = square(64);
		const { plan, source } = setup({
			model: 'pro-flash',
			cellSize,
			facingIds: ['south'],
			flashNativeShapes: [cellSize],
			referenceSize: reference && referenceSize(reference)
		});
		expect(
			await stateRequests(plan, source, 'crowned', description, controls.seed, reference)
		).toEqual([
			{
				method: 'POST',
				path: '/edit-image-pro-flash',
				body: {
					image: encoded,
					method,
					...controls,
					...(reference ? { reference_image: png(reference.base64) } : { description })
				}
			}
		]);
	}
);

test('Pixen packs in planned row-major order with transparent padding and crops back exact pixels', async () => {
	const { plan, source } = setup({
		model: 'pixen',
		cellSize: { width: 97, height: 127 },
		facingIds: ['north', 'west', 'south']
	});
	const original = [...source.views];
	source.views.reverse();
	const [request] = await stateRequests(plan, source, 'crowned', description, controls.seed);
	expect(request).toEqual({
		method: 'POST',
		path: '/edit-image-pixen',
		body: { image: encoded, width: 196, height: 256, description, ...controls }
	});
	const { image } = request.body as { image: B64Image };
	const sheet = await decodePngBytes(base64ToBytes(image.base64));
	const pixel = (x: number, y: number) =>
		Array.from(sheet.data.subarray((y * sheet.w + x) * 4, (y * sheet.w + x) * 4 + 4));
	expect(pixel(98, 0)).toEqual([40, 50, 60, 2]);
	expect(pixel(1, 127)).toEqual([40, 50, 60, 3]);
	expect(pixel(98, 127)).toEqual([0, 0, 0, 0]);
	expect(pixel(195, 255)).toEqual([0, 0, 0, 0]);
	expect(decodeStateBatch(plan, plan.batches[0], [sheet])).toEqual(
		original.map(({ direction, image }) => ({ direction, image }))
	);
	const paddingOnly = makeImg(sheet.w, sheet.h);
	paddingOnly.data.set([9, 8, 7, 255], paddingOnly.data.length - 4);
	// Pixels in the padding are no facing's art, so every facing reads as blank and is left out.
	expect(decodeStateBatch(plan, plan.batches[0], [paddingOnly])).toEqual([]);
});

test('batch decoding rejects missing, extra and malformed provider results and leaves out blank facings', () => {
	const cellSize = square(64);
	const { plan, source } = setup({ model: 'pro', cellSize, facingIds: ['south', 'north'] });
	const [batch] = plan.batches;
	const [south, north] = source.views.map(({ image }) => image);
	expect(decodeStateBatch(plan, batch, [south, north])).toEqual([
		{ direction: 'south', image: south },
		{ direction: 'north', image: north }
	]);
	expect(() => decodeStateBatch(plan, batch, [south])).toThrow('2 State result');
	expect(() => decodeStateBatch(plan, batch, [south, north, south])).toThrow('2 State result');
	expect(() => decodeStateBatch(plan, batch, [south, makeImg(64, 65)])).toThrow('RGBA image');
	expect(() =>
		decodeStateBatch(plan, batch, [south, { ...north, data: north.data.slice(4) }])
	).toThrow('RGBA image');
	expect(decodeStateBatch(plan, batch, [south, makeImg(64, 64)])).toEqual([
		{ direction: 'south', image: south }
	]);
});

test('Riding sends one transparent guided pose per drawn facing and retains one cell', async () => {
	for (const body of ['A', 'C', 'N']) {
		const { rig } = JSON.parse(
			readFileSync(new URL(`../fixtures/bench/body${body}.json`, import.meta.url), 'utf8')
		) as { rig: Rig };
		rig.animations.unshift({
			id: DEFAULT_MOVE,
			cells: 1,
			loop: false,
			frames: [{ cell: 0, ms: 100 }]
		});
		const { source } = setup({
			model: 'pro',
			cellSize: { width: rig.cell.w, height: rig.cell.h },
			facingIds: ['south', 'east']
		});
		for (const view of source.views) view.hash = rig.rest![view.direction]!.image;
		const frame = { clip: DEFAULT_MOVE, frame: 0 };
		const plan = ridingStatePlan(rig, frame, source)!;
		expect(plan.cost).toEqual({ kind: 'estimate', minGenerations: 4, maxGenerations: 4 });
		const [south, east] = await stateRequests(plan, source, 'riding', description, controls.seed);
		expect(south).toMatchObject({
			method: 'POST',
			path: '/animate-with-skeleton-v3',
			body: { ...controls, action: description, direction: 'south', first_frame: encoded }
		});
		expect(east.body).toMatchObject({ direction: 'east', seed: controls.seed + 1 });
		const target = plan.guides[0].poses;
		expect(target).toEqual([target[0], target[0], target[0]]);
		const joints = Object.fromEntries(target[0].map((joint) => [joint.label, joint]));
		expect(joints['RIGHT LEG'].x).toBeLessThan(joints['RIGHT KNEE'].x);
		expect(joints['LEFT LEG'].x).toBeGreaterThan(joints['LEFT KNEE'].x);
		expect(joints['LEFT LEG'].y).toBeGreaterThan(joints['LEFT KNEE'].y);
		expect(joints['LEFT LEG'].y * rig.cell.h).toBeLessThanOrEqual(rig.cell.h - 2.99);
		const length = (a: string, b: string) =>
			Math.hypot(joints[a].x - joints[b].x, joints[a].y - joints[b].y);
		const torso = (joints['LEFT HIP'].y + joints['RIGHT HIP'].y) / 2 - joints.NECK.y;
		expect(length('LEFT HIP', 'LEFT KNEE') + length('LEFT KNEE', 'LEFT LEG')).toBeLessThanOrEqual(
			torso * 1.7
		);
		const image = source.views[0].image;
		expect(decodeStateBatch(plan, plan.batches[0], [image, image, image])).toEqual([
			{ direction: 'south', image }
		]);
		expect(ridingStatePlan(rig, { ...frame, clip: 'riding' }, source)).toBeUndefined();
	}
});
