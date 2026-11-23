import { afterEach, expect, test, vi } from 'vitest';
import { drawRequest, reviewCreateResults, type CreateSpec } from '../../src/studio/create.ts';
import * as queueModule from '../../src/lib/pixellab/queue.ts';
import { queue, type JobRec } from '../../src/lib/pixellab/queue.ts';
import * as db from '../../src/lib/store/db.ts';
import { DIRECTIONS } from '../../src/lib/rig/rig.ts';
import { makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';

afterEach(() => vi.restoreAllMocks());

const record = (id: string, requestHash: string, extra: Partial<JobRec>): JobRec =>
	({
		id,
		label: id,
		method: 'POST',
		endpoint: '/create-character-v3',
		params: {},
		inputs: [],
		requestHash,
		state: 'done',
		attempts: 1,
		nextAt: 0,
		createdAt: 1,
		jobs: [],
		gens: 0,
		usd: 0,
		...extra
	}) as JobRec;

test('a registration without a character keeps the paid draw and offers only a new registration', async () => {
	vi.spyOn(db, 'get').mockResolvedValue(undefined);
	const im = makeImg(48, 48);
	for (let y = 8; y < 44; y++)
		for (let x = 20; x < 27; x++) im.data.set([170, 120, 90, 255], (y * 48 + x) * 4);
	const blob = new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], {
		type: 'image/png'
	});
	vi.spyOn(db, 'getBlob').mockResolvedValue(blob);
	// The draw and the registration share an endpoint; the registration is the one sending the drawn views.
	vi.spyOn(queueModule, 'requestIdentity').mockImplementation(async (req) => ({
		params: req.body,
		inputs: [],
		requestHash: (req.body as { reference_image?: unknown }).reference_image ? 'register' : 'draw'
	}));
	vi.spyOn(queue, 'snapshot').mockReturnValue({
		jobs: [
			record('draw', 'draw', {
				gens: 2,
				jobs: [
					{
						id: 'remote',
						status: 'completed',
						done: true,
						results: DIRECTIONS.map((label) => ({ label, sha: label }))
					}
				]
			}),
			record('register', 'register', { gens: 0.25, response: {} })
		]
	} as unknown as ReturnType<typeof queue.snapshot>);
	const enqueue = vi.spyOn(queue, 'enqueue');
	const spec: CreateSpec = {
		name: 'Fixture',
		description: 'body',
		seed: 7,
		size: 48,
		directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
		projectId: 'rig-create-review'
	};
	const review = (await reviewCreateResults(spec))!;
	expect(enqueue).not.toHaveBeenCalled();
	expect(review.spent).toBe(2.25);
	expect(review.views).toHaveLength(8);
	expect(review.views.every((view) => view.state === 'ready' && view.frames.length === 1)).toBe(
		true
	);
	expect(review.options).toHaveLength(1);
	const [option] = review.options;
	expect(option).toMatchObject({ id: 'register', gens: 0.25, paid: true });
	expect(option.spec.seed).toBe(7);
	expect(option.spec.registrationSeed).not.toBe(7);
});

test('drawn views that overflow their frame are placed again from the paid draw, buying only a registration', async () => {
	vi.spyOn(db, 'get').mockResolvedValue(undefined);
	// A 48 px body drawn into a 44 px frame (the frame-room warning was accepted): the art reaches 1 row below the frame.
	const im = makeImg(48, 48);
	for (let y = 4; y < 47; y++)
		for (let x = 20; x < 27; x++) im.data.set([170, 120, 90, 255], (y * 48 + x) * 4);
	const blob = new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], {
		type: 'image/png'
	});
	vi.spyOn(db, 'getBlob').mockResolvedValue(blob);
	const spec: CreateSpec = {
		name: 'Fixture',
		description: 'body',
		seed: 7,
		size: 48,
		frame: 44,
		acceptedWarnings: ['frame-room'],
		directions: [{ id: 'south' }, { id: 'east' }, { id: 'north' }, { id: 'west' }],
		projectId: 'rig-create-overflow'
	};
	const draw = await queueModule.requestIdentity(drawRequest(spec, spec.seed));
	vi.spyOn(queue, 'snapshot').mockReturnValue({
		jobs: [
			record('draw', draw.requestHash, {
				gens: 2,
				jobs: [
					{
						id: 'remote',
						status: 'completed',
						done: true,
						results: DIRECTIONS.map((label) => ({ label, sha: label }))
					}
				]
			})
		]
	} as unknown as ReturnType<typeof queue.snapshot>);
	const enqueue = vi.spyOn(queue, 'enqueue');
	const review = (await reviewCreateResults(spec))!;
	expect(enqueue).not.toHaveBeenCalled();
	expect(review.views.every((view) => view.state === 'failed')).toBe(true);
	// The view is named inside the sentence as the language writes it there ("the south view"), never by its id.
	expect(review.views[0].notes[0]).toEqual({
		key: 'create.errors.viewDoesFitPx',
		vars: { direction: { key: 'directionInline.south' }, cell: 44 }
	});
	// Raised 1 px in the same frame, or in the smallest larger frame rounded to a price-verified size: each reuses the
	// paid draw and is priced at one registration before anything is sent.
	expect(review.options).toMatchObject([
		{ id: 'lift', gens: 0.25, paid: true, primary: true, spec: { frame: 44, lift: 1 } },
		{
			id: 'enlarge-frame',
			gens: 0.25,
			paid: true,
			primary: false,
			label: { key: 'createReview.largerFrame', vars: { size: 48 } },
			spec: { frame: 48 }
		}
	]);
	for (const option of review.options) {
		// The drawing request never includes the frame or the placement: the same seed is a cache hit.
		const again = await queueModule.requestIdentity(drawRequest(option.spec, option.spec.seed));
		expect(again.requestHash).toBe(draw.requestHash);
		expect(option.spec).toMatchObject({
			seed: 7,
			projectId: spec.projectId,
			acceptedWarnings: ['frame-room']
		});
	}
});
