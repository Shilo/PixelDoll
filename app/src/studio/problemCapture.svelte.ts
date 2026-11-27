// Freezes what a problem report says about the moment of a failure. Kept apart from report.svelte.ts, which loads the
// report preview's own dependencies, so toast() in state.svelte.ts can capture without them.
import { get } from 'svelte/store';
import type { AreaName } from '../lib/report/areas.ts';
import type { Problem, ProblemFacts } from '../lib/report/report.ts';
import { trailSnapshot } from '../lib/report/trail.ts';
import { creationModelOf } from '../lib/store/generation.ts';
import { DEFAULT_MOVE, type RigAnimation } from '../lib/rig/rig.ts';
import { pwa } from '../lib/pwa.ts';
import { experience } from './experience/state.svelte.ts';
import { moveTemplate } from './movePricing.ts';
import { doc, frames, moving, store, ui, view, type SheetId } from './state.svelte.ts';

/** English area names for reports, by the sheet the problem appeared in. */
const AREAS: Record<NonNullable<SheetId>, AreaName> = {
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

export const areaOf = (sheet: SheetId): AreaName =>
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

/** Freezes what a report says about the moment of a problem: its area, the open character, the recent actions and the
 *  page state. Call it where the problem is shown (toast() does), so a Report pressed minutes later, on another sheet or
 *  character, still describes the failure. `failedAt` is when it happened (performance.now()), if known. Without an area, the
 *  problem belongs to the sheet that is open now. */
export function captureProblem(problem: Problem, failedAt: number | undefined): Problem {
	if (problem.captured) return problem;
	const area = problem.area ?? areaOf(ui.sheet);
	// A download can name a character other than the open one, and its failure says nothing about an in-flight move; a stored
	// record can belong to any character. Only character facts supplied with them are kept.
	const character =
		problem.facts?.character ??
		(problem.facts?.download === undefined && !problem.record ? characterFacts(area) : undefined);
	// A stored record that did not settle in this page has no actions of this page to show.
	const trail = problem.record && failedAt === undefined ? undefined : trailSnapshot(failedAt);
	return {
		...problem,
		area,
		facts: {
			...problem.facts,
			character,
			offline: navigator.onLine === false || undefined,
			updateWaiting: get(pwa).available ? true : undefined
		},
		trail,
		failedAt,
		uptime: (Date.now() - performance.timeOrigin) / 1000,
		captured: true
	};
}
