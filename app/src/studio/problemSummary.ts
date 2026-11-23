// A failure in plain words: a short title and one next step (catalog `problem.title` and `problem.next`) by kind, with the
// detailed text one tap away. Free of the i18n runtime. Kinds come from typed facts only (a paid step's failure, an error's
// catalog key in the explicit map below, an API error kind), never from message text or key names. Anything not mapped is
// `unexpected`, which keeps its detailed text in view.
import { ApiError, isNetwork, type ErrorKind } from '../lib/pixellab/client.ts';
import { PaidStepError, type PaidFailure } from '../lib/pixellab/paid-results.ts';
import { LocalizedError, type Message } from '../lib/message.ts';
import type { JobRec } from '../lib/pixellab/queue.ts';

export type ProblemKind =
	| PaidFailure
	| 'quality'
	| 'changed'
	| 'missing'
	| 'uncertain'
	| 'poses'
	| 'method'
	| 'quote'
	| 'browser'
	| 'exportId'
	| 'plan'
	| 'credits'
	| 'key'
	| 'busy'
	| 'offline'
	| 'declined'
	| 'unexpected';

/** Every catalog key with a kind. A key is the error's typed code; add one here when its next step is known. */
const KEYS: Readonly<Record<string, ProblemKind>> = {
	'create.errors.replacementFailsQa': 'quality',
	'create.errors.newMoveFailsQa': 'quality',
	// Changed under the user: review again (nothing here suggests a paid retry).
	'setup.errors.bodyChanged': 'changed',
	'setup.errors.referenceChanged': 'changed',
	'setup.errors.characterChanged': 'changed',
	'create.errors.cachedJointResultsChanged': 'changed',
	'create.errors.characterChangedSinceJoint': 'changed',
	'create.errors.jointCheckOutcomeChanged': 'changed',
	'create.errors.pendingJointChecksChanged': 'changed',
	'create.errors.characterItemPriceChanged': 'changed',
	'create.errors.itemFramesChangedGeneration': 'changed',
	'create.errors.itemChangedWasRemoved': 'changed',
	'create.errors.characterChangedAnotherTab': 'changed',
	'create.errors.characterChangedAnotherTab2': 'changed',
	'create.errors.moveDirectionsChanged': 'changed',
	'create.errors.bodyFramesTheirQuality': 'changed',
	'moveSheet.startFrom.changed': 'changed',
	'itemRoute.errors.reviewChanged': 'changed',
	'itemRoute.errors.paletteReviewChanged': 'changed',
	'itemRoute.errors.paletteSaveChanged': 'changed',
	'itemRoute.errors.itemMoveSaveConflict': 'changed',
	'itemRoute.errors.itemMoveSaveConflictAlso': 'changed',
	'fixFrames.errors.changed': 'changed',
	'adjustFrame.errors.changed': 'changed',
	// Saved results this device no longer has; nothing paid is at risk of being bought twice without a review.
	'itemRoute.errors.savedFramesUnavailable': 'missing',
	'itemRoute.errors.savedFrameMissing': 'missing',
	'create.errors.originalCompletedMotionUnavailable': 'missing',
	'create.errors.cachedRecoveryImageMissing': 'missing',
	// A paid result that may be lost or may have charged: never suggest a retry that could charge twice.
	'create.errors.resultMissingStorage': 'uncertain',
	'activity.error.jobMissing': 'uncertain',
	'activity.error.malformed': 'uncertain',
	'activity.error.download': 'uncertain',
	'create.errors.moveMissingInvalidStored': 'poses',
	'create.errors.moveItemMissingStored': 'poses',
	'itemRoute.errors.skeletonUnavailable': 'method',
	'stateGeneration.quoteUnavailable': 'quote',
	'stateGeneration.flashSizesUnavailable': 'quote',
	'stateGeneration.locksUnavailable': 'browser',
	'renameSheet.characterIdConflict': 'exportId',
	'setup.errors.jointsMissing': 'joints',
	'activity.planWait.tier': 'plan',
	'create.errors.requestStopped': 'stopped',
	'create.errors.requestStoppedResume': 'stopped',
	'generation.outcome.stopped': 'stopped',
	'generation.outcome.callStopped': 'stopped',
	'generation.outcome.callError': 'stopped',
	'generation.outcome.noFrames': 'empty',
	'generation.outcome.standingFrames': 'frame-count',
	'genCard.declined': 'declined',
	'create.sheet.declined': 'declined'
};

const API_KINDS: Readonly<Record<ErrorKind, ProblemKind>> = {
	auth: 'key',
	credits: 'credits',
	policy: 'declined',
	// Every request is built by the app, so a refusal of its shape is a bug to report, not a setting to change.
	invalid: 'unexpected',
	retry: 'busy',
	notfound: 'unexpected',
	other: 'unexpected'
};

const keyKind = (key: string): ProblemKind => (Object.hasOwn(KEYS, key) ? KEYS[key] : 'unexpected');

/** The kind whose plain title (`problem.title.<kind>`) and next step (`problem.next.<kind>`) describe a failure; undefined
 *  only when there is no failure. */
export function problemKind(error: unknown): ProblemKind | undefined {
	if (!error) return undefined;
	if (error instanceof PaidStepError) return error.paid.failure;
	if (error instanceof ApiError) return isNetwork(error) ? 'offline' : API_KINDS[error.kind];
	if (error instanceof LocalizedError) return keyKind(error.translation.key);
	if (typeof error === 'object' && typeof (error as Message).key === 'string')
		return keyKind((error as Message).key);
	return 'unexpected';
}

/** Whether a paid try again is the way on that leads. Not for a bug (Report it), a choice the user must change first, a
 *  decline that would repeat, a request that may already have charged, or an account to fix first (credits, token). */
export const paidRetryLeads = (kind: ProblemKind | undefined) =>
	kind !== 'unexpected' &&
	kind !== 'method' &&
	kind !== 'declined' &&
	kind !== 'uncertain' &&
	kind !== 'credits' &&
	kind !== 'key';

/** A request Activity lists as failed or lost, by what is known of it: a lost request may have charged; a refusal says why. */
export function recordProblemKind(
	record: Pick<JobRec, 'jobs' | 'state' | 'errorKind'>
): ProblemKind {
	if (record.jobs.some((job) => job.policy || job.errorCode === 5000)) return 'declined';
	if (record.state === 'lost') return 'uncertain';
	// A refusal explains a record only while nothing was accepted; a submitted job may have charged.
	if (!record.jobs.length && record.errorKind && record.errorKind !== 'retry')
		return API_KINDS[record.errorKind];
	return 'stopped';
}
