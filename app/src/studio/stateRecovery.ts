import { stateBatchScope } from '../lib/pixellab/activity.ts';
import { managedStateSubmitChildId, type JobRec } from '../lib/pixellab/queue.ts';
import type { StateAttempt } from './stateGeneration.ts';

type RecoveryAttempt = {
	token: StateAttempt['token'];
	plan: Pick<StateAttempt['plan'], 'endpoint'> & {
		batches: readonly unknown[];
		parentId?: string;
	};
};

export function stateRecoveryRecords(attempt: RecoveryAttempt, ledger: readonly JobRec[]) {
	const { endpoint, batches } = attempt.plan;
	const managed = endpoint === '/create-character-state';
	if (!batches.length || (managed && (!attempt.plan.parentId || batches.length !== 1))) return null;
	const records: JobRec[] = [];
	for (const [index] of batches.entries()) {
		const scope = stateBatchScope(attempt.token, index);
		const matches = ledger.filter((entry) => entry.activityScope === scope);
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
		records.push(record);
	}
	return records;
}
