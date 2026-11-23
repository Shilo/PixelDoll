// Create character + add a move: rig v1.3 (architecture §3). V3 originals are padded without scaling to the chosen cell
// with the floor pad (lib/rig/normalize), then registered as a managed character (0.25 gen,
// pixel-exact; its skeletons["2d_references"] are the rest keypoints) -> per clip x direction: a MOTION SOURCE (managed
// skeleton-v3 template, pixminimax text, or authored keypoints) -> keypoint sequence -> raw /animate-with-skeleton-v3 on the
// rest view (the request shape items are posed with) -> preserve normalized pixels -> re-estimate -> review notes -> stored
// frames + reference + keypoints + route + provenance. Every paid call is seeded and every free one cached, so re-running the
// same spec after a reload re-attaches to the ledger instead of paying again.
import {
	live,
	queue,
	reopenableCancellation,
	requestIdentity,
	retryableEstimate,
	type EstimateRetryIntent,
	type JobRec
} from '../lib/pixellab/queue.ts';
import { reportedUsage } from '../lib/pixellab/activity.ts';
import { api, ApiError } from '../lib/pixellab/client.ts';
import {
	PaidStepError,
	spentGens,
	type PaidFailure,
	type PaidOption,
	type PaidReview,
	type PaidView
} from '../lib/pixellab/paid-results.ts';
import {
	BASE_ANIMS,
	baseAnimation,
	frameOrder,
	png,
	routes,
	type Direction,
	type Req,
	type SubmitResponse
} from '../lib/pixellab/routes.ts';
import { base64ToBytes, bytesToBase64, decodePng, makeImg, type Img } from '../lib/image/png.ts';
import type { ImageReference } from '../lib/image/reference.ts';
import { sha256, stableStringify } from '../lib/image/hash.ts';
import { encodePngBytes } from '../lib/image/pngraw.ts';
import * as db from '../lib/store/db.ts';
import { loadProject, readStoredImage, type StoredProject } from '../lib/store/project.ts';
import { sameClipName, withClipWriteLock } from './clipName.ts';
import { stateAttempts } from './stateRecovery.ts';
import {
	MAX_FRAME,
	canvasLift,
	frameChangeText,
	frameFacts,
	freeOf,
	makeRoom,
	reframeCharacter,
	roomShort,
	roundedFrame,
	standingRoom,
	standingViews,
	type FrameChange
} from '../lib/rig/reframe.ts';
import { defaultCharacterExportId, itemContent, retainMoveChoices } from '../lib/store/identity.ts';
import { HEADROOM_MIN, anchorTracks, buildRig } from '../lib/rig/freeze.ts';
import { liftToFit, normalize, opaqueBox } from '../lib/rig/normalize.ts';
import { maskIoU } from '../lib/image/similarity.ts';
import { flipH } from '../lib/rig/mirror.ts';
import {
	ANCHORS,
	DEFAULT_MOVE,
	DIRECTIONS,
	baseHashOf,
	cellHash,
	cellKey,
	cellKeys,
	storedCellHashes,
	defaultMs,
	playlist,
	rigArtworkVersion,
	validateRig,
	type ClipSource,
	type DirectionName,
	type Keypoint,
	type RigAnimation,
	type RigDirection,
	type Rig,
	type Sha256
} from '../lib/rig/rig.ts';
import { anchorsOf, flipSkeleton, type Skeleton } from '../lib/rig/skeleton.ts';
import { LABELS, armDepth, authoredPoses, fromApi, hasAll, toApi } from '../lib/rig/poses.ts';
import { redoAfterSave, rigReady, setupRedoMoves, unposedView } from '../lib/rig/setup.ts';
import { PaletteRepairUnavailable, repairBodyPalette } from '../lib/rig/palette.ts';
import {
	RIG_GATES,
	actionOf,
	bodyComponents,
	clipQa,
	MISSING_JOINTS,
	poseCallGens,
	rawClip,
	type ClipQa
} from '../lib/rig/clips.ts';
import {
	anchorable,
	canPose,
	posable,
	poseGens,
	repairGridPlan,
	planAnchoredMove,
	itemPlanMinimumTier,
	itemPosePlan,
	poseFitIssues
} from '../lib/items/items.ts';
import { requireSlot } from '../lib/items/slots.ts';
import {
	animateAnchoredItem,
	poseItemClip,
	regridClip,
	PartialMoveError,
	type ItemViewTitle,
	type RepairReview,
	type RigCtx
} from '../lib/items/run.ts';
import { directionLabel } from './experience/movement.ts';
import { directionInline, directionNames } from './directionKeys.ts';
import { coverage } from './itemRoute.ts';
import {
	CURRENT_FORMAT,
	type CellKey,
	type Item,
	type Manifest,
	type Project,
	type Provenance
} from '../lib/store/manifest.ts';
import { baseClothesIn, basePrompt, looksOf, moveName, withoutBaseBody } from './model.ts';
import {
	moveSourceFitsGeometry,
	moveSourceMatches,
	resolveMoveSource,
	savedReplacementSource,
	type MoveSource
} from './moveSource.ts';
import {
	affectedMoveDirections,
	applyMoveLoop,
	movePlaybackChanged,
	clearMovePoseData,
	invalidateMoveItems,
	moveCandidateHasStructuralFailure,
	moveCandidateInput,
	moveRigVersion,
	type MoveCandidate
} from './replaceMove.ts';
import {
	DETAIL_VALUES,
	MODEL_IDS,
	OUTLINE_VALUES,
	bodyErrors,
	characterReferenceIssue,
	facingErrors,
	modelOf,
	sizeErrors,
	type CharacterModel
} from './characterConfig.ts';
import { skeletonInput, unpadSkeleton } from '../lib/rig/estimate.ts';
import { splitBase } from '../lib/dress/regions.ts';
import { deriveMaterials, hasCompleteCells } from '../lib/dress/dress.ts';
import { saveSplit } from '../lib/dress/project.ts';
import {
	defaultMoveFrameCount,
	gaitTemplate,
	moveFrameCounts,
	moveReferenceEnd,
	moveTemplatePrompt,
	type MoveAnimationOptions
} from './moveAnimationOptions.ts';
import { cellImg } from '../lib/compose/compose.ts';
import {
	blockingIssues,
	errorMessage,
	errorText,
	errorTranslation,
	LocalizedError,
	message,
	PreflightWarning,
	type Message
} from '../lib/message.ts';
import { localizedPlanRestriction } from '../lib/pixellab/plans.ts';
import {
	EST,
	estimate,
	extendable,
	genDirs,
	isAuthoredAction,
	moveAnimationModel,
	moveDirections,
	moveEstimate,
	moveFrames,
	moveMotionFrames,
	moveMotionGens,
	moveMotionSource,
	nativeMoveGens,
	type MoveFrameSpec
} from './movePricing.ts';
import { activityStateMessage } from './generationStatus.ts';
import type { WhisperKey } from 'svelte-whisper';

/** The form sends an exact prompt, frame, camera and explicit direction plan. */
export interface CreateSpec {
	reference?: ImageReference;
	description: string;
	name: string;
	seed: number;
	size: number;
	frame?: number;
	directions: RigDirection[];
	view?: Rig['view'];
	exactPrompt?: boolean;
	/** Advanced: Pro or Pro Flash draws instead of V3 (absent = V3); outline and detail are V3 style hints. */
	model?: Exclude<CharacterModel, 'v3'>;
	outline?: string;
	detail?: string;
	activityScope?: string;
	projectId?: string;
	/** A new registration of the same drawn views after a registration returned no usable character (absent: `seed`). */
	registrationSeed?: number;
	/** Preflight warnings (PreflightWarning ids) the user chose to generate past. */
	acceptedWarnings?: string[];
	/** Rows the drawn views sit above the fixed floor (canvasLift), chosen from the sizes when the creation starts: characters
	 *  of one body and frame size share a placement, and a resumed draft keeps the registration request it may have paid for. */
	lift?: number;
}
const CELL = 64;
// Read-only receipt lookup includes previously completed render attempts. New renders submit once.
const CLIP_ATTEMPTS = 2;

export const creationLooks = (spec: Pick<CreateSpec, 'description' | 'exactPrompt'>) => {
	if (!spec.exactPrompt) return looksOf(spec.description);
	return looksOf(
		withoutBaseBody(spec.description).trim() || 'humanoid base body',
		baseClothesIn(spec.description) ?? null
	);
};
/** The first, paid drawing call: Character V3 from text, or Pro or Pro Flash when chosen in Advanced. */
export function drawRequest(
	spec: Pick<
		CreateSpec,
		'description' | 'exactPrompt' | 'size' | 'view' | 'model' | 'outline' | 'detail' | 'reference'
	>,
	seed: number | undefined
): Req {
	const common = {
		description: spec.exactPrompt ? spec.description : basePrompt(spec.description),
		image_size: { width: spec.size, height: spec.size },
		view: spec.view ?? 'low top-down',
		template_id: 'mannequin',
		...(seed === undefined ? {} : { seed })
	};
	const reference = spec.reference;
	if (spec.model === 'standard')
		return routes.createCharacterStandard({
			...common,
			...(reference ? { directions: { south: png(reference.base64) } } : {}),
			...(spec.outline ? { outline: spec.outline } : {}),
			...(spec.detail
				? { detail: spec.detail === 'highly detailed' ? 'high detail' : spec.detail }
				: {})
		});
	if (spec.model === 'pro')
		return routes.createCharacterPro({
			...common,
			no_background: true,
			...(reference ? { method: 'create_from_concept', concept_image: png(reference.base64) } : {})
		});
	return spec.model === 'pro-flash'
		? routes.createCharacterProFlash({
				...common,
				...(reference
					? {
							style_image: {
								image: png(reference.base64),
								size: { width: reference.width, height: reference.height },
								usage_description:
									'Use this image as guidance for the character design and pixel art style.'
							}
						}
					: {})
			})
		: routes.createCharacterV3({
				...common,
				...(reference ? { reference_image: png(reference.base64) } : {}),
				no_background: true,
				...(spec.outline ? { outline: spec.outline } : {}),
				...(spec.detail ? { detail: spec.detail } : {})
			});
}
/** Pro returns its views as an unlabeled list in PixelLab's direction order, which DIRECTIONS shares (verified live
 * 2026-11-13); the other models label each view by direction already. */
export const labelViews = <T extends { label: string }>(
	model: CreateSpec['model'],
	views: T[]
): T[] =>
	model === 'pro'
		? views.map((v) => ({ ...v, label: DIRECTIONS[Number(v.label)] ?? v.label }))
		: views;

// ---------- queue helpers ----------
/** Cancel sibling continuations when one direction fails; already submitted jobs remain queue-owned. */
const generationAttempts = new WeakMap<AbortSignal, number>();
const generationMinimumTiers = new WeakMap<AbortSignal, number>();
interface GenerationRecovery {
	intent: EstimateRetryIntent;
	rawHashes: Set<string>;
	checkHashes: Set<string>;
	tail: Promise<void>;
}
const measurementRecoveries = new WeakMap<AbortSignal, GenerationRecovery>();
/** A request a review would still have to buy: nothing is sent while a flow is priced or reviewed from the cache. */
class Unpaid extends Error {
	constructor(
		readonly path: string,
		readonly running = false
	) {
		super(`${path} is not in the request cache`);
	}
}
/** One direction replayed from the request cache only: the completed records it reused and the joint checks still unbought. */
interface DryRun {
	records: JobRec[];
	checks: number;
	unmeasured: boolean;
	/** A joint check of this replay is still at PixelLab, so what follows it is not known yet. */
	running: boolean;
	/** A request the stopped flow canceled before sending was never bought; a continuation on a new attempt sends it. */
	reopensCanceled?: boolean;
	/** Stopped records the replay met: a lost one may have charged without reporting it. */
	stopped?: JobRec[];
	/** A body render of this replay passed its identity, layout and pixel checks (renderClip), before its joint checks. */
	rendered?: boolean;
}
/** Runs of a free choice (Keep without fitting items, Save the finished views): every request is read from the cache, never
 *  sent. A missing record stops the run so the review is shown again; a stopped joint check leaves its frame unmeasured. */
const cacheOnlyRuns = new WeakMap<AbortSignal, CacheOnly>();
/** `receipts`: the exact records the review replayed for the free choice; any other record is not what was reviewed. */
type CacheOnly = { receipts?: ReadonlySet<string> };
/** In a review's replay, every frame's lookup settles before the first failure is thrown: a replay that stopped on one frame
 *  still prices the checks of its siblings and meets their receipts, so a free choice and the spent total reflect every
 *  frame. A live run fails at once instead, so its scope cancels sibling checks before they are sent. */
async function settledAll<T>(work: Promise<T>[], signal?: AbortSignal): Promise<T[]> {
	if (!signal || !dryRuns.has(signal)) return Promise.all(work);
	const results = await Promise.allSettled(work);
	const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
	if (failed) throw failed.reason;
	return results.map((r) => (r as PromiseFulfilledResult<T>).value);
}
/** A joint check a cache-only run found stopped: its outcome is unknown, so the frame is unmeasured and never sent again. */
class StoppedCheck extends Error {}
/** Every receipt a replay met, completed or stopped, once each: a stopped request's reported charge is still spent. */
const receiptsOf = (records: readonly JobRec[]) => [
	...new Map(records.map((r) => [r.id, r])).values()
];
/** The receipts replayed views met, completed and stopped, as a free choice is bound to them. */
const receiptIds = (views: readonly Pick<ReplayedView, 'records' | 'stopped'>[]) =>
	receiptsOf(views.flatMap((v) => [...v.records, ...v.stopped]))
		.map((r) => r.id)
		.sort();
/** Whether any of these records may have charged more than it reported (the paid review's spentUnknown). */
const costUnknown = (records: readonly JobRec[]) =>
	records.some((r) => !!r.costUnknown || r.state === 'lost');
const dryRuns = new WeakMap<AbortSignal, DryRun>();
/** The finished record a resume-safe run of `req` would return (done, or stopped and replayed), never one still running. */
export async function latestOutcome(req: Req): Promise<JobRec | undefined> {
	const matches = await requestMatches(req);
	return matches.some(live) ? undefined : (matches.find((r) => r.state === 'done') ?? matches[0]);
}
/** Ledger records of this exact request, newest first. */
async function requestMatches(req: Req): Promise<JobRec[]> {
	const { requestHash } = await requestIdentity(req);
	return queue
		.snapshot()
		.jobs.filter((r) => r.requestHash === requestHash)
		.sort((a, b) => b.createdAt - a.createdAt);
}
/** The completed record a real run of `req` would reuse, or why it cannot: Unpaid, or the stopped record it would replay. */
async function dryRecord(req: Req, label: string, dry: DryRun): Promise<JobRec> {
	const matches = await requestMatches(req);
	const done = matches.find((r) => r.state === 'done');
	if (done) {
		if (!dry.records.includes(done)) dry.records.push(done);
		return done;
	}
	if (matches.some(live)) throw new Unpaid(req.path, true);
	const stopped = dry.reopensCanceled
		? matches.find((r) => !reopenableCancellation(r)) // the real run's rule, without its attempt number
		: matches[0];
	// A resume-safe request replays its stopped record instead of sending again, so only a new seed can buy another.
	if (stopped) {
		(dry.stopped ??= []).push(stopped);
		throw new PaidStepError(
			`${label}: ${stopped.state}. Generation stopped without resending.`,
			'create.errors.requestStoppedResume',
			{
				state: activityStateMessage(stopped.state),
				error: stopped.error ? ` (${stopped.error.slice(0, 160)})` : ''
			},
			{ step: req.path, failure: 'stopped', recordId: stopped.id }
		);
	}
	throw new Unpaid(req.path);
}
export async function parallelGeneration<T>(
	tasks: ((signal: AbortSignal) => Promise<T>)[],
	attempt?: number,
	recovery?: GenerationRecovery,
	minimumTier = 0,
	cacheOnly?: CacheOnly
): Promise<T[]> {
	const scope = new AbortController();
	if (cacheOnly) cacheOnlyRuns.set(scope.signal, cacheOnly);
	if (Number.isSafeInteger(attempt)) generationAttempts.set(scope.signal, attempt!);
	if (recovery) measurementRecoveries.set(scope.signal, recovery);
	generationMinimumTiers.set(scope.signal, minimumTier);
	return Promise.all(
		tasks.map(async (task) => {
			try {
				scope.signal.throwIfAborted();
				return await task(scope.signal);
			} catch (e) {
				scope.abort(e);
				throw e;
			}
		})
	);
}

/** A request's English label (the ledger and reports), optionally with the title Activity shows in the user's words. */
export type JobLabel = string | { text: string; title: Message };
export const FINDING_JOINTS: JobLabel = {
	text: 'Finding joints',
	title: message('activity.findingJoints')
};
export async function run(
	req: Req,
	jobLabel: JobLabel,
	tag: string,
	cache = false,
	resumeSafe = req.method === 'POST',
	signal?: AbortSignal,
	activityScope?: string,
	approval?: { attempt: number; quotedEstimate: { reuseOnly: boolean; changed: () => never } }
): Promise<JobRec> {
	signal?.throwIfAborted();
	const label = typeof jobLabel === 'string' ? jobLabel : jobLabel.text;
	const dry = signal && dryRuns.get(signal);
	if (dry) return dryRecord(req, label, dry);
	const cacheOnly = signal && cacheOnlyRuns.get(signal);
	if (cacheOnly) {
		const reviewed = (r: JobRec) => !cacheOnly.receipts || cacheOnly.receipts.has(r.id);
		const matches = await requestMatches(req),
			done = matches.find((r) => r.state === 'done');
		if (done && reviewed(done)) return done;
		if (!done && req.path === '/estimate-skeleton' && matches.some(reviewed) && !matches.some(live))
			throw new StoppedCheck();
		throw new LocalizedError(
			'A result this free choice reuses is no longer saved, so nothing was requested. Review the move again.',
			'create.errors.freeChoiceCacheMissing'
		);
	}
	const recovery = signal ? measurementRecoveries.get(signal) : undefined;
	if (recovery) {
		const { requestHash } = await requestIdentity(req);
		const completed = queue
			.snapshot()
			.jobs.find((record) => record.requestHash === requestHash && record.state === 'done');
		if (req.path !== '/estimate-skeleton' && (!recovery.rawHashes.has(requestHash) || !completed))
			throw new LocalizedError(
				'Joint-check recovery cannot generate or re-roll body artwork. Existing results were kept.',
				'create.errors.jointCheckRecoveryCannot'
			);
		signal?.throwIfAborted();
		// Consume a reviewed check once, including when another tab already completed it. Repeated frames cannot buy it twice.
		const allowed = req.path === '/estimate-skeleton' && recovery.checkHashes.delete(requestHash);
		if (completed) return completed;
		if (!allowed)
			throw new LocalizedError(
				'Cached joint results changed. Review the body frames again before continuing. No replacement request was made.',
				'create.errors.cachedJointResultsChanged'
			);
	}
	const rec = await queue.enqueue(req, {
		label,
		...(typeof jobLabel === 'string' ? {} : { title: jobLabel.title }),
		tag,
		cache,
		resumeSafe,
		signal,
		activityScope,
		minimumTier: signal ? (generationMinimumTiers.get(signal) ?? 0) : 0,
		attempt: approval?.attempt ?? (signal ? generationAttempts.get(signal) : undefined),
		quotedEstimate: approval?.quotedEstimate,
		...(recovery && req.path === '/estimate-skeleton' ? { estimateRetry: recovery.intent } : {})
	});
	// Queue cancellation is consumer-aware: a failed flow cannot cancel deduplicated work another flow still needs.
	signal?.throwIfAborted();
	const r = live(rec) ? await queue.settled(rec.id, approval ? signal : undefined) : rec;
	signal?.throwIfAborted();
	if (r.state !== 'done')
		throw new LocalizedError(
			`${label}: ${r.state}${r.error ? ` (${r.error.slice(0, 160)})` : ''}${resumeSafe ? '. Generation stopped without resending. Review this request in Activity before starting again.' : ''}`,
			resumeSafe ? 'create.errors.requestStoppedResume' : 'create.errors.requestStopped',
			{
				state: activityStateMessage(r.state),
				error: r.error ? ` (${r.error.slice(0, 160)})` : ''
			}
		);
	return r;
}
export const b64 = async (im: Img) => bytesToBase64(await encodePngBytes(im));

async function padStandardReference(
	reference: ImageReference,
	size: number
): Promise<ImageReference> {
	if (reference.width === size && reference.height === size) return reference;
	const source = await decodePng(base64ToBytes(reference.base64));
	const canvas = makeImg(size, size);
	const left = Math.floor((size - source.w) / 2);
	const top = Math.floor((size - source.h) / 2);
	for (let row = 0; row < source.h; row++) {
		const start = row * source.w * 4;
		canvas.data.set(
			source.data.subarray(start, start + source.w * 4),
			((top + row) * size + left) * 4
		);
	}
	return { base64: await b64(canvas), width: size, height: size };
}
/** Result images of a record, in frame order (labels "south/3" or "3"; character rotations are labeled by direction). */
export async function imagesOf(
	r: JobRec,
	read?: (sha: string) => Promise<Img>
): Promise<{ label: string; img: Img }[]> {
	const res = r.jobs.flatMap((s) => s.results).sort(frameOrder);
	return Promise.all(
		res.map(async (x) => {
			if (read) return { label: x.label, img: await read(x.sha) };
			const blob = await db.getBlob(x.sha);
			if (!blob)
				throw new LocalizedError(
					`result ${x.label} missing in storage`,
					'create.errors.resultMissingStorage'
				);
			return { label: x.label, img: await decodePng(blob) };
		})
	);
}
const kp4 = (label: string, x: number, y: number): Keypoint => ({
	label,
	x: +x.toFixed(4),
	y: +y.toFixed(4)
});
/** Validate original measurements before rounding/reordering can hide invalid values or duplicate labels. */
export function checkedKeypoints(raw: unknown): Keypoint[] | undefined {
	if (!hasAll(raw as Keypoint[])) return undefined;
	const points = raw as Keypoint[];
	return LABELS.map((label) => {
		const p = points.find((k) => k.label === label)!;
		return kp4(label, p.x, p.y);
	});
}
/** Managed standing joints for the drawn views. A view whose reference is absent, incomplete or invalid is listed in
 *  `unusable` and takes the same bounded estimate as an absent one: the paid draw is never lost to a malformed reference,
 *  and nothing is clamped or invented from it. */
export function managedRestKeypoints(
	refs: unknown,
	directions: readonly DirectionName[]
): { poses: Partial<Record<DirectionName, Keypoint[]>>; unusable: DirectionName[] } {
	const poses: Partial<Record<DirectionName, Keypoint[]>> = {},
		unusable: DirectionName[] = [];
	if (refs == null) return { poses, unusable }; // optional/untyped containers can be unavailable, not malformed coordinates
	const record = (value: unknown): value is Record<string, unknown> =>
		!!value && typeof value === 'object' && !Array.isArray(value);
	for (const d of directions) {
		if (!record(refs)) {
			unusable.push(d);
			continue;
		}
		const ref = Object.hasOwn(refs, d) ? refs[d] : undefined;
		if (ref == null) continue; // a wholly absent reference
		const raw = record(ref) ? ref.keypoints : ref;
		if (raw == null) continue;
		const points = record(raw)
			? checkedKeypoints(
					LABELS.map((label) => {
						const p = raw[label] as { x?: unknown; y?: unknown } | null | undefined;
						return { label, x: p?.x, y: p?.y };
					})
				)
			: undefined;
		if (points && record(ref)) poses[d] = points;
		else unusable.push(d);
	}
	return { poses, unusable };
}
/** One estimate-skeleton check with its record for provenance; keypoints are undefined when the response is invalid. */
export async function measureJoints(
	im: Img,
	resumeSafe = true,
	signal?: AbortSignal,
	activityScope?: string,
	approval?: Parameters<typeof run>[7]
): Promise<{ keypoints: Keypoint[] | undefined; record: JobRec }> {
	const input = skeletonInput(im);
	const record = await run(
		routes.estimateSkeleton(png(await b64(input.image))),
		FINDING_JOINTS,
		'm2-skel',
		true,
		resumeSafe,
		signal,
		activityScope,
		approval
	);
	const points = checkedKeypoints(
		(record.response as { keypoints?: unknown } | undefined)?.keypoints
	);
	return {
		keypoints: points ? checkedKeypoints(unpadSkeleton(points, input, im)) : undefined,
		record
	};
}
/** estimate-skeleton (deterministic, 0.1 gen, cached by request) -> API keypoints in LABELS order; undefined on failure. */
export async function joints(
	im: Img,
	resumeSafe = true,
	signal?: AbortSignal,
	activityScope?: string,
	onRecord?: (record: JobRec) => void
): Promise<Keypoint[] | undefined> {
	try {
		const measure = async () => {
			const { keypoints, record } = await measureJoints(im, resumeSafe, signal, activityScope);
			onRecord?.(record);
			return keypoints;
		};
		const recovery = signal ? measurementRecoveries.get(signal) : undefined;
		if (!recovery) return await measure();
		const before = recovery.tail;
		let release!: () => void;
		recovery.tail = new Promise<void>((resolve) => {
			release = resolve;
		});
		await before;
		try {
			signal?.throwIfAborted();
			return await measure();
		} finally {
			release();
		}
	} catch (e) {
		const dry = signal && dryRuns.get(signal);
		if (dry && e instanceof Unpaid) {
			// A review prices an unbought check instead of failing on it; the steps after it are priced from the plan.
			if (e.running) dry.running = true;
			else dry.checks++;
			dry.unmeasured = true;
			return undefined;
		}
		if (e instanceof StoppedCheck) return undefined;
		if (resumeSafe) throw e;
		return undefined;
	}
}

/** A malformed managed reference must fall back to estimation, never become a fabricated/clamped pose. */
export function managedPose(
	points?: Record<string, { x: number; y: number }>
): Keypoint[] | undefined {
	const pose = LABELS.map((label) => ({
		label,
		x: points?.[label]?.x,
		y: points?.[label]?.y
	})) as Keypoint[];
	return hasAll(pose) ? pose.map((k) => kp4(k.label, k.x, k.y)) : undefined;
}
// ---------- one clip-direction: raw skeleton-v3 on the rest view + structural checks + observations ----------
interface ClipJob {
	anim: string;
	dir: Direction;
	rest: Img;
	start?: { image: Img; keypoints: Keypoint[] };
	nativeStart?: Img;
	restKps: Keypoint[];
	keypoints: Keypoint[][];
	looks: string;
	seed: number;
	name: string;
	tick: () => void;
	view?: Manifest['rig']['view'];
	activityScope?: string;
	signal?: AbortSignal;
	action: string;
	paletteRepair?: boolean;
	authored?: boolean;
	native?: { request: Req; model: 'v3' | 'pixminimax'; frames: number; words: ViewWords };
	/** Rows each motion frame was lifted by with the user's consent; disclosed with the clip's checks. */
	lifts?: readonly number[];
	/** What the clip's frames may not show as asked (an inferred pose, a missing echo); disclosed with its checks. */
	notes?: FrameNotes;
	/** keepUnposed: frames without measured joints are kept (and fail their joint checks) instead of stopping the view. */
	unposed?: boolean; /** The move and view in the user's words, for messages. */
	words: ViewWords;
}
interface ClipOut {
	frames: Img[];
	measured: (Keypoint[] | undefined)[];
	qa: ClipQa;
	recs: JobRec[];
	processing?: ClipSource['processing'];
}
/** The raw skeleton-v3 body render action: the move's label, never the user's description, whose prop words were drawn
 * into the frozen body (a sword from behind; prompt-trim-ab.md); the description drives the motion request only. The
 * visible-side pose style keeps the body bare: props and effects drawn here would be baked into every frame. */
export const bodyAction = (spec: Pick<MoveSpec, 'id' | 'action' | 'poseStyle'>) =>
	spec.action === 'ride'
		? 'seated astride, empty hands, no mount, no animal, no saddle, no props, no effects'
		: actionOf(spec.id) +
			(spec.poseStyle === 'visible-side-v1'
				? ', empty hands, no weapon, no props, no effects'
				: '');
async function renderClip(j: ClipJob): Promise<ClipOut> {
	const r = await run(
		j.native?.request ??
			rawClip({
				first: await b64(j.start?.image ?? j.rest),
				rest: j.start?.keypoints ?? j.restKps,
				keypoints: j.keypoints,
				description: j.looks,
				action: j.action,
				dir: j.dir,
				seed: j.seed,
				view: j.view
			}),
		{
			text: `${j.name} · ${j.anim} ${j.dir}`,
			title: message('activity.titleMoveView', { name: j.name, ...j.words })
		},
		'studio-rig',
		false,
		true,
		j.signal,
		j.activityScope
	);
	j.tick();
	const outs = await imagesOf(r);
	const rejected = (failure: PaidFailure) => ({ step: 'render', failure, recordId: r.id });
	if (!j.native && outs.length !== j.keypoints.length)
		throw new PaidStepError(
			`${j.anim} ${j.dir}: PixelLab returned the wrong number of frames. No paid retry was started. Review Activity before requesting another attempt.`,
			'create.errors.pixellabReturnedWrongNumber',
			j.words,
			rejected('frame-count')
		);
	const nativeFrames =
		j.native &&
		(await normalizeNativeMoveFrames(
			r,
			outs,
			j.anim,
			j.native.words,
			j.dir,
			j.native.frames,
			j.nativeStart ?? j.rest,
			j.native.model
		));
	const normalized = nativeFrames
		? []
		: outs.map((o) => normalize(o.img, j.rest.w, j.rest.h, 128, j.rest.w));
	if (normalized.some((n) => n.cutPx))
		throw new PaidStepError(
			`${j.anim} ${j.dir}: the body frames do not fit the ${j.rest.w} px frame. They were kept for review; nothing was saved.`,
			'create.errors.animationExceedsPxFrame',
			{ ...j.words, w: j.rest.w },
			rejected('overflow')
		);
	const rawFrames = nativeFrames ? nativeFrames.frames : normalized.map((n) => n.img);
	// Do not spend on joint measurements or another render when the returned artwork is empty.
	if (rawFrames.some((f) => !opaqueBox(f)))
		throw new PaidStepError(
			`${j.anim} ${j.dir}: PixelLab returned empty frames. No paid retry was started. Review Activity before requesting another attempt.`,
			'create.errors.pixellabReturnedEmptyFrames',
			j.words,
			rejected('empty')
		);
	const replaying = j.signal && dryRuns.get(j.signal);
	if (replaying) replaying.rendered = true;
	const candidate = j.paletteRepair
		? await paletteCandidate(j.anim, j.dir, j.rest, rawFrames, j.keypoints, 0)
		: { frames: rawFrames };
	const frames = candidate.frames;
	// Observation failures retain the generated art. Never re-roll it or silently freeze an incomplete rig.
	const measured = await settledAll(
		frames.map(async (f) => {
			const k = await joints(f, true, j.signal, j.activityScope);
			j.tick();
			return k;
		}),
		j.signal
	);
	const dryJoints = j.signal && dryRuns.get(j.signal);
	if (dryJoints && dryJoints.unmeasured) throw new Unpaid('render-joints', dryJoints.running);
	if (!j.unposed && measured.some((k) => !hasAll(k)))
		throw new PaidStepError(
			`${j.anim} ${j.dir}: valid joints were not found on every frame. Generated images are retained in Activity; the move stopped without redrawing them.`,
			'create.errors.validJointsWereFound',
			j.words,
			rejected('joints')
		);
	const qa = bodyClipQa(
		j.anim,
		j.rest,
		frames,
		j.native ? undefined : j.keypoints,
		measured,
		j.authored ? undefined : { dir: j.dir, rest: j.restKps },
		j.lifts,
		nativeFrames ? { of: nativeFrames.frames.length, short: nativeFrames.short } : j.notes
	);
	return {
		frames,
		measured,
		qa,
		recs: [r],
		...('processing' in candidate ? { processing: candidate.processing } : {})
	};
}

/** The body checks a generated clip is published with; a kept cached clip must reproduce them exactly. */
const bodyClipQa = (
	anim: string,
	rest: Img,
	frames: Img[],
	requested: Keypoint[][] | undefined,
	measured: (Keypoint[] | undefined)[],
	facing?: { dir: string; rest: Keypoint[] },
	lifts?: readonly number[],
	notes?: FrameNotes
) => {
	const qa = clipQa({
		anim,
		rest,
		frames,
		requested,
		measured,
		stray: 0,
		disconnectedPixels: frames.reduce((sum, f) => sum + bodyComponents(f).detachedPixels, 0),
		...(facing ? { facing } : {})
	});
	const lifted = lifts?.filter(Boolean) ?? [];
	if (lifted.length)
		qa.warnings.push(liftNote(rest.w, Math.max(...lifted), lifted.length, lifts!.length));
	if (notes?.short) qa.warnings.push(shortNote(notes.of));
	for (const frame of notes?.bridged ?? []) qa.warnings.push(bridgeNote(frame, notes!.of));
	return qa;
};
/** Disclosures of `of` frames: `bridged` motion frames (0-based) whose joints were inferred from their measured neighbors,
 *  and `short` when PixelLab sent the frames without the start frame it documents sending first. */
type FrameNotes = { of: number; bridged?: readonly number[]; short?: true };
/** The one inferred pose is always disclosed (studioModel.bridgedJoints reads this wording). */
const bridgeNote = (frame: number, of: number) =>
	`joints of motion frame ${frame + 1} of ${of} were inferred from its neighbors`;
/** Exactly N frames for N + 1 cannot say whether the start echo or the last frame was left out (studioModel.shortFrames). */
const shortNote = (of: number) =>
	`PixelLab sent ${of} frames instead of ${of + 1}, so the first or last frame may differ`;
/** The disclosure a body made from a lifted motion keeps with its checks (rigQa), in the words of the consent. */
const liftNote = (size: number, px: number, frames: number, of: number) =>
	`motion lifted to fit the ${size} px frame: feet rise up to ${px} px in ${frames} of ${of} frames`;
/** Numerical body checks a partial or new targeted move must pass unless the user keeps the reviewed frames. */
const failsBodyGate = (qa: ClipQa, native = false) =>
	qa.fails.length > 0 ||
	(!native && (qa.adherence === null || qa.adherence > RIG_GATES.adherence)) ||
	qa.feetDrift > RIG_GATES.silhouetteBottomDelta ||
	qa.paletteFit < RIG_GATES.paletteFit ||
	qa.border > RIG_GATES.border;
/** Binds Keep consent to the character version, the exact cached render requests, the published PNGs and their checks. */
async function keptBodyHash(
	rigVersion: string,
	clips: { dir: DirectionName; rawHash: string; qa: ClipQa; frames: Img[] }[]
): Promise<string> {
	return sha256(
		stableStringify({
			rigVersion,
			clips: await Promise.all(
				[...clips]
					.sort((a, b) => a.dir.localeCompare(b.dir))
					.map(async (c) => ({
						dir: c.dir,
						rawHash: c.rawHash,
						qa: c.qa,
						frames: await Promise.all(c.frames.map((f) => cellHash(f)))
					}))
			)
		})
	);
}
/** Joints from a completed cached check only; undefined when none completed or its response is invalid. */
function cachedJoints(
	jobs: JobRec[],
	{ input, hash }: Awaited<ReturnType<typeof measurementInput>>,
	frame: Img
): Keypoint[] | undefined {
	const record = jobs.find((r) => r.requestHash === hash && r.state === 'done');
	const points =
		record && checkedKeypoints((record.response as { keypoints?: unknown })?.keypoints);
	return points ? checkedKeypoints(unpadSkeleton(points, input, frame)) : undefined;
}
export async function measurementInput(frame: Img) {
	const input = skeletonInput(frame);
	return {
		input,
		hash: (await requestIdentity(routes.estimateSkeleton(png(await b64(input.image))))).requestHash
	};
}
/** A palette repair is available only after complete original measurements prove every other body gate passed. */
async function paletteCandidate(
	anim: string,
	dir: DirectionName,
	rest: Img,
	frames: Img[],
	requested: Keypoint[][],
	stray: number,
	review?: RecoveryContext
): Promise<{ frames: Img[]; processing?: ClipSource['processing'] }> {
	const jobs = review?.jobs ?? queue.snapshot().jobs;
	const measured = await Promise.all(
		frames.map(async (frame) =>
			cachedJoints(jobs, await (review?.measurement(frame) ?? measurementInput(frame)), frame)
		)
	);
	if (measured.some((k) => !hasAll(k)))
		throw new RecoveryUnavailable(
			`${dir}: match body colors only after all original joint checks have completed.`,
			'create.errors.matchBodyColorsOnly',
			{ direction: dir }
		);
	const rawQa = clipQa({ anim, rest, frames, requested, measured, stray });
	if (rawQa.paletteFit >= RIG_GATES.paletteFit) return { frames }; // already-good views are bit-for-bit unchanged
	// Observations no longer trigger redraws, but an explicit palette-only repair still requires other checks to pass.
	if (
		rawQa.fails.length ||
		rawQa.adherence === null ||
		rawQa.adherence > RIG_GATES.adherence ||
		rawQa.feetDrift > RIG_GATES.silhouetteBottomDelta ||
		rawQa.border > RIG_GATES.border
	)
		throw new RecoveryUnavailable(
			`${dir}: color matching cannot repair pose, feet or border failures.`,
			'create.errors.colorMatchingCannotRepair',
			{ direction: dir }
		);
	let fixed: ReturnType<typeof repairBodyPalette>;
	try {
		fixed = repairBodyPalette(rest, frames);
	} catch (error) {
		// palette.ts has one bounded-drift refusal; keep its English and translate it here.
		if (error instanceof PaletteRepairUnavailable)
			throw new RecoveryUnavailable(error.message, 'create.errors.paletteDrift');
		throw error;
	}
	if (!fixed.changedPixels)
		throw new RecoveryUnavailable(
			`${dir}: the color drift is outside the bounded reference-palette repair.`,
			'create.errors.colorDriftOutsideBounded',
			{ direction: dir }
		);
	if (fixed.paletteFit < RIG_GATES.paletteFit)
		throw new RecoveryUnavailable(
			`${dir}: bounded color matching still fails the palette quality check. No new joint checks were started.`,
			'create.errors.boundedColorMatchingStill',
			{ direction: dir }
		);
	return {
		frames: fixed.frames,
		processing: {
			version: 'near-rest-v1',
			rawPaletteFit: fixed.rawPaletteFit,
			rawOutliers: fixed.rawOutliers,
			changedPixels: fixed.changedPixels,
			remainingOutliers: fixed.remainingOutliers,
			changedFrames: fixed.changedFrames,
			rawInputHashes: await Promise.all(
				frames.map(async (f) => `sha256:${await sha256(await encodePngBytes(f))}` as Sha256)
			),
			inputHashes: await Promise.all(
				fixed.frames.map(async (f) => `sha256:${await sha256(await encodePngBytes(f))}` as Sha256)
			)
		}
	};
}

/** Managed motion source on the rest character -> frames on the 64 cell -> estimated keypoint sequence. */
async function motion(
	req: Req,
	dir: Direction,
	/** The request's English label (`text`, also in English messages) and its Activity title. */
	jobLabel: { text: string; title: Message },
	words: ViewWords,
	tick: () => void,
	expected: number,
	signal?: AbortSignal,
	activityScope?: string,
	size = CELL,
	standing?: Img,
	lifts?: readonly number[],
	below = 0,
	echo: MotionEchoRule = 'optional-leading'
): Promise<{
	keypoints: Keypoint[][];
	record: JobRec;
	motionEcho?: ClipSource['motionEcho'];
	motionBridged?: number[];
	short?: true;
}> {
	const label = jobLabel.text;
	const r = await run(req, jobLabel, 'studio-rig', false, true, signal, activityScope);
	tick();
	const { frames, motionEcho, short } = await normalizeMotionFrames(
		r,
		(await imagesOf(r)).map((out) => out.img),
		dir,
		label,
		words,
		expected,
		size,
		standing,
		echo,
		lifts,
		'motion',
		below
	);
	const kps = await settledAll(
		frames.map(async (f) => {
			// An empty frame has no joints to measure; it is bridged from its neighbors or the view stops below.
			const k = opaqueBox(f) ? await joints(f, true, signal, activityScope) : undefined;
			tick();
			return k;
		}),
		signal
	);
	const dryJoints = signal && dryRuns.get(signal);
	if (dryJoints && dryJoints.unmeasured) throw new Unpaid('motion-joints', dryJoints.running);
	const filled = motionJoints(kps);
	if (!filled)
		throw new PaidStepError(
			`${label}: joints not found on every frame`,
			'create.errors.jointsFoundEveryFrame',
			words,
			{ step: 'motion', failure: 'joints', recordId: r.id }
		);
	// Skeleton renders accept joints inside the image only (Keypoint-Input x and y are 0..1). A lifted source whose joints
	// still fall outside stops here, before its render is bought.
	if (
		lifts?.some(Boolean) &&
		filled.some((k) => k.some((p) => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1))
	)
		throw new PaidStepError(
			`${label}: the lifted motion still has joints outside the ${size} px frame. No body render was requested.`,
			'create.errors.liftedJointsOutside',
			{ ...words, size },
			{ step: 'motion', failure: 'overflow', recordId: r.id }
		);
	const motionBridged = kps.flatMap((points, i) => (hasAll(points) ? [] : [i]));
	return {
		keypoints: filled,
		record: r,
		...(motionEcho ? { motionEcho } : {}),
		...(motionBridged.length ? { motionBridged } : {}),
		...(short ? { short } : {})
	};
}
/** Measured motion joints, with at most one interior frame that has none filled halfway between its measured neighbors.
 *  Motion joints only shape the poses the body render is asked for, and the render's own frames must still measure every
 *  joint, so one gap in a smooth motion is safe to bridge; requested keypoints never stand in for measured ones. Undefined
 *  when an end frame, two frames or neighboring frames have none. */
export function motionJoints(
	measured: readonly (Keypoint[] | undefined)[]
): Keypoint[][] | undefined {
	const missing = measured.flatMap((points, i) => (hasAll(points) ? [] : [i]));
	if (!missing.length) return measured as Keypoint[][];
	const [i] = missing;
	if (missing.length > 1 || i === 0 || i === measured.length - 1) return undefined;
	const before = measured[i - 1]!,
		after = measured[i + 1]!;
	return measured.map((points, j) =>
		j === i
			? LABELS.map((label) => {
					const a = before.find((p) => p.label === label)!,
						b = after.find((p) => p.label === label)!;
					return kp4(label, (a.x + b.x) / 2, (a.y + b.y) / 2);
				})
			: points!
	);
}

/** The one placement of managed motion frames (live, cached replay, standing echo, lift and Make room): PixelLab draws them
 *  from the registered standing view, centered on its canvas, so they land rig.artOffset rows lower once Adjust frame has
 *  moved our art since that registration. Native V3/PixMiniMax moves start from our own art and take no offset. */
export const artMapping = (rig: Pick<Manifest['rig'], 'artOffset'>, dir: DirectionName) =>
	rig.artOffset?.[dir] ?? 0;
/** Whether a returned frame 0 may be PixelLab's start frame sent back. `required-leading`: raw pixminimax documents
 *  frame_count + 1 frames with the input first. `optional-leading`: one extra frame is dropped by position, as managed
 *  motion sends the standing it registered first (despite `keep_first_frame: false` on described moves; the walk template
 *  sends no such flag) and that view need not match ours (Fix frames, Adjust frame, an outfit drawn at creation; known
 *  issues). Matching its pixels would make a paid motion a dead end that a re-roll repeats, so its overlap with our
 *  standing is recorded as evidence instead. */
type MotionEchoRule = 'required-leading' | 'optional-leading';
const motionEchoRule = (spec: MoveFrameSpec): MotionEchoRule =>
	moveMotionSource(spec) === 'standalone' ? 'required-leading' : 'optional-leading';
async function normalizeMotionFrames(
	r: JobRec,
	images: Img[],
	dir: Direction,
	/** The request's label, for the English message only; users read `words`. */
	label: string,
	words: ViewWords,
	expected: number,
	size: number,
	standing?: Img,
	echo: MotionEchoRule = 'optional-leading',
	lifts?: readonly number[],
	step = 'motion',
	/** Rows our standing art sits below the registered view (artMapping): managed motion only, never native moves. */
	below = 0
): Promise<{ frames: Img[]; motionEcho?: ClipSource['motionEcho']; short?: true }> {
	const rejected = (failure: PaidFailure) => ({ step, failure, recordId: r.id });
	const got = (r.response as SubmitResponse | undefined)?.directions;
	if (got && !got.includes(dir))
		throw new PaidStepError(
			`${label}: PixelLab dropped the direction (busy). Try again.`,
			'create.errors.pixellabDroppedDirectionBusy',
			words,
			rejected('dropped')
		); // S4 truncation
	const returned = images.length,
		mismatch = new PaidStepError(
			`${label}: PixelLab returned ${returned} motion frames for ${expected} requested. No joint checks or body render were requested for this view.`,
			'create.errors.pixellabReturnedMotionFrames',
			{ ...words, returned, expected },
			rejected('frame-count')
		);
	const startKept = returned === expected + 1 && !!standing;
	if (returned !== expected && !startKept) throw mismatch;
	// Exactly N for a documented N + 1 is ambiguous (echo or last frame left out), never a reason to lose a paid result: the
	// frames are used in returned order and the ambiguity is disclosed. Any other count still stops; nothing is truncated.
	const short = echo === 'required-leading' && !startKept ? (true as const) : undefined;
	const normalizeFrame = (image: Img, lift = 0) => {
		const normalized = normalize(image, size, size, 128, size, lift - below);
		if (normalized.cutPx)
			throw new PaidStepError(
				`${label}: the motion does not fit the ${size} px frame. Its frames were kept for review; nothing was saved.`,
				'create.errors.motionExceedsPxFrame',
				{ ...words, size },
				rejected('overflow')
			);
		return normalized.img;
	};
	const frames = (startKept ? images.slice(1) : images).map((image, i) =>
		normalizeFrame(image, lifts?.[i])
	);
	// One empty interior motion frame is bridged like a joint gap (motionJoints): motion frames only shape the requested
	// poses and are never published. An empty end frame, more than one, or any empty body frame stops the view.
	const empty = frames.flatMap((f, i) => (opaqueBox(f) ? [] : [i]));
	if (
		empty.length &&
		(step !== 'motion' || empty.length > 1 || empty[0] === 0 || empty[0] === frames.length - 1)
	)
		throw new PaidStepError(
			`${label}: PixelLab returned an empty motion frame`,
			'create.errors.pixellabReturnedEmptyMotion',
			words,
			rejected('empty')
		);
	// Evidence of what a motion source's dropped frame was, recorded with the clip; it never decides anything.
	if (!startKept || step !== 'motion') return { frames, ...(short ? { short } : {}) };
	const echoed = normalize(images[0], size, size, 128, size, -below).img;
	return { frames, motionEcho: { maskIoU: maskIoU(echoed, standing!) } };
}

async function normalizeNativeMoveFrames(
	record: JobRec,
	outputs: { img: Img }[],
	move: string,
	words: ViewWords,
	dir: Direction,
	count: number,
	rest: Img,
	model: 'v3' | 'pixminimax'
): Promise<{ frames: Img[]; short?: true }> {
	return normalizeMotionFrames(
		record,
		outputs.map((out) => out.img),
		dir,
		`${move} ${dir}`,
		words,
		count,
		rest.w,
		rest,
		model === 'pixminimax' ? 'required-leading' : 'optional-leading',
		undefined,
		'render'
	);
}

export const provOf = (r: JobRec, produced: CellKey[] = []): Provenance => {
	const params = r.params as Record<string, unknown>;
	return {
		endpoint: r.endpoint,
		params,
		seed: (params.seed as number) ?? 0,
		requestHash: `sha256:${r.requestHash}`,
		jobId: r.jobs[0]?.id,
		usage: reportedUsage(r),
		createdAt: new Date(r.submittedAt ?? r.createdAt).toISOString(),
		produced
	};
};
export const cellBlob = async (image: Img) =>
	new Blob([(await encodePngBytes(image)) as Uint8Array<ArrayBuffer>], { type: 'image/png' });
const putCell = async (h: Sha256, im: Img) => {
	if (!(await db.getBlob(h.slice(7)))) await db.put('blobs', h.slice(7), await cellBlob(im));
};
const warn = (clip: string, qa: ClipQa) =>
	[...qa.fails, ...(qa.warnings ?? [])].map((f) => `${clip}: ${f}`);

/** A published attempt is authoritative even after its user changes outfits, equipment, name or body moves. */
async function completedCreation(
	id: string,
	creationSpec: string
): Promise<StoredProject | undefined> {
	const saved = await db.get<StoredProject>('projects', id);
	if (saved && saved.creationSpec !== creationSpec)
		throw new LocalizedError(
			'This creation identity belongs to another saved character. Start a new character to keep both.',
			'create.errors.creationIdentityBelongsAnother'
		);
	return saved;
}

/** The character canvas of a drawn view: a V3 reference keeps its own height. */
const drawnCanvas = (spec: CreateSpec, img: Img, cell: number) =>
	Math.min(spec.reference && !spec.model ? img.h : img.w, cell);
/** A drawn view placed on the creation frame. */
const drawnView = (spec: CreateSpec, img: Img, cell: number) =>
	normalize(img, cell, cell, 128, drawnCanvas(spec, img, cell), spec.lift ?? 0);

export interface CreatePaidOption extends PaidOption {
	spec: CreateSpec;
}
export interface CreatePaidReview extends PaidReview {
	options: CreatePaidOption[];
}
/** API-free review of a stopped creation, replayed from the request cache: the drawn views it bought, and whether it can finish
 *  from them for free, with a new registration of the same views, or only with a new draw (the sheet's Try again). Undefined
 *  when nothing was drawn yet or the character is already saved. */
export async function reviewCreateResults(spec: CreateSpec): Promise<CreatePaidReview | undefined> {
	const { dry, outcome } = await replayCreate(spec);
	if (!outcome) return undefined;
	const base = dry.records[0]; // the draw is the first request
	if (!base) return undefined;
	const cell = spec.frame ?? CELL,
		drawn = labelViews(spec.model, await imagesOf(base));
	const views: PaidView[] = DIRECTIONS.map((d) => {
		const view = drawn.find((x) => x.label === d),
			placed = view && drawnView(spec, view.img, cell);
		const problem = !placed
			? message('create.errors.pixellabReturnedView', { direction: viewInline(d) })
			: placed.cutPx
				? message('create.errors.viewDoesFitPx', { direction: viewInline(d), cell })
				: !opaqueBox(placed.img)
					? message('create.errors.pixellabReturnedEmptyView', { direction: viewInline(d) })
					: undefined;
		return {
			label: viewName(d),
			state: problem ? 'failed' : 'ready',
			frames: view
				? [{ img: placed && !placed.cutPx ? placed.img : view.img, label: viewName(d) }]
				: [],
			notes: problem ? [problem] : []
		};
	});
	const options: CreatePaidOption[] = [];
	const paid = outcome instanceof PaidStepError ? outcome.paid : undefined;
	if (outcome instanceof Unpaid) {
		const gens = unpaidCreateGens(outcome, dry);
		options.push({
			id: 'resume',
			label: message('createReview.resume'),
			gens,
			paid: gens > 0,
			primary: true,
			spec
		});
	} else if (paid && paid.step !== 'draw' && paid.recordId !== base.id) {
		// The drawn views are fine: register them again with a new registration seed, keeping the paid draw.
		options.push({
			id: 'register',
			label: message('createReview.register'),
			detail: message('createReview.registerDetail'),
			gens: 0.25,
			paid: true,
			primary: true,
			spec: { ...spec, registrationSeed: salt(spec.registrationSeed ?? spec.seed) }
		});
	} else if (paid?.step === 'draw' && paid.failure === 'overflow')
		options.push(...(await placementOptions(spec, drawn, base)));
	const receipts = receiptsOf([...dry.records, ...(dry.stopped ?? [])]);
	return {
		views,
		spent: spentGens(receipts),
		...(costUnknown(receipts) ? { spentUnknown: true } : {}),
		recordIds: receipts.map((r) => r.id),
		options
	};
}
/** A creation replayed from the request cache only: the records it reused, and why it stopped (undefined: it completed). */
async function replayCreate(spec: CreateSpec): Promise<{ dry: DryRun; outcome: unknown }> {
	const scope = new AbortController(),
		dry: DryRun = { records: [], checks: 0, unmeasured: false, running: false };
	dryRuns.set(scope.signal, dry);
	try {
		await createCharacter(spec, undefined, undefined, scope.signal);
		return { dry, outcome: undefined };
	} catch (error) {
		return { dry, outcome: error };
	}
}
/** Everything a replay bought is reused; only an unbought registration (0.25) and joint checks are still charged. */
const unpaidCreateGens = (outcome: Unpaid, dry: DryRun) =>
	+(
		(outcome.path === '/create-character-v3' && !outcome.running ? 0.25 : 0) +
		dry.checks * EST
	).toFixed(2);
/** Ways on for drawn views that do not fit their frame. The paid draw does not depend on the frame or the placement
 *  (drawRequest), so the same views are placed again, raised in the same frame or in the smallest larger frame they fit,
 *  and only their new registration (and any joint check) is bought: each choice is priced by a replay from the cache. */
async function placementOptions(
	spec: CreateSpec,
	drawn: { label: string; img: Img }[],
	base: JobRec
): Promise<CreatePaidOption[]> {
	const cell = spec.frame ?? CELL,
		views = DIRECTIONS.map((d) => drawn.find((view) => view.label === d)?.img);
	if (views.some((img) => !img)) return [];
	const fits = (candidate: CreateSpec, frame: number) =>
		views.every((img) => {
			const placed = drawnView(candidate, img!, frame);
			return !placed.cutPx && !!opaqueBox(placed.img);
		});
	const candidates: Omit<CreatePaidOption, 'gens' | 'paid' | 'primary'>[] = [];
	const raise = views.map((img) =>
		liftToFit(img!, cell, cell, 128, drawnCanvas(spec, img!, cell), -(spec.lift ?? 0))
	);
	if (raise.every((px) => px !== null) && Math.max(...raise) > 0) {
		const px = Math.max(...raise);
		candidates.push({
			id: 'lift',
			label: message('createReview.lift'),
			detail: message('createReview.liftDetail', { px, size: cell }),
			spec: { ...spec, lift: (spec.lift ?? 0) + px }
		});
	}
	// A new frame takes the placement a new character of that frame gets (startCreate).
	const framed = (frame: number): CreateSpec => ({
		...spec,
		frame,
		lift: canvasLift(spec.size, frame) || undefined
	});
	let smallest: number | undefined;
	for (let frame = cell + 1; frame <= MAX_FRAME && !smallest; frame++)
		if ((frame - spec.size) % 2 === 0 && fits(framed(frame), frame)) smallest = frame;
	if (smallest) {
		const rounded = roundedFrame(spec.size, smallest),
			size = fits(framed(rounded), rounded) ? rounded : smallest;
		candidates.push({
			id: 'enlarge-frame',
			label: message('createReview.largerFrame', { size }),
			detail: message('createReview.largerFrameDetail', { size }),
			spec: framed(size)
		});
	}
	const options: CreatePaidOption[] = [];
	for (const candidate of candidates) {
		const { dry, outcome } = await replayCreate(candidate.spec);
		// The paid draw must be reused, never bought again; anything but a completion or an unbought step is no way on.
		if (dry.records[0]?.id !== base.id || (outcome && !(outcome instanceof Unpaid))) continue;
		const gens = outcome instanceof Unpaid ? unpaidCreateGens(outcome, dry) : 0;
		options.push({ ...candidate, gens, paid: gens > 0, primary: !options.length });
	}
	return options;
}

/** Insert-only publication. Concurrent/recovered completion can never replace an already customized character. */
export async function publishCreatedCharacter(
	rec: StoredProject,
	images: Map<Sha256, Img>
): Promise<string> {
	if (!rec.creationSpec)
		throw new LocalizedError(
			'This creation attempt has no saved fingerprint.',
			'create.errors.creationAttemptSavedFingerprint'
		);
	const blobs = new Map<string, Blob>();
	for (const [hash, im] of images)
		blobs.set(
			hash.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	try {
		rec.manifest.exportId ??= defaultCharacterExportId(rec.id, rec.manifest.name);
		await db.putCharacter(rec.id, rec, blobs);
	} catch (error) {
		if (!(await completedCreation(rec.id, rec.creationSpec))) throw error;
	}
	return rec.id;
}

export interface Progress {
	step: string;
	done: number;
	total: number;
	recIds: string[];
}

/** Creation = draw -> padded standing views -> re-import -> rest keypoints -> a Default-only rig (no animation calls).
 * `onViews` receives the standing views of the chosen directions as soon as the draw is normalized. */
export async function createCharacter(
	spec: CreateSpec,
	onProgress: (p: Progress) => void = () => {},
	onViews: (views: { id: DirectionName; img: Img }[]) => void = () => {},
	/** A review's dry run (reviewCreateResults): every request is read from the cache and nothing is published. */
	signal?: AbortSignal
): Promise<string> {
	const projectId = spec.projectId ?? `rig-${crypto.randomUUID()}`;
	if (!/^rig-[a-z0-9-]+$/.test(projectId))
		throw new LocalizedError(
			'This creation attempt has an invalid project identity. Start a new character.',
			'create.errors.creationAttemptInvalidProject'
		);
	const cell = spec.frame ?? CELL,
		directions = spec.directions,
		DIRS = directions.filter((d) => !d.mirrorOf).map((d) => d.id);
	const invalid = (english: string, key: WhisperKey, vars?: Record<string, string>) => [
		new LocalizedError(english, key, vars)
	];
	const errors = [
		...facingErrors(directions),
		...(spec.frame !== undefined
			? sizeErrors(spec.size, cell, spec.model)
			: bodyErrors(spec.size, spec.model)),
		...(!spec.description.trim() || spec.description.length > 2000
			? invalid('Enter a prompt of 1–2,000 characters.', 'create.errors.promptLength')
			: []),
		...(!Number.isSafeInteger(spec.seed) ||
		spec.seed < 0 ||
		spec.seed > Number.MAX_SAFE_INTEGER - 100_000
			? invalid('Invalid seed.', 'create.errors.invalidSeed')
			: []),
		...(spec.registrationSeed !== undefined &&
		(!Number.isSafeInteger(spec.registrationSeed) || spec.registrationSeed < 0)
			? invalid('Invalid seed.', 'create.errors.invalidSeed')
			: []),
		...(spec.view && !['low top-down', 'high top-down', 'side'].includes(spec.view)
			? invalid('Invalid camera.', 'create.errors.invalidCamera')
			: []),
		...(spec.model !== undefined && !MODEL_IDS.includes(spec.model)
			? invalid('Invalid model.', 'create.errors.invalidModel')
			: []),
		...((spec.outline !== undefined || spec.detail !== undefined) && !modelOf(spec.model).styleHints
			? invalid(
					`Outline and detail do not apply to ${modelOf(spec.model).label}.`,
					'create.errors.styleUnsupported',
					{ model: modelOf(spec.model).label }
				)
			: []),
		...(spec.outline !== undefined && !OUTLINE_VALUES.includes(spec.outline)
			? invalid('Invalid outline.', 'create.errors.invalidOutline')
			: []),
		...(spec.detail !== undefined && !DETAIL_VALUES.includes(spec.detail)
			? invalid('Invalid detail.', 'create.errors.invalidDetail')
			: [])
	];
	// The English message keeps every reason; the translated message shows the first.
	errors.splice(0, errors.length, ...blockingIssues(errors, spec.acceptedWarnings));
	if (errors.length)
		throw new LocalizedError(
			errors.map((e) => e.message).join(' '),
			errors[0].translation.key,
			errors[0].translation.vars
		);
	const referenceIssue = characterReferenceIssue(spec.reference, spec.model, cell, spec.size);
	if (referenceIssue && blockingIssues([referenceIssue], spec.acceptedWarnings).length)
		throw referenceIssue;
	const creationSpec = await sha256(
		stableStringify({ ...spec, projectId: undefined, activityScope: undefined })
	);
	if (await completedCreation(projectId, creationSpec)) return projectId; // completion may have committed before its UI acknowledgment
	const looks = creationLooks(spec),
		view = spec.view ?? 'low top-down';
	// 1. Draw the eight rotations before the shared rig registration.
	onProgress({ step: 'draw', done: 0, total: 1, recIds: [] });
	const drawSpec =
		spec.model === 'standard' && spec.reference
			? { ...spec, reference: await padStandardReference(spec.reference, spec.size) }
			: spec;
	const base = await run(
		drawRequest(drawSpec, spec.seed),
		{
			text: `${spec.name} · creating`,
			title: message('activity.titleDrawing', { name: spec.name })
		},
		'studio-base',
		false,
		true,
		signal,
		spec.activityScope
	);
	const drew = (failure: PaidFailure) => ({ step: 'draw', failure, recordId: base.id });

	// 2. all eight original rotations on the frame. Re-import for rest keypoints.
	onProgress({ step: 'rest', done: 0, total: 1, recIds: [] });
	const rots = labelViews(spec.model, await imagesOf(base)),
		rest = {} as Record<DirectionName, Img>,
		restWarnings: string[] = [];
	let pad: [number, number] = [0, 0];
	for (const d of DIRECTIONS) {
		const r = rots.find((x) => x.label === d);
		if (!r)
			throw new PaidStepError(
				`PixelLab returned no ${d} view`,
				'create.errors.pixellabReturnedView',
				{ direction: viewInline(d) },
				drew('frame-count')
			);
		const n = drawnView(spec, r.img, cell);
		if (n.cutPx)
			throw new PaidStepError(
				`The ${d} view does not fit the ${cell} px frame. Increase Frame or reduce Body size before creating again.`,
				'create.errors.viewDoesFitPx',
				{ direction: viewInline(d), cell },
				drew('overflow')
			);
		const top = opaqueBox(n.img)?.y0 ?? cell;
		if (!opaqueBox(n.img))
			throw new PaidStepError(
				`PixelLab returned an empty ${d} view.`,
				'create.errors.pixellabReturnedEmptyView',
				{ direction: viewInline(d) },
				drew('empty')
			);
		if (top < HEADROOM_MIN)
			restWarnings.push(
				`${d}: standing headroom ${top} px; tall hair or hats may need a larger frame`
			);
		rest[d] = n.img;
		pad = n.offset;
	}
	onViews(
		directions.map((d) => ({ id: d.id, img: d.mirrorOf ? flipH(rest[d.mirrorOf]) : rest[d.id] }))
	);
	// Register all eight ORIGINAL views, including south when it isn't selected. Never overwrite these with mirrors.
	const others = Object.fromEntries(
		await Promise.all(
			(Object.keys(rest) as Direction[])
				.filter((d) => d !== 'south')
				.map(async (d) => [d, png(await b64(rest[d]))])
		)
	);
	const imp = await run(
		routes.createCharacterV3({
			description: looks,
			reference_image: png(await b64(rest.south)),
			direction_images: others,
			n_directions: 8,
			view,
			template_id: 'mannequin',
			no_background: true,
			seed: spec.registrationSeed ?? spec.seed
		}),
		{
			text: `${spec.name} · rest views`,
			title: message('activity.titleRegistering', { name: spec.name })
		},
		'studio-base',
		false,
		true,
		signal,
		spec.activityScope
	);
	const charId = (imp.response as { character_id?: string })?.character_id;
	if (!charId)
		throw new PaidStepError(
			'PixelLab did not return a character ID',
			'create.errors.pixellabDidReturnCharacter',
			undefined,
			{ step: 'register', failure: 'empty', recordId: imp.id }
		);
	const ch = await run(
		routes.getCharacter(charId),
		{
			text: `${spec.name} · skeleton`,
			title: message('activity.titleRegistering', { name: spec.name })
		},
		'studio-base',
		true,
		false,
		signal,
		spec.activityScope
	);
	const refs = (
		ch.response as {
			skeletons?: {
				'2d_references'?: Record<string, { keypoints?: Record<string, { x: number; y: number }> }>;
			};
		}
	)?.skeletons?.['2d_references'];
	const restKps = {} as Record<DirectionName, Keypoint[]>,
		managed = managedRestKeypoints(refs, DIRS);
	for (const d of managed.unusable)
		restWarnings.push(
			`${d}: PixelLab returned incomplete or invalid standing joints; they were estimated from the drawn view`
		);
	for (const d of DIRS) {
		const kps = managed.poses[d] ?? (await joints(rest[d], true, signal, spec.activityScope)); // absent or unusable references take the bounded estimate fallback
		if (signal && dryRuns.get(signal)?.unmeasured) continue;
		if (!hasAll(kps))
			throw new PaidStepError(
				`no valid joints found on the ${d} view`,
				'create.errors.validJointsFoundView',
				{ direction: viewInline(d) },
				{ step: 'register', failure: 'joints', recordId: imp.id }
			);
		restKps[d] = kps!;
	}
	const dryJoints = signal && dryRuns.get(signal);
	if (dryJoints && dryJoints.unmeasured) throw new Unpaid('/estimate-skeleton', dryJoints.running);

	// 3. freeze the Default move: one standing frame per direction, posed by its own rest keypoints (`imported-rest`, so items
	// reuse their dressed standing view for it). Idle, walk and other moves are added from Moves through addMove.
	onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
	const built = await buildRig(
		[{ id: DEFAULT_MOVE, dirs: Object.fromEntries(DIRS.map((d) => [d, [rest[d]]])) }],
		{ size: cell, directions }
	);
	if (built.errors.length)
		throw new LocalizedError(
			`The standing views do not fit together: ${built.errors.slice(0, 3).join('; ')}`,
			'create.errors.standingViewsDoFit',
			{ reasons: built.errors.slice(0, 3).join('; ') }
		);
	const rig = built.rig;
	rig.view = view;
	rig.template = 'mannequin';
	rig.pad = { x: pad[0], y: pad[1] };
	const provenance: Provenance[] = [provOf(base), provOf(imp)];
	rig.rest = {};
	for (const d of DIRS) rig.rest[d] = { image: await cellHash(rest[d]), keypoints: restKps[d] };
	// Retain unselected originals for a future account reconnection, without estimating unused joints or animating them.
	for (const d of DIRECTIONS.filter((d) => !DIRS.includes(d))) {
		rig.rest[d] = {
			image: await cellHash(rest[d]),
			keypoints: managedPose(refs?.[d]?.keypoints) ?? []
		};
	}
	const anim = rig.animations[0];
	anim.sources = Object.fromEntries(
		DIRS.map((d) => [
			d,
			{
				route: 'v3',
				reference: rig.rest![d]!.image,
				keypoints: [restKps[d]],
				measured: [restKps[d]],
				motion: 'imported-rest',
				provenance: [0, 1]
			} satisfies ClipSource
		])
	);
	const skel: Record<string, Skeleton> = {};
	for (const d of DIRS)
		skel[built.cells[cellKey(DEFAULT_MOVE, d, 0)].hash] = fromApi(restKps[d], rig.cell);
	const tracks = anchorTracks(built, skel);
	rig.anchors = tracks.anchors;
	const cells: Record<string, Partial<Record<DirectionName, Sha256[]>>> = {};
	const skeletons: Record<string, Skeleton> = {};
	for (const k of cellKeys(rig)) {
		const [a, d, i] = k.split('/') as [string, DirectionName, string],
			c = built.cells[k];
		((cells[a] ??= {})[d] ??= [])[+i] = c.hash;
		const s = c.mirrorOf ? skel[built.cells[cellKey(a, c.mirrorOf, +i)].hash] : skel[c.hash];
		if (s) skeletons[k] = c.mirrorOf ? flipSkeleton(s, cell) : s;
	}
	const errs = validateRig(
		rig,
		Object.fromEntries(Object.entries(built.cells).map(([key, c]) => [key, c.hash]))
	);
	if (errs.length)
		throw new LocalizedError(`rig not valid: ${errs.join('; ')}`, 'create.errors.rigValid', {
			errs: errs.join('; ')
		});
	const manifest: Manifest = {
		format: CURRENT_FORMAT,
		name: spec.name,
		app: 'PixelDoll 0.1.0',
		rig,
		materials: [],
		slots: [{ id: 'body', z: 10, class: 'base', required: true }],
		items: [
			{
				id: 'base',
				name: 'Base body',
				slot: 'body',
				status: 'accepted',
				mirror: rig.directions.some((d) => d.mirrorOf) ? 'flip' : 'generate',
				materials: [],
				prompt: spec.description,
				baseHash: rig.baseHash,
				layers: [{ id: 'main', role: 'fg', z: 10, cells }],
				provenance
			}
		],
		presets: [{ id: 'default', name: 'Base', items: { body: 'base' }, variants: {} }]
	};
	const rec: StoredProject = {
		id: projectId,
		creationSpec,
		savedAt: new Date().toISOString(),
		manifest,
		skeletons,
		character: { id: charId, looks },
		origin: 'studio',
		rigQa: {
			warnings: [...restWarnings, ...built.warnings],
			pivotFrom: built.pivotFrom,
			clips: {},
			tracks: tracks.stats.map(({ points: _, ...t }) => t)
		}
	};
	const images = new Map<Sha256, Img>(Object.values(built.cells).map((c) => [c.hash, c.img]));
	for (const d of Object.keys(rig.rest) as DirectionName[]) images.set(rig.rest[d]!.image, rest[d]);
	if (signal && dryRuns.get(signal)) throw new Unpaid('publish');
	await publishCreatedCharacter(rec, images);
	db.askPersist();
	return rec.id;
}

// ---------- add a move ----------
/** `replace`: re-render an existing clip (B9: the Ranger's managed idle -> authored idle) and re-pose `items` onto it. */
/** itemsOnly: the caller poses items onto a move the body already has (Make it, item frame repair); finishing changes no move. */
export interface MoveSpec {
	id: string;
	motionSource?: 'managed' | 'standalone';
	startFrom?: MoveSource;
	action?: string;
	text?: string;
	frames: number;
	animation?: MoveAnimationOptions;
	items: string[];
	itemsOnly?: true;
	reviewBeforePublish?: true;
	reviewRegeneration?: { id: string; seed: number; activityScope?: string };
	reviewedMoveItems?: true;
	seed: number;
	/** Per-view seed salts chosen in a paid-result review: only that view's failed step is bought again. */
	reroll?: Partial<Record<DirectionName, { motion?: number; render?: number }>>;
	/** Consent from a paid-result review to save the cached body frames of views that came back without measured joints on
	 *  some frames: body only, and those views without poses (no sources, skeletons or anchors) and listed in rigQa.redo, to
	 *  make again before items can be fitted there. Views with measured joints keep their poses. Joints are never invented. */
	keepUnposed?: true;
	/** Consent from a paid-result review to save a new move with only its finished views (`dirs`): the other views stopped,
	 *  are listed in the review, and can be made later as a partial replacement at the same frame count. */
	finishedViews?: true;
	/** The records a review replayed for a free choice (keepUnposed, finishedViews): its run reuses exactly these. */
	reviewedReceipts?: string[];
	/** The attempt a reviewed continuation runs as (default: the seed). A new one reopens requests the stopped attempt
	 *  canceled before sending (queue autoCanceledAttempts), so they are sent instead of replayed as stopped. */
	attempt?: number;
	/** Consent to raise each overflowing motion frame of a view by these rows so the skeleton source fits the frame. */
	motionLift?: Partial<Record<DirectionName, number[]>>;
	/** Preflight warnings (PreflightWarning ids from movePreflightWarnings) the user chose to generate past. */
	acceptedWarnings?: string[];
	replace?: boolean;
	activityScope?: string;
	dirs?: DirectionName[];
	approvedDirs?: DirectionName[];
	itemMethod?: 'grid' | 'anchor';
	preferTierOneRepair?: true;
	redrawItem?: true;
	reuseItemFrames?: true;
	itemReview?: { gens: number; artwork: string };
	poseStyle?: 'visible-side-v1';
	measurementRecovery?: {
		id: string;
		recordIds: string[];
		checkHashes: string[];
		rigVersion: string;
		/** Explicit consent to save reviewed cached body frames despite numerical body warnings (KeepBodyPlan.qaHash). */
		keep?: { qaHash: string };
	};
	bodyPaletteRepair?: {
		id: string;
		version: 'near-rest-v1';
		checkHashes: string[];
		rigVersion: string;
	};
}
const recoverySpecHash = (spec: MoveSpec) =>
	sha256(stableStringify({ ...spec, measurementRecovery: undefined, activityScope: undefined }));
function approvedCheckHashes(value: unknown): Set<string> {
	const invalid = () =>
		new LocalizedError(
			'The reviewed joint-check hashes are invalid. Review the body frames and cost again.',
			'create.errors.reviewedJointCheckHashes'
		);
	if (!Array.isArray(value)) throw invalid();
	const hashes = new Set<string>();
	for (const hash of value) {
		if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash) || hashes.has(hash))
			throw invalid();
		hashes.add(hash);
	}
	return hashes;
}
function approvedMeasurementIds(intent: unknown): string[] | undefined {
	if (intent === undefined) return undefined;
	const invalid = () =>
		new LocalizedError(
			'The joint-check recovery intent is invalid.',
			'create.errors.jointCheckRecoveryIntent'
		);
	if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw invalid();
	const value = intent as Partial<NonNullable<MoveSpec['measurementRecovery']>>;
	if (
		typeof value.id !== 'string' ||
		!value.id.trim() ||
		typeof value.rigVersion !== 'string' ||
		!value.rigVersion ||
		!Array.isArray(value.recordIds)
	)
		throw invalid();
	const seen = new Set<string>();
	for (const id of value.recordIds) {
		if (typeof id !== 'string' || !id.trim() || seen.has(id)) throw invalid();
		seen.add(id);
	}
	approvedCheckHashes(value.checkHashes);
	if (
		value.keep !== undefined &&
		(!value.keep ||
			typeof value.keep !== 'object' ||
			typeof value.keep.qaHash !== 'string' ||
			!/^[a-f0-9]{64}$/.test(value.keep.qaHash) ||
			value.recordIds.length ||
			value.checkHashes!.length)
	)
		throw invalid();
	return value.recordIds;
}
function checkedPaletteIntent(intent: unknown, checkHashes = true): void {
	if (intent === undefined) return;
	if (!intent || typeof intent !== 'object' || Array.isArray(intent))
		throw new LocalizedError(
			'The body color-repair intent is invalid.',
			'create.errors.bodyColorRepairIntent'
		);
	const value = intent as Partial<NonNullable<MoveSpec['bodyPaletteRepair']>>;
	if (
		value.version !== 'near-rest-v1' ||
		typeof value.id !== 'string' ||
		!value.id.trim() ||
		typeof value.rigVersion !== 'string' ||
		!value.rigVersion
	)
		throw new LocalizedError(
			'This character or color-repair policy changed since review.',
			'create.errors.characterColorRepairPolicy'
		);
	if (checkHashes) approvedCheckHashes(value.checkHashes);
}
/** A completed body publication can outlive failed equipment work; only its exact durable receipt permits resuming. */
async function publishedMoveRecovery(rec: StoredProject, spec: MoveSpec): Promise<boolean> {
	const receipt = rec.moveRecovery,
		intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
	return (
		!!intent &&
		!!receipt &&
		receipt.id === intent.id &&
		receipt.originalRigVersion === intent.rigVersion &&
		receipt.specHash === (await recoverySpecHash(spec)) &&
		receipt.bodyRigVersion === moveRigVersion(rec)
	);
}
export const MOVE_STEPS = [
	{ id: 'animate', label: message('create.moveSteps.animate') },
	{ id: 'save', label: message('create.moveSteps.save') },
	{ id: 'items', label: message('create.moveSteps.items') }
];
export const moveRigReady = (rec?: Pick<StoredProject, 'manifest' | 'character'> | null) =>
	rigReady(rec, false);
export const moveLooks = (rec: Pick<StoredProject, 'manifest' | 'character'>) =>
	rec.character?.looks?.trim() ? rec.character.looks : rec.manifest.name || 'the character';
/** Why a move can't take this id: Default is every character's standing views, never generated or replaced. */
export const reservedMove = (id: string, existingMove = false) =>
	id === DEFAULT_MOVE || (id === 'standing' && !existingMove)
		? new LocalizedError(
				'Standing is a reserved State. Name the move something else.',
				'create.errors.reservedMove'
			)
		: undefined;
function approvedMoveDirections(m: Manifest, spec: MoveSpec): DirectionName[] {
	const dirs = moveDirections(m, spec.dirs),
		approved = spec.approvedDirs;
	if (approved && (approved.length !== dirs.length || dirs.some((dir) => !approved.includes(dir))))
		throw new LocalizedError(
			'Character directions changed. Review the move’s current estimate before trying again. No generation was requested.',
			'create.errors.moveDirectionsChanged'
		);
	return dirs;
}
interface BodyPaletteStats {
	directions: DirectionName[];
	changedPixels: number;
	rawOutliers: number;
	remainingOutliers: number;
	changedFrames: number;
}
export interface MeasurementRecoveryPlan {
	recordIds: string[];
	checkHashes: string[];
	checks: number;
	gens: number;
	usd: number;
	rigVersion: string;
	rawHashes: string[];
	palette?: BodyPaletteStats;
}
export interface BodyPaletteRepairPlan extends MeasurementRecoveryPlan, BodyPaletteStats {
	itemGens: number;
}
/** Cached body frames that passed every structural check but not the numerical body checks; saving them is the user's call. */
export interface KeepBodyPlan {
	qaHash: string;
	rigVersion: string;
	rawHashes: string[];
	directions: { dir: DirectionName; frames: Img[]; warnings: string[] }[];
}
interface CachedBodyClip {
	dir: DirectionName;
	rawHash: string;
	rest: Img;
	keypoints: Keypoint[][] | undefined;
	frames: Img[];
	facing?: { dir: string; rest: Keypoint[] };
	lifts?: readonly number[];
	notes?: FrameNotes;
}
/** An expected eligibility limit, distinct from a failed storage read or malformed PNG. */
class RecoveryUnavailable extends LocalizedError {}
/** Review only the selected standing views and exact cached results, never unrelated equipment sheets. */
async function recoveryContext(projectId: string) {
	const rec = await db.get<StoredProject>('projects', projectId);
	if (!rec) throw new Error(`project ${projectId} not found`);
	const images = new Map<string, Promise<Img>>(),
		normalized = new WeakMap<Img, ReturnType<typeof normalize>>();
	const encoded = new WeakMap<Img, Promise<string>>(),
		measurements = new WeakMap<Img, ReturnType<typeof measurementInput>>();
	return {
		rec,
		jobs: queue.snapshot().jobs,
		read(sha: string): Promise<Img> {
			let image = images.get(sha);
			if (!image) {
				image = db.getBlob(sha).then((blob) => {
					if (!blob)
						throw new LocalizedError(
							`Cached recovery image ${sha.slice(0, 12)} is missing in storage.`,
							'create.errors.cachedRecoveryImageMissing',
							{ sha: sha.slice(0, 12) }
						);
					return decodePng(blob);
				});
				images.set(sha, image);
			}
			return image;
		},
		normalize(image: Img) {
			let value = normalized.get(image);
			if (!value) {
				value = normalize(
					image,
					rec.manifest.rig.cell.w,
					rec.manifest.rig.cell.h,
					128,
					rec.manifest.rig.cell.w
				);
				normalized.set(image, value);
			}
			return value;
		},
		encode(image: Img) {
			let value = encoded.get(image);
			if (!value) {
				value = b64(image);
				encoded.set(image, value);
			}
			return value;
		},
		measurement(image: Img) {
			let value = measurements.get(image);
			if (!value) {
				value = measurementInput(image);
				measurements.set(image, value);
			}
			return value;
		}
	};
}
type RecoveryContext = Awaited<ReturnType<typeof recoveryContext>>;
interface MoveRecoveryReview {
	recovery?: MeasurementRecoveryPlan;
	colorRepair?: BodyPaletteRepairPlan;
	keep?: KeepBodyPlan;
	/** English, for logs and tests; `unavailableMessages` holds the same reasons for display. */
	unavailable?: string;
	unavailableMessages?: Message[];
}
const unavailableOf = (reasons: LocalizedError[]) =>
	reasons.length
		? {
				unavailable: reasons.map((r) => r.message).join(' '),
				unavailableMessages: reasons.map((r) => r.translation)
			}
		: {};
/** Recovery reuses completed body artwork: chosen views of a replacement, or every drawn view of a new move. */
function recoveryScopeIssue(
	m: Manifest,
	spec: MoveSpec,
	allowMotion = false
): RecoveryUnavailable | undefined {
	const authored =
		!spec.itemsOnly &&
		!spec.itemMethod &&
		(isAuthoredAction(spec.action) ||
			((allowMotion || moveAnimationModel(spec) !== 'skeleton-v3') && !bodyMoveIssue(m, spec))) &&
		(!!spec.dirs?.length || moveAnimationModel(spec) !== 'skeleton-v3');
	if (!authored)
		return new RecoveryUnavailable(
			'Joint-check recovery needs the original authored body-repair settings.',
			'create.errors.recoveryNeedsAuthored'
		);
	if (spec.replace) return undefined;
	if (m.rig.animations.some((a) => a.id === spec.id))
		return new RecoveryUnavailable(
			'This move was saved since that attempt. Nothing is left to recover.',
			'create.errors.recoveryAlreadySaved'
		);
	return moveDirections(m, spec.dirs).length === genDirs(m).length
		? undefined
		: new RecoveryUnavailable(
				'A new move needs every independently drawn direction.',
				'create.errors.newMoveNeedsEvery'
			);
}
/** One local review owns its memoized images. Reopening or executing always reads and validates fresh state. */
export async function reviewMoveRecovery(
	projectId: string,
	spec: MoveSpec
): Promise<MoveRecoveryReview> {
	if (
		spec.itemsOnly ||
		spec.itemMethod ||
		(!spec.dirs?.length && moveAnimationModel(spec) === 'skeleton-v3')
	)
		return {};
	const context = await recoveryContext(projectId);
	if (await publishedMoveRecovery(context.rec, spec)) return {};
	if (recoveryScopeIssue(context.rec.manifest, spec, true)) return {};
	// A new review grants no consent. Reconstruct the candidate against current inputs, keeping the exact color policy.
	const inspection = {
		...spec,
		measurementRecovery: undefined,
		bodyPaletteRepair: spec.bodyPaletteRepair && {
			...spec.bodyPaletteRepair,
			rigVersion: moveRigVersion(context.rec)
		}
	};
	try {
		const candidates: CachedBodyClip[] = [],
			plan = await inspectMeasurementRecovery(context, inspection, true, candidates);
		if (plan.checks && moveAnimationModel(spec) === 'skeleton-v3' && !isAuthoredAction(spec.action))
			return unavailableOf([
				new RecoveryUnavailable(
					'Keeping this move requires completed cached joint checks for every frame.',
					'create.errors.keepNeedsChecks'
				)
			]);
		if (plan.checks && plan.recordIds.length) return { recovery: plan };
		if (plan.checks)
			return unavailableOf([
				new RecoveryUnavailable(
					'Cached frames have no failed joint checks to retry.',
					'create.errors.noFailedChecks'
				)
			]);
		if (spec.bodyPaletteRepair) return { recovery: plan };
		// Color matching and keeping are independent choices: a limit on one never hides the other.
		let colorRepair: BodyPaletteRepairPlan | undefined;
		const unavailable: RecoveryUnavailable[] = [];
		try {
			if (moveAnimationModel(spec) === 'skeleton-v3' && isAuthoredAction(spec.action))
				colorRepair = await inspectBodyPaletteRepair(context, inspection);
		} catch (error) {
			if (!(error instanceof RecoveryUnavailable)) throw error;
			unavailable.push(error);
		}
		let keep: KeepBodyPlan | undefined;
		try {
			keep = await inspectKeptBody(context, inspection, plan, candidates);
		} catch (error) {
			if (!(error instanceof RecoveryUnavailable)) throw error;
			unavailable.push(error);
		}
		if (colorRepair || keep || unavailable.length)
			return { colorRepair, keep, ...unavailableOf(unavailable) };
		return spec.measurementRecovery ? { recovery: plan } : {};
	} catch (error) {
		if (error instanceof RecoveryUnavailable) return unavailableOf([error]);
		throw error;
	}
}
/** API-free: recompute the exact published checks of the original render from completed cached joints. Only frames that
 * fit, measured every joint and failed nothing structural can be kept; a clean clip needs no Keep. */
async function inspectKeptBody(
	context: RecoveryContext,
	spec: MoveSpec,
	plan: MeasurementRecoveryPlan,
	candidates: CachedBodyClip[]
): Promise<KeepBodyPlan | undefined> {
	if (spec.bodyPaletteRepair || plan.checks || plan.recordIds.length) return undefined;
	const clips = await Promise.all(
		candidates.map(async (c) => {
			const measured = await Promise.all(
				c.frames.map(async (f) => cachedJoints(context.jobs, await context.measurement(f), f))
			);
			if (measured.some((k) => !hasAll(k)))
				throw new RecoveryUnavailable(
					`${directionLabel(c.dir)}: some frames have no valid measured joints, so they cannot be kept.`,
					'create.errors.someFramesValidMeasured',
					{ direction: viewName(c.dir) }
				);
			return {
				...c,
				qa: bodyClipQa(spec.id, c.rest, c.frames, c.keypoints, measured, c.facing, c.lifts, c.notes)
			};
		})
	);
	const broken = clips.find((c) => c.qa.fails.length);
	if (broken)
		throw new RecoveryUnavailable(
			`${directionLabel(broken.dir)}: ${broken.qa.fails.join('; ')}. These frames cannot be kept.`,
			'create.errors.framesCannotKept',
			{ direction: viewName(broken.dir), reasons: broken.qa.fails.join('; ') }
		);
	if (
		!clips.length ||
		!clips.some((c) => failsBodyGate(c.qa, moveAnimationModel(spec) !== 'skeleton-v3'))
	)
		return undefined;
	return {
		qaHash: await keptBodyHash(plan.rigVersion, clips),
		rigVersion: plan.rigVersion,
		rawHashes: plan.rawHashes,
		directions: clips.map((c) => ({
			dir: c.dir,
			frames: c.frames,
			warnings: warn(`${spec.id}/${c.dir}`, c.qa)
		}))
	};
}
/** Preview the fixed, versioned color repair against cached raw art; no body or joint request is sent. */
export async function bodyPaletteRepairPlan(
	projectId: string,
	spec: MoveSpec
): Promise<BodyPaletteRepairPlan> {
	const plan = await inspectBodyPaletteRepair(await recoveryContext(projectId), spec);
	if (!plan)
		throw new RecoveryUnavailable(
			'No palette-only body failure can be matched safely.',
			'create.errors.paletteOnlyBodyFailure'
		);
	return plan;
}
async function inspectBodyPaletteRepair(
	context: RecoveryContext,
	spec: MoveSpec
): Promise<BodyPaletteRepairPlan | undefined> {
	const { rec } = context;
	const plan = await inspectMeasurementRecovery(
		context,
		{
			...spec,
			measurementRecovery: undefined,
			bodyPaletteRepair: {
				id: 'palette-review',
				version: 'near-rest-v1',
				checkHashes: [],
				rigVersion: moveRigVersion(rec)
			}
		},
		true
	);
	if (!plan.palette?.directions.length) return undefined;
	if (plan.recordIds.length)
		throw new RecoveryUnavailable(
			'Review unknown joint-check outcomes before matching these body colors.',
			'create.errors.reviewUnknownJointCheck'
		);
	return {
		...plan,
		...plan.palette,
		itemGens: poseGens(
			spec.items.length,
			moveFrames(rec.manifest, spec),
			moveDirections(rec.manifest, spec.dirs).length
		)
	};
}
/** API-free review of exact cached body renders. Consent never applies to an unrelated image or regenerated body. */
export async function measurementRecoveryPlan(
	projectId: string,
	spec: MoveSpec
): Promise<MeasurementRecoveryPlan> {
	return inspectMeasurementRecovery(await recoveryContext(projectId), spec);
}
async function inspectMeasurementRecovery(
	context: RecoveryContext,
	spec: MoveSpec,
	reviewOnly = false,
	candidates?: CachedBodyClip[]
): Promise<MeasurementRecoveryPlan> {
	const { rec, jobs } = context;
	const rig = rec.manifest.rig,
		rigVersion = moveRigVersion(rec),
		model = moveAnimationModel(spec),
		framesRequested = moveFrames(rec.manifest, spec);
	const scopeIssue = recoveryScopeIssue(
		rec.manifest,
		spec,
		(reviewOnly && !spec.bodyPaletteRepair) || !!spec.measurementRecovery?.keep
	);
	if (scopeIssue) throw scopeIssue;
	const approved = reviewOnly ? undefined : approvedMeasurementIds(spec.measurementRecovery);
	checkedPaletteIntent(spec.bodyPaletteRepair, !reviewOnly);
	const intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
	const allowed = !reviewOnly && intent ? approvedCheckHashes(intent.checkHashes) : undefined;
	if (
		spec.bodyPaletteRepair &&
		(model !== 'skeleton-v3' ||
			spec.bodyPaletteRepair.version !== 'near-rest-v1' ||
			!spec.bodyPaletteRepair.id ||
			spec.bodyPaletteRepair.rigVersion !== rigVersion)
	)
		throw new LocalizedError(
			'This character or color-repair policy changed since review.',
			'create.errors.characterColorRepairPolicy'
		);
	if (spec.measurementRecovery && spec.measurementRecovery.rigVersion !== rigVersion)
		throw new LocalizedError(
			'This character changed since these joint checks were reviewed.',
			'create.errors.characterChangedSinceJoint'
		);
	const seen = new Set<string>(),
		needed = new Set<string>(),
		recordIds = new Set<string>(),
		rawHashes: string[] = [];
	const palette: BodyPaletteStats = {
		directions: [],
		changedPixels: 0,
		rawOutliers: 0,
		remainingOutliers: 0,
		changedFrames: 0
	};
	for (const d of moveDirections(rec.manifest, spec.dirs)) {
		const rest = moveReferenceView(rec.manifest, spec, d);
		if (!rest || !hasAll(rest.keypoints))
			throw new LocalizedError(
				`${d}: original standing artwork or joints are missing.`,
				'create.errors.originalStandingArtworkJoints',
				{ direction: viewName(d) }
			);
		const restImg = await context.read(rest.image.slice(7));
		const start = await moveReferenceImage(spec.animation?.references?.[d], 'start', rig.cell);
		const startPoints =
			start && model === 'skeleton-v3'
				? cachedJoints(jobs, await context.measurement(start), start)
				: undefined;
		if (start && model === 'skeleton-v3' && (!startPoints || !hasAll(startPoints)))
			throw new RecoveryUnavailable(
				'Cached body reuse requires completed joint checks.',
				'create.errors.cachedBodyReuseRequires'
			);
		let keypoints: Keypoint[][] | undefined, notes: FrameNotes | undefined;
		const authored = isAuthoredAction(spec.action);
		if (model === 'skeleton-v3' && authored)
			keypoints = authoredPoses(
				spec.action!,
				fromApi(rest.keypoints, rig.cell),
				d,
				rig.cell.w,
				spec.poseStyle
			).map((p) => armDepth(toApi(p, rig.cell), d));
		else if (model === 'skeleton-v3') {
			const motionStart = start ?? restImg;
			const request = moveMotionRequest(rec, spec, d as Direction, await b64(motionStart)),
				hash = (await requestIdentity(request)).requestHash,
				record = jobs.find((job) => job.requestHash === hash && job.state === 'done');
			if (!record)
				throw new RecoveryUnavailable(
					`${d}: the original completed motion is unavailable. No request was made.`,
					'create.errors.originalCompletedMotionUnavailable',
					{ direction: viewName(d) }
				);
			const { frames, short } = await normalizeMotionFrames(
				record,
				(await imagesOf(record, context.read)).map((out) => out.img),
				d as Direction,
				`${spec.id} ${d} (motion)`,
				viewWords(rec.manifest, spec.id, d),
				moveMotionFrames(rec.manifest, spec),
				rig.cell.w,
				motionStart,
				motionEchoRule(spec),
				spec.motionLift?.[d],
				'motion',
				moveMotionSource(spec) === 'standalone' ? 0 : artMapping(rig, d)
			);
			// Only a check that completed with invalid joints may be bridged; a lost, stopped or unsent one is unknown.
			const checks = await Promise.all(
				frames.map(async (frame) => {
					if (!opaqueBox(frame)) return { done: true, points: undefined }; // never measured: nothing to wait for
					const measurement = await context.measurement(frame);
					return {
						done: jobs.some((r) => r.requestHash === measurement.hash && r.state === 'done'),
						points: cachedJoints(jobs, measurement, frame)
					};
				})
			);
			const measured = checks.every((check) => check.done)
				? motionJoints(checks.map((check) => check.points))
				: undefined;
			const gaps = checks.flatMap((check, i) => (hasAll(check.points) ? [] : [i]));
			if (gaps.length || short)
				notes = {
					of: frames.length,
					...(gaps.length ? { bridged: gaps } : {}),
					...(short ? { short } : {})
				};
			if (!measured)
				throw new RecoveryUnavailable(
					`${d}: the original motion has no valid completed joint checks for every frame. No request was made.`,
					'create.errors.originalMotionValidCompleted',
					{ direction: viewName(d) }
				);
			keypoints = measured;
			rawHashes.push(hash);
		}
		if (keypoints)
			keypoints = movePoseEndpoints(
				sampleMovePoses(keypoints, framesRequested, spec.action, spec.animation?.loop),
				startPoints
			);
		for (
			let attempt = 0;
			attempt < (spec.bodyPaletteRepair || model !== 'skeleton-v3' ? 1 : CLIP_ATTEMPTS);
			attempt++
		) {
			const first = await context.encode(model === 'skeleton-v3' ? (start ?? restImg) : restImg);
			const req =
				model !== 'skeleton-v3'
					? nativeMoveRequest(rec, spec, d, model, first)
					: rawClip({
							first,
							rest: startPoints ?? rest.keypoints,
							keypoints: keypoints!,
							description: moveLooks(rec),
							action: bodyAction(spec),
							dir: d,
							seed: viewSeed(spec, d, 'render')! + attempt * 7919,
							view: rig.view
						});
			const rawHash = (await requestIdentity(req)).requestHash;
			const raw = jobs.find((r) => r.requestHash === rawHash && r.state === 'done');
			if (!raw) {
				if (!attempt)
					throw new RecoveryUnavailable(
						`${d}: the original completed body render is unavailable. No body was regenerated.`,
						'create.errors.originalCompletedBodyRender',
						{ direction: viewName(d) }
					);
				break;
			}
			const outputs = await imagesOf(raw, context.read);
			if (
				model === 'skeleton-v3' &&
				(outputs.length !== framesRequested || outputs.some((o) => !o.img.w || !o.img.h))
			)
				throw new LocalizedError(
					`${d}: the cached body render is incomplete.`,
					'create.errors.cachedBodyRenderIncomplete',
					{ direction: viewName(d) }
				);
			rawHashes.push(rawHash);
			const nativeFrames =
				model !== 'skeleton-v3' &&
				(await normalizeNativeMoveFrames(
					raw,
					outputs,
					spec.id,
					viewWords(rec.manifest, spec.id, d),
					d,
					framesRequested,
					start ?? restImg,
					model
				));
			const normalized = nativeFrames ? [] : outputs.map((out) => context.normalize(out.img));
			if (normalized.some((n) => n.cutPx || !opaqueBox(n.img)))
				throw new LocalizedError(
					`${d}: the cached body frames do not fit this character. No body was regenerated.`,
					'create.errors.cachedBodyFramesDo',
					{ direction: viewName(d) }
				);
			const frames = nativeFrames ? nativeFrames.frames : normalized.map((n) => n.img);
			if (nativeFrames && nativeFrames.short) notes = { of: frames.length, short: true };
			// Only the first render is ever published; a later seed is a legacy attempt, never a keep candidate.
			if (!attempt && !spec.bodyPaletteRepair)
				candidates?.push({
					dir: d,
					rawHash,
					rest: restImg,
					keypoints,
					frames,
					...(spec.motionLift?.[d] ? { lifts: spec.motionLift[d] } : {}),
					...(notes ? { notes } : {}),
					...(authored && model === 'skeleton-v3'
						? {}
						: { facing: { dir: d, rest: rest.keypoints } })
				});
			const candidate = spec.bodyPaletteRepair
				? await paletteCandidate(spec.id, d, restImg, frames, keypoints!, 0, context)
				: { frames };
			if ('processing' in candidate && candidate.processing) {
				palette.directions.push(d);
				palette.changedPixels += candidate.processing.changedPixels;
				palette.rawOutliers += candidate.processing.rawOutliers;
				palette.remainingOutliers += candidate.processing.remainingOutliers;
				palette.changedFrames += candidate.processing.changedFrames.length;
			}
			for (const frame of candidate.frames) {
				const { input, hash } = await context.measurement(frame);
				if (seen.has(hash)) continue;
				seen.add(hash);
				const matches = jobs
					.filter((r) => r.requestHash === hash)
					.reverse()
					.sort((a, b) => b.createdAt - a.createdAt);
				const reviewed = approved ? matches.filter((r) => approved.includes(r.id)) : [];
				for (const old of reviewed) {
					if (!retryableEstimate(old))
						throw new LocalizedError(
							'A reviewed joint check is no longer eligible for explicit recovery.',
							'create.errors.reviewedJointCheckLonger'
						);
					recordIds.add(old.id);
				}
				const done = matches.find((r) => r.state === 'done');
				if (done) {
					const points = checkedKeypoints((done.response as { keypoints?: unknown })?.keypoints);
					if (!points || !checkedKeypoints(unpadSkeleton(points, input, frame)))
						throw new LocalizedError(
							'A completed joint check has invalid measurements.',
							'create.errors.completedJointCheckInvalid'
						);
					continue;
				}
				const active = matches.find(live);
				if (active) {
					if (
						!spec.measurementRecovery ||
						active.estimateRecovery?.id !== spec.measurementRecovery.id
					)
						throw new RecoveryUnavailable(
							'Wait for the current joint checks to finish before recovering them.',
							'create.errors.waitCurrentJointChecks'
						);
					needed.add(hash);
					continue;
				}
				const latest = matches[0];
				if (latest) {
					if (
						spec.measurementRecovery &&
						latest.estimateRecovery?.id === spec.measurementRecovery.id
					) {
						needed.add(hash);
						continue;
					}
					if (!retryableEstimate(latest) || (approved && !approved.includes(latest.id)))
						throw new LocalizedError(
							'A joint-check outcome changed. Review the exact checks again before retrying.',
							'create.errors.jointCheckOutcomeChanged'
						);
					recordIds.add(latest.id);
				}
				needed.add(hash);
			}
		}
	}
	if (approved && (recordIds.size !== approved.length || approved.some((id) => !recordIds.has(id))))
		throw new LocalizedError(
			'The reviewed joint checks do not match these exact cached body frames.',
			'create.errors.reviewedJointChecksDo'
		);
	if (approved && !approved.length && needed.size)
		throw new LocalizedError(
			'Cached body reuse requires completed joint checks. Review the unfinished checks before continuing.',
			'create.errors.cachedBodyReuseRequires'
		);
	if (allowed && [...needed].some((hash) => !allowed.has(hash)))
		throw new LocalizedError(
			'The pending joint checks changed. Review their exact frames and cost again.',
			'create.errors.pendingJointChecksChanged'
		);
	return {
		recordIds: [...recordIds].sort(),
		checkHashes: [...needed].sort(),
		checks: needed.size,
		gens: +(needed.size * EST).toFixed(2),
		usd: +(needed.size * 0.00513).toFixed(5),
		rigVersion,
		rawHashes,
		...(spec.bodyPaletteRepair ? { palette } : {})
	};
}

/** Moves a saved item lacks, e.g. idle and walk added after it was planned on the standing views, as items-only specs (addMove
 * keeps the body clip and poses only these directions, the same request "Make it" sends). Only directions the body has frames
 * and stored keypoints for count (the Default move's standing views are never posed). The user starts them from a priced offer; nothing is queued automatically (credits are real money). */
export function missingItemMoves(
	m: Manifest,
	itemId: string,
	seed = 1 + Math.floor(Math.random() * 1_000_000)
): MoveSpec[] {
	const item = extendable(m, itemId);
	if (!item) return [];
	const { clipDirs } = coverage({ rec: { manifest: m } } as RigCtx);
	const anchored = item.route === 'ea2-anchor';
	const posableDir = (a: RigAnimation, d: DirectionName) =>
		a.sources?.[d]?.motion !== 'imported-rest' &&
		(anchored ? !!item.dressed?.[d] : a.sources?.[d]?.keypoints?.length === a.cells);
	return m.rig.animations
		.map((a) => ({
			a,
			dirs: (clipDirs?.[a.id] ?? []).filter(
				(d) => posableDir(a, d) && !hasCompleteCells(m, item, a.id, d)
			)
		}))
		.filter(({ dirs }) => dirs.length)
		.map(({ a, dirs }) => ({
			id: a.id,
			frames: a.cells,
			items: [item.id],
			dirs,
			itemsOnly: true,
			seed,
			...(anchored ? { itemMethod: 'anchor' as const } : {})
		}));
}
export function partialMoveFrameIssue(
	m: Manifest,
	spec: Pick<MoveSpec, 'id'> & MoveFrameSpec,
	directionCount: number
): LocalizedError | undefined {
	const existing = m.rig.animations.find((move) => move.id === spec.id);
	return existing && directionCount !== genDirs(m).length && existing.cells !== moveFrames(m, spec)
		? new LocalizedError(
				'A partial repair must keep the existing frame count.',
				'create.errors.partialRepairMustKeep'
			)
		: undefined;
}
export function bodyMoveIssue(
	m: Manifest,
	s: MoveFrameSpec & Pick<MoveSpec, 'text' | 'startFrom'>,
	blocked = false
): LocalizedError | undefined {
	const frames = moveFrames(m, s);
	const model = moveAnimationModel(s);
	const suffix = blocked ? ' No generation was requested.' : '';
	if (!moveFrameCounts(model, m.rig.cell.w).includes(frames))
		return new LocalizedError(
			`Choose a frame count supported by this animation model and canvas. This move has ${frames}.${suffix}`,
			blocked ? 'create.errors.moveAnimationFramesBlocked' : 'create.errors.moveAnimationFrames',
			{ frames }
		);
	const { w, h } = m.rig.cell;
	if (
		Object.values(s.animation?.references ?? {}).some(({ start, end }) =>
			[start, model === 'skeleton-v3' ? undefined : end].some(
				(frame) => frame && (frame.width !== w || frame.height !== h)
			)
		)
	)
		return moveReferenceIssue(m.rig.cell);
	return gaitTemplate(s.action) || isAuthoredAction(s.action) || s.text?.trim()
		? undefined
		: new LocalizedError(
				`Describe this move before generating it.${suffix}`,
				blocked ? 'create.errors.describeMoveBlocked' : 'create.errors.describeMove'
			);
}
/** The drawn (not mirrored) views a move has frames in. */
const drawnViews = (
	rig: Pick<Rig, 'directions'>,
	cells: Partial<Record<DirectionName, (Sha256 | null)[]>> | undefined
) => rig.directions.filter((d) => !d.mirrorOf && cells?.[d.id]?.some(Boolean)).map((d) => d.id);
/** Equipment cannot be fitted where a move was kept without poses; making the move again there is the way on. */
function unposedMoveIssue(
	m: Manifest,
	move: string,
	dirs: readonly DirectionName[],
	redo: readonly string[]
): LocalizedError | undefined {
	const anim = m.rig.animations.find((a) => a.id === move),
		dir = anim && dirs.find((d) => unposedView(redo, anim, d));
	return dir
		? new LocalizedError(
				`${move} ${dir} was kept without poses. Make that view again before fitting equipment there. No generation was requested.`,
				'create.errors.moveKeptUnposed',
				viewWords(m, move, dir)
			)
		: undefined;
}
const replacementBodyQa = () =>
	new LocalizedError(
		'The replacement still fails body-pose quality checks. Existing directions were kept. Review the results before trying again.',
		'create.errors.replacementFailsQa'
	);
const newMoveBodyQa = () =>
	new LocalizedError(
		'The new move fails body-pose quality checks, so it was not saved. Review the results before trying again.',
		'create.errors.newMoveFailsQa'
	);

export function skeletonMoveReview(
	rec: StoredProject,
	spec: MoveSpec,
	error: unknown,
	qualityDirs: readonly DirectionName[],
	candidate?: MoveCandidate
) {
	if (!moveRigReady(rec) || reservedMove(spec.id) || spec.itemMethod === 'grid') return;
	const manifest = rec.manifest;
	const saved = manifest.rig.animations.find((clip) => clip.id === spec.id);
	const qualityError = spec.replace ? replacementBodyQa() : newMoveBodyQa();
	const bodyRejected =
		!spec.itemsOnly &&
		moveAnimationModel(spec) !== 'skeleton-v3' &&
		(errorTranslation(error)?.key === qualityError.translation.key ||
			error === qualityError.message);
	if (error && !bodyRejected) return;
	const draftWarning =
		candidate &&
		moveAnimationModel(spec) !== 'skeleton-v3' &&
		!moveCandidateHasStructuralFailure(candidate) &&
		Object.values(candidate.checks).some((qa) => failsBodyGate(qa, true));
	if (candidate ? !draftWarning : Object.hasOwn(rec.moveReviews ?? {}, spec.id)) return;
	try {
		const input = moveCandidateInput(rec, spec.id);
		if (candidate && candidate.input !== input) return;
		const dirs = draftWarning
			? candidate.dirs
			: bodyRejected
				? approvedMoveDirections(manifest, spec)
				: genDirs(manifest).filter((dir) => {
						const route = saved?.sources?.[dir]?.route;
						return qualityDirs.includes(dir) && (route === 'pixminimax' || route === 'v3');
					});
		if (!dirs.length || (bodyRejected && !!saved !== !!spec.replace)) return;
		const motions = new Set(
			dirs.map((dir) => {
				const source = saved?.sources?.[dir];
				if (source?.route !== 'v3' && source?.route !== 'pixminimax') return;
				const prefix = `${source.route}:`;
				if (source.motion?.startsWith(prefix)) return source.motion.slice(prefix.length);
			})
		);
		const motion = motions.values().next().value;
		if (!bodyRejected && !draftWarning && (motions.size !== 1 || !motion)) return;
		const action =
			bodyRejected || draftWarning
				? spec.action
				: motion === spec.id && (motion === 'walk' || isAuthoredAction(motion))
					? motion
					: undefined;
		const preferred = candidate?.animation.cells ?? saved?.cells ?? moveFrames(manifest, spec);
		const frameCount = defaultMoveFrameCount('skeleton-v3', manifest.rig.cell.w, preferred);
		const affected = affectedMoveDirections(manifest.rig, dirs);
		const startFrom =
			bodyRejected || draftWarning
				? spec.startFrom
				: savedReplacementSource(manifest, spec.id, dirs);
		if (
			startFrom &&
			(!moveSourceMatches(manifest, startFrom, dirs) ||
				dirs.some((dir) => {
					const view = startFrom.views[dir];
					return !view?.image || !hasAll(view.keypoints);
				}))
		)
			return;
		const loop =
			candidate && movePlaybackChanged(candidate.basePlayback, saved)
				? (saved?.moveLoop ?? saved?.loop)
				: (spec.animation?.loop ?? saved?.moveLoop ?? saved?.loop);
		const references = Object.fromEntries(
			dirs.flatMap((dir) => {
				const start = spec.animation?.references?.[dir]?.start;
				return start ? [[dir, { start }]] : [];
			})
		);
		const review: MoveSpec = {
			id: spec.id,
			...(!startFrom || isAuthoredAction(action) ? { motionSource: 'standalone' as const } : {}),
			action,
			text:
				(bodyRejected || draftWarning ? spec.text : action ? undefined : motion) ??
				(action ? moveTemplatePrompt(action, !!loop) : undefined),
			frames: preferred,
			animation: {
				model: 'skeleton-v3',
				frameCount,
				loop,
				...(Object.keys(references).length ? { references } : {})
			},
			startFrom,
			items: [],
			reviewBeforePublish: true,
			poseStyle: 'visible-side-v1',
			seed: 0,
			replace: !!saved,
			approvedDirs: dirs,
			...(saved ? { dirs } : {}),
			// Warnings the user already generated past (the frame room check) stay accepted for the same move.
			...(spec.acceptedWarnings ? { acceptedWarnings: spec.acceptedWarnings } : {})
		};
		if (bodyMoveIssue(manifest, review) || partialMoveFrameIssue(manifest, review, dirs.length))
			return;
		const estimate = moveEstimate(manifest, review);
		const tier = moveMinimumTier(manifest, review);
		if (Number.isFinite(estimate.gens) && estimate.gens > 0)
			return { review, estimate, tier, affected, input };
	} catch (error) {
		// Expected refusals (changed directions, missing frames) only withhold the offer; anything else is a bug to see.
		if (!(error instanceof LocalizedError)) console.error('skeleton move offer', error);
		return undefined;
	}
}

export function moveMinimumTier(manifest: Manifest, spec: MoveSpec): number {
	if (spec.reuseItemFrames) return 0;
	const existing = manifest.rig.animations.find((animation) => animation.id === spec.id),
		redraw = spec.replace || !existing,
		frames = redraw ? moveFrames(manifest, spec) : existing.cells,
		rig = redraw
			? {
					...manifest.rig,
					animations: manifest.rig.animations.filter((animation) => animation.id !== spec.id)
				}
			: manifest.rig;
	return Math.max(
		0,
		...spec.items.map((id) => {
			const item = manifest.items.find((candidate) => candidate.id === id);
			if (!item)
				throw new LocalizedError(
					'The selected equipment is no longer available.',
					'create.errors.selectedEquipmentLongerAvailable'
				);
			const dirs = moveDirections(manifest, spec.dirs).filter(
				(dir) =>
					spec.itemMethod === 'grid' || redraw || !hasCompleteCells(manifest, item, spec.id, dir)
			);
			if (spec.itemMethod === 'grid')
				return dirs.length
					? Math.max(
							...repairGridPlan(
								item.layers[0]?.cell ?? rig.cell,
								frames,
								spec.preferTierOneRepair,
								spec.redrawItem
							).map((batch) => batch.tier)
						)
					: 0;
			const calls =
				spec.itemMethod === 'anchor'
					? planAnchoredMove(manifest.rig, item, spec.id, dirs)
					: itemPosePlan(
							rig,
							{ ...item, slotConfig: requireSlot(manifest, item.slot) },
							spec.id,
							frames,
							dirs
						);
			return itemPlanMinimumTier(calls, item.layers[0]?.cell ?? rig.cell, true);
		})
	);
}

/** Bind a delayed item-only click to its priced artwork. Other queued moves may update this item's unrelated clips. */
/** `redo`: the record's rigQa.redo (setupRedoMoves), so a view kept without poses is named with its way on. */
export function reviewItemMove(
	m: Manifest,
	spec: MoveSpec,
	redo: readonly string[] = []
): MoveSpec {
	if (!spec.itemsOnly)
		throw new LocalizedError(
			'Only existing item frames can use this review.',
			'create.errors.onlyExistingItemFrames'
		);
	const dirs = moveDirections(m, spec.dirs);
	if (spec.itemMethod !== 'anchor' && !canPose(m.rig, { anims: [spec.id], dirs }))
		throw (
			unposedMoveIssue(m, spec.id, dirs, redo) ??
			new LocalizedError(
				'This move has missing or invalid stored joints. Set up its poses before generating equipment. No generation was requested.',
				'create.errors.moveMissingInvalidStored'
			)
		);
	const rows = <T>(value: Partial<Record<DirectionName, T>> | undefined) => {
		const entries = dirs
			.filter((dir) => value?.[dir] !== undefined)
			.map((dir) => [dir, value![dir]]);
		return entries.length ? Object.fromEntries(entries) : undefined;
	};
	const items = [m.rig.baseItem, ...spec.items].map((id) => {
		const item = m.items.find((i) => i.id === id);
		if (!item)
			throw new LocalizedError(
				'The selected equipment is no longer available.',
				'create.errors.selectedEquipmentLongerAvailable'
			);
		const ignoreOutputs = spec.reviewedMoveItems && id !== m.rig.baseItem;
		return {
			...itemContent(item),
			baseHash: spec.reviewedMoveItems ? undefined : item.baseHash,
			qa: undefined,
			provenance: undefined,
			designWarnings: undefined,
			materials: undefined,
			hides: undefined,
			coverage: ignoreOutputs
				? undefined
				: item.coverage?.filter(
						(key) =>
							key.startsWith(`${spec.id}/`) && dirs.includes(key.split('/')[1] as DirectionName)
					),
			baseCut: ignoreOutputs ? undefined : rows(item.baseCut?.[spec.id]),
			paletteRepairs: item.paletteRepairs?.filter(
				(p) => p.anim === spec.id && dirs.includes(p.dir)
			),
			layers: item.layers.map((layer) => ({
				...layer,
				cells: ignoreOutputs ? undefined : rows(layer.cells?.[spec.id]),
				sheets: ignoreOutputs ? undefined : layer.sheets?.[spec.id],
				sourceSheets: ignoreOutputs ? undefined : layer.sourceSheets?.[spec.id]
			}))
		};
	});
	const artwork = stableStringify({
		rig: rigArtworkVersion(
			spec.reviewedMoveItems
				? {
						...m.rig,
						baseHash: '' as Sha256,
						animations: m.rig.animations.filter((move) => move.id === spec.id),
						anchors: Object.fromEntries(
							Object.entries(m.rig.anchors ?? {}).flatMap(([anchor, track]) =>
								track?.[spec.id] ? [[anchor, { [spec.id]: track[spec.id] }]] : []
							)
						)
					}
				: m.rig,
			undefined
		),
		items,
		scope: {
			id: spec.id,
			frames: spec.frames,
			dirs: spec.dirs,
			items: spec.items,
			itemMethod: spec.itemMethod,
			preferTierOneRepair: spec.preferTierOneRepair,
			redrawItem: spec.redrawItem,
			redrawSlots: spec.redrawItem
				? items.slice(1).map((item) => requireSlot(m, item.slot))
				: undefined
		}
	});
	return { ...spec, itemReview: { gens: moveEstimate(m, spec).items, artwork } };
}

export function itemMoveReviewMatches(
	m: Manifest,
	spec: MoveSpec,
	redo: readonly string[] = []
): boolean {
	if (!spec.itemReview) return !spec.reviewedMoveItems;
	const reviewed = reviewItemMove(m, spec, redo).itemReview!;
	return (
		reviewed.artwork === spec.itemReview.artwork &&
		(spec.reviewedMoveItems
			? reviewed.gens <= spec.itemReview.gens
			: reviewed.gens === spec.itemReview.gens)
	);
}

/** Suspicious imported joints the priced skeleton fit of an existing move will follow, to disclose before it is bought. */
function movePoseIssues(m: Manifest, spec: MoveSpec): string[] {
	const move = m.rig.animations.find((animation) => animation.id === spec.id);
	if (!move || spec.itemMethod) return [];
	return spec.items.flatMap((id) => {
		const item = m.items.find((candidate) => candidate.id === id);
		if (!item) return [];
		const dirs = moveDirections(m, spec.dirs).filter(
			(dir) => !hasCompleteCells(m, item, spec.id, dir)
		);
		return poseFitIssues(
			m.rig,
			itemPosePlan(
				m.rig,
				{ ...item, slotConfig: requireSlot(m, item.slot) },
				spec.id,
				move.cells,
				dirs
			)
		);
	});
}

/** An unsupported pose or grid has no valid price. Keep the offer visible with its reason instead of breaking the view. */
export function itemMoveOffer(
	m: Manifest,
	specs: MoveSpec[],
	redo: readonly string[] = []
): { specs: MoveSpec[]; gens: number | null; error: Message | string; poseIssues: string[] } {
	try {
		const reviewed = specs.map((spec) => reviewItemMove(m, spec, redo));
		return {
			specs: reviewed,
			gens: reviewed.reduce((sum, spec) => sum + spec.itemReview!.gens, 0),
			error: '',
			poseIssues: [...new Set(reviewed.flatMap((spec) => movePoseIssues(m, spec)))]
		};
	} catch (error) {
		return { specs: [], gens: null, error: errorMessage(error), poseIssues: [] };
	}
}

/**
 * Freeze a pose-first or text-rendered body move, then
 * the chosen items posed onto it. Resumable: a body clip already saved is kept, items that already have it are skipped.
 */
export function addMove(
	projectId: string,
	spec: MoveSpec,
	onProgress?: (p: Progress) => void,
	onReviewed?: () => Promise<void>
) {
	const work = () => addMoveUnlocked(projectId, spec, onProgress, onReviewed);
	return spec.itemsOnly ? work() : withClipWriteLock(projectId, spec.id, work);
}

async function addMoveUnlocked(
	projectId: string,
	spec: MoveSpec,
	onProgress: (p: Progress) => void = () => {},
	onReviewed: () => Promise<void> = async () => {}
): Promise<{
	warnings: string[];
	reviewItems?: string[];
	qualityDirs?: DirectionName[];
	repairReview?: RepairReview;
	moveReview?: string;
}> {
	approvedMeasurementIds(spec.measurementRecovery);
	checkedPaletteIntent(spec.bodyPaletteRepair);
	// Keeping reviewed frames is free and body-only: equipment for the move is a separate, priced choice afterward.
	if (
		spec.measurementRecovery?.keep &&
		(spec.items.length ||
			spec.itemsOnly ||
			spec.itemMethod ||
			spec.itemReview ||
			spec.reuseItemFrames ||
			spec.bodyPaletteRepair)
	)
		throw new LocalizedError(
			'Keeping reviewed body frames saves only the body. No request was made.',
			'create.errors.keepingReviewedBodyFrames'
		);
	const { rec, project: loaded } = await loadProject(projectId);
	checkedReviewChoices(rec.manifest, spec);
	// A staged review of this move decides first: a direct run would buy frames that could not be saved beside it.
	if (!spec.itemsOnly && !spec.reviewBeforePublish && Object.hasOwn(rec.moveReviews ?? {}, spec.id))
		throw new LocalizedError(
			'This move has frames waiting in its review. Save or discard them first. No request was made.',
			'moveSheet.checkpoint.reviewWaiting'
		);
	if (
		!spec.itemsOnly &&
		!rec.manifest.rig.animations.some((clip) => clip.kind !== 'state' && clip.id === spec.id) &&
		(stateAttempts(rec).some((attempt) => sameClipName(attempt.id, spec.id)) ||
			rec.manifest.rig.animations.some(
				(clip) => clip.kind === 'state' && sameClipName(clip.id, spec.id)
			))
	)
		throw new LocalizedError('That State name is unavailable.', 'stateCapture.takenName');
	if (spec.reviewBeforePublish) {
		if (spec.items.length || spec.itemsOnly || spec.itemMethod)
			throw new LocalizedError(
				'Review the move before animating items.',
				'moveSheet.checkpoint.beforeItems'
			);
		const saved = Object.hasOwn(rec.moveReviews ?? {}, spec.id)
			? rec.moveReviews![spec.id]
			: undefined;
		// A draft staged on another rig (a resize since) is stale: it is refused below, never resumed as is.
		if (
			saved &&
			saved.spec.activityScope === spec.activityScope &&
			saved.spec.seed === spec.seed &&
			saved.input === moveCandidateInput(rec, spec.id)
		)
			return { warnings: saved.warnings, moveReview: spec.id };
		if (saved || spec.reviewRegeneration) {
			if (!saved || spec.reviewRegeneration?.id !== spec.id) throw changedMoveCandidate();
			const original = currentMoveCandidate(rec, spec.reviewRegeneration);
			if (moveCandidateInput(rec, spec.id) !== original.input) throw changedMoveCandidate();
		}
	}
	if (!spec.itemsOnly) {
		const warning = blockingIssues(movePreflightWarnings(loaded, spec), spec.acceptedWarnings)[0];
		if (warning) throw warning;
	}
	const assertReview = (m: Manifest) => {
		if (!itemMoveReviewMatches(m, spec, setupRedoMoves(rec))) {
			throw new LocalizedError(
				'This character, item or price changed. Reopen the item and review its current estimate before generating. No paid request was made.',
				'create.errors.characterItemPriceChanged'
			);
		}
	};
	assertReview(rec.manifest);
	if (spec.redrawItem && (spec.itemMethod !== 'grid' || !spec.itemReview))
		throw new LocalizedError(
			'Review the item redraw and its estimate before generating. No request was made.',
			'create.errors.reviewItemRedrawFirst'
		);
	const dirs = approvedMoveDirections(rec.manifest, spec),
		existing = rec.manifest.rig.animations.find((a) => a.id === spec.id);
	// Saved-frame recovery only reattaches completed equipment requests, never a new or replaced body clip.
	if (
		spec.reuseItemFrames &&
		((spec.itemMethod === 'grid' && !spec.itemReview) ||
			!spec.itemsOnly ||
			!existing ||
			spec.replace)
	)
		throw new LocalizedError(
			'Saved equipment recovery needs an existing move and its equipment only. No generation was requested.',
			'create.errors.savedEquipmentRecoveryNeeds'
		);
	if (spec.itemMethod === 'anchor') {
		if (
			!spec.itemsOnly ||
			!existing ||
			spec.replace ||
			spec.measurementRecovery ||
			spec.bodyPaletteRepair ||
			!spec.items.length ||
			spec.items.some((id) => !anchorable(rec.manifest).some((i) => i.id === id))
		)
			throw new LocalizedError(
				'Anchored equipment generation requires an existing move and its saved standing items. No generation was requested.',
				'create.errors.anchoredEquipmentGenerationRequires'
			);
	} else if (
		spec.itemsOnly &&
		existing &&
		!spec.replace &&
		!spec.measurementRecovery &&
		!spec.bodyPaletteRepair
	) {
		if (
			!canPose(rec.manifest.rig, { anims: [spec.id], dirs }) ||
			spec.items.some(
				(id) =>
					!posable(rec.manifest).some(
						(item) => item.id === id && dirs.every((d) => !!item.dressed?.[d])
					)
			)
		)
			throw (
				unposedMoveIssue(rec.manifest, spec.id, dirs, setupRedoMoves(rec)) ??
				new LocalizedError(
					'This move or item has missing stored joints or standing references. Set up its poses before generating equipment. No generation was requested.',
					'create.errors.moveItemMissingStored'
				)
			);
	} else if (!(spec.itemsOnly ? rigReady(rec) : moveRigReady(rec)))
		throw new LocalizedError(
			'Set up this character’s pose rig before adding moves.',
			'create.errors.setUpRigFirst'
		);
	if (
		spec.itemMethod === 'grid' &&
		(!existing || dirs.length !== 1 || spec.items.length !== 1 || !spec.itemsOnly || spec.replace)
	)
		throw new LocalizedError(
			'Choose one item and one facing of an existing move before repairing. No generation was requested.',
			'create.errors.chooseRepairTarget'
		);
	const reserved = reservedMove(spec.id, !!existing && existing.kind !== 'state');
	if (reserved && (spec.replace || !existing)) throw reserved;
	if (existing?.kind === 'state' && spec.replace)
		throw new LocalizedError(
			'A State cannot be replaced as a Move.',
			'moveSheet.startFrom.stateTarget'
		);
	if (!existing && !spec.finishedViews && dirs.length !== genDirs(rec.manifest).length)
		throw new LocalizedError(
			'A new move needs every independently drawn direction.',
			'create.errors.newMoveNeedsEvery'
		);
	const frameIssue = partialMoveFrameIssue(rec.manifest, spec, dirs.length);
	if (frameIssue) throw frameIssue;
	if (!spec.itemMethod && !spec.itemsOnly && spec.items.length) {
		const eligible = new Set(posable(rec.manifest, dirs).map((item) => item.id));
		if (spec.items.some((id) => !eligible.has(id)))
			throw new LocalizedError(
				'Selected equipment no longer has standing designs for all selected views. Review the equipment selection before trying again. No generation was requested.',
				'create.errors.selectedEquipmentLongerStanding'
			);
	}
	const intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
	const published = await publishedMoveRecovery(rec, spec);
	const minimumTier = moveMinimumTier(rec.manifest, spec);
	const blocked =
		!spec.reuseItemFrames && minimumTier > 0
			? queue.planBlocks({ method: 'POST', path: '/animate-with-skeleton-v3' }, minimumTier)
			: null;
	if (blocked) throw localizedPlanRestriction(blocked) ?? new Error(blocked);
	const recovery =
		intent && !published ? await measurementRecoveryPlan(projectId, spec) : undefined;
	if (!published && (spec.replace || !existing)) {
		const candidate = await addBodyClip(projectId, spec, onProgress, recovery);
		if (candidate) return { warnings: candidate.warnings, moveReview: spec.id };
	}
	// Freeze durable garment-region colors before posing: this move's frames when the request draws its body (also one
	// resumed after a reload cut it off between saving the frames and splitting them), or a body never split. Item work on a
	// move the body already had (a repair, Make it) splits nothing, so those frames keep their pixels.
	// saveSplit also advances an exact audit recovery receipt, so interrupted equipment work can resume safely.
	const normalized = await loadProject(projectId),
		body = normalized.project.manifest.items.find(
			(item) => item.id === normalized.project.manifest.rig.baseItem
		),
		split =
			published || !spec.itemsOnly || body?.regions !== 'shirt-shorts'
				? await splitBase(normalized.project, spec.id)
				: null;
	deriveMaterials(normalized.project);
	if (split?.dirty) await saveSplit(projectId, normalized.project.manifest, split);
	const fresh = await loadProject(projectId),
		frames = fresh.rec.manifest.rig.animations.find((a) => a.id === spec.id)!.cells;
	assertReview(fresh.rec.manifest);
	if (spec.itemReview && spec.itemMethod !== 'grid' && !spec.reviewedMoveItems) {
		const reviewed = spec.itemReview;
		delete spec.itemReview;
		try {
			await onReviewed();
		} catch (error) {
			// A resume may reuse the operation's own saved frames after durable consent.
			spec.itemReview = reviewed;
			throw error;
		}
	}
	const assertArtwork = (m: Manifest, id: string, targetDirs: DirectionName[]) => {
		if (!spec.itemsOnly) return;
		const target = { ...spec, items: [id], dirs: targetDirs };
		if (
			reviewItemMove(m, target).itemReview!.artwork !==
			reviewItemMove(fresh.rec.manifest, target).itemReview!.artwork
		)
			throw new LocalizedError(
				'The item frames changed before generation. Reopen the item to review them again.',
				'create.errors.itemFramesChangedGeneration'
			);
	};
	const plans = spec.items.map((id) => {
		const it = fresh.rec.manifest.items.find((i) => i.id === id);
		if (!it)
			throw new LocalizedError(
				'This item changed or was removed while the move was being prepared.',
				'create.errors.itemChangedWasRemoved'
			);
		return {
			id,
			dirs: dirs.filter(
				(d) => spec.itemMethod === 'grid' || !hasCompleteCells(fresh.rec.manifest, it, spec.id, d)
			)
		};
	});
	const itemTotal = plans.reduce((total, plan) => {
		if (spec.itemMethod) return total + plan.dirs.length;
		const item = fresh.rec.manifest.items.find((candidate) => candidate.id === plan.id)!;
		return (
			total +
			itemPosePlan(
				fresh.rec.manifest.rig,
				{
					...item,
					slotConfig: requireSlot(fresh.rec.manifest, item.slot)
				},
				spec.id,
				frames,
				plan.dirs
			).length
		);
	}, 0);
	// Finished views were saved; Try again skips complete views unless it replaces the move, which redraws every view.
	// A view saved only in part is not complete: Try again redraws all of its frames at its shown price, so the stop says so.
	const partialSaved = (error: unknown): never => {
		if (!(error instanceof PartialMoveError)) throw error;
		if (error.savedFrames.length) {
			const ranges = (frames: number[]) =>
				frames
					.reduce<number[][]>((runs, frame) => {
						const last = runs.at(-1);
						if (last && frame === last.at(-1)! + 1) last.push(frame);
						else runs.push([frame]);
						return runs;
					}, [])
					.map((run) => (run.length > 1 ? `${run[0] + 1}–${run.at(-1)! + 1}` : `${run[0] + 1}`))
					.join(', ');
			const english = [
				...error.savedDirs.map(directionLabel),
				...error.savedFrames.map((f) => `${directionLabel(f.dir)} frames ${ranges(f.frames)}`)
			].join(', ');
			const saved = [
				...error.savedDirs.map(directionLabel),
				...error.savedFrames.map((f) =>
					message('create.errors.savedFrameRange', {
						view: directionLabel(f.dir),
						frames: ranges(f.frames)
					})
				)
			];
			throw new LocalizedError(
				`${errorText(error.reason)} The finished frames were saved (${english})${spec.replace ? '.' : '. Generating again redraws every frame of the views that are not complete, at the price it shows.'}`,
				spec.replace ? 'create.errors.partialSaved' : 'create.errors.partialSavedRedraw',
				{ reason: errorMessage(error.reason), views: saved }
			);
		}
		const views = error.savedDirs.map(directionLabel).join(', ');
		throw new LocalizedError(
			`${errorText(error.reason)} The finished views were saved (${views})${spec.replace ? '.' : `; ${spec.reuseItemFrames ? 'Generate new frames' : 'Try again'} requests only the missing ones.`}`,
			spec.replace
				? 'create.errors.partialSaved'
				: spec.reuseItemFrames
					? 'create.errors.partialSavedNewFrames'
					: 'create.errors.partialSavedRetry',
			{ reason: errorMessage(error.reason), views }
		);
	};
	let posed = 0;
	// Activity names an item request by the item, move and view in the user's words.
	const itemTitle =
		(manifest: Manifest, item: Item): ItemViewTitle =>
		(anim, dir) =>
			message('activity.titleItemView', { item: item.name, ...viewWords(manifest, anim, dir) });
	if (itemTotal) onProgress({ step: 'items', done: 0, total: itemTotal, recIds: [] });
	const tick = () =>
		onProgress({ step: 'items', done: Math.min(itemTotal, ++posed), total: itemTotal, recIds: [] });
	for (const plan of plans) {
		if (!plan.dirs.length) continue;
		const ctx = await loadProject(projectId),
			it = ctx.rec.manifest.items.find((i) => i.id === plan.id);
		if (!it)
			throw new LocalizedError(
				'This item changed or was removed while the move was being prepared.',
				'create.errors.itemChangedWasRemoved'
			);
		assertArtwork(ctx.rec.manifest, plan.id, plan.dirs);
		if (spec.itemMethod === 'anchor')
			await animateAnchoredItem(ctx, it, spec.id, plan.dirs, spec.seed, tick, {
				savedOnly: spec.reuseItemFrames,
				plannedDirs: spec.reuseItemFrames ? dirs : undefined,
				activityScope: spec.activityScope
			}).catch(partialSaved);
		else if (spec.itemMethod === 'grid')
			for (const d of plan.dirs) {
				const current = await loadProject(projectId),
					item = current.rec.manifest.items.find((i) => i.id === plan.id);
				if (!item)
					throw new LocalizedError(
						'This item changed or was removed while the move was being prepared.',
						'create.errors.itemChangedWasRemoved'
					);
				assertArtwork(current.rec.manifest, plan.id, [d]);
				const result = await regridClip(
					current,
					item,
					spec.id,
					d,
					spec.seed,
					spec.preferTierOneRepair,
					spec.activityScope,
					spec.reuseItemFrames,
					spec.redrawItem,
					itemTitle(current.rec.manifest, item)
				);
				tick();
				if (result.review) return { warnings: [], repairReview: result.review };
			}
		else
			await poseItemClip(
				ctx,
				it,
				spec.id,
				tick,
				spec.seed,
				plan.dirs,
				spec.activityScope,
				!!spec.reuseItemFrames,
				itemTitle(ctx.rec.manifest, it)
			).catch(partialSaved);
	}
	const saved = (await loadProject(projectId)).rec;
	const clipQa = (saved.rigQa as { clips?: Record<string, ClipQa> } | undefined)?.clips ?? {};
	// Include this move's current nested observations, including after resume. Flattened historical notes may be stale.
	const warnings: string[] = Object.entries(clipQa)
		.filter(([clip]) => clip.startsWith(`${spec.id}/`))
		.flatMap(([clip, qa]) => warn(clip, qa));
	const reviewItems = saved.manifest.items
		.filter(
			(item) =>
				spec.items.includes(item.id) &&
				Object.entries(item.qa?.clips ?? {}).some(
					([clip, qa]) =>
						clip.startsWith(`${spec.id}/`) && (qa.status === 'warn' || qa.status === 'fail')
				)
		)
		.map((item) => item.id);
	for (const id of reviewItems)
		warnings.push(
			`${saved.manifest.items.find((item) => item.id === id)!.name}: item quality checks need review. No paid retry was started.`
		);
	const qualityDirs = dirs.filter((dir) => {
		const clip = `${spec.id}/${dir}`;
		return (
			// Frames the user chose to keep despite their numbers are not offered a paid redraw right after Keep.
			(!published &&
				(spec.replace || !existing) &&
				!spec.measurementRecovery?.keep &&
				!spec.keepUnposed &&
				clipQa[clip] &&
				failsBodyGate(clipQa[clip], true)) ||
			plans.some(
				(plan) =>
					plan.dirs.includes(dir) &&
					saved.manifest.items.find((item) => item.id === plan.id)?.qa?.clips?.[clip]?.status ===
						'fail'
			)
		);
	});
	return {
		warnings: [...new Set(warnings)],
		...(qualityDirs.length ? { qualityDirs } : {}),
		...(reviewItems.length ? { reviewItems } : {})
	};
}

type MoveRequestSpec = Omit<MoveSpec, 'seed'> & { seed?: number };

export function moveMotionRequest(
	rec: Pick<StoredProject, 'manifest' | 'character'>,
	spec: MoveRequestSpec,
	dir: Direction,
	first = '[starting artwork]',
	preview = false
): Req {
	if (moveMotionSource(spec) === 'standalone') {
		return nativeMoveRequest(
			rec,
			{
				...spec,
				motionSource: 'standalone',
				animation: {
					...spec.animation,
					model: 'pixminimax',
					frameCount: moveMotionFrames(rec.manifest, spec)
				}
			},
			dir,
			'pixminimax',
			first,
			preview
		);
	}
	return routes.animateCharacter(
		spec.action === 'walk' && moveMotionSource(spec) === undefined
			? baseAnimation(
					'skeleton-v3',
					rec.character?.id ?? '',
					BASE_ANIMS.find((animation) => animation.name === 'walk')!,
					[dir],
					viewSeed(spec, dir, 'motion')
				)
			: {
					character_id: rec.character?.id ?? '',
					mode: 'pixminimax',
					action_description: `${moveMotionText(spec)}, unarmed, no weapon, no props, no other people, no effects`,
					frame_count: moveMotionFrames(rec.manifest, spec),
					keep_first_frame: false,
					animation_name: spec.id,
					directions: [dir],
					seed: viewSeed(spec, dir, 'motion')
				}
	);
}

export async function resolveMoveMotionSource(
	key: string,
	characterId: string | undefined,
	signal: AbortSignal
): Promise<NonNullable<MoveSpec['motionSource']>> {
	if (!characterId) return 'standalone';
	try {
		await api(key, 'GET', routes.getCharacter(characterId).path, undefined, signal);
		return 'managed';
	} catch (error) {
		if (error instanceof ApiError && (error.status === 403 || error.status === 404))
			return 'standalone';
		throw error;
	}
}
/** A per-view re-roll salts only that view's failed step, so every other view and step keeps reusing what it bought. */
const viewSeed = (
	spec: Pick<MoveRequestSpec, 'seed' | 'reroll'>,
	dir: DirectionName,
	step: 'motion' | 'render'
): number | undefined =>
	spec.seed === undefined
		? undefined
		: spec.seed + (step === 'render' ? 101 : 0) + (spec.reroll?.[dir]?.[step] ?? 0);

export function nativeMoveRequest(
	rec: Pick<StoredProject, 'manifest' | 'character'>,
	spec: MoveRequestSpec,
	dir: Direction,
	model: 'v3' | 'pixminimax',
	first: string,
	preview = false
): Req {
	const motion = moveMotionText(spec);
	const reference = spec.animation?.references?.[dir];
	const start = reference?.start
		? preview
			? '[uploaded start frame]'
			: reference.start.base64
		: first;
	const end = moveReferenceEnd(
		reference?.end === undefined
			? undefined
			: { end: reference.end && (preview ? '[uploaded end frame]' : reference.end.base64) },
		spec.animation?.loop && (moveMotionSource(spec) !== undefined || !gaitTemplate(spec.action)),
		start
	);
	const guard = ', unarmed, no weapon, no props, no other people, no effects';
	const body = {
		first_frame: png(start),
		...(end ? { last_frame: png(end) } : {}),
		frame_count: moveFrames(rec.manifest, spec),
		...(spec.seed === undefined ? {} : { seed: viewSeed(spec, dir, 'motion') }),
		no_background: true as const,
		enhance_prompt: false as const
	};
	return model === 'v3'
		? routes.animateWithTextV3({
				...body,
				action: `${motion.slice(0, 900)}${guard}, keep facing ${dir}`
			})
		: routes.animatePixminimax({
				...body,
				description: `${motion.slice(0, 900)}${guard}`,
				subject_description: rec.character?.looks.trim().slice(0, 300) || 'the character',
				...(!reference?.start
					? {
							initial_pose: spec.startFrom
								? 'the pose in the supplied frame'
								: 'standing upright with empty hands'
						}
					: {}),
				view: rec.manifest.rig.view ?? 'low top-down',
				direction: dir
			});
}

function moveMotionText(spec: MoveRequestSpec): string {
	if (spec.text?.trim()) return spec.text.trim();
	const motion = actionOf(spec.action ?? spec.id);
	return gaitTemplate(spec.action) && spec.animation?.loop
		? `${motion.slice(0, 830)}, continuous even strides, no stopping or settling into a standing pose`
		: motion.slice(0, 900);
}

async function moveReferenceImage(
	reference: NonNullable<MoveAnimationOptions['references']>[DirectionName],
	kind: 'start' | 'end',
	cell: Manifest['rig']['cell']
): Promise<Img | undefined> {
	const input = reference?.[kind];
	if (!input) return;
	const image = await decodePng(base64ToBytes(input.base64));
	if (
		image.w !== cell.w ||
		image.h !== cell.h ||
		!opaqueBox(image) ||
		!image.data.some((alpha, index) => index % 4 === 3 && alpha === 0)
	)
		throw moveReferenceIssue(cell);
	return image;
}

const moveReferenceIssue = (cell: Manifest['rig']['cell']) =>
	new LocalizedError(
		'Use a frame of the correct size with a transparent background.',
		'moveSheet.referenceInvalid',
		{ width: cell.w, height: cell.h }
	);

function movePoseEndpoints(poses: Keypoint[][], start?: Keypoint[]): Keypoint[][] {
	return start ? [start, ...poses.slice(1)] : poses;
}

function requireMoveStartJoints(
	points: Keypoint[] | undefined,
	direction: DirectionName
): Keypoint[] {
	if (!points || !hasAll(points))
		throw new LocalizedError(
			'No usable pose was found in the start frame.',
			'moveSheet.referencePoseInvalid',
			{ direction }
		);
	return points;
}

function sampleMovePoses(
	poses: Keypoint[][],
	frames: number,
	action?: string,
	loop?: boolean
): Keypoint[][] {
	if (poses.length === frames) return poses;
	const open = action === 'death' || loop === false;
	return Array.from({ length: frames }, (_, index) => {
		if (open && index === frames - 1) return poses[poses.length - 1];
		const phase = open
				? (index * (poses.length - 1)) / (frames - 1)
				: (index * poses.length) / frames,
			before = Math.floor(phase),
			mix = phase - before;
		const after = new Map(poses[(before + 1) % poses.length].map((point) => [point.label, point]));
		return poses[before].map((point) => {
			const next = after.get(point.label)!;
			return {
				...point,
				...kp4(point.label, point.x + (next.x - point.x) * mix, point.y + (next.y - point.y) * mix)
			};
		});
	});
}

/** App-side checks that warn before a body move is bought. Each returns a PreflightWarning the user can explicitly generate
 *  past (MoveSheet shows it and offers Generate move anyway). Requests PixelLab would refuse, missing data and saved-data corruption
 *  stay hard stops instead: bodyMoveIssue, partialMoveFrameIssue, reservedMove and addMove's prerequisites. */
const MOVE_PREFLIGHT: ((p: Project, spec: MoveSpec) => PreflightWarning | undefined)[] = [
	frameRoomWarning
];
export const movePreflightWarnings = (p: Project, spec: MoveSpec): PreflightWarning[] =>
	MOVE_PREFLIGHT.flatMap((check) => check(p, spec) ?? []);
/** A body move from standing views with less room than a move reaches (lib/rig/reframe.ts moveReach) may step past the
 *  frame and stop after paying. MoveSheet offers Make room (free, Adjust frame) or Generate move anyway. */
export function frameRoomWarning(p: Project, spec: MoveSpec): PreflightWarning | undefined {
	if (spec.itemsOnly) return undefined;
	const m = p.manifest,
		frame = m.rig.cell.w,
		room = standingRoom(standingViews(m, p.images), frame);
	if (!room || !roomShort(room)) return undefined;
	return new PreflightWarning(
		'frame-room-move',
		`This move may step past the ${frame} px frame: the character has ${room.below} px below its feet. Make room for free first, or generate the move anyway.`,
		'moveSheet.frameRoom',
		{ frame, below: room.below }
	);
}

/** The view a body move starts from: the chosen saved frame, else the standing view. */
const moveReferenceView = (m: Manifest, spec: Pick<MoveSpec, 'startFrom'>, d: DirectionName) =>
	spec.startFrom ? spec.startFrom.views[d] : m.rig.rest?.[d];

interface BodyClipPlan {
	rec: StoredProject;
	project: Project;
	spec: MoveSpec;
	model: ReturnType<typeof moveAnimationModel>;
	authored?: string;
	n: number;
}
function bodyClipPlan(rec: StoredProject, project: Project, spec: MoveSpec): BodyClipPlan {
	const model = moveAnimationModel(spec);
	return {
		rec,
		project,
		spec,
		model,
		authored: model === 'skeleton-v3' && isAuthoredAction(spec.action) ? spec.action : undefined,
		n: moveFrames(rec.manifest, spec)
	};
}
async function bodyStartPose(
	image: Img,
	direction: DirectionName,
	spec: MoveSpec,
	signal: AbortSignal,
	onRecord?: (record: JobRec) => void
): Promise<NonNullable<ClipJob['start']>> {
	const points = await joints(image, true, signal, spec.activityScope, onRecord);
	const dry = dryRuns.get(signal);
	if (dry?.unmeasured) throw new Unpaid('start-joints', dry.running);
	return { image, keypoints: requireMoveStartJoints(points, direction) };
}
/** One view of a body move: motion source -> keypoints -> body render -> checks. A review replays it from the cache only. */
async function bodyClip(
	plan: BodyClipPlan,
	d: Direction,
	signal: AbortSignal,
	tick: () => void,
	startImage?: Img,
	start?: ClipJob['start']
): Promise<{
	d: Direction;
	keypoints: Keypoint[][];
	out: ClipOut;
	motion?: JobRec;
	motionEcho?: ClipSource['motionEcho'];
	motionBridged?: number[];
}> {
	const { rec, project, spec, model, authored, n } = plan,
		m = rec.manifest,
		rig = m.rig;
	const reference = moveReferenceView(m, spec, d)!;
	const restKps = reference.keypoints,
		restImg = project.images.get(reference.image)!;
	if (model !== 'skeleton-v3') {
		const out = await renderClip({
			anim: spec.id,
			dir: d,
			rest: restImg,
			nativeStart: startImage,
			restKps,
			keypoints: [],
			looks: moveLooks(rec),
			seed: spec.seed,
			name: m.name,
			tick,
			view: rig.view,
			signal,
			activityScope: spec.activityScope,
			action: bodyAction(spec),
			unposed: !!spec.keepUnposed,
			words: viewWords(m, spec.id, d),
			native: {
				request: nativeMoveRequest(rec, spec, d, model, await b64(restImg)),
				model,
				frames: n,
				words: viewWords(m, spec.id, d)
			}
		});
		return { d, keypoints: out.measured as Keypoint[][], out };
	}
	let keypoints: Keypoint[][],
		source: JobRec | undefined,
		motionEcho: ClipSource['motionEcho'],
		motionBridged: number[] | undefined,
		notes: FrameNotes | undefined;
	if (authored)
		keypoints = authoredPoses(
			authored,
			fromApi(restKps, rig.cell),
			d,
			rig.cell.w,
			spec.poseStyle
		).map((p) => armDepth(toApi(p, rig.cell), d));
	else {
		const motionStart = startImage ?? restImg;
		const request = moveMotionRequest(
			rec,
			spec,
			d,
			moveMotionSource(spec) === 'standalone' ? await b64(motionStart) : undefined
		);
		const result = await motion(
			request,
			d,
			{
				text: `${m.name} · ${spec.id} ${d} (motion)`,
				title: message('activity.titleMoveMotion', { name: m.name, ...viewWords(m, spec.id, d) })
			},
			viewWords(m, spec.id, d),
			tick,
			moveMotionFrames(m, spec),
			signal,
			spec.activityScope,
			rig.cell.w,
			motionStart,
			spec.motionLift?.[d],
			moveMotionSource(spec) === 'standalone' ? 0 : artMapping(rig, d),
			motionEchoRule(spec)
		);
		keypoints = result.keypoints;
		source = result.record;
		motionEcho = result.motionEcho;
		motionBridged = result.motionBridged;
		if (motionBridged || result.short)
			notes = {
				of: moveMotionFrames(m, spec),
				...(motionBridged ? { bridged: motionBridged } : {}),
				...(result.short ? { short: result.short } : {})
			};
	}
	keypoints = movePoseEndpoints(
		sampleMovePoses(keypoints, n, spec.action, spec.animation?.loop),
		start?.keypoints
	);
	return {
		d,
		keypoints,
		...(source ? { motion: source } : {}),
		...(motionEcho ? { motionEcho } : {}),
		...(motionBridged ? { motionBridged } : {}),
		out: await renderClip({
			anim: spec.id,
			dir: d,
			rest: restImg,
			start,
			restKps,
			keypoints,
			authored: !!authored,
			looks: moveLooks(rec),
			seed: viewSeed(spec, d, 'render')!,
			name: m.name,
			tick,
			view: rig.view,
			signal,
			activityScope: spec.activityScope,
			action: bodyAction(spec),
			paletteRepair: !!spec.bodyPaletteRepair,
			lifts: spec.motionLift?.[d],
			...(notes ? { notes } : {}),
			unposed: !!spec.keepUnposed,
			words: viewWords(m, spec.id, d)
		})
	};
}
/** Review choices are exact: salts and lifts only for drawn views, lifts only for a generated motion source. */
function checkedReviewChoices(m: Manifest, spec: MoveSpec) {
	const views = genDirs(m),
		invalid = () =>
			new LocalizedError(
				'This review choice no longer matches the move. Review it again. No request was made.',
				'create.errors.reviewChoiceInvalid'
			);
	const record = (value: unknown) =>
		!!value && typeof value === 'object' && !Array.isArray(value)
			? Object.entries(value as Record<string, unknown>)
			: undefined;
	// Kept without poses only as body frames: never with equipment, and over an existing move only as its replacement.
	if (
		spec.keepUnposed !== undefined &&
		(spec.keepUnposed !== true ||
			spec.items.length ||
			spec.itemsOnly ||
			spec.itemMethod ||
			spec.reviewBeforePublish ||
			(!spec.replace && m.rig.animations.some((a) => a.id === spec.id)))
	)
		throw invalid();
	if (
		spec.reviewedReceipts !== undefined &&
		(!(spec.keepUnposed || spec.finishedViews) ||
			!Array.isArray(spec.reviewedReceipts) ||
			spec.reviewedReceipts.some((id) => typeof id !== 'string' || !id) ||
			new Set(spec.reviewedReceipts).size !== spec.reviewedReceipts.length)
	)
		throw invalid();
	// Finished views only of a new, body-only move: some drawn views, never an existing move or equipment.
	if (
		spec.finishedViews !== undefined &&
		(spec.finishedViews !== true ||
			spec.replace ||
			!spec.dirs?.length ||
			spec.dirs.some((dir) => !views.includes(dir)) ||
			spec.items.length ||
			spec.itemsOnly ||
			spec.itemMethod ||
			m.rig.animations.some((a) => a.id === spec.id))
	)
		throw invalid();
	if (spec.reroll !== undefined) {
		const entries = record(spec.reroll);
		if (!entries) throw invalid();
		for (const [dir, salts] of entries) {
			const steps = record(salts);
			if (
				!views.includes(dir as DirectionName) ||
				!steps ||
				steps.some(
					([step, salt]) =>
						(step !== 'motion' && step !== 'render') ||
						!Number.isSafeInteger(salt) ||
						(salt as number) < 1 ||
						(salt as number) > 1e9
				)
			)
				throw invalid();
		}
	}
	if (spec.motionLift !== undefined) {
		const entries = record(spec.motionLift);
		if (
			!entries ||
			moveAnimationModel(spec) !== 'skeleton-v3' ||
			isAuthoredAction(spec.action) ||
			entries.some(
				([dir, lifts]) =>
					!views.includes(dir as DirectionName) ||
					!Array.isArray(lifts) ||
					lifts.length !== moveMotionFrames(m, spec) ||
					lifts.some((px) => !Number.isSafeInteger(px) || px < 0 || px >= m.rig.cell.h)
			)
		)
			throw invalid();
	}
}

/** A view of a stopped body move replayed from the request cache: what it bought, what stopped it, what is left to buy. */
interface ReplayedView {
	d: Direction;
	/** `running`: a request of this view is still at PixelLab, so its result is not known yet. */
	state: 'ready' | 'pending' | 'running' | 'failed';
	gens: number;
	records: JobRec[];
	/** Stopped records this view met (DryRun.stopped). */
	stopped: JobRec[];
	/** Its body render passed every check before its joint checks (DryRun.rendered). */
	rendered?: boolean;
	error?: PaidStepError;
	clip?: Awaited<ReturnType<typeof bodyClip>>;
}
/** A move (new, replaced or some views) whose stopped views only lack measured joints on their body frames can be kept
 *  free: body only, those views without poses, so items are fitted there after they are made again. Every other view must
 *  already be finished, so keeping never buys more work. Decided by the typed failure, never by text. */
export const keepableUnposed = (
	views: readonly Pick<ReplayedView, 'state' | 'error' | 'rendered'>[]
) =>
	views.some((v) => v.state === 'failed') &&
	views.every(
		(v) =>
			v.state === 'ready' ||
			(v.state === 'failed' &&
				((v.error?.paid.failure === 'joints' && v.error.paid.step === 'render') ||
					// a stopped joint check on a render that passed its checks: unknown, kept unmeasured, never sent again
					(v.rendered &&
						v.error?.paid.failure === 'stopped' &&
						v.error.paid.step === '/estimate-skeleton')))
	);
async function replayView(plan: BodyClipPlan, d: Direction): Promise<ReplayedView> {
	const scope = new AbortController(),
		dry: DryRun = {
			records: [],
			checks: 0,
			unmeasured: false,
			running: false,
			reopensCanceled: true
		};
	dryRuns.set(scope.signal, dry);
	const priced = (gens: number) => +(dry.checks * EST + gens).toFixed(2);
	try {
		const reference = plan.spec.animation?.references?.[d];
		const image = await moveReferenceImage(reference, 'start', plan.rec.manifest.rig.cell);
		if (plan.model !== 'skeleton-v3')
			await moveReferenceImage(reference, 'end', plan.rec.manifest.rig.cell);
		const start =
			image && plan.model === 'skeleton-v3'
				? await bodyStartPose(image, d, plan.spec, scope.signal)
				: undefined;
		const clip = await bodyClip(plan, d, scope.signal, () => {}, image, start);
		return { d, state: 'ready', gens: 0, records: dry.records, stopped: dry.stopped ?? [], clip };
	} catch (error) {
		if (error instanceof Unpaid)
			return {
				d,
				state: error.running ? 'running' : 'pending',
				gens: priced(unpaidGens(plan, error)),
				records: dry.records,
				stopped: dry.stopped ?? []
			};
		if (error instanceof PaidStepError)
			return {
				d,
				state: 'failed',
				gens: priced(0),
				records: dry.records,
				stopped: dry.stopped ?? [],
				...(dry.rendered ? { rendered: true } : {}),
				error
			};
		throw error;
	}
}
/** The planned price of the step a replay could not take from the cache and of every step of that view after it. */
function unpaidGens({ rec, spec, model, authored, n }: BodyClipPlan, e: Unpaid): number {
	const m = rec.manifest,
		checks = n * EST,
		render = poseCallGens(n);
	if (model !== 'skeleton-v3')
		return e.path === 'render-joints'
			? 0
			: (e.running ? 0 : nativeMoveGens(model, m.rig.cell, n)) + checks;
	if (e.path === 'render-joints') return 0;
	if (e.path === '/animate-with-skeleton-v3') return (e.running ? 0 : render) + checks;
	if (e.path === 'motion-joints' || authored) return render + checks;
	return (
		(e.running && e.path !== 'start-joints' ? 0 : moveMotionGens(m, spec)) +
		moveMotionFrames(m, spec) * EST +
		render +
		checks
	);
}
/** The seed a view's failed step takes for a re-roll: the motion source, or only the body render on a kept motion. */
function rerollStep(plan: BodyClipPlan, error: PaidStepError): 'motion' | 'render' | undefined {
	const { step } = error.paid;
	if (step === '/estimate-skeleton') return undefined; // a joint check is deterministic: re-rolling cannot change it
	if (plan.model !== 'skeleton-v3') return 'motion';
	return step === 'render' || step === '/animate-with-skeleton-v3' ? 'render' : 'motion';
}
const viewName = (d: DirectionName) => message(directionNames[d]);
/** A view's name inside a sentence ("no south view"), cased as the language writes it there. */
const viewInline = (d: DirectionName) => message(directionInline[d]);
/** A view of a move in the user's words, for a message: the move's name and the direction's. */
type ViewWords = {
	move: Message | string;
	direction: Message;
};
const viewWords = (m: Manifest, move: string, d: DirectionName): ViewWords => ({
	move: moveName(move, m.rig.animations),
	direction: viewName(d)
});
const salt = (previous = 0) => previous + 1 + Math.floor(Math.random() * 1_000_000);
/** The motion frames of a returned source: one extra leading frame is the start frame sent back, which normalizeMotionFrames
 *  drops by position, so it never asks for a lift or room. */
const motionFramesOf = (images: Img[], expected: number) =>
	images.length === expected + 1 ? images.slice(1) : images;
/** Rows each returned motion frame needs to fit the cell, or null when lifting cannot fit one (cut at a side or the top). */
async function motionLiftOf(
	plan: BodyClipPlan,
	record: JobRec,
	d: DirectionName
): Promise<number[] | null> {
	const { rec, spec } = plan,
		size = rec.manifest.rig.cell.w,
		expected = moveMotionFrames(rec.manifest, spec),
		frames = motionFramesOf(
			(await imagesOf(record)).map((out) => out.img),
			expected
		);
	if (frames.length !== expected) return null;
	const below = moveMotionSource(spec) === 'standalone' ? 0 : artMapping(rec.manifest.rig, d),
		lifts = frames.map((image) => liftToFit(image, size, size, 128, size, below));
	return lifts.every((lift): lift is number => lift !== null) ? lifts : null;
}

/** Make room and continue: Adjust frame keeps character.id, so every cached motion request stays reusable and only the
 *  joint checks and body renders on the changed frame are bought. The change is Make room's (lib/rig/reframe.ts) with every
 *  cached motion this continuation reuses, in every view, kept inside the frame where artMapping will place it; priced by a
 *  replay of the changed character from the cache. Undefined when nothing overflowed, or when no change fits. */
async function makeRoomOption(
	plan: BodyClipPlan,
	failed: ReplayedView[],
	dirs: Direction[],
	primary: boolean
): Promise<MovePaidOption | undefined> {
	if (
		moveMotionSource(plan.spec) === 'standalone' ||
		!failed.length ||
		failed.some((v) => v.error?.paid.failure !== 'overflow')
	)
		return undefined;
	const { rec, project } = plan,
		m = rec.manifest,
		size = m.rig.cell.w,
		spec = resumeSpec(plan.spec, { motionLift: undefined });
	const boxes: { y0: number; y1: number; x0: number; x1: number }[] = [];
	if (plan.model === 'skeleton-v3' && !plan.authored)
		for (const d of dirs) {
			const hash = (await requestIdentity(moveMotionRequest(rec, spec, d))).requestHash,
				cached = queue
					.snapshot()
					.jobs.find((job) => job.requestHash === hash && job.state === 'done');
			if (!cached) continue;
			const images = (await imagesOf(cached)).map((out) => out.img);
			for (const img of motionFramesOf(images, moveMotionFrames(m, spec))) {
				const box = opaqueAt(img, 128);
				if (!box) continue;
				const x = Math.floor((size - img.w) / 2),
					y = Math.floor((size - img.h) / 2) + artMapping(m.rig, d);
				boxes.push({ x0: box.x0 + x, x1: box.x1 + x, y0: box.y0 + y, y1: box.y1 + y });
			}
		}
	const change = makeRoom(
		await frameFacts(rec, project.images, readStoredImage),
		freeOf(boxes, size)
	);
	if (change.limit || (change.size === size && !change.dy)) return undefined;
	if (
		change.size !== size &&
		dirs.some((dir) => {
			const reference = spec.animation?.references?.[dir];
			return reference?.start || (plan.model !== 'skeleton-v3' && reference?.end);
		})
	)
		return undefined;
	const { record, newImages } = await reframeCharacter(
		rec,
		project.images,
		change,
		readStoredImage
	);
	if (spec.startFrom) {
		const source = spec.startFrom.replacement
			? savedReplacementSource(record.manifest, spec.startFrom.clip, dirs)
			: resolveMoveSource(record.manifest, spec.startFrom, dirs);
		if (!source) return undefined;
		spec.startFrom = source;
	}
	if (bodyMoveIssue(record.manifest, spec)) return undefined;
	const next = bodyClipPlan(
		record,
		{ manifest: record.manifest, images: new Map([...project.images, ...newImages]) },
		spec
	);
	const views = await Promise.all(dirs.map((d) => replayView(next, d))),
		gens = +views.reduce((sum, v) => sum + v.gens, 0).toFixed(2);
	return {
		id: 'enlarge-frame',
		label: message('moveReview.makeRoom'),
		// A native model draws from the standing frame, so the changed frame is drawn again in every view (priced above).
		detail: message(
			plan.model === 'skeleton-v3'
				? 'moveReview.makeRoomDetail'
				: 'moveReview.makeRoomDetailRedraw',
			{ change: frameChangeText(size, change) }
		),
		gens,
		paid: gens > 0,
		primary,
		spec,
		change: { size: change.size, dy: change.dy },
		reviewed: rec
	};
}
/** The box of pixels at or above `thr` alpha: what normalize keeps and counts as cut. */
function opaqueAt(im: Img, thr: number) {
	let x0 = im.w,
		y0 = im.h,
		x1 = -1,
		y1 = -1;
	for (let y = 0; y < im.h; y++)
		for (let x = 0; x < im.w; x++)
			if (im.data[(y * im.w + x) * 4 + 3] >= thr) {
				x0 = Math.min(x0, x);
				x1 = Math.max(x1, x);
				y0 = Math.min(y0, y);
				y1 = y;
			}
	return x1 < 0 ? undefined : { x0, y0, x1, y1 };
}
export interface MovePaidOption extends PaidOption {
	spec: MoveSpec;
	/** `enlarge-frame`: the free Adjust frame change applied before the move continues with `spec`. */
	change?: FrameChange;
	/** The character `change` was planned and priced on; a changed character needs a new review. */
	reviewed?: StoredProject;
}
export interface MovePaidReview extends PaidReview {
	options: MovePaidOption[];
}
/** A new move saved with only its finished views: the same reviewed attempt narrowed to them, and an explicit start frame
 *  narrowed to the same views, so it still matches its source (moveSourceMatches compares exactly these views). */
export const finishedViewsSpec = (spec: MoveSpec, finished: DirectionName[]): MoveSpec =>
	resumeSpec(spec, {
		finishedViews: true,
		dirs: finished,
		approvedDirs: finished,
		...(spec.startFrom
			? {
					startFrom: {
						...spec.startFrom,
						views: Object.fromEntries(
							finished.flatMap((d) =>
								spec.startFrom!.views[d] ? [[d, spec.startFrom!.views[d]]] : []
							)
						)
					}
				}
			: {})
	});
/** The next attempt of a reviewed move keeps its seed, so every completed request is reused; only consents change. */
/** Every way on is body only and lands in the staged visual review (addBodyClip reviewBeforePublish): equipment is a
 *  separate, freshly quoted choice after Save, never posed automatically after a recovery. */
const resumeSpec = (spec: MoveSpec, change: Partial<MoveSpec> = {}): MoveSpec => ({
	...spec,
	items: [],
	itemReview: undefined,
	reviewedMoveItems: undefined,
	reviewBeforePublish: true,
	reuseItemFrames: undefined,
	measurementRecovery: undefined,
	bodyPaletteRepair: undefined,
	attempt: salt(),
	...change
});
/** API-free review of a stopped body move: every view replayed from the request cache in one pass, showing what each bought
 * and why it stopped, with each way on priced from the cache (0 when nothing is left to buy). Undefined when its body is
 * already saved or this is equipment-only work. */
export async function reviewMoveResults(
	projectId: string,
	spec: MoveSpec
): Promise<MovePaidReview | undefined> {
	if (spec.itemsOnly || spec.itemMethod) return undefined;
	const { rec, project } = await loadProject(projectId),
		m = rec.manifest;
	if (
		!moveRigReady(rec) ||
		bodyMoveIssue(m, spec) ||
		(!spec.replace && m.rig.animations.some((a) => a.id === spec.id))
	)
		return undefined;
	const dirs = approvedMoveDirections(m, spec) as Direction[],
		plan = bodyClipPlan(rec, project, resumeSpec(spec));
	const replay = (candidate: MoveSpec) =>
		Promise.all(dirs.map((d) => replayView({ ...plan, spec: candidate }, d)));
	const total = (views: ReplayedView[]) => +views.reduce((sum, v) => sum + v.gens, 0).toFixed(2);
	const views = await replay(plan.spec);
	const records = [...new Map(views.flatMap((v) => v.records).map((r) => [r.id, r])).values()];
	// A view that completed and misses only numerical body checks is not failed: every way on lands in the staged review,
	// where keeping it is free, so it never prices a re-roll.
	const failed = views.filter((v) => v.state === 'failed');
	const options: MovePaidOption[] = [];
	// Lift every overflowing motion that a vertical lift can fit; anything else that stopped is re-rolled at its own step.
	const lifts: NonNullable<MoveSpec['motionLift']> = {},
		reroll: NonNullable<MoveSpec['reroll']> = { ...plan.spec.reroll },
		rerolled: Direction[] = [];
	const notes = new Map<Direction, (Message | string)[]>();
	for (const v of failed) {
		const error = v.error;
		const source =
			error?.paid.recordId &&
			records.concat(queue.snapshot().jobs).find((r) => r.id === error.paid.recordId);
		if (
			error?.paid.failure === 'overflow' &&
			error.paid.step === 'motion' &&
			source &&
			!plan.spec.motionLift?.[v.d]
		) {
			const lift = await motionLiftOf(plan, source, v.d);
			if (lift) {
				lifts[v.d] = lift;
				const raised = lift.filter(Boolean);
				notes.set(v.d, [
					message('moveReview.liftable', {
						px: Math.max(...raised),
						frames: raised.length,
						total: lift.length
					})
				]);
				continue;
			}
			notes.set(v.d, [message('moveReview.notLiftable')]);
		}
		const step = error ? rerollStep(plan, error) : 'render';
		if (step) {
			reroll[v.d] = { ...reroll[v.d], [step]: salt(reroll[v.d]?.[step]) };
			rerolled.push(v.d);
		}
	}
	const names = (list: DirectionName[]) => list.map(viewName);
	const lifted = Object.keys(lifts) as Direction[];
	if (!failed.length)
		options.push({
			id: 'resume',
			label: message('moveReview.resume'),
			gens: total(views),
			paid: total(views) > 0,
			primary: true,
			spec: plan.spec
		});
	if (lifted.length && lifted.length + rerolled.length === failed.length) {
		const candidate = resumeSpec(plan.spec, {
			motionLift: { ...plan.spec.motionLift, ...lifts },
			...(rerolled.length ? { reroll } : {})
		});
		const gens = total(await replay(candidate)),
			raised = lifted.flatMap((d) => lifts[d]!.filter(Boolean));
		const px = Math.max(...raised);
		options.push({
			id: 'lift',
			label: rerolled.length
				? message('moveReview.liftAndReroll', { views: names(rerolled) })
				: message('moveReview.lift'),
			detail: message(
				px <= RIG_GATES.silhouetteBottomDelta
					? 'moveReview.liftDetail'
					: spec.dirs?.length
						? 'moveReview.liftDetailReview'
						: 'moveReview.liftDetailWarned',
				{
					views: names(lifted),
					px,
					frames: raised.length,
					total: lifted.length * moveMotionFrames(m, spec),
					limit: RIG_GATES.silhouetteBottomDelta
				}
			),
			gens,
			paid: gens > 0,
			primary: true,
			spec: candidate
		});
	}
	const enlarge = await makeRoomOption(
		plan,
		failed,
		dirs,
		!options.some((option) => option.primary)
	);
	if (enlarge) options.push(enlarge);
	if (rerolled.length || lifted.length) {
		// Re-rolling instead of lifting buys a new motion source for the overflowing views too.
		const all = { ...reroll };
		for (const d of lifted) all[d] = { ...all[d], motion: salt(all[d]?.motion) };
		const candidate = resumeSpec(plan.spec, { reroll: all }),
			gens = total(await replay(candidate)),
			changed = [...rerolled, ...lifted];
		options.push({
			id: 'reroll',
			label: message('moveReview.reroll', { views: names(changed) }),
			detail: message('moveReview.rerollDetail'),
			gens,
			paid: gens > 0,
			spec: candidate
		});
	}
	if (keepableUnposed(views)) {
		const candidate = resumeSpec(plan.spec, {
			keepUnposed: true,
			reviewBeforePublish: undefined
		});
		// Free by construction: every view is a cached completed render. A replay that would buy anything is no Keep.
		const kept = await replay(candidate);
		if (!total(kept))
			options.push({
				id: 'keep-unposed',
				label: message('moveReview.keepUnposed'),
				detail: message('moveReview.keepUnposedDetail'),
				gens: 0,
				paid: false,
				spec: { ...candidate, reviewedReceipts: receiptIds(kept) }
			});
	}
	// A new move whose other views stopped can still be saved with the views that finished, for free and in the staged review;
	// nothing is requested again, and the views left out are named.
	const finished = views.filter((v) => v.state === 'ready').map((v) => v.d);
	if (!spec.replace && finished.length && finished.length < views.length) {
		const candidate = finishedViewsSpec(plan.spec, finished);
		const kept = await Promise.all(
			finished.map((d) => replayView({ ...plan, spec: candidate }, d))
		);
		if (!total(kept))
			options.push({
				id: 'keep-finished',
				label: message('moveReview.saveFinished'),
				detail: message('moveReview.saveFinishedDetail', {
					views: names(finished),
					missing: names(dirs.filter((d) => !finished.includes(d)))
				}),
				gens: 0,
				paid: false,
				spec: { ...candidate, reviewedReceipts: receiptIds(kept) }
			});
	}
	// What each view bought: the output a step rejected, as PixelLab returned it.
	const shown = await Promise.all(
		views.map(async (v) => {
			const id = v.error?.paid.recordId,
				source = id && queue.snapshot().jobs.find((r) => r.id === id && r.state === 'done');
			// Finished body frames that only miss a numerical check are shown by the Keep review, not twice.
			const images = source ? (await imagesOf(source)).map((out) => out.img) : [];
			return images.map((img, i) => ({
				img,
				label: message('paidReview.frame', { view: viewName(v.d), number: i + 1 })
			}));
		})
	);
	return {
		views: views.map((v, i) => ({
			label: viewName(v.d),
			state: failed.includes(v) ? 'failed' : v.state,
			frames: shown[i],
			notes: [
				...(v.error ? [v.error.translation] : []),
				...(v.state === 'pending' || v.state === 'running'
					? [message('moveReview.pending', { gens: v.gens })]
					: []),
				...(notes.get(v.d) ?? [])
			]
		})),
		...(() => {
			const receipts = receiptsOf([...records, ...views.flatMap((v) => v.stopped)]);
			return {
				spent: spentGens(receipts),
				...(costUnknown(receipts) ? { spentUnknown: true } : {}),
				recordIds: receipts.map((r) => r.id)
			};
		})(),
		options
	};
}

async function addBodyClip(
	projectId: string,
	spec: MoveSpec,
	onProgress: (p: Progress) => void,
	recovery?: MeasurementRecoveryPlan
) {
	const { rec, project } = await loadProject(projectId),
		m = rec.manifest,
		rig = m.rig;
	const issue = bodyMoveIssue(m, spec, true);
	if (issue) throw issue;
	const version = moveRigVersion(rec);
	if (recovery && recovery.rigVersion !== version)
		throw new LocalizedError(
			'This character changed since these joint checks were reviewed.',
			'create.errors.characterChangedSinceJoint'
		);
	const intent = spec.measurementRecovery ?? spec.bodyPaletteRepair;
	const receiptSpecHash = intent ? await recoverySpecHash(spec) : undefined;
	const dirs = approvedMoveDirections(m, spec) as Direction[],
		affected = affectedMoveDirections(rig, dirs),
		n = moveFrames(m, spec),
		name = m.name;
	const plan = bodyClipPlan(rec, project, spec),
		{ model, authored } = plan;
	if (
		spec.startFrom &&
		(!moveSourceFitsGeometry(m, spec.startFrom) ||
			(!recovery && !moveSourceMatches(m, spec.startFrom, dirs)))
	)
		throw new LocalizedError(
			'The selected starting frame changed. Choose the source again. No generation was requested.',
			'moveSheet.startFrom.changed'
		);
	const starts = new Map<DirectionName, Img>();
	for (const direction of dirs) {
		const reference = spec.animation?.references?.[direction];
		const start = await moveReferenceImage(reference, 'start', rig.cell);
		if (start) starts.set(direction, start);
		if (model !== 'skeleton-v3') await moveReferenceImage(reference, 'end', rig.cell);
	}
	if (spec.startFrom || model !== 'skeleton-v3')
		for (const direction of dirs) {
			const rest = moveReferenceView(m, spec, direction);
			const image = rest && project.images.get(rest.image);
			if (!rest || !hasAll(rest.keypoints) || image?.w !== rig.cell.w || image.h !== rig.cell.h)
				throw new LocalizedError(
					`${direction}: original standing artwork or joints are missing.`,
					'create.errors.originalStandingArtworkJoints',
					{ direction }
				);
			if (spec.startFrom && (await cellHash(image)) !== rest.image)
				throw new LocalizedError(
					'The selected starting frame changed. Choose the source again. No generation was requested.',
					'moveSheet.startFrom.changed'
				);
		}
	const total =
		dirs.length *
			(1 + n + (authored || model !== 'skeleton-v3' ? 0 : 1 + moveMotionFrames(m, spec))) +
		(model === 'skeleton-v3' ? starts.size : 0);
	let done = 0;
	const tick = () =>
		onProgress({ step: 'animate', done: Math.min(total, ++done), total, recIds: [] });
	onProgress({ step: 'animate', done: 0, total, recIds: [] });
	const extra = dirs.map((): JobRec[] => []);
	const minimumTier = moveMinimumTier(m, spec);
	// Free choices reuse what the review saw, the exact receipts it replayed, and never send a request.
	const cacheOnly =
		spec.keepUnposed || spec.finishedViews
			? { ...(spec.reviewedReceipts ? { receipts: new Set(spec.reviewedReceipts) } : {}) }
			: undefined;
	const recoveryState = recovery && {
		intent: spec.measurementRecovery ?? { id: spec.bodyPaletteRepair!.id, recordIds: [] },
		rawHashes: new Set(recovery.rawHashes),
		checkHashes: new Set(recovery.checkHashes),
		tail: Promise.resolve()
	};
	const startPoses =
		model === 'skeleton-v3' && starts.size
			? await parallelGeneration(
					dirs.map((direction, index) => async (signal) => {
						const image = starts.get(direction);
						if (!image) return undefined;
						const start = await bodyStartPose(image, direction, spec, signal, (record) =>
							extra[index].push(record)
						);
						signal.throwIfAborted();
						tick();
						return start;
					}),
					spec.attempt ?? spec.seed,
					recoveryState,
					minimumTier,
					cacheOnly
				)
			: [];
	const clips = await parallelGeneration(
		dirs.map(
			(d, index) => (signal) =>
				bodyClip(
					plan,
					d,
					signal,
					() => {
						signal.throwIfAborted();
						tick();
					},
					starts.get(d),
					startPoses[index]
				)
		),
		spec.attempt ?? spec.seed,
		recoveryState,
		minimumTier,
		cacheOnly
	);

	onProgress({ step: 'save', done: 0, total: 1, recIds: [] });
	const fresh = (await db.get<StoredProject>('projects', projectId))!;
	if (!fresh || moveRigVersion(fresh) !== version)
		throw new LocalizedError(
			'This character changed in another tab while the move was generating. Reopen it before trying again.',
			'create.errors.characterChangedAnotherTab'
		);
	const fm = fresh.manifest,
		frig = fm.rig,
		baseIt = fm.items.find((i) => i.id === frig.baseItem)!;
	const old = frig.animations.find((a) => a.id === spec.id);
	const original = rec.manifest.rig.animations.find((animation) => animation.id === spec.id);
	const basePlayback = original && { loop: original.loop, moveLoop: original.moveLoop };
	const frameMs = defaultMs(spec.id);
	const referenceCount =
		model === 'skeleton-v3' && (authored || spec.action === 'walk')
			? moveFrames(m, { action: spec.action, frames: spec.frames })
			: n;
	const durationMs = referenceCount * frameMs;
	const anim: RigAnimation = {
		...old,
		id: spec.id,
		cells: n,
		loop: old?.loop ?? true,
		frames:
			old?.cells === n
				? old.frames
				: playlist(n, frameMs).map(({ cell }) => ({
						cell,
						ms: Math.round(((cell + 1) * durationMs) / n) - Math.round((cell * durationMs) / n)
					})),
		sources: { ...old?.sources }
	};
	for (const d of affected) delete anim.sources![d];
	const keep = spec.measurementRecovery?.keep;
	let staged = !!spec.reviewBeforePublish;
	// Kept without poses: only the views whose frames lack measured joints; no frame's joints are invented, so those views
	// wait to be made again before items fit them, and every other view keeps its poses.
	const unposedDirs = spec.keepUnposed
		? clips.filter((c) => c.out.measured.some((k) => !hasAll(k))).map((c) => c.d)
		: [];
	const structural = clips.some((c) =>
		c.out.qa.fails.some((f) => !(unposedDirs.includes(c.d) && f === MISSING_JOINTS))
	);
	if (keep) {
		// Consent covers only the reviewed frames and checks, recomputed here from the cached render that was replayed.
		const kept = clips.map((c) => ({
			dir: c.d,
			rawHash: c.out.recs[0]?.requestHash ?? '',
			qa: c.out.qa,
			frames: c.out.frames
		}));
		if (kept.some((c) => c.qa.fails.length) || (await keptBodyHash(version, kept)) !== keep.qaHash)
			throw new LocalizedError(
				'These body frames or their quality checks changed since review. Nothing was saved and no request was made. Review them again.',
				'create.errors.bodyFramesTheirQuality'
			);
	} else if (spec.keepUnposed) {
		// The user kept these reviewed frames as they are; only their missing joints are accepted.
		if (structural) throw old ? replacementBodyQa() : newMoveBodyQa();
	} else if (
		!spec.reviewBeforePublish &&
		spec.dirs &&
		clips.some(({ out: { qa } }) => failsBodyGate(qa, model !== 'skeleton-v3'))
	) {
		// A structural failure (missing joints, a broken frame) cannot be kept; a view that misses only the numerical body
		// checks was paid for, so it goes to the staged review where Save or Discard is the user's free choice.
		if (structural) throw old ? replacementBodyQa() : newMoveBodyQa();
		staged = true;
	}
	const layer = baseIt.layers[0],
		cellMap: Partial<Record<DirectionName, (Sha256 | null)[]>> = {
			...baseIt.layers[0].cells?.[spec.id]
		};
	const skeletons = (fresh.skeletons ??= {}),
		warnings: string[] = [];
	const reviewBlobs = staged ? new Map<string, Blob>() : null;
	const writeCell = async (hash: Sha256, image: Img) => {
		if (reviewBlobs) reviewBlobs.set(hash.slice(7), await cellBlob(image));
		else await putCell(hash, image);
	};
	const provenanceStart = baseIt.provenance.length;
	clearMovePoseData(frig, skeletons, spec.id, dirs);
	for (const [index, c] of clips.entries()) {
		const produced = c.out.frames.map((_, i) => cellKey(spec.id, c.d, i) as CellKey);
		const sources = [...extra[index], ...(c.motion ? [c.motion] : [])];
		const idx = [...sources, ...c.out.recs].map(
			(r, j) => baseIt.provenance.push(provOf(r, j >= sources.length ? produced : [])) - 1
		);
		const src: ClipSource = {
			route: model,
			reference: moveReferenceView(fm, spec, c.d)!.image,
			...(spec.startFrom ? { referenceKeypoints: spec.startFrom.views[c.d]!.keypoints } : {}),
			keypoints: c.keypoints,
			motion:
				model !== 'skeleton-v3'
					? `${model}:${spec.text?.trim() || spec.action || spec.id}`
					: spec.action === 'walk' && moveMotionSource(spec) === undefined
						? 'managed-skeleton-v3:walking-8-frames'
						: authored
							? `authored:${spec.action}`
							: `pixminimax:${spec.text?.trim() || spec.action || spec.id}`,
			measured: c.out.measured.map((x) => x ?? []),
			...(c.out.processing ? { processing: c.out.processing } : {}),
			...(c.motionEcho ? { motionEcho: c.motionEcho } : {}),
			...(c.motionBridged ? { motionBridged: c.motionBridged } : {}),
			provenance: idx
		};
		const unposed = unposedDirs.includes(c.d);
		if (!unposed) anim.sources![c.d] = src;
		cellMap[c.d] = await Promise.all(
			c.out.frames.map(async (f, i) => {
				const h = await cellHash(f);
				await writeCell(h, f);
				const s = c.out.measured[i];
				if (s && !unposed) skeletons[cellKey(spec.id, c.d, i)] = fromApi(s, frig.cell);
				return h;
			})
		);
		warnings.push(...warn(`${spec.id}/${c.d}`, c.out.qa));
	}
	for (const d of frig.directions.filter((x) => x.mirrorOf)) {
		const src = clips.find((c) => c.d === d.mirrorOf);
		if (!src) continue;
		cellMap[d.id] = await Promise.all(
			src.out.frames.map(async (f, i) => {
				const im = flipH(f),
					h = await cellHash(im);
				await writeCell(h, im);
				const s = skeletons[cellKey(spec.id, src.d, i)];
				if (s) skeletons[cellKey(spec.id, d.id, i)] = flipSkeleton(s, frig.cell.w);
				return h;
			})
		);
	}
	if (!Object.keys(anim.sources!).length) delete anim.sources;
	// anchors for the new clip straight from the measured keypoints (no patch tracking: the clip is posed, not redrawn); an
	// unposed view (and its mirror) has no skeletons, so it gets no anchors
	for (const id of ANCHORS) {
		const pts = (d: DirectionName) =>
			Array.from({ length: n }, (_, i) => {
				const s = skeletons[cellKey(spec.id, d, i)];
				return s ? anchorsOf(s)[id] : undefined;
			});
		const track = ((frig.anchors ??= {})[id] ??= {});
		for (const d of frig.directions.filter((d) => affected.includes(d.id))) {
			const p = pts(d.id);
			if (p.every(Boolean)) (track[spec.id] ??= {})[d.id] = p as [number, number][];
		}
	}
	frig.animations = old
		? frig.animations.map((a) => (a === old ? anim : a))
		: [...frig.animations, anim];
	(layer.cells ??= {})[spec.id] = cellMap;
	// adding a clip changes baseHash; items made against the old base keep every old cell, so they move to the new hash
	const hashes = storedCellHashes(frig, layer.cells);
	const oldHash = frig.baseHash;
	frig.baseHash = await baseHashOf(frig, hashes);
	// Unchanged clips keep their hashes. Replaced clips lose item coverage in the publication transaction below.
	for (const it of fm.items) if (it.baseHash === oldHash) it.baseHash = frig.baseHash;
	const errs = validateRig(frig);
	if (!errs.length)
		errs.push(
			...validateRig(
				{
					...frig,
					animations: [anim],
					directions: frig.directions.filter((direction) => affected.includes(direction.id))
				},
				hashes
			)
		);
	if (errs.length)
		throw new LocalizedError(`rig not valid: ${errs.join('; ')}`, 'create.errors.rigValid', {
			errs: errs.join('; ')
		});
	const qa = (fresh.rigQa ?? {}) as { warnings?: string[]; clips?: Record<string, ClipQa> };
	const checks = Object.fromEntries(clips.map((clip) => [`${spec.id}/${clip.d}`, clip.out.qa]));
	if (reviewBlobs) {
		const candidate: MoveCandidate = {
			// A staged numbers-only result is body only, like every review: equipment is a separate priced choice after Save.
			spec: spec.reviewBeforePublish
				? spec
				: {
						...spec,
						items: [],
						itemReview: undefined,
						reviewedMoveItems: undefined,
						reviewBeforePublish: true
					},
			input: moveCandidateInput(rec, spec.id),
			dirs,
			animation: anim,
			basePlayback,
			cells: cellMap,
			provenance: baseIt.provenance.slice(provenanceStart),
			provenanceStart,
			anchors: Object.fromEntries(
				Object.entries(frig.anchors ?? {}).flatMap(([id, track]) =>
					track?.[spec.id] ? [[id, { [spec.id]: track[spec.id] }]] : []
				)
			),
			skeletons: Object.fromEntries(
				Object.entries(skeletons).filter(([key]) => key.startsWith(`${spec.id}/`))
			),
			checks,
			warnings,
			...(intent
				? {
						moveRecovery: {
							id: intent.id,
							originalRigVersion: intent.rigVersion,
							specHash: receiptSpecHash!
						}
					}
				: {})
		};
		await db.updateCharacter<StoredProject>(
			projectId,
			reviewBlobs,
			(current) => {
				if (!current || moveCandidateInput(current, spec.id) !== candidate.input)
					throw new LocalizedError(
						'The character changed before the review was saved.',
						'moveSheet.checkpoint.changed'
					);
				if (spec.reviewRegeneration) currentMoveCandidate(current, spec.reviewRegeneration);
				else if (Object.hasOwn(current.moveReviews ?? {}, spec.id)) throw changedMoveCandidate();
				current.moveReviews = { ...current.moveReviews, [spec.id]: candidate };
				return current;
			},
			moveCandidateBlobGuard(cellMap, reviewBlobs)
		);
		return candidate;
	}
	fresh.rigQa = {
		...qa,
		warnings: [
			...(qa.warnings ?? []).filter((w) => !affected.some((d) => w.startsWith(`${spec.id}/${d}:`))),
			...warnings
		],
		clips: { ...qa.clips, ...checks },
		...(setupRedoMoves(fresh).length || unposedDirs.length
			? {
					redo: redoAfterSave(setupRedoMoves(fresh), anim, drawnViews(frig, cellMap), unposedDirs)
				}
			: {})
	};
	// R6 P1-5: `fresh` was read before ~30 cell writes; graft only what this clip changed onto the CURRENT record in one
	// transaction, so an item accepted or an outfit autosaved meanwhile survives.
	await db.update<StoredProject>('projects', projectId, (cur) => {
		if (!cur) throw new Error(`project ${projectId} vanished`);
		if (
			moveRigVersion(cur) !== version ||
			(!recovery && spec.startFrom && !moveSourceMatches(cur.manifest, spec.startFrom, dirs))
		)
			throw new LocalizedError(
				'This character changed in another tab before the move could be saved. Reopen it before trying again.',
				'create.errors.characterChangedAnotherTab2'
			);
		clearMovePoseData(cur.manifest.rig, (cur.skeletons ??= {}), spec.id, dirs);
		const cb = cur.manifest.items.find((i) => i.id === frig.baseItem)!;
		if (old) invalidateMoveItems(cur.manifest, spec.id, dirs);
		// Export choices can change while artwork is being generated. The current record owns those choices.
		retainMoveChoices(frig, cur.manifest.rig);
		applyMoveLoop(
			anim,
			spec.animation?.loop,
			basePlayback,
			cur.manifest.rig.animations.find((animation) => animation.id === spec.id)
		);
		cur.manifest.rig = frig;
		cb.provenance = baseIt.provenance;
		cb.layers[0].cells = layer.cells;
		for (const it of cur.manifest.items) if (it.baseHash === oldHash) it.baseHash = frig.baseHash;
		cur.skeletons = { ...cur.skeletons, ...skeletons };
		cur.rigQa = fresh.rigQa;
		if (intent)
			cur.moveRecovery = {
				id: intent.id,
				originalRigVersion: intent.rigVersion,
				bodyRigVersion: moveRigVersion(cur),
				specHash: receiptSpecHash!
			};
		cur.savedAt = new Date().toISOString();
		return cur;
	});
}

const changedMoveCandidate = () =>
	new LocalizedError(
		'The character or move changed. Reopen the review before continuing.',
		'moveSheet.checkpoint.changed'
	);

function currentMoveCandidate(
	rec: StoredProject,
	reviewed: Pick<MoveSpec, 'id' | 'seed' | 'activityScope'>
) {
	const id = reviewed.id;
	const saved = Object.hasOwn(rec.moveReviews ?? {}, id) ? rec.moveReviews![id] : undefined;
	if (
		!saved ||
		saved.spec.activityScope !== reviewed.activityScope ||
		saved.spec.seed !== reviewed.seed
	)
		throw changedMoveCandidate();
	return saved;
}

export async function readMoveCandidateImages(candidate: MoveCandidate) {
	const images = new Map<string, Img>();
	const hashes = new Set(Object.values(candidate.cells).flatMap((cells) => cells ?? []));
	await Promise.all(
		[...hashes].map(async (hash) => {
			if (!hash) return;
			const blob = await db.getBlob(hash.slice(7));
			if (!blob)
				throw new LocalizedError(
					'The reviewed frames are no longer available.',
					'moveSheet.checkpoint.missingFrames'
				);
			images.set(hash, await decodePng(blob));
		})
	);
	return images;
}

function moveCandidateBlobGuard(cells: MoveCandidate['cells'], written: Map<string, Blob>) {
	return {
		keys: [...new Set(Object.values(cells).flat())].flatMap((hash) =>
			hash && !written.has(hash.slice(7)) ? [hash.slice(7)] : []
		),
		missing: () =>
			new LocalizedError(
				'The reviewed frames are no longer available.',
				'moveSheet.checkpoint.missingFrames'
			)
	};
}

export async function resolveMoveCandidate(
	projectId: string,
	reviewed: MoveCandidate,
	accept: boolean
) {
	const id = reviewed.spec.id;
	if (!accept) {
		await db.update<StoredProject>('projects', projectId, (current) => {
			if (!current) throw changedMoveCandidate();
			currentMoveCandidate(current, reviewed.spec);
			delete current.moveReviews![id];
			return current;
		});
		return;
	}
	const { rec, project } = await loadProject(projectId);
	const candidate = currentMoveCandidate(rec, reviewed.spec);
	if (moveCandidateInput(rec, id) !== candidate.input) throw changedMoveCandidate();
	if (moveCandidateHasStructuralFailure(candidate))
		throw new LocalizedError(
			'This move needs fixes before it can be kept.',
			'moveSheet.checkpoint.hardFailure'
		);
	const version = moveRigVersion(rec);
	const rig = rec.manifest.rig;
	const oldHash = rig.baseHash;
	const base = rec.manifest.items.find((item) => item.id === rig.baseItem)!;
	const provenanceStart = base.provenance.length;
	const next = structuredClone(candidate.animation);
	for (const dir of candidate.dirs) {
		const source = next.sources?.[dir];
		if (source)
			source.provenance = source.provenance?.map(
				(index) => index - candidate.provenanceStart + provenanceStart
			);
	}
	if (candidate.spec.replace)
		rig.animations = rig.animations.map((move) => (move.id === id ? next : move));
	else rig.animations.push(next);
	clearMovePoseData(rig, (rec.skeletons ??= {}), id, candidate.dirs);
	for (const [anchor, track] of Object.entries(candidate.anchors ?? {}))
		if (track?.[id])
			((rig.anchors ??= {})[anchor as keyof NonNullable<Rig['anchors']>] ??= {})[id] = track[id];
	base.provenance.push(...candidate.provenance);
	(base.layers[0].cells ??= {})[id] = candidate.cells;
	for (const [hash, image] of await readMoveCandidateImages(candidate))
		project.images.set(hash, image);
	rig.baseHash = await baseHashOf(rig, storedCellHashes(rig, base.layers[0].cells));
	const split = await splitBase(project, id);
	deriveMaterials(project);
	const blobs = new Map<string, Blob>();
	for (const [hash, image] of split.images) blobs.set(hash.slice(7), await cellBlob(image));
	const affected = affectedMoveDirections(rig, candidate.dirs);
	await db.updateCharacter<StoredProject>(
		projectId,
		blobs,
		(current) => {
			if (
				!current ||
				moveRigVersion(current) !== version ||
				current.manifest.rig.baseHash !== oldHash
			)
				throw changedMoveCandidate();
			currentMoveCandidate(current, reviewed.spec);
			const manifest = current.manifest;
			const currentBase = manifest.items.find((item) => item.id === rig.baseItem)!;
			if (currentBase.provenance.length !== provenanceStart) throw changedMoveCandidate();
			clearMovePoseData(manifest.rig, (current.skeletons ??= {}), id, candidate.dirs);
			if (candidate.spec.replace) invalidateMoveItems(manifest, id, candidate.dirs);
			retainMoveChoices(rig, manifest.rig);
			applyMoveLoop(
				next,
				candidate.spec.animation?.loop,
				candidate.basePlayback,
				manifest.rig.animations.find((animation) => animation.id === id)
			);
			manifest.rig = rig;
			if (candidate.moveRecovery)
				current.moveRecovery = {
					...candidate.moveRecovery,
					bodyRigVersion: moveRigVersion(current)
				};
			Object.assign(currentBase, {
				provenance: base.provenance,
				layers: base.layers,
				regions: base.regions,
				materials: base.materials
			});
			manifest.materials = [
				...manifest.materials.filter((material) => material.owner !== base.id),
				...rec.manifest.materials.filter((material) => material.owner === base.id)
			];
			for (const item of manifest.items)
				if (item.baseHash === oldHash) item.baseHash = rig.baseHash;
			Object.assign(current.skeletons, candidate.skeletons);
			const qa = (current.rigQa ?? {}) as { warnings?: string[]; clips?: Record<string, ClipQa> };
			current.rigQa = {
				...qa,
				warnings: [
					...(qa.warnings ?? []).filter(
						(warning) => !affected.some((dir) => warning.startsWith(`${id}/${dir}:`))
					),
					...candidate.warnings
				],
				clips: { ...qa.clips, ...candidate.checks },
				...(setupRedoMoves(current).length
					? {
							redo: redoAfterSave(
								setupRedoMoves(current),
								next,
								drawnViews(rig, base.layers[0].cells?.[id])
							)
						}
					: {})
			};
			delete current.moveReviews![id];
			current.savedAt = new Date().toISOString();
			return current;
		},
		moveCandidateBlobGuard(base.layers[0].cells?.[id] ?? {}, blobs)
	);
	return moveCandidateInput(rec, id);
}

/** Copy a loaded (fixture) project into IndexedDB as an editable rig project, so items can be generated for it. */
export async function saveCopy(
	p: { manifest: Manifest; images: Map<string, Img> },
	name: string,
	standingSource?: string
): Promise<string> {
	const m: Manifest = structuredClone(p.manifest);
	m.name = name;
	const id = `rig-${m.rig.baseHash.slice(7, 19)}`;
	m.exportId = defaultCharacterExportId(id, name);
	if (await db.get('projects', id)) return id;
	const images = new Map(p.images);
	// The bundled demo explicitly supplies its standing source; imported characters never guess a move by name.
	if (standingSource && !m.rig.animations.some((a) => a.id === DEFAULT_MOVE)) {
		const source = m.rig.animations.find((a) => a.id === standingSource);
		if (!source)
			throw new LocalizedError(
				'The demo standing reference is missing.',
				'create.errors.demoStandingReferenceMissing'
			);
		for (const item of m.items) {
			// Equipment covers the standing move exactly where it covers the source frame.
			if (item.coverage)
				item.coverage.push(
					...m.rig.directions
						.filter(
							(dir) => !dir.mirrorOf && item.coverage!.includes(`${standingSource}/${dir.id}/0`)
						)
						.map((dir) => `${DEFAULT_MOVE}/${dir.id}/0` as const)
				);
			for (const layer of item.layers) {
				(layer.cells ??= {})[DEFAULT_MOVE] = {};
				for (const dir of m.rig.directions) {
					const image = cellImg(p, layer, standingSource, dir.id, 0);
					if (!image && item.id === m.rig.baseItem)
						throw new LocalizedError(
							`The demo has no standing body facing ${dir.id}.`,
							'create.errors.demoStandingBodyFacing',
							{ id: dir.id }
						);
					const hash = image ? await cellHash(image) : null;
					layer.cells[DEFAULT_MOVE][dir.id] = [hash];
					if (image && hash) images.set(hash, image);
				}
			}
		}
		m.rig.animations.unshift({ id: DEFAULT_MOVE, cells: 1, loop: true, frames: playlist(1, 100) });
		const hashes: Record<string, Sha256> = {},
			base = m.items.find((i) => i.id === m.rig.baseItem)!;
		for (const key of cellKeys(m.rig)) {
			const [anim, dir, frame] = key.split('/'),
				image = cellImg(
					{ manifest: m, images },
					base.layers[0],
					anim,
					dir as DirectionName,
					+frame
				);
			if (image) hashes[key] = await cellHash(image);
		}
		const oldHash = m.rig.baseHash;
		m.rig.baseHash = await baseHashOf(m.rig, hashes);
		for (const item of m.items) if (item.baseHash === oldHash) item.baseHash = m.rig.baseHash;
	}
	const blobs = new Map<string, Blob>();
	for (const [h, im] of images)
		blobs.set(
			h.slice(7),
			new Blob([(await encodePngBytes(im)) as Uint8Array<ArrayBuffer>], { type: 'image/png' })
		);
	await db.updateCharacter<StoredProject>(
		id,
		blobs,
		(current) =>
			current ?? {
				id,
				savedAt: new Date().toISOString(),
				manifest: m,
				skeletons: {},
				rigQa: { warnings: [], pivotFrom: '', tracks: [] },
				origin: 'studio'
			}
	);
	return id;
}
