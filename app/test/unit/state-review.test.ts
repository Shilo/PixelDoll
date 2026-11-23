import { expect, test, vi } from 'vitest';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';

const stored = vi.hoisted(() => ({ project: undefined as unknown, jobs: [] as unknown[] }));
vi.mock('../../src/lib/store/db.ts', async (original) => ({
	...(await original<typeof import('../../src/lib/store/db.ts')>()),
	get: async () => structuredClone(stored.project),
	all: async () => structuredClone(stored.jobs)
}));
vi.mock('../../src/lib/app.svelte.ts', () => ({
	app: { key: '', keyRejected: false },
	getKeyRevision: () => 0,
	refreshBalance: vi.fn()
}));

test('a finished State reviewed without a key asks to connect instead of reporting bad results', async () => {
	// Runes of the Studio modules this one imports; no reactivity is under test.
	const identity = <T>(value: T) => value;
	vi.stubGlobal('$state', Object.assign(identity, { raw: identity, snapshot: identity }));
	vi.stubGlobal('$derived', Object.assign(identity, { by: () => undefined }));
	vi.stubGlobal('innerWidth', 1440);
	vi.stubGlobal('innerHeight', 900);
	vi.stubGlobal('devicePixelRatio', 1);
	vi.stubGlobal('matchMedia', () => ({ matches: false }));
	vi.stubGlobal('document', { querySelector: () => null });
	const { pendingState } = await import('../../src/studio/stateGeneration.ts');
	const plan = { endpoint: '/create-character-state', parentId: 'parent', batches: [0] };
	stored.project = {
		id: 'rig-state',
		stateGenerations: { attempt: { token: 'attempt', source: { version: 1 }, plan } }
	};
	// A managed State whose poll expired, with its durable receipt (see state-recovery.test.ts).
	const record: JobRec = {
		id: 'record-0',
		label: 'State',
		tag: 'studio-state',
		activityScope: 'state:attempt:0',
		method: 'POST',
		endpoint: plan.endpoint,
		params: { character_id: 'parent' },
		inputs: [],
		requestHash: 'hash-0',
		state: 'lost',
		attempts: 1,
		nextAt: 0,
		createdAt: 0,
		response: { character_id: 'child', background_job_id: 'remote-job' },
		jobs: [{ id: 'remote-job', status: 'lost', done: true, results: [] }],
		gens: 10,
		usd: 0
	};
	stored.jobs = [record];
	await expect(pendingState('rig-state', 'attempt')).rejects.toMatchObject({
		translation: { key: 'stateGeneration.connect' }
	});
	vi.unstubAllGlobals();
});
