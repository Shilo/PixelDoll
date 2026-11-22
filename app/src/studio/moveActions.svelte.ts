import { retainMoves, retainMoveMetadata } from '../lib/rig/moves.ts';
import { stableStringify } from '../lib/image/hash.ts';
import {
	baseHashOf,
	cellKey,
	DEFAULT_MOVE,
	storedCellHashes,
	type RigAnimation
} from '../lib/rig/rig.ts';
import { AUTHORED, fromApi, hasAll } from '../lib/rig/poses.ts';
import { STATE_CAPTURE_MODE } from '../lib/rig/setup.ts';
import { flipSkeleton } from '../lib/rig/skeleton.ts';
import { clipKind } from '../lib/runtime/timeline.js';
import type { Manifest } from '../lib/store/manifest.ts';
import * as db from '../lib/store/db.ts';
import { assignNewClipExportId } from '../lib/store/identity.ts';
import type { StoredProject } from '../lib/store/project.ts';
import {
	deletedEntry,
	keysToPrune,
	quotaError,
	type RecentlyDeleted
} from '../lib/store/recently-deleted.ts';
import { LocalizedError, message } from '../lib/message.ts';
import { moveLabel } from './model.ts';
import { sameClipName, withClipWriteLock } from './clipName.ts';
export { clipNameId as stateCaptureId } from './clipName.ts';
import {
	deletionBlocked,
	directionEditsBlocked,
	doc,
	store,
	ui,
	gens,
	flushSave,
	openProject,
	syncStoredProject,
	pendingBodyMoveName,
	pushRecovery,
	refreshRecentlyDeleted,
	restoreDeleted,
	toast
} from './state.svelte.ts';

export function stateCaptureSource(manifest: Manifest, moveId: string) {
	const { rig } = manifest;
	const move = rig.animations.find((clip) => clip.id === moveId && clipKind(clip) === 'move');
	const body = manifest.items.find((item) => item.id === rig.baseItem)?.layers[0];
	const cells = body?.cells?.[moveId];
	if (!move || !body?.cells || !cells) return null;
	const drawn = rig.directions.filter(({ id, mirrorOf }) => !mirrorOf && cells[id]?.some(Boolean));
	return {
		move,
		body,
		cells,
		drawn,
		version: stableStringify([move, cells, rig.baseItem, rig.directions, rig.cell, rig.pivot])
	};
}

export function stateCaptureMoves(manifest: Manifest | undefined) {
	if (!manifest) return [];
	const { rig } = manifest;
	const cells = manifest.items.find((item) => item.id === rig.baseItem)?.layers[0]?.cells;
	return rig.animations.filter(
		(clip) =>
			clipKind(clip) === 'move' &&
			clip.frames.length > 0 &&
			rig.directions.some(({ id, mirrorOf }) => !mirrorOf && cells?.[clip.id]?.[id]?.some(Boolean))
	);
}

export function stateCaptureNameIssue(manifest: Manifest, id: string) {
	if (!id) return 'stateCapture.invalidName';
	if (
		[DEFAULT_MOVE, 'standing', 'walk', 'idle', ...AUTHORED].includes(id) ||
		manifest.rig.animations.some((clip) => sameClipName(clip.id, id))
	)
		return 'stateCapture.takenName';
	return undefined;
}

export function captureState(
	projectId: string,
	moveId: string,
	position: number,
	id: string,
	sourceVersion: string
) {
	return withClipWriteLock(projectId, id, () =>
		captureStateUnlocked(projectId, moveId, position, id, sourceVersion)
	);
}

async function captureStateUnlocked(
	projectId: string,
	moveId: string,
	position: number,
	id: string,
	sourceVersion: string
) {
	const check = () => {
		if (doc.id !== projectId)
			throw new LocalizedError(
				'The selected character changed.',
				'moveRemoval.selectedCharacterChanged'
			);
		if (directionEditsBlocked(projectId))
			throw new LocalizedError(
				'Wait for the character to load and resolve pending work before capturing a state.',
				'stateCapture.blocked'
			);
	};
	const unavailable = () =>
		new LocalizedError(
			'This frame does not have all saved views for this move.',
			'stateCapture.unavailable'
		);
	check();
	await flushSave();
	const snapshot = await db.get<StoredProject>('projects', projectId);
	if (!snapshot)
		throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
	const manifest = snapshot.manifest;
	const version = stableStringify(manifest);
	const rig = manifest.rig;
	const capture = stateCaptureSource(manifest, moveId);
	if (!capture || capture.version !== sourceVersion)
		throw new LocalizedError(
			'The source changed. Close and reopen to choose a frame from the updated Move.',
			'stateCapture.concurrentEdit'
		);
	const { move, body, cells: sourceCells, drawn } = capture;
	const frame = move.frames[position];
	if (!frame || !body.cells || !drawn.length) throw unavailable();
	const { cell } = frame;
	const nameIssue = stateCaptureNameIssue(manifest, id);
	if (
		nameIssue ||
		(snapshot.stateGeneration && sameClipName(snapshot.stateGeneration.id, id)) ||
		Object.keys(snapshot.moveReviews ?? {}).some((moveId) => sameClipName(moveId, id)) ||
		(await pendingBodyMoveName(projectId, id))
	)
		throw new LocalizedError(
			'Choose a different State name.',
			nameIssue ?? 'stateCapture.takenName'
		);
	const captured: typeof sourceCells = {};
	const sources: NonNullable<typeof move.sources> = {};
	for (const { id: dir } of drawn) {
		const hash = sourceCells[dir]?.[cell];
		if (!hash) throw unavailable();
		captured[dir] = [hash];
		const source = move.sources?.[dir];
		const measured = source?.measured?.[cell];
		if (source && measured && hasAll(measured))
			sources[dir] = {
				route: source.route,
				reference: hash,
				referenceKeypoints: measured,
				keypoints: [measured],
				measured: [measured],
				provenance: source.provenance
			};
	}
	if (!Object.keys(captured).length) throw unavailable();
	for (const { id: dir, mirrorOf } of rig.directions) {
		const hash = sourceCells[dir]?.[cell];
		if (mirrorOf && captured[mirrorOf] && hash) captured[dir] = [hash];
	}
	body.cells[id] = captured;
	for (const track of Object.values(rig.anchors ?? {}))
		for (const { id: dir, mirrorOf } of rig.directions) {
			const point = track[moveId]?.[dir]?.[cell];
			if (point && captured[mirrorOf ?? dir]) (track[id] ??= {})[dir] = [point];
		}
	const clip: RigAnimation = {
		id,
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: frame.ms }],
		source: { endpoint: 'local', mode: STATE_CAPTURE_MODE },
		...(Object.keys(sources).length ? { sources } : {})
	};
	assignNewClipExportId(clip, rig.animations);
	rig.animations.push(clip);
	const previousHash = rig.baseHash;
	rig.baseHash = await baseHashOf(rig, storedCellHashes(rig, body.cells));
	for (const item of manifest.items)
		if (item.baseHash === previousHash) item.baseHash = rig.baseHash;

	await flushSave();
	await db.update<StoredProject>('projects', projectId, (record) => {
		check();
		if (!record)
			throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
		if (stableStringify(record.manifest) !== version || Object.hasOwn(record.moveReviews ?? {}, id))
			throw new LocalizedError(
				'The source changed. Close and reopen to choose a frame from the updated Move.',
				'stateCapture.concurrentEdit'
			);
		const skeletons = { ...record.skeletons };
		for (const { id: dir, mirrorOf } of rig.directions) {
			if (!captured[dir] || mirrorOf) continue;
			const measured = sources[dir]?.measured?.[0];
			const skeleton =
				skeletons[cellKey(moveId, dir, cell)] ?? (measured && fromApi(measured, rig.cell));
			if (skeleton) skeletons[cellKey(id, dir, 0)] = skeleton;
		}
		for (const { id: dir, mirrorOf } of rig.directions) {
			if (!mirrorOf || !captured[mirrorOf]) continue;
			const original = skeletons[cellKey(id, mirrorOf, 0)];
			const skeleton =
				skeletons[cellKey(moveId, dir, cell)] ?? (original && flipSkeleton(original, rig.cell.w));
			if (skeleton) skeletons[cellKey(id, dir, 0)] = skeleton;
		}
		if (Object.keys(skeletons).length) record.skeletons = skeletons;
		record.manifest = manifest;
		record.savedAt = new Date().toISOString();
		return record;
	});
	if (doc.id !== projectId) return syncStoredProject(projectId);
	await openProject(projectId, { quiet: true });
	if (
		doc.id === projectId &&
		store.project?.manifest.rig.animations.some((clip) => clip.id === id)
	) {
		ui.anim = id;
		ui.frame = 0;
		ui.tab = 'states';
		toast(message('stateCapture.saved'));
	}
}

export function moveDeletionBlocked(id: string): LocalizedError | '' {
	const manifest = store.project?.manifest;
	if (!manifest?.rig.animations.some((move) => move.id === id))
		return new LocalizedError('This move is no longer available.', 'moveRemoval.unavailable');
	if (id === DEFAULT_MOVE)
		return new LocalizedError(
			'Keep the standing views used to create and extend items.',
			'moveRemoval.keepStanding'
		);
	if (manifest.rig.animations.length <= 1)
		return new LocalizedError('Keep at least one move on this character.', 'moveRemoval.keepOne');
	if (doc.id.startsWith('fixture:'))
		return new LocalizedError("Demo moves can't be deleted.", 'moveRemoval.demo');
	if (gens.some((generation) => generation.draft.rigId === doc.id && !generation.draft.acceptedAt))
		return new LocalizedError(
			"Finish or discard this character's item drafts before deleting a move.",
			'moveRemoval.resolveDrafts'
		);
	if (
		manifest.items.some(
			(item) =>
				item.standing === id ||
				(item.route === 'ea2-anchor' && item.anchorCell?.startsWith(`${id}/`))
		)
	)
		return new LocalizedError(
			'This standing move is needed to extend existing items to new moves.',
			'moveRemoval.required'
		);
	return deletionBlocked(undefined, 'move');
}

export async function removeMove(id: string) {
	const blocked = moveDeletionBlocked(id);
	if (blocked) throw blocked;
	const projectId = doc.id;
	await flushSave();
	const snapshot = await db.get<StoredProject>('projects', projectId);
	if (!snapshot)
		throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
	const version = stableStringify(snapshot.manifest);
	const removed = snapshot.manifest.rig.animations.find((clip) => clip.id === id);
	const ids = new Set(
		snapshot.manifest.rig.animations.map((move) => move.id).filter((move) => move !== id)
	);
	if (!ids.size)
		throw new LocalizedError('Keep at least one move on this character.', 'moveRemoval.keepOne');
	const manifest = await retainMoves(snapshot.manifest, ids);
	await flushSave();
	const prune = await keysToPrune();
	let kept: RecentlyDeleted | undefined;
	try {
		await db.update<StoredProject>(
			'projects',
			projectId,
			(record) => {
				const changed = moveDeletionBlocked(id);
				if (changed) throw changed;
				if (doc.id !== projectId)
					throw new LocalizedError(
						'The selected character changed.',
						'moveRemoval.selectedCharacterChanged'
					);
				if (!record)
					throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
				if (stableStringify(record.manifest) !== version)
					throw new LocalizedError(
						'This character changed before the move could be deleted. Try again.',
						'moveRemoval.concurrentEdit'
					);
				record.manifest = manifest;
				Object.assign(record, retainMoveMetadata(record, ids));
				record.savedAt = new Date().toISOString();
				return record;
			},
			[],
			(previous) => {
				if (!previous?.manifest.rig.animations.some((clip) => clip.id === id)) return undefined;
				const entry = deletedEntry({
					kind: 'move',
					record: previous,
					name: removed?.name ?? moveLabel(id),
					context: previous.manifest.name,
					scope: { moveId: id }
				});
				kept = entry;
				return { key: entry.id, record: entry };
			},
			prune
		);
	} catch (error) {
		if ((error as DOMException)?.name === 'QuotaExceededError') throw quotaError();
		throw error;
	}
	await refreshRecentlyDeleted();
	if (doc.id === projectId) {
		// Quietly: the deleted clip stays undoable from the history as well as the notice.
		await openProject(projectId, { quiet: true });
		if (kept) pushRecovery(message('history.deleteMove', { name: moveLabel(id) }), kept.id);
	}
	const label = message('state.removedName', { name: moveLabel(id) });
	if (kept)
		toast(label, {
			duration: 10000,
			actionLabel: message('common.undo'),
			action: () => void restoreDeleted(kept!.id)
		});
	else toast(label);
}
