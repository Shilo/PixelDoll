// Explicit, quoted joint fitting for saved generated State art so it can source a Move. Quote -> measure (paid,
// estimate-skeleton per exact drawn facing) -> review -> save. Nothing is written before the review is saved, and the save
// publishes sources, skeletons and provenance in one transaction. Paid checks are queue records keyed by request hash, so
// measuring again after a reload re-attaches to done or running checks and never resends a failed or lost one.
import { app, getKeyRevision, refreshBalance } from '../lib/app.svelte.ts';
import { stableStringify } from '../lib/image/hash.ts';
import type { Img } from '../lib/image/png.ts';
import { LocalizedError } from '../lib/message.ts';
import { localizedPlanRestriction, planRestriction } from '../lib/pixellab/plans.ts';
import { canReopenQueuedCancellation, live, queue, type JobRec } from '../lib/pixellab/queue.ts';
import { clipQa, type ClipQa } from '../lib/rig/clips.ts';
import { fromApi, hasAll } from '../lib/rig/poses.ts';
import {
	DEFAULT_MOVE,
	cellHash,
	cellKey,
	type DirectionName,
	type Keypoint,
	type Sha256
} from '../lib/rig/rig.ts';
import { flipSkeleton, type Skeleton } from '../lib/rig/skeleton.ts';
import { clipKind } from '../lib/runtime/timeline.js';
import * as db from '../lib/store/db.ts';
import type { Manifest, Project, Provenance } from '../lib/store/manifest.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import { measureJoints, measurementInput, provOf } from './create.ts';
import { EST } from './movePricing.ts';
import { resolveMoveSource } from './moveSource.ts';
import {
	directionEditsBlocked,
	doc,
	flushSave,
	openProject,
	syncStoredProject
} from './state.svelte.ts';
import type { ReadyStatePlan } from './stateGenerationTransport.ts';

/** Saved State art from these endpoints is generated, not captured from a Move or imported. */
const GENERATED_ENDPOINTS = {
	'/edit-animation-v2': true,
	'/edit-images-v2': true,
	'/edit-image-pro-flash': true,
	'/edit-image-pixen': true,
	'/transfer-outfit-v2': true,
	'/create-character-state': true
} satisfies Record<ReadyStatePlan['endpoint'], true>;
const MOTION = 'estimated:generated-state';
const scopeOf = (projectId: string, stateId: string) => `state-fit:${projectId}:${stateId}`;

export function isGeneratedState(clip: Manifest['rig']['animations'][number] | undefined) {
	return !!(
		clip &&
		clip.id !== DEFAULT_MOVE &&
		clipKind(clip) === 'state' &&
		clip.cells === 1 &&
		clip.source?.endpoint &&
		Object.hasOwn(GENERATED_ENDPOINTS, clip.source.endpoint)
	);
}

export interface StateJointFitView {
	direction: DirectionName;
	hash: Sha256;
	image: Img;
}
export interface StateJointFitTarget {
	stateId: string;
	/** Exact drawn facings that still need joints for the art they show now. */
	views: StateJointFitView[];
	/** Drawn facings whose saved joints already match their art. */
	fitted: DirectionName[];
}
export type StateJointCheckStatus = 'new' | 'queued' | 'running' | 'done' | 'stopped';
export interface StateJointFitQuote {
	projectId: string;
	stateId: string;
	manifestVersion: string;
	keyRevision: number;
	attempt: number;
	checks: { direction: DirectionName; hash: Sha256; status: StateJointCheckStatus }[];
	/** Includes approved checks that are queued but not sent yet. */
	generations: number;
}
export interface StateJointFitReview {
	projectId: string;
	stateId: string;
	manifestVersion: string;
	/** The measured facings, the only ones saved. */
	views: { direction: DirectionName; hash: Sha256; keypoints: Keypoint[]; qa: ClipQa }[];
	/** One measurement receipt per view, in view order. */
	provenance: Provenance[];
	/** Facings whose joints could not be measured: saved without them, and measured again on request. */
	notFitted: DirectionName[];
	/** Facings whose check stopped or failed: never resent here, so they are saved without joints. */
	unchecked: DirectionName[];
}

const changed = () =>
	new LocalizedError(
		'The source or quote changed. Check the cost again before generating.',
		'stateGeneration.changed'
	);
const unfinished = () =>
	new LocalizedError(
		'This attempt has unfinished or unavailable results. Check Activity. No request was resent.',
		'stateGeneration.unfinished'
	);
const unavailable = () =>
	new LocalizedError(
		'This frame does not have all saved views for this Move.',
		'stateCapture.unavailable'
	);
const connect = () =>
	new LocalizedError(
		'PixelLab could not confirm the account. Check your connection and try again.',
		'stateGeneration.connect'
	);
const noJoints = (direction: DirectionName) =>
	new LocalizedError(
		`no valid joints found on the ${direction} view`,
		'create.errors.validJointsFoundView',
		{ direction }
	);

/** The probe uses the canonical Move source rule, so a fit is only offered where a Move can actually read it. Like a saved
 *  fit, it measures the art the State shows now, frame edits included. */
function sourceUsable(
	manifest: Manifest,
	stateId: string,
	direction: DirectionName,
	hash: Sha256,
	keypoints: Keypoint[]
): boolean {
	const probe = structuredClone(manifest);
	const clip = probe.rig.animations.find((entry) => entry.id === stateId)!;
	clip.sources = {
		...clip.sources,
		[direction]: { route: 'import', reference: hash, measured: [keypoints], provenance: [] }
	};
	return !!resolveMoveSource(probe, { clip: stateId, cell: 0 }, [direction])?.views[direction];
}

/** Offline: the exact drawn facings of a saved generated State and whether each still needs joints. */
export async function stateJointFitTarget(
	project: Project,
	stateId: string
): Promise<StateJointFitTarget | undefined> {
	const { manifest } = project;
	const { rig } = manifest;
	const clip = rig.animations.find((entry) => entry.id === stateId);
	if (!clip || !isGeneratedState(clip)) return;
	const layers = manifest.items.find((item) => item.id === rig.baseItem)?.layers;
	const cells = layers?.length === 1 ? layers[0].cells?.[stateId] : undefined;
	if (!cells) return;
	const target: StateJointFitTarget = { stateId, views: [], fitted: [] };
	for (const { id: direction, mirrorOf } of rig.directions) {
		const hash = cells[direction]?.[0];
		// A State saved without a facing (it came back blank) fits the facings it has.
		if (mirrorOf || !hash) continue;
		const image = project.images.get(hash);
		if (!image || (await cellHash(image)) !== hash) return;
		const saved = clip.sources?.[direction];
		const fitted = saved?.reference === hash && hasAll(saved.measured?.[0]);
		const probe = fitted ? saved?.measured?.[0] : rig.rest?.[direction]?.keypoints;
		if (!probe || !hasAll(probe)) return;
		if (!sourceUsable(manifest, stateId, direction, hash, probe)) return;
		if (fitted) target.fitted.push(direction);
		else target.views.push({ direction, hash, image });
	}
	return target;
}

/** Mirrors the queue's resume-safe enqueue order: running, then done, then any stopped record blocks without resending. */
async function checkStatus(
	jobs: JobRec[],
	image: Img,
	attempt: number
): Promise<StateJointCheckStatus> {
	const { hash } = await measurementInput(image);
	const matches = jobs.filter((record) => record.requestHash === hash);
	if (matches.some((record) => record.state === 'queued')) return 'queued';
	if (matches.some(live)) return 'running';
	if (matches.some((record) => record.state === 'done')) return 'done';
	return matches.some((record) => !canReopenQueuedCancellation(record, attempt))
		? 'stopped'
		: 'new';
}

function assertSelected(projectId: string) {
	if (doc.id !== projectId || !projectId.startsWith('rig-')) throw changed();
}
function assertAccount(keyRevision?: number) {
	if (!app.key || app.keyRejected) throw connect();
	if (keyRevision !== undefined && keyRevision !== getKeyRevision()) throw changed();
}

function withFitLock<T>(projectId: string, work: () => Promise<T>): Promise<T> {
	if (!navigator.locks)
		return Promise.reject(
			new LocalizedError(
				'Use a current browser to safely generate States.',
				'stateGeneration.locksUnavailable'
			)
		);
	return navigator.locks.request(
		`pixeldoll-state-fit:${projectId}`,
		{ ifAvailable: true },
		(lock) => {
			if (!lock)
				throw new LocalizedError('Joint fitting is already in progress.', 'stateJointFit.busy');
			return work();
		}
	);
}

async function current(projectId: string, stateId: string) {
	assertSelected(projectId);
	await flushSave();
	const { rec, project } = await loadProject(projectId);
	const target = await stateJointFitTarget(project, stateId);
	if (!target?.views.length) throw unavailable();
	return { rec, project, target, manifestVersion: stableStringify(rec.manifest) };
}

/** Free: price the remaining checks. A stopped check blocks the quote because it is never resent automatically. */
export async function quoteStateJointFit(
	projectId: string,
	stateId: string
): Promise<StateJointFitQuote> {
	assertAccount();
	const keyRevision = getKeyRevision();
	const random = crypto.getRandomValues(new Uint32Array(2));
	const attempt = (random[0] & 0x1fffff) * 2 ** 32 + random[1];
	const { target, manifestVersion } = await current(projectId, stateId);
	const jobs = queue.snapshot().jobs;
	const checks = await Promise.all(
		target.views.map(async ({ direction, hash, image }) => ({
			direction,
			hash,
			status: await checkStatus(jobs, image, attempt)
		}))
	);
	// A stopped check is never resent, but it only leaves its own facing unchecked.
	if (checks.every(({ status }) => status === 'stopped')) throw unfinished();
	const fresh = checks.filter(({ status }) => status === 'new').length;
	const queued = checks.filter(({ status }) => status === 'queued').length;
	if (fresh) {
		await refreshBalance();
		if (app.keyRejected || app.balanceError) throw connect();
		const restriction = planRestriction(app.balance, {
			method: 'POST',
			endpoint: '/estimate-skeleton',
			params: undefined
		});
		if (restriction) throw localizedPlanRestriction(restriction) ?? new Error(restriction);
	}
	assertSelected(projectId);
	assertAccount(keyRevision);
	return {
		projectId,
		stateId,
		manifestVersion,
		keyRevision,
		attempt,
		checks,
		generations: +((fresh + queued) * EST).toFixed(2)
	};
}

/** Paid: runs the approved checks only and returns a review. Writes nothing to the project. */
export function measureStateJoints(
	quote: StateJointFitQuote,
	signal?: AbortSignal
): Promise<StateJointFitReview> {
	return withFitLock(quote.projectId, () => measure(quote, signal));
}

async function measure(
	quote: StateJointFitQuote,
	caller?: AbortSignal
): Promise<StateJointFitReview> {
	caller?.throwIfAborted();
	const { projectId, stateId, keyRevision, attempt } = quote;
	assertAccount(keyRevision);
	const { project, target, manifestVersion } = await current(projectId, stateId);
	if (manifestVersion !== quote.manifestVersion) throw changed();
	const jobs = queue.snapshot().jobs;
	const statuses = await Promise.all(
		target.views.map(({ image }) => checkStatus(jobs, image, attempt))
	);
	const approved = new Map(quote.checks.map((check) => [check.direction, check]));
	// Cheaper is fine (another tab finished a check). New or different checks need a new quote; a stopped one is not resent.
	if (
		target.views.length !== quote.checks.length ||
		target.views.some(
			({ direction, hash }, index) =>
				approved.get(direction)?.hash !== hash ||
				(statuses[index] === 'new' && approved.get(direction)?.status !== 'new')
		)
	)
		throw changed();
	assertSelected(projectId);
	assertAccount(keyRevision);
	const controller = new AbortController();
	const signal = caller ? AbortSignal.any([controller.signal, caller]) : controller.signal;
	const stop = queue.subscribe(() => {
		if (getKeyRevision() !== keyRevision || doc.id !== projectId) controller.abort(changed());
	});
	try {
		const scope = scopeOf(projectId, stateId);
		// Each facing settles on its own, so one failed check does not discard the paid measurements beside it.
		const results = await Promise.allSettled(
			target.views.map(({ direction, image }, index) =>
				statuses[index] === 'stopped' || approved.get(direction)?.status === 'stopped'
					? Promise.reject(unfinished())
					: measureJoints(image, true, signal, scope, {
							attempt,
							quotedEstimate: {
								reuseOnly: approved.get(direction)?.status !== 'new',
								changed: () => {
									throw changed();
								}
							}
						})
			)
		);
		signal.throwIfAborted();
		const moved = results.find(
			(result): result is PromiseRejectedResult =>
				result.status === 'rejected' &&
				result.reason instanceof LocalizedError &&
				result.reason.translation.key === 'stateGeneration.changed'
		);
		if (moved) throw moved.reason;
		assertSelected(projectId);
		assertAccount(keyRevision);
		const { rig } = project.manifest;
		const views: StateJointFitReview['views'] = [];
		const provenance: Provenance[] = [];
		const notFitted: DirectionName[] = [];
		const unchecked: DirectionName[] = [];
		// One facing without usable joints no longer costs the others their paid measurement.
		for (const [index, { direction, hash, image }] of target.views.entries()) {
			const result = results[index];
			if (result.status === 'rejected') {
				console.warn(`The ${direction} joint check did not finish.`, result.reason);
				unchecked.push(direction);
				continue;
			}
			const { keypoints, record } = result.value;
			const restView = rig.rest?.[direction];
			const rest = restView && project.images.get(restView.image);
			if (!rest) throw unavailable();
			const qa =
				keypoints &&
				hasAll(keypoints) &&
				sourceUsable(project.manifest, stateId, direction, hash, keypoints)
					? clipQa({
							anim: stateId,
							rest,
							frames: [image],
							measured: [keypoints],
							stray: 0,
							...(hasAll(restView.keypoints)
								? { facing: { dir: direction, rest: restView.keypoints } }
								: {})
						})
					: undefined;
			if (!keypoints || !qa || qa.fails.length) {
				notFitted.push(direction);
				continue;
			}
			views.push({ direction, hash, keypoints, qa });
			provenance.push(provOf(record));
		}
		if (!views.length) {
			const failed = results.find(
				(result): result is PromiseRejectedResult => result.status === 'rejected'
			);
			throw notFitted.length || !failed ? noJoints(notFitted[0]) : failed.reason;
		}
		return { projectId, stateId, manifestVersion, views, provenance, notFitted, unchecked };
	} catch (error) {
		controller.abort(error);
		throw error;
	} finally {
		stop();
	}
}

/** Pure: the reviewed fit applied to copies of the manifest and skeletons. Mirrored facings derive from their originals. */
export function applyStateJointFit(
	manifest: Manifest,
	skeletons: Record<string, Skeleton> | undefined,
	review: Pick<StateJointFitReview, 'stateId' | 'views' | 'provenance'>
): { manifest: Manifest; skeletons: Record<string, Skeleton> } {
	const next = structuredClone(manifest);
	const nextSkeletons = { ...skeletons };
	const { rig } = next;
	const clip = rig.animations.find((entry) => entry.id === review.stateId);
	const base = next.items.find((item) => item.id === rig.baseItem);
	if (!clip || !base || review.provenance.length !== review.views.length) throw changed();
	const start = base.provenance.length;
	base.provenance = [...base.provenance, ...review.provenance];
	const sources = { ...clip.sources };
	for (const [index, { direction, hash, keypoints }] of review.views.entries()) {
		sources[direction] = {
			route: 'import',
			reference: hash,
			referenceKeypoints: keypoints,
			keypoints: [keypoints],
			measured: [keypoints],
			motion: MOTION,
			provenance: [start + index]
		};
		nextSkeletons[cellKey(clip.id, direction, 0)] = fromApi(keypoints, rig.cell);
	}
	clip.sources = sources;
	const fitted = new Set(review.views.map(({ direction }) => direction));
	for (const { id, mirrorOf } of rig.directions) {
		const original =
			mirrorOf && fitted.has(mirrorOf) && nextSkeletons[cellKey(clip.id, mirrorOf, 0)];
		if (original) nextSkeletons[cellKey(clip.id, id, 0)] = flipSkeleton(original, rig.cell.w);
	}
	return { manifest: next, skeletons: nextSkeletons };
}

/** Free: publishes reviewed joints, sources, skeletons and provenance together, or nothing. Gear is left unchanged. */
export function saveStateJointFit(review: StateJointFitReview): Promise<void> {
	return withFitLock(review.projectId, () => save(review));
}

async function save(review: StateJointFitReview): Promise<void> {
	const { projectId, stateId, manifestVersion } = review;
	const blocked = directionEditsBlocked(projectId);
	if (blocked) throw blocked;
	const { target, manifestVersion: saved } = await current(projectId, stateId);
	// Exactly the reviewed facings are saved, each still needing joints for the art it was measured on.
	const open = new Map(target.views.map(({ direction, hash }) => [direction, hash]));
	if (
		saved !== manifestVersion ||
		!review.views.length ||
		new Set(review.views.map(({ direction }) => direction)).size !== review.views.length ||
		review.views.some(({ direction, hash }) => open.get(direction) !== hash)
	)
		throw changed();
	await db.update<StoredProject>('projects', projectId, (record) => {
		assertSelected(projectId);
		if (!record || stableStringify(db.asLoaded(record)?.manifest) !== manifestVersion)
			throw changed();
		// Applied inside the transaction so concurrent skeleton writes for other cells are kept.
		const result = applyStateJointFit(record.manifest, record.skeletons, review);
		for (const { direction } of review.views)
			if (!resolveMoveSource(result.manifest, { clip: stateId, cell: 0 }, [direction]))
				throw noJoints(direction);
		record.manifest = result.manifest;
		record.skeletons = result.skeletons;
		record.savedAt = new Date().toISOString();
		return record;
	});
	if (doc.id === projectId) await openProject(projectId, { quiet: true });
	else await syncStoredProject(projectId);
}
