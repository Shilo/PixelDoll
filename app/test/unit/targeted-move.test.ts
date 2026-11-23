import { afterEach, expect, test, vi } from 'vitest';
import {
	addMove,
	finishedViewsSpec,
	type MoveSpec,
	b64,
	bodyMoveIssue,
	keepableUnposed,
	motionJoints,
	moveMotionRequest,
	nativeMoveRequest,
	reviewItemMove,
	reviewMoveRecovery,
	resolveMoveMotionSource,
	skeletonMoveReview
} from '../../src/studio/create.ts';
import {
	moveDirections,
	moveEstimate,
	moveFrames,
	nativeMoveGens
} from '../../src/studio/movePricing.ts';
import { moveFrameCounts, moveTemplatePrompt } from '../../src/studio/moveAnimationOptions.ts';
import { resolveMoveSource } from '../../src/studio/moveSource.ts';
import { movePlan } from '../../src/studio/apiPlans.ts';
import { withClipWriteLock } from '../../src/studio/clipName.ts';
import { queue, requestIdentity, type JobRec } from '../../src/lib/pixellab/queue.ts';
import { png, routes } from '../../src/lib/pixellab/routes.ts';
import * as db from '../../src/lib/store/db.ts';
import * as projects from '../../src/lib/store/project.ts';
import { decodePng, makeImg } from '../../src/lib/image/png.ts';
import { encodePngBytes } from '../../src/lib/image/pngraw.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { PaidStepError } from '../../src/lib/pixellab/paid-results.ts';
import { skeletonInput } from '../../src/lib/rig/estimate.ts';
import { cellHash, type Keypoint, type DirectionName } from '../../src/lib/rig/rig.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import { CURRENT_FORMAT } from '../../src/lib/store/manifest.ts';
import ja from '../../src/locales/ja.json';
import { displayError, displayNestedMessage, errorMessage } from '../../src/lib/i18n.ts';
import { generationErrorMessage } from '../../src/studio/generationStatus.ts';
import type { Gen } from '../../src/studio/state.svelte.ts';
import { bodyQualityNote } from '../../src/studio/model.ts';
import { redoAfterSave, rigReady, setupRedoMoves, unposedView } from '../../src/lib/rig/setup.ts';
// The i18n runtime needs the Svelte compiler; Japanese stands in for it here, as a key lookup with {name} variables.
vi.mock('svelte-whisper', () => ({
	getLocale: () => 'ja',
	t: (key: string, vars: Record<string, unknown> = {}) =>
		String(
			key.split('.').reduce<unknown>((at, part) => (at as Record<string, unknown>)?.[part], ja)
		).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name]))
}));
afterEach(() => vi.restoreAllMocks());

test('managed ownership decides the quoted source without sending any generation', async () => {
	const { original } = await fixture();
	const controller = new AbortController();
	const fetch = vi.spyOn(globalThis, 'fetch');
	const route = () => resolveMoveMotionSource('test-key', 'test-character', controller.signal);
	expect(await resolveMoveMotionSource('test-key', undefined, controller.signal)).toBe(
		'standalone'
	);
	expect(fetch).not.toHaveBeenCalled();
	fetch.mockResolvedValueOnce(Response.json({ id: 'test-character' }));
	const managed = await route();
	expect(managed).toBe('managed');
	for (const status of [403, 404]) {
		fetch.mockResolvedValueOnce(Response.json({ detail: 'unavailable' }, { status }));
		expect(await route()).toBe('standalone');
	}
	fetch.mockResolvedValueOnce(Response.json({ detail: 'unauthorized' }, { status: 401 }));
	await expect(route()).rejects.toMatchObject({ status: 401 });
	expect(fetch).toHaveBeenCalledTimes(4);
	for (const [url, init] of fetch.mock.calls) {
		expect(String(url)).toMatch(/\/characters\/test-character$/);
		expect(init?.method).toBe('GET');
	}
	const prompt = moveTemplatePrompt('walk');
	const spec = {
		id: 'walk',
		action: 'walk',
		text: prompt,
		frames: 12,
		items: [],
		animation: { model: 'skeleton-v3' as const, frameCount: 12, loop: true }
	};
	const owned = moveMotionRequest(original, { ...spec, motionSource: managed }, 'east');
	expect(owned).toMatchObject({
		path: '/characters/animations',
		body: { mode: 'pixminimax', frame_count: 12 }
	});
	expect((owned.body as { action_description: string }).action_description).toContain(prompt);
	const standalone = moveMotionRequest(
		original,
		{ ...spec, motionSource: 'standalone' },
		'east',
		'standalone-start'
	);
	expect(standalone).toMatchObject({
		path: '/animate-pixminimax',
		body: {
			first_frame: png('standalone-start'),
			last_frame: png('standalone-start'),
			frame_count: 12
		}
	});
	expect(standalone.body).not.toHaveProperty('character_id');
});

test('native motion uses only the selected direction’s start and end frames', async () => {
	const { original } = await fixture();
	const start = { width: 64, height: 64, base64: 'start' };
	const end = { ...start, base64: 'end' };
	for (const model of ['v3', 'pixminimax'] as const) {
		const spec = {
			id: 'idle',
			action: 'idle',
			motionSource: 'standalone' as const,
			frames: 8,
			items: [],
			animation: { model, loop: true, references: { east: { start, end } } }
		};
		expect(nativeMoveRequest(original, spec, 'east', model, 'standing').body).toMatchObject({
			first_frame: png('start'),
			last_frame: png('end')
		});
		expect(nativeMoveRequest(original, spec, 'south', model, 'standing').body).toMatchObject({
			first_frame: png('standing'),
			last_frame: png('standing')
		});
		for (const action of ['walk', 'run']) {
			expect(
				nativeMoveRequest(original, { ...spec, action }, 'south', model, 'standing').body
			).toMatchObject({ first_frame: png('standing'), last_frame: png('standing') });
			expect(
				nativeMoveRequest(
					original,
					{ ...spec, action, motionSource: undefined },
					'south',
					model,
					'standing'
				).body
			).not.toHaveProperty('last_frame');
		}
		expect(
			nativeMoveRequest(
				original,
				{ ...spec, animation: { ...spec.animation, loop: false } },
				'south',
				model,
				'standing'
			).body
		).not.toHaveProperty('last_frame');
		expect(
			nativeMoveRequest(
				original,
				{ ...spec, animation: { ...spec.animation, references: { east: { start, end: null } } } },
				'east',
				model,
				'standing'
			).body
		).not.toHaveProperty('last_frame');
	}
});

async function fixture(
	fail = false,
	nativeReply?: 'redrawn' | 'exact' | 'none' | 'bad-palette',
	withHat = false
) {
	const dirs: DirectionName[] = ['south', 'east', 'north', 'west'],
		im = makeImg(64, 64);
	for (let y = 10; y < 60; y++)
		for (let x = 25; x < 39; x++) im.data.set([180, 140, 120, 255], (y * 64 + x) * 4);
	const hash = await cellHash(im),
		points: Keypoint[] = LABELS.map((label, i) => ({
			label,
			x: 0.3 + i * 0.01,
			y: 0.3 + i * 0.015
		}));
	const rig: Manifest['rig'] = {
		cell: { w: 64, h: 64 },
		pivot: { x: 32, y: 60 },
		baseHash: hash,
		baseItem: 'base',
		directions: dirs.map((id) => ({ id })),
		animations: [
			{
				id: 'idle',
				cells: 4,
				loop: true,
				frames: [0, 1, 2, 3].map((cell) => ({ cell, ms: 100 })),
				sources: Object.fromEntries(
					dirs.map((d) => [
						d,
						{
							route: 'skeleton-v3',
							reference: hash,
							keypoints: [points, points, points, points],
							measured: [points, points, points, points],
							motion: 'old',
							provenance: []
						}
					])
				)
			}
		],
		rest: Object.fromEntries(dirs.map((d) => [d, { image: hash, keypoints: points }])),
		anchors: {
			hand_r: {
				idle: Object.fromEntries(dirs.map((d) => [d, Array.from({ length: 4 }, () => [3, 4])]))
			}
		}
	};
	const cells = { idle: Object.fromEntries(dirs.map((d) => [d, [hash, hash, hash, hash]])) };
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		name: 'Test',
		app: '',
		rig,
		slots: [],
		materials: [],
		presets: [],
		items: [
			{
				id: 'base',
				name: 'Body',
				slot: 'body',
				status: 'accepted',
				mirror: 'generate',
				prompt: 'body',
				materials: [],
				baseHash: hash,
				provenance: [],
				layers: [{ id: 'main', role: 'fg', z: 0, cells: structuredClone(cells) }]
			},
			{
				id: 'hat',
				name: 'Hat',
				slot: 'head',
				status: 'accepted',
				mirror: 'generate',
				prompt: 'hat',
				materials: [],
				baseHash: hash,
				provenance: [],
				layers: [{ id: 'main', role: 'fg', z: 10, cells: structuredClone(cells) }],
				coverage: dirs.flatMap((d) => [0, 1, 2, 3].map((i) => `idle/${d}/${i}` as const))
			}
		]
	};
	let saved: projects.StoredProject = {
		id: 'rig-target',
		savedAt: 'original',
		origin: 'studio',
		manifest,
		character: { id: 'managed', looks: 'body' },
		skeletons: Object.fromEntries(
			dirs.flatMap((d) =>
				[0, 1, 2, 3].map((i) => [`idle/${d}/${i}`, { NOSE: { x: 3, y: 4, z: 0 } }])
			)
		),
		rigQa: {
			warnings: ['idle/east: old failure', 'idle/south: retained'],
			clips: Object.fromEntries(
				dirs.map((d) => [
					`idle/${d}`,
					{ adherence: 1, feetDrift: 0, paletteFit: 1, border: 0, stray: 0, fails: [] }
				])
			)
		}
	};
	const blobs = new Map<string, Blob>(),
		images = new Map([[hash, im]]);
	if (withHat) {
		const hat = structuredClone(im);
		for (let y = 7; y < 15; y++)
			for (let x = 23; x < 41; x++) hat.data.set([91, 60, 30, 255], (y * 64 + x) * 4);
		const hatHash = await cellHash(hat);
		blobs.set(hatHash.slice(7), new Blob([(await encodePngBytes(hat)) as Uint8Array<ArrayBuffer>]));
		Object.assign(manifest.items[1], {
			key: 'green',
			route: 'skeleton-pose',
			dressed: Object.fromEntries(dirs.map((dir) => [dir, hatHash]))
		});
	}
	const original = structuredClone(saved);
	let requested: Keypoint[][] = [];
	vi.spyOn(projects, 'loadProject').mockImplementation(async () => {
		const rec = structuredClone(saved);
		return { rec, project: { manifest: rec.manifest, images } };
	});
	vi.spyOn(db, 'updateCharacter').mockImplementation(async (_id, _blobs, change) => {
		saved = change(structuredClone(saved)) as projects.StoredProject;
	});
	vi.spyOn(db, 'get').mockImplementation(async () => structuredClone(saved));
	vi.spyOn(db, 'getBlob').mockImplementation(async (h) => blobs.get(h));
	const put = vi.spyOn(db, 'put').mockImplementation(async (store, sha, value) => {
			if (withHat && store === 'blobs' && value instanceof Blob) {
				blobs.set(sha, value);
				images.set(`sha256:${sha}`, await decodePng(value));
			}
		}),
		update = vi.spyOn(db, 'update').mockImplementation(async (_s, _id, change) => {
			saved = change(structuredClone(saved)) as projects.StoredProject;
		});
	const enqueue = vi.spyOn(queue, 'enqueue').mockImplementation(async (req) => {
		if (
			req.path === '/animate-with-skeleton-v3' ||
			req.path === '/animate-with-text-v3' ||
			req.path === '/animate-pixminimax'
		) {
			const skeleton = req.path === '/animate-with-skeleton-v3';
			requested = skeleton
				? (req.body as { keypoints: Keypoint[][] }).keypoints
				: Array.from({ length: (req.body as { frame_count: number }).frame_count }, () => points);
			const echo = !skeleton && nativeReply !== 'none' ? 1 : 0;
			const outputs = await Promise.all(
				Array.from({ length: requested.length + echo }, async (_, i) => {
					const image = structuredClone(im);
					image.data[(10 * 64 + 25) * 4] =
						echo && i === 0
							? nativeReply === 'exact'
								? 180
								: 91
							: (skeleton ? 180 : 185) + i - echo;
					if (!skeleton && nativeReply === 'bad-palette' && i >= echo)
						for (let offset = 0; offset < image.data.length; offset += 4)
							if (image.data[offset + 3]) image.data.set([0, 10, 250, 255], offset);
					const sha = 'frame-' + i;
					blobs.set(
						sha,
						new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], {
							type: 'image/png'
						})
					);
					return { label: String(i), sha };
				})
			);
			return {
				id: 'raw',
				state: 'done',
				endpoint: req.path,
				params: req.body,
				requestHash: 'raw',
				createdAt: 0,
				gens: 3,
				usd: 0,
				jobs: [{ id: 'job', results: skeleton ? outputs : outputs.reverse() }]
			} as unknown as JobRec;
		}
		if (req.path === '/estimate-skeleton')
			return {
				id: 'joints',
				state: 'done',
				endpoint: req.path,
				params: req.body,
				requestHash: 'joint-check',
				createdAt: 0,
				response: {
					keypoints: (requested[0] ?? points).map((p) => ({
						...p,
						x: p.x + (fail && p.label.includes('ARM') ? 0.3 : 0)
					}))
				},
				jobs: []
			} as unknown as JobRec;
		throw Error('Unexpected route');
	});
	/** Keep every answered request as a completed ledger record of its real identity, so free choices can read the cache. */
	const cache = () => {
		const ledger: JobRec[] = [],
			reply = enqueue.getMockImplementation()!;
		enqueue.mockImplementation(async (req, ...rest) => {
			const record = await reply(req, ...rest);
			ledger.push({ ...record, ...(await requestIdentity(req)), state: 'done' });
			return record;
		});
		vi.spyOn(queue, 'snapshot').mockImplementation(
			() => ({ jobs: ledger }) as unknown as ReturnType<typeof queue.snapshot>
		);
	};
	return {
		saved: () => saved,
		images,
		original,
		cache,
		enqueue,
		put,
		update,
		run: (change: Record<string, unknown> = {}) =>
			addMove('rig-target', {
				id: 'idle',
				action: 'idle',
				frames: 4,
				items: [],
				seed: 23,
				replace: true,
				poseStyle: 'visible-side-v1',
				dirs: ['east'],
				...change
			})
	};
}

test('an unregistered character with stored joints can render a prompt-driven Skeleton V3 move', async () => {
	const f = await fixture(false, 'exact');
	delete f.saved().character;
	await expect(
		f.run({ action: undefined, text: 'Step carefully', motionSource: 'standalone' })
	).resolves.toMatchObject({ warnings: expect.any(Array) });
	const paths = f.enqueue.mock.calls.map(([request]) => request.path);
	expect(paths[0]).toBe('/animate-pixminimax');
	expect(paths).toContain('/animate-with-skeleton-v3');
	expect(paths).not.toContain('/characters/animations');
});

test('skeleton Loop checks a custom start first without repeating the start pose at the end', async () => {
	const fixtureState = await fixture();
	const { project } = await projects.loadProject('rig-target');
	const start = structuredClone(project.images.get(project.manifest.rig.rest!.east!.image)!);
	start.data[(10 * 64 + 25) * 4] = 170;
	const base64 = await b64(start);
	await fixtureState.run({
		animation: {
			model: 'skeleton-v3',
			loop: true,
			references: { east: { start: { width: 64, height: 64, base64 } } }
		}
	});
	const [check, render] = fixtureState.enqueue.mock.calls.map(([request]) => request);
	expect(check.path).toBe('/estimate-skeleton');
	expect(render.path).toBe('/animate-with-skeleton-v3');
	expect(render.body).toMatchObject({ first_frame: png(base64) });
	expect(render.body).not.toHaveProperty('last_frame');
	const poses = (render.body as { keypoints: Keypoint[][] }).keypoints;
	expect(poses.at(-1)).not.toEqual(poses[0]);
	const saved = fixtureState.saved().manifest;
	expect(saved.rig.animations[0].moveLoop).toBe(true);
	expect(saved.items[0].provenance.map((record) => record.endpoint)).toEqual([
		'/estimate-skeleton',
		'/animate-with-skeleton-v3'
	]);
});
test('targeted replacement preserves every unselected body/item/pose row and clears only stale target diagnostics', async () => {
	const f = await fixture();
	await f.run();
	const next = f.saved(),
		before = f.original;
	expect(f.enqueue.mock.calls.filter(([r]) => r.path === '/animate-with-skeleton-v3')).toHaveLength(
		1
	);
	expect((f.enqueue.mock.calls[0][0].body as { direction: string; action: string }).direction).toBe(
		'east'
	);
	expect((f.enqueue.mock.calls[0][0].body as { action: string }).action).toContain('no weapon');
	for (const d of ['south', 'north', 'west'] as const) {
		expect(next.manifest.items[0].layers[0].cells!.idle![d]).toEqual(
			before.manifest.items[0].layers[0].cells!.idle![d]
		);
		expect(next.manifest.items[1].layers[0].cells!.idle![d]).toEqual(
			before.manifest.items[1].layers[0].cells!.idle![d]
		);
		expect(next.manifest.rig.animations[0].sources![d]).toEqual(
			before.manifest.rig.animations[0].sources![d]
		);
		expect(next.manifest.rig.anchors!.hand_r!.idle![d]).toEqual(
			before.manifest.rig.anchors!.hand_r!.idle![d]
		);
		expect(next.skeletons![`idle/${d}/0`]).toEqual(before.skeletons![`idle/${d}/0`]);
	}
	expect(next.manifest.items[1].layers[0].cells!.idle!.east).toBeUndefined();
	expect((next.rigQa as { warnings: string[] }).warnings).toEqual(['idle/south: retained']);
});

test.each(['none', 'redrawn'] as const)(
	'native V3 freezes generated frames in order with %s echo',
	async (reply) => {
		const f = await fixture(false, reply);
		await f.run({ animation: { model: 'v3', frameCount: 16 }, dirs: undefined });
		const saved = f.saved(),
			source = saved.manifest.rig.animations[0].sources!.east!;
		expect(source.route).toBe('v3');
		expect(source.keypoints).toEqual(source.measured);
		expect(source.keypoints).toHaveLength(16);
		expect(
			f.enqueue.mock.calls.filter(([request]) => request.path !== '/estimate-skeleton')
		).toHaveLength(4);
		expect(
			f.enqueue.mock.calls.every(([request]) => request.path !== '/animate-with-skeleton-v3')
		).toBe(true);
		const standing = (await projects.loadProject('rig-target')).project.images
			.values()
			.next().value!;
		const hashes = await Promise.all(
			Array.from({ length: 16 }, async (_, index) => {
				const frame = structuredClone(standing);
				frame.data[(10 * 64 + 25) * 4] = 185 + index;
				return cellHash(frame);
			})
		);
		expect(saved.manifest.items[0].layers[0].cells!.idle!.east).toEqual(hashes);
	}
);

// Deliberately flipped (soft gates, R4): exactly N frames for PixMiniMax's documented N + 1 used to throw the paid move away.
// Whether the echo or the last frame was left out is unknowable, so the frames are kept in returned order and disclosed.
test('native PixMiniMax keeps exactly N frames in returned order and discloses the missing leading frame', async () => {
	const f = await fixture(false, 'none');
	await f.run({ animation: { model: 'pixminimax' } });
	const east = f.saved().manifest.items[0].layers[0].cells!.idle!.east!;
	const standing = f.images.values().next().value!;
	// the fixture returns outputs reversed; the labels put them back in order 0..3
	expect(east).toEqual(
		await Promise.all(
			[185, 186, 187, 188].map((shade) => {
				const frame = structuredClone(standing);
				frame.data[(10 * 64 + 25) * 4] = shade;
				return cellHash(frame);
			})
		)
	);
	expect((f.saved().rigQa as { warnings: string[] }).warnings).toContain(
		'idle/east: PixelLab sent 4 frames instead of 5, so the first or last frame may differ'
	);
});

test.each([2, -1])(
	'native PixMiniMax with a frame count off by %i from N stops without publishing or another paid request',
	async (extra) => {
		const f = await fixture(false, 'none');
		const reply = f.enqueue.getMockImplementation()!;
		f.enqueue.mockImplementation(async (req, ...rest) => {
			const record = await reply(req, ...rest);
			if (req.path !== '/animate-pixminimax') return record;
			const results = record.jobs[0].results!;
			record.jobs[0].results =
				extra > 0
					? [
							...results,
							...results
								.slice(0, extra)
								.map((r, i) => ({ ...r, label: String(results.length + i) }))
						]
					: results.slice(0, extra);
			return record;
		});
		await expect(f.run({ animation: { model: 'pixminimax' } })).rejects.toThrow(
			`PixelLab returned ${4 + extra} motion frames for 4 requested`
		);
		// the one paid render only: no joint check, no other render, nothing saved
		expect(f.enqueue).toHaveBeenCalledOnce();
		expect(f.put).not.toHaveBeenCalled();
		expect(f.saved()).toEqual(f.original);
	}
);

// Deliberately changed (soft gates): a targeted replacement that misses only numerical body checks used to throw and keep
// nothing. It is now staged for a free Save or Discard, body only; the priced Skeleton retry is offered from that draft.
test('a native quality failure stages a free body review and offers a priced body draft retry without buying equipment', async () => {
	const f = await fixture(false, 'bad-palette', true);
	const spec = {
		id: 'idle',
		action: 'idle',
		frames: 4,
		items: ['hat'],
		seed: 23,
		replace: true,
		dirs: ['east'] as DirectionName[],
		animation: { model: 'pixminimax' as const, frameCount: 4 }
	};
	await expect(f.run(spec)).resolves.toMatchObject({ moveReview: 'idle' });
	expect(f.saved().manifest).toEqual(f.original.manifest);
	const draft = f.saved().moveReviews!.idle!;
	expect(draft.spec).toMatchObject({ items: [], reviewBeforePublish: true });
	const offer = skeletonMoveReview(f.saved(), draft.spec, undefined, [], draft);
	expect(offer).toMatchObject({
		review: {
			dirs: ['east'],
			items: [],
			reviewBeforePublish: true,
			animation: { model: 'skeleton-v3', frameCount: 4 }
		},
		affected: ['east']
	});
	expect(offer?.estimate.gens).toBeGreaterThan(0);
	const start = { width: 64, height: 64, base64: 'start' };
	const end = { ...start, base64: 'end' };
	const withFrames = skeletonMoveReview(
		f.saved(),
		{
			...draft.spec,
			animation: {
				...spec.animation,
				loop: false,
				references: { east: { start, end }, south: { start } }
			}
		},
		undefined,
		[],
		draft
	);
	expect(withFrames?.review.animation).toEqual({
		model: 'skeleton-v3',
		frameCount: 4,
		loop: false,
		references: { east: { start } }
	});
	expect(withFrames!.estimate.gens - offer!.estimate.gens).toBeCloseTo(0.1);
	expect(
		skeletonMoveReview(f.saved(), spec, new Error('Standing reference is missing'), [])
	).toBeUndefined();
	expect(
		skeletonMoveReview(
			f.saved(),
			{ ...draft.spec, animation: { model: 'skeleton-v3' } },
			undefined,
			[],
			draft
		)
	).toBeUndefined();
	await expect(
		f.run({ ...offer!.review, seed: 24, reviewRegeneration: { id: 'idle', seed: 23 } })
	).resolves.toMatchObject({ moveReview: 'idle' });
	const saved = f.saved();
	expect(saved.manifest).toEqual(f.original.manifest);
	expect(saved.moveReviews?.idle?.spec).toMatchObject({
		items: [],
		reviewBeforePublish: true,
		seed: 24
	});
});

test('a new Move cannot take the normalized name of a State or a pending State', async () => {
	const f = await fixture();
	const rec = f.saved();
	const spec = { id: 'cafe-cast', text: 'Café cast', action: undefined, replace: false };
	rec.stateGenerations = {
		pending: { id: 'cafe_cast' } as NonNullable<typeof rec.stateGenerations>[string]
	};
	const taken = { translation: { key: 'stateCapture.takenName' } };
	await expect(f.run(spec)).rejects.toMatchObject(taken);
	delete rec.stateGenerations;
	rec.manifest.rig.animations.push({
		id: 'cafe_cast',
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: 100 }]
	});
	await expect(f.run(spec)).rejects.toMatchObject(taken);
	expect(f.enqueue).not.toHaveBeenCalled();
});

test('a Move cannot submit while an equivalent clip name is locked', async () => {
	const f = await fixture();
	const held = new Set<string>();
	const request = async (
		name: string,
		options: { ifAvailable: boolean },
		work: (lock: { name: string } | null) => Promise<unknown>
	) => {
		expect(options.ifAvailable).toBe(true);
		if (held.has(name)) return work(null);
		held.add(name);
		try {
			return await work({ name });
		} finally {
			held.delete(name);
		}
	};
	vi.stubGlobal('navigator', { locks: { request } });
	try {
		await withClipWriteLock('rig-target', 'Café_cast', async () => {
			await expect(f.run({ id: 'cafe-cast', replace: false })).rejects.toMatchObject({
				translation: { key: 'directionsSheet.waitForGeneration' }
			});
			await expect(withClipWriteLock('rig-target', 'other', async () => true)).resolves.toBe(true);
		});
		expect(f.enqueue).not.toHaveBeenCalled();
	} finally {
		vi.unstubAllGlobals();
	}
});

test('an authored Skeleton move from a fitted generated State poses the State art and joints', async () => {
	const f = await fixture();
	const rec = f.saved(),
		rig = rec.manifest.rig,
		dirs = rig.directions.map(({ id }) => id),
		standing = rig.rest!.south!;
	const art = makeImg(64, 64);
	for (let y = 10; y < 60; y++)
		for (let x = 28; x < 42; x++) art.data.set([180, 140, 120, 255], (y * 64 + x) * 4);
	const hash = await cellHash(art),
		joints = standing.keypoints.map((point) => ({ ...point, x: point.x + 0.05 }));
	expect(hash).not.toBe(standing.image);
	f.images.set(hash, art);
	rig.animations.push({
		id: 'ready',
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: 100 }],
		source: { endpoint: '/edit-images-v2' },
		sources: Object.fromEntries(
			dirs.map((d) => [
				d,
				{
					route: 'import' as const,
					reference: hash,
					referenceKeypoints: joints,
					keypoints: [joints],
					measured: [joints],
					motion: 'estimated:generated-state',
					provenance: []
				}
			])
		)
	});
	rec.manifest.items[0].layers[0].cells!.ready = Object.fromEntries(dirs.map((d) => [d, [hash]]));
	const startFrom = resolveMoveSource(rec.manifest, { clip: 'ready', cell: 0 }, dirs)!;
	expect(startFrom).toBeDefined();
	await f.run({
		id: 'cast',
		action: 'cast',
		replace: false,
		dirs: undefined,
		approvedDirs: dirs,
		startFrom
	});
	const first = png(await b64(art));
	const bodies = f.enqueue.mock.calls.flatMap(([request]) =>
		request.path === '/animate-with-skeleton-v3' ? [request.body as Record<string, unknown>] : []
	);
	expect(bodies).toHaveLength(dirs.length);
	for (const body of bodies)
		expect(body).toMatchObject({ first_frame: first, first_frame_keypoints: joints });
});

test('a described Skeleton move from a saved frame on a managed character routes standalone at the same price', async () => {
	const f = await fixture();
	const m = f.original.manifest;
	const startFrom = resolveMoveSource(m, { clip: 'idle', cell: 3 }, ['east'])!;
	for (const action of [undefined, 'walk']) {
		const spec = {
			id: 'idle',
			action,
			text: 'Step softly',
			frames: 4,
			items: [],
			replace: true,
			dirs: ['east' as const],
			animation: { model: 'skeleton-v3' as const, frameCount: 4 },
			motionSource: action ? undefined : ('managed' as const),
			startFrom
		};
		expect(bodyMoveIssue(m, spec)).toBeUndefined();
		const request = moveMotionRequest(f.original, spec, 'east', 'saved-frame');
		expect(request).toMatchObject({
			path: '/animate-pixminimax',
			body: { first_frame: png('saved-frame'), frame_count: 4 }
		});
		expect(moveEstimate(m, spec)).toEqual(
			moveEstimate(m, { ...spec, motionSource: 'standalone' as const })
		);
	}
});

test('Skeleton retry keeps the exact authored start and omits stale or incompatible starts', async () => {
	const f = await fixture(false, 'bad-palette');
	const spec = {
		id: 'idle',
		action: 'idle',
		frames: 4,
		items: [],
		seed: 23,
		replace: true,
		dirs: ['south', 'east'] as DirectionName[],
		animation: { model: 'pixminimax' as const, frameCount: 4 },
		startFrom: resolveMoveSource(f.original.manifest, { clip: 'idle', cell: 3 }, ['south', 'east'])!
	};
	await expect(f.run(spec)).resolves.toMatchObject({ moveReview: 'idle' });
	const draft = f.saved().moveReviews!.idle!;
	const retry = (record = f.saved(), change: Partial<MoveSpec> = {}) =>
		skeletonMoveReview(record, { ...draft.spec, ...change }, undefined, [], draft);
	const offer = retry();
	expect(offer?.review.startFrom).toEqual(spec.startFrom);
	expect(offer?.review.approvedDirs).toEqual(spec.dirs);
	// Deliberately flipped (2026-11-23): a described retry from a saved frame used to get no offer, because the managed
	// character's motion always starts from Standing. It now takes the standalone PixMiniMax route at the same price.
	const described = retry(f.saved(), { action: undefined, text: 'Hold still' });
	expect(described?.review.startFrom).toEqual(spec.startFrom);
	expect(moveMotionRequest(f.saved(), described!.review, 'east').path).toBe('/animate-pixminimax');
	const changed = structuredClone(f.saved());
	const east = changed.manifest.rig.animations[0].sources!.east!;
	east.measured![3] = east.measured![3].map((joint) => ({ ...joint, x: joint.x + 0.01 }));
	expect(retry(changed)).toBeUndefined();
	const missing = structuredClone(f.saved());
	delete missing.manifest.items[0].layers[0].cells!.idle.east;
	expect(retry(missing)).toBeUndefined();
	const resized = structuredClone(f.saved());
	resized.manifest.rig.pivot.x++;
	expect(retry(resized)).toBeUndefined();
	await expect(
		f.run({ ...offer!.review, seed: 24, reviewRegeneration: { id: 'idle', seed: 23 } })
	).resolves.toMatchObject({ moveReview: 'idle' });
	expect(f.saved().manifest).toEqual(f.original.manifest);
	expect(f.saved().moveReviews?.idle?.spec.startFrom).toEqual(spec.startFrom);
});

test('native PixMiniMax discards a redrawn leading frame and plans all 40 equipment poses in order', async () => {
	const f = await fixture(false, 'redrawn', true),
		manifest = f.original.manifest,
		spec = {
			id: 'idle',
			action: 'idle',
			frames: 8,
			animation: { model: 'pixminimax' as const, frameCount: 40 },
			items: ['hat'],
			replace: true
		};
	const plan = movePlan(f.original, spec);
	expect(plan[0]).toMatchObject({
		path: '/animate-pixminimax',
		generations: 6,
		body: { first_frame: png('[standing artwork]') }
	});
	expect(
		plan
			.filter((call) => call.path === '/animate-with-skeleton-v3' && call.label?.includes('east'))
			.map((call) => call.label)
	).toEqual(['Hat east · frames 1–14', 'Hat east · frames 15–27', 'Hat east · frames 28–40']);
	expect(plan.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBeCloseTo(
		moveEstimate(manifest, spec).gens
	);
	await f.run({ animation: spec.animation, dirs: undefined, items: spec.items });
	const source = f.saved().manifest.rig.animations[0].sources!.east!;
	expect(source.route).toBe('pixminimax');
	expect(source.keypoints).toHaveLength(40);
	expect(source.keypoints).toEqual(source.measured);
	const standing = (await projects.loadProject('rig-target')).project.images.values().next().value!;
	const hashes = await Promise.all(
		Array.from({ length: 40 }, (_, index) => {
			const frame = structuredClone(standing);
			frame.data[(10 * 64 + 25) * 4] = 185 + index;
			return cellHash(frame);
		})
	);
	expect(f.saved().manifest.items[0].layers[0].cells!.idle!.east).toEqual(hashes);
	const equipmentCalls = f.enqueue.mock.calls.flatMap(([request]) =>
		request.path === '/animate-with-skeleton-v3'
			? [request.body as { direction: DirectionName; keypoints: Keypoint[][] }]
			: []
	);
	for (const { id } of manifest.rig.directions) {
		expect(
			equipmentCalls.filter((body) => body.direction === id).map((body) => body.keypoints.length)
		).toEqual([14, 13, 13]);
		expect(f.saved().manifest.items[1].layers[0].cells!.idle![id]).toHaveLength(40);
	}
});

test('native measurement recovery without explicit directions retries only the approved joint check', async () => {
	const f = await fixture(),
		spec = {
			id: 'idle',
			action: 'idle',
			frames: 4,
			animation: { model: 'v3' as const },
			items: [],
			replace: true,
			dirs: undefined,
			seed: 23
		},
		rest = f.original.manifest.rig.rest!.east!,
		standing = (await projects.loadProject('rig-target')).project.images.get(rest.image)!,
		first = await b64(standing),
		blobs = new Map<string, Blob>(),
		jobs: JobRec[] = [];
	const storeImage = async (sha: string, image: typeof standing) => {
		blobs.set(sha, new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>]));
	};
	await storeImage(rest.image.slice(7), standing);
	const results = [];
	for (let index = 0; index < 4; index++) {
		const frame = structuredClone(standing),
			sha = `cached-${index}`;
		frame.data[(10 * 64 + 25) * 4] = 185 + index;
		await storeImage(sha, frame);
		results.push({ label: String(index), sha });
		jobs.push({
			id: `check-${index}`,
			requestHash: (await requestIdentity(routes.estimateSkeleton(png(await b64(frame)))))
				.requestHash,
			method: 'POST',
			endpoint: '/estimate-skeleton',
			state: index === 0 ? 'lost' : 'done',
			jobs: [],
			createdAt: 0,
			...(index ? { response: { keypoints: rest.keypoints } } : {})
		} as unknown as JobRec);
	}
	const rawHashes = [];
	for (const dir of ['south', 'east', 'north', 'west'] as const) {
		const { requestHash } = await requestIdentity(
			nativeMoveRequest(f.original, spec, dir, 'v3', first)
		);
		rawHashes.push(requestHash);
		jobs.push({
			id: `raw-${dir}`,
			requestHash,
			state: 'done',
			endpoint: '/animate-with-text-v3',
			params: {},
			createdAt: 0,
			jobs: [{ id: 'job', results }]
		} as JobRec);
	}
	vi.spyOn(db, 'getBlob').mockImplementation(async (sha) => blobs.get(sha));
	vi.spyOn(queue, 'snapshot').mockReturnValue({ ...queue.snapshot(), jobs });
	const review = (await reviewMoveRecovery('rig-target', spec)).recovery!;
	expect(review).toMatchObject({ recordIds: ['check-0'], checks: 1, rawHashes });
	f.enqueue.mockImplementation(async () => {
		const completed = {
			...jobs[0],
			id: 'check-0-retry',
			state: 'done' as const,
			response: { keypoints: rest.keypoints }
		};
		jobs.push(completed);
		return completed;
	});
	await f.run({
		...spec,
		measurementRecovery: {
			id: 'reviewed',
			recordIds: review.recordIds,
			checkHashes: review.checkHashes,
			rigVersion: review.rigVersion
		}
	});
	expect(f.enqueue).toHaveBeenCalledOnce();
	expect(f.enqueue.mock.calls[0][0].path).toBe('/estimate-skeleton');
	expect(f.saved().manifest.rig.animations[0].sources!.east!.route).toBe('v3');
});

test('raw PixMiniMax estimates reflect provider pricing by canvas and frame count', () => {
	expect(nativeMoveGens('pixminimax', { w: 64, h: 64 }, 24)).toBe(3);
	expect(nativeMoveGens('pixminimax', { w: 65, h: 65 }, 24)).toBe(1);
	expect(nativeMoveGens('pixminimax', { w: 128, h: 128 }, 40)).toBe(6);
	expect(nativeMoveGens('pixminimax', { w: 129, h: 129 }, 40)).toBe(2);
});

test('described Skeleton v3 quotes the rounded-up managed PixMiniMax motion count', async () => {
	const f = await fixture();
	const spec = {
		id: 'step-softly',
		text: 'Step softly',
		frames: 8,
		items: [],
		animation: { model: 'skeleton-v3', frameCount: 15 } as const
	};
	const plan = movePlan(f.original, spec);
	const motionCalls = plan.filter((call) => call.path === '/characters/animations');
	expect(motionCalls).toHaveLength(4);
	for (const call of motionCalls)
		expect(call).toMatchObject({ body: { frame_count: 16 }, generations: 2 });
	expect(plan.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBeCloseTo(
		moveEstimate(f.original.manifest, spec).gens
	);
});

test('model options respect presets, explicit overrides and actual V3 canvas budget', async () => {
	const f = await fixture();
	const m = f.original.manifest;
	expect(moveFrames(m, { action: 'idle', frames: 8 })).toBe(4);
	expect(moveFrameCounts('v3', 192)).toEqual([4, 6, 8, 10, 12, 14]);
	expect(moveFrameCounts('v3', 256)).toEqual([4, 6, 8]);
	expect(moveFrameCounts('pixminimax', 256).at(-1)).toBe(40);
	m.rig.cell = { w: 256, h: 256 };
	expect(moveFrames(m, { action: 'slash', frames: 16, animation: { model: 'v3' } })).toBe(8);
	expect(moveFrames(m, { frames: 16, animation: { model: 'skeleton-v3' } })).toBe(15);
	await f.run({ animation: { model: 'skeleton-v3', frameCount: 5 }, dirs: undefined });
	expect(f.saved().manifest.rig.animations[0].cells).toBe(5);
});

test('resampling Death keeps its final pose and duration', async () => {
	const resized = await fixture();
	const spec = { id: 'death', action: 'death', replace: false, dirs: undefined };
	await resized.run(spec);
	const authored = resized.saved().manifest.rig.animations.find((clip) => clip.id === 'death')!;
	vi.restoreAllMocks();
	const alternate = await fixture();
	await alternate.run({ ...spec, animation: { model: 'skeleton-v3', frameCount: 12 } });
	const changed = alternate.saved().manifest.rig.animations.find((clip) => clip.id === 'death')!;
	expect(changed.cells).toBe(12);
	expect(changed.sources!.east!.keypoints!.at(-1)).toEqual(
		authored.sources!.east!.keypoints!.at(-1)
	);
	expect(changed.frames.reduce((total, frame) => total + frame.ms, 0)).toBe(
		authored.frames.reduce((total, frame) => total + frame.ms, 0)
	);
});

test('regeneration keeps explicit play-once preferences, including choices changed during frame publication', async () => {
	const f = await fixture();
	f.saved().manifest.rig.animations[0].loop = false;
	await f.run();
	expect(f.saved().manifest.rig.animations[0].loop).toBe(false);
	vi.restoreAllMocks();
	const g = await fixture(),
		m = g.saved().manifest;
	m.rig.animations.push({ ...structuredClone(m.rig.animations[0]), id: 'cast' });
	for (const item of m.items)
		item.layers[0].cells!.cast = structuredClone(item.layers[0].cells!.idle);
	g.put.mockImplementation(async (store) => {
		if (store === 'blobs')
			for (const animation of g.saved().manifest.rig.animations) animation.loop = false;
	});
	await g.run();
	expect(g.saved().manifest.rig.animations.map((a) => [a.id, a.loop])).toEqual([
		['idle', false],
		['cast', false]
	]);
});
// Deliberately changed (soft gates): numerical misses used to throw away the paid replacement; they now stage it for review.
test('numerical misses stage a targeted replacement for review without publishing it or invalidating prior equipment', async () => {
	const f = await fixture(true);
	await expect(f.run()).resolves.toMatchObject({ moveReview: 'idle' });
	expect(f.put).not.toHaveBeenCalled();
	expect(f.update).not.toHaveBeenCalled();
	expect(f.saved().manifest).toEqual(f.original.manifest);
	const draft = f.saved().moveReviews!.idle!;
	expect(draft.dirs).toEqual(['east']);
	expect(draft.checks['idle/east'].fails).toEqual([]);
	expect(draft.checks['idle/east'].adherence).toBeGreaterThan(0);
});
test('invalid subset, new partial move and changed partial frame count are rejected before spending', async () => {
	for (const change of [
		{ dirs: [] },
		{ dirs: ['east', 'east'] },
		{ dirs: ['bad'] },
		{ id: 'cast', dirs: ['east'] },
		{ action: 'slash' }
	]) {
		const f = await fixture();
		await expect(f.run(change)).rejects.toThrow();
		expect(f.enqueue).not.toHaveBeenCalled();
		vi.restoreAllMocks();
	}
});
test('a move cannot spend on its body if selected equipment lacks a standing design for a target view', async () => {
	const f = await fixture(),
		manifest = f.saved().manifest,
		item = manifest.items[1];
	item.key = 'green';
	item.route = 'skeleton-pose';
	item.dressed = { south: manifest.rig.rest!.south!.image };
	await expect(f.run({ items: [item.id], dirs: ['south', 'west'] })).rejects.toThrow(
		'No generation was requested.'
	);
	expect(f.enqueue).not.toHaveBeenCalled();
});
test('a new move cannot spend when the drawn views no longer match its approval', async () => {
	const f = await fixture();
	await expect(
		f.run({ id: 'slash', action: 'slash', replace: false, dirs: undefined, approvedDirs: ['east'] })
	).rejects.toThrow('Character directions changed.');
	expect(f.enqueue).not.toHaveBeenCalled();
});
test('selected direction costs distinguish body replacement from frozen-frame equipment repair', async () => {
	const f = await fixture(),
		m = f.original.manifest;
	expect(moveDirections(m, ['west', 'east'])).toEqual(['east', 'west']);
	expect(
		moveEstimate(m, {
			id: 'idle',
			action: 'idle',
			frames: 4,
			items: ['hat'],
			dirs: ['east', 'west']
		}).gens
	).toBeCloseTo(12.8);
	expect(
		moveEstimate(m, {
			id: 'idle',
			action: 'idle',
			frames: 4,
			items: ['hat'],
			dirs: ['west'],
			itemMethod: 'grid'
		})
	).toMatchObject({ body: 0, items: 10, gens: 10 });
});

test('unrecognized move names and incompatible described frame counts fail before PixelLab', async () => {
	const f = await fixture();
	await expect(f.run({ action: 'quiet-step' })).rejects.toThrow(
		'Describe this move before generating it'
	);
	await expect(
		f.run({
			id: 'new-motion',
			action: undefined,
			text: 'A quick step',
			frames: 16,
			dirs: undefined,
			replace: false
		})
	).rejects.toThrow('This move has 16');
	expect(f.enqueue).not.toHaveBeenCalled();
	expect(
		movePlan(f.original, {
			id: 'idle',
			action: 'quiet-step',
			frames: 4,
			items: [],
			dirs: ['east'],
			replace: true
		})
	).toEqual([]);
});

test('a valid custom description includes motion costs and wrong provider cardinality stops before joint checks', async () => {
	const f = await fixture(),
		spec = {
			id: 'idle',
			action: 'quiet-step',
			text: ' Step softly ',
			frames: 4,
			items: [],
			dirs: ['east' as const],
			replace: true
		};
	const plan = movePlan(f.original, spec);
	expect(plan.reduce((sum, call) => sum + (call.generations ?? 0), 0)).toBeCloseTo(
		moveEstimate(f.original.manifest, spec).gens
	);
	f.enqueue.mockResolvedValueOnce({ state: 'done', jobs: [{ results: [] }] } as unknown as JobRec);
	await expect(f.run(spec)).rejects.toThrow('PixelLab returned 0 motion frames for 4 requested');
	expect(f.enqueue).toHaveBeenCalledOnce();
	expect(f.enqueue.mock.calls[0][0]).toMatchObject({
		path: '/characters/animations',
		body: {
			mode: 'pixminimax',
			action_description: 'Step softly, unarmed, no weapon, no props, no other people, no effects',
			frame_count: 4
		}
	});
	expect(f.put).not.toHaveBeenCalled();
	// The stop names the move and view in the user's words and language, never the internal request label, and an item
	// card shows the stored Message the same way.
	f.enqueue.mockResolvedValueOnce({ state: 'done', jobs: [{ results: [] }] } as unknown as JobRec);
	const error = await f.run(spec).catch((e: unknown) => e);
	const shown = displayError(error);
	expect(shown).toBe(
		ja.create.errors.pixellabReturnedMotionFrames
			.replace('{move}', ja.moveNames.idle)
			.replace('{direction}', ja.directionNames.east)
			.replace('{expected}', '4')
			.replace('{returned}', '0')
	);
	expect(shown).not.toMatch(/Test ·|\(motion\)|idle east/);
	const gen = {
		canceled: false,
		error: errorMessage(error),
		draft: { calls: [] }
	} as unknown as Gen;
	const card = generationErrorMessage(gen, [], {
		render: displayNestedMessage,
		formatNumber: String
	});
	expect(displayNestedMessage(card!)).toBe(shown);
});

test('managed motion drops one extra leading motion frame by position on described moves and the walk template', async () => {
	const motionWith = async (
		first: 'standing' | 'other' | 'none' | 'two',
		change: Record<string, unknown> = {}
	) => {
		const count = change.action === 'walk' ? 8 : 4;
		const f = await fixture(),
			standing = (await projects.loadProject('rig-target')).project.images.values().next().value!,
			frame = (shade: number) => {
				const im = structuredClone(standing);
				im.data[(30 * 64 + 30) * 4] = shade; // inside the body: a distinct motion frame
				return im;
			},
			// "other": PixelLab's registered standing drawn with an outfit ours does not have (the 2026-11-23 report)
			outfit = structuredClone(standing);
		for (let y = 20; y < 30; y++)
			for (let x = 22; x < 42; x++) outfit.data.set([40, 90, 160, 255], (y * 64 + x) * 4);
		const images = [
				...{ standing: [standing], other: [outfit], none: [], two: [outfit, outfit] }[first],
				...Array.from({ length: count }, (_, i) => frame(11 + i))
			],
			blobs = new Map<string, Blob>();
		for (const [i, im] of images.entries())
			blobs.set(`m${i}`, new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
		const stored = vi.mocked(db.getBlob).getMockImplementation()!;
		vi.mocked(db.getBlob).mockImplementation(async (h) => blobs.get(h) ?? stored(h));
		const results = images.map((_, i) => ({ label: `east/${i}`, sha: `m${i}` }));
		const joints = LABELS.map((label, i) => ({ label, x: 0.3 + i * 0.01, y: 0.3 + i * 0.015 }));
		f.enqueue.mockResolvedValueOnce({
			id: 'motion',
			state: 'done',
			endpoint: '/characters/animations',
			params: {},
			createdAt: 0,
			jobs: [{ results }]
		} as unknown as JobRec);
		// one joint answer per expected motion frame; another check would fall through to the fixture and fail
		for (let i = 0; i < count; i++)
			f.enqueue.mockResolvedValueOnce({
				state: 'done',
				response: { keypoints: joints },
				jobs: []
			} as unknown as JobRec);
		const before = f.enqueue.mock.calls.length;
		const error = await f
			.run({ text: 'step softly', action: 'quiet-step', frames: 4, ...change })
			.catch((e: Error) => e);
		const after = f.enqueue.mock.calls.slice(before).map(([r]) => r.path),
			render = after.indexOf('/animate-with-skeleton-v3');
		return {
			error,
			// motion joint checks only: those sent before the body render
			measured: after
				.slice(0, render < 0 ? undefined : render)
				.filter((p) => p === '/estimate-skeleton').length,
			echo: f.saved().manifest.rig.animations.find((a) => a.id === 'idle')?.sources?.east
				?.motionEcho
		};
	};
	// 5 for 4 with our standing view first: that frame is dropped and exactly the 4 motion frames are measured
	const kept = await motionWith('standing');
	expect(String(kept.error)).not.toContain('motion frames for');
	expect(kept.measured).toBe(4);
	expect(kept.echo).toEqual({ maskIoU: 1 });
	// Deliberately flipped (2026-11-23): this case used to fail before joint checks. Managed pixminimax sends the standing
	// PixelLab registered first despite keep_first_frame: false, and that view need not match ours (a Standing changed
	// without Fix frames history, an outfit drawn at creation), so the paid motion was a dead end that a re-roll repeated.
	// The extra leading frame is now dropped by position; its silhouette overlap is recorded as evidence, never a gate.
	const odd = await motionWith('other');
	expect(String(odd.error)).not.toContain('motion frames for');
	expect(odd.measured).toBe(4);
	expect(odd.echo?.maskIoU).toBeGreaterThan(0.5);
	expect(odd.echo?.maskIoU).toBeLessThan(1);
	// Deliberately flipped (phase D): the managed skeleton-v3 walk template, which sends no keep_first_frame flag, used to
	// count an extra leading frame only when it matched our standing pixel for pixel, so a registered standing that differs
	// from ours left the paid motion a dead end. It is now dropped by position too, with the same evidence recorded.
	const walk = await motionWith('other', {
		action: 'walk',
		text: undefined,
		animation: { model: 'skeleton-v3', frameCount: 4 }
	});
	expect(String(walk.error)).not.toContain('motion frames for');
	expect(walk.measured).toBe(8);
	expect(walk.echo?.maskIoU).toBeLessThan(1);
	// Only exactly one extra frame is dropped: the requested count keeps every frame, and any other count still stops.
	const walkMove = {
		action: 'walk',
		text: undefined,
		animation: { model: 'skeleton-v3', frameCount: 4 }
	};
	const exact = await motionWith('none', walkMove);
	expect(String(exact.error)).not.toContain('motion frames for');
	expect(exact.measured).toBe(8);
	expect(exact.echo).toBeUndefined();
	const two = await motionWith('two', walkMove);
	expect(String(two.error)).toContain('PixelLab returned 10 motion frames for 8 requested');
	expect(two.measured).toBe(0);
});

test('one interior motion frame without joints is bridged from its measured neighbors, never from requested poses', () => {
	const pose = (x: number) => LABELS.map((label, i) => ({ label, x, y: 0.2 + i * 0.01 }));
	const [a, c] = [pose(0.3), pose(0.5)];
	expect(motionJoints([a, a, a])).toEqual([a, a, a]);
	const bridged = motionJoints([a, undefined, c, c])!;
	expect(bridged.map((points) => points[0].x)).toEqual([0.3, 0.4, 0.5, 0.5]);
	expect(bridged[1].map((p) => p.label)).toEqual(LABELS);
	expect(bridged[1][3].y).toBeCloseTo(0.23);
	// An incomplete measurement counts as missing; an end frame, two frames, or a gap next to another gap still fail.
	expect(motionJoints([a, a.slice(1), c])![1][0].x).toBe(0.4);
	expect(motionJoints([undefined, a, c])).toBeUndefined();
	expect(motionJoints([a, c, undefined])).toBeUndefined();
	expect(motionJoints([a, undefined, c, undefined, c])).toBeUndefined();
	expect(motionJoints([a, undefined, undefined, c])).toBeUndefined();
});

test('the inferred-joints note is shown in the reader’s language', () => {
	const translate = ((key: string, vars: Record<string, unknown> = {}) =>
		key === 'studioModel.bodyQuality'
			? `${vars.move} ${vars.direction}: ${vars.reason}`
			: `${key} ${vars.frame}/${vars.total}`) as Parameters<typeof bodyQualityNote>[1];
	expect(
		bodyQualityNote(
			'idle/east: joints of motion frame 3 of 4 were inferred from its neighbors',
			translate
		)
	).toBe('Idle east: studioModel.bridgedJoints 3/4');
	expect(
		bodyQualityNote(
			'idle/east: PixelLab sent 4 frames instead of 5, so the first or last frame may differ',
			((key: string, vars: Record<string, unknown> = {}) =>
				key === 'studioModel.bodyQuality'
					? `${vars.reason}`
					: `${key} ${vars.count}/${vars.expected}`) as Parameters<typeof bodyQualityNote>[1]
		)
	).toBe('studioModel.shortFrames 4/5');
});

test('a managed motion with one unmeasured interior frame still renders the body', async () => {
	const f = await fixture(),
		standing = (await projects.loadProject('rig-target')).project.images.values().next().value!,
		images = [standing, 11, 12, 13, 14].map((shade) => {
			if (typeof shade !== 'number') return shade;
			const im = structuredClone(standing);
			im.data[(30 * 64 + 30) * 4] = shade;
			return im;
		}),
		blobs = new Map<string, Blob>();
	for (const [i, im] of images.entries())
		blobs.set(`m${i}`, new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
	const stored = vi.mocked(db.getBlob).getMockImplementation()!;
	vi.mocked(db.getBlob).mockImplementation(async (h) => blobs.get(h) ?? stored(h));
	const joints = LABELS.map((label, i) => ({ label, x: 0.3 + i * 0.01, y: 0.3 + i * 0.015 }));
	// The checks run concurrently, so the unmeasured frame (the third motion frame) is picked by its image, not call order.
	const unmeasured = await b64(skeletonInput(images[3]).image),
		rendered = f.enqueue.getMockImplementation()!;
	let motionChecks = 0;
	f.enqueue.mockImplementation(async (req, ...rest) => {
		if (req.path === '/characters/animations')
			return {
				id: 'motion',
				state: 'done',
				endpoint: req.path,
				params: {},
				createdAt: 0,
				jobs: [{ results: images.map((_, i) => ({ label: `east/${i}`, sha: `m${i}` })) }]
			} as unknown as JobRec;
		if (req.path !== '/estimate-skeleton' || motionChecks >= 4) return rendered(req, ...rest);
		motionChecks++;
		const image = (req.body as { image: { base64: string } }).image.base64;
		return {
			state: 'done',
			response: { keypoints: image === unmeasured ? [] : joints },
			jobs: []
		} as unknown as JobRec;
	});
	await f.run({ text: 'step softly', action: 'quiet-step', frames: 4 });
	expect(f.enqueue.mock.calls.map(([r]) => r.path)).toContain('/animate-with-skeleton-v3');
	const source = f.saved().manifest.rig.animations[0].sources?.east;
	expect(source?.motion).toBe('pixminimax:step softly');
	// recorded as evidence with the clip: the third motion frame was bridged, and disclosed with its checks
	expect(source?.motionBridged).toEqual([2]);
	expect((f.saved().rigQa as { warnings: string[] }).warnings).toContain(
		'idle/east: joints of motion frame 3 of 4 were inferred from its neighbors'
	);
});

test.each([
	[2, true],
	[1, false],
	[4, false]
] as const)(
	'an empty managed motion frame at position %i is bridged only when it is interior (%s)',
	async (blank, bridged) => {
		const f = await fixture(),
			standing = (await projects.loadProject('rig-target')).project.images.values().next().value!,
			// the standing echo first, then four motion frames; frame `blank` (1-based after the echo) is transparent
			images = [standing, 11, 12, 13, 14].map((shade, i) => {
				if (typeof shade !== 'number') return shade;
				const im = i === blank ? makeImg(64, 64) : structuredClone(standing);
				if (i !== blank) im.data[(30 * 64 + 30) * 4] = shade;
				return im;
			}),
			blobs = new Map<string, Blob>();
		for (const [i, im] of images.entries())
			blobs.set(`m${i}`, new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
		const stored = vi.mocked(db.getBlob).getMockImplementation()!;
		vi.mocked(db.getBlob).mockImplementation(async (h) => blobs.get(h) ?? stored(h));
		const rendered = f.enqueue.getMockImplementation()!;
		f.enqueue.mockImplementation(async (req, ...rest) =>
			req.path === '/characters/animations'
				? ({
						id: 'motion',
						state: 'done',
						endpoint: req.path,
						params: {},
						createdAt: 0,
						jobs: [{ results: images.map((_, i) => ({ label: `east/${i}`, sha: `m${i}` })) }]
					} as unknown as JobRec)
				: rendered(req, ...rest)
		);
		const result = await f
			.run({ text: 'step softly', action: 'quiet-step', frames: 4 })
			.catch((e: Error) => e);
		const paths = f.enqueue.mock.calls.map(([r]) => r.path);
		if (!bridged) {
			expect(String(result)).toContain('empty motion frame');
			expect(paths).not.toContain('/estimate-skeleton');
			return;
		}
		// the empty frame is never measured: three motion checks, then the body render
		const render = paths.indexOf('/animate-with-skeleton-v3');
		expect(paths.slice(0, render).filter((p) => p === '/estimate-skeleton')).toHaveLength(3);
		expect(f.saved().manifest.rig.animations[0].sources?.east?.motionBridged).toEqual([1]);
		expect((f.saved().rigQa as { warnings: string[] }).warnings).toContain(
			'idle/east: joints of motion frame 2 of 4 were inferred from its neighbors'
		);
	}
);

// Both managed routes drop one leading frame by position, so a Standing Fix frames replaced never stops them.
test.each([
	['described', 4, { text: 'step softly', action: 'quiet-step', frames: 4 }],
	[
		'walk template',
		8,
		{ action: 'walk', frames: 4, animation: { model: 'skeleton-v3', frameCount: 4 } }
	]
] as const)(
	'managed %s motion drops the registered standing echo after Fix frames replaced the Standing',
	async (_, count, change) => {
		const f = await fixture(),
			registered = f.images.values().next().value!,
			original = await cellHash(registered),
			edited = structuredClone(registered),
			frame = (shade: number) => {
				const im = structuredClone(registered);
				im.data[(30 * 64 + 30) * 4] = shade;
				return im;
			};
		edited.data[(40 * 64 + 30) * 4] = 7; // our Standing now differs from the one PixelLab registered
		const editedHash = await cellHash(edited);
		f.images.set(editedHash, edited);
		const body = f.saved().manifest.items[0];
		f.saved().manifest.rig.rest!.east!.image = editedHash;
		body.layers[0].cells!.default = { east: [editedHash] };
		body.frameEdits = [
			{
				version: 'frames-v1',
				id: 'standing-fix',
				anim: 'default',
				frames: [
					{
						dir: 'east',
						cell: 0,
						layers: [{ id: 'main', before: original, after: editedHash }],
						cut: { before: null, after: null },
						rest: original
					}
				]
			}
		];
		// PixelLab sends back the standing it registered, then the 4 motion frames
		const images = [registered, ...Array.from({ length: count }, (_, i) => frame(11 + i))],
			blobs = new Map<string, Blob>();
		for (const [i, im] of images.entries())
			blobs.set(`m${i}`, new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>]));
		vi.spyOn(db, 'getBlob').mockImplementation(async (h) => blobs.get(h));
		const joints = LABELS.map((label, i) => ({ label, x: 0.3 + i * 0.01, y: 0.3 + i * 0.015 }));
		f.enqueue.mockResolvedValueOnce({
			state: 'done',
			jobs: [{ results: images.map((_, i) => ({ label: `east/${i}`, sha: `m${i}` })) }]
		} as unknown as JobRec);
		for (let i = 0; i < count; i++)
			f.enqueue.mockResolvedValueOnce({
				state: 'done',
				response: { keypoints: joints },
				jobs: []
			} as unknown as JobRec);
		const before = f.enqueue.mock.calls.length;
		const error = await f.run(change).catch((e: Error) => e);
		expect(String(error)).not.toContain('motion frames for');
		expect(
			f.enqueue.mock.calls.slice(before).filter(([r]) => r.path === '/estimate-skeleton')
		).toHaveLength(count);
	}
);

test('item review binds artwork and cost while unrelated queued clips and playback choices can change', async () => {
	const f = await fixture(),
		m = f.original.manifest;
	const spec = {
		id: 'idle',
		frames: 4,
		items: ['hat'],
		dirs: ['south' as const],
		itemsOnly: true as const,
		itemMethod: 'grid' as const,
		seed: 1
	};
	const reviewed = reviewItemMove(m, spec).itemReview!;
	expect(reviewed.gens).toBe(10);
	const item = m.items[1];
	item.layers[0].cells!.walk = { south: ['sha256:new'] };
	item.provenance.push({
		endpoint: 'synthetic',
		params: {},
		seed: 1,
		requestHash: 'sha256:test',
		createdAt: '',
		produced: ['walk/south/0']
	});
	m.rig.animations[0].loop = false;
	expect(reviewItemMove(m, spec).itemReview).toEqual(reviewed);
	item.materials = ['display-only-dye'];
	item.hides = ['back'];
	expect(reviewItemMove(m, spec).itemReview).toEqual(reviewed);
	item.layers[0].cells!.idle!.south![0] = 'sha256:changed';
	expect(reviewItemMove(m, spec).itemReview!.artwork).not.toBe(reviewed.artwork);
	// a larger canvas re-prices the review (96 px now packs 4 frames + 1 reference into a 10-gen 288x192 grid, so use 128 px)
	item.layers[0].cell = { w: 128, h: 128 };
	expect(reviewItemMove(m, spec).itemReview!.gens).toBe(15);
});

test('missing-item pricing skips coverage already present for each item', async () => {
	const f = await fixture(),
		m = f.original.manifest;
	const item = m.items[1];
	delete item.layers[0].cells!.idle!.south;
	item.coverage = item.coverage!.filter((key) => !key.startsWith('idle/south/'));
	expect(
		moveEstimate(m, {
			id: 'idle',
			frames: 4,
			items: ['hat'],
			dirs: ['south', 'east'],
			itemsOnly: true
		}).items
	).toBe(3);
});

async function reviewedItemFixture() {
	const f = await fixture(),
		m = f.saved().manifest,
		item = m.items[1];
	m.items[0].regions = 'shirt-shorts';
	item.key = 'green';
	item.route = 'skeleton-pose';
	item.dressed = { south: m.rig.rest!.south!.image };
	delete item.layers[0].cells!.idle!.south;
	const bytes = await encodePngBytes(makeImg(64, 64));
	vi.mocked(db.getBlob).mockResolvedValue(
		new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/png' })
	);
	const spec = reviewItemMove(m, {
		id: 'idle',
		frames: 4,
		items: ['hat'],
		dirs: ['south'],
		itemsOnly: true,
		seed: 1
	});
	return { ...f, spec };
}

test.each(['initial load', 'post-normalization reload'] as const)(
	'reviewed item rejects changed artwork at %s before paid work',
	async (boundary) => {
		const f = await reviewedItemFixture(),
			reviewed = structuredClone(f.spec.itemReview),
			consumed = vi.fn(async () => {});
		if (boundary === 'initial load') f.saved().manifest.items[1].prompt = 'Replacement hat';
		else {
			const load = vi.mocked(projects.loadProject).getMockImplementation()!;
			let reads = 0;
			vi.mocked(projects.loadProject).mockImplementation(async (id) => {
				const ctx = await load(id);
				if (++reads === 2) f.saved().manifest.items[1].prompt = 'Replacement hat';
				return ctx;
			});
		}
		await expect(addMove('rig-target', f.spec, undefined, consumed)).rejects.toThrow(
			'review its current estimate'
		);
		expect(f.enqueue).not.toHaveBeenCalled();
		expect(consumed).not.toHaveBeenCalled();
		expect(f.spec.itemReview).toEqual(reviewed);
	}
);

test('reviewed item waits for durable consumption before preparing exactly one paid request', async () => {
	const f = await reviewedItemFixture();
	let release!: () => void;
	const stored = new Promise<void>((resolve) => {
		release = resolve;
	});
	const consumed = vi.fn(async () => {
		expect(f.spec).not.toHaveProperty('itemReview');
		await stored;
	});
	f.enqueue.mockRejectedValue(new Error('Synthetic request boundary reached'));
	const run = addMove('rig-target', f.spec, undefined, consumed);
	const stopped = expect(run).rejects.toThrow('Synthetic request boundary reached');
	await vi.waitFor(() => expect(consumed).toHaveBeenCalledOnce());
	expect(f.enqueue).not.toHaveBeenCalled();
	release();
	await stopped;
	expect(f.enqueue).toHaveBeenCalledOnce();
	expect(f.enqueue.mock.calls[0][0].path).toBe('/animate-with-skeleton-v3');
	expect(f.spec).not.toHaveProperty('itemReview');
});

test('failed durable review consumption sends no paid request', async () => {
	const f = await reviewedItemFixture(),
		reviewed = structuredClone(f.spec.itemReview);
	const consumed = vi.fn(async () => {
		throw new Error('Review receipt storage failed');
	});
	await expect(addMove('rig-target', f.spec, undefined, consumed)).rejects.toThrow(
		'Review receipt storage failed'
	);
	expect(consumed).toHaveBeenCalledOnce();
	expect(f.enqueue).not.toHaveBeenCalled();
	expect(f.spec.itemReview).toEqual(reviewed);
});

test('artwork replaced during durable consumption cannot enter the subsequent request context', async () => {
	const f = await reviewedItemFixture();
	const consumed = vi.fn(async () => {
		f.saved().manifest.items[1].prompt = 'Replacement after review persistence';
	});
	await expect(addMove('rig-target', f.spec, undefined, consumed)).rejects.toThrow(
		'changed before generation'
	);
	expect(consumed).toHaveBeenCalledOnce();
	expect(f.enqueue).not.toHaveBeenCalled();
});

test('a new move whose body frames lack joints is kept body only, without poses, and marked to make again', async () => {
	const f = await fixture();
	const measuring = f.enqueue.getMockImplementation()!;
	// PixelLab finds no joints on the rendered body frames; nothing stands in for them.
	f.enqueue.mockImplementation(async (req, ...rest) =>
		req.path === '/estimate-skeleton'
			? ({
					id: 'joints',
					state: 'done',
					response: { keypoints: [] },
					jobs: []
				} as unknown as JobRec)
			: measuring(req, ...rest)
	);
	f.cache();
	const move = { id: 'calm', action: 'idle', replace: false, dirs: undefined };
	const stopped = (await f.run(move).catch((error: unknown) => error)) as PaidStepError;
	expect(stopped.message).toContain('valid joints were not found on every frame');
	// Users read the move and view by name in their language, never the internal ids, and the move (not setup) stopped.
	expect(stopped.translation.vars).toMatchObject({
		move: 'Calm',
		direction: { key: expect.stringMatching(/^direction/) }
	});
	expect(stopped.message).not.toContain('setup stopped');
	const render = f.enqueue.mock.calls.find(([r]) => r.path === '/animate-with-skeleton-v3')!;
	expect(render[1]).toMatchObject({
		title: { key: 'activity.titleMoveView', vars: { move: 'Calm', name: 'Test' } }
	});
	expect(f.saved().manifest.rig.animations.map((a) => a.id)).toEqual(['idle']);
	const renders = () =>
		f.enqueue.mock.calls.filter(([r]) => r.path === '/animate-with-skeleton-v3').length;
	const before = renders();
	const calls = f.enqueue.mock.calls.length;
	await f.run({ ...move, keepUnposed: true });
	// Keeping is free: every render and check is read from the cache, nothing is sent.
	expect(renders()).toBe(before);
	expect(f.enqueue.mock.calls).toHaveLength(calls);
	const saved = f.saved(),
		calm = saved.manifest.rig.animations.find((a) => a.id === 'calm')!;
	expect(calm.sources).toBeUndefined();
	expect(Object.keys(saved.manifest.items[0].layers[0].cells!.calm!)).toHaveLength(4);
	expect(Object.keys(saved.skeletons ?? {}).filter((key) => key.startsWith('calm/'))).toEqual([]);
	expect(saved.manifest.rig.anchors?.hand_r?.calm).toBeUndefined();
	// Each view without poses is listed on its own (soft gates: views, not whole moves), and the rig stays ready.
	expect((saved.rigQa as { redo?: string[] }).redo).toEqual([
		'calm/south',
		'calm/east',
		'calm/north',
		'calm/west'
	]);
	expect(rigReady(saved)).toBe(true);
	// Kept as body frames only: never with equipment, and never as a staged review.
	for (const change of [{ items: ['hat'] }, { reviewBeforePublish: true }])
		await expect(f.run({ ...move, id: 'still', keepUnposed: true, ...change })).rejects.toThrow(
			'This review choice no longer matches the move'
		);
});

// Deliberately changed (soft gates): the unposed keep used to be offered only for a new whole move. It is now offered for
// replacements and some views too, and only when every other view is already finished, so keeping never buys more work.
test('the unposed keep is offered only when stopped views lack body joints and every other view is finished', () => {
	const stop = (failure: 'joints' | 'overflow', step = 'render') => ({
		state: 'failed' as const,
		error: new PaidStepError('x', 'create.errors.validJointsWereFound', undefined, {
			step,
			failure
		})
	});
	const ready = { state: 'ready' as const };
	expect(keepableUnposed([stop('joints'), stop('joints')])).toBe(true);
	expect(keepableUnposed([stop('joints'), ready])).toBe(true);
	expect(keepableUnposed([])).toBe(false);
	expect(keepableUnposed([ready])).toBe(false);
	expect(keepableUnposed([stop('joints'), stop('overflow')])).toBe(false);
	// Motion joints mean no body was drawn: there is nothing to keep.
	expect(keepableUnposed([stop('joints', 'motion')])).toBe(false);
	expect(keepableUnposed([{ state: 'failed' }])).toBe(false);
	// A view still to buy or still at PixelLab would make the free keep pay for more work.
	expect(keepableUnposed([stop('joints'), { state: 'pending' }])).toBe(false);
	expect(keepableUnposed([stop('joints'), { state: 'running' }])).toBe(false);
});

test('one replaced view kept without poses loses only its own poses and fitted equipment', async () => {
	const f = await fixture();
	const measuring = f.enqueue.getMockImplementation()!;
	f.enqueue.mockImplementation(async (req, ...rest) =>
		req.path === '/estimate-skeleton'
			? ({
					id: 'joints',
					state: 'done',
					response: { keypoints: [] },
					jobs: []
				} as unknown as JobRec)
			: measuring(req, ...rest)
	);
	f.cache();
	await expect(f.run()).rejects.toThrow('valid joints were not found on every frame');
	expect(f.saved()).toEqual(f.original);
	await f.run({ keepUnposed: true });
	const saved = f.saved(),
		before = f.original,
		idle = saved.manifest.rig.animations[0];
	expect(Object.keys(idle.sources!).sort()).toEqual(['north', 'south', 'west']);
	expect(saved.skeletons!['idle/east/0']).toBeUndefined();
	expect(saved.manifest.rig.anchors!.hand_r!.idle!.east).toBeUndefined();
	expect(saved.manifest.items[1].layers[0].cells!.idle!.east).toBeUndefined();
	for (const d of ['south', 'north', 'west'] as const) {
		expect(idle.sources![d]).toEqual(before.manifest.rig.animations[0].sources![d]);
		expect(saved.skeletons![`idle/${d}/0`]).toEqual(before.skeletons![`idle/${d}/0`]);
		expect(saved.manifest.rig.anchors!.hand_r!.idle![d]).toEqual(
			before.manifest.rig.anchors!.hand_r!.idle![d]
		);
		expect(saved.manifest.items[1].layers[0].cells!.idle![d]).toEqual(
			before.manifest.items[1].layers[0].cells!.idle![d]
		);
	}
	expect((saved.rigQa as { redo?: string[] }).redo).toEqual(['idle/east']);
	expect(rigReady(saved)).toBe(true);
	// Equipment waits there with a plain next step naming the move and view: make it again, not set up its poses.
	const stopped = (await f
		.run({ items: ['hat'], itemsOnly: true, replace: undefined, keepUnposed: undefined })
		.catch((error: unknown) => error)) as Error & { translation: { vars: unknown } };
	expect(stopped.message).toContain('idle east was kept without poses. Make that view again');
	expect(stopped.translation.vars).toMatchObject({
		move: { key: 'moveNames.idle' },
		direction: { key: expect.any(String) }
	});
	const fit = {
		id: 'idle',
		frames: 4,
		items: ['hat'],
		dirs: ['east' as const],
		itemsOnly: true as const,
		seed: 1
	};
	expect(() => reviewItemMove(saved.manifest, fit, setupRedoMoves(saved))).toThrow(
		'idle east was kept without poses'
	);
	// Without the record's list (an import never set up), the generic setup step stays.
	expect(() => reviewItemMove(saved.manifest, fit)).toThrow('Set up its poses');
});

test('redoing one view of a move kept without poses leaves the rest of the rig ready', async () => {
	const f = await fixture();
	const unposed = f.saved();
	delete unposed.manifest.rig.animations[0].sources;
	delete unposed.manifest.rig.anchors;
	unposed.skeletons = {};
	(unposed.rigQa as { redo?: string[] }).redo = ['idle'];
	expect(rigReady(unposed)).toBe(true);
	await f.run();
	const saved = f.saved();
	expect(Object.keys(saved.manifest.rig.animations[0].sources!)).toEqual(['east']);
	// south, north and west are still without poses and listed: the rig stays ready, items wait there
	expect(rigReady(saved)).toBe(true);
	expect((saved.rigQa as { redo?: string[] }).redo).toEqual(['idle']);
	// Repairing the other views one at a time clears the list once every view has poses again, as read back after reload.
	for (const dir of ['south', 'north'] as const) await f.run({ dirs: [dir] });
	expect((f.saved().rigQa as { redo?: string[] }).redo).toEqual(['idle']);
	await f.run({ dirs: ['west'] });
	const reloaded = (await projects.loadProject('rig-target')).rec;
	expect((reloaded.rigQa as { redo?: string[] }).redo).toEqual([]);
	expect(rigReady(reloaded)).toBe(true);
});

test('unposed views are listed per view and leave the list once they have poses again', () => {
	const posed = { id: 'idle', sources: { east: {} as never, south: {} as never } };
	expect(redoAfterSave(['walk', 'idle/east'], posed, ['east', 'south'])).toEqual(['walk']);
	// a whole-move entry stays until every view with frames has poses
	expect(
		redoAfterSave(['idle'], { id: 'idle', sources: { east: {} as never } }, ['east', 'south'])
	).toEqual(['idle']);
	expect(redoAfterSave(['idle'], posed, ['east', 'south'])).toEqual([]);
	expect(
		redoAfterSave(
			['walk'],
			{ id: 'idle', sources: { east: {} as never } },
			['east', 'south'],
			['south']
		)
	).toEqual(['walk', 'idle/south']);
	const idle = { id: 'idle', sources: { east: {} as never } };
	// A view with poses is never unposed; an unlisted view without poses (an import not set up yet) is not either.
	expect(unposedView(['idle'], idle, 'east')).toBe(false);
	expect(unposedView(['idle'], idle, 'south')).toBe(true);
	expect(unposedView(['idle/south'], idle, 'south')).toBe(true);
	expect(unposedView([], idle, 'south')).toBe(false);
});

test('saving the finished views of a move started from a saved frame keeps that start for those views', async () => {
	const f = await fixture();
	f.cache();
	const all: DirectionName[] = ['south', 'east', 'north', 'west'];
	const spec: MoveSpec = {
		id: 'calm',
		action: 'idle',
		frames: 4,
		items: [],
		seed: 23,
		replace: false,
		poseStyle: 'visible-side-v1',
		reviewBeforePublish: true,
		startFrom: resolveMoveSource(f.saved().manifest, { clip: 'idle', cell: 3 }, all)!
	};
	// Every view is bought once (here all finish); the draft is discarded so only the cache remains.
	await expect(f.run({ ...spec, dirs: undefined })).resolves.toMatchObject({ moveReview: 'calm' });
	delete f.saved().moveReviews;
	const calls = f.enqueue.mock.calls.length,
		east = finishedViewsSpec(spec, ['east']);
	expect(Object.keys(east.startFrom!.views)).toEqual(['east']);
	// The full source map no longer matches a narrowed run: that was the refusal of the unchanged source.
	await expect(f.run({ ...east, startFrom: spec.startFrom })).rejects.toThrow(
		'The selected starting frame changed'
	);
	await expect(f.run(east)).resolves.toMatchObject({ moveReview: 'calm' });
	expect(f.enqueue.mock.calls).toHaveLength(calls);
	const draft = f.saved().moveReviews!.calm!;
	expect(draft.dirs).toEqual(['east']);
	expect(draft.animation.sources?.east?.referenceKeypoints).toEqual(
		spec.startFrom!.views.east!.keypoints
	);
});
