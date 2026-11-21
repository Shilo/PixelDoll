import { retainMoves, retainMoveMetadata } from '../lib/rig/moves.ts';
import { stableStringify } from '../lib/image/hash.ts';
import { baseHashOf, cellKey, DEFAULT_MOVE, storedCellHashes } from '../lib/rig/rig.ts';
import { AUTHORED, fromApi, hasAll } from '../lib/rig/poses.ts';
import { STATE_CAPTURE_MODE } from '../lib/rig/setup.ts';
import { flipSkeleton } from '../lib/rig/skeleton.ts';
import { clipKind } from '../lib/runtime/timeline.js';
import type { Manifest } from '../lib/store/manifest.ts';
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { LocalizedError, message } from '../lib/message.ts';
import { moveLabel } from './model.ts';
import {
	deletionBlocked,
	directionEditsBlocked,
	doc,
	store,
	ui,
	gens,
	flushSave,
	openProject,
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

export function stateCaptureId(name: string) {
	return name
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function stateCaptureNameIssue(manifest: Manifest, id: string) {
	if (!id) return 'stateCapture.invalidName';
	if (
		[DEFAULT_MOVE, 'standing', 'walk', 'idle', ...AUTHORED].includes(id) ||
		manifest.rig.animations.some((clip) => stateCaptureId(clip.id) === id)
	)
		return 'stateCapture.takenName';
	return undefined;
}

export async function captureState(
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
	if (nameIssue || Object.hasOwn(snapshot.moveReviews ?? {}, id))
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
	rig.animations.push({
		id,
		kind: 'state',
		cells: 1,
		loop: false,
		frames: [{ cell: 0, ms: frame.ms }],
		source: { endpoint: 'local', mode: STATE_CAPTURE_MODE },
		...(Object.keys(sources).length ? { sources } : {})
	});
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
	if (doc.id !== projectId) return;
	await openProject(projectId, { quiet: true });
	if (
		doc.id === projectId &&
		store.project?.manifest.rig.animations.some((clip) => clip.id === id)
	) {
		ui.anim = id;
		ui.frame = 0;
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
	await db.update<StoredProject>('projects', projectId, (record) => {
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
	});
	if (doc.id === projectId) await openProject(projectId);
	toast(
		removed && clipKind(removed) === 'state'
			? message('state.removedName', { name: moveLabel(id) })
			: message('moveRemoval.removed')
	);
}
