// "Report this problem": any failure surface hands reportProblem what it knows, and ReportDialog shows the exact public
// report before GitHub's prefilled issue form opens. See lib/report/report.ts for what a report may contain.
import { getLocale } from 'svelte-whisper';
import {
	browserEnvironment,
	buildReport,
	statusIn,
	type Problem,
	type ProblemFacts,
	type ProblemReport
} from '../lib/report/report.ts';
import { englishMessage } from '../lib/report/english.ts';
import { queueErrorParts, type JobRec } from '../lib/pixellab/queue.ts';
import { app } from '../lib/app.svelte.ts';
import type { Message } from '../lib/message.ts';
import { PRE_RELEASE } from './previewNotice.ts';
import { captureProblem } from './problemCapture.svelte.ts';
import { settledAt } from './trail.svelte.ts';

export type { Problem } from '../lib/report/report.ts';

export const reportDialog = $state({ report: null as ProblemReport | null });

/** Opens the report preview. A problem not captured where it was shown is captured now, with the trail up to this press. */
export function reportProblem(problem: Problem) {
	reportDialog.report = buildReport(captureProblem(problem, problem.failedAt), {
		env: browserEnvironment(getLocale() || 'en', PRE_RELEASE),
		english: englishMessage,
		// The folder of the page, so a copy served from a subpath still finds its own files.
		base: new URL('.', location.href).href.replace(/\/$/, ''),
		now: performance.now()
	});
}

export function closeReport() {
	reportDialog.report = null;
}

const isMessage = (value: Message | string | undefined): value is Message =>
	typeof value === 'object';

/** The failed balance check: only its error text is kept, but its request and HTTP status are safe to report. */
export const balanceFacts = (): ProblemFacts => ({
	method: 'GET',
	endpoint: '/balance',
	status: statusIn(app.balanceError)
});

/** The allow-listed facts of a failed or lost PixelLab request, and the app message it showed. */
export function jobProblem(
	record: JobRec
): Pick<Problem, 'message' | 'facts' | 'record' | 'failedAt'> {
	const failed = record.jobs.find((job) => job.error);
	const facts: ProblemFacts = {
		method: record.method,
		endpoint: record.endpoint,
		state: record.state,
		attempts: record.attempts,
		status: statusIn(record.error),
		jobStatus: failed?.status,
		errorCode: record.jobs.find((job) => job.errorCode !== undefined)?.errorCode,
		seconds:
			record.finishedAt && record.submittedAt
				? Math.round((record.finishedAt - record.submittedAt) / 1000)
				: undefined
	};
	// Settled in this tab: its trail ends there. From an earlier visit or another tab: no trail at all.
	return {
		message: queueErrorParts(record).find(isMessage),
		facts,
		record: true,
		failedAt: settledAt(record.id)
	};
}
