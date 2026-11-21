import { app, getKeyRevision, refreshBalance } from '../lib/app.svelte.ts';
import { stableStringify } from '../lib/image/hash.ts';
import { decodePng, type Img } from '../lib/image/png.ts';
import type { ImageReference } from '../lib/image/reference.ts';
import { LocalizedError, message, type Message } from '../lib/message.ts';
import { stateBatchScope } from '../lib/pixellab/activity.ts';
import { api, API_BASE, ApiError } from '../lib/pixellab/client.ts';
import { planRestriction, localizedPlanRestriction } from '../lib/pixellab/plans.ts';
import { live, managedStateSubmitChildId, queue, type JobRec } from '../lib/pixellab/queue.ts';
import { routes, type Size } from '../lib/pixellab/routes.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import {
	DEFAULT_MOVE,
	baseHashOf,
	cellHash,
	storedCellHashes,
	type DirectionName
} from '../lib/rig/rig.ts';
import * as db from '../lib/store/db.ts';
import { loadProject, type StoredProject } from '../lib/store/project.ts';
import { cellBlob, imagesOf, provOf, run } from './create.ts';
import { stateCaptureNameIssue } from './moveActions.svelte.ts';
import { doc, flushSave, openProject, toast, ui } from './state.svelte.ts';
import { stateRecoveryRecords } from './stateRecovery.ts';
import {
	planStateGeneration,
	type StateGenerationCost,
	type StateGenerationModel
} from './stateGenerationPlan.ts';
import {
	managedStateRotations,
	stateGenerationSource,
	verifyManagedStateParent,
	type ManagedStateDetail
} from './stateGenerationSource.ts';
import {
	decodeStateBatch,
	stateRequests,
	type ReadyStatePlan
} from './stateGenerationTransport.ts';

export interface StateAttempt {
	token: string;
	id: string;
	sourceVersion: string;
	plan: ReadyStatePlan & { cost: StateGenerationCost };
}

export interface PreparedState {
	projectId: string;
	id: string;
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
	token: string;
	sourceVersion: string;
	endpoint: ReadyStatePlan['endpoint'];
	views: { direction: DirectionName; image: Img }[];
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
	error('Standing needs saved artwork in every drawn direction.', 'sourceUnavailable');
const invalidResult = () =>
	error('PixelLab did not return all expected views at the planned size.', 'invalidResult');
const unfinished = () =>
	error(
		'This attempt has unfinished or unavailable results. Check Activity. No request was resent.',
		'unfinished'
	);

function withStateLock<T>(projectId: string, work: () => Promise<T>): Promise<T> {
	if (!navigator.locks)
		return Promise.reject(
			error('This browser cannot lock paid State attempts.', 'locksUnavailable')
		);
	return navigator.locks.request(`pixeldoll-state:${projectId}`, { ifAvailable: true }, (lock) => {
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

export async function prepareState(
	projectId: string,
	id: string,
	description: string,
	model: StateGenerationModel,
	reference?: ImageReference
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
	const issue = stateCaptureNameIssue(rec.manifest, id);
	if (issue || Object.hasOwn(rec.moveReviews ?? {}, id))
		throw new LocalizedError('That State name is unavailable.', issue ?? 'stateCapture.takenName');
	if (rec.stateGeneration) throw unfinished();
	const source = stateGenerationSource(project, DEFAULT_MOVE);
	if (!source) throw missing();
	let managedParent;
	if (
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
	const side = Math.max(source.size.width, source.size.height);
	const cost =
		candidate.cost ??
		(candidate.endpoint === '/create-character-state'
			? ({
					kind: 'estimate',
					minGenerations: 10,
					maxGenerations: side <= 70 ? 10 : side <= 93 ? 15 : 25
				} as const)
			: await flashCost(candidate));
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
		description,
		model,
		reference,
		sourceVersion: source.version,
		keyRevision,
		plan: { ...candidate, cost },
		parentName: managedParent?.name ?? undefined
	};
}

async function childViews(attempt: StateAttempt, record: JobRec) {
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
	const inventory = managedStateRotations(detail);
	const { width, height } = attempt.plan.cellSize;
	if (
		detail.id !== childId ||
		(detail.status ?? 'completed') !== 'completed' ||
		detail.size?.width !== width ||
		detail.size?.height !== height ||
		inventory?.count !== attempt.plan.remoteFacingCount
	)
		throw invalidResult();
	const views = await Promise.all(
		attempt.plan.batches[0].facingIds.map(async (direction) => {
			const url = inventory.rotations[direction];
			if (!url) throw invalidResult();
			const image = await readRotation(url);
			if (image.w !== width || image.h !== height || !opaqueBox(image)) throw invalidResult();
			return { direction, image };
		})
	);
	return { childId, views };
}

async function readReview(
	projectId: string,
	attempt: StateAttempt,
	records: JobRec[]
): Promise<StateReview> {
	const plan = attempt.plan;
	const result =
		plan.endpoint === '/create-character-state'
			? await childViews(attempt, records[0])
			: {
					views: (
						await Promise.all(
							records.map(async (record, index) => {
								try {
									const images = await imagesOf(record);
									return decodeStateBatch(
										plan,
										plan.batches[index],
										images.map(({ img }) => img)
									);
								} catch (cause) {
									throw Object.assign(invalidResult(), { cause });
								}
							})
						)
					).flat()
				};
	return {
		...result,
		projectId,
		id: attempt.id,
		token: attempt.token,
		sourceVersion: attempt.sourceVersion,
		endpoint: plan.endpoint,
		provenance: records.map((record) => provOf(record))
	};
}

export function startState(prepared: PreparedState): Promise<StateReview> {
	return withStateLock(prepared.projectId, () => generateState(prepared));
}

async function generateState(prepared: PreparedState): Promise<StateReview> {
	const { projectId, id, description, model, reference } = prepared;
	if (prepared.keyRevision !== getKeyRevision()) throw changed();
	const fresh = await prepareState(projectId, id, description, model, reference);
	if (
		fresh.sourceVersion !== prepared.sourceVersion ||
		stableStringify(fresh.plan) !== stableStringify(prepared.plan)
	)
		throw changed();
	const { rec, project } = await loadProject(projectId);
	const source = stateGenerationSource(project, DEFAULT_MOVE);
	if (source?.version !== fresh.sourceVersion) throw changed();
	const attempt: StateAttempt = {
		token: crypto.randomUUID(),
		id,
		sourceVersion: source.version,
		plan: fresh.plan
	};
	const seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
	const requests = await stateRequests(fresh.plan, source, id, description, seed, reference);
	assertSelected(projectId);
	if (getKeyRevision() !== prepared.keyRevision) throw changed();
	await db.update<StoredProject>('projects', projectId, (current) => {
		if (
			!current ||
			current.stateGeneration ||
			stableStringify(current.manifest) !== stableStringify(rec.manifest) ||
			current.character?.id !== rec.character?.id ||
			Object.hasOwn(current.moveReviews ?? {}, id)
		)
			throw changed();
		return { ...current, stateGeneration: attempt };
	});
	const controller = new AbortController();
	const stop = queue.subscribe(() => {
		if (getKeyRevision() !== prepared.keyRevision) controller.abort(changed());
	});
	try {
		const records: JobRec[] = [];
		for (const [index, request] of requests.entries()) {
			const current = await db.get<StoredProject>('projects', projectId);
			assertSelected(projectId);
			if (
				getKeyRevision() !== prepared.keyRevision ||
				current?.stateGeneration?.token !== attempt.token ||
				stableStringify(current.manifest) !== stableStringify(rec.manifest)
			)
				throw changed();
			records.push(
				await run(
					request,
					id,
					'studio-state',
					false,
					true,
					controller.signal,
					stateBatchScope(attempt.token, index)
				)
			);
		}
		return await readReview(projectId, attempt, records);
	} finally {
		stop();
	}
}

export async function pendingState(projectId: string): Promise<StateReview | null> {
	const attempt = (await db.get<StoredProject>('projects', projectId))?.stateGeneration;
	if (!attempt) return null;
	const records = stateRecoveryRecords(attempt, await db.all<JobRec>('jobs'));
	if (!records) throw unfinished();
	try {
		return await readReview(projectId, attempt, records);
	} catch (cause) {
		throw Object.assign(invalidResult(), { cause });
	}
}

export function discardState(projectId: string): Promise<void> {
	return withStateLock(projectId, () => clearStateAttempt(projectId));
}

async function clearStateAttempt(projectId: string): Promise<void> {
	assertSelected(projectId);
	const attempt = (await db.get<StoredProject>('projects', projectId))?.stateGeneration;
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
		if (!record || record.stateGeneration?.token !== attempt.token) throw changed();
		delete record.stateGeneration;
		return record;
	});
}

export async function saveState(review: StateReview): Promise<void> {
	const { projectId, id } = review;
	assertSelected(projectId);
	await flushSave();
	const { rec, project } = await loadProject(projectId);
	if (
		rec.stateGeneration?.token !== review.token ||
		stateGenerationSource(project, DEFAULT_MOVE)?.version !== review.sourceVersion ||
		stateCaptureNameIssue(rec.manifest, id) ||
		Object.hasOwn(rec.moveReviews ?? {}, id)
	)
		throw changed();
	const manifest = structuredClone(rec.manifest);
	const { rig } = manifest;
	const base = manifest.items.find((item) => item.id === rig.baseItem);
	const layer = base?.layers[0];
	if (!base || !layer?.cells) throw missing();
	const blobs = new Map<string, Blob>();
	const views = await Promise.all(
		review.views.map(async ({ direction, image }) => {
			const hash = await cellHash(image);
			blobs.set(hash.slice(7), await cellBlob(image));
			return [direction, [hash]] as const;
		})
	);
	layer.cells[id] = Object.fromEntries(views);
	rig.animations.push({
		id,
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: 100 }],
		source: { endpoint: review.endpoint }
	});
	base.provenance = [...(base.provenance ?? []), ...review.provenance];
	const previousHash = rig.baseHash;
	rig.baseHash = await baseHashOf(rig, storedCellHashes(rig, layer.cells));
	for (const item of manifest.items)
		if (item.baseHash === previousHash) item.baseHash = rig.baseHash;
	await flushSave();
	await db.updateCharacter<StoredProject>(projectId, blobs, (current) => {
		assertSelected(projectId);
		if (
			!current ||
			current.stateGeneration?.token !== review.token ||
			stableStringify(current.manifest) !== stableStringify(rec.manifest) ||
			Object.hasOwn(current.moveReviews ?? {}, id)
		)
			throw changed();
		delete current.stateGeneration;
		if (review.childId) (current.managedStates ??= {})[id] = review.childId;
		else if (current.managedStates) delete current.managedStates[id];
		return { ...current, manifest, savedAt: new Date().toISOString() };
	});
	if (doc.id !== projectId) return;
	await openProject(projectId, { quiet: true });
	if (doc.id !== projectId) return;
	ui.anim = id;
	ui.frame = 0;
	ui.tab = 'states';
	toast(message('stateGeneration.saved'));
}
