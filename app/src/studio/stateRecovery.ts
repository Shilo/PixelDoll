import { stateBatchScope } from '../lib/pixellab/activity.ts';
import { live, managedStateSubmitChildId, type JobRec } from '../lib/pixellab/queue.ts';
import type { StateAttempt } from './stateGeneration.ts';

type RecoveryAttempt = {
	token: StateAttempt['token'];
	plan: Pick<StateAttempt['plan'], 'endpoint'> & {
		batches: readonly unknown[];
		parentId?: string;
	};
};

function stateRecoveryBatches(attempt: RecoveryAttempt, ledger: readonly JobRec[]) {
	const { endpoint, batches } = attempt.plan;
	const managed = endpoint === '/create-character-state';
	if (!batches.length || (managed && (!attempt.plan.parentId || batches.length !== 1))) return null;
	const records: { index: number; record: JobRec }[] = [];
	const missing: number[] = [];
	for (const [index] of batches.entries()) {
		const scope = stateBatchScope(attempt.token, index);
		const matches = ledger.filter((entry) => entry.activityScope === scope);
		if (!matches.length && !managed) {
			missing.push(index);
			continue;
		}
		if (matches.length !== 1) return null;
		const [record] = matches;
		if (record.tag !== 'studio-state' || record.method !== 'POST' || record.endpoint !== endpoint)
			return null;
		if (managed) {
			const child = managedStateSubmitChildId(record);
			const pollChild = record.jobs[0]?.characterId;
			const parent = (record.params as { character_id?: unknown } | null)?.character_id;
			if (!child || parent !== attempt.plan.parentId || (pollChild && pollChild !== child))
				return null;
		}
		if (
			record.state !== 'done' &&
			!(managed && record.state === 'lost' && record.jobs[0]?.status === 'lost')
		)
			return null;
		records.push({ index, record });
	}
	return { records, missing };
}

export function stateRecoveryRecords(attempt: RecoveryAttempt, ledger: readonly JobRec[]) {
	const batches = stateRecoveryBatches(attempt, ledger);
	return batches && !batches.missing.length ? batches.records.map(({ record }) => record) : null;
}

export function stateContinuationBatches(
	attempt: RecoveryAttempt & { continuation?: { unqueued: readonly number[] } },
	ledger: readonly JobRec[]
) {
	const unqueued = attempt.continuation?.unqueued;
	if (attempt.plan.batches.length < 2 || !Array.isArray(unqueued)) return null;
	const batches = stateRecoveryBatches(attempt, ledger);
	return batches?.missing.length && batches.missing.every((index) => unqueued.includes(index))
		? batches
		: null;
}

/** A character's unsaved State attempts, keyed by token so several can run at once. */
export const stateAttempts = (
	record: { stateGenerations?: Record<string, StateAttempt> } | null | undefined
) => Object.values(record?.stateGenerations ?? {});

/** `attention`: nothing is running and the results are incomplete, so it needs a continuation or a discard. */
export type StateAttemptStatus = 'generating' | 'ready' | 'attention';

export function stateAttemptStatus(
	attempt: RecoveryAttempt & { source?: unknown },
	ledger: readonly JobRec[]
): StateAttemptStatus {
	const scopes = new Set(
		attempt.plan.batches.map((_, index) => stateBatchScope(attempt.token, index))
	);
	if (
		ledger.some(
			(record) => record.activityScope && scopes.has(record.activityScope) && live(record)
		)
	)
		return 'generating';
	return attempt.source && stateRecoveryRecords(attempt, ledger) ? 'ready' : 'attention';
}
