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
import type { Message } from '../lib/message.ts';
import { experience } from './experience/state.svelte.ts';
import { PRE_RELEASE } from './previewNotice.ts';
import { ui, type SheetId } from './state.svelte.ts';

export type { Problem } from '../lib/report/report.ts';

export const reportDialog = $state({ report: null as ProblemReport | null });

/** English area names for reports, by the sheet the problem appeared in. */
const AREAS: Record<NonNullable<SheetId>, string> = {
	inspect: 'Inspect',
	connect: 'Connect PixelLab',
	create: 'New character',
	newitem: 'New item',
	export: 'Export',
	activity: 'Activity',
	item: 'Item details',
	gen: 'Item generation',
	move: 'Add a move',
	moveReview: 'Move review',
	itemGeneration: 'Generate items',
	stateCapture: 'New state',
	stateReview: 'State review',
	rename: 'Rename',
	directions: 'Directions',
	importZip: 'Import from device',
	importPixelLab: 'Import from PixelLab',
	importMoves: 'Import moves',
	delete: 'Delete',
	details: 'Character details',
	setup: 'Rig setup',
	settings: 'Settings',
	workspaceReport: 'Workspace copy',
	slots: 'Categories',
	frames: 'Frames',
	adjustFrame: 'Adjust frame',
	cost: 'Cost estimate'
};

export const areaOf = (sheet: SheetId) =>
	sheet ? AREAS[sheet] : experience.screen === 'characters' ? 'Characters' : 'Studio';

/** Opens the report preview. Without an area, the problem belongs to the sheet that is open now. */
export function reportProblem(problem: Problem) {
	reportDialog.report = buildReport(
		{ ...problem, area: problem.area ?? areaOf(ui.sheet) },
		{
			env: browserEnvironment(getLocale() || 'en', PRE_RELEASE),
			english: englishMessage,
			uptime: performance.now() / 1000
		}
	);
}

export function closeReport() {
	reportDialog.report = null;
}

const isMessage = (value: Message | string | undefined): value is Message =>
	typeof value === 'object';

/** The allow-listed facts of a failed or lost PixelLab request, and the app message it showed. */
export function jobProblem(record: JobRec): Pick<Problem, 'message' | 'facts'> {
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
	return { message: queueErrorParts(record).find(isMessage), facts };
}
