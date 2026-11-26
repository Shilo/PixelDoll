// Publishes export files into a folder target: plans against the folder's ownership index, journals the writes, writes
// changed files (manifest last), then commits the index. Never throws: every outcome, including failure, is a value.
import {
	committedIndex,
	INDEX_NAME,
	NOT_A_FILE,
	parseIndex,
	pendingIndex,
	planPublish,
	type PlanAction,
	type PlanKind,
	type PublishIndex
} from './plan.ts';
import { NotAFileError, UnsafePathError, type FolderTarget } from './target.ts';

export interface FolderFile {
	name: string;
	data: Uint8Array;
}

export type FailureReason =
	'permission' | 'missing' | 'locked' | 'space' | 'unsafe' | 'taken' | 'unknown';

export type PublishOutcome =
	| {
			kind: 'published';
			counts: Partial<Record<PlanKind, number>>;
			written: number;
			recovered: boolean;
	  }
	| { kind: 'unchanged' }
	| { kind: 'blocked'; conflicts: PlanAction[] }
	| { kind: 'failed'; reason: FailureReason; error: unknown; written: number };

const encoder = new TextEncoder();

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

/** The folder's index; a file there that is not a readable index comes back with its hash, as a conflict to approve. */
async function readIndex(
	target: FolderTarget
): Promise<{ index: PublishIndex | null; invalid?: string }> {
	let bytes: Uint8Array | null;
	try {
		bytes = await target.read(INDEX_NAME);
	} catch (error) {
		if (error instanceof NotAFileError) return { index: null, invalid: NOT_A_FILE };
		throw error;
	}
	const index = parseIndex(bytes && new TextDecoder().decode(bytes));
	return index === 'invalid' ? { index: null, invalid: await sha256(bytes!) } : { index };
}

/** Whether these files are exactly what the folder's index says was last published, read from the index alone. False
 *  when the index is missing, unreadable or mid-publish. */
export async function matchesPublished(
	target: FolderTarget,
	next: ReadonlyMap<string, string>
): Promise<boolean> {
	try {
		const { index } = await readIndex(target);
		if (!index || index.pending) return false;
		const committed = Object.entries(index.committed);
		return (
			committed.length === next.size && committed.every(([path, hash]) => next.get(path) === hash)
		);
	} catch {
		// Unreadable here means the full publish runs and reports the real problem.
		return false;
	}
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

/**
 * @param owner the character publishing, recorded in the index; a folder owned by another character is refused
 * @param overwrite conflicting paths approved for replacement, each with the bytes the user saw there
 * @param adopt take ownership of identical files already there (a publish the user started)
 */
export async function publishFiles(
	target: FolderTarget,
	files: readonly FolderFile[],
	o: {
		owner?: string;
		overwrite?: ReadonlyMap<string, string>;
		adopt?: boolean;
		removeStale?: boolean;
	} = {}
): Promise<PublishOutcome> {
	let written = 0;
	try {
		const bytes = new Map(files.map((f) => [f.name, f.data]));
		const next = await hashFiles(files);
		const { index, invalid } = await readIndex(target);
		if (index?.owner && o.owner && index.owner !== o.owner)
			return {
				kind: 'failed',
				reason: 'taken',
				error: new Error('Folder belongs to another character'),
				written
			};
		const disk = new Map<string, string | null>();
		for (const path of new Set([
			...next.keys(),
			...Object.keys(index?.committed ?? {}),
			...Object.keys(index?.pending ?? {})
		]))
			disk.set(path, await hashAt(target, path));
		const plan = planPublish({
			next,
			index,
			disk,
			overwrite: o.overwrite,
			adopt: o.adopt,
			removeStale: o.removeStale
		});
		// A damaged index is reported with every other conflict, so one approval covers them all.
		const conflicts = [
			...(invalid && o.overwrite?.get(INDEX_NAME) !== invalid
				? [
						{
							path: INDEX_NAME,
							kind: 'conflict' as const,
							reason: 'not-ours' as const,
							found: invalid
						}
					]
				: []),
			...plan.conflicts
		];
		if (conflicts.length) return { kind: 'blocked', conflicts };
		const counts: Partial<Record<PlanKind, number>> = {};
		for (const a of plan.actions) counts[a.kind] = (counts[a.kind] ?? 0) + 1;
		if (!plan.writes.length && !plan.removals.length && !plan.recovering && index && !invalid) {
			// Adopted or dropped entries still need recording; nothing else changed.
			if (!counts.adopt && !counts.gone && !counts['stale-edited']) return { kind: 'unchanged' };
		}
		const owner = o.owner ?? index?.owner;
		await target.write(
			INDEX_NAME,
			encoder.encode(JSON.stringify({ ...pendingIndex(index, next, plan, disk), owner }))
		);
		// The manifest goes last, so a game that reads it never sees it ahead of its images.
		const order = [...plan.writes].sort(
			(a, b) => Number(a.path === 'manifest.json') - Number(b.path === 'manifest.json')
		);
		for (const a of order) {
			// Recheck right before writing: a game edit since planning pauses instead of being replaced. (The browser has
			// no compare-and-swap, so an edit in the instant between this read and the write can still be lost.)
			const now = await hashAt(target, a.path);
			if (now !== (disk.get(a.path) ?? null))
				return {
					kind: 'blocked',
					conflicts: [
						{ path: a.path, kind: 'conflict', reason: 'edited-outside', found: now ?? undefined }
					]
				};
			await target.write(a.path, bytes.get(a.path)!);
			written++;
		}
		for (const a of plan.removals) await target.remove(a.path);
		await target.write(
			INDEX_NAME,
			encoder.encode(JSON.stringify(committedIndex(next, plan, disk, owner)))
		);
		return { kind: 'published', counts, written, recovered: plan.recovering };
	} catch (error) {
		return { kind: 'failed', reason: failureReason(error), error, written };
	}
}

/** Whether the folder already holds exactly these files as PixelDoll's last publish, checked on disk as well as in the
 *  index, so a file edited or deleted in the game is noticed. */
export async function inSync(
	target: FolderTarget,
	next: ReadonlyMap<string, string>
): Promise<boolean> {
	if (!(await matchesPublished(target, next))) return false;
	try {
		for (const [path, hash] of next) {
			const data = await target.read(path);
			if (!data || (await sha256(data)) !== hash) return false;
		}
		return true;
	} catch {
		// Unreadable here means the full publish runs and reports the real problem.
		return false;
	}
}
