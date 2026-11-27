// Moving a saved outfit to the Trash, like a move or a State: it leaves the character's saved record with an entry the
// Trash keeps (and its notice can undo), and only its saved choices go: the items it named stay in the Wardrobe.
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { deletedEntry, quotaError, type RecentlyDeleted } from '../lib/store/recently-deleted.ts';
import { LocalizedError, message } from '../lib/message.ts';
import {
	doc,
	flushSave,
	keysToPruneAndForget,
	openProject,
	pushRecovery,
	refreshRecentlyDeleted,
	restoreDeleted,
	toast
} from './state.svelte.ts';

/** Why an outfit cannot go to the Trash: the demo's outfits are part of the bundled demo. */
export const outfitTrashLocked = (projectId = doc.id) => !projectId.startsWith('rig-');

export async function removeOutfit(id: string) {
	const projectId = doc.id;
	if (outfitTrashLocked(projectId))
		throw new LocalizedError('Demo outfits can’t be deleted.', 'savedActions.demoOutfitLocked');
	await flushSave();
	const prune = await keysToPruneAndForget();
	let kept: RecentlyDeleted | undefined;
	let name = '';
	try {
		await db.update<StoredProject>(
			'projects',
			projectId,
			(record) => {
				if (!record?.manifest)
					throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
				record.manifest.presets = record.manifest.presets.filter((preset) => preset.id !== id);
				record.savedAt = new Date().toISOString();
				return record;
			},
			[],
			(previous) => {
				const preset = previous?.manifest.presets.find((entry) => entry.id === id);
				if (!previous || !preset) return undefined;
				name = preset.name;
				const entry = deletedEntry({
					kind: 'outfit',
					record: previous,
					name: preset.name,
					context: previous.manifest.name,
					scope: { presetId: id }
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
		await openProject(projectId, { quiet: true });
		if (kept) pushRecovery(message('history.deleteOutfit'), kept.id);
	}
	const label = message('state.removedName', { name });
	if (kept)
		toast(label, {
			duration: 10000,
			actionLabel: message('common.undo'),
			action: () => void restoreDeleted(kept!.id)
		});
	else toast(label);
}
