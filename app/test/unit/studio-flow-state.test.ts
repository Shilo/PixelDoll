/// <reference types="svelte" />
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MoveSpec, Progress } from '../../src/studio/create.ts';
import type { RepairReview } from '../../src/lib/items/run.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import type { Balance } from '../../src/lib/pixellab/routes.ts';
import { message } from '../../src/lib/message.ts';
import { characterFacts } from '../../src/studio/model.ts';
import { readFileSync } from 'node:fs';
import { equipmentFixture } from './equipment-fixture.ts';

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	move: vi.fn(),
	moveReview: vi.fn(),
	moveItems: vi.fn(),
	setup: vi.fn(),
	recovery: vi.fn(),
	keep: vi.fn(),
	palette: vi.fn(),
	match: vi.fn(),
	applyRepair: vi.fn(),
	repairApplied: vi.fn(),
	load: vi.fn(),
	source: vi.fn(),
	put: vi.fn(),
	get: vi.fn(),
	del: vi.fn(),
	update: vi.fn(),
	clear: vi.fn(),
	subscribe: vi.fn(),
	handoff: vi.fn(),
	all: vi.fn(),
	cancelScoped: vi.fn(),
	observe: vi.fn()
}));
const mockAccount = vi.hoisted(() => ({ key: '', balance: null as Balance | null }));
vi.mock('../../src/studio/create.ts', () => ({
	createCharacter: mocks.create,
	addMove: mocks.move,
	itemMoveReviewMatches: (manifest: Manifest, spec: MoveSpec) => {
		if (!spec.itemReview) return !spec.reviewedMoveItems;
		const reviewed = mocks.moveReview(manifest, spec).itemReview;
		return reviewed.artwork === spec.itemReview.artwork && reviewed.gens === spec.itemReview.gens;
	},
	moveItems: mocks.moveItems,
	reviewMoveRecovery: async (...args: unknown[]) => ({
		recovery: await mocks.recovery(...args),
		keep: await mocks.keep(...args)
	}),
	bodyPaletteRepairPlan: mocks.palette,
	saveCopy: vi.fn()
}));
vi.mock('../../src/studio/setup.ts', () => ({ setupCharacter: mocks.setup }));
vi.mock('../../src/lib/items/run.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/items/run.ts')>()),
	matchItemColors: mocks.match,
	applyRepairReview: mocks.applyRepair,
	repairAlreadyApplied: mocks.repairApplied
}));
vi.mock('../../src/lib/store/project.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/project.ts')>()),
	loadProject: mocks.load
}));
vi.mock('../../src/lib/dress/project.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/dress/project.ts')>()),
	openSource: mocks.source
}));

vi.mock('../../src/lib/store/db.ts', async (original) => ({
	CREATE_DRAFT_PREFIX: (await original<typeof import('../../src/lib/store/db.ts')>())
		.CREATE_DRAFT_PREFIX,
	REQUEST_TEXT: (await original<typeof import('../../src/lib/store/db.ts')>()).REQUEST_TEXT,
	withoutCharacters: (await original<typeof import('../../src/lib/store/db.ts')>())
		.withoutCharacters,
	put: mocks.put,
	get: mocks.get,
	del: mocks.del,
	update: mocks.update,
	all: mocks.all
}));
vi.mock('../../src/lib/app.svelte.ts', () => ({ app: mockAccount }));
vi.mock('../../src/lib/pixellab/queue.ts', () => ({
	queue: {
		role: 'leader',
		snapshot: () => ({ jobs: [] }),
		subscribe: mocks.subscribe,
		requestHandoff: mocks.handoff,
		idle: () => true,
		clearFinished: mocks.clear,
		observeScope: mocks.observe,
		cancelAbortedScope: mocks.cancelScoped
	}
}));

function stubGlobals() {
	// Isolate asynchronous controller logic; no rendering or Svelte reactivity is under test.
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: identity }));
	vi.stubGlobal('$derived', Object.assign(identity, { by: () => undefined }));
	vi.stubGlobal('innerWidth', 1440);
	vi.stubGlobal('innerHeight', 900);
	vi.stubGlobal('devicePixelRatio', 1);
	vi.stubGlobal('matchMedia', () => ({ matches: false }));
	vi.stubGlobal('document', { querySelector: () => null });
}
// Build the module graph once outside any test's timeout; each test's fresh import after resetModules is then fast.
beforeAll(async () => {
	stubGlobals();
	await import('../../src/studio/state.svelte.ts');
	vi.unstubAllGlobals();
});
beforeEach(() => {
	vi.resetModules();
	Object.values(mocks).forEach((m) => m.mockReset());
	mockAccount.key = '';
	mockAccount.balance = null;
	mocks.put.mockResolvedValue(undefined);
	mocks.get.mockResolvedValue(undefined);
	mocks.del.mockResolvedValue(undefined);
	mocks.clear.mockResolvedValue(0);
	mocks.all.mockResolvedValue([]);
	stubGlobals();
});
afterEach(() => vi.unstubAllGlobals());
test('canceling from a follower explains that generation has not stopped without opening Activity', async () => {
	const state = await import('../../src/studio/state.svelte.ts');
	const { queue } = await import('../../src/lib/pixellab/queue.ts');
	queue.role = 'follower';
	try {
		state.ui.sheet = null;
		const generation = {
			phase: 'running',
			draft: { spec: { id: 'follower-cancel' } }
		} as import('../../src/studio/state.svelte.ts').Gen;
		await expect(state.cancelGen(generation)).rejects.toThrow(
			'This tab has not stopped the generation'
		);
		expect(state.ui.sheet).toBeNull();
		expect(generation.phase).toBe('running');
		expect(generation.canceled).toBeUndefined();
		expect(mocks.handoff).not.toHaveBeenCalled();
	} finally {
		queue.role = 'leader';
	}
});

test('a move saved for another character refreshes its listed summary', async () => {
	const state = await import('../../src/studio/state.svelte.ts');
	const fixture = await equipmentFixture();
	const savedAt = '2026-11-21T10:00:00.000Z';
	const manifest = {
		...structuredClone(fixture.manifest),
		name: 'Other',
		rig: {
			...fixture.manifest.rig,
			animations: [
				...fixture.manifest.rig.animations,
				{ id: 'cast', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }
			]
		}
	};
	// The open character is not the one the move is for: its save must still reach the list row.
	state.doc.id = 'rig-open';
	state.store.projects = [
		{ id: 'rig-open', name: 'Open', demo: false, dev: false, savedAt: '', look: '' },
		{ id: 'rig-other', name: 'Stale', demo: false, dev: false, savedAt: '', look: '' }
	];
	mocks.get.mockImplementation(async (_store: string, id: string) =>
		id === 'rig-other'
			? { id, origin: 'studio', savedAt, manifest: structuredClone(manifest) }
			: undefined
	);
	mocks.move.mockResolvedValue({ warnings: [], qualityDirs: [] });
	await state.startMove('rig-other', {
		id: 'cast',
		action: 'cast',
		frames: 1,
		items: [],
		seed: 1
	});
	expect(state.store.projects.find((entry) => entry.id === 'rig-other')).toMatchObject({
		name: 'Other',
		savedAt,
		facts: characterFacts(manifest)
	});
});

test('a failed review write leaves the paid candidate available and a cache-only recovery record', async () => {
	const state = await import('../../src/studio/state.svelte.ts');
	const { errorText, errorTranslation } = await import('../../src/lib/message.ts');
	const itemReview = { gens: 10, artwork: 'reviewed' };
	const candidate = { findings: ['visual issue'] } as RepairReview;
	const spec: MoveSpec = {
		id: 'walk',
		frames: 8,
		seed: 271,
		items: ['coat'],
		dirs: ['south'],
		itemsOnly: true,
		itemMethod: 'grid',
		itemReview,
		reuseItemFrames: true
	};
	mocks.load.mockResolvedValue({ rec: { manifest: {} } });
	mocks.moveReview.mockReturnValue({ itemReview });
	mocks.move.mockResolvedValue({ warnings: [], repairReview: candidate });
	mocks.put.mockImplementation(async (_store, _key, record) => {
		if (record.status === 'review') throw new Error('Quota exceeded');
	});
	await state.startMove('project', spec);
	expect(state.moving.repairReview).toEqual(candidate);
	expect(errorTranslation(state.moving.error)).toEqual(message('repairReview.unsaved'));
	expect(errorText(state.moving.error)).toContain('available in this tab');
	expect(mocks.put.mock.calls.at(-1)?.[2]).toMatchObject({
		status: 'failed',
		spec: { itemReview, reuseItemFrames: true },
		error: expect.stringContaining('without another charge')
	});
	await state.resolveRepairReview(false);
	expect(state.moving.done).toBe(true);
	expect(mocks.move).toHaveBeenCalledOnce();
	expect(mocks.applyRepair).not.toHaveBeenCalled();
});

test('a committed repair survives a failed move handoff without offering to keep the replaced frames', async () => {
	const state = await import('../../src/studio/state.svelte.ts');
	const { errorText, errorTranslation } = await import('../../src/lib/message.ts');
	const candidate = { findings: ['visual issue'] } as RepairReview;
	mocks.get.mockResolvedValue({
		status: 'review',
		projectId: 'project',
		repairReview: candidate,
		spec: { id: 'walk', items: ['coat'], itemMethod: 'grid', seed: 5, itemsOnly: true }
	});
	mocks.repairApplied.mockResolvedValue(true);
	await state.resumeMove();
	expect(state.moving.repairApplied).toBe(true);
	await state.resolveRepairReview(false);
	expect(errorTranslation(state.moving.error)).toEqual(message('repairReview.alreadySaved'));
	expect(errorText(state.moving.error)).toContain('already saved');
	expect(mocks.del).not.toHaveBeenCalled();
	await state.resolveRepairReview(true);
	expect(state.moving.done).toBe(true);
	expect(mocks.move).not.toHaveBeenCalled();
	expect(mocks.applyRepair).not.toHaveBeenCalled();
});

function pending<T>() {
	let resolve!: (value: T) => void, reject!: (error: unknown) => void;
	const promise = new Promise<T>((a, b) => {
		resolve = a;
		reject = b;
	});
	return { promise, resolve, reject };
}
const progress = (step: string, done: number): Progress => ({ step, done, total: 69, recIds: [] });
/** The flow's progress callback: createCharacter takes a views callback after it, addMove and setup end with it. */
const progressOf = (kind: 'create' | 'move' | 'setup', args: unknown[]) =>
	(kind === 'create' ? args[1] : args.at(-1)) as (p: Progress) => void;

test.each(['create', 'move', 'setup'] as const)(
	'%s ignores late sibling progress after failure, during retry, and after termination',
	async (kind) => {
		const first = pending<string>(),
			second = pending<string>(),
			callbacks: ((p: Progress) => void)[] = [];
		const flow = mocks[kind];
		flow
			.mockImplementationOnce((...args: unknown[]) => {
				callbacks.push(progressOf(kind, args));
				return first.promise;
			})
			.mockImplementationOnce((...args: unknown[]) => {
				callbacks.push(progressOf(kind, args));
				return second.promise;
			});
		const s = await import('../../src/studio/state.svelte.ts');
		const stateOf = () =>
			kind === 'create' ? s.creates[0] : kind === 'move' ? s.moving : s.settingUp;
		const start = (seed: number) =>
			kind === 'create'
				? s.startCreate({
						description: 'body',
						name: 'Fixture',
						projectId: 'rig-fixture',
						seed,
						size: 48,
						directions: [{ id: 'south' as const }]
					})
				: kind === 'move'
					? s.startMove('project', { id: 'cast', action: 'cast', frames: 8, items: [], seed })
					: s.startSetup({
							projectId: 'project',
							baseHash: 'sha256:' + 'a'.repeat(64),
							restAnim: 'idle',
							looks: 'body',
							seed
						});
		const initial = start(1);
		const state = stateOf();
		await vi.waitFor(() => expect(callbacks).toHaveLength(1));
		callbacks[0](progress('animate', 10));
		first.reject(new Error('First branch failed'));
		await initial;
		callbacks[0](progress('animate', 47));
		expect(state.progress).toEqual(progress('animate', 10));
		expect(state.error).toBe('First branch failed');
		const retry = start(2);
		await vi.waitFor(() => expect(callbacks).toHaveLength(2));
		callbacks[1](progress('draw', 1));
		callbacks[0](progress('animate', 48));
		expect(state.progress).toEqual(progress('draw', 1));
		expect(state.error).toBe('');
		second.reject(new Error('Current branch failed'));
		await retry;
		callbacks[0](progress('save', 69));
		callbacks[1](progress('animate', 49));
		expect(state.progress).toEqual(progress('draw', 1));
		expect(state.error).toBe('Current branch failed');
	}
);

test('creation identity is persisted before paid work, survives failed resume, and fresh attempts get a new identity', async () => {
	const persisted = pending<void>();
	mocks.put.mockImplementationOnce(() => persisted.promise);
	mocks.create.mockRejectedValue(new Error('fixture stops before paid work'));
	const s = await import('../../src/studio/state.svelte.ts');
	const form = {
		description: 'body',
		name: 'Pending',
		seed: 1,
		size: 48,
		directions: [{ id: 'south' as const }]
	};
	const run = s.startCreate(form);
	expect(mocks.create).not.toHaveBeenCalled();
	const saved = mocks.put.mock.calls[0][2].spec;
	expect(saved.projectId).toMatch(/^rig-[a-f0-9-]+$/);
	expect(saved).toEqual({
		...form,
		projectId: saved.projectId,
		activityScope: expect.any(String)
	});
	persisted.resolve();
	await run;
	expect(mocks.create.mock.calls[0][0].projectId).toBe(saved.projectId);
	await s.startCreate(structuredClone(saved));
	expect(mocks.create.mock.calls[1][0].projectId).toBe(saved.projectId);
	await s.startCreate({ ...saved, seed: 2, projectId: undefined });
	expect(mocks.create.mock.calls[2][0].projectId).not.toBe(saved.projectId);
});

test('a published creation remains ready when removing its recovery draft fails', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	mocks.create.mockResolvedValue('rig-published');
	mocks.del.mockRejectedValueOnce(new Error('Could not remove draft'));
	await s.startCreate(
		{
			projectId: 'rig-published',
			description: 'body',
			name: 'Published',
			seed: 1,
			size: 48,
			directions: [{ id: 'south' }]
		},
		true
	);
	expect(s.creates[0]).toMatchObject({ projectId: 'rig-published', error: '', running: false });
	expect(mocks.put).toHaveBeenCalledOnce();
	expect(s.ui.toast).toEqual(
		message('state.couldNotSaveReason', { reason: 'Could not remove draft' })
	);
	s.ui.sheet = null;
	s.ui.sheet = 'create';
	expect(s.createPresentation.id).toBe('');
	expect(s.creates).toHaveLength(0);
});

test('discarding a failed creation cannot race a retry for the same draft', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	const form = {
		projectId: 'rig-failed',
		description: 'body',
		name: 'Failed',
		seed: 1,
		size: 48,
		directions: [{ id: 'south' as const }]
	};
	mocks.create.mockRejectedValueOnce(new Error('Fixture failed'));
	await s.startCreate(form, true);
	const deletion = pending<void>();
	mocks.del.mockReturnValueOnce(deletion.promise);
	const removing = s.discardCreate('rig-failed');
	await s.startCreate({ ...form, projectId: undefined, seed: 2 }, true, 'rig-failed');
	expect(mocks.create).toHaveBeenCalledOnce();
	deletion.resolve();
	await removing;
	expect(s.creates).toHaveLength(0);
	expect(s.ui.sheet).toBe('create');
	expect(s.createPresentation.id).toBe('');
});

test('a new creation fixes its walk-room lift, and a resumed one keeps the lift its registration was sent with', async () => {
	mocks.create.mockResolvedValue('rig-done');
	const s = await import('../../src/studio/state.svelte.ts');
	const spec = {
		description: 'body',
		name: 'Fixture',
		seed: 1,
		size: 96,
		frame: 128,
		directions: [{ id: 'south' as const }]
	};
	await s.startCreate(spec);
	expect(mocks.create.mock.calls[0][0]).toMatchObject({ lift: 5 });
	// A draft started before placement was lifted resumes with its stored spec: changing its pixels would re-buy registration.
	await s.startCreate({ ...spec, projectId: 'rig-old' }, false, 'old-draft');
	expect(mocks.create.mock.calls[1][0].lift).toBeUndefined();
});

test('a paid step failure keeps its review across a reload', async () => {
	// A misaligned repair batch is re-rolled alone; after a reload only the full retry would remain, re-buying good batches.
	const { PaidStepError } = await import('../../src/lib/pixellab/paid-results.ts');
	const step = { step: 'grid-batch:4', failure: 'misaligned' as const, gens: 2.5 };
	mocks.move.mockRejectedValueOnce(
		new PaidStepError('Batch misaligned', 'itemRoute.errors.repairBatchMisaligned', undefined, step)
	);
	const first = await import('../../src/studio/state.svelte.ts');
	await first.startMove('project', { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 });
	const stored = mocks.put.mock.calls.findLast(
		([, , record]) => (record as { status?: string }).status === 'failed'
	)![2];
	vi.resetModules();
	const paid = await import('../../src/lib/pixellab/paid-results.ts');
	const s = await import('../../src/studio/state.svelte.ts');
	mocks.get.mockImplementation(async (_store, id) => (id === 'studio-move' ? stored : undefined));
	await s.resumeMove();
	expect(s.moving.error).toBeInstanceOf(paid.PaidStepError);
	expect((s.moving.error as InstanceType<typeof paid.PaidStepError>).paid).toEqual(step);
});

test.each(['failed', 'running'] as const)(
	'clears %s rig setup work for a missing character without reopening or restarting it',
	async (status) => {
		const state = await import('../../src/studio/state.svelte.ts');
		const projectId = 'rig-missing';
		mocks.get.mockImplementation(async (_store, id) =>
			id === 'studio-setup'
				? { spec: { projectId }, status, requestText: state.REQUEST_TEXT }
				: undefined
		);
		await state.resumeSetup();
		expect(mocks.del).toHaveBeenCalledWith('projects', 'studio-setup');
		expect(state.settingUp.spec).toBeNull();
		expect(mocks.load).not.toHaveBeenCalled();
		expect(mocks.setup).not.toHaveBeenCalled();
	}
);

test.each(['read the character', 'remove the stale setup'])(
	'keeps setup available for review without restarting if storage cannot %s',
	async (operation) => {
		const state = await import('../../src/studio/state.svelte.ts');
		const spec = { projectId: 'rig-missing' };
		const record = { spec, status: 'running', requestText: state.REQUEST_TEXT };
		const failure = new Error('IndexedDB unavailable');
		mocks.get.mockImplementation(async (_store, id) => {
			if (id === 'studio-setup') return record;
			if (operation === 'read the character') throw failure;
		});
		if (operation === 'remove the stale setup') mocks.del.mockRejectedValueOnce(failure);
		await state.resumeSetup();
		expect(state.settingUp.spec).toEqual(spec);
		expect(state.settingUp.error).toMatchObject({
			translation: message('generation.outcome.setupStopped')
		});
		expect(mocks.setup).not.toHaveBeenCalled();
		if (operation === 'read the character') expect(mocks.del).not.toHaveBeenCalled();
	}
);

test('setup recovery never deletes a draft after handing off during the character read', async () => {
	const state = await import('../../src/studio/state.svelte.ts');
	const { queue } = await import('../../src/lib/pixellab/queue.ts');
	const record = { spec: { projectId: 'rig-missing' }, status: 'failed' };
	const character = pending<undefined>();
	mocks.get.mockImplementation(async (_store, id) =>
		id === 'studio-setup' ? record : character.promise
	);
	const resumed = state.resumeSetup();
	await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledWith('projects', 'rig-missing'));
	expect(queue.canYield()).toBe(false);
	queue.role = 'follower';
	try {
		character.resolve(undefined);
		await resumed;
		expect(mocks.del).not.toHaveBeenCalled();
		expect(state.settingUp.spec).toBeNull();
	} finally {
		queue.role = 'leader';
	}
});

for (const kind of ['create', 'move', 'setup'] as const) {
	const key = kind === 'create' ? 'studio-create:rig-fixture' : 'studio-' + kind;
	const spec =
		kind === 'create'
			? {
					description: 'body',
					name: 'Fixture',
					projectId: 'rig-fixture',
					seed: 1,
					size: 48,
					directions: [{ id: 'south' as const }]
				}
			: kind === 'move'
				? { id: 'cast', action: 'cast', frames: 8, items: [], seed: 1 }
				: {
						projectId: 'rig-fixture',
						baseHash: 'sha256:' + 'a'.repeat(64),
						restAnim: 'idle',
						looks: 'body',
						seed: 1
					};
	const stateOf = (s: typeof import('../../src/studio/state.svelte.ts')) =>
		kind === 'create' ? s.creates[0] : kind === 'move' ? s.moving : s.settingUp;
	const start = (s: typeof import('../../src/studio/state.svelte.ts'), next = spec) =>
		kind === 'create'
			? s.startCreate(next as Parameters<typeof s.startCreate>[0])
			: kind === 'move'
				? s.startMove('project', next as Parameters<typeof s.startMove>[1])
				: s.startSetup(next as Parameters<typeof s.startSetup>[0]);
	const resume = (s: typeof import('../../src/studio/state.svelte.ts')) =>
		kind === 'create' ? s.resumeCreate() : kind === 'move' ? s.resumeMove() : s.resumeSetup();

	test(`${kind} persists terminal failure, restores it after module reload without running, and explicit retry clears status`, async () => {
		const records = new Map<string, any>();
		if (kind === 'setup') records.set('rig-fixture', { id: 'rig-fixture' });
		mocks.put.mockImplementation(async (_store, id, value) => {
			records.set(id, structuredClone(value));
		});
		mocks.get.mockImplementation(async (_store, id) => structuredClone(records.get(id)));
		mocks.all.mockImplementation(async () => [...records.values()]);
		mocks[kind].mockRejectedValue(new Error('Known terminal failure'));
		const first = await import('../../src/studio/state.svelte.ts');
		await start(first);
		const failed = structuredClone(records.get(key));
		expect(failed).toMatchObject({ status: 'failed', error: 'Known terminal failure', spec });
		expect(stateOf(first).error).toBe('Known terminal failure');
		// a failed move holds the queue while its sheet is closed, so it says so
		if (kind === 'move')
			expect(first.ui).toMatchObject({
				toast: message('state.moveFailedOpen', { moveName: 'Cast' }),
				toastTone: 'danger'
			});
		mocks[kind].mockClear();
		vi.resetModules();
		const restored = await import('../../src/studio/state.svelte.ts');
		await resume(restored);
		restored.doc.loading = false;
		restored.startupResumed();
		expect(mocks[kind]).not.toHaveBeenCalled();
		expect(stateOf(restored)).toMatchObject({
			spec: failed.spec,
			error: 'Known terminal failure',
			progress: null
		});
		const { queue } = await import('../../src/lib/pixellab/queue.ts');
		expect(queue.canYield()).toBe(false);
		await expect(restored.prepareForUpdate()).resolves.toBeUndefined();
		const retry = pending<string>();
		mocks[kind].mockReturnValueOnce(retry.promise);
		const running = start(restored, { ...failed.spec, seed: 2 });
		await vi.waitFor(() => expect(mocks[kind]).toHaveBeenCalledOnce());
		expect(records.get(key)).toMatchObject({ status: 'running', spec: { seed: 2 } });
		expect(records.get(key).error).toBeUndefined();
		expect(stateOf(restored).error).toBe('');
		retry.reject(new Error('Explicit retry stopped'));
		await running;
	});

	test.each([undefined, 'running'])(
		`${kind} retains interrupted recovery for status %s`,
		async (status) => {
			const s = await import('../../src/studio/state.svelte.ts');
			const record = {
				id: key,
				spec,
				projectId: 'project',
				requestText: s.REQUEST_TEXT,
				...(status ? { status } : {})
			};
			mocks.get.mockResolvedValue(record);
			mocks.all.mockResolvedValue([record]);
			const wait = pending<string>();
			mocks[kind].mockReturnValue(wait.promise);
			await resume(s);
			await vi.waitFor(() => expect(mocks[kind]).toHaveBeenCalledOnce());
			if (kind === 'move') expect(mocks.move.mock.calls[0][1]).not.toHaveProperty('poseStyle');
			wait.reject(new Error('Interrupted recovery stopped'));
			await vi.waitFor(() => expect(stateOf(s).error).toBe('Interrupted recovery stopped'));
		}
	);

	test(`${kind} saved with older request wording waits for review instead of resending`, async () => {
		const record = { id: key, spec, projectId: 'project', status: 'running' };
		mocks.get.mockResolvedValue(record);
		mocks.all.mockResolvedValue([record]);
		const s = await import('../../src/studio/state.svelte.ts');
		await resume(s);
		expect(mocks[kind]).not.toHaveBeenCalled();
		expect(stateOf(s).error).toMatchObject({
			message: `${kind === 'setup' ? 'Setup' : 'Generation'} stopped. Review Activity before trying again.`,
			translation: message(
				kind === 'setup' ? 'generation.outcome.setupStopped' : 'generation.outcome.stopped'
			)
		});
		s.doc.loading = false;
		s.startupResumed();
		await expect(s.prepareForUpdate()).resolves.toBeUndefined();
	});

	test.each(['Original failure', ''])(
		`${kind} reports failed-marker storage errors, freezes late progress, and releases its guard (%s)`,
		async (originalFailure) => {
			const saved = pending<void>();
			let callback!: (p: Progress) => void;
			mocks.put.mockImplementation((_store, _id, record) =>
				record.status === 'failed' ? saved.promise : Promise.resolve()
			);
			mocks[kind].mockImplementationOnce((...args: unknown[]) => {
				callback = progressOf(kind, args);
				callback(progress('animate', 4));
				throw new Error(originalFailure);
			});
			const s = await import('../../src/studio/state.svelte.ts');
			const running = start(s);
			await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(2));
			expect(stateOf(s).error).toBe(originalFailure);
			callback(progress('animate', 47));
			expect(stateOf(s).progress).toEqual(progress('animate', 4));
			saved.reject(new Error('Storage unavailable'));
			await running;
			expect(stateOf(s).error).toMatchObject({
				translation: message('state.couldNotSaveFlowFailure', { error: originalFailure })
			});
			s.doc.loading = false;
			s.startupResumed();
			await expect(s.prepareForUpdate()).rejects.toThrow('could not confirm');
			mocks.put.mockResolvedValue(undefined);
			mocks[kind].mockRejectedValue(new Error('Retry entered'));
			await start(s);
			expect(mocks[kind]).toHaveBeenCalledTimes(2);
		}
	);
}

const recoveryPlan = {
	checkHashes: ['a'.repeat(64), 'b'.repeat(64)],
	recordIds: ['lost-west-0', 'canceled-west-1'],
	rigVersion: 'rig-fingerprint',
	checks: 2,
	gens: 0.2,
	usd: 0.01026,
	rawHashes: []
};
const recoverySpec = {
	id: 'slash',
	action: 'slash',
	frames: 8,
	items: ['sword'],
	seed: 2438,
	replace: true,
	dirs: ['east', 'west'] as import('../../src/lib/store/manifest.ts').DirectionName[],
	poseStyle: 'visible-side-v1' as const
};

test('explicit joint-check recovery preserves the body identity and persists one reviewed intent before work', async () => {
	const persisted = pending<void>();
	mocks.put.mockImplementationOnce(() => persisted.promise);
	mocks.recovery.mockResolvedValue(recoveryPlan);
	mocks.move.mockRejectedValue(new Error('Offline recovery stopped'));
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(recoverySpec),
		error: 'Unknown joint check',
		done: false
	});
	const run = s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan);
	await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce());
	expect(mocks.move).not.toHaveBeenCalled();
	const stored = mocks.put.mock.calls[0][2];
	expect(stored).toMatchObject({
		status: 'running',
		projectId: 'project',
		spec: {
			...recoverySpec,
			measurementRecovery: {
				recordIds: recoveryPlan.recordIds,
				rigVersion: recoveryPlan.rigVersion
			}
		}
	});
	expect(stored.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
	expect(s.moving.error).toBe('');
	persisted.resolve();
	await run;
	expect(mocks.move).toHaveBeenCalledOnce();
	expect(mocks.move.mock.calls[0][1]).toEqual(stored.spec);
	expect(mocks.put.mock.calls[1][2]).toMatchObject({ status: 'failed', spec: stored.spec });
	mocks.move.mockClear();
	mocks.recovery.mockClear();
	vi.resetModules();
	mocks.get.mockResolvedValue(mocks.put.mock.calls[1][2]);
	const reloaded = await import('../../src/studio/state.svelte.ts');
	await reloaded.resumeMove();
	expect(mocks.move).not.toHaveBeenCalled();
	expect(mocks.recovery).not.toHaveBeenCalled();
	expect(reloaded.moving.spec).toEqual(stored.spec);
});

test.each([
	'recordIds',
	'rigVersion',
	'checks',
	'checkHashes',
	'rawHashes',
	'gens',
	'usd',
	'palette',
	'empty',
	'unavailable'
] as const)(
	'joint recovery rejects changed %s without clearing the failed operation or writing consent',
	async (field) => {
		const changes = {
			recordIds: ['another-record'],
			rigVersion: 'changed-rig',
			checks: 3,
			checkHashes: ['c'.repeat(64), 'd'.repeat(64)],
			rawHashes: ['changed-art'],
			gens: 0.9,
			usd: 0.99,
			palette: {
				directions: ['west'],
				changedPixels: 4,
				rawOutliers: 4,
				remainingOutliers: 0,
				changedFrames: 1
			}
		};
		mocks.recovery.mockResolvedValue(
			field === 'unavailable'
				? undefined
				: field === 'empty'
					? { ...recoveryPlan, recordIds: [], checks: 0 }
					: { ...recoveryPlan, [field]: changes[field] }
		);
		const s = await import('../../src/studio/state.svelte.ts');
		Object.assign(s.moving, {
			projectId: 'project',
			spec: structuredClone(recoverySpec),
			error: 'Original failure',
			done: false
		});
		await expect(
			s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan)
		).rejects.toThrow('Review their cost again');
		expect(s.moving.error).toBe('Original failure');
		expect(mocks.move).not.toHaveBeenCalled();
		expect(mocks.put).not.toHaveBeenCalled();
	}
);

test.each([false, true])(
	'fresh recovery consent replaces the stale rig version only after durable review (palette=%s)',
	async (palette) => {
		const current = {
			...recoveryPlan,
			rigVersion: 'current-rig',
			rawHashes: ['exact-original-art'],
			...(palette
				? {
						palette: {
							directions: ['west'] as import('../../src/lib/store/manifest.ts').DirectionName[],
							changedPixels: 39,
							rawOutliers: 39,
							remainingOutliers: 0,
							changedFrames: 3
						}
					}
				: {})
		};
		const spec = {
			...recoverySpec,
			measurementRecovery: {
				id: 'old-joint-consent',
				recordIds: ['old-check'],
				rigVersion: 'old-rig',
				checkHashes: []
			},
			...(palette
				? {
						bodyPaletteRepair: {
							id: 'original-color-policy',
							version: 'near-rest-v1' as const,
							rigVersion: 'old-rig',
							checkHashes: []
						}
					}
				: {})
		};
		const persisted = pending<void>();
		mocks.recovery.mockResolvedValue(current);
		mocks.put.mockImplementationOnce(() => persisted.promise);
		mocks.move.mockRejectedValue(new Error('Offline after fresh consent'));
		const s = await import('../../src/studio/state.svelte.ts');
		Object.assign(s.moving, {
			projectId: 'project',
			spec: structuredClone(spec),
			error: 'Unknown joint check',
			done: false
		});
		const running = s.retryMoveMeasurements('project', structuredClone(spec), current);
		await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce());
		expect(mocks.recovery).toHaveBeenCalledWith('project', spec);
		expect(mocks.move).not.toHaveBeenCalled();
		const stored = mocks.put.mock.calls[0][2];
		expect(stored).toMatchObject({
			status: 'running',
			spec: {
				...recoverySpec,
				measurementRecovery: { recordIds: current.recordIds, rigVersion: 'current-rig' }
			}
		});
		expect(stored.spec.measurementRecovery.id).not.toBe('old-joint-consent');
		expect(stored.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
		if (palette)
			expect(stored.spec.bodyPaletteRepair).toEqual({
				id: 'original-color-policy',
				version: 'near-rest-v1',
				checkHashes: current.checkHashes,
				rigVersion: 'current-rig'
			});
		else expect(stored.spec.bodyPaletteRepair).toBeUndefined();
		persisted.resolve();
		await running;
		expect(mocks.move).toHaveBeenCalledOnce();
		expect(mocks.move.mock.calls[0][1]).toEqual(stored.spec);
	}
);

test('corrected-frame consent cannot proceed if the fresh review loses the palette candidate', async () => {
	const spec = {
		...recoverySpec,
		bodyPaletteRepair: {
			id: 'color-policy',
			version: 'near-rest-v1' as const,
			rigVersion: 'old-rig',
			checkHashes: []
		}
	};
	mocks.recovery.mockResolvedValue(recoveryPlan);
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(spec),
		error: 'Original corrected-frame failure',
		done: false
	});
	await expect(s.retryMoveMeasurements('project', spec, recoveryPlan)).rejects.toThrow(
		'Review their cost again'
	);
	expect(mocks.put).not.toHaveBeenCalled();
	expect(mocks.move).not.toHaveBeenCalled();
});

test('joint recovery refuses a superseded pending operation and a failed durable-intent write cannot start paid work', async () => {
	const check = pending<typeof recoveryPlan>();
	mocks.recovery.mockReturnValue(check.promise);
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(recoverySpec),
		error: 'Original failure',
		done: false
	});
	const run = s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan);
	s.moving.spec = { ...recoverySpec, seed: 9832 };
	check.resolve(recoveryPlan);
	await expect(run).rejects.toThrow('Review their cost again');
	expect(mocks.put).not.toHaveBeenCalled();
	expect(mocks.move).not.toHaveBeenCalled();
	s.moving.spec = structuredClone(recoverySpec);
	mocks.recovery.mockResolvedValue(recoveryPlan);
	mocks.put.mockRejectedValue(new Error('Storage blocked'));
	await s.retryMoveMeasurements('project', structuredClone(recoverySpec), recoveryPlan);
	expect(mocks.move).not.toHaveBeenCalled();
	expect(s.moving.error).toMatchObject({
		translation: message('state.couldNotSaveFlowFailure', { error: 'Storage blocked' })
	});
});

test('Keep saves only the reviewed cached body with its exact seed and refuses a changed review before any work', async () => {
	const keepPlan = {
		qaHash: 'c'.repeat(64),
		rigVersion: 'rig-fingerprint',
		rawHashes: ['d'.repeat(64)],
		directions: []
	};
	mocks.keep.mockResolvedValue(keepPlan);
	mocks.move.mockResolvedValue({ warnings: ['slash/east: silhouette bottom differs'] });
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(recoverySpec),
		error: 'The replacement still fails body-pose quality checks.',
		done: false
	});
	await expect(
		s.keepMoveBody('project', structuredClone(recoverySpec), {
			...keepPlan,
			qaHash: 'e'.repeat(64)
		})
	).rejects.toThrow('changed');
	expect(mocks.put).not.toHaveBeenCalled();
	expect(mocks.move).not.toHaveBeenCalled();
	await s.keepMoveBody('project', structuredClone(recoverySpec), keepPlan);
	expect(mocks.move).toHaveBeenCalledOnce();
	const kept = mocks.move.mock.calls[0][1] as MoveSpec;
	expect(kept).toMatchObject({
		...recoverySpec,
		items: [],
		seed: recoverySpec.seed,
		measurementRecovery: {
			recordIds: [],
			checkHashes: [],
			rigVersion: keepPlan.rigVersion,
			keep: { qaHash: keepPlan.qaHash }
		}
	});
	expect(s.moving.done).toBe(true);
	expect(s.moving.warnings).toEqual(['slash/east: silhouette bottom differs']);
});

const palettePlan = {
	...recoveryPlan,
	checkHashes: ['a', 'b', 'c', 'd'].map((value) => value.repeat(64)),
	recordIds: [],
	rawHashes: ['cached-body-hash'],
	checks: 4,
	gens: 0.4,
	usd: 0.02052,
	directions: ['west'] as import('../../src/lib/store/manifest.ts').DirectionName[],
	changedPixels: 39,
	rawOutliers: 177,
	remainingOutliers: 138,
	changedFrames: 4,
	itemGens: 6
};
const paletteSpec = {
	...recoverySpec,
	measurementRecovery: {
		id: 'previous-joint-consent',
		recordIds: ['old-lost'],
		rigVersion: 'rig-fingerprint',
		checkHashes: []
	}
};

test('body color consent preserves the raw render identity, clears old check consent, and persists before work', async () => {
	const persisted = pending<void>();
	mocks.put.mockImplementationOnce(() => persisted.promise);
	mocks.palette.mockResolvedValue(palettePlan);
	mocks.move.mockRejectedValue(new Error('Offline corrected check stopped'));
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(paletteSpec),
		error: 'Palette fit failed',
		done: false
	});
	const run = s.matchMoveBodyColors('project', structuredClone(paletteSpec), palettePlan);
	await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce());
	expect(mocks.palette).toHaveBeenCalledWith('project', {
		...paletteSpec,
		measurementRecovery: undefined
	});
	expect(mocks.move).not.toHaveBeenCalled();
	const stored = mocks.put.mock.calls[0][2];
	expect(stored).toMatchObject({
		status: 'running',
		spec: {
			...recoverySpec,
			bodyPaletteRepair: { version: 'near-rest-v1', rigVersion: palettePlan.rigVersion }
		}
	});
	expect(stored.spec.bodyPaletteRepair.id).toMatch(/^[a-f0-9-]{36}$/);
	expect(stored.spec.measurementRecovery).toBeUndefined();
	persisted.resolve();
	await run;
	expect(mocks.move.mock.calls[0][1]).toEqual(stored.spec);
	expect(mocks.put.mock.calls[1][2]).toMatchObject({ status: 'failed', spec: stored.spec });
	mocks.move.mockClear();
	mocks.palette.mockClear();
	vi.resetModules();
	mocks.get.mockResolvedValue(mocks.put.mock.calls[1][2]);
	const restored = await import('../../src/studio/state.svelte.ts');
	await restored.resumeMove();
	expect(mocks.move).not.toHaveBeenCalled();
	expect(mocks.palette).not.toHaveBeenCalled();
	expect(restored.moving.spec).toEqual(stored.spec);
});

test.each([false, true])(
	'all-cached reuse saves a fresh current-rig intent before work (palette=%s)',
	async (palette) => {
		const current = {
			...recoveryPlan,
			recordIds: [],
			checkHashes: [],
			rigVersion: 'current-rig',
			checks: 0,
			gens: 0,
			usd: 0,
			...(palette
				? {
						palette: {
							directions: ['west'] as import('../../src/lib/store/manifest.ts').DirectionName[],
							changedPixels: 39,
							rawOutliers: 39,
							remainingOutliers: 0,
							changedFrames: 3
						}
					}
				: {})
		};
		const spec = {
			...recoverySpec,
			measurementRecovery: {
				id: 'old-check-consent',
				recordIds: ['old-lost-check'],
				rigVersion: 'old-rig',
				checkHashes: []
			},
			...(palette
				? {
						bodyPaletteRepair: {
							id: 'old-color-consent',
							version: 'near-rest-v1' as const,
							rigVersion: 'old-rig',
							checkHashes: []
						}
					}
				: {})
		};
		const persisted = pending<void>();
		mocks.recovery.mockResolvedValue(current);
		mocks.put.mockImplementationOnce(() => persisted.promise);
		mocks.move.mockRejectedValue(new Error('Offline after fresh color consent'));
		const s = await import('../../src/studio/state.svelte.ts');
		Object.assign(s.moving, {
			projectId: 'project',
			spec: structuredClone(spec),
			error: 'Publication interrupted',
			done: false
		});
		const running = s.retryMoveMeasurements('project', structuredClone(spec), current);
		await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledOnce());
		expect(mocks.move).not.toHaveBeenCalled();
		const stored = mocks.put.mock.calls[0][2];
		expect(stored.spec.measurementRecovery).toMatchObject({
			recordIds: [],
			rigVersion: 'current-rig'
		});
		expect(stored.spec.measurementRecovery.id).not.toBe('old-check-consent');
		expect(stored.spec.measurementRecovery.id).toMatch(/^[a-f0-9-]{36}$/);
		if (palette)
			expect(stored.spec.bodyPaletteRepair).toEqual({
				id: 'old-color-consent',
				version: 'near-rest-v1',
				checkHashes: current.checkHashes,
				rigVersion: 'current-rig'
			});
		else expect(stored.spec.bodyPaletteRepair).toBeUndefined();
		persisted.resolve();
		await running;
		expect(mocks.move.mock.calls[0][1]).toEqual(stored.spec);
	}
);

test('explicit cached reuse replaces missing old palette hash authorization with the fresh reviewed hashes', async () => {
	const current = {
		...recoveryPlan,
		recordIds: [],
		checkHashes: [],
		rigVersion: 'current-rig',
		checks: 0,
		gens: 0,
		usd: 0,
		palette: {
			directions: ['west'] as import('../../src/lib/store/manifest.ts').DirectionName[],
			changedPixels: 39,
			rawOutliers: 39,
			remainingOutliers: 0,
			changedFrames: 3
		}
	};
	const spec = {
		...recoverySpec,
		bodyPaletteRepair: {
			id: 'retained-known-policy',
			version: 'near-rest-v1',
			rigVersion: 'old-rig'
		}
	} as MoveSpec;
	mocks.recovery.mockResolvedValue(current);
	mocks.move.mockRejectedValue(new Error('Offline after explicit reapproval'));
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(spec),
		error: 'Old interrupted repair',
		done: false
	});
	await s.retryMoveMeasurements('project', spec, current);
	const stored = mocks.put.mock.calls[0][2].spec;
	expect(stored.bodyPaletteRepair).toEqual({
		id: 'retained-known-policy',
		version: 'near-rest-v1',
		rigVersion: 'current-rig',
		checkHashes: []
	});
	expect(stored.measurementRecovery).toMatchObject({
		rigVersion: 'current-rig',
		recordIds: [],
		checkHashes: []
	});
	expect(mocks.move.mock.calls[0][1]).toEqual(stored);
});

test.each([
	'rawHashes',
	'checkHashes',
	'rigVersion',
	'changedPixels',
	'checks',
	'itemGens'
] as const)('body color consent rejects changed %s without paid work', async (field) => {
	mocks.palette.mockResolvedValue({
		...palettePlan,
		[field]:
			field === 'rawHashes'
				? ['different-body']
				: field === 'checkHashes'
					? ['e'.repeat(64)]
					: field === 'rigVersion'
						? 'changed-rig'
						: 999
	});
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(paletteSpec),
		error: 'Palette fit failed',
		done: false
	});
	await expect(
		s.matchMoveBodyColors('project', structuredClone(paletteSpec), palettePlan)
	).rejects.toThrow('Review their cost again');
	expect(mocks.put).not.toHaveBeenCalled();
	expect(mocks.move).not.toHaveBeenCalled();
	expect(s.moving.error).toBe('Palette fit failed');
});

test('existing body color intent cannot be applied twice and interrupted resume retains its identity', async () => {
	const spec = {
		...recoverySpec,
		bodyPaletteRepair: {
			id: 'existing-color-consent',
			version: 'near-rest-v1' as const,
			checkHashes: palettePlan.checkHashes,
			rigVersion: palettePlan.rigVersion
		}
	};
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec,
		error: 'A corrected check stopped',
		done: false
	});
	await expect(s.matchMoveBodyColors('project', spec, palettePlan)).rejects.toThrow(
		'Review the body colors again'
	);
	expect(mocks.palette).not.toHaveBeenCalled();
	expect(mocks.move).not.toHaveBeenCalled();
	vi.resetModules();
	mocks.get.mockResolvedValue({
		id: 'studio-move',
		spec,
		projectId: 'project',
		status: 'running',
		requestText: s.REQUEST_TEXT
	});
	mocks.move.mockRejectedValue(new Error('Interrupted corrected check stopped'));
	const restored = await import('../../src/studio/state.svelte.ts');
	await restored.resumeMove();
	await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
	expect(mocks.move.mock.calls[0][1]).toEqual({ ...spec, activityScope: expect.any(String) });
});

test('body color consent storage failure cannot start paid work', async () => {
	mocks.palette.mockResolvedValue(palettePlan);
	mocks.put.mockRejectedValue(new Error('Consent storage blocked'));
	const s = await import('../../src/studio/state.svelte.ts');
	Object.assign(s.moving, {
		projectId: 'project',
		spec: structuredClone(paletteSpec),
		error: 'Palette fit failed',
		done: false
	});
	await s.matchMoveBodyColors('project', structuredClone(paletteSpec), palettePlan);
	expect(mocks.move).not.toHaveBeenCalled();
	expect(s.moving.error).toMatchObject({
		translation: message('state.couldNotSaveFlowFailure', { error: 'Consent storage blocked' })
	});
});

const itemColorPlan = {
	version: 'neutral-owned-v1' as const,
	fingerprint: 'reviewed-item-and-rig',
	materialId: 'sword-metal',
	changedPixels: 20,
	changedFrames: [0, 1],
	unmatchedPixels: 0
};

test('free item palette refresh preserves the outfit, selected view and inspector without invoking paid flow', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	s.doc.id = 'project';
	s.doc.items = { main_hand: 'sword' };
	s.doc.variants = { 'sword-metal': 'azure' };
	s.ui.selected = 'sword';
	s.ui.anim = 'slash';
	s.ui.dir = 'west';
	s.ui.frame = 3;
	const project = { manifest: { name: 'Refreshed palette' }, images: new Map() };
	mocks.match.mockResolvedValue(undefined);
	mocks.load.mockResolvedValue({ project });
	await s.matchItemPalette('project', 'sword', 'slash', 'west', itemColorPlan);
	expect(mocks.match).toHaveBeenCalledWith('project', 'sword', 'slash', 'west', itemColorPlan);
	expect(s.store.project).toBe(project);
	expect(s.doc.items).toEqual({ main_hand: 'sword' });
	expect(s.doc.variants).toEqual({ 'sword-metal': 'azure' });
	expect(s.ui).toMatchObject({ selected: 'sword', anim: 'slash', dir: 'west', frame: 3 });
	expect(mocks.move).not.toHaveBeenCalled();
	expect(mocks.create).not.toHaveBeenCalled();
	expect(mocks.setup).not.toHaveBeenCalled();
});

test('free item palette cannot replace a newer pending navigation even while the old project remains displayed', async () => {
	const work = pending<void>(),
		navigation = pending<never>();
	mocks.match.mockReturnValue(work.promise);
	mocks.source.mockReturnValue(navigation.promise);
	const s = await import('../../src/studio/state.svelte.ts');
	s.doc.id = 'old-project';
	const run = s.matchItemPalette('old-project', 'sword', 'slash', 'west', itemColorPlan);
	await vi.waitFor(() => expect(mocks.match).toHaveBeenCalledOnce());
	void s.openProject('new-project');
	await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce());
	expect(s.doc.id).toBe('old-project');
	work.resolve();
	await run;
	expect(mocks.load).not.toHaveBeenCalled();
});

test('free item palette applies only the newest refresh when two item corrections complete close together', async () => {
	const older = pending<{ project: any }>(),
		newer = pending<{ project: any }>();
	mocks.match.mockResolvedValue(undefined);
	mocks.load.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
	const s = await import('../../src/studio/state.svelte.ts');
	s.doc.id = 'project';
	const first = s.matchItemPalette('project', 'first-item', 'slash', 'west', itemColorPlan);
	await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(1));
	const second = s.matchItemPalette('project', 'second-item', 'slash', 'west', itemColorPlan);
	await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledTimes(2));
	const currentProject = { manifest: { name: 'Both corrections' }, images: new Map() };
	newer.resolve({ project: currentProject });
	await second;
	older.resolve({ project: { manifest: { name: 'Older snapshot' }, images: new Map() } });
	await first;
	expect(s.store.project).toBe(currentProject);
});

test('a palette refresh re-reads export preferences saved after its project read started', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	const original = { manifest: fixtureManifest(), images: new Map() },
		first = pending<{ project: typeof original }>();
	s.doc.id = 'project';
	s.store.project = structuredClone(original);
	mocks.match.mockResolvedValue(undefined);
	mocks.load
		.mockReturnValueOnce(first.promise)
		.mockImplementationOnce(async () => ({ project: structuredClone(s.store.project) }));
	const refreshing = s.matchItemPalette('project', 'sword', 'walk', 'south', itemColorPlan);
	await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
	s.store.project.manifest.rig.animations[0].loop = false;
	s.doc.rev++;
	first.resolve({ project: original });
	await refreshing;
	expect(mocks.load).toHaveBeenCalledTimes(2);
	expect(s.store.project.manifest.rig.animations[0].loop).toBe(false);
	expect(mocks.match).toHaveBeenCalledOnce();
});

test('merged move flow keeps durable guards while publishing its warnings', async () => {
	const body = pending<{ warnings: string[] }>();
	let callback!: (p: Progress) => void;
	mocks.move.mockImplementation((_project, _spec, onProgress) => {
		callback = onProgress;
		return body.promise;
	});
	const s = await import('../../src/studio/state.svelte.ts');
	s.moving.warnings = ['old-warning'];
	const spec = { ...recoverySpec };
	const run = s.startMove('other-project', spec);
	await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
	expect(mocks.put.mock.calls[0][2]).toMatchObject({ status: 'running', spec });
	expect(s.moving.warnings).toEqual([]);
	callback(progress('animate', 3));
	await s.startMove('other-project', { ...spec, seed: 987 });
	expect(mocks.move).toHaveBeenCalledOnce();
	body.resolve({ warnings: ['Review equipment separately'] });
	await run;
	expect(s.moving.warnings).toEqual(['Review equipment separately']);
	expect(s.moving.done).toBe(true);
	expect(mocks.del).toHaveBeenCalledWith('projects', 'studio-move');
	callback(progress('animate', 99));
	expect(s.moving.progress).toEqual(progress('animate', 3));
	await s.dismissMove();
	expect(s.moving.warnings).toEqual([]);
});

test('concurrent item starts claim distinct draft ids while the item pipeline loads', async () => {
	const manifest = JSON.parse(
		readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);
	// Initial creation now needs a genuine still instead of spending on the fixture's animations.
	manifest.rig.animations.unshift({
		id: 'default',
		cells: 1,
		frames: [{ cell: 0, ms: 100 }],
		loop: true
	});
	const base = manifest.items.find((i: { id: string }) => i.id === manifest.rig.baseItem);
	base.layers[0].cells = {
		default: Object.fromEntries(
			manifest.rig.directions
				.filter((d: { mirrorOf?: string }) => !d.mirrorOf)
				.map((d: { id: string }) => [d.id, ['sha256:standing-fixture']])
		)
	};
	mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
	const s = await import('../../src/studio/state.svelte.ts');
	const input = { name: 'Hat', slot: 'head', prompt: 'a hat' };
	await Promise.all([s.startItem(input), s.startItem(input)]);
	const ids = s.gens.map((g) => g.draft.spec.id);
	expect(ids).toHaveLength(2);
	expect(new Set(ids).size).toBe(2);
	// Each start also runs its draft (the mocked queue cannot submit, so both end failed); let that finish inside the test.
	await vi.waitFor(() => expect(s.gens.map((g) => g.phase)).toEqual(['failed', 'failed']));
	await vi.waitFor(() =>
		expect(
			mocks.put.mock.calls.filter(([, key]) => key === 'studio-drafts').length
		).toBeGreaterThanOrEqual(4)
	);
});

const fixtureManifest = () =>
	JSON.parse(
		readFileSync(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);

test.each(['same character', 'another character', 'another selection'])(
	'standing preview after draft persistence respects %s',
	async (target) => {
		const project = await equipmentFixture(),
			held = pending<void>(),
			storing = pending<void>();
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: project.manifest }, project });
		let first = true;
		mocks.put.mockImplementation(async (_store, key) => {
			if (key === 'studio-drafts' && first) {
				first = false;
				storing.resolve();
				await held.promise;
			}
		});
		const s = await import('../../src/studio/state.svelte.ts');
		s.doc.id = 'project';
		s.ui.anim = 'walk';
		const starting = s.startItem({ name: 'Hat', slot: 'head', prompt: 'a hat' });
		await storing.promise;
		if (target === 'another character') s.doc.id = 'other-project';
		if (target === 'another selection') s.ui.selected = 'another-item';
		held.resolve();
		await starting;
		expect(s.ui.anim).toBe(target === 'same character' ? 'rest' : 'walk');
		await vi.waitFor(() => expect(s.gens[0].phase).toBe('failed'));
	}
);
test('putting on an item the shown move has no frames for shows it standing instead of invisible', async () => {
	const project = await equipmentFixture(),
		m = project.manifest,
		body = m.items[0].layers[0],
		hat = m.items[1];
	// Standing and Walk bodies; the hat was made for standing only.
	m.rig.animations = [
		{ id: 'default', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] },
		{ id: 'walk', cells: 1, loop: true, frames: [{ cell: 0, ms: 100 }] }
	];
	body.cells = { default: body.cells!.rest, walk: body.cells!.rest };
	hat.layers[0].cells = { default: hat.layers[0].cells!.rest };
	hat.coverage = ['default/south/0'];
	const s = await import('../../src/studio/state.svelte.ts');
	s.store.project = project;
	s.doc.items = { body: 'base' };
	s.ui.anim = 'walk';
	s.wear('hat');
	expect(s.doc.items.head).toBe('hat');
	expect(s.ui.anim).toBe('default');
	// Taking it off changes no move, and neither does an item the shown move can show.
	s.ui.anim = 'walk';
	s.wear('hat');
	expect([s.doc.items.head, s.ui.anim]).toEqual([null, 'walk']);
	// Top-down and Side-scroller pick the move from movement, not from this choice: wearing there changes no state.
	const { experience } = await import('../../src/studio/experience/state.svelte.ts');
	for (const mode of ['topdown', 'side'] as const) {
		experience.mode = mode;
		s.wear('hat');
		expect([s.doc.items.head, s.ui.anim]).toEqual(['hat', 'walk']);
		s.wear('hat');
		expect([s.doc.items.head, s.ui.anim]).toEqual([null, 'walk']);
	}
	experience.mode = 'preview';
	hat.layers[0].cells!.walk = hat.layers[0].cells!.default;
	hat.coverage.push('walk/south/0');
	s.wear('hat');
	expect([s.doc.items.head, s.ui.anim]).toEqual(['hat', 'walk']);
});

const draftsSaved = () => mocks.put.mock.calls.filter(([, key]) => key === 'studio-drafts');

test('saving an outfit never replaces another one, including a default name after a deletion and the reserved current id', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	s.store.project = { manifest: fixtureManifest(), images: new Map() };
	s.doc.id = 'fixture:s2';
	s.savePreset('Outfit 2');
	s.savePreset('Outfit 2');
	s.savePreset('Adventurer');
	s.savePreset('Current');
	s.savePreset('鎧');
	const presets = s.store.project!.manifest.presets;
	expect(presets.map((p) => p.id)).toEqual([
		'adventurer',
		'base-only',
		'outfit-2',
		'outfit-2-2',
		'adventurer-2',
		'current-2',
		'outfit'
	]);
	expect(presets[0].name).toBe('Adventurer'); // the first (default) outfit keeps its place
});

test('Try again keeps the draft when Connect is closed without a key', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	const g = {
		draft: { spec: { id: 'hat' }, rigId: 'project', calls: [], log: [] },
		input: { name: 'Hat', slot: 'head', prompt: 'a hat' },
		phase: 'failed',
		status: ''
	} as unknown as (typeof s.gens)[number];
	s.gens.push(g);
	s.retryGen(g, 10);
	expect(s.ui.sheet).toBe('connect');
	s.clearPendingConnection();
	await Promise.resolve();
	expect(s.gens.map((x) => x.draft.spec.id)).toEqual(['hat']);
	expect(draftsSaved()).toHaveLength(0);
});

test('Clear finished waits for the stored drafts, so their records are kept', async () => {
	const stored = pending<unknown>();
	mocks.get.mockImplementation(async (_store, key) =>
		key === 'studio-drafts' ? stored.promise : undefined
	);
	const s = await import('../../src/studio/state.svelte.ts');
	const cleared = s.cleanUp(60_000, false);
	await new Promise((r) => setTimeout(r, 0));
	expect(mocks.clear).not.toHaveBeenCalled();
	void s.loadGens();
	stored.resolve({
		gens: [
			{
				draft: {
					spec: { id: 'hat' },
					rigId: 'project',
					calls: [{ recId: 'paid-call', old: [] }],
					log: []
				},
				input: { name: 'Hat', slot: 'head', prompt: 'a hat' },
				phase: 'failed',
				status: ''
			}
		]
	});
	await cleared;
	expect(mocks.clear).toHaveBeenCalled();
	for (const [keep] of mocks.clear.mock.calls)
		expect(keep({ id: 'paid-call', createdAt: 0 })).toBe(true);
});

test('Clear finished keeps all batches for pending State reviews, but not saved attempts', async () => {
	mocks.all.mockResolvedValue([
		{ id: 'rig-pending', stateGeneration: { token: 'pending', plan: { batches: [{}, {}] } } },
		{ id: 'rig-saved' }
	]);
	const s = await import('../../src/studio/state.svelte.ts');
	await s.cleanUp(0, false);
	const [[keep]] = mocks.clear.mock.calls;
	const record = (activityScope: string) => ({
		id: activityScope,
		tag: 'studio-state',
		activityScope,
		createdAt: 0
	});
	expect(keep(record('state:pending:0'))).toBe(true);
	expect(keep(record('state:pending:1'))).toBe(true);
	expect(keep(record('state:saved:0'))).toBe(false);
});

test('a failed read of the stored drafts is reported and a new item cannot overwrite them', async () => {
	mocks.get.mockImplementation(async (_store, key) => {
		if (key === 'studio-drafts') throw new Error('read failed');
		return undefined;
	});
	mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
	const s = await import('../../src/studio/state.svelte.ts');
	await expect(s.loadGens()).rejects.toThrow('read failed');
	await s.startItem({ name: 'Hat', slot: 'head', prompt: 'a hat' });
	expect(s.gens).toHaveLength(0);
	expect(draftsSaved()).toHaveLength(0);
	expect(s.ui.toast).toEqual(
		message('state.savedItemDraftsCouldNotBeRead', { reason: 'read failed' })
	);
	await expect(s.cleanUp(60_000, false)).rejects.toThrow('read failed');
	expect(mocks.clear).not.toHaveBeenCalled();
});

test('a character that cannot open says why before the demo replaces it', async () => {
	mocks.source.mockImplementation(async (id: string) => {
		throw new Error(id === 'rig-broken' ? 'broken record' : 'demo unavailable');
	});
	const s = await import('../../src/studio/state.svelte.ts');
	vi.spyOn(console, 'error').mockImplementation(() => {});
	await s.openProject('rig-broken');
	expect(s.ui.toast).toEqual(
		message('state.couldNotOpenThatCharacterError', { error: 'broken record' })
	);
});

test('an unreadable character list is reported instead of showing only the demo silently', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	vi.spyOn(console, 'error').mockImplementation(() => {});
	mocks.all.mockRejectedValue(new Error('storage unavailable'));
	await s.refreshProjects(); // listing throws
	expect(s.store.projects.map((p) => p.id)).toEqual([s.DEMO]);
	expect(s.ui.toast).toEqual(
		message('state.couldNotReadYourSavedCharactersReason', { reason: 'storage unavailable' })
	);
});

describe('move queue', () => {
	const idle = { id: 'idle', action: 'idle', frames: 4, items: [], seed: 1 },
		walk = { id: 'walk', action: 'walk', frames: 8, items: [], seed: 1 };
	const done = { warnings: [] };
	function storage() {
		const records = new Map<string, any>();
		mocks.put.mockImplementation(async (_store, id, value) => {
			records.set(id, structuredClone(value));
		});
		mocks.get.mockImplementation(async (_store, id) => structuredClone(records.get(id)));
		mocks.del.mockImplementation(async (_store, id) => {
			records.delete(id);
		});
		return records;
	}

	test('queued moves run one at a time in order, and the waiting ones are saved with the running move', async () => {
		const records = storage(),
			first = pending<typeof done>(),
			second = pending<typeof done>();
		mocks.move.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const queued = s.queueMoves('project', [idle, walk]);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		expect(mocks.move.mock.calls[0][1]).toMatchObject(idle);
		expect(s.moving.queued).toEqual([{ projectId: 'project', spec: walk }]);
		expect(records.get('studio-move')).toMatchObject({
			status: 'running',
			spec: idle,
			queued: [{ projectId: 'project', spec: walk }]
		});
		first.resolve(done);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
		expect(mocks.move.mock.calls[1][1]).toMatchObject(walk);
		expect(records.get('studio-move')).toMatchObject({ status: 'running', spec: walk, queued: [] });
		second.resolve(done);
		await queued;
		expect(records.has('studio-move')).toBe(false);
		expect(s.moving).toMatchObject({ spec: walk, done: true, queued: [] });
	});

	test('a move added while one runs waits; a failure holds the queue across reload until it is dismissed', async () => {
		const records = storage(),
			first = pending<typeof done>();
		mocks.move.mockReturnValueOnce(first.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const running = s.queueMoves('project', [idle]);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		await s.queueMoves('project', [walk]);
		expect(mocks.move).toHaveBeenCalledOnce();
		expect(records.get('studio-move')).toMatchObject({
			spec: idle,
			queued: [{ projectId: 'project', spec: walk }]
		});
		first.reject(new Error('Idle failed'));
		await running;
		expect(mocks.move).toHaveBeenCalledOnce();
		expect(records.get('studio-move')).toMatchObject({
			status: 'failed',
			spec: idle,
			queued: [{ projectId: 'project', spec: walk }]
		});
		vi.resetModules();
		const restored = await import('../../src/studio/state.svelte.ts');
		await restored.resumeMove();
		expect(mocks.move).toHaveBeenCalledOnce();
		expect(restored.moving).toMatchObject({
			spec: idle,
			error: 'Idle failed',
			queued: [{ projectId: 'project', spec: walk }]
		});
		await restored.dismissMove();
		expect(restored.moving.queued).toEqual([]);
		expect(records.has('studio-move')).toBe(false);
	});

	test('updating preserves a halted move and its stored queue, but waits for an unsaved change', async () => {
		const records = storage();
		const id = 'studio-move';
		records.set(id, {
			id,
			spec: idle,
			projectId: 'project',
			status: 'failed',
			error: 'Idle failed',
			queued: [{ projectId: 'project', spec: walk }]
		});
		const s = await import('../../src/studio/state.svelte.ts');
		await s.resumeMove();
		s.doc.loading = false;
		s.startupResumed();
		await expect(s.prepareForUpdate()).resolves.toBeUndefined();

		const reading = pending<void>(),
			read = pending<unknown>(),
			write = pending<void>();
		const saved = structuredClone(records.get(id));
		mocks.get.mockImplementationOnce(() => {
			reading.resolve();
			return read.promise;
		});
		mocks.put.mockReturnValueOnce(write.promise);
		const update = s.prepareForUpdate();
		await reading.promise;
		const adding = s.queueMoves('project', [{ ...walk, id: 'run' }]);
		read.resolve(saved);
		await expect(update).rejects.toThrow('could not confirm');
		write.resolve();
		await adding;
		expect(mocks.move).not.toHaveBeenCalled();
	});

	test('Adjust frame cannot invalidate a saved State generation attempt', async () => {
		const s = await import('../../src/studio/state.svelte.ts');
		s.doc.loading = false;
		mocks.load.mockResolvedValueOnce({ rec: { stateGeneration: { token: 'paid-state' } } });
		await expect(s.adjustCharacter('rig-project', { size: 96, dy: 0 })).rejects.toMatchObject({
			translation: { key: 'adjustFrame.errors.statePending' }
		});
	});

	test('a move queued while the last one finishes is started, not left waiting', async () => {
		const records = storage(),
			removing = pending<void>(),
			second = pending<typeof done>(),
			repair: MoveSpec = { ...idle, replace: true, dirs: ['east'] };
		mocks.del.mockImplementationOnce(async (_store, id) => {
			await removing.promise;
			records.delete(id);
		});
		mocks.move.mockResolvedValueOnce(done).mockReturnValueOnce(second.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const first = s.queueMoves('project', [repair]);
		await vi.waitFor(() => expect(mocks.del).toHaveBeenCalledOnce());
		expect(s.moving.done).toBe(true);
		expect(s.pendingMoves('project')).toEqual([expect.objectContaining(repair)]);
		const later = s.queueMoves('project', [walk]);
		removing.resolve();
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
		expect(mocks.move.mock.calls[1][1]).toMatchObject(walk);
		expect(s.pendingMoves('project')).toEqual([expect.objectContaining(walk)]);
		await later;
		expect(records.get('studio-move')).toMatchObject({ status: 'running', spec: walk, queued: [] });
		second.resolve(done);
		await first;
		expect(records.has('studio-move')).toBe(false);
	});

	test('queueing during the write of the next move never stores the finished one again or drops the new one', async () => {
		const records = storage(),
			held = pending<void>(),
			late = pending<void>(),
			second = pending<typeof done>(),
			jump = { ...walk, id: 'jump', action: 'jump' };
		let holding = true;
		mocks.put.mockImplementation(async (_store, id, value) => {
			if (holding && value.spec?.id === 'walk') {
				holding = false;
				await held.promise;
			} else if (
				value.spec?.id === 'idle' &&
				value.queued.some((q: { spec: { id: string } }) => q.spec.id === 'jump')
			)
				await late.promise; // a slow write of the queue
			records.set(id, structuredClone(value));
		});
		mocks.move.mockResolvedValueOnce(done).mockReturnValueOnce(second.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const run = s.queueMoves('project', [idle, walk]);
		await vi.waitFor(() => expect(holding).toBe(false)); // idle is done; the record that starts walk is being written
		const more = s.queueMoves('project', [jump]);
		held.resolve();
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
		late.resolve();
		await more;
		expect(records.get('studio-move')).toMatchObject({
			status: 'running',
			spec: walk,
			queued: [{ projectId: 'project', spec: jump }]
		});
		second.resolve(done);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(3));
		expect(mocks.move.mock.calls[2][1]).toMatchObject(jump);
		await run;
	});

	test('dismissing a failed move drops the queue of that character only; other characters go on', async () => {
		const records = storage();
		mocks.move.mockRejectedValueOnce(new Error('Idle failed')).mockResolvedValue(done);
		const s = await import('../../src/studio/state.svelte.ts');
		const other = { projectId: 'other', spec: { ...walk, id: 'walk' } };
		s.moving.queued = [];
		await s.queueMoves('project', [idle, walk]);
		await vi.waitFor(() => expect(s.moving.error).toBe('Idle failed'));
		s.moving.queued = [...s.moving.queued, other];
		await s.dismissMove();
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
		expect(mocks.move.mock.calls[1][0]).toBe('other'); // the other character's walk goes on; this one's queued walk is dropped
		await vi.waitFor(() => expect(records.has('studio-move')).toBe(false));
	});

	test('a move started while a dismissed one is cleared keeps the waiting move of another character', async () => {
		const records = storage(),
			clearing = pending<void>();
		mocks.move.mockRejectedValueOnce(new Error('Idle failed')).mockResolvedValue(done);
		const s = await import('../../src/studio/state.svelte.ts');
		await s.queueMoves('project', [idle]);
		await vi.waitFor(() => expect(s.moving.error).toBe('Idle failed'));
		s.moving.queued = [{ projectId: 'other', spec: walk }];
		const put = mocks.put.getMockImplementation()!,
			del = mocks.del.getMockImplementation()!;
		mocks.put.mockImplementationOnce(async (...args) => {
			await clearing.promise;
			return put(...args);
		});
		mocks.del.mockImplementationOnce(async (...args) => {
			await clearing.promise;
			return del(...args);
		});
		const dismissing = s.dismissMove();
		const repair = s.startMove('project', { ...idle, seed: 2 }); // e.g. an item repair, enabled again once the failed move is gone
		clearing.resolve();
		await dismissing;
		await repair;
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(3));
		expect(mocks.move.mock.calls.map((call) => call[0])).toEqual(['project', 'project', 'other']);
		await vi.waitFor(() => expect(records.has('studio-move')).toBe(false));
	});

	test('an interrupted queue resumes its running move and then the waiting one', async () => {
		const records = storage();
		mocks.move.mockResolvedValue(done);
		const s = await import('../../src/studio/state.svelte.ts');
		records.set('studio-move', {
			id: 'studio-move',
			spec: idle,
			projectId: 'project',
			status: 'running',
			requestText: s.REQUEST_TEXT,
			queued: [{ projectId: 'project', spec: walk }]
		});
		await s.resumeMove();
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledTimes(2));
		expect(mocks.move.mock.calls.map((call) => call[1].id)).toEqual(['idle', 'walk']);
		await vi.waitFor(() => expect(records.has('studio-move')).toBe(false));
	});

	test('restricted actions explain their numeric tier without reopening Connect or queuing work', async () => {
		storage();
		const { app } = await import('../../src/lib/app.svelte.ts');
		app.key = 'test-key';
		app.balance = {
			credits: { type: 'usd', usd: 0 },
			subscription: {
				type: 'generations',
				status: 'trial',
				plan: 'Free trial',
				generations: 0,
				total: 0
			}
		};
		const s = await import('../../src/studio/state.svelte.ts'),
			run = vi.fn();
		s.withKey(run, 1);
		expect(run).not.toHaveBeenCalled();
		expect(s.ui.sheet).not.toBe('connect');
		expect(s.ui.toast).toEqual(message('activity.planWait.tier', { tier: 1 }));
		app.balance.subscription = { ...app.balance.subscription, status: 'active', plan: 'Tier 1' };
		s.withKey(run, 2);
		expect(run).not.toHaveBeenCalled();
		expect(s.ui.toast).toEqual(message('activity.planWait.tier', { tier: 2 }));
		s.withKey(run);
		expect(run).toHaveBeenCalledOnce();
	});

	test('a paid action in a tab that does not run the jobs runs once this tab has taken over, explains a longer wait in Activity, and never runs once canceled', async () => {
		storage();
		const { app } = (await import('../../src/lib/app.svelte.ts')) as unknown as {
			app: { key: string };
		};
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { role: string };
		};
		app.key = 'test-key';
		queue.role = 'follower';
		try {
			const s = await import('../../src/studio/state.svelte.ts'),
				run = vi.fn();
			const notify = mocks.subscribe.mock.calls.at(-1)![0] as (snapshot: { role: string }) => void;
			// A takeover ends by resuming setup; its prune reads the same record once more.
			const setupReads = () =>
				mocks.get.mock.calls.filter(([, id]) => id === 'studio-setup').length;
			const lead = () => {
					queue.role = 'leader';
					notify({ role: 'leader' });
				},
				follow = () => {
					queue.role = 'follower';
					notify({ role: 'follower' });
				};
			await s.loadGens();
			// An idle leader tab hands over at once: the click waits quietly, without Activity, then runs.
			s.withKey(run);
			expect(run).not.toHaveBeenCalled();
			expect([s.ui.sheet, s.ui.waitingForTab]).toEqual([null, true]);
			expect(mocks.handoff).toHaveBeenLastCalledWith(true); // asks an idle leader tab to hand over now
			notify({ role: 'follower' });
			lead();
			await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
			expect([s.ui.sheet, s.ui.waitingForTab, mocks.handoff.mock.lastCall]).toEqual([
				null,
				false,
				[false]
			]);
			// A busy leader tab keeps the jobs: Activity explains the wait, and the click still runs on takeover.
			follow();
			s.withKey(run);
			await vi.waitFor(() => expect(s.ui.sheet).toBe('activity'), { timeout: 3000 });
			lead();
			await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
			// Canceled (Studio does so when the player leaves Activity): nothing runs on takeover.
			s.ui.sheet = null;
			follow();
			s.withKey(run);
			s.cancelWaitingForTab();
			expect(mocks.handoff).toHaveBeenLastCalledWith(false);
			const reads = setupReads();
			lead();
			await vi.waitFor(() => expect(setupReads()).toBeGreaterThanOrEqual(reads + 2)); // the takeover finished
			expect(run).toHaveBeenCalledTimes(2);
		} finally {
			queue.role = 'leader';
		}
	});

	test('a waiting Add move runs only after this tab resumed the running move of the closed tab, and queues behind it', async () => {
		const records = storage();
		// The old leader tab (now closed) was running idle with walk queued behind it.
		mocks.move.mockReturnValue(new Promise(() => {}));
		const { REQUEST_TEXT } = await import('../../src/studio/state.svelte.ts');
		records.set('studio-move', {
			id: 'studio-move',
			spec: idle,
			projectId: 'project',
			status: 'running',
			requestText: REQUEST_TEXT,
			queued: [{ projectId: 'project', spec: walk }]
		});
		vi.resetModules();
		const { app } = (await import('../../src/lib/app.svelte.ts')) as unknown as {
			app: { key: string };
		};
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { role: string };
		};
		app.key = 'test-key';
		queue.role = 'follower';
		try {
			const s = await import('../../src/studio/state.svelte.ts');
			const notify = mocks.subscribe.mock.calls.at(-1)![0] as (snapshot: { role: string }) => void;
			await s.loadGens();
			s.withKey(() => {
				void s.queueMoves('project', [{ ...walk, id: 'jump' }]);
			});
			queue.role = 'leader';
			notify({ role: 'leader' });
			await vi.waitFor(() =>
				expect(s.pendingMoves('project').map((m) => m.id)).toEqual(['idle', 'walk', 'jump'])
			);
			expect(mocks.move.mock.calls.map((c) => c[1].id)).toEqual(['idle']);
		} finally {
			queue.role = 'leader';
		}
	});

	test('a tab that handed the jobs over resumes the stored move of another tab when it leads again', async () => {
		const records = storage();
		mocks.move.mockReturnValue(new Promise(() => {}));
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { role: string };
		};
		try {
			const s = await import('../../src/studio/state.svelte.ts');
			const notify = mocks.subscribe.mock.calls.at(-1)![0] as (snapshot: { role: string }) => void;
			await s.loadGens();
			await s.resumeMove(); // Studio mount as leader
			queue.role = 'follower';
			notify({ role: 'follower' }); // handed the jobs to another tab
			records.set('studio-move', {
				id: 'studio-move',
				spec: idle,
				projectId: 'project',
				status: 'running',
				requestText: s.REQUEST_TEXT,
				queued: []
			});
			queue.role = 'leader';
			notify({ role: 'leader' }); // that tab closed mid-move
			await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		} finally {
			queue.role = 'leader';
		}
	});

	test('this tab never offers its jobs between queued moves or while Connect holds a paid action', async () => {
		const records = storage(),
			first = pending<typeof done>();
		mocks.move.mockReturnValueOnce(first.promise).mockReturnValue(new Promise(() => {}));
		const { app } = (await import('../../src/lib/app.svelte.ts')) as unknown as {
			app: { key: string };
		};
		const s = await import('../../src/studio/state.svelte.ts');
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { canYield: () => boolean };
		};
		void s.queueMoves('project', [idle, walk]);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		let between: boolean | undefined;
		mocks.put.mockImplementation(async (_store, id, value) => {
			if (id === 'studio-move' && value.spec?.id === 'walk' && between === undefined)
				between = queue.canYield();
			records.set(id, structuredClone(value));
		});
		first.resolve(done);
		await vi.waitFor(() => expect(between).toBe(false));
		vi.resetModules();
		storage();
		const t = await import('../../src/studio/state.svelte.ts');
		const { queue: q } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { canYield: () => boolean };
		};
		expect(q.canYield()).toBe(true);
		app.key = '';
		t.withKey(vi.fn()); // Connect waits with a paid action
		expect([t.ui.sheet, q.canYield()]).toEqual(['connect', false]);
	});

	const specA = {
		description: 'A body',
		name: 'A',
		seed: 1,
		size: 48,
		directions: [{ id: 'south' as const }],
		projectId: 'rig-a'
	};
	const specB = {
		description: 'B body',
		name: 'B',
		seed: 2,
		size: 48,
		directions: [{ id: 'south' as const }]
	};

	test('a create saved before explicit direction plans is removed at startup before resume', async () => {
		const records = storage();
		const { REQUEST_TEXT } = await import('../../src/studio/state.svelte.ts');
		records.set('studio-create', {
			id: 'studio-create',
			spec: {
				description: 'Old body',
				name: 'Old',
				seed: 1,
				size: 48,
				dirs: 4,
				projectId: 'rig-old'
			},
			status: 'running',
			requestText: REQUEST_TEXT
		});
		mocks.all.mockImplementation(async () => [...records.values()].map((r) => structuredClone(r)));
		vi.resetModules();
		const s = await import('../../src/studio/state.svelte.ts');
		await s.refreshProjects(); // Studio.svelte runs this before resumeCreate
		await s.resumeCreate();
		expect(mocks.create).not.toHaveBeenCalled();
		expect(records.has('studio-create')).toBe(false);
		expect(s.creates).toHaveLength(0);
		expect(s.ui.toast).toBe('Removed 1 saved item made by an earlier preview version.');
	});

	test('a waiting Create starts independently after takeover restores the closed tab create', async () => {
		const records = storage();
		mocks.create.mockReturnValue(new Promise(() => {}));
		const { REQUEST_TEXT } = await import('../../src/studio/state.svelte.ts');
		records.set('studio-create:rig-a', {
			id: 'studio-create:rig-a',
			spec: specA,
			status: 'running',
			requestText: REQUEST_TEXT
		});
		records.set('studio-create:rig-c', {
			id: 'studio-create:rig-c',
			spec: { ...specA, name: 'C', projectId: 'rig-rerolled-c', seed: 3 },
			status: 'running',
			requestText: REQUEST_TEXT
		});
		mocks.all.mockImplementation(async () => [...records.values()]);
		vi.resetModules();
		const { app } = (await import('../../src/lib/app.svelte.ts')) as unknown as {
			app: { key: string };
		};
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { role: string };
		};
		app.key = 'test-key';
		queue.role = 'follower';
		try {
			const s = await import('../../src/studio/state.svelte.ts');
			const notify = mocks.subscribe.mock.calls.at(-1)![0] as (snapshot: { role: string }) => void;
			await s.loadGens();
			let ran = false;
			s.withKey(() => {
				ran = true;
				void s.startCreate(specB, true);
			});
			queue.role = 'leader';
			notify({ role: 'leader' });
			await vi.waitFor(() => expect(ran).toBe(true));
			expect(s.creates.map((run) => [run.spec.name, String(run.error)])).toEqual([
				['A', ''],
				['C', ''],
				['B', '']
			]);
			await vi.waitFor(() =>
				expect(mocks.create.mock.calls.map((c) => c[0].name)).toEqual(['A', 'C', 'B'])
			);
			expect(s.createPresentation.id).toBe(s.creates.find((run) => run.spec.name === 'B')?.id);
			expect(records.get('studio-create:rig-a')?.spec.name).toBe('A');
			expect(records.get('studio-create:rig-c')?.spec.projectId).toBe('rig-rerolled-c');
		} finally {
			queue.role = 'leader';
		}
	});

	test('closing a Create form before the handoff notice cancels its waiting action', async () => {
		const s = await import('../../src/studio/state.svelte.ts');
		const { queue } = await import('../../src/lib/pixellab/queue.ts');
		queue.role = 'follower';
		try {
			s.ui.sheet = 'create';
			const create = vi.fn();
			s.withKey(create);
			expect(s.ui.waitingForTab).toBe(true);
			s.ui.sheet = null;
			s.ui.sheet = 'create';
			expect(s.ui.waitingForTab).toBe(false);
			queue.role = 'leader';
			s.startupResumed();
			expect(create).not.toHaveBeenCalled();
			expect(s.createPresentation.id).toBe('');
		} finally {
			queue.role = 'leader';
		}
	});

	test('a tab that leads before its drafts loaded runs a waiting click only after the startup resumes', async () => {
		const records = storage();
		mocks.create.mockReturnValue(new Promise(() => {}));
		const { REQUEST_TEXT } = await import('../../src/studio/state.svelte.ts');
		vi.resetModules();
		const drafts = pending<undefined>();
		mocks.get.mockImplementation(async (_store, id) =>
			id === 'studio-drafts' ? drafts.promise : structuredClone(records.get(id))
		);
		const { app } = (await import('../../src/lib/app.svelte.ts')) as unknown as {
			app: { key: string };
		};
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { role: string };
		};
		app.key = 'test-key';
		queue.role = 'follower';
		try {
			const s = await import('../../src/studio/state.svelte.ts');
			const notify = mocks.subscribe.mock.calls.at(-1)![0] as (snapshot: { role: string }) => void;
			const loaded = s.loadGens(); // Studio mount, still reading the drafts
			records.set('studio-create:rig-a', {
				id: 'studio-create:rig-a',
				spec: specA,
				status: 'running',
				requestText: REQUEST_TEXT
			}); // the other tab's create
			mocks.all.mockImplementation(async () => [...records.values()]);
			let ran = 0;
			s.withKey(() => {
				ran++;
				void s.startCreate(specB);
			});
			queue.role = 'leader';
			notify({ role: 'leader' }); // the other tab closed
			drafts.resolve(undefined);
			await loaded;
			notify({ role: 'leader' }); // a later queue update
			expect(ran).toBe(0);
			await s.resumeCreate();
			await s.resumeMove();
			await s.resumeSetup(); // Studio mount continues
			s.startupResumed();
			expect(ran).toBe(1);
			await vi.waitFor(() =>
				expect(mocks.create.mock.calls.map((c) => c[0].name)).toEqual(['A', 'B'])
			);
			expect(records.get('studio-create:rig-a')?.spec.name).toBe('A');
		} finally {
			queue.role = 'leader';
		}
	});

	test('Make item keeps the jobs in this tab from the click, before its draft exists', async () => {
		storage();
		const loading = pending<never>();
		mocks.load.mockReturnValue(loading.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { canYield: () => boolean };
		};
		await s.loadGens();
		void s.startItem({ slot: 'hat', prompt: 'hat', name: 'Hat' } as never);
		await new Promise((r) => setTimeout(r, 30));
		expect([s.gens.length, queue.canYield()]).toEqual([0, false]);
	});

	test('this tab offers its jobs to another tab only while none of its generation work runs', async () => {
		storage();
		const running = pending<typeof done>();
		mocks.move.mockReturnValueOnce(running.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { canYield: () => boolean };
		};
		expect(queue.canYield()).toBe(true);
		const queued = s.queueMoves('project', [idle]);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		expect(queue.canYield()).toBe(false);
		running.resolve(done);
		await queued;
		await vi.waitFor(() => expect(queue.canYield()).toBe(true));
	});

	test('moves already running or queued for an item are pending for it, so it is not offered them at a second price', async () => {
		storage();
		const running = pending<typeof done>();
		mocks.move.mockReturnValueOnce(running.promise);
		const s = await import('../../src/studio/state.svelte.ts');
		const queued = s.queueMoves('project', [
			{ ...idle, items: ['cape'] },
			walk,
			{ ...walk, id: 'jump', items: ['cape'] }
		]);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		void s.queueMoves('other', [{ ...walk, items: ['cape'] }]);
		expect(s.pendingMoves('project', 'cape').map((m) => m.id)).toEqual(['idle', 'jump']);
		expect(s.pendingMoves('project').map((m) => m.id)).toEqual(['idle', 'walk', 'jump']);
		running.resolve(done);
		await vi.waitFor(() =>
			expect(s.pendingMoves('project', 'cape').map((m) => m.id)).toEqual(['jump'])
		);
		await queued;
	});
});

type GenOf<S> = S extends { gens: (infer G)[] } ? G : never;
const draftGen = (id: string, rigId: string, phase = 'running') => ({
	draft: {
		spec: {
			id,
			name: 'New helm',
			slot: 'head',
			prompt: 'a new helm',
			key: 'green',
			anims: ['walk'],
			dirs: ['south']
		},
		rigId,
		calls: [],
		keySwitched: false,
		log: []
	},
	input: { name: 'New helm', slot: 'head', prompt: 'a new helm' },
	phase,
	status: ''
});

test('a worn draft overlays the outfit but never reaches autosave, undo or saved outfits; a saved item and discard clear it', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	s.store.project = { manifest: fixtureManifest(), images: new Map() };
	s.doc.id = 'fixture:s2';
	s.doc.items = { body: 'base', head: 'hat_wizard' };
	const g = draftGen('new_helm', 'fixture:s2') as unknown as GenOf<typeof s>;
	s.gens.push(g);
	s.wearDraft('new_helm');
	expect(s.doc.drafts).toEqual({ head: 'new_helm' });
	expect(s.doc.items).toEqual({ body: 'base', head: 'hat_wizard' });
	expect(s.ui.selected).toBe('gen:new_helm');
	s.setVariant('any-material', 'azure'); // an edit while the draft is worn: undo entry + autosave
	s.savePreset('With the draft on');
	await s.flushSave();
	const saved = mocks.put.mock.calls
		.filter(([, key]) => key === 'dress-fixture:s2')
		.map((c) => JSON.stringify(c[2]));
	expect(saved.length).toBeGreaterThan(0);
	for (const persisted of [
		...saved,
		JSON.stringify(s.doc.undo),
		JSON.stringify(s.store.project!.manifest)
	])
		expect(persisted).not.toContain('new_helm');
	expect(s.store.project!.manifest.presets.at(-1)!.items.head).toBe('hat_wizard');
	expect(s.doc.drafts).toEqual({ head: 'new_helm' }); // edits elsewhere keep it on
	s.wear('hat_wizard'); // the saved item shows again (it was worn under the draft)
	expect(s.doc.drafts).toEqual({});
	expect(s.doc.items.head).toBe('hat_wizard');
	s.wearDraft('new_helm');
	s.clearSlots(['head']);
	expect(s.doc.drafts).toEqual({});
	s.wearDraft('new_helm');
	expect(await s.discardGen(g)).toBe(true);
	expect(s.doc.drafts).toEqual({});
	s.gens.push(draftGen('other_rig', 'rig-other') as unknown as GenOf<typeof s>);
	s.wearDraft('other_rig'); // drafts of another character cannot be worn here
	expect(s.doc.drafts).toEqual({});
});

describe('accepted draft publication', () => {
	afterEach(() => vi.doUnmock('../../src/studio/itemRoute.ts'));

	async function setup() {
		const project = await equipmentFixture();
		const { SLOTS } = await import('../../src/lib/items/items.ts');
		project.manifest.items[0].regions = 'shirt-shorts';
		const saved = structuredClone(project),
			projectId = 'fixture:acceptance';
		const accept = vi.fn(async (draft: import('../../src/lib/items/run.ts').Draft) => {
			const item = {
				...structuredClone(project.manifest.items[1]),
				id: draft.spec.id,
				name: draft.spec.name,
				slot: draft.spec.slot,
				materials: []
			};
			saved.manifest.items = [...saved.manifest.items.filter((i) => i.id !== item.id), item];
			if (!saved.manifest.slots.some((slot) => slot.id === item.slot))
				saved.manifest.slots.push(structuredClone(SLOTS.find((slot) => slot.id === item.slot)!));
			draft.acceptedAt = new Date().toISOString(); // the real storage boundary marks this only after saveItem commits
			return item;
		});
		vi.doMock('../../src/studio/itemRoute.ts', async (original) => {
			const actual = await original<typeof import('../../src/studio/itemRoute.ts')>();
			return { ...actual, itemRoute: { ...actual.itemRoute, accept } };
		});
		mocks.load.mockResolvedValue({
			rec: { id: projectId, manifest: saved.manifest },
			project: saved
		});
		mocks.source.mockImplementation(async () => ({ project: structuredClone(saved) }));
		const s = await import('../../src/studio/state.svelte.ts');
		s.store.project = project;
		s.doc.id = projectId;
		s.doc.items = { body: 'base', head: 'hat' };
		s.ui.anim = 'rest';
		s.ui.dir = 'south';
		const drafts = [
			['new_hat', 'head'],
			['new_cape', 'back']
		].map(([id, slot]) => {
			const g = draftGen(id, projectId, 'review') as unknown as GenOf<typeof s>;
			g.draft.spec.slot = slot;
			g.draft.spec.anims = ['rest'];
			g.input.slot = slot;
			const item = {
				...structuredClone(project.manifest.items[1]),
				id,
				slot,
				status: 'draft' as const
			};
			s.store.results[id] = {
				cells: [],
				qa: null,
				g1: new Map(),
				preview: {
					...project,
					manifest: { ...project.manifest, items: [...project.manifest.items, item] }
				}
			};
			s.gens.push(g);
			s.wearDraft(id);
			return g;
		});
		return { s, project, saved, drafts, accept };
	}

	test.each([false, true])(
		'superseded acceptance retains both worn drafts until their saved project is published (auto=%s)',
		async (auto) => {
			const { s, project, saved, drafts, accept } = await setup();
			const firstRead = pending<{ project: typeof project }>(),
				secondRead = pending<{ project: typeof project }>();
			mocks.source
				.mockReset()
				.mockReturnValueOnce(firstRead.promise)
				.mockReturnValueOnce(secondRead.promise);
			const first = s.acceptGen(drafts[0], auto);
			await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledTimes(1));
			const firstSnapshot = structuredClone(saved);
			const second = s.acceptGen(drafts[1], auto);
			await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledTimes(2));
			firstRead.resolve({ project: firstSnapshot });
			expect(await first).toBe(true);
			expect(s.store.project).toBe(project);
			expect(s.gens.map((g) => g.draft.spec.id)).toEqual(['new_hat', 'new_cape']);
			expect(s.doc.drafts).toEqual({ head: 'new_hat', back: 'new_cape' });
			for (const g of drafts)
				expect(
					s.store.results[g.draft.spec.id]?.preview?.manifest.items.some(
						(i) => i.id === g.draft.spec.id
					)
				).toBe(true);
			secondRead.resolve({ project: structuredClone(saved) });
			expect(await second).toBe(true);
			expect(s.doc.items).toMatchObject({ head: 'new_hat', back: 'new_cape' });
			expect(s.doc.drafts).toEqual({});
			expect(s.gens).toHaveLength(0);
			expect(accept).toHaveBeenCalledTimes(2);
			expect(s.doc.error).toBe('');
			expect(
				mocks.put.mock.calls.filter(([, key]) => key === 'dress-fixture:acceptance').at(-1)![2]
					.current.items
			).toMatchObject({ head: 'new_hat', back: 'new_cape' });
			expect(
				draftsSaved().map(([, , snapshot]) =>
					snapshot.gens.map((g: GenOf<typeof s>) => g.draft.spec.id)
				)
			).toEqual([['new_cape'], []]);
		}
	);

	test('failed draft-ledger persistence keeps the saved draft visible and later snapshots exclude it', async () => {
		const { s, project, saved, drafts, accept } = await setup();
		mocks.put.mockImplementationOnce(async () => {
			throw new Error('Draft ledger unavailable');
		});
		await expect(s.acceptGen(drafts[0], true)).rejects.toThrow('Draft ledger unavailable');
		expect(drafts[0].draft.acceptedAt).toBeTypeOf('string');
		expect(saved.manifest.items.some((i) => i.id === 'new_hat')).toBe(true);
		expect(s.store.project).toBe(project);
		expect(s.gens).toEqual(drafts);
		expect(s.doc.drafts.head).toBe('new_hat');
		expect(s.store.results.new_hat?.preview?.manifest.items.some((i) => i.id === 'new_hat')).toBe(
			true
		);
		expect(mocks.source).not.toHaveBeenCalled();
		// An independent draft action must not repersist the accepted one while its preview remains in memory.
		expect(await s.discardGen(drafts[1])).toBe(true);
		expect(draftsSaved().at(-1)![2].gens).toEqual([]);
		expect(s.gens).toEqual([drafts[0]]);
		expect(await s.acceptGen(drafts[0], true)).toBe(true);
		expect(s.gens).toHaveLength(0);
		expect(s.doc.items.head).toBe('new_hat');
		expect(saved.manifest.items.filter((i) => i.id === 'new_hat')).toHaveLength(1);
		expect(accept).toHaveBeenCalledTimes(2);
	});
});

describe('optional review', () => {
	const clean = {
		cells: [{}],
		qa: {
			qa: { status: 'pass' },
			failCalls: new Map(),
			softCalls: new Map(),
			warnings: [] as string[]
		},
		g1: new Map(),
		preview: null
	};
	function routeMock(
		result: (
			d: unknown,
			ctx: unknown,
			h: { result?: (r: unknown) => void; signal?: AbortSignal; persist?: () => Promise<unknown> }
		) => Promise<unknown>,
		price = () => 10
	) {
		const accept = vi.fn(async (d: { spec: { id: string }; acceptedAt?: string }) => {
			d.acceptedAt = new Date().toISOString();
			return { id: d.spec.id, name: 'New helm', slot: 'head' };
		});
		vi.doMock('../../src/studio/itemRoute.ts', () => ({
			itemRoute: {
				plan: () => ({ gens: price(), calls: 1, cells: 1, minutes: 1, minimumTier: 1 }),
				draft: (
					ctx: { rec: { id: string } },
					input: { name: string; slot: string },
					taken: string[]
				) => ({
					spec: {
						id: `helm${taken.length}`,
						name: input.name,
						slot: input.slot,
						prompt: 'a new helm',
						key: 'green',
						anims: [],
						dirs: []
					},
					rigId: ctx.rec.id,
					calls: [],
					keySwitched: false,
					log: []
				}),
				run: result,
				accept
			}
		}));
		vi.doMock('../../src/lib/dress/regions.ts', () => ({
			splitBase: async () => ({ dirty: false })
		}));
		vi.doMock('../../src/lib/dress/dress.ts', async (original) => ({
			...(await original<typeof import('../../src/lib/dress/dress.ts')>()),
			deriveMaterials: () => {}
		}));
		return accept;
	}
	afterEach(() => {
		vi.doUnmock('../../src/studio/itemRoute.ts');
		vi.doUnmock('../../src/lib/dress/regions.ts');
		vi.doUnmock('../../src/lib/dress/dress.ts');
	});

	test('another draft cannot save cancellation as complete before its ledger writes commit', async () => {
		const hooks: import('../../src/lib/items/run.ts').RunHooks[] = [];
		routeMock((_draft, _ctx, hook) => {
			hooks.push(hook);
			return new Promise((resolve) =>
				hook.signal!.addEventListener('abort', () => resolve(null), { once: true })
			);
		});
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		const state = await import('../../src/studio/state.svelte.ts');
		state.doc.id = 'project';
		await state.startItem({ name: 'A', slot: 'head', prompt: 'a helm' });
		await vi.waitFor(() => expect(hooks).toHaveLength(1));
		const generation = state.gens[0],
			write = pending<void>();
		const other = structuredClone(generation);
		other.draft.spec.id = 'other-draft';
		other.phase = 'failed';
		state.gens.push(other);
		generation.draft.calls.push({
			recId: 'cancel-record',
			old: [],
			cells: ['rest/south/0'],
			seed: 1,
			rerolls: 0,
			kind: 'dress'
		});
		mocks.cancelScoped.mockReturnValueOnce(write.promise);
		const cancel = state.cancelGen(generation);
		const failure = expect(cancel).rejects.toThrow('Ledger unavailable');
		await vi.waitFor(() => expect(mocks.cancelScoped).toHaveBeenCalled());
		let snapshot: { gens: { phase: string; canceled?: boolean }[] } | undefined;
		mocks.put.mockImplementation(async (_store, key, value) => {
			if (key === 'studio-drafts') snapshot = structuredClone(value);
		});
		await state.discardGen(other);
		expect(snapshot!.gens[0]).toMatchObject({ phase: 'running' });
		expect(snapshot!.gens[0].canceled).toBeUndefined();
		write.reject(new Error('Ledger unavailable'));
		await failure;
		expect(generation.cancelSaveFailed).toBe(true);
		mocks.cancelScoped.mockResolvedValue(undefined);
		expect(await state.cancelGen(generation)).toBe(true);
		expect(snapshot!.gens[0]).toMatchObject({ phase: 'failed', canceled: true });
	});

	test('a clean draft saves itself in place: the worn slot keeps it, undo and the view stay', async () => {
		const done = pending<typeof clean>(),
			accept = routeMock(() => done.promise);
		const manifest = fixtureManifest();
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
		const saved = fixtureManifest();
		saved.items.push({
			...saved.items.find((i: { id: string }) => i.id === 'hat_wizard'),
			id: 'helm0',
			name: 'New helm'
		});
		mocks.update.mockImplementation(async (_store, _id, update) =>
			update({ id: 'project', manifest: structuredClone(saved) })
		);
		mocks.source.mockResolvedValue({
			project: { manifest: saved, images: new Map() },
			current: { items: { body: 'base' }, variants: {} }
		});
		const s = await import('../../src/studio/state.svelte.ts');
		s.store.project = { manifest, images: new Map() };
		s.doc.id = 'project';
		s.doc.items = { body: 'base', head: 'hat_wizard' };
		const earlierEdit = { key: 'history.changeColor' } as const;
		s.doc.undo = [{ label: earlierEdit, snap: '{}' }];
		s.ui.anim = 'walk';
		s.ui.frame = 3;
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		s.wearDraft('helm0');
		done.resolve(clean);
		await vi.waitFor(() =>
			expect(s.ui.toast).toEqual(message('state.nameSaved', { name: 'New helm' }))
		);
		expect(accept).toHaveBeenCalledOnce();
		expect(s.gens).toHaveLength(0);
		expect(s.doc.items.head).toBe('helm0');
		expect(s.doc.drafts).toEqual({});
		expect(s.store.project!.manifest).toBe(saved);
		expect(s.doc.undo.map((u) => u.label)).toEqual([earlierEdit]);
		expect(s.ui).toMatchObject({ selected: 'helm0', frame: 3 });
	});

	test('a saved item never queues paid poses on its own (missing moves are a priced offer)', async () => {
		routeMock(async () => clean);
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		mocks.source.mockResolvedValue({
			project: { manifest: fixtureManifest(), images: new Map() },
			current: { items: { body: 'base' }, variants: {} }
		});
		const s = await import('../../src/studio/state.svelte.ts');
		s.doc.id = 'project';
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		await vi.waitFor(() =>
			expect(s.ui.toast).toEqual(message('state.nameSaved', { name: 'New helm' }))
		);
		expect(mocks.move).not.toHaveBeenCalled();
		expect(s.moving.queued).toEqual([]);
	});

	test('a warned draft stays a draft with its review; nothing is saved for it', async () => {
		const accept = routeMock(async () => ({
			...clean,
			qa: {
				...clean.qa,
				warnings: ['R1 idle/east: dressed item pasted on 2 near-rest frames; check that it moves']
			}
		}));
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		const s = await import('../../src/studio/state.svelte.ts');
		s.doc.id = 'project';
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		await vi.waitFor(() =>
			expect(s.ui.toast).toEqual(message('state.nameHasIssuesToReviewNoPaid', { name: 'New helm' }))
		);
		expect(s.gens.map((g) => g.phase)).toEqual(['review']);
		expect(accept).not.toHaveBeenCalled();
	});

	test.each(['dismiss', 'open'] as const)(
		'quality notification %s never accepts an item or starts another attempt',
		async (action) => {
			const result = {
				...clean,
				qa: { ...clean.qa, warnings: ['G12 walk/south/0: footwear differs'] }
			};
			const run = vi.fn(async () => result),
				accept = routeMock(run),
				manifest = fixtureManifest();
			mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
			mocks.source.mockResolvedValue({
				project: { manifest, images: new Map() },
				current: { items: { body: 'base' }, variants: {} }
			});
			const s = await import('../../src/studio/state.svelte.ts');
			s.doc.id = 'project';
			s.store.project = { manifest, images: new Map() };
			await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
			await vi.waitFor(() => expect(s.gens[0]?.phase).toBe('review'));
			await vi.waitFor(() => expect(s.ui.toastAction).toBeTypeOf('function'));
			s.ui.selected = '';
			s.ui.tab = 'moves';
			s.ui.sheet = 'activity';
			if (action === 'dismiss') s.dismissToast();
			else await s.activateToast();
			expect(run).toHaveBeenCalledOnce();
			expect(accept).not.toHaveBeenCalled();
			expect(s.gens.map((g) => g.phase)).toEqual(['review']);
			if (action === 'open')
				expect(s.ui).toMatchObject({
					selected: 'gen:helm0',
					tab: 'wardrobe',
					sheet: 'gen'
				});
			else expect(s.ui.selected).toBe('');
		}
	);

	test('an explicitly priced retry creates exactly one fresh attempt and leaves any new warning for review', async () => {
		const run = vi.fn(async () => ({
			...clean,
			qa: { ...clean.qa, warnings: ['G12 walk/south/0: footwear differs'] }
		}));
		const accept = routeMock(run),
			manifest = fixtureManifest();
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
		const s = await import('../../src/studio/state.svelte.ts'),
			{ app } = await import('../../src/lib/app.svelte.ts');
		s.doc.id = 'project';
		s.store.project = { manifest, images: new Map() };
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		await vi.waitFor(() => expect(s.gens[0]?.phase).toBe('review'));
		const original = s.gens[0];
		app.key = 'synthetic-retry-key';
		s.retryGen(original, 10);
		await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(s.gens[0]?.phase).toBe('review'));
		expect(s.gens.map((g) => g.draft.spec.id)).toEqual(['helm1']);
		expect(accept).not.toHaveBeenCalled();
	});

	test('a retry carrying a measured key starts a fresh attempt with that key', async () => {
		// 2026-11-07 review: the consent check compared inputs exactly, so adding the measured key refused every such retry.
		const run = vi.fn(async () => ({
			...clean,
			qa: { ...clean.qa, warnings: ['G12 walk/south/0: footwear differs'] },
			retryKey: 'magenta' as const
		}));
		routeMock(run);
		const manifest = fixtureManifest();
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
		const s = await import('../../src/studio/state.svelte.ts'),
			{ app } = await import('../../src/lib/app.svelte.ts');
		s.doc.id = 'project';
		s.store.project = { manifest, images: new Map() };
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		await vi.waitFor(() => expect(s.gens[0]?.phase).toBe('review'));
		const original = s.gens[0];
		app.key = 'synthetic-retry-key';
		s.retryGen(original, 10, 'magenta');
		await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
		expect(s.gens.map((g) => g.input.key)).toEqual(['magenta']);
	});

	test.each(['target', 'price', 'rig', 'input', 'draft'] as const)(
		'a deferred retry refuses changed %s without discarding the reviewed item',
		async (changed) => {
			let price = 10;
			const run = vi.fn(async () => ({
				...clean,
				qa: { ...clean.qa, warnings: ['G12 walk/south/0: footwear differs'] }
			}));
			const accept = routeMock(run, () => price),
				manifest = fixtureManifest();
			mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
			const s = await import('../../src/studio/state.svelte.ts');
			s.doc.id = 'project';
			s.store.project = { manifest, images: new Map() };
			await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
			await vi.waitFor(() => expect(s.gens[0]?.phase).toBe('review'));
			const { app } = await import('../../src/lib/app.svelte.ts');
			app.key = '';
			await vi.waitFor(() =>
				expect(s.ui.toast).toEqual(
					message('state.nameHasIssuesToReviewNoPaid', { name: 'New helm' })
				)
			);
			const original = s.gens[0];
			s.retryGen(original, 10);
			expect(s.ui.sheet).toBe('connect');
			if (changed === 'target') s.doc.id = 'other-project';
			if (changed === 'price') price = 20;
			if (changed === 'rig') manifest.rig.baseHash = 'changed-body';
			if (changed === 'input') original.input.prompt = 'different hat';
			if (changed === 'draft') original.draft.log.push('Artwork changed in another tab');
			s.connected();
			await vi.waitFor(() =>
				expect(s.ui.toast).toEqual(
					message(
						changed === 'price'
							? 'state.theAttemptPriceChangedReviewTheCurrent'
							: 'state.thisCharacterOrItemChangedReopenIt'
					)
				)
			);
			expect(run).toHaveBeenCalledOnce();
			expect(accept).not.toHaveBeenCalled();
			expect(s.gens).toEqual([original]);
			expect(original.phase).toBe('review');
		}
	);

	test.each([false, true])(
		'a follower retry revalidates rehydrated draft content after handoff (changed: %s)',
		async (changed) => {
			const run = vi.fn(async () => ({
				...clean,
				qa: { ...clean.qa, warnings: ['G12 walk/south/0: footwear differs'] }
			}));
			const accept = routeMock(run),
				manifest = fixtureManifest();
			const saved = { ...draftGen('helm0', 'project', 'failed'), requestText: 3 };
			mocks.get.mockImplementation(async (_store, key) =>
				key === 'studio-drafts' ? { gens: [structuredClone(saved)] } : undefined
			);
			mocks.load.mockResolvedValue({ rec: { id: 'project', manifest } });
			const s = await import('../../src/studio/state.svelte.ts');
			const { app } = await import('../../src/lib/app.svelte.ts');
			const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
				queue: { role: string };
			};
			queue.role = 'follower';
			app.key = 'synthetic-retry-key';
			try {
				s.doc.id = 'project';
				s.store.project = { manifest, images: new Map() };
				await s.loadGens();
				const original = s.gens[0];
				s.retryGen(original, 10);
				expect(s.ui.waitingForTab).toBe(true);
				if (changed) (saved.draft.log as string[]).push('The saved artwork changed');
				queue.role = 'leader';
				mocks.subscribe.mock.calls.at(-1)![0]({ role: 'leader' });
				if (changed) {
					await vi.waitFor(() =>
						expect(s.ui.toast).toEqual(message('state.thisCharacterOrItemChangedReopenIt'))
					);
					expect(run).not.toHaveBeenCalled();
					expect(s.gens[0]).not.toBe(original);
					expect(s.gens[0].draft.log).toEqual(saved.draft.log);
				} else {
					await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
					await vi.waitFor(() => expect(s.gens[0]?.phase).toBe('review'));
					expect(s.gens.map((g) => g.draft.spec.id)).toEqual(['helm1']);
				}
				expect(accept).not.toHaveBeenCalled();
			} finally {
				queue.role = 'leader';
			}
		}
	);

	test('a worn draft that fails comes off, so the item under it shows again', async () => {
		const done = pending<null>();
		routeMock(() => done.promise);
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		const s = await import('../../src/studio/state.svelte.ts');
		s.doc.id = 'project';
		s.doc.items = { body: 'base', head: 'hat_wizard' };
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		s.wearDraft('helm0');
		expect(s.doc.drafts).toEqual({ head: 'helm0' });
		done.resolve(null);
		await vi.waitFor(() => expect(s.gens[0].phase).toBe('failed'));
		expect(s.doc.drafts).toEqual({});
		expect(s.doc.items.head).toBe('hat_wizard');
	});

	test('a draft discarded while it runs keeps no late preview and never saves itself', async () => {
		const done = pending<typeof clean>();
		let hooks: { result?: (r: unknown) => void } | undefined;
		const accept = routeMock((_d, _ctx, h) => {
			hooks = h;
			return done.promise;
		});
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		const s = await import('../../src/studio/state.svelte.ts');
		s.doc.id = 'project';
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		await vi.waitFor(() => expect(hooks).toBeDefined());
		expect(await s.discardGen(s.gens[0])).toBe(true);
		hooks!.result!(clean); // a preview that lands after the discard
		done.resolve(clean);
		await new Promise((r) => setTimeout(r, 50));
		expect(s.store.results).toEqual({});
		expect(accept).not.toHaveBeenCalled();
	});

	test('a draft saving itself never cancels the open of another character', async () => {
		const done = pending<typeof clean>(),
			other = pending<unknown>(),
			accept = routeMock(() => done.promise);
		const opened = () => ({
			project: { manifest: fixtureManifest(), images: new Map() },
			current: { items: { body: 'base' }, variants: {} }
		});
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		mocks.source.mockImplementation(async (id: string) =>
			id === 'other' ? other.promise : opened()
		);
		const s = await import('../../src/studio/state.svelte.ts');
		s.store.project = { manifest: fixtureManifest(), images: new Map() };
		s.doc.id = 'project';
		s.doc.items = { body: 'base' };
		await s.startItem({ name: 'New helm', slot: 'head', prompt: 'a new helm' });
		const opening = s.openProject('other'); // the user picks another character while the draft finishes
		done.resolve(clean);
		await vi.waitFor(() =>
			expect(s.ui.toast).toEqual(message('state.nameSaved', { name: 'New helm' }))
		);
		expect(accept).toHaveBeenCalledOnce();
		other.resolve(opened());
		await opening;
		expect(s.doc.id).toBe('other');
	});

	const opened = () => ({
		project: { manifest: fixtureManifest(), images: new Map() },
		current: { items: { body: 'base' }, variants: {} }
	});
	const finished = { id: 'cross-punch', action: 'cross-punch', frames: 4, items: [], seed: 1 }; // a move the fixture has, so the view could switch to it
	test.each(['move', 'item poses', 'setup'] as const)(
		'a %s finishing never cancels the open of another character',
		async (kind) => {
			routeMock(async () => null); // only for the mocked base split
			const other = pending<unknown>();
			mocks.source.mockImplementation(async (id: string) =>
				id === 'other' ? other.promise : opened()
			);
			mocks.move.mockResolvedValue({ warnings: [] });
			mocks.setup.mockResolvedValue(undefined);
			const s = await import('../../src/studio/state.svelte.ts');
			s.store.project = { manifest: fixtureManifest(), images: new Map() };
			s.doc.id = 'project';
			s.doc.items = { body: 'base' };
			s.ui.anim = 'walk';
			const opening = s.openProject('other'); // the user picks another character while the work finishes
			if (kind === 'setup')
				await s.startSetup({
					projectId: 'project',
					baseHash: 'sha256:' + 'a'.repeat(64),
					restAnim: 'idle',
					looks: 'body',
					seed: 1
				});
			else
				await s.startMove('project', {
					...finished,
					...(kind === 'item poses' ? { itemsOnly: true } : {})
				});
			other.resolve(opened());
			await opening;
			expect(s.doc.id).toBe('other');
			expect(mocks.source.mock.calls.map((call) => call[0])).toEqual(['other']);
			expect(s.ui.anim).toBe('walk');
		}
	);

	test('a character picked while a finished move reloads its own keeps the move from switching the view', async () => {
		routeMock(async () => null); // only for the mocked base split
		const reload = pending<unknown>();
		mocks.source.mockImplementation(async (id: string) =>
			id === 'project' ? reload.promise : opened()
		);
		mocks.move.mockResolvedValue({ warnings: [] });
		const s = await import('../../src/studio/state.svelte.ts');
		s.store.project = { manifest: fixtureManifest(), images: new Map() };
		s.doc.id = 'project';
		s.doc.items = { body: 'base' };
		s.ui.anim = 'walk';
		const run = s.startMove('project', finished);
		await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce());
		const opening = s.openProject('other');
		reload.resolve(opened());
		await run;
		await opening;
		expect(s.doc.id).toBe('other');
		expect(s.ui.anim).toBe('walk');
	});

	test('a character opens on its standing move, where what it wears is shown', async () => {
		routeMock(async () => null); // only for the mocked base split
		const standing = opened();
		standing.project.manifest.rig.animations.push({
			id: 'default',
			cells: 1,
			loop: true,
			frames: [{ cell: 0, ms: 100 }]
		});
		mocks.source.mockImplementation(async (id: string) =>
			id === 'standing' ? standing : opened()
		);
		const s = await import('../../src/studio/state.svelte.ts');
		await s.openProject('standing');
		expect(s.ui.anim).toBe('default');
		// Reopening the same character keeps the move being looked at.
		s.ui.anim = 'walk';
		await s.openProject('standing');
		expect(s.ui.anim).toBe('walk');
		// Another character starts standing again, whatever move the last one showed: one without Default opens on Walk.
		mocks.source.mockImplementation(async () => standing);
		await s.openProject('standing-too');
		expect(s.ui.anim).toBe('default');
		mocks.source.mockImplementation(async () => opened());
		s.ui.anim = 'cross-punch';
		await s.openProject('other');
		expect(s.ui.anim).toBe('walk');
	});

	test('an edit made while the open character reloads in place is kept', async () => {
		routeMock(async () => null); // only for the mocked base split
		const first = pending<unknown>(),
			stored = fixtureManifest();
		mocks.source
			.mockReturnValueOnce(first.promise)
			.mockImplementationOnce(async () => ({ project: { manifest: stored, images: new Map() } }));
		const s = await import('../../src/studio/state.svelte.ts');
		s.store.project = { manifest: fixtureManifest(), images: new Map() };
		s.doc.id = 'fixture:s2';
		s.doc.items = { body: 'base' };
		const reload = s.openProject('fixture:s2', { quiet: true }); // e.g. a draft saved itself
		await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce());
		s.savePreset('Made during the reload'); // after the read: storage has it once saved, the copy being read does not
		stored.presets = structuredClone(s.store.project.manifest.presets);
		first.resolve({ project: { manifest: fixtureManifest(), images: new Map() } });
		await reload;
		expect(s.store.project.manifest.presets.map((p: { name: string }) => p.name)).toContain(
			'Made during the reload'
		);
	});

	test('a rename broadcast during a character switch prevents opening stale export metadata', async () => {
		routeMock(async () => null);
		vi.stubGlobal('addEventListener', vi.fn());
		vi.stubGlobal('removeEventListener', vi.fn());
		vi.stubGlobal('document', {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			documentElement: { dataset: {}, style: {} }
		});
		const channel = { onmessage: (_event: MessageEvent) => {}, close: vi.fn() };
		vi.stubGlobal(
			'BroadcastChannel',
			vi.fn(function () {
				return channel;
			})
		);
		const first = pending<unknown>();
		const stale = opened();
		const latest = opened();
		latest.project.manifest.name = 'Renamed while opening';
		latest.project.manifest.exportId = 'new_character_id';
		mocks.source.mockReturnValueOnce(first.promise).mockResolvedValueOnce(latest);
		const s = await import('../../src/studio/state.svelte.ts');
		const dispose = s.initUi();
		try {
			s.doc.id = 'previous';
			const opening = s.openProject('next');
			await vi.waitFor(() => expect(mocks.source).toHaveBeenCalledOnce());
			channel.onmessage(new MessageEvent('message', { data: { projectId: 'next' } }));
			first.resolve(stale);
			await opening;
			expect(s.doc.id).toBe('next');
			expect(s.store.project?.manifest).toMatchObject({
				name: 'Renamed while opening',
				exportId: 'new_character_id'
			});
		} finally {
			dispose();
		}
	});
});

test('a worn draft saved or discarded in another tab comes off when the drafts are read', async () => {
	mocks.get.mockImplementation(async (_store, key) =>
		key === 'studio-drafts' ? { gens: [] } : undefined
	);
	const s = await import('../../src/studio/state.svelte.ts');
	s.doc.drafts = { head: 'saved_elsewhere' };
	await s.loadGens();
	expect(s.doc.drafts).toEqual({});
});

test('notifications preserve description-only calls, optional titles and persistent errors', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	vi.useFakeTimers();
	try {
		s.toast('Preview details', { title: 'Preview', tone: 'warning', duration: 0 });
		vi.advanceTimersByTime(60_000);
		expect(s.ui.toast).toBe('Preview details');
		expect(s.ui.toastTitle).toBe('Preview');
		s.toast('Saved changes');
		expect(s.ui.toastTitle).toBe('');
		expect(s.ui.toastTone).toBe('info');
		vi.advanceTimersByTime(3999);
		expect(s.ui.toast).toBe('Saved changes');
		vi.advanceTimersByTime(1);
		expect(s.ui.toast).toBe('');
		s.toast('Could not save', { tone: 'danger' });
		vi.advanceTimersByTime(60_000);
		expect(s.ui.toast).toBe('Could not save');
		s.dismissToast();
		s.toast('Legacy duration', 8000);
		vi.advanceTimersByTime(7999);
		expect(s.ui.toast).toBe('Legacy duration');
		vi.advanceTimersByTime(1);
		expect(s.ui.toast).toBe('');
	} finally {
		s.dismissToast();
		vi.useRealTimers();
	}
});

test('unresolved errors reject lower-priority messages without changing their content, timer or pauses', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	vi.useFakeTimers();
	try {
		expect(
			s.toast('Could not save', { title: 'Storage unavailable', tone: 'danger', duration: 8000 })
		).toBe(true);
		vi.advanceTimersByTime(1000);
		s.pauseToast('focus');
		const original = { ...s.ui };
		for (const options of [
			undefined,
			100,
			{ tone: 'info' },
			{ tone: 'success' },
			{ tone: 'warning', duration: 0 }
		] as const) {
			expect(s.toast('Lower-priority feedback', options)).toBe(false);
			expect(s.ui).toEqual(original);
		}
		vi.advanceTimersByTime(60_000);
		expect(s.ui.toast).toBe('Could not save');
		s.resumeToast('focus');
		vi.advanceTimersByTime(6999);
		expect(s.ui.toast).toBe('Could not save');
		vi.advanceTimersByTime(1);
		expect(s.ui.toast).toBe('');
		expect(s.toast('Saved changes')).toBe(true);
		expect(s.toast('Could not export', { tone: 'danger' })).toBe(true);
		expect(s.toast('Could not import', { tone: 'danger' })).toBe(true);
		expect(s.ui.toast).toBe('Could not import');
		expect(s.toast('Saved changes')).toBe(false);
		s.dismissToast();
		expect(s.toast('Deferred warning', { tone: 'warning' })).toBe(true);
		expect(s.ui.toast).toBe('Deferred warning');
	} finally {
		s.dismissToast();
		vi.useRealTimers();
	}
});

test('pending indicators preserve normal toast timeouts and clear on replacement or dismissal', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	vi.useFakeTimers();
	try {
		s.toast('Preparing download...', { pending: true });
		vi.advanceTimersByTime(3999);
		expect(s.ui.toast).toBe('Preparing download...');
		expect(s.ui.toastPending).toBe(true);
		vi.advanceTimersByTime(1);
		expect(s.ui.toast).toBe('');
		expect(s.ui.toastPending).toBe(false);
		s.toast('Preparing download...', { pending: true, duration: 8000 });
		vi.advanceTimersByTime(7999);
		expect(s.ui.toastPending).toBe(true);
		vi.advanceTimersByTime(1);
		expect(s.ui.toast).toBe('');
		expect(s.ui.toastPending).toBe(false);
		s.toast('Preparing download...', { pending: true });
		s.toast('Downloaded character.zip');
		expect(s.ui.toastPending).toBe(false);
		vi.advanceTimersByTime(4000);
		expect(s.ui.toast).toBe('');
		s.toast('Preparing download...', { pending: true });
		s.dismissToast();
		expect(s.ui.toastPending).toBe(false);
	} finally {
		s.dismissToast();
		vi.useRealTimers();
	}
});

test('toast activation runs its optional action before dismissal, while close only dismisses', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	s.toast('Preview', { duration: 0 });
	await s.activateToast();
	expect(s.ui.toast).toBe('');
	const action = vi.fn(() => expect(s.ui.toast).toBe('Open Activity'));
	s.toast('Open Activity', { action, duration: 0 });
	await s.activateToast();
	expect(action).toHaveBeenCalledOnce();
	expect(s.ui.toast).toBe('');
	expect(s.ui.toastAction).toBeNull();
	s.toast('Close without acting', { action, duration: 0 });
	s.dismissToast();
	expect(action).toHaveBeenCalledOnce();
	s.toast('No stale action', { duration: 0 });
	await s.activateToast();
	expect(action).toHaveBeenCalledOnce();
});

test.each([false, true])(
	'toast activation dismisses and surfaces an action failure (async: %s)',
	async (asynchronous) => {
		const s = await import('../../src/studio/state.svelte.ts');
		const error = new Error('Primary action failed');
		s.toast('Try action', {
			duration: 0,
			action: () => {
				if (asynchronous) return Promise.reject(error);
				throw error;
			}
		});
		await expect(s.activateToast()).rejects.toBe(error);
		expect(s.ui.toast).toBe('');
		expect(s.ui.toastAction).toBeNull();
	}
);

test('async toast activation runs once, pauses expiry and preserves newer notifications', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	vi.useFakeTimers();
	try {
		const work = pending<void>(),
			action = vi.fn(() => work.promise);
		s.toast('Working', { action });
		const activating = s.activateToast();
		await s.activateToast();
		s.pauseToast('pointer');
		s.resumeToast('pointer');
		vi.advanceTimersByTime(60_000);
		expect(s.ui.toast).toBe('Working');
		expect(action).toHaveBeenCalledOnce();
		s.dismissToast();
		s.toast('New message');
		work.resolve();
		await activating;
		expect(s.ui.toast).toBe('New message');
		vi.advanceTimersByTime(4000);
		expect(s.ui.toast).toBe('');
		s.toast('Create a confirmation', {
			action: () => {
				s.toast('Action completed');
			}
		});
		await s.activateToast();
		expect(s.ui.toast).toBe('Action completed');
	} finally {
		s.dismissToast();
		vi.useRealTimers();
	}
});

test.each(['artwork', 'price', 'unchanged'] as const)(
	'delayed item frame work rechecks reviewed %s before running',
	async (change) => {
		const s = await import('../../src/studio/state.svelte.ts');
		const { app } = await import('../../src/lib/app.svelte.ts');
		const reviewed = { gens: 10, artwork: 'original target' };
		const spec: MoveSpec = {
			id: 'walk',
			frames: 3,
			items: ['robe'],
			dirs: ['south'],
			itemMethod: 'grid',
			itemsOnly: true,
			seed: 1,
			itemReview: reviewed
		};
		mocks.load.mockResolvedValue({ rec: { manifest: {} } });
		mocks.moveReview.mockReturnValue({
			...spec,
			itemReview: {
				...reviewed,
				...(change === 'artwork'
					? { artwork: 'changed target' }
					: change === 'price'
						? { gens: 15 }
						: {})
			}
		});
		mocks.move.mockImplementation(async (_projectId, spec, _progress, onReviewed) => {
			delete spec.itemReview;
			await onReviewed?.();
			return { warnings: [] };
		});
		app.key = '';
		s.withKey(() => {
			void s.queueMoves('project', [spec]);
		});
		expect(mocks.move).not.toHaveBeenCalled();
		app.key = 'synthetic';
		s.connected();
		if (change === 'unchanged') {
			await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
			expect(mocks.move.mock.calls[0][1]).not.toHaveProperty('itemReview');
			await vi.waitFor(() => expect(s.moving.done).toBe(true));
			expect(
				mocks.put.mock.calls
					.filter((call) => call[1] === 'studio-move' && call[2].status === 'running')
					.at(-1)![2].spec
			).not.toHaveProperty('itemReview');
		} else {
			await vi.waitFor(() =>
				expect(s.moving.error).toMatchObject({
					translation: message('create.errors.characterItemPriceChanged')
				})
			);
			await vi.waitFor(() =>
				expect(mocks.put).toHaveBeenCalledWith(
					'projects',
					'studio-move',
					expect.objectContaining({
						status: 'failed',
						error:
							'This character, item or price changed. Reopen the item and review its current estimate before generating. No paid request was made.'
					})
				)
			);
			expect(mocks.move).not.toHaveBeenCalled();
			expect(s.moving.queued).toEqual([]);
		}
	}
);

test.each([false, true])(
	'item review consumption synchronizes actual Svelte proxy reads and rollback (storage failure: %s)',
	async (fails) => {
		const runtimePath = 'svelte/internal/client',
			runtime = await import(runtimePath);
		const identity = <T>(value: T) => value;
		vi.stubGlobal(
			'$state',
			Object.assign(runtime.proxy, { raw: identity, snapshot: runtime.snapshot })
		);
		const s = await import('../../src/studio/state.svelte.ts'),
			prepared = pending<void>();
		const reviewed = { gens: 10, artwork: 'reviewed target' };
		const spec: MoveSpec = {
			id: 'walk',
			frames: 3,
			items: ['robe'],
			dirs: ['south'],
			itemsOnly: true,
			seed: 1,
			itemReview: reviewed
		};
		mocks.load.mockResolvedValue({ rec: { manifest: {} } });
		mocks.moveReview.mockReturnValue(spec);
		let writes = 0;
		mocks.put.mockImplementation(async () => {
			if (++writes === 2 && fails) throw new Error('Review persistence failed');
		});
		mocks.move.mockImplementation(async (_id, raw, _progress, consumed) => {
			await prepared.promise;
			delete raw.itemReview;
			try {
				await consumed();
			} catch (error) {
				raw.itemReview = reviewed;
				throw error;
			}
			return { warnings: [] };
		});
		const run = s.startMove('project', spec);
		await vi.waitFor(() => expect(mocks.move).toHaveBeenCalledOnce());
		expect(s.moving.spec!.itemReview).toEqual(reviewed); // Cache the proxy read just as MoveSheet does while preparing.
		prepared.resolve();
		await run;
		expect(runtime.snapshot(s.moving.spec).itemReview).toEqual(fails ? reviewed : undefined);
		expect(s.moving.done).toBe(!fails);
	}
);

test('notification timers pause for pointer and focus, and dismissal cannot pause the next message', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	vi.useFakeTimers();
	try {
		s.toast('Saved changes');
		vi.advanceTimersByTime(1000);
		s.pauseToast('pointer');
		s.pauseToast('focus');
		vi.advanceTimersByTime(10_000);
		s.resumeToast('pointer');
		vi.advanceTimersByTime(10_000);
		expect(s.ui.toast).toBe('Saved changes');
		s.resumeToast('focus');
		vi.advanceTimersByTime(2999);
		expect(s.ui.toast).toBe('Saved changes');
		vi.advanceTimersByTime(1);
		expect(s.ui.toast).toBe('');
		s.toast('Dismiss me');
		s.pauseToast('pointer');
		s.pauseToast('focus');
		s.dismissToast();
		s.toast('Next message');
		vi.advanceTimersByTime(4000);
		expect(s.ui.toast).toBe('');
		s.toast('Hovered message');
		s.pauseToast('pointer');
		s.toast('Replacement');
		vi.advanceTimersByTime(10_000);
		expect(s.ui.toast).toBe('Replacement');
		s.resumeToast('pointer');
		vi.advanceTimersByTime(4000);
		expect(s.ui.toast).toBe('');
	} finally {
		s.dismissToast();
		vi.useRealTimers();
	}
});

test('review drafts re-checked together after a reload all keep their results', async () => {
	// 2026-11-07 live test: the results object was copied before each check awaited, so the last check to finish dropped the
	// other draft's result and its card stayed on "Checking the frames" forever.
	const gate = pending<void>(),
		seen: string[] = [];
	vi.doMock('../../src/lib/items/run.ts', async (original) => ({
		...(await original<typeof import('../../src/lib/items/run.ts')>()),
		matchItemColors: mocks.match,
		evaluateItem: async (d: { spec: { id: string } }) => {
			seen.push(d.spec.id);
			if (d.spec.id === 'slow') await gate.promise;
			return { cells: [], qa: null, g1: new Map(), preview: null };
		}
	}));
	try {
		const draft = (id: string) => ({
			draft: { spec: { id, slot: 'head', name: id }, rigId: 'project', calls: [], log: [] },
			input: { name: id, slot: 'head', prompt: id },
			phase: 'review',
			status: ''
		});
		mocks.get.mockImplementation(async (_store: string, id: string) =>
			id === 'studio-drafts' ? { gens: [draft('slow'), draft('fast')] } : undefined
		);
		mocks.load.mockResolvedValue({ rec: { id: 'project', manifest: fixtureManifest() } });
		await import('../../src/lib/items/run.ts'); // resolve the mocked pipeline once, as a loaded page would have it
		const { queue } = (await import('../../src/lib/pixellab/queue.ts')) as unknown as {
			queue: { role: string };
		};
		queue.role = 'follower'; // a follower only re-checks the drafts it mirrors
		try {
			const s = await import('../../src/studio/state.svelte.ts');
			await s.loadGens();
			// The slow check is still waiting when the other draft's result lands.
			await vi.waitFor(() => expect(Object.keys(s.store.results)).toContain('fast'));
			expect(seen).toContain('slow');
			gate.resolve();
			await vi.waitFor(() => expect(Object.keys(s.store.results).sort()).toEqual(['fast', 'slow']));
		} finally {
			queue.role = 'leader';
		}
	} finally {
		vi.doUnmock('../../src/lib/items/run.ts');
	}
});

test('showing a slot at a drop position is one undo step and preserves drawing order', async () => {
	const state = await import('../../src/studio/state.svelte.ts');
	const { shownCategories } = await import('../../src/studio/slots.ts');
	const manifest: Manifest = fixtureManifest();
	state.store.project = { manifest, images: new Map() };
	state.doc.id = 'fixture:s2';
	state.doc.items = { body: 'base' };
	state.doc.undo = [];
	const order = manifest.slots.map((slot) => ({ id: slot.id, z: slot.z }));
	expect(
		shownCategories(manifest, state.busySlots()).some((slot) => slot.key === 'underwear')
	).toBe(false);
	state.showSlotAt('underwear', 1);
	expect(shownCategories(manifest, state.busySlots())[1].key).toBe('underwear');
	expect(state.doc.undo.map((step) => step.label)).toEqual([
		message('history.show', { name: 'Underwear' })
	]);
	expect(
		manifest.slots
			.filter((slot) => order.some((before) => before.id === slot.id))
			.map((slot) => ({ id: slot.id, z: slot.z }))
	).toEqual(order);
	state.undo();
	expect(
		shownCategories(state.store.project!.manifest, state.busySlots()).some(
			(slot) => slot.key === 'underwear'
		)
	).toBe(false);
});

test('category Random switches to another item of that category in its own slot, as one named undo step', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	s.store.project = { manifest: fixtureManifest(), images: new Map() };
	s.doc.id = 'fixture:s2';
	s.doc.items = { body: 'base', head: 'helmet_steel', torso_inner: 'vest_leather' };
	s.doc.variants = {};
	s.doc.undo = [];
	// Head holds a helmet (worn) and a wizard hat: only the hat is a choice.
	expect(s.groupRandomChoices('head').map((i) => i.id)).toEqual(['hat_wizard']);
	s.randomizeGroup('head');
	expect(s.doc.items).toEqual({ body: 'base', head: 'hat_wizard', torso_inner: 'vest_leather' });
	expect(s.ui.selected).toBe('hat_wizard');
	expect(s.doc.undo.map((u) => u.label)).toEqual([message('history.randomItem', { name: 'head' })]);
	// The visible category name is used for the permanent torso_inner key.
	s.doc.items = { body: 'base' };
	s.randomizeGroup('torso_inner');
	expect(s.doc.items).toEqual({ body: 'base', torso_inner: 'vest_leather' });
	expect(s.doc.undo.at(-1)!.label).toEqual(message('history.randomItem', { name: 'body' }));
});

test('category Random re-rolls the colors when the only item of that category is already worn', async () => {
	const s = await import('../../src/studio/state.svelte.ts');
	const manifest = fixtureManifest();
	manifest.materials = [
		{ id: 'cloth', owner: 'cape_red', ramp: ['#7a1f1f', '#c0392b', '#f1948a'] }
	];
	s.store.project = { manifest, images: new Map() };
	s.doc.id = 'fixture:s2';
	s.doc.items = { body: 'base', back: 'cape_red' };
	s.doc.variants = { cloth: 'crimson' };
	s.doc.undo = [];
	expect(s.groupRandomChoices('back').map((i) => i.id)).toEqual(['cape_red']);
	s.randomizeGroup('back');
	expect(s.doc.items).toEqual({ body: 'base', back: 'cape_red' });
	expect(s.doc.variants.cloth).toBeDefined();
	expect(s.doc.variants.cloth).not.toBe('crimson');
	expect(s.doc.undo.map((u) => u.label)).toEqual([message('history.randomItem', { name: 'back' })]);
	// Without colors to change, or with no items at all, there is nothing to randomize.
	s.store.project!.manifest.materials = [];
	expect(s.groupRandomChoices('back')).toEqual([]);
	expect(s.groupRandomChoices('face_acc')).toEqual([]);
});
