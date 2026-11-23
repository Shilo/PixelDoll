import { beforeEach, describe, expect, test, vi } from 'vitest';
import { makeImg, type Img } from '../../src/lib/image/png.ts';
import { stableStringify } from '../../src/lib/image/hash.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { cellHash, type Keypoint, type Sha256 } from '../../src/lib/rig/rig.ts';
import { CURRENT_FORMAT, type Project } from '../../src/lib/store/manifest.ts';
import type { StoredProject } from '../../src/lib/store/project.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import { resolveMoveSource } from '../../src/studio/moveSource.ts';
import { measureJoints, measurementInput, missingItemMoves } from '../../src/studio/create.ts';
import { loadProject } from '../../src/lib/store/project.ts';
import { queue } from '../../src/lib/pixellab/queue.ts';
import * as db from '../../src/lib/store/db.ts';
import {
	applyStateJointFit,
	measureStateJoints,
	quoteStateJointFit,
	saveStateJointFit,
	stateJointFitTarget
} from '../../src/studio/stateJointFit.ts';

vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: { id: 'rig-test' },
	directionEditsBlocked: vi.fn(() => ''),
	flushSave: vi.fn(async () => undefined),
	openProject: vi.fn(async () => undefined)
}));
vi.mock('../../src/lib/app.svelte.ts', () => ({
	app: { key: 'key', keyRejected: false, balanceError: '', balance: null },
	getKeyRevision: () => 1,
	refreshBalance: vi.fn(async () => undefined)
}));
vi.mock('../../src/lib/pixellab/plans.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/pixellab/plans.ts')>()),
	planRestriction: () => null
}));
vi.mock('../../src/lib/store/project.ts', () => ({ loadProject: vi.fn() }));
vi.mock('../../src/lib/store/db.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/db.ts')>()),
	update: vi.fn()
}));
vi.mock('../../src/lib/pixellab/queue.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/pixellab/queue.ts')>()),
	queue: { snapshot: vi.fn(() => ({ jobs: [] })), subscribe: vi.fn(() => () => undefined) }
}));
vi.mock('../../src/studio/create.ts', async (original) => ({
	...(await original<typeof import('../../src/studio/create.ts')>()),
	measureJoints: vi.fn()
}));

const pose = (shift = 0): Keypoint[] =>
	LABELS.map((label, index) => ({ label, x: 0.3 + index / 100 + shift, y: 0.2 + index / 40 }));

function body(color: number): Img {
	const image = makeImg(64, 64);
	for (let y = 20; y < 56; y++)
		for (let x = 24; x < 40; x++) image.data.set([color, 90, 60, 255], (y * 64 + x) * 4);
	return image;
}

async function fixture(endpoint = '/edit-animation-v2'): Promise<Project> {
	const images = [body(100), body(110), body(140), body(150), body(160)];
	const [restSouth, restEast, south, east, west] = await Promise.all(images.map(cellHash));
	const rest = pose();
	return {
		images: new Map(
			[restSouth, restEast, south, east, west].map((hash, index) => [hash, images[index]])
		),
		manifest: {
			format: CURRENT_FORMAT,
			name: 'Fixture',
			app: 'test',
			rig: {
				cell: { w: 64, h: 64 },
				pivot: { x: 32, y: 56 },
				baseHash: `sha256:${'a'.repeat(64)}`,
				baseItem: 'base',
				directions: [{ id: 'south' }, { id: 'east' }, { id: 'west', mirrorOf: 'east' }],
				rest: {
					south: { image: restSouth, keypoints: rest },
					east: { image: restEast, keypoints: rest }
				},
				animations: [
					{ id: 'default', kind: 'state', cells: 1, loop: false, frames: [{ cell: 0, ms: 100 }] },
					{
						id: 'glow',
						kind: 'state',
						cells: 1,
						loop: false,
						frames: [{ cell: 0, ms: 100 }],
						source: { endpoint }
					}
				]
			},
			items: [
				{
					id: 'base',
					name: 'base',
					slot: 'body',
					status: 'accepted',
					baseHash: `sha256:${'a'.repeat(64)}`,
					prompt: 'base',
					mirror: 'flip',
					materials: [],
					provenance: [],
					layers: [
						{
							id: 'main',
							role: 'fg',
							z: 10,
							cells: {
								default: { south: [restSouth], east: [restEast], west: [restEast] },
								glow: { south: [south], east: [east], west: [west] }
							}
						}
					]
				}
			],
			materials: [],
			slots: [{ id: 'body', class: 'base', z: 10 }],
			presets: []
		}
	};
}

const receipt = (requestHash: string, state: JobRec['state'] = 'done') =>
	({
		id: requestHash,
		requestHash,
		state,
		endpoint: '/estimate-skeleton',
		params: {},
		jobs: [],
		createdAt: 1
	}) as unknown as JobRec;

describe('State joint fit target', () => {
	test('measures only exact drawn facings of generated State art', async () => {
		const project = await fixture();
		const target = await stateJointFitTarget(project, 'glow');
		expect(target?.views.map(({ direction }) => direction)).toEqual(['south', 'east']);
		expect(await stateJointFitTarget(await fixture('local'), 'glow')).toBeUndefined();
		expect(await stateJointFitTarget(project, 'default')).toBeUndefined();
	});

	test('skips fitted facings and measures a frame edit on its new art', async () => {
		const project = await fixture();
		const { rig } = project.manifest;
		const cells = project.manifest.items[0].layers[0].cells!.glow;
		const before = `sha256:${'b'.repeat(64)}` as Sha256;
		rig.animations[1].sources = {
			south: { route: 'import', reference: cells.south![0]!, measured: [pose()], provenance: [] },
			east: { route: 'import', reference: before, measured: [pose()], provenance: [] }
		};
		project.manifest.items[0].frameEdits = [
			{
				version: 'frames-v1',
				id: 'edit',
				anim: 'glow',
				frames: [
					{
						dir: 'east',
						cell: 0,
						layers: [{ id: 'main', before, after: cells.east![0]! }],
						cut: { before: null, after: null }
					}
				]
			}
		];
		// Joints measured before the edit do not fit the edited art.
		expect(
			resolveMoveSource(project.manifest, { clip: 'glow', cell: 0 }, ['east'])
		).toBeUndefined();
		const target = await stateJointFitTarget(project, 'glow');
		expect(target?.fitted).toEqual(['south']);
		expect(target?.views.map(({ direction, hash }) => [direction, hash])).toEqual([
			['east', cells.east![0]]
		]);
		// Joints fitted on the edited art make it a Move source.
		const { manifest } = applyStateJointFit(
			project.manifest,
			{},
			{
				stateId: 'glow',
				views: [{ direction: 'east', hash: cells.east![0]!, keypoints: pose(), qa: {} as never }],
				provenance: [
					{
						endpoint: '/estimate-skeleton',
						params: {},
						seed: 0,
						requestHash: `sha256:${'c'.repeat(64)}`,
						createdAt: new Date(0).toISOString(),
						produced: []
					}
				]
			}
		);
		expect(resolveMoveSource(manifest, { clip: 'glow', cell: 0 }, ['east'])?.views.east).toEqual({
			image: cells.east![0],
			keypoints: pose()
		});
	});

	test('refuses art whose stored pixels do not match their hash', async () => {
		const project = await fixture();
		const hash = project.manifest.items[0].layers[0].cells!.glow.south![0]!;
		project.images.set(hash, body(1));
		expect(await stateJointFitTarget(project, 'glow')).toBeUndefined();
	});
});

test('applying a reviewed fit makes the State a Move source without touching gear binding', async () => {
	const project = await fixture();
	const target = (await stateJointFitTarget(project, 'glow'))!;
	const before = stableStringify(project.manifest);
	const provenance = target.views.map((_, index) => ({
		endpoint: '/estimate-skeleton',
		params: {},
		seed: 0,
		requestHash: `sha256:${String(index).repeat(64)}` as Sha256,
		createdAt: new Date(0).toISOString(),
		produced: []
	}));
	const views = target.views.map(({ direction, hash }, index) => ({
		direction,
		hash,
		keypoints: pose(index / 100)
	}));
	const { manifest, skeletons } = applyStateJointFit(
		project.manifest,
		{ other: {} },
		{
			stateId: 'glow',
			views: views.map((view) => ({ ...view, qa: {} as never })),
			provenance
		}
	);
	expect(stableStringify(project.manifest)).toBe(before);
	expect(manifest.items[0].provenance).toEqual(provenance);
	expect(manifest.rig.baseHash).toBe(project.manifest.rig.baseHash);
	expect(manifest.items[0].layers).toEqual(project.manifest.items[0].layers);
	const sources = manifest.rig.animations[1].sources!;
	expect(sources.east).toMatchObject({ reference: views[1].hash, provenance: [1] });
	expect(sources.west).toBeUndefined();
	expect(Object.keys(skeletons).sort()).toEqual([
		'glow/east/0',
		'glow/south/0',
		'glow/west/0',
		'other'
	]);
	expect(skeletons['glow/west/0']['LEFT HIP'].x).toBeCloseTo(
		64 - skeletons['glow/east/0']['LEFT HIP'].x
	);
	expect(resolveMoveSource(manifest, { clip: 'glow', cell: 0 }, ['south', 'east'])?.views).toEqual({
		south: { image: views[0].hash, keypoints: views[0].keypoints },
		east: { image: views[1].hash, keypoints: views[1].keypoints }
	});
});

test('a generated State is offered for missing gear fit only after its joints are saved', async () => {
	const project = await fixture();
	const { manifest } = project;
	const standing = manifest.items[0].layers[0].cells!.default;
	manifest.slots.push({ id: 'cape', class: 'worn', z: 20 });
	manifest.items.push({
		...structuredClone(manifest.items[0]),
		id: 'cape',
		name: 'cape',
		slot: 'cape',
		route: 'skeleton-pose',
		key: 'green',
		dressed: { south: standing.south![0]!, east: standing.east![0]! },
		layers: [{ id: 'main', role: 'fg', z: 20, cells: { default: standing } }]
	});
	expect(missingItemMoves(manifest, 'cape', 9)).toEqual([]);

	const target = (await stateJointFitTarget(project, 'glow'))!;
	const { manifest: fitted } = applyStateJointFit(manifest, undefined, {
		stateId: 'glow',
		views: target.views.map(({ direction, hash }) => ({
			direction,
			hash,
			keypoints: pose(),
			qa: {} as never
		})),
		provenance: target.views.map(() => ({
			endpoint: '/estimate-skeleton',
			params: {},
			seed: 0,
			requestHash: `sha256:${'c'.repeat(64)}` as Sha256,
			createdAt: new Date(0).toISOString(),
			produced: []
		}))
	});
	expect(missingItemMoves(fitted, 'cape', 9)).toEqual([
		{ id: 'glow', frames: 1, items: ['cape'], dirs: ['south', 'east'], itemsOnly: true, seed: 9 }
	]);
});

describe('State joint fit service', () => {
	let record: StoredProject;
	let project: Project;
	beforeEach(async () => {
		vi.clearAllMocks();
		project = await fixture();
		record = {
			id: 'rig-test',
			savedAt: '',
			origin: 'studio',
			manifest: structuredClone(project.manifest)
		} as StoredProject;
		// Like the real loader, the loaded copy gains a default export id the stored record lacks.
		vi.mocked(loadProject).mockImplementation(async () => {
			const rec = structuredClone(db.asLoaded(record)!);
			return { rec, project: { ...project, manifest: structuredClone(rec.manifest) } };
		});
		vi.mocked(db.update).mockImplementation(async (_store, _id, update) => {
			record = update(structuredClone(record)) as StoredProject;
			return record;
		});
		vi.mocked(queue.snapshot).mockReturnValue({ jobs: [] } as never);
	});

	test('quotes new checks, measures for review without writing, then saves atomically', async () => {
		const target = (await stateJointFitTarget(project, 'glow'))!;
		const done = (await measurementInput(target.views[0].image)).hash;
		vi.mocked(queue.snapshot).mockReturnValue({ jobs: [receipt(done)] } as never);
		const quote = await quoteStateJointFit('rig-test', 'glow');
		expect(quote.checks.map(({ status }) => status)).toEqual(['done', 'new']);
		expect(quote.generations).toBe(0.1);

		vi.mocked(measureJoints).mockImplementation(async (image) => ({
			keypoints: pose(),
			record: receipt(await cellHash(image))
		}));
		const review = await measureStateJoints(quote);
		expect(db.update).not.toHaveBeenCalled();
		expect(review.blocked).toBe(false);
		expect(review.views.map(({ direction }) => direction)).toEqual(['south', 'east']);

		await saveStateJointFit(review);
		expect(db.update).toHaveBeenCalledTimes(1);
		expect(record.manifest.rig.animations[1].sources?.south?.measured).toEqual([pose()]);
		expect(record.manifest.items[0].provenance).toHaveLength(2);
		expect(Object.keys(record.skeletons ?? {})).toHaveLength(3);
	});

	test('a stopped check blocks the quote so nothing is resent', async () => {
		const target = (await stateJointFitTarget(project, 'glow'))!;
		const lost = (await measurementInput(target.views[1].image)).hash;
		vi.mocked(queue.snapshot).mockReturnValue({ jobs: [receipt(lost, 'lost')] } as never);
		await expect(quoteStateJointFit('rig-test', 'glow')).rejects.toThrow('No request was resent');
		expect(measureJoints).not.toHaveBeenCalled();
	});

	test('queued checks are priced but a quote cannot replace a check that vanished', async () => {
		const target = (await stateJointFitTarget(project, 'glow'))!;
		const hash = (await measurementInput(target.views[0].image)).hash;
		vi.mocked(queue.snapshot).mockReturnValue({ jobs: [receipt(hash, 'queued')] } as never);
		const quote = await quoteStateJointFit('rig-test', 'glow');
		expect(quote.checks.map(({ status }) => status)).toEqual(['queued', 'new']);
		expect(quote.generations).toBe(0.2);
		vi.mocked(queue.snapshot).mockReturnValue({ jobs: [] } as never);
		await expect(measureStateJoints(quote)).rejects.toThrow('changed');
		expect(measureJoints).not.toHaveBeenCalled();
	});

	test('closing the sheet aborts the measurement scope and cannot produce a review', async () => {
		const quote = await quoteStateJointFit('rig-test', 'glow');
		const sheet = new AbortController();
		vi.mocked(measureJoints).mockImplementation(async (_image, _resume, signal) => {
			sheet.abort();
			signal?.throwIfAborted();
			throw new Error('Expected the sheet abort to reach the measurement');
		});
		await expect(measureStateJoints(quote, sheet.signal)).rejects.toMatchObject({
			name: 'AbortError'
		});
		expect(db.update).not.toHaveBeenCalled();
	});

	test('a manifest change after review blocks the save', async () => {
		vi.mocked(measureJoints).mockImplementation(async (image) => ({
			keypoints: pose(),
			record: receipt(await cellHash(image))
		}));
		const review = await measureStateJoints(await quoteStateJointFit('rig-test', 'glow'));
		record.manifest.name = 'Renamed';
		await expect(saveStateJointFit(review)).rejects.toThrow('changed');
		expect(db.update).not.toHaveBeenCalled();
	});

	test('missing joints on a facing fail measurement instead of producing a review', async () => {
		vi.mocked(measureJoints).mockImplementation(async (image) => ({
			keypoints: undefined,
			record: receipt(await cellHash(image))
		}));
		await expect(measureStateJoints(await quoteStateJointFit('rig-test', 'glow'))).rejects.toThrow(
			'no valid joints'
		);
	});
});
