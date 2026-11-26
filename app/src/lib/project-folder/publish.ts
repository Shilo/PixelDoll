// Publishes export files into a folder target. Plans against PixelDoll's trusted record of what it last wrote, writes
// only changed files (manifest last), checks each file once more with its new bytes staged, and reports every write so
// the record is updated file by file. Never throws: every outcome, including failure, is a value. Never deletes.
import {
	DELETED,
	NOT_A_FILE,
	PENDING,
	planPublish,
	type FolderRecord,
	type PlanAction
} from './plan.ts';
import { ChangedError, NotAFileError, UnsafePathError, type FolderTarget } from './target.ts';

export interface FolderFile {
	name: string;
	data: Uint8Array;
}

export type FailureReason = 'permission' | 'missing' | 'locked' | 'space' | 'unsafe' | 'unknown';

export type PublishOutcome =
	/** `kept`: files the user chose to keep, which PixelDoll leaves alone. */
	| { kind: 'published'; written: number; kept: number }
	| { kind: 'unchanged'; kept: number }
	| { kind: 'blocked'; conflicts: PlanAction[] }
	/** `proceed` said no before anything was written. */
	| { kind: 'stopped' }
	| { kind: 'failed'; reason: FailureReason; error: unknown; written: number };

/** SHA-256 of no bytes: the file a browser creates when PixelDoll opens a new path for writing. */
export const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

export async function sha256(data: Uint8Array): Promise<string> {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)
	);
	return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Maps a filesystem error to what the user can do about it. */
export function failureReason(error: unknown): FailureReason {
	if (error instanceof UnsafePathError) return 'unsafe';
	const name = error instanceof Error || error instanceof DOMException ? error.name : '';
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'permission';
	if (name === 'NotFoundError') return 'missing';
	if (name === 'QuotaExceededError') return 'space';
	// Chromium reports a file another program holds open as NotReadable (reading) or InvalidState (closing a write).
	if (
		name === 'NoModificationAllowedError' ||
		name === 'InvalidStateError' ||
		name === 'NotReadableError'
	)
		return 'locked';
	return 'unknown';
}

export async function hashFiles(files: readonly FolderFile[]) {
	const next = new Map<string, string>();
	for (const file of files) next.set(file.name, await sha256(file.data));
	return next;
}

/** The hash at a path now: null when missing, NOT_A_FILE when a folder is there. */
async function hashAt(target: FolderTarget, path: string): Promise<string | null> {
	try {
		const data = await target.read(path);
		return data && (await sha256(data));
	} catch (error) {
		if (error instanceof NotAFileError) return NOT_A_FILE;
		throw error;
	}
}

/** Whether the record says these exact files were last published, without reading the folder. */
export function matchesRecord(record: FolderRecord, next: ReadonlyMap<string, string>): boolean {
	const kept = new Set(record.kept);
	return [...next].every(([path, hash]) => kept.has(path) || record.written[path] === hash);
}

/** Whether the folder already holds exactly these files (kept ones aside), so a file edited or deleted in the game is
 *  noticed. Bytes already equal need no write even when the record does not show them, such as after a fresh link. */
export async function inSync(
	target: FolderTarget,
	record: FolderRecord,
	next: ReadonlyMap<string, string>
): Promise<boolean> {
	const kept = new Set(record.kept);
	try {
		await target.check();
		for (const [path, hash] of next)
			if (!kept.has(path) && (await hashAt(target, path)) !== hash) return false;
		return true;
	} catch {
		// Unreadable here means the full publish runs and reports the real problem.
		return false;
	}
}

/**
 * @param record PixelDoll's trusted record for this folder
 * @param overwrite conflicting paths the user approved replacing, each with the bytes they saw there
 * @param onRecord updates the trusted record for a path: PENDING just before a write (the path is untrusted while its
 *   swap may or may not have happened, so a crash there leaves it to the user), then the new hash after it, or the
 *   previous hash again (null: none) when the write failed before swapping. If recording fails, publishing stops.
 * @param proceed asked once the plan is ready, just before the first write; false stops without writing (such as
 *   automatic updates having been turned off meanwhile).
 */
export async function publishFiles(
	target: FolderTarget,
	files: readonly FolderFile[],
	o: {
		record: FolderRecord;
		overwrite?: ReadonlyMap<string, string>;
		onRecord: (path: string, hash: string | null) => Promise<void>;
		proceed?: () => Promise<boolean>;
	}
): Promise<PublishOutcome> {
	let written = 0;
	// Approved files not yet written, listed again if a later file pauses this publish.
	let approved: PlanAction[] = [];
	try {
		await target.check();
		const bytes = new Map(files.map((f) => [f.name, f.data]));
		const next = await hashFiles(files);
		const disk = new Map<string, string | null>();
		// Kept files are the user's and never written, so they are not read either (one may be locked or unreadable).
		const kept = new Set(o.record.kept);
		for (const path of next.keys()) if (!kept.has(path)) disk.set(path, await hashAt(target, path));
		const plan = planPublish({ next, record: o.record, disk, overwrite: o.overwrite });
		if (plan.conflicts.length) return { kind: 'blocked', conflicts: plan.conflicts };
		approved = plan.approved;
		if (!plan.writes.length) return { kind: 'unchanged', kept: o.record.kept.length };
		if (o.proceed && !(await o.proceed())) return { kind: 'stopped' };
		// The manifest goes last, so a game that reads it never sees it ahead of its images.
		const order = [...plan.writes].sort(
			(a, b) => Number(a.path === 'manifest.json') - Number(b.path === 'manifest.json')
		);
		for (const a of order) {
			const expected = disk.get(a.path) ?? null;
			// Checked again with the new bytes staged, just before they replace the file: anything changed since planning
			// pauses the publish instead. (The browser has no compare-and-swap, so a change in the instant between this
			// check and the swap can still be lost.)
			const previous = Object.hasOwn(o.record.written, a.path) ? o.record.written[a.path] : null;
			await o.onRecord(a.path, PENDING);
			try {
				await target.write(
					a.path,
					bytes.get(a.path)!,
					async (createdHere) => {
						const now = await hashAt(target, a.path);
						return now === expected || (expected === null && createdHere && now === EMPTY_HASH);
					},
					expected !== null
				);
			} catch (error) {
				// The swap only happens when a write completes, so the file still holds its previous bytes. A new path
				// stays pending if the failed write left a file behind (the browser creates it empty on opening): that
				// file is then the user's to delete or approve, never one PixelDoll recreates unasked.
				const left =
					previous === null && (await hashAt(target, a.path).catch(() => PENDING)) !== null;
				await o.onRecord(a.path, left ? PENDING : previous).catch((recordError: unknown) => {
					console.warn('Could not restore the project folder record', recordError);
				});
				throw error;
			}
			written++;
			approved = approved.filter((c) => c.path !== a.path);
			await o.onRecord(a.path, next.get(a.path)!);
		}
		return { kind: 'published', written, kept: o.record.kept.length };
	} catch (error) {
		// A folder that appeared where a file belongs: the user's, never replaced.
		if (error instanceof NotAFileError)
			return {
				kind: 'blocked',
				conflicts: [{ path: error.path, kind: 'conflict', reason: 'folder', found: NOT_A_FILE }]
			};
		if (error instanceof ChangedError) {
			// What is there now decides what the user can approve. Unreadable bytes cannot be approved at all, so the
			// review offers Try again instead of a Replace that would cover whatever turns up there later.
			let conflict: PlanAction = { path: error.path, kind: 'conflict', reason: 'edited-outside' };
			try {
				const found = await hashAt(target, error.path);
				if (found === null) conflict = { ...conflict, reason: 'deleted', found: DELETED };
				else if (found === NOT_A_FILE) conflict = { ...conflict, reason: 'folder', found };
				else conflict = { ...conflict, found };
			} catch {
				// The pause stands either way.
			}
			return {
				kind: 'blocked',
				conflicts: [conflict, ...approved.filter((c) => c.path !== error.path)]
			};
		}
		return { kind: 'failed', reason: failureReason(error), error, written };
	}
}
