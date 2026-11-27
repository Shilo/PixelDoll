// Moving a saved outfit to the Trash, like a move or a State: it leaves the character's saved record with an entry the
// Trash keeps (and its notice can undo), and only its saved choices go: the items it named stay in the Wardrobe.
import * as db from '../lib/store/db.ts';
import type { StoredProject } from '../lib/store/project.ts';
import { deletedEntry, quotaError, type RecentlyDeleted } from '../lib/store/recently-deleted.ts';
import { fixtureManifest } from '../lib/dress/project.ts';
import { LocalizedError, message } from '../lib/message.ts';
import {
	commit,
	doc,
	flushSave,
	keysToPruneAndForget,
	notifyLibraryChanged,
	openProject,
	pushRecovery,
	refreshRecentlyDeleted,
	restoreDeleted,
	store,
	syncOutfitSteps,
	toast,
	undo
} from './state.svelte.ts';

/** The outfits each demo comes with, read from its bundle once. */
const bundled = $state<Record<string, string[]>>({});
const reading = new Set<string>();
function readBundled(projectId: string) {
	if (reading.has(projectId)) return;
	reading.add(projectId);
	fixtureManifest(projectId).then(
		(manifest) => (bundled[projectId] = manifest.presets.map((preset) => preset.id)),
		(error: unknown) => {
			// Unread, every outfit of this demo stays locked: none of its own can be removed by mistake.
			console.error('demo outfits', error);
			reading.delete(projectId);
		}
	);
}

/** Outfits saved on a demo have no Trash (its record is not a character's): they are removed as an edit Undo reverts. */
export const outfitHasTrash = (projectId = doc.id) => projectId.startsWith('rig-');

/** Why an outfit cannot be removed: a demo's own outfits are part of its bundle. */
export function outfitLocked(presetId: string, projectId = doc.id) {
	if (outfitHasTrash(projectId)) return false;
	if (!projectId.startsWith('fixture:')) return true;
	const ids = bundled[projectId];
	if (!ids) {
		readBundled(projectId);
		return true;
	}
	return ids.includes(presetId);
}

/** Remove an outfit saved on a demo: one edit, with Undo on its notice and in the history. */
export function removeDemoOutfit(id: string) {
	const m = store.project?.manifest,
		preset = m?.presets.find((entry) => entry.id === id);
	if (!m || !preset || outfitLocked(id)) return;
	commit(message('history.removeOutfit'), () => {
		m.presets = m.presets.filter((entry) => entry.id !== id);
	});
	toast(message('state.removedName', { name: preset.name }), {
		duration: 10000,
		actionLabel: message('common.undo'),
		action: () => void undo()
	});
}

const gone = () =>
	new LocalizedError('This outfit is no longer available.', 'savedActions.outfitGone');

export async function removeOutfit(id: string) {
	const projectId = doc.id;
	if (!outfitHasTrash(projectId))
		throw new LocalizedError(
			'The demo’s own outfits can’t be moved to the Trash',
			'savedActions.demoOutfitLocked'
		);
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
				if (!previous?.manifest)
					throw new LocalizedError('This character is no longer saved.', 'detailsSheet.notSaved');
				const preset = previous.manifest.presets.find((entry) => entry.id === id);
				// Already gone (another tab): nothing is archived, so nothing else may be written or pruned either.
				if (!preset) throw gone();
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
	syncOutfitSteps(projectId, id);
	await refreshRecentlyDeleted();
	notifyLibraryChanged(projectId);
	if (doc.id === projectId) {
		await openProject(projectId, { quiet: true });
		pushRecovery(message('history.deleteOutfit'), kept!.id);
	}
	toast(message('state.removedName', { name }), {
		duration: 10000,
		actionLabel: message('common.undo'),
		action: () => void restoreDeleted(kept!.id)
	});
}
