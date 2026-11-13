import { retainMoves, retainMoveMetadata } from '../lib/rig/moves.ts';
import { stableStringify } from '../lib/image/hash.ts';
import { DEFAULT_MOVE } from '../lib/rig/rig.ts';
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import {
	deletionBlocked,
	doc,
	store,
	gens,
	flushSave,
	openProject,
	toast
} from './state.svelte.ts';

export function moveDeletionBlocked(id: string): string {
	const manifest = store.project?.manifest;
	if (!manifest?.rig.animations.some((move) => move.id === id))
		return 'This move is no longer available.';
	if (id === DEFAULT_MOVE) return 'Keep the standing views used to create and extend items.';
	if (manifest.rig.animations.length <= 1) return 'Keep at least one move on this character.';
	if (doc.id.startsWith('fixture:')) return "Demo moves can't be deleted.";
	if (gens.some((generation) => generation.draft.rigId === doc.id && !generation.draft.acceptedAt))
		return "Finish or discard this character's item drafts before deleting a move.";
	if (
		manifest.items.some(
			(item) =>
				item.standing === id ||
				(item.route === 'ea2-anchor' && item.anchorCell?.startsWith(`${id}/`))
		)
	)
		return 'This standing move is needed to extend existing items to new moves.';
	return deletionBlocked()
		.replace('deleting a character', 'deleting a move')
		.replace('Manage characters', 'Manage moves');
}

export async function removeMove(id: string) {
	const blocked = moveDeletionBlocked(id);
	if (blocked) throw new Error(blocked);
	const projectId = doc.id;
	await flushSave();
	const snapshot = await db.get<StoredProject>('projects', projectId);
	if (!snapshot) throw new Error('This character is no longer saved.');
	const version = stableStringify(snapshot.manifest);
	const ids = new Set(
		snapshot.manifest.rig.animations.map((move) => move.id).filter((move) => move !== id)
	);
	if (!ids.size) throw new Error('Keep at least one move on this character.');
	const manifest = await retainMoves(snapshot.manifest, ids);
	await flushSave();
	await db.update<StoredProject>('projects', projectId, (record) => {
		const changed = moveDeletionBlocked(id);
		if (doc.id !== projectId || changed)
			throw new Error(changed || 'The selected character changed.');
		if (!record) throw new Error('This character is no longer saved.');
		if (stableStringify(record.manifest) !== version)
			throw new Error('This character changed before the move could be deleted. Try again.');
		record.manifest = manifest;
		Object.assign(record, retainMoveMetadata(record, ids));
		record.savedAt = new Date().toISOString();
		return record;
	});
	if (doc.id === projectId) await openProject(projectId);
	toast('Removed move');
}
