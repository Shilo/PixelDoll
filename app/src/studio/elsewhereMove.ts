import { REQUEST_TEXT } from '../lib/store/db.ts';
import type { MoveSpec, Progress } from './create.ts';

/** A move waiting behind the one another tab is running. */
export interface ElsewhereQueuedMove {
	projectId: string;
	spec: MoveSpec;
}
/** The stored move another tab is running, mirrored read-only so a follower's Moves list still lists it. */
export interface ElsewhereMove {
	projectId: string;
	spec: MoveSpec;
	progress: Progress | null;
	queued: ElsewhereQueuedMove[];
}

/** A readable move from a stored record: a damaged one has no name or items to show. */
function moveSpec(value: unknown): MoveSpec | null {
	if (!value || typeof value !== 'object') return null;
	const spec = value as Partial<MoveSpec>;
	return typeof spec.id === 'string' &&
		!!spec.id &&
		Array.isArray(spec.items) &&
		spec.items.every((item) => typeof item === 'string')
		? (spec as MoveSpec)
		: null;
}

/**
 * The live move a follower can show from the stored studio-move record: the move running in another tab and the moves
 * queued behind it. A finished, stopped or unreadable record has nothing to show, so the mirror clears.
 */
export function mirroredMove(raw: unknown): ElsewhereMove | null {
	if (!raw || typeof raw !== 'object') return null;
	const record = raw as {
		spec?: unknown;
		projectId?: unknown;
		status?: unknown;
		requestText?: unknown;
		progress?: unknown;
		queued?: unknown;
	};
	const spec = moveSpec(record.spec);
	if (!spec) return null;
	if (typeof record.projectId !== 'string' || !record.projectId) return null;
	if (record.status !== 'running' || record.requestText !== REQUEST_TEXT) return null;
	const queued: ElsewhereQueuedMove[] = [];
	for (const entry of Array.isArray(record.queued) ? record.queued : []) {
		if (!entry || typeof entry !== 'object') continue;
		const { projectId, spec: queuedSpec } = entry as { projectId?: unknown; spec?: unknown };
		const readable = moveSpec(queuedSpec);
		if (typeof projectId === 'string' && projectId && readable)
			queued.push({ projectId, spec: readable });
	}
	return {
		projectId: record.projectId,
		spec,
		progress: (record.progress as Progress | null | undefined) ?? null,
		queued
	};
}
