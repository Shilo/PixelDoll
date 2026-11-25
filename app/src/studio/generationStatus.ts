import { queueErrorParts, type JobRec, type RecState } from '../lib/pixellab/queue.ts';
import { itemGenerationMinutes } from '../lib/items/items.ts';
import type { Gen } from './state.svelte.ts';
import { errorTranslation, message, type LoggedMessage, type Message } from '../lib/message.ts';
import {
	paidRetryLeads,
	problemKind,
	recordProblemKind,
	type ProblemKind
} from './problemSummary.ts';

export const GENERATION_STOPPED = 'Generation stopped. Review Activity before trying again.';
export const NO_USABLE_FRAMES = 'PixelLab did not return usable frames';
export const GENERATION_PHASES = {
	starting: 'Starting',
	designing: 'Designing',
	addingMoves: 'Adding the other moves'
} as const;

export const activityStateMessage = (state: RecState) => message(`activity.state.${state}`);

export function isGenerationCancellation(cause: unknown): boolean {
	if (cause instanceof Error && cause.name === 'AbortError') return true;
	const outcome = cause instanceof Error ? errorTranslation(cause) : (cause as Message | undefined);
	const vars = outcome?.vars;
	const state = vars && typeof vars === 'object' && 'state' in vars ? vars.state : undefined;
	return (
		!!state &&
		typeof state === 'object' &&
		'key' in state &&
		state.key === 'activity.state.canceled'
	);
}

type RenderMessage = (value: Message | string) => string;
type OutcomeFormatters = {
	render: RenderMessage;
	formatNumber: (value: number) => string;
};

export function queueErrorMessage(record: JobRec, render: RenderMessage) {
	const parts = queueErrorParts(record);
	return parts.length > 1 ? parts.map(render).join(' | ') : parts[0];
}

/** The stopped paid call a log entry names by its index, read from that call's record. */
export function generationCallOutcome(g: Gen, jobs: JobRec[], raw = g.error) {
	const index = raw && typeof raw !== 'string' ? (raw as LoggedMessage).call : undefined;
	if (!index) return;
	const record = jobs.find((job) => job.id === g.draft.calls[index - 1]?.recId);
	if (
		record &&
		(record.state === 'failed' || record.state === 'lost' || record.state === 'canceled')
	)
		return { record, index };
}

export function generationLogMessage(
	g: Gen,
	jobs: JobRec[],
	raw: string | Message,
	{ render, formatNumber }: OutcomeFormatters
) {
	// Entries are typed: English text alone is an untranslated error (or data from an earlier version), shown as is.
	if (typeof raw === 'string') return raw;
	const outcome = generationCallOutcome(g, jobs, raw);
	if (!outcome) return message(raw.key, raw.vars);
	const { record, index } = outcome;
	const error = queueErrorMessage(record, render);
	return message(error ? 'generation.outcome.callError' : 'generation.outcome.callStopped', {
		index: formatNumber(index),
		state: render(activityStateMessage(record.state)),
		...(error ? { error: render(error) } : {})
	});
}

/** What a failed generation's notice says happened: a stopped paid call is read from its request record (a refusal for
 *  credits or the token, a decline, a possible charge), anything else from the error itself. */
export function generationProblemKind(
	g: Gen,
	jobs: JobRec[],
	error: unknown
): ProblemKind | undefined {
	const outcome = generationCallOutcome(g, jobs);
	return outcome ? recordProblemKind(outcome.record) : problemKind(error);
}

/** Whether re-buying these stopped calls is the way on that leads: never when one of them may already have charged, was
 *  declined or was refused for the account (paidRetryLeads). */
export function rerollLeads(
	recIds: readonly (string | undefined)[],
	calls: readonly number[],
	jobs: JobRec[]
) {
	return calls.every((k) => {
		const record = jobs.find((job) => job.id === recIds[k]);
		return !record || paidRetryLeads(recordProblemKind(record));
	});
}

export function generationErrorMessage(g: Gen, jobs: JobRec[], formatters: OutcomeFormatters) {
	if (g.canceled && g.error) return message('generation.outcome.canceled');
	if (g.error === GENERATION_STOPPED) return message('generation.outcome.stopped');
	if (g.error === NO_USABLE_FRAMES) return message('generation.outcome.noFrames');
	return g.error ? generationLogMessage(g, jobs, g.error, formatters) : undefined;
}

function generationPhaseMessage(status: string) {
	switch (status) {
		case GENERATION_PHASES.starting:
			return message('generation.status.starting');
		case GENERATION_PHASES.designing:
			return message('generation.status.designing');
		case GENERATION_PHASES.addingMoves:
			return message('generation.status.addingMoves');
		default:
			return status || message('generation.status.preparing');
	}
}

export function generationStatus(
	g: Gen,
	jobs: JobRec[],
	now: number,
	connected: boolean,
	paused: string | null,
	formatters: OutcomeFormatters
) {
	if (g.cancelSaveFailed)
		return {
			text: message('generation.status.saveCancellation'),
			detail: message('generation.status.saveCancellationDetail'),
			attention: true
		};
	if (g.canceled)
		return {
			text: message('generation.status.canceled'),
			detail:
				generationErrorMessage(g, jobs, formatters) ?? message('generation.status.canceledDetail'),
			attention: true
		};
	if (g.phase !== 'running')
		return {
			text:
				g.phase === 'review'
					? message('generation.status.review')
					: message('generation.status.failed'),
			detail:
				generationErrorMessage(g, jobs, formatters) ?? message('generation.status.reviewDetail'),
			attention: true
		};
	const records = g.draft.calls.flatMap((call) => jobs.filter((job) => job.id === call.recId));
	const stopped = records.find((job) => ['failed', 'lost', 'canceled'].includes(job.state));
	if (stopped)
		return {
			text: message('generation.status.needsAttention'),
			detail:
				queueErrorMessage(stopped, formatters.render) ??
				message('generation.status.needsAttentionDetail'),
			attention: true
		};
	if (!connected)
		return {
			text: message('generation.status.connect'),
			detail: message('generation.status.connectDetail'),
			attention: true
		};
	if (paused)
		return {
			text: message('generation.status.paused'),
			detail:
				paused === 'offline'
					? message('generation.status.pausedOffline')
					: paused === 'auth'
						? message('activity.pausedAuth')
						: paused === 'credits'
							? message('activity.pausedCredits')
							: paused === 'storage'
								? message('activity.pausedStorage')
								: message('generation.status.pausedQueue', { reason: paused }),
			attention: true
		};
	if (
		records.length === g.draft.calls.length &&
		records.length &&
		records.every((job) => job.state === 'done')
	)
		return {
			text: message('generation.status.checking'),
			detail: message('generation.status.checkingDetail'),
			attention: false
		};
	const submitted = records.flatMap((job) =>
		Number.isFinite(job.submittedAt) ? [job.submittedAt!] : []
	);
	if (
		records.some((job) => job.state === 'queued') &&
		!records.some((job) => job.state === 'running' || job.state === 'submitting')
	)
		return {
			text: message('generation.status.queued'),
			detail: message('generation.status.queuedDetail'),
			attention: false
		};
	if (!submitted.length)
		return {
			text: generationPhaseMessage(g.status),
			detail: message('generation.status.preparingDetail'),
			attention: false
		};
	const remaining =
		itemGenerationMinutes(g.draft.calls.length) * 60_000 -
		Math.max(0, now - Math.min(...submitted));
	return {
		text:
			remaining > 0
				? message('generation.status.minutesLeft', { minutes: Math.ceil(remaining / 60_000) })
				: message('generation.status.takingLonger'),
		detail:
			remaining > 0
				? message('generation.status.minutesLeftDetail')
				: message('generation.status.takingLongerDetail'),
		attention: false
	};
}
