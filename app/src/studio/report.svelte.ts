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
import { creationModelOf } from '../lib/store/generation.ts';
import { DEFAULT_MOVE, type RigAnimation } from '../lib/rig/rig.ts';
import { queueErrorParts, type JobRec } from '../lib/pixellab/queue.ts';
import { app } from '../lib/app.svelte.ts';
import type { Message } from '../lib/message.ts';
import { experience } from './experience/state.svelte.ts';
import { moveTemplate } from './movePricing.ts';
import { PRE_RELEASE } from './previewNotice.ts';
import { doc, frames, moving, store, ui, view, type SheetId } from './state.svelte.ts';

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
	item: 'Item View and edit',
	gen: 'Item generation',
	move: 'Add a move',
	moveReview: 'Move review',
	itemGeneration: 'Generate items',
	stateCapture: 'New state',
	stateReview: 'State review',
	appearance: 'Edit appearance',
	rename: 'Rename',
	directions: 'Directions',
	importZip: 'Import from file',
	importPixelLab: 'Import from PixelLab',
	delete: 'Delete',
	details: 'Character View and edit',
	setup: 'Rig setup',
	settings: 'Settings',
	workspaceReport: 'Workspace copy',
	slots: 'Categories',
	frames: 'Frames',
	adjustFrame: 'Adjust frame',
	cost: 'Cost estimate',
	clip: 'Move View and edit'
};

export const areaOf = (sheet: SheetId) =>
	sheet ? AREAS[sheet] : experience.screen === 'characters' ? 'Characters' : 'Studio';

/** The open character and failing move, reduced to fixed facts: report.ts checks every value again. The move kind comes only
 *  from a move that surface actually names: the generating spec, the Move review candidate, or Fix frames' selected move. */
function characterFacts(area: string): ProblemFacts['character'] {
	const manifest = store.project?.manifest;
	if (!manifest) return undefined;
	const base = manifest.items.find((item) => item.id === manifest.rig.baseItem);
	const move = moving.spec && moving.projectId === doc.id ? moving.spec : undefined;
	const candidate = area === 'Move review' ? store.moveReviews[ui.moveReview] : undefined;
	const frameMove =
		area === 'Frames'
			? manifest.rig.animations.find((animation) => animation.id === frames.anim)
			: undefined;
	const shownMove = area === 'Add a move' ? view.anim : undefined;
	const moveSpec = move ?? candidate?.spec;
	return {
		frame: { ...manifest.rig.cell },
		directions: manifest.rig.directions.length,
		model: base ? creationModelOf(base) : undefined,
		moveFailure: !!move,
		moveKind: moveSpec
			? moveTemplate(moveSpec)
				? 'built-in'
				: 'custom'
			: savedMoveKind(frameMove ?? shownMove)
	};
}

/** A saved move is built-in only when every drawn view used a PixelLab template, custom when every view was described or
 *  authored; mixed, imported or unknown sources are left out rather than guessed. */
function savedMoveKind(anim: RigAnimation | undefined): 'built-in' | 'custom' | undefined {
	if (!anim || anim.id === DEFAULT_MOVE || anim.kind === 'state') return undefined;
	const motions = Object.values(anim.sources ?? {}).map((source) => source?.motion);
	if (!motions.length) return undefined;
	if (motions.every((motion) => motion?.startsWith('managed-skeleton-v3:'))) return 'built-in';
	if (
		motions.every((motion) => motion?.startsWith('authored:') || motion?.startsWith('pixminimax:'))
	)
		return 'custom';
	return undefined;
}

/** Opens the report preview. Without an area, the problem belongs to the sheet that is open now. */
export function reportProblem(problem: Problem) {
	const area = problem.area ?? areaOf(ui.sheet);
	// A download can name a character other than the open one, and its failure says nothing about an in-flight move, so only
	// character facts supplied with the download itself are kept.
	const character =
		problem.facts?.character ??
		(problem.facts?.download === undefined ? characterFacts(area) : undefined);
	reportDialog.report = buildReport(
		{
			...problem,
			area,
			facts: { ...problem.facts, character }
		},
		{
			env: browserEnvironment(getLocale() || 'en', PRE_RELEASE),
			english: englishMessage,
			uptime: (Date.now() - performance.timeOrigin) / 1000
		}
	);
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
