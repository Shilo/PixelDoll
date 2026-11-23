import { expect, test } from 'vitest';
import {
	problemKind,
	recordProblemKind,
	type ProblemKind
} from '../../src/studio/problemSummary.ts';
import { PaidStepError } from '../../src/lib/pixellab/paid-results.ts';
import { ApiError } from '../../src/lib/pixellab/client.ts';
import { LocalizedError, message } from '../../src/lib/message.ts';
import type { JobRec } from '../../src/lib/pixellab/queue.ts';
import en from '../../src/locales/en.json';

const kind = problemKind;
const paid = (failure: ConstructorParameters<typeof PaidStepError>[3]['failure']) =>
	new PaidStepError('x', 'create.errors.motionExceedsPxFrame', undefined, {
		step: 'motion',
		failure
	});

test('a paid step failure is summarized by its failure kind, never by its text', () => {
	for (const failure of [
		'overflow',
		'frame-count',
		'empty',
		'dropped',
		'joints',
		'stopped',
		'misaligned'
	] as const)
		expect(kind(paid(failure))).toBe(failure);
});

test('translated failures are grouped by their catalog code; an unknown one keeps its own plain message', () => {
	const coded = (key: string) => new LocalizedError('x', key as never);
	expect(kind(coded('create.errors.characterChangedAnotherTab'))).toBe('changed');
	expect(kind(coded('itemRoute.errors.itemMoveSaveConflict'))).toBe('changed');
	expect(kind(coded('itemRoute.errors.savedFramesUnavailable'))).toBe('missing');
	expect(kind(coded('create.errors.resultMissingStorage'))).toBe('missing');
	expect(kind(coded('activity.planWait.tier'))).toBe('plan');
	expect(kind(coded('create.errors.newMoveFailsQa'))).toBe('quality');
	expect(kind(coded('create.errors.requestStoppedResume'))).toBe('stopped');
	expect(kind(message('generation.outcome.noFrames'))).toBe('empty');
	expect(kind(coded('create.errors.describeMove'))).toBeUndefined();
});

test('account, network and unanticipated failures get their own plain words', () => {
	expect(kind(new ApiError(401, 'auth', 'x'))).toBe('key');
	expect(kind(new ApiError(402, 'credits', 'x'))).toBe('credits');
	expect(kind(new ApiError(422, 'policy', 'x'))).toBe('declined');
	expect(kind(new ApiError(503, 'retry', 'x'))).toBe('offline');
	expect(kind(new TypeError('Failed to fetch'))).toBe('offline');
	expect(kind(new Error('boom'))).toBe('unexpected');
	expect(kind('raw English')).toBe('unexpected');
	expect(kind('')).toBeUndefined();
	expect(recordProblemKind({ jobs: [{ policy: true }] } as unknown as JobRec)).toBe('declined');
	expect(recordProblemKind({ jobs: [] } as unknown as JobRec)).toBe('stopped');
});

test('every kind has a title and one next step in the catalog', () => {
	const kinds: ProblemKind[] = [
		'frame-count',
		'overflow',
		'empty',
		'dropped',
		'joints',
		'stopped',
		'misaligned',
		'quality',
		'changed',
		'missing',
		'plan',
		'credits',
		'key',
		'offline',
		'declined',
		'unexpected'
	];
	const problem = en.problem as unknown as Record<'title' | 'next', Record<string, string>>;
	for (const k of kinds) {
		expect(problem.title[k], k).toBeTruthy();
		expect(problem.next[k], k).toBeTruthy();
	}
});
