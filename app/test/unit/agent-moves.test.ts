import { readFile } from 'node:fs/promises';
import { beforeEach, expect, test, vi } from 'vitest';
import { addMoveTool } from '../../src/studio/automation/moves.ts';
import { receipts } from '../../src/studio/automation/receipts.ts';
import type { Manifest } from '../../src/lib/store/manifest.ts';
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
	probe: vi.fn(),
	reserve: vi.fn()
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
	readAgentReceipts: async () => [],
	writeAgentReceipt: async () => true,
	refreshMoveReviews: vi.fn(),
	refreshProjects: vi.fn(),
	saveReviewedMove: vi.fn(),
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
vi.mock('../../src/studio/create.ts', async (original) => ({
	...(await original<typeof import('../../src/studio/create.ts')>()),
	moveRigReady: () => true,
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
	studio.probe.mockResolvedValue('managed');
	studio.reserve.mockImplementation(async (_what, _gens, signal, start) =>
		start(
			() => signal.throwIfAborted(),
			'agent:move-test',
			() => {},
			() => {}
		)
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

test('Studio acceptance is sufficient while the move is still waiting to start', async () => {
	const requestId = 'queued-wave';
	studio.queueAgentMove.mockImplementation((_id, _spec, check) => {
		check();
		return { id: 'agent:move-test' };
	});
	expect(await call({ requestId })).toMatchObject({
		data: { started: true, activityId: 'agent:move-test', status: 'queued' }
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
	expect(receipts.get('agent:move-test')?.outcome).toBe('saved');
	expect(await call({ requestId })).toMatchObject({
		data: { started: true, repeated: true, activityId: 'agent:move-test', status: 'saved' }
	});
	expect(studio.reserve).toHaveBeenCalledTimes(1);
});
