import { app, getKeyRevision, refreshBalance } from '../lib/app.svelte.ts';
import { sameSlotDefinition } from '../lib/equipment/compatibility.ts';
import { stableStringify } from '../lib/image/hash.ts';
import { binaryAlpha } from '../lib/image/png.ts';
import type { ImageReference } from '../lib/image/reference.ts';
import { LocalizedError, message } from '../lib/message.ts';
import { appearanceBatchScope } from '../lib/pixellab/activity.ts';
import { localizedPlanRestriction, planRestriction } from '../lib/pixellab/plans.ts';
import { live, type JobRec } from '../lib/pixellab/queue.ts';
import { cellHash } from '../lib/rig/rig.ts';
import { opaqueBox } from '../lib/rig/normalize.ts';
import * as db from '../lib/store/db.ts';
import { defaultCharacterExportId } from '../lib/store/identity.ts';
import { freeItemName } from '../lib/equipment/copy.ts';
import { loadProject, pngBlobs, saveItem, type StoredProject } from '../lib/store/project.ts';
import { workspaceCopy } from '../lib/store/workspace-mode.ts';
import {
	appearanceSource,
	editedCharacter,
	editedItem,
	type AppearanceChoice,
	type AppearanceSource,
	type AppearanceTarget
} from './appearanceSource.ts';
import { freshSeed } from './characterConfig.ts';
import { imagesOf, provOf, run } from './create.ts';
import { flashCost, flashShapes } from './stateGeneration.ts';
import { groundToSource } from './stateGrounding.ts';
import {
	planStateGeneration,
	type StateGenerationCost,
	type StateGenerationModel
} from './stateGenerationPlan.ts';
import {
	decodeStateBatch,
	stateRequests,
	type ReadyStatePlan
} from './stateGenerationTransport.ts';

type EditPlan = ReadyStatePlan & { cost: StateGenerationCost };
export interface AppearanceAttempt {
	id: string;
	target: AppearanceTarget;
	sourceVersion: string;
	description: string;
	choice: AppearanceChoice;
	model: StateGenerationModel;
	plan: EditPlan;
}

export interface AppearanceReview {
	views: AppearanceSource['views'];
	records: JobRec[];
	running: boolean;
	complete: boolean;
}

const targetKey = ({ itemId }: AppearanceTarget) => itemId ?? '';
const changed = () =>
	new LocalizedError('The artwork or quote changed. Review the edit again.', 'appearance.changed');
const unavailable = () =>
	new LocalizedError('There is no supported source artwork to edit.', 'appearance.unavailable');
const pending = () => new LocalizedError('This preview is still being made.', 'appearance.running');

export async function quoteAppearance(
	source: AppearanceSource,
	model: StateGenerationModel,
	reference?: ImageReference
): Promise<EditPlan | null> {
	// Pro can apply the written edit and reference in the same request.
	if (reference && model !== 'pro') return null;
	const shapes = model === 'pro-flash' ? await flashShapes(false) : undefined;
	const plan = planStateGeneration({
		model,
		cellSize: source.size,
		facingIds: source.views.map(({ direction }) => direction),
		referenceSize: reference && { width: reference.width, height: reference.height },
		flashNativeShapes: shapes
	});
	if (plan.kind !== 'ready' || plan.endpoint === '/create-character-state') return null;
	return { ...plan, cost: plan.cost ?? (await flashCost(plan)) };
}

export async function loadAppearance(target: AppearanceTarget) {
	const loaded = await loadProject(target.projectId);
	if (workspaceCopy || loaded.rec.origin !== 'studio') throw unavailable();
	const attempt = loaded.rec.appearanceEdits?.[targetKey(target)];
	return {
		...loaded,
		source: await appearanceSource(loaded.project, attempt?.target ?? target),
		attempt
	};
}

function withEditLock<T>(target: AppearanceTarget, work: () => Promise<T>): Promise<T> {
	if (!navigator.locks)
		throw new LocalizedError(
			'This browser cannot lock paid attempts.',
			'stateGeneration.locksUnavailable'
		);
	return navigator.locks.request(
		`pixeldoll-appearance:${target.projectId}:${targetKey(target)}`,
		{ ifAvailable: true },
		(lock) => {
			if (!lock) throw pending();
			return work();
		}
	);
}

function updateAttempt(
	target: AppearanceTarget,
	change: (old: AppearanceAttempt | undefined) => AppearanceAttempt | undefined
) {
	return db.update<StoredProject>('projects', target.projectId, (record) => {
		if (!record?.manifest) throw changed();
		const edits = { ...record.appearanceEdits };
		const key = targetKey(target);
		const next = change(edits[key]);
		if (next) edits[key] = next;
		else delete edits[key];
		record.appearanceEdits = edits;
		return record;
	});
}

export async function generateAppearance(
	target: AppearanceTarget,
	reviewed: AppearanceSource,
	quote: EditPlan,
	model: StateGenerationModel,
	choice: AppearanceChoice,
	prompt: string,
	description: string,
	started: (attempt: AppearanceAttempt) => void,
	reference?: ImageReference
) {
	return withEditLock(target, async () => {
		const keyRevision = getKeyRevision();
		if (!app.key || app.keyRejected) throw changed();
		const { source, attempt: existing } = await loadAppearance(target);
		if (existing || source?.version !== reviewed.version) throw changed();
		const repriced = await quoteAppearance(source, model, reference);
		if (stableStringify(repriced) !== stableStringify(quote)) throw changed();
		await refreshBalance();
		if (app.keyRejected || app.balanceError)
			throw new LocalizedError(
				'PixelLab could not confirm this account.',
				'stateGeneration.connect'
			);
		const id = crypto.randomUUID();
		const requests = await stateRequests(quote, source, id, prompt, freshSeed(), reference);
		for (const request of requests) {
			const blocked = planRestriction(app.balance, {
				method: request.method,
				endpoint: request.path,
				params: request.body
			});
			if (blocked) throw localizedPlanRestriction(blocked) ?? new Error(blocked);
		}
		if (keyRevision !== getKeyRevision()) throw changed();
		const attempt: AppearanceAttempt = {
			id,
			target: { ...target, clip: source.clip },
			sourceVersion: source.version,
			description,
			choice,
			model,
			plan: quote
		};
		await updateAttempt(target, (before) => {
			if (before) throw changed();
			return attempt;
		});
		started(attempt);
		for (const [index, request] of requests.entries()) {
			const current = await loadAppearance(attempt.target);
			if (
				current.attempt?.id !== attempt.id ||
				current.source?.version !== attempt.sourceVersion ||
				keyRevision !== getKeyRevision()
			)
				throw changed();
			await run(
				request,
				{ text: 'Edit appearance', title: message('appearance.title') },
				'studio-appearance',
				false,
				true,
				undefined,
				appearanceBatchScope(id, index)
			);
		}
	});
}

export async function readAppearance(
	attempt: AppearanceAttempt,
	source?: AppearanceSource | null
): Promise<AppearanceReview> {
	const ledger = await db.all<JobRec>('jobs');
	const records: JobRec[] = [];
	const views: AppearanceReview['views'] = [];
	for (const [index, batch] of attempt.plan.batches.entries()) {
		const matches = ledger.filter(
			({ activityScope }) => activityScope === appearanceBatchScope(attempt.id, index)
		);
		const [record] = matches;
		if (
			matches.length !== 1 ||
			record.tag !== 'studio-appearance' ||
			record.method !== 'POST' ||
			record.endpoint !== attempt.plan.endpoint
		)
			continue;
		records.push(record);
		if (record.state !== 'done') continue;
		try {
			const images = await imagesOf(record);
			for (const { direction, image } of decodeStateBatch(
				attempt.plan,
				batch,
				images.map(({ img }) => img)
			)) {
				const raw = binaryAlpha(image, 128);
				const original =
					!attempt.target.itemId && source?.version === attempt.sourceVersion
						? source.views.find((view) => view.direction === direction)?.image
						: undefined;
				const pixels = original ? groundToSource(raw, original).image : raw;
				if (!opaqueBox(pixels) || !pixels.data.some((value, i) => i % 4 === 3 && value === 0))
					continue;
				views.push({ direction, image: pixels, hash: await cellHash(pixels) });
			}
		} catch (cause) {
			// Raw outputs stay in Activity even if they cannot be placed on the planned grid.
			console.warn('Appearance preview could not be decoded.', cause);
		}
	}
	return {
		views,
		records,
		running: records.some((record) => live(record)),
		complete:
			views.length === attempt.plan.batches.reduce((sum, batch) => sum + batch.facingIds.length, 0)
	};
}

export async function discardAppearance(attempt: AppearanceAttempt) {
	return withEditLock(attempt.target, async () => {
		if ((await readAppearance(attempt)).running) throw pending();
		await updateAttempt(attempt.target, (old) => (old?.id === attempt.id ? undefined : old));
	});
}

export async function saveAppearance(
	attempt: AppearanceAttempt,
	comparison: AppearanceReview,
	editedSuffix: string
) {
	const target = attempt.target;
	return withEditLock(target, async () => {
		const loaded = await loadAppearance(target);
		const source = loaded.source;
		if (loaded.attempt?.id !== attempt.id || source?.version !== attempt.sourceVersion)
			throw changed();
		const review = await readAppearance(attempt, source);
		if (
			!review.complete ||
			stableStringify(review.views.map(({ hash }) => hash)) !==
				stableStringify(comparison.views.map(({ hash }) => hash))
		)
			throw changed();
		const provenance = review.records.map((record) => provOf(record));
		const name = `${source.name.slice(0, Math.max(1, 59 - editedSuffix.length)).trimEnd()} ${editedSuffix}`;
		const publishedId = `rig-${attempt.id}`;
		if (target.itemId) {
			const originalSlot = loaded.project.manifest.slots.find(({ id }) => id === source.item?.slot);
			if (!originalSlot) throw changed();
			const copy = await editedItem(
				loaded.project,
				source,
				review.views,
				attempt.id,
				freeItemName(name, loaded.project.manifest.items),
				attempt.description,
				provenance
			);
			await saveItem(
				target.projectId,
				copy.item,
				copy.images,
				loaded.project.manifest.slots,
				(current) => {
					// Reject concurrent body/item changes at the write boundary as well as before decoding.
					const original = current.manifest.items.find(({ id }) => id === target.itemId);
					const slot = current.manifest.slots.find(({ id }) => id === originalSlot.id);
					if (
						!slot ||
						!sameSlotDefinition(slot, originalSlot) ||
						current.appearanceEdits?.[targetKey(target)]?.id !== attempt.id ||
						stableStringify(original) !== stableStringify(source.item) ||
						current.manifest.rig.baseHash !== loaded.project.manifest.rig.baseHash ||
						stableStringify(current.manifest.rig.directions) !==
							stableStringify(loaded.project.manifest.rig.directions) ||
						stableStringify(current.manifest.rig.pivot) !==
							stableStringify(loaded.project.manifest.rig.pivot)
					)
						throw changed();
					delete current.appearanceEdits?.[targetKey(target)];
				}
			);
			db.askPersist();
			return target.projectId;
		}
		const receipt = `appearance:${attempt.id}`;
		const alreadySaved = await db.get<StoredProject>('projects', publishedId);
		if (alreadySaved && alreadySaved.creationSpec !== receipt) throw changed();
		if (!alreadySaved) {
			const copy = await editedCharacter(
				loaded.project,
				review.views,
				attempt.description,
				provenance
			);
			copy.manifest.name = name;
			copy.manifest.items[0].name = name;
			const record: StoredProject = {
				id: publishedId,
				savedAt: new Date().toISOString(),
				creationSpec: receipt,
				manifest: { ...copy.manifest, exportId: defaultCharacterExportId(publishedId, name) },
				origin: 'studio'
			};
			await db.putCharacter(publishedId, record, await pngBlobs(copy.images));
		}
		await updateAttempt(target, (old) => (old?.id === attempt.id ? undefined : old));
		db.askPersist();
		return publishedId;
	});
}
