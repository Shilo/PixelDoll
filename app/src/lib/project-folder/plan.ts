// What a project-folder publish would do, path by path. Pure, so every filesystem adapter shares it.
//
// Safety rule: PixelDoll replaces a file only when it holds exactly the bytes PixelDoll itself last left there, or bytes
// the user approved replacing. What PixelDoll left is recorded in PixelDoll's own storage right after each write (never in
// the user's folder, where anything could forge it). Every other file is the user's: it is never written, and nothing is
// ever deleted. Paths outside the export, such as engine sidecars (Godot .import and .uid, Unity .meta), are never named.

export type PlanKind =
	'create' | 'unchanged' | 'foreign' | 'update' | 'restore' | 'conflict' | 'kept';

export interface PlanAction {
	path: string;
	kind: PlanKind;
	/** For a conflict: why the file is the user's. */
	reason?: 'edited-outside' | 'not-ours' | 'folder' | 'deleted';
	/** For a conflict: the bytes found there, so replacing them needs approval of exactly these bytes. */
	found?: string;
}

/** PixelDoll's trusted record of a linked folder, kept outside it. */
export interface FolderRecord {
	/** Path to the hash of the bytes PixelDoll last wrote there (or the user approved). */
	written: Readonly<Record<string, string>>;
	/** Paths the user chose to keep as they are. */
	kept: readonly string[];
}

export interface Plan {
	actions: PlanAction[];
	conflicts: PlanAction[];
	writes: PlanAction[];
}

/** What an approval records for a published file the user deleted: approving it puts the file back. */
export const DELETED = 'deleted';
/** The disk "hash" of a folder found where a file belongs: never replaceable by a file write. */
export const NOT_A_FILE = 'not-a-file';

/**
 * @param next the files the export wants, path to content hash
 * @param disk the current hash of every path in `next`: null when missing, NOT_A_FILE for a folder
 * @param overwrite conflicting paths the user approved replacing, each with the bytes they saw there
 */
export function planPublish(o: {
	next: ReadonlyMap<string, string>;
	record: FolderRecord;
	disk: ReadonlyMap<string, string | null>;
	overwrite?: ReadonlyMap<string, string>;
}): Plan {
	const kept = new Set(o.record.kept);
	const actions: PlanAction[] = [];
	for (const [path, hash] of o.next) {
		if (kept.has(path)) {
			actions.push({ path, kind: 'kept' });
			continue;
		}
		const current = o.disk.get(path) ?? null;
		const mine = Object.hasOwn(o.record.written, path) ? o.record.written[path] : undefined;
		const approved = o.overwrite?.get(path);
		if (current === NOT_A_FILE)
			actions.push({ path, kind: 'conflict', reason: 'folder', found: current });
		// Already right. Identical bytes PixelDoll did not write stay the user's: nothing is recorded for them.
		else if (current === hash)
			actions.push({ path, kind: mine === hash ? 'unchanged' : 'foreign' });
		else if (current === null) {
			// A file PixelDoll published that is now gone was deleted by the user: a change like any other.
			if (mine === undefined) actions.push({ path, kind: 'create' });
			else if (approved === DELETED) actions.push({ path, kind: 'restore' });
			else actions.push({ path, kind: 'conflict', reason: 'deleted', found: DELETED });
		} else if (mine === current || approved === current) actions.push({ path, kind: 'update' });
		else
			actions.push({
				path,
				kind: 'conflict',
				reason: mine === undefined ? 'not-ours' : 'edited-outside',
				found: current
			});
	}
	const conflicts = actions.filter((a) => a.kind === 'conflict');
	return {
		actions,
		conflicts,
		writes: actions.filter(
			(a) => a.kind === 'create' || a.kind === 'update' || a.kind === 'restore'
		)
	};
}
