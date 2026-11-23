// A failure in plain words: a short title and one next step (catalog `problem.title` and `problem.next`), by kind, so the detailed (and often technical) text can stay
// behind a Details disclosure. Free of the i18n runtime. Kinds come from typed facts only (a paid step's failure, an
// error's catalog key, an API status), never from message text.
import { ApiError } from '../lib/pixellab/client.ts';
import { PaidStepError, type PaidFailure } from '../lib/pixellab/paid-results.ts';
import { LocalizedError, type Message } from '../lib/message.ts';
import type { JobRec } from '../lib/pixellab/queue.ts';

export type ProblemKind =
	| PaidFailure
	| 'quality'
	| 'changed'
	| 'missing'
	| 'plan'
	| 'credits'
	| 'key'
	| 'offline'
	| 'declined'
	| 'unexpected';

const KEYS: Readonly<Record<string, ProblemKind>> = {
	'create.errors.replacementFailsQa': 'quality',
	'create.errors.newMoveFailsQa': 'quality',
	'activity.error.jobMissing': 'offline',
	'activity.error.download': 'offline',
	'create.errors.requestStopped': 'stopped',
	'create.errors.requestStoppedResume': 'stopped',
	'generation.outcome.stopped': 'stopped',
	'generation.outcome.callStopped': 'stopped',
	'generation.outcome.callError': 'stopped',
	'generation.outcome.noFrames': 'empty',
	'generation.outcome.standingFrames': 'frame-count',
	'genCard.declined': 'declined',
	'create.sheet.declined': 'declined',
	'itemRoute.errors.repairBatchMisaligned': 'misaligned'
};

/** The kind of a translated failure by its catalog key: the key is the error's typed code. */
function kindOfKey(key: string): ProblemKind | undefined {
	if (Object.hasOwn(KEYS, key)) return KEYS[key];
	if (key.startsWith('activity.planWait.')) return 'plan';
	const name = key.slice(key.lastIndexOf('.') + 1);
	if (/[Cc]hanged|Conflict|AnotherTab/.test(name)) return 'changed';
	if (/[Mm]issing|[Uu]navailable/.test(name)) return 'missing';
	return undefined;
}

function kindOf(error: unknown): ProblemKind | undefined {
	if (error instanceof PaidStepError) return error.paid.failure;
	if (error instanceof ApiError)
		return error.kind === 'auth'
			? 'key'
			: error.kind === 'credits'
				? 'credits'
				: error.kind === 'policy'
					? 'declined'
					: error.kind === 'retry'
						? 'offline'
						: 'unexpected';
	if (error instanceof LocalizedError) return kindOfKey(error.translation.key);
	if (error && typeof error === 'object' && typeof (error as Message).key === 'string')
		return kindOfKey((error as Message).key);
	if (error instanceof TypeError) return 'offline'; // fetch reports an unreachable network this way
	// Untranslated text or a plain Error is a failure the app did not anticipate.
	return error ? 'unexpected' : undefined;
}

/** The kind whose plain title (`problem.title.<kind>`) and next step (`problem.next.<kind>`) describe a failure, or
 *  undefined when its own message is already the plain sentence. */
export const problemKind = kindOf;

/** A request Activity lists as failed or lost: declined by PixelLab's content policy, or otherwise stopped. */
export const recordProblemKind = (record: Pick<JobRec, 'jobs'>): ProblemKind =>
	record.jobs.some((job) => job.policy || job.errorCode === 5000) ? 'declined' : 'stopped';
