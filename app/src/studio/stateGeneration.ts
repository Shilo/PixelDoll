import { app, getKeyRevision, refreshBalance } from '../lib/app.svelte.ts';
import { sha256, stableStringify } from '../lib/image/hash.ts';
import { base64ToBytes, bytesToBase64, decodePng, type Img } from '../lib/image/png.ts';
import type { ImageReference } from '../lib/image/reference.ts';
import { LocalizedError, message, type Message } from '../lib/message.ts';
import { stateBatchScope } from '../lib/pixellab/activity.ts';
import { api, API_BASE, ApiError } from '../lib/pixellab/client.ts';
import { planRestriction, localizedPlanRestriction } from '../lib/pixellab/plans.ts';
import { live, managedStateSubmitChildId, queue, type JobRec } from '../lib/pixellab/queue.ts';
import { routes, type Req, type Size } from '../lib/pixellab/routes.ts';
import { regionMarker } from '../lib/dress/regions.ts';
import { stateColorMatcher } from '../lib/dress/stateColors.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import {
	DEFAULT_MOVE,
	baseHashOf,
	cellHash,
	storedCellHashes,
	type DirectionName,
	type RigAnimation
} from '../lib/rig/rig.ts';
import * as db from '../lib/store/db.ts';
import { assignNewClipExportId } from '../lib/store/identity.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import { cellBlob, imagesOf, provOf, run } from './create.ts';
import { pendingStateName, stateCaptureNameIssue } from './moveActions.svelte.ts';
import { stateClipName } from '../lib/rig/poses.ts';
import { moveLabel } from './model.ts';
import { withClipWriteLock } from './clipName.ts';
import { doc, flushSave, openProject, syncStoredProject, toast, ui } from './state.svelte.ts';
import {
	stateAttempts,
	stateContinuationBatches,
	stateRecoveryRecords,
	stateReviewBatches,
	stateReviewReceipts
} from './stateRecovery.ts';
import { groundToSource } from './stateGrounding.ts';
import {
	localStateCost,
	managedStateCost,
	planStateGeneration,
	type StateGenerationCost,
	type StateGenerationModel
} from './stateGenerationPlan.ts';
import {
	managedStateInventory,
	stateGenerationSource,
	stateSourceFits,
	verifyManagedStateParent,
	type ManagedStateDetail,
	type StateSourceFrame
} from './stateGenerationSource.ts';
import {
	decodeStateBatch,
	stateRequests,
	type ReadyStatePlan
} from './stateGenerationTransport.ts';

export interface StateAttempt {
	token: string;
	id: string;
	/** The instructions sent, shown again while the result is reviewed. */
	description?: string;
	source: StateSourceFrame;
	sourceVersion: string;
	/** Made from the Riding pose idea, so the review checks it as a riding stance. */
	riding?: boolean;
	plan: ReadyStatePlan & { cost: StateGenerationCost };
	continuation?: {
		model: StateGenerationModel;
		description: string;
		seed: number;
		credential: string;
		unqueued: number[];
		parentId?: string;
		reference?: { hash: string; width: number; height: number };
	};
}

export interface StateContinuationQuote {
	projectId: string;
	token: string;
	keyRevision: number;
	missing: number[];
	keptViews: number;
	remainingViews: number;
	cost: StateGenerationCost;
}

export interface PreparedState {
	projectId: string;
	id: string;
	source: StateSourceFrame;
	description: string;
	model: StateGenerationModel;
	reference?: ImageReference;
	sourceVersion: string;
	keyRevision: number;
	plan: StateAttempt['plan'];
	parentName?: string;
}

export interface StateReview {
	projectId: string;
	id: string;
	description?: string;
	riding?: boolean;
	source: StateSourceFrame;
	token: string;
	sourceVersion: string;
	endpoint: ReadyStatePlan['endpoint'];
	views: { direction: DirectionName; image: Img }[];
	/** Drawn facings PixelLab returned blank, failed or unreadable: the State is saved without them and their mirrors. */
	missing: DirectionName[];
	/** Of `missing`: facings whose download failed, which may still come back on Try again. */
	unfetched: DirectionName[];
	/** Of `missing`: facings of a batch canceled before it was made. */
	canceled: DirectionName[];
	/** Of `missing`: facings of batches never sent because an earlier batch stopped the run; a continuation can buy them. */
	unmade: DirectionName[];
	/** The batch receipts this review was read from (stateReviewReceipts), checked again before saving without `unmade`. */
	receipts?: string;
	/** As returned, for facings that came back off the source's ground and were moved onto it in `views`. */
	ungrounded: Partial<Record<DirectionName, Img>>;
	provenance: ReturnType<typeof provOf>[];
	childId?: string;
}

type StateErrorKey =
	Extract<Message['key'], `stateGeneration.${string}`> extends `stateGeneration.${infer Key}`
		? Key
		: never;
const error = (text: string, key: StateErrorKey) =>
	new LocalizedError(text, `stateGeneration.${key}`);
const changed = () =>
	error('The source or quote changed. Review a new quote before generating.', 'changed');
const missing = () =>
	error('The source frame needs saved artwork in every drawn direction.', 'sourceUnavailable');
const invalidResult = () =>
	error('PixelLab did not return all expected views at the planned size.', 'invalidResult');
// Attempts saved before States recorded their source frame can only be discarded.
const outdated = () =>
	error(
		'This unfinished State was started by an older version of PixelDoll. Discard it to start again.',
		'outdated'
	);
const unfinished = () =>
	error(
		'This attempt has unfinished or unavailable results. Check Activity. No request was resent.',
		'unfinished'
	);

// One lock per attempt, held while it sends or reads its requests, so no tab resends or discards it meanwhile.
const stateLockName = (token: string) => `pixeldoll-state:${token}`;

/** Whether no tab holds this attempt's lock right now (it is not sending or reading its requests). */
function stateLockFree(token: string): Promise<boolean> {
	if (!navigator.locks) return Promise.resolve(false);
	return navigator.locks.request(stateLockName(token), { ifAvailable: true }, (lock) => !!lock);
}

function withStateLock<T>(token: string, work: () => Promise<T>): Promise<T> {
	if (!navigator.locks)
		return Promise.reject(
			error('This browser cannot lock paid State attempts.', 'locksUnavailable')
		);
	return navigator.locks.request(stateLockName(token), { ifAvailable: true }, (lock) => {
		if (!lock) throw unfinished();
		return work();
	});
}

function assertSelected(projectId: string) {
	if (doc.id !== projectId || !projectId.startsWith('rig-')) throw changed();
}

async function readRotation(url: string) {
	const target = new URL(url);
	const provider = new URL(API_BASE);
	const local = provider.hostname === 'localhost' && target.origin === provider.origin;
	if ((!local && target.protocol !== 'https:') || target.username || target.password)
		throw invalidResult();
	const response = await fetch(target, {
		credentials: 'omit',
		cache: 'no-store',
		redirect: 'error',
		signal: AbortSignal.timeout(30_000)
	});
	if (!response.ok) throw invalidResult();
	return decodePng(await response.blob());
}

const readManaged = (id: string) =>
	api<ManagedStateDetail>(app.key, 'GET', routes.getCharacter(id).path);

function validShape(value: unknown): value is Size {
	if (!value || typeof value !== 'object') return false;
	const shape = value as Size;
	return (
		Number.isSafeInteger(shape.width) &&
		Number.isSafeInteger(shape.height) &&
		shape.width > 0 &&
		shape.height > 0
	);
}

async function flashShapes(reference: boolean) {
	type EditCapabilities = {
		sizes?: unknown;
		edit_methods?: unknown;
		max_reference_images?: number;
		custom_sizes?: {
			enabled?: boolean;
			min_width?: number;
			min_height?: number;
			max_width?: number;
			max_height?: number;
			step?: number;
		};
	};
	const capabilities = await api<{ operations?: { edit?: EditCapabilities } }>(
		app.key,
		'GET',
		routes.proFlashCapabilities().path
	);
	const edit = capabilities?.operations?.edit;
	if (
		!Array.isArray(edit?.edit_methods) ||
		!edit.edit_methods.includes(reference ? 'reference' : 'text') ||
		(reference && !edit.max_reference_images)
	)
		return [];
	const shapes = Array.isArray(edit.sizes) ? edit.sizes.filter(validShape) : [];
	const { enabled, min_width, min_height, max_width, max_height, step } = edit.custom_sizes ?? {};
	const minimum = { width: min_width, height: min_height };
	const maximum = { width: max_width, height: max_height };
	if (
		enabled &&
		validShape(minimum) &&
		validShape(maximum) &&
		maximum.width <= 256 &&
		maximum.height <= 256 &&
		typeof step === 'number' &&
		Number.isSafeInteger(step) &&
		step >= 4
	) {
		for (let width = minimum.width; width <= maximum.width; width += step)
			for (let height = minimum.height; height <= maximum.height; height += step)
				shapes.push({ width, height });
	}
	return shapes;
}

async function flashCost(plan: ReadyStatePlan): Promise<StateGenerationCost> {
	const canvases = plan.batches.map((batch) =>
		batch.transport === 'sheet' ? batch.canvas : plan.cellSize
	);
	const quotes = new Map<string, number>();
	let total = 0;
	for (const { width, height } of canvases) {
		const shape = `${width}x${height}`;
		if (!quotes.has(shape)) {
			const quote = await api<{ total?: number }>(
				app.key,
				'GET',
				`/pro-flash/cost?operation=edit&width=${width}&height=${height}&n_directions=1`
			);
			const units = quote?.total;
			if (typeof units !== 'number' || !Number.isFinite(units) || units <= 0)
				throw error('PixelLab did not provide a usable Pro Flash quote.', 'quoteUnavailable');
			quotes.set(shape, units);
		}
		total += quotes.get(shape)!;
	}
	return { kind: 'estimate', minGenerations: total, maxGenerations: total };
}

type LoadedProject = Awaited<ReturnType<typeof loadProject>>;

/** Picks the route one model takes for this source and prices it; PixelLab is only read, never charged. */
async function routeState(
	rec: LoadedProject['rec'],
	project: LoadedProject['project'],
	sourceFrame: StateSourceFrame,
	description: string,
	model: StateGenerationModel,
	reference?: ImageReference
) {
	const source = stateGenerationSource(project, sourceFrame);
	if (!source) throw missing();
	let managedParent;
	// Only Standing matches the character's own PixelLab rotations; other frames use image edits.
	if (
		sourceFrame.clip === DEFAULT_MOVE &&
		sourceFrame.frame === 0 &&
		model === 'pro' &&
		!reference &&
		rec.character?.id &&
		Array.from(description).length <= 1000
	) {
		const id = rec.character.id;
		try {
			const detail = await readManaged(id);
			managedParent = await verifyManagedStateParent(source, id, detail, (url) =>
				readRotation(url).catch(() => null)
			);
		} catch (cause) {
			if (!(cause instanceof ApiError) || (cause.status !== 403 && cause.status !== 404))
				throw cause;
		}
	}
	const candidate = planStateGeneration({
		model,
		cellSize: source.size,
		facingIds: source.views.map(({ direction }) => direction),
		referenceSize: reference ? { width: reference.width, height: reference.height } : undefined,
		managedParent: managedParent ?? undefined,
		flashNativeShapes: model === 'pro-flash' ? await flashShapes(!!reference) : undefined
	});
	if (candidate.kind === 'rejected') {
		if (candidate.reason === 'flash-shapes-unconfirmed')
			throw error('PixelLab did not confirm Pro Flash edit sizes.', 'flashSizesUnavailable');
		throw error(
			'This model cannot edit this canvas with the selected reference. Choose another model or reference.',
			'unsupported'
		);
	}
	const cost =
		candidate.cost ??
		(candidate.endpoint === '/create-character-state'
			? managedStateCost(source.size)
			: await flashCost(candidate));
	return { source, candidate, cost, managedParent };
}

/** What each model is sent: Pro Flash with a reference ignores the instructions and Pixen takes no reference. */
export function stateModelInput(
	model: StateGenerationModel,
	description: string,
	reference?: ImageReference
) {
	return {
		description: model === 'pro-flash' && reference ? '' : description.trim(),
		reference: model === 'pixen' ? undefined : reference
	};
}

/**
 * Prices several models for one draft, for the Model list. A model that cannot take this draft, or whose quote
 * PixelLab does not confirm, is priced as null: choosing it shows the full reason through the usual quote.
 */
export async function quoteStateModels(
	projectId: string,
	sourceFrame: StateSourceFrame,
	description: string,
	reference: ImageReference | undefined,
	models: readonly StateGenerationModel[]
): Promise<Partial<Record<StateGenerationModel, StateGenerationCost | null>>> {
	assertSelected(projectId);
	if (!app.key) throw error('Connect to PixelLab to check the route and price.', 'connect');
	await flushSave();
	const { rec, project } = await loadProject(projectId);
	const costs = await Promise.all(
		models.map(async (model) => {
			const input = stateModelInput(model, description, reference);
			try {
				const routed = await routeState(
					rec,
					project,
					sourceFrame,
					input.description,
					model,
					input.reference
				);
				return [model, routed.cost] as const;
			} catch {
				return [model, null] as const;
			}
		})
	);
	return Object.fromEntries(costs);
}

export async function prepareState(
	projectId: string,
	source: StateSourceFrame,
	id: string,
	description: string,
	model: StateGenerationModel,
	reference?: ImageReference
): Promise<PreparedState> {
	return prepareStatePlan(projectId, source, id, description, model, reference);
}

async function prepareStatePlan(
	projectId: string,
	sourceFrame: StateSourceFrame,
	id: string,
	description: string,
	model: StateGenerationModel,
	reference?: ImageReference,
	continuationToken?: string
): Promise<PreparedState> {
	assertSelected(projectId);
	if (!app.key) throw error('Connect to PixelLab to check the route and price.', 'connect');
	const keyRevision = getKeyRevision();
	description = description.trim();
	const limit = model === 'pixen' ? 500 : 2000;
	if (
		(!description && !reference) ||
		Array.from(description).length > limit ||
		!id ||
		id.length > 100
	)
		throw error('Check the State name and edit instructions.', 'invalidInput');
	await flushSave();
	const { rec, project } = await loadProject(projectId);
	const others = stateAttempts(rec).filter(({ token }) => token !== continuationToken);
	const issue = stateCaptureNameIssue(rec.manifest, id, [
		...Object.keys(rec.moveReviews ?? {}),
		...others.map((attempt) => attempt.id)
	]);
	if (issue || (!continuationToken && (await pendingStateName(projectId, id))))
		throw new LocalizedError('That State name is unavailable.', issue ?? 'stateCapture.takenName');
	if (continuationToken && !rec.stateGenerations?.[continuationToken]) throw unfinished();
	const { source, candidate, cost, managedParent } = await routeState(
		rec,
		project,
		sourceFrame,
		description,
		model,
		reference
	);
	await refreshBalance();
	if (app.keyRejected || app.balanceError)
		throw error(
			'PixelLab could not confirm this account. Check your connection and try again.',
			'connect'
		);
	const restriction = planRestriction(app.balance, {
		method: 'POST',
		endpoint: candidate.endpoint,
		params: undefined
	});
	if (restriction) throw localizedPlanRestriction(restriction) ?? new Error(restriction);
	assertSelected(projectId);
	if (keyRevision !== getKeyRevision()) throw changed();
	return {
		projectId,
		id,
		source: { ...sourceFrame },
		description,
		model,
		reference,
		sourceVersion: source.version,
		keyRevision,
		plan: { ...candidate, cost },
		parentName: managedParent?.name ?? undefined
	};
}

/** `known`: views this review already read from the same child; a retry keeps them and fetches only the rest. */
async function childViews(attempt: StateAttempt, record: JobRec, known?: StateReview) {
	const childId = managedStateSubmitChildId(record);
	if (
		!childId ||
		attempt.plan.endpoint !== '/create-character-state' ||
		childId === attempt.plan.parentId
	)
		throw invalidResult();
	if (!app.key || app.keyRejected)
		throw error('Connect to PixelLab to recover the saved State views.', 'connect');
	const detail = await readManaged(childId);
	if (detail.id !== childId) throw invalidResult();
	const status = detail.status ?? 'completed';
	// A lost poll can settle while PixelLab still draws the child: it is not done yet, not a bad result.
	if (status !== 'completed' && status !== 'failed') throw unfinished();
	const inventory = managedStateInventory(detail);
	const { width, height } = attempt.plan.cellSize;
	if (
		status !== 'completed' ||
		detail.size?.width !== width ||
		detail.size?.height !== height ||
		inventory?.count !== attempt.plan.remoteFacingCount
	)
		throw invalidResult();
	// Each facing on its own: a missing, unreadable or blank one is named in review instead of costing the rest. One that
	// could not be downloaded is named apart: it may still download on Try again, and is lost once the State is saved.
	const unfetched: DirectionName[] = [];
	const read = await Promise.all(
		attempt.plan.batches[0].facingIds.map(async (direction) => {
			const kept =
				known?.token === attempt.token && known.childId === childId
					? known.views.find((view) => view.direction === direction)
					: undefined;
			if (kept) return kept;
			const url = inventory.rotations[direction];
			if (typeof url !== 'string' || !url.trim()) return null;
			const image = await readRotation(url).then(
				(image) => image,
				(cause: unknown) => {
					console.warn(`The ${direction} State view could not be downloaded.`, cause);
					unfetched.push(direction);
					return null;
				}
			);
			return image?.w === width && image.h === height && opaqueBox(image)
				? { direction, image }
				: null;
		})
	);
	return { childId, views: read.filter((view) => view !== null), unfetched };
}

async function readReview(
	projectId: string,
	attempt: StateAttempt,
	records: JobRec[],
	known?: StateReview
): Promise<StateReview> {
	const plan = attempt.plan;
	const result: {
		childId?: string;
		views: StateReview['views'];
		unfetched?: DirectionName[];
	} =
		plan.endpoint === '/create-character-state'
			? await childViews(attempt, records[0], known)
			: {
					views: (
						await Promise.all(
							records.map(async (record, index) => {
								// A batch that failed or cannot be read loses only its own facings, which review names.
								if (record.state !== 'done') return [];
								try {
									const images = await imagesOf(record);
									return decodeStateBatch(
										plan,
										plan.batches[index],
										images.map(({ img }) => img)
									);
								} catch (cause) {
									console.warn('A State batch could not be read.', cause);
									return [];
								}
							})
						)
					).flat()
				};
	if (!result.views.length) throw invalidResult();
	const drawn = new Set(result.views.map(({ direction }) => direction));
	const missing = plan.batches
		.flatMap(({ facingIds }) => facingIds)
		.filter((direction) => !drawn.has(direction));
	const unfetched = missing.filter((direction) => result.unfetched?.includes(direction));
	// Canceled batches were never made; saving says so rather than dropping them unnoticed.
	const canceled = records.flatMap((record, index) =>
		plan.endpoint !== '/create-character-state' && record.state === 'canceled'
			? plan.batches[index].facingIds
			: []
	);
	const ungrounded: StateReview['ungrounded'] = {};
	// Managed results stay exactly as PixelLab stored them; local edits are offered back on the source's ground.
	if (plan.endpoint !== '/create-character-state') {
		const { project } = await loadProject(projectId);
		const source = stateGenerationSource(project, attempt.source);
		if (source?.version === attempt.sourceVersion)
			result.views = result.views.map((view) => {
				const original = source.views.find(({ direction }) => direction === view.direction);
				if (!original) return view;
				const { image, shift } = groundToSource(view.image, original.image);
				if (shift) ungrounded[view.direction] = view.image;
				return { ...view, image };
			});
	}
	return {
		childId: result.childId,
		views: result.views,
		missing,
		unfetched,
		canceled,
		unmade: [],
		ungrounded,
		projectId,
		id: attempt.id,
		description: attempt.description,
		...(attempt.riding && { riding: true }),
		source: attempt.source,
		token: attempt.token,
		sourceVersion: attempt.sourceVersion,
		endpoint: plan.endpoint,
		provenance: records.map((record) => provOf(record))
	};
}

/** Resolves once the attempt is saved, so it is listed and survives a reload; `finished` settles when its views are back.
 *  A failure before then, when nothing was sent, rejects instead. */
export async function startState(
	prepared: PreparedState,
	riding = false
): Promise<{ token: string; finished: Promise<StateReview> }> {
	const token = crypto.randomUUID();
	let started!: () => void;
	const saved = new Promise<void>((resolve) => (started = resolve));
	const finished = withStateLock(token, async () => {
		// The saved attempt reserves its name, so the clip lock is only needed until it is written.
		const { attempt, requests } = await withClipWriteLock(prepared.projectId, prepared.id, () =>
			beginState(prepared, token, riding)
		);
		started();
		return submitStateBatches(prepared.projectId, attempt, prepared.keyRevision, requests);
	});
	await Promise.race([saved, finished]);
	return { token, finished };
}

async function beginState(prepared: PreparedState, token: string, riding: boolean) {
	const { projectId, source: sourceFrame, id, description, model, reference } = prepared;
	if (prepared.keyRevision !== getKeyRevision()) throw changed();
	const fresh = await prepareState(projectId, sourceFrame, id, description, model, reference);
	if (
		fresh.sourceVersion !== prepared.sourceVersion ||
		stableStringify(fresh.plan) !== stableStringify(prepared.plan)
	)
		throw changed();
	const { rec, project } = await loadProject(projectId);
	const source = stateGenerationSource(project, sourceFrame);
	if (source?.version !== fresh.sourceVersion) throw changed();
	const attempt: StateAttempt = {
		token,
		id,
		description,
		...(riding && { riding }),
		source: { ...sourceFrame },
		sourceVersion: source.version,
		plan: fresh.plan
	};
	const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
	const requests = await stateRequests(fresh.plan, source, id, description, seed, reference);
	const blobs = new Map<string, Blob>();
	if (requests.length > 1) {
		const savedReference = reference ? base64ToBytes(reference.base64) : undefined;
		const hash = savedReference && (await sha256(savedReference));
		if (hash && savedReference)
			blobs.set(hash, new Blob([Uint8Array.from(savedReference)], { type: 'image/png' }));
		attempt.continuation = {
			model,
			description,
			seed,
			credential: await continuationCredential(attempt.token),
			unqueued: requests.map((_, index) => index),
			parentId: rec.character?.id,
			reference:
				hash && reference ? { hash, width: reference.width, height: reference.height } : undefined
		};
	}
	assertSelected(projectId);
	if (getKeyRevision() !== prepared.keyRevision) throw changed();
	await db.updateCharacter<StoredProject>(projectId, blobs, (current) => {
		if (
			!current ||
			stableStringify(db.asLoaded(current)?.manifest) !== stableStringify(rec.manifest) ||
			current.character?.id !== rec.character?.id ||
			Object.hasOwn(current.moveReviews ?? {}, id)
		)
			throw changed();
		// Another State started meanwhile, in this tab or another, may have taken the name.
		if (
			stateCaptureNameIssue(
				rec.manifest,
				id,
				stateAttempts(current).map(({ id }) => id)
			)
		)
			throw new LocalizedError('That State name is unavailable.', 'stateCapture.takenName');
		return { ...current, stateGenerations: { ...current.stateGenerations, [token]: attempt } };
	});
	return { attempt, requests };
}

async function continuationCredential(token: string) {
	if (!app.key || app.keyRejected) throw originalAccount();
	return sha256(`${token}:${app.key}`);
}

const originalAccount = () =>
	error('Reconnect the original PixelLab key to continue this State.', 'continueAccount');

export async function hasStateContinuation(projectId: string, token: string) {
	if (workspaceCopy || !navigator.locks) return false;
	return navigator.locks.request(stateLockName(token), { ifAvailable: true }, async (lock) => {
		if (!lock) return false;
		const attempt = (await db.get<StoredProject>('projects', projectId))?.stateGenerations?.[token];
		return !!(attempt?.source && stateContinuationBatches(attempt, await db.all<JobRec>('jobs')));
	});
}

function withoutCost({ cost: _cost, ...plan }: StateAttempt['plan']) {
	return stableStringify(plan);
}

async function prepareContinuation(projectId: string, token: string) {
	if (workspaceCopy) throw unfinished();
	assertSelected(projectId);
	const { rec, project } = await loadProject(projectId);
	const attempt = rec.stateGenerations?.[token];
	const saved = attempt?.continuation;
	if (!attempt?.source || !saved || attempt.plan.endpoint === '/create-character-state')
		throw unfinished();
	const keyRevision = getKeyRevision();
	if ((await continuationCredential(attempt.token)) !== saved.credential) throw originalAccount();
	const source = stateGenerationSource(project, attempt.source);
	if (source?.version !== attempt.sourceVersion || rec.character?.id !== saved.parentId)
		throw changed();
	const batches = stateContinuationBatches(attempt, await db.all<JobRec>('jobs'));
	if (!batches) throw unfinished();
	if (batches.records.length) {
		const keptPlan = {
			...attempt.plan,
			batches: batches.records.map(({ index }) => attempt.plan.batches[index])
		};
		await readReview(
			projectId,
			{ ...attempt, plan: keptPlan },
			batches.records.map(({ record }) => record)
		);
	}
	let reference: ImageReference | undefined;
	if (saved.reference) {
		const blob = await db.getBlob(saved.reference.hash);
		if (!blob) throw invalidResult();
		const bytes = new Uint8Array(await blob.arrayBuffer());
		if ((await sha256(bytes)) !== saved.reference.hash) throw invalidResult();
		reference = {
			width: saved.reference.width,
			height: saved.reference.height,
			base64: bytesToBase64(bytes)
		};
	}
	const fresh = await prepareStatePlan(
		projectId,
		attempt.source,
		attempt.id,
		saved.description,
		saved.model,
		reference,
		attempt.token
	);
	if (
		fresh.sourceVersion !== source.version ||
		withoutCost(fresh.plan) !== withoutCost(attempt.plan)
	)
		throw changed();
	const remainingPlan = {
		...attempt.plan,
		batches: batches.missing.map((index) => attempt.plan.batches[index])
	};
	const cost =
		localStateCost(attempt.plan.endpoint, remainingPlan.cellSize, remainingPlan.batches) ??
		(await flashCost(remainingPlan));
	assertSelected(projectId);
	if (getKeyRevision() !== keyRevision) throw changed();
	const quote: StateContinuationQuote = {
		projectId,
		token: attempt.token,
		keyRevision,
		missing: batches.missing,
		// Only finished batches keep views; a stopped one is never resent and is not counted as kept.
		keptViews: batches.records.reduce(
			(count, { index, record }) =>
				count + (record.state === 'done' ? attempt.plan.batches[index].facingIds.length : 0),
			0
		),
		remainingViews: remainingPlan.batches.reduce(
			(count, batch) => count + batch.facingIds.length,
			0
		),
		cost
	};
	return { quote, rec, source, reference, attempt, saved };
}

export function quoteStateContinuation(projectId: string, token: string) {
	return withStateLock(token, async () => (await prepareContinuation(projectId, token)).quote);
}

export function continueState(approved: StateContinuationQuote): Promise<StateReview> {
	return withStateLock(approved.token, async () => {
		const { projectId, token } = approved;
		const { quote, source, reference, attempt, saved } = await prepareContinuation(
			projectId,
			token
		);
		if (stableStringify(approved) !== stableStringify(quote)) throw changed();
		const requests = await stateRequests(
			attempt.plan,
			source,
			attempt.id,
			saved.description,
			saved.seed,
			reference
		);
		return submitStateBatches(projectId, attempt, quote.keyRevision, requests, quote.missing);
	});
}

async function submitStateBatches(
	projectId: string,
	attempt: StateAttempt,
	keyRevision: number,
	requests: Req[],
	remaining?: number[]
) {
	const controller = new AbortController();
	const stop = queue.subscribe(() => {
		if (getKeyRevision() !== keyRevision) controller.abort(changed());
	});
	try {
		const submitted: JobRec[] = [];
		for (const [index, request] of requests.entries()) {
			if (remaining && !remaining.includes(index)) continue;
			if (remaining) {
				const pending = (await db.get<StoredProject>('projects', projectId))?.stateGenerations?.[
					attempt.token
				];
				const ledger = pending && stateContinuationBatches(pending, await db.all<JobRec>('jobs'));
				if (!ledger?.missing.includes(index)) throw changed();
			}
			// States run in the background, so the character may be edited or closed meanwhile. Other edits are fine, but
			// no further view is paid for once its source frame changed: it would be drawn from another look than the views
			// already bought and was not what the quote approved. A State whose views all finished is still saved while it fits
			// (stateSourceFits).
			const { project } = await loadProject(projectId);
			if (stateGenerationSource(project, attempt.source)?.version !== attempt.sourceVersion)
				throw changed();
			const checked = (current: StoredProject | undefined) => {
				controller.signal.throwIfAborted();
				if (
					getKeyRevision() !== keyRevision ||
					!current?.stateGenerations?.[attempt.token] ||
					Object.hasOwn(current.moveReviews ?? {}, attempt.id)
				)
					throw changed();
				return current;
			};
			if (attempt.continuation) {
				await db.update<StoredProject>('projects', projectId, (stored) => {
					const current = checked(stored);
					const continuation = current.stateGenerations?.[attempt.token]?.continuation;
					if (!continuation?.unqueued.includes(index)) throw changed();
					continuation.unqueued = continuation.unqueued.filter((batch) => batch !== index);
					return current;
				});
			} else checked(await db.get<StoredProject>('projects', projectId));
			if (getKeyRevision() !== keyRevision) throw changed();
			submitted.push(
				await run(
					request,
					// Job labels reach Activity and failure notices, so they read as the State's name, not its id.
					moveLabel(attempt.id),
					'studio-state',
					false,
					true,
					controller.signal,
					stateBatchScope(attempt.token, index)
				)
			);
		}
		const records = remaining
			? stateRecoveryRecords(attempt, await db.all<JobRec>('jobs'))
			: submitted;
		if (!records) throw unfinished();
		return await readReview(projectId, attempt, records);
	} finally {
		stop();
	}
}

/** `known`: the review shown before Try again, whose downloaded views are kept. */
export async function pendingState(
	projectId: string,
	token: string,
	known?: StateReview
): Promise<StateReview | null> {
	const attempt = (await db.get<StoredProject>('projects', projectId))?.stateGenerations?.[token];
	if (!attempt) return null;
	if (!attempt.source) throw outdated();
	const ledger = await db.all<JobRec>('jobs');
	const ready = stateReviewBatches(attempt, ledger);
	if (!ready) throw unfinished();
	// Batches never sent are reviewed without only once no tab is still sending them.
	if (ready.unmade.length && !(await stateLockFree(token))) throw unfinished();
	try {
		const review = await readReview(
			projectId,
			{
				...attempt,
				plan: {
					...attempt.plan,
					batches: ready.records.map(({ index }) => attempt.plan.batches[index])
				}
			},
			ready.records.map(({ record }) => record),
			known
		);
		const unmade = ready.unmade.flatMap((index) => attempt.plan.batches[index].facingIds);
		return {
			...review,
			missing: [...review.missing, ...unmade],
			unmade,
			receipts: stateReviewReceipts(attempt, ledger)
		};
	} catch (cause) {
		// Known causes (no key to recover the views, a PixelLab error) say what to do; only unreadable results are invalid.
		if (cause instanceof LocalizedError || cause instanceof ApiError) throw cause;
		throw Object.assign(invalidResult(), { cause });
	}
}

export function discardState(projectId: string, token: string): Promise<void> {
	return withStateLock(token, () => clearStateAttempt(projectId, token));
}

async function clearStateAttempt(projectId: string, token: string): Promise<void> {
	assertSelected(projectId);
	const attempt = (await db.get<StoredProject>('projects', projectId))?.stateGenerations?.[token];
	if (!attempt) return;
	const scopes = new Set(
		attempt.plan.batches.map((_, index) => stateBatchScope(attempt.token, index))
	);
	const records = await db.all<JobRec>('jobs');
	if (
		records.some(
			(record) => record.activityScope && scopes.has(record.activityScope) && live(record)
		)
	)
		throw unfinished();
	await db.update<StoredProject>('projects', projectId, (record) => {
		if (!record?.stateGenerations?.[token]) throw changed();
		delete record.stateGenerations[token];
		return record;
	});
}

/** `riding`: saved from the Riding template, so the notice says where to use it. */
export async function saveState(review: StateReview, riding = false): Promise<void> {
	// With views never sent, no tab may be sending them while this save gives them up, and none may have bought them since
	// this review was read: saving the older subset would delete those paid views with the attempt.
	if (review.unmade.length)
		return withStateLock(review.token, async () => {
			const attempt = (await db.get<StoredProject>('projects', review.projectId))
				?.stateGenerations?.[review.token];
			if (attempt && stateReviewReceipts(attempt, await db.all<JobRec>('jobs')) !== review.receipts)
				throw error(
					'New views finished for this State. Review it again before saving. Nothing was saved or charged.',
					'newViews'
				);
			return publishState(review, riding);
		});
	return publishState(review, riding);
}

async function publishState(review: StateReview, riding: boolean): Promise<void> {
	const { projectId, id } = review;
	assertSelected(projectId);
	await flushSave();
	const { rec, project } = await loadProject(projectId);
	if (
		!rec.stateGenerations?.[review.token] ||
		// A changed source frame is disclosed in review, not a reason to throw away a paid result that still lines up.
		!stateSourceFits(project, review.sourceVersion) ||
		stateCaptureNameIssue(rec.manifest, id, Object.keys(rec.moveReviews ?? {}))
	)
		throw changed();
	const manifest = structuredClone(rec.manifest);
	const { rig } = manifest;
	const base = manifest.items.find((item) => item.id === rig.baseItem);
	const layer = base?.layers[0];
	if (!base || !layer?.cells) throw missing();
	const blobs = new Map<string, Blob>();
	// Recolors swap exact body colors, and a State is a new drawing with its own shading: put it on the body's colors (and
	// its shirt and shorts in their regions) or a recolor reaches only the pixels that happen to match. A body without
	// frames has no colors to match, so its State stays as drawn.
	const match = stateColorMatcher(project);
	const mark = regionMarker(project, id);
	const views = await Promise.all(
		review.views.map(async ({ direction, image: drawn }) => {
			const snapped = match ? match(drawn) : drawn;
			const image = mark ? mark(direction, 0, snapped) : snapped;
			const hash = await cellHash(image);
			blobs.set(hash.slice(7), await cellBlob(image));
			return [direction, [hash]] as const;
		})
	);
	layer.cells[id] = Object.fromEntries(views);
	const name = stateClipName(id);
	const clip: RigAnimation = {
		id,
		...(name && { name }),
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: 100 }],
		source: { endpoint: review.endpoint }
	};
	assignNewClipExportId(clip, rig.animations);
	rig.animations.push(clip);
	base.provenance = [...(base.provenance ?? []), ...review.provenance];
	const previousHash = rig.baseHash;
	rig.baseHash = await baseHashOf(rig, storedCellHashes(rig, layer.cells));
	for (const item of manifest.items)
		if (item.baseHash === previousHash) item.baseHash = rig.baseHash;
	await flushSave();
	await db.updateCharacter<StoredProject>(projectId, blobs, (current) => {
		assertSelected(projectId);
		if (
			!current?.stateGenerations?.[review.token] ||
			stableStringify(db.asLoaded(current)?.manifest) !== stableStringify(rec.manifest) ||
			Object.hasOwn(current.moveReviews ?? {}, id)
		)
			throw changed();
		delete current.stateGenerations[review.token];
		if (review.childId) (current.managedStates ??= {})[id] = review.childId;
		else if (current.managedStates) delete current.managedStates[id];
		return { ...current, manifest, savedAt: new Date().toISOString() };
	});
	if (doc.id !== projectId) return syncStoredProject(projectId);
	await openProject(projectId, { quiet: true });
	if (doc.id !== projectId) return;
	ui.anim = id;
	ui.frame = 0;
	ui.tab = 'states';
	toast(message(riding ? 'stateGeneration.savedRiding' : 'stateGeneration.saved'));
}
