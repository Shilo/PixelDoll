import { readFile } from 'node:fs/promises';
import { beforeEach, expect, test, vi } from 'vitest';
import {
	addMoveTool,
	moveReadiness,
	moveReviewTools,
	poseEquipmentTool,
	reviewOf
} from '../../src/studio/automation/moves.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import { LABELS } from '../../src/lib/rig/poses.ts';
import { reviewedMoveEquipment } from '../../src/studio/create.ts';
import type { SetupPlan } from '../../src/lib/rig/setup.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import type { MoveCandidate } from '../../src/studio/replaceMove.ts';
import type { queueAgentMove } from '../../src/studio/state.svelte.ts';

const studio = vi.hoisted(() => ({
	doc: { id: 'rig-open', loading: false },
	app: { key: 'test-key', keyRejected: false, balance: null },
	keyRevision: 1,
	readCharacter: vi.fn(),
	readCharacterMetadata: vi.fn(),
	openProject: vi.fn(),
	pendingBodyMoveName: vi.fn(),
	queueAgentMove: vi.fn<typeof queueAgentMove>(),
	readAgentReceipts: vi.fn(),
	probe: vi.fn(),
	reserve: vi.fn(),
	rigReady: vi.fn(),
	setupPlan: vi.fn(),
	saveReviewedMove: vi.fn()
}));

vi.mock('../../src/lib/app.svelte.ts', () => ({
	app: studio.app,
	getKeyRevision: () => studio.keyRevision
}));
vi.mock('../../src/studio/state.svelte.ts', () => ({
	doc: studio.doc,
	openProject: studio.openProject,
	pendingBodyMoveName: studio.pendingBodyMoveName,
	pendingMoves: () => [],
	queueAgentMove: studio.queueAgentMove,
	readCharacter: studio.readCharacter,
	readCharacterMetadata: studio.readCharacterMetadata,
	readAgentReceipts: studio.readAgentReceipts,
	writeAgentReceipt: async () => true,
	refreshMoveReviews: vi.fn(),
	refreshProjects: vi.fn(),
	saveReviewedMove: studio.saveReviewedMove,
	store: { projects: [{ id: 'rig-target' }] },
	studioStartupState: () => 'ready'
}));
vi.mock('../../src/studio/promptSuggestions.svelte.ts', () => ({ promptSuggestions: () => [] }));
vi.mock('../../src/lib/i18n.ts', () => ({
	displayError: (error: Error) => error.message,
	displayMessage: (message: { key: string }) => message.key
}));
vi.mock('../../src/studio/automation/budget.ts', () => ({
	budget: () => ({}),
	rateUsd: () => 0,
	requireLeader: () => {},
	withReservation: studio.reserve
}));
vi.mock('../../src/lib/rig/setup.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/rig/setup.ts')>()),
	setupPlan: studio.setupPlan
}));
vi.mock('../../src/studio/create.ts', async (original) => ({
	...(await original<typeof import('../../src/studio/create.ts')>()),
	moveRigReady: studio.rigReady,
	movePreflightWarnings: () => [],
	resolveMoveMotionSource: studio.probe
}));

const request = { characterId: 'rig-target', prompt: 'Wave hello', model: 'skeleton-v3' };
const call = (args = {}, signal = new AbortController().signal) =>
	addMoveTool.run({ ...request, ...args }, signal);

let manifest: Manifest;
function saved(m = manifest) {
	return {
		r: {
			project: { manifest: m, images: new Map() },
			record: { manifest: m, character: { id: 'managed' } }
		}
	};
}

beforeEach(async () => {
	vi.resetAllMocks();
	studio.doc.id = 'rig-open';
	studio.keyRevision = 1;
	manifest = JSON.parse(
		await readFile(new URL('../../public/fixtures/s2/fixture.json', import.meta.url), 'utf8')
	);
	studio.readCharacter.mockImplementation(async () => saved());
	studio.readCharacterMetadata.mockImplementation(async () => saved().r.record);
	studio.pendingBodyMoveName.mockResolvedValue(false);
	studio.readAgentReceipts.mockResolvedValue([]);
	studio.probe.mockResolvedValue('managed');
	studio.reserve.mockImplementation(async (_what, _gens, signal, start) =>
		start(
			() => signal.throwIfAborted(),
			'agent:move-test',
			() => {},
			() => {}
		)
	);
	studio.rigReady.mockReturnValue(true);
	studio.setupPlan.mockImplementation(
		(
			await vi.importActual<typeof import('../../src/lib/rig/setup.ts')>(
				'../../src/lib/rig/setup.ts'
			)
		).setupPlan
	);
});

test('a dry move quote uses one detached character snapshot', async () => {
	studio.probe.mockImplementationOnce(async () => {
		studio.doc.id = 'rig-other';
		return 'managed';
	});
	expect(await call({ dryRun: true })).toMatchObject({
		data: { started: false, moveId: 'wave-hello' }
	});
	expect(studio.readCharacter).toHaveBeenCalledExactlyOnceWith('rig-target');
	expect(studio.openProject).not.toHaveBeenCalled();
	expect(studio.reserve).not.toHaveBeenCalled();
});

test.each(['rig', 'pending move', 'credential'])(
	'a changed %s after the probe refuses before reserving',
	async (change) => {
		studio.probe.mockImplementationOnce(async () => {
			if (change === 'rig') {
				const resized = structuredClone(manifest);
				resized.rig.cell = { w: 128, h: 128 };
				studio.readCharacterMetadata.mockResolvedValue(saved(resized).r.record);
			} else if (change === 'pending move') studio.pendingBodyMoveName.mockResolvedValue(true);
			else studio.keyRevision++;
			return 'managed';
		});
		await expect(call()).rejects.toMatchObject({ code: 'busy' });
		expect(studio.reserve).not.toHaveBeenCalled();
	}
);

test('the skeleton read combines caller cancellation and hides provider details', async () => {
	const controller = new AbortController();
	studio.probe.mockRejectedValueOnce(new Error('private upstream details'));
	await expect(call({}, controller.signal)).rejects.toMatchObject({
		code: 'not_ready',
		message: 'PixelLab could not check this character’s skeleton. Try again shortly.'
	});
	const probeSignal = studio.probe.mock.calls[0][2] as AbortSignal;
	expect(probeSignal).not.toBe(controller.signal);
	controller.abort();
	expect(probeSignal.aborted).toBe(true);
	expect(studio.reserve).not.toHaveBeenCalled();
});

test('a move replays its durable admission against the original open character', async () => {
	const requestId = 'queued-wave';
	studio.doc.id = 'rig-target';
	studio.queueAgentMove.mockImplementation(async (_id, spec, check) => {
		check();
		studio.readAgentReceipts.mockResolvedValue([{ ...spec.agentAdmission, outcome: 'saved' }]);
		return { id: 'agent:move-test' };
	});
	expect(await call({ requestId, characterId: undefined })).toMatchObject({
		data: { started: true, activityId: 'agent:move-test', status: 'queued' }
	});
	const [characterId, spec, , beforePaid] = studio.queueAgentMove.mock.calls[0];
	expect(characterId).toBe('rig-target');
	expect(spec.agentQuote?.generations).toBeGreaterThan(0);
	expect(beforePaid).not.toThrow();
	studio.keyRevision++;
	expect(beforePaid).toThrow();
	expect(spec.agentAdmission).toMatchObject({ id: 'agent:move-test', outcome: 'queued' });
	// The receipt answers before the character is read again, even if it can no longer be read.
	studio.readCharacter.mockReset();
	studio.doc.id = 'fixture:s2';
	expect(await call({ requestId, characterId: undefined })).toMatchObject({
		data: { started: true, repeated: true, activityId: 'agent:move-test', status: 'saved' }
	});
	expect(studio.readCharacter).not.toHaveBeenCalled();
	expect(studio.reserve).toHaveBeenCalledTimes(1);
});

test('an empty directions array quotes the same redraw as omitted directions', async () => {
	const first = await call({ redraw: 'walk', dryRun: true });
	expect(first.data).toMatchObject({
		moveId: 'walk',
		redraw: true,
		directions: expect.arrayContaining(['south'])
	});
	expect(await call({ redraw: 'walk', directions: [], dryRun: true })).toEqual(first);
});

test('a waiting move review tells the agent how to decide before asking PixelLab', async () => {
	const { r } = saved();
	studio.readCharacter.mockResolvedValue({
		r: { ...r, record: { ...r.record, moveReviews: { 'wave-hello': {} } } }
	});
	await expect(call()).rejects.toMatchObject({
		code: 'invalid',
		message: expect.stringContaining('accept_move or discard_move')
	});
	expect(studio.probe).not.toHaveBeenCalled();
	expect(studio.reserve).not.toHaveBeenCalled();
});

test('equipment posing refuses an item without a Studio pose offer', async () => {
	await expect(
		poseEquipmentTool.run(
			{ characterId: 'rig-target', itemId: 'sword_steel', moveId: 'walk' },
			new AbortController().signal
		)
	).rejects.toMatchObject({ code: 'unsupported' });
	expect(studio.reserve).not.toHaveBeenCalled();
});

test('an equipment pose uses the Studio offer, quote and paid reservation', async () => {
	const project = await loadFixture((path) =>
		readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))
	);
	manifest = project.manifest;
	const rig = manifest.rig;
	const walk = rig.animations.find(({ id }) => id === 'walk')!;
	const base = manifest.items.find(({ id }) => id === rig.baseItem)!;
	const hat = manifest.items.find(({ id }) => id === 'hat_wizard')!;
	const reference = base.layers[0].cells!.walk.south![0]!;
	const keypoints = LABELS.map((label) => ({ label, x: 0.5, y: 0.5 }));
	rig.rest = { south: { image: reference, keypoints } };
	walk.sources = {
		south: {
			route: 'skeleton-v3',
			reference,
			keypoints: Array(walk.cells).fill(keypoints),
			provenance: []
		}
	};
	hat.route = 'skeleton-pose';
	hat.key = 'green';
	hat.dressed = { south: reference };
	hat.baseHash = rig.baseHash;
	for (const layer of hat.layers) delete layer.cells?.walk?.south;
	const offers = reviewedMoveEquipment(manifest, {
		dirs: ['south'],
		spec: { id: 'walk', seed: 1 }
	} as MoveCandidate);
	expect(offers.find(({ item }) => item.id === hat.id)?.offer?.gens).toBeGreaterThan(0);
	expect(offers.find(({ item }) => item.id === 'sword_steel')?.offer).toBeNull();
	studio.queueAgentMove.mockResolvedValue({ id: 'agent:move-test' });
	const signal = new AbortController().signal;
	const args = { characterId: 'rig-target', itemId: hat.id, moveId: walk.id };
	const quote = await poseEquipmentTool.run({ ...args, dryRun: true }, signal);
	expect(quote.data).toMatchObject({ started: false, directions: ['south'] });
	const { generations } = quote.data as { generations: number };
	expect(generations).toBeGreaterThan(0);
	expect(studio.reserve).not.toHaveBeenCalled();
	expect(await poseEquipmentTool.run(args, signal)).toMatchObject({
		data: { started: true, generations, itemId: hat.id }
	});
	expect(studio.reserve).toHaveBeenCalledExactlyOnceWith(
		'equipment walk',
		generations,
		signal,
		expect.any(Function)
	);
	expect(studio.queueAgentMove.mock.calls[0][1]).toMatchObject({
		itemsOnly: true,
		items: [hat.id],
		itemReview: { gens: expect.any(Number) },
		agentQuote: { generations }
	});
});

test('the real rig check tells a character that cannot get moves from one that needs setup', async () => {
	const { moveRigReady } = await vi.importActual<typeof import('../../src/studio/create.ts')>(
		'../../src/studio/create.ts'
	);
	studio.rigReady.mockImplementation(moveRigReady);
	const demo = await loadFixture((path) =>
		readFile(new URL(`../../public/fixtures/s2/${path}`, import.meta.url))
	);
	// The demo keeps no saved standing views and mirrors west, so rig setup cannot run on it or its copies.
	expect(await moveReadiness(demo, { manifest: demo.manifest })).toMatchObject({
		canAdd: false,
		code: 'unsupported',
		reason: expect.stringContaining(
			'cannot get moves: Rig setup needs saved original standing views'
		)
	});
	expect(await moveReadiness(demo, undefined, true)).toMatchObject({
		code: 'unsupported',
		reason: expect.stringContaining('demo is read-only')
	});
	await expect(call()).rejects.toMatchObject({ code: 'unsupported' });
	expect(studio.reserve).not.toHaveBeenCalled();
	studio.setupPlan.mockResolvedValueOnce({ gens: 1.85 } as SetupPlan);
	expect(await moveReadiness(demo, { manifest: demo.manifest })).toMatchObject({
		canAdd: false,
		code: 'needs_user',
		reason: expect.stringContaining('about 1.85 generations')
	});
	studio.setupPlan.mockClear().mockImplementation(async (_project, reference) => {
		if (reference !== 'walk') throw new Error('Missing standing view');
		return { gens: 2 } as SetupPlan;
	});
	expect(await moveReadiness(demo, { manifest: demo.manifest })).toMatchObject({
		code: 'needs_user',
		reason: expect.stringContaining('selecting "walk"')
	});
});

test('a move decision binds to the candidate that was looked at', async () => {
	const candidate = {
		spec: { id: 'wave-hello', seed: 7, activityScope: 'run-1' },
		cells: { south: ['sha256:a'] },
		dirs: ['south'],
		animation: { cells: 1 },
		checks: {},
		warnings: []
	} as unknown as MoveCandidate;
	studio.readCharacter.mockImplementation(async () => {
		const { r } = saved();
		return { r: { ...r, record: { ...r.record, moveReviews: { 'wave-hello': candidate } } } };
	});
	const { candidateId } = await reviewOf(candidate);
	const [accept] = moveReviewTools;
	const decide = (id: string) =>
		accept.run(
			{ characterId: 'rig-target', moveId: 'wave-hello', candidateId: id },
			new AbortController().signal
		);
	await expect(decide('stale')).rejects.toMatchObject({ code: 'busy' });
	expect(studio.saveReviewedMove).not.toHaveBeenCalled();
	expect(await decide(candidateId)).toMatchObject({
		data: { outcome: 'saved', candidateId, equipmentToPose: [] }
	});
	expect(studio.saveReviewedMove).toHaveBeenCalledExactlyOnceWith('rig-target', candidate, true);
	// Redrawn frames are a new candidate.
	const redrawn = { ...candidate, cells: { south: ['sha256:b'] } } as unknown as MoveCandidate;
	expect((await reviewOf(redrawn)).candidateId).not.toBe(candidateId);
});
