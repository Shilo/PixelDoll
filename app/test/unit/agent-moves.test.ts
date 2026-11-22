import { readFile } from 'node:fs/promises';
import { beforeEach, expect, test, vi } from 'vitest';
import {
	addMoveTool,
	moveReadiness,
	moveReviewTools,
	reviewOf
} from '../../src/studio/automation/moves.ts';
import { receipts } from '../../src/studio/automation/receipts.ts';
import { loadFixture } from '../../src/lib/compose/fixture.ts';
import type { SetupPlan } from '../../src/lib/rig/setup.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
import type { MoveCandidate } from '../../src/studio/replaceMove.ts';
import type { queueAgentMove } from '../../src/studio/state.svelte.ts';

const studio = vi.hoisted(() => ({
	doc: { id: 'rig-open', loading: false },
	app: { key: 'test-key', keyRejected: false, balance: null },
	keyRevision: 1,
	readCharacter: vi.fn(),
	openProject: vi.fn(),
	pendingBodyMoveName: vi.fn(),
	queueAgentMove: vi.fn<typeof queueAgentMove>(),
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
	studio.pendingBodyMoveName.mockResolvedValue(false);
	studio.probe.mockResolvedValue('managed');
	studio.reserve.mockImplementation(async (_what, _gens, signal, start) =>
		start(() => signal.throwIfAborted())
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
				studio.readCharacter.mockResolvedValue(saved(resized));
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
		message: 'agentMoves.skeletonCheckFailed'
	});
	const probeSignal = studio.probe.mock.calls[0][2] as AbortSignal;
	expect(probeSignal).not.toBe(controller.signal);
	controller.abort();
	expect(probeSignal.aborted).toBe(true);
	expect(studio.reserve).not.toHaveBeenCalled();
});

test('Studio acceptance is sufficient while the move is still waiting to start', async () => {
	const requestId = 'queued-wave';
	studio.queueAgentMove.mockImplementation((_id, _spec, check) => {
		check();
		return { id: requestId };
	});
	expect(await call({ requestId })).toMatchObject({
		data: { started: true, activityId: requestId, status: 'queued' }
	});
	const [characterId, spec, , beforePaid, settle] = studio.queueAgentMove.mock.calls[0];
	expect(characterId).toBe('rig-target');
	expect(spec.agentQuote?.generations).toBeGreaterThan(0);
	expect(beforePaid).not.toThrow();
	studio.keyRevision++;
	expect(beforePaid).toThrow();
	settle('running');
	settle('review');
	settle('saved');
	expect(receipts.get(requestId)?.outcome).toBe('saved');
	// The receipt answers before the character is read again, even if it can no longer be read.
	studio.readCharacter.mockReset();
	expect(await call({ requestId })).toMatchObject({
		data: {
			repeated: true,
			started: true,
			activityId: requestId,
			status: 'saved',
			outcome: 'saved'
		}
	});
	expect(studio.readCharacter).not.toHaveBeenCalled();
	expect(studio.reserve).toHaveBeenCalledTimes(1);
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
