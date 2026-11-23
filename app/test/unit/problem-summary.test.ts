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
const coded = (key: string) => new LocalizedError('x', key as never);

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

test('translated failures are grouped by an explicit map of their catalog codes, never by key names', () => {
	expect(kind(coded('create.errors.characterChangedAnotherTab'))).toBe('changed');
	expect(kind(coded('itemRoute.errors.itemMoveSaveConflict'))).toBe('changed');
	expect(kind(coded('itemRoute.errors.savedFramesUnavailable'))).toBe('missing');
	expect(kind(coded('activity.planWait.tier'))).toBe('plan');
	expect(kind(coded('create.errors.newMoveFailsQa'))).toBe('quality');
	expect(kind(coded('create.errors.requestStoppedResume'))).toBe('stopped');
	expect(kind(message('generation.outcome.noFrames'))).toBe('empty');
	expect(kind(coded('setup.errors.jointsMissing'))).toBe('joints');
	expect(kind(coded('create.errors.moveMissingInvalidStored'))).toBe('poses');
	expect(kind(coded('itemRoute.errors.skeletonUnavailable'))).toBe('method');
	// a paid result that may be lost or may have charged never suggests a retry
	expect(kind(coded('create.errors.resultMissingStorage'))).toBe('uncertain');
	expect(kind(message('activity.error.jobMissing'))).toBe('uncertain');
	expect(kind(coded('stateGeneration.locksUnavailable'))).toBe('browser');
	expect(kind(coded('stateGeneration.quoteUnavailable'))).toBe('quote');
	expect(kind(coded('stateGeneration.flashSizesUnavailable'))).toBe('quote');
	expect(kind(coded('renameSheet.characterIdConflict'))).toBe('exportId');
	// unmapped codes are unexpected (their text stays in view), even when the key name looks like a known kind
	expect(kind(coded('create.errors.describeMove'))).toBe('unexpected');
	expect(kind(coded('adjustFrame.errors.missingArtwork'))).toBe('unexpected');
});

test('account, network and unanticipated failures get their own plain words', () => {
	expect(kind(new ApiError(401, 'auth', 'x'))).toBe('key');
	expect(kind(new ApiError(402, 'credits', 'x'))).toBe('credits');
	expect(kind(new ApiError(422, 'policy', 'x'))).toBe('declined');
	expect(kind(new ApiError(422, 'invalid', 'x'))).toBe('invalid');
	expect(kind(new ApiError(503, 'retry', 'x'))).toBe('busy');
	expect(kind(new ApiError(0, 'retry', 'x', { network: true }))).toBe('offline');
	expect(kind(new TypeError('Failed to fetch'))).toBe('unexpected');
	expect(kind(new Error('boom'))).toBe('unexpected');
	expect(kind('raw English')).toBe('unexpected');
	expect(kind('')).toBeUndefined();
});

test('Activity names a refused request by why it was refused, and a lost one as possibly charged', () => {
	const record = (fields: Partial<JobRec>) =>
		({ jobs: [], state: 'failed', ...fields }) as unknown as JobRec;
	expect(recordProblemKind(record({ errorKind: 'auth' }))).toBe('key');
	expect(recordProblemKind(record({ errorKind: 'credits' }))).toBe('credits');
	expect(recordProblemKind(record({ errorKind: 'invalid' }))).toBe('invalid');
	expect(recordProblemKind(record({ errorKind: 'policy' }))).toBe('declined');
	expect(recordProblemKind(record({ jobs: [{ policy: true }] as JobRec['jobs'] }))).toBe(
		'declined'
	);
	expect(recordProblemKind(record({ state: 'lost', errorKind: 'retry' }))).toBe('uncertain');
	expect(recordProblemKind(record({}))).toBe('stopped');
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
		'uncertain',
		'poses',
		'method',
		'quote',
		'browser',
		'exportId',
		'plan',
		'credits',
		'key',
		'busy',
		'offline',
		'invalid',
		'declined',
		'unexpected'
	];
	const problem = en.problem as unknown as Record<'title' | 'next', Record<string, string>>;
	for (const k of kinds) {
		expect(problem.title[k], k).toBeTruthy();
		expect(problem.next[k], k).toBeTruthy();
	}
});
