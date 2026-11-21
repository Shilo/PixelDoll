import { expect, test } from 'vitest';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import { stateContinuationBatches, stateRecoveryRecords } from '../../src/studio/stateRecovery.ts';

const local = {
	token: 'attempt',
	continuation: { unqueued: [0] },
	plan: { endpoint: '/edit-animation-v2', batches: [0, 1] }
} as const;
const managed = {
	token: 'attempt',
	plan: { endpoint: '/create-character-state', parentId: 'parent', batches: [0] }
} as const;

function job(index: number, patch?: Partial<JobRec>): JobRec {
	return {
		id: `record-${index}`,
		label: 'State',
		tag: 'studio-state',
		activityScope: `state:attempt:${index}`,
		method: 'POST',
		endpoint: local.plan.endpoint,
		params: {},
		inputs: [],
		requestHash: `hash-${index}`,
		state: 'done',
		attempts: 1,
		nextAt: 0,
		createdAt: 0,
		jobs: [],
		gens: 10,
		usd: 0,
		...patch
	};
}

test('recovers a complete durable set in planned order', () => {
	const records = [job(0), job(1)];
	expect(stateRecoveryRecords(local, [...records].reverse())).toEqual(records);
	expect(stateRecoveryRecords(local, [...records, job(1)])).toBeNull();
	expect(stateRecoveryRecords(local, [job(0)])).toBeNull();
});

test('continuation requires both an unqueued batch and the absence of a durable record', () => {
	const kept = job(1);
	expect(stateContinuationBatches(local, [kept])).toEqual({
		records: [{ index: 1, record: kept }],
		missing: [0]
	});
	expect(stateContinuationBatches(local, [])).toBeNull();
	expect(stateContinuationBatches({ ...local, continuation: { unqueued: [0, 1] } }, [])).toEqual({
		records: [],
		missing: [0, 1]
	});
	expect(stateContinuationBatches(local, [kept, kept])).toBeNull();
	expect(stateContinuationBatches(local, [job(0), kept])).toBeNull();
	expect(stateContinuationBatches(managed, [])).toBeNull();
});

test.each<Partial<JobRec>>([
	{ state: 'queued' },
	{ state: 'submitting' },
	{ state: 'running' },
	{ state: 'lost' },
	{ state: 'canceled' },
	{ state: 'failed' },
	{ tag: 'studio-move' },
	{ endpoint: '/transfer-outfit-v2' }
])('never exposes an incomplete or mismatched batch for review: %o', (patch) => {
	expect(stateRecoveryRecords(local, [job(0), job(1, patch)])).toBeNull();
	expect(stateContinuationBatches(local, [job(1, patch)])).toBeNull();
});

test('recovers an expired managed poll only with a matching durable receipt', () => {
	const record = job(0, {
		endpoint: managed.plan.endpoint,
		state: 'lost',
		params: { character_id: 'parent' },
		response: { character_id: 'child', background_job_id: 'remote-job' },
		jobs: [{ id: 'remote-job', status: 'lost', done: true, results: [] }]
	});
	expect(stateRecoveryRecords(managed, [record])).toEqual([record]);
	expect(stateRecoveryRecords(managed, [{ ...record, response: undefined }])).toBeNull();
	expect(
		stateRecoveryRecords(managed, [{ ...record, params: { character_id: 'different' } }])
	).toBeNull();
	expect(
		stateRecoveryRecords(managed, [
			{ ...record, jobs: [{ ...record.jobs[0], characterId: 'different' }] }
		])
	).toBeNull();
	expect(
		stateRecoveryRecords({ ...managed, plan: { ...managed.plan, batches: [0, 1] } }, [record])
	).toBeNull();
});
