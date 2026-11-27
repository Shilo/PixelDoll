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
	| { kind: 'published'; written: number; kept: number; matching: PlanAction[] }
	| { kind: 'unchanged'; kept: number; matching: PlanAction[] }
	| { kind: 'blocked'; conflicts: PlanAction[]; matching?: PlanAction[] }
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

/** Files read or written at once. A file operation mostly waits on the browser and the disk (on Windows, replacing a
 *  file takes tens of milliseconds while the browser checks it), so a few in flight make a publish of hundreds of files
 *  several times faster; measured in Edge and Brave, more than eight gained little. */
const AT_ONCE = 8;

/** Runs `work` on every item, at most AT_ONCE at a time, and resolves with each result in item order; the first failure
 *  in item order (not in finishing order) is thrown once all have settled, so what is reported does not depend on timing. */
async function allAtOnce<T, R>(items: readonly T[], work: (item: T) => Promise<R>): Promise<R[]> {
	const results = await settleAtOnce(items, work);
	for (const r of results) if (r.status === 'rejected') throw r.reason;
	return results.map((r) => (r as PromiseFulfilledResult<R>).value);
}

async function settleAtOnce<T, R>(
	items: readonly T[],
	work: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
	const results: PromiseSettledResult<R>[] = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			try {
				results[i] = { status: 'fulfilled', value: await work(items[i]) };
			} catch (reason) {
				results[i] = { status: 'rejected', reason };
			}
		}
	};
	await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, worker));
	return results;
}

/** A staged write given up because another file of the same publish failed; its file was never replaced. */
class Stopped extends Error {}

/** Written several at a time, in two waves: image payloads first, then resources that name only images (Godot's
 *  per-layer SpriteFrames .tres). Every other file (godot/library.tres and scenes naming those resources, other engines'
 *  indexes) follows one at a time in the export's own order, and the manifest last, so nothing that names a file lands
 *  before it. */
const isPayload = (path: string) => path.endsWith('.png');
const isImageResource = (path: string) =>
	path.startsWith('godot/') && path.endsWith('.tres') && path !== 'godot/library.tres';

export async function hashFiles(files: readonly FolderFile[]) {
	const next = new Map<string, string>();
	for (const file of files) next.set(file.name, await sha256(file.data));
	return next;
}

/** The hash at a path now: null when missing, NOT_A_FILE when a folder is there. */
export async function hashAt(target: FolderTarget, path: string): Promise<string | null> {
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
		const paths = [...next].filter(([path]) => !kept.has(path));
		const found = await allAtOnce(paths, ([path]) => hashAt(target, path));
		return paths.every(([, hash], i) => found[i] === hash);
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
 *   previous hash again (null: none) when the write failed before swapping. If recording fails, no further write
 *   starts; writes already under way finish and are recorded, each under its own PENDING mark.
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
		const paths = [...next.keys()].filter((path) => !kept.has(path));
		const found = await allAtOnce(paths, (path) => hashAt(target, path));
		paths.forEach((path, i) => disk.set(path, found[i]));
		const plan = planPublish({ next, record: o.record, disk, overwrite: o.overwrite });
		// Files already holding the export's bytes that PixelDoll did not write: still the user's, but worth offering.
		const matching = plan.actions.filter((a) => a.kind === 'foreign');
		if (plan.conflicts.length) return { kind: 'blocked', conflicts: plan.conflicts, matching };
		approved = plan.approved;
		if (!plan.writes.length) return { kind: 'unchanged', kept: o.record.kept.length, matching };
		if (o.proceed && !(await o.proceed())) return { kind: 'stopped' };
		// Once any file fails, no further write starts, and one still checking its staged bytes is given up; writes
		// already past that check finish and are recorded under their own PENDING mark.
		let stop = false;
		const failures: { path: string; error: unknown }[] = [];
		const fail = (path: string, error: unknown) => {
			stop = true;
			failures.push({ path, error });
		};
		const write = async (a: PlanAction) => {
			if (stop) return;
			const expected = disk.get(a.path) ?? null;
			const previous = Object.hasOwn(o.record.written, a.path) ? o.record.written[a.path] : null;
			try {
				await o.onRecord(a.path, PENDING);
			} catch (error) {
				return fail(a.path, error);
			}
			let created = false;
			try {
				// Checked again with the new bytes staged, just before they replace the file: anything changed since
				// planning pauses the publish instead. (The browser has no compare-and-swap, so a change in the instant
				// between this check and the swap can still be lost.)
				await target.write(
					a.path,
					bytes.get(a.path)!,
					async (createdHere) => {
						if (stop) throw new Stopped();
						const now = await hashAt(target, a.path);
						return now === expected || (expected === null && createdHere && now === EMPTY_HASH);
					},
					expected !== null,
					() => (created = true)
				);
			} catch (error) {
				if (!(error instanceof Stopped)) fail(a.path, error);
				// The swap only happens when a write completes, so the file still holds its previous bytes. A new path
				// this write created (the browser creates it empty on opening) stays pending, whether that file is still
				// there or someone removed it meanwhile: it is the user's to delete or approve, never one PixelDoll
				// recreates unasked.
				// Given up only because another file failed: if the file this write created is still exactly the empty one
				// it made, it is PixelDoll's, so the next publish may fill it rather than ask about it.
				const untouched =
					error instanceof Stopped &&
					created &&
					(await hashAt(target, a.path).catch(() => null)) === EMPTY_HASH;
				const left = previous === null && created;
				const restore = untouched ? EMPTY_HASH : left ? PENDING : previous;
				await o.onRecord(a.path, restore).catch((recordError: unknown) => {
					console.warn('Could not restore the project folder record', recordError);
				});
				return;
			}
			written++;
			approved = approved.filter((c) => c.path !== a.path);
			try {
				await o.onRecord(a.path, next.get(a.path)!);
			} catch (error) {
				// The file holds the new bytes but stays PENDING: untrusted, never mistaken for the older ones.
				fail(a.path, error);
			}
		};
		const payload = plan.writes.filter((a) => isPayload(a.path));
		const resources = plan.writes.filter((a) => isImageResource(a.path));
		const rest = plan.writes.filter(
			(a) => !isPayload(a.path) && !isImageResource(a.path) && a.path !== 'manifest.json'
		);
		await settleAtOnce(payload, write);
		await settleAtOnce(resources, write);
		for (const a of rest) await write(a);
		// The manifest goes last, so a game that reads it never sees it ahead of the files it describes.
		for (const a of plan.writes) if (a.path === 'manifest.json') await write(a);
		if (failures.length) {
			// Reported the same way whatever finished first: every conflict in the export's order (with the approved
			// files not yet written), else the first other failure in that order.
			const rank = new Map(plan.writes.map((a, i) => [a.path, i]));
			failures.sort((x, y) => rank.get(x.path)! - rank.get(y.path)!);
			const conflicts: PlanAction[] = [];
			for (const { error } of failures) {
				const c = await conflictFor(target, error);
				if (c) conflicts.push(c);
			}
			if (conflicts.length) {
				const listed = new Set(conflicts.map((c) => c.path));
				return {
					kind: 'blocked',
					conflicts: [...conflicts, ...approved.filter((c) => !listed.has(c.path))]
				};
			}
			throw failures[0].error;
		}
		return { kind: 'published', written, kept: o.record.kept.length, matching };
	} catch (error) {
		const conflict = await conflictFor(target, error);
		if (conflict)
			return {
				kind: 'blocked',
				conflicts: [conflict, ...approved.filter((c) => c.path !== conflict.path)]
			};
		return { kind: 'failed', reason: failureReason(error), error, written };
	}
}

/** The conflict an error stands for, or null when it is not one. A folder that appeared where a file belongs is the
 *  user's, never replaced. For a file changed while publishing, what is there now decides what the user can approve:
 *  unreadable bytes cannot be approved at all, so the review offers Try again instead of a Replace that would cover
 *  whatever turns up there later. */
async function conflictFor(target: FolderTarget, error: unknown): Promise<PlanAction | null> {
	if (error instanceof NotAFileError)
		return { path: error.path, kind: 'conflict', reason: 'folder', found: NOT_A_FILE };
	if (!(error instanceof ChangedError)) return null;
	const conflict: PlanAction = { path: error.path, kind: 'conflict', reason: 'edited-outside' };
	try {
		const found = await hashAt(target, error.path);
		if (found === null) return { ...conflict, reason: 'deleted', found: DELETED };
		if (found === NOT_A_FILE) return { ...conflict, reason: 'folder', found };
		return { ...conflict, found };
	} catch {
		return conflict; // the pause stands either way
	}
}
