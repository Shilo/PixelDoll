import { expect, test } from 'vitest';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import {
	stateAttemptStatus,
	stateProgressOf,
	stateContinuationBatches,
	stateRecoveryRecords
} from '../../src/studio/stateRecovery.ts';

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
	{ tag: 'studio-move' },
	{ endpoint: '/transfer-outfit-v2' }
])('never exposes a running or mismatched batch for review: %o', (patch) => {
	expect(stateRecoveryRecords(local, [job(0), job(1, patch)])).toBeNull();
	expect(stateContinuationBatches(local, [job(1, patch)])).toBeNull();
});

test.each<Partial<JobRec>>([{ state: 'lost' }, { state: 'canceled' }, { state: 'failed' }])(
	'a batch that ended without results leaves the finished ones reviewable, never resent: %o',
	(patch) => {
		// Its facings read as missing in review; nothing is offered to buy them again.
		const records = [job(0), job(1, patch)];
		expect(stateRecoveryRecords(local, records)).toEqual(records);
		expect(stateRecoveryRecords(local, [job(0, patch), job(1, patch)])).toBeNull();
		expect(stateContinuationBatches(local, [job(1, patch)])).toBeNull();
	}
);

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

test('a State row reads generating, ready to review or needing attention from the job ledger', () => {
	const attempt = { ...local, source: { clip: 'default', frame: 0 } };
	expect(stateAttemptStatus(attempt, [job(0), job(1, { state: 'running' })])).toBe('generating');
	expect(stateAttemptStatus(attempt, [job(0), job(1)])).toBe('ready');
	expect(stateAttemptStatus(attempt, [job(0), job(1, { state: 'failed' })])).toBe('ready');
	expect(
		stateAttemptStatus(attempt, [job(0, { state: 'failed' }), job(1, { state: 'failed' })])
	).toBe('attention');
	expect(stateAttemptStatus(attempt, [job(0)])).toBe('attention');
	expect(stateAttemptStatus(local, [job(0), job(1)])).toBe('attention');
});

test('a failure in this tab never hides finished jobs, and a run between batches still reads as generating', () => {
	const attempt = { ...local, source: { clip: 'default', frame: 0 } };
	const error = 'Offline fixture: reading the result failed.';
	expect(stateProgressOf(attempt, [job(0), job(1)], { error })).toEqual({
		status: 'ready',
		done: 2,
		total: 2
	});
	expect(stateProgressOf(attempt, [job(0)], { error })).toEqual({
		status: 'attention',
		done: 1,
		total: 2,
		error
	});
	expect(stateProgressOf(attempt, [job(0)], {})).toMatchObject({ status: 'generating', done: 1 });
	expect(stateProgressOf(attempt, [job(0)])).toMatchObject({ status: 'attention' });
});
