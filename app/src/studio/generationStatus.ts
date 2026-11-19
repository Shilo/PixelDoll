import { queueErrorParts, type JobRec, type RecState } from '../lib/pixellab/queue.ts';
import { itemGenerationMinutes, localizedAutomaticRepairError } from '../lib/items/items.ts';
import type { Gen } from './state.svelte.ts';
import { message, type Message } from '../lib/message.ts';

export const GENERATION_STOPPED = 'Generation stopped. Review Activity before trying again.';
export const NO_USABLE_FRAMES = 'PixelLab did not return usable frames';
export const GENERATION_PHASES = {
	starting: 'Starting',
	designing: 'Designing',
	addingMoves: 'Adding the other moves'
} as const;

export const activityStateMessage = (state: RecState) => message(`activity.state.${state}`);

type RenderMessage = (value: Message | string) => string;
type OutcomeFormatters = {
	render: RenderMessage;
	formatNumber: (value: number) => string;
};

export function queueErrorMessage(record: JobRec, render: RenderMessage) {
	const parts = queueErrorParts(record);
	return parts.length > 1 ? parts.map(render).join(' | ') : parts[0];
}

export function generationCallOutcome(g: Gen, jobs: JobRec[], raw = g.error) {
	if (!raw) return;
	for (const [index, call] of g.draft.calls.entries()) {
		const record = jobs.find((job) => job.id === call.recId);
		if (
			record &&
			(record.state === 'failed' || record.state === 'lost' || record.state === 'canceled') &&
			raw === `call ${index + 1} ${record.state}: ${record.error ?? ''}`
		)
			return { record, index: index + 1 };
	}
}

export function generationLogMessage(
	g: Gen,
	jobs: JobRec[],
	raw: string,
	{ render, formatNumber }: OutcomeFormatters
) {
	switch (raw) {
		case 'PixelLab returned incomplete or malformed standing frames. No automatic retry was made.':
			return message('generation.outcome.standingFrames');
		case 'Every frame passed the checks.':
			return message('generation.outcome.passed');
		case 'Issues detected. Review the item and choose Try again or Accept as is. No automatic retry was made.':
			return message('generation.outcome.reviewIssues');
	}
	const repairError = localizedAutomaticRepairError(raw);
	if (repairError) return render(repairError.translation);
	const outcome = generationCallOutcome(g, jobs, raw);
	if (!outcome) return raw;
	const { record, index } = outcome;
	const error = queueErrorMessage(record, render);
	return message(error ? 'generation.outcome.callError' : 'generation.outcome.callStopped', {
		index: formatNumber(index),
		state: render(activityStateMessage(record.state)),
		...(error ? { error: render(error) } : {})
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
