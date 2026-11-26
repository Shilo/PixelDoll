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
	/** Everything that pauses this publish. While any remain, it also lists the files the user already approved, so
	 *  one approval covers the whole set instead of each pause dropping the approvals of the one before. */
	conflicts: PlanAction[];
	writes: PlanAction[];
	/** Writes that happen only because the user approved them, as the conflicts they were. */
	approved: PlanAction[];
}

/** What an approval records for a published file the user deleted: approving it puts the file back. */
export const DELETED = 'deleted';
/** What the record holds for a path while PixelDoll writes it, and keeps if recording the result then fails: the file
 *  may hold PixelDoll's bytes or the user's, so it is treated as the user's (a later deletion or edit pauses) and is
 *  never mistaken for a path PixelDoll has not written. */
export const PENDING = 'pending';
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
	const approved: PlanAction[] = [];
	for (const [path, hash] of o.next) {
		if (kept.has(path)) {
			actions.push({ path, kind: 'kept' });
			continue;
		}
		const current = o.disk.get(path) ?? null;
		const mine = Object.hasOwn(o.record.written, path) ? o.record.written[path] : undefined;
		const approval = o.overwrite?.get(path);
		if (current === NOT_A_FILE)
			actions.push({ path, kind: 'conflict', reason: 'folder', found: current });
		// Already right. Identical bytes PixelDoll did not write stay the user's: nothing is recorded for them.
		else if (current === hash)
			actions.push({ path, kind: mine === hash ? 'unchanged' : 'foreign' });
		else if (current === null) {
			// A file PixelDoll published that is now gone was deleted by the user: a change like any other.
			if (mine === undefined) actions.push({ path, kind: 'create' });
			else if (approval === DELETED) {
				actions.push({ path, kind: 'restore' });
				approved.push({ path, kind: 'conflict', reason: 'deleted', found: DELETED });
			} else actions.push({ path, kind: 'conflict', reason: 'deleted', found: DELETED });
		} else {
			const conflict: PlanAction = {
				path,
				kind: 'conflict',
				reason: mine === undefined ? 'not-ours' : 'edited-outside',
				found: current
			};
			if (mine === current) actions.push({ path, kind: 'update' });
			else if (approval === current) {
				actions.push({ path, kind: 'update' });
				approved.push(conflict);
			} else actions.push(conflict);
		}
	}
	const conflicts = actions.filter((a) => a.kind === 'conflict');
	return {
		actions,
		approved,
		conflicts: conflicts.length ? [...conflicts, ...approved] : [],
		writes: actions.filter(
			(a) => a.kind === 'create' || a.kind === 'update' || a.kind === 'restore'
		)
	};
}
