import { retainMoves, retainMoveMetadata } from '../lib/rig/moves.ts';
import { stableStringify } from '../lib/image/hash.ts';
import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { LocalizedError, message } from '../lib/message.ts';
import {
	deletionBlocked,
	doc,
	store,
	gens,
	flushSave,
	openProject,
	toast
} from './state.svelte.ts';

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
	toast(message('moveRemoval.removed'));
}
