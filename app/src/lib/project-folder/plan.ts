// What a project-folder publish would do, path by path. Pure, so every filesystem adapter shares it. It only ever names
// paths in the export or in its own ownership index, so a game's other files and engine sidecars (Godot .import and .uid,
// Unity .meta) are never written or removed.

export const INDEX_NAME = '.pixeldoll-publish.json';

export type PlanKind =
	| 'create'
	| 'adopt'
	| 'foreign'
	| 'unchanged'
	| 'update'
	| 'restore'
	| 'conflict'
	| 'gone'
	| 'stale'
	| 'remove'
	| 'stale-edited';

export interface PlanAction {
	path: string;
	kind: PlanKind;
	/** For a conflict: the file changed after PixelDoll wrote it, or PixelDoll never wrote it. */
	reason?: 'edited-outside' | 'not-ours' | 'folder';
	/** For a conflict: the bytes found there, so replacing them needs approval of exactly these bytes. */
	found?: string;
}

/** The ownership index kept in the folder. `pending` lists the bytes a publish is about to write, so an interrupted one
 *  recognizes its own half-finished writes instead of treating them as edits made in the game. */
export interface PublishIndex {
	version: 1;
	/** The character this folder belongs to, so a second character can never take it over. */
	owner?: string;
	committed: Record<string, string>;
	pending: Record<string, string> | null;
	/** Pending paths that did not exist before: only these may be left empty by an interrupted first write. */
	fresh?: string[];
}

export interface Plan {
	actions: PlanAction[];
	conflicts: PlanAction[];
	writes: PlanAction[];
	removals: PlanAction[];
	blocked: boolean;
	recovering: boolean;
}

const WRITES = new Set<PlanKind>(['create', 'update', 'restore']);
/** SHA-256 of no bytes: the empty file a browser leaves when a first write is interrupted before any content lands. */
export const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
/** The disk "hash" of a folder found where a file belongs: never replaceable by a file write. */
export const NOT_A_FILE = 'not-a-file';

export function ownedFrom(index: PublishIndex | null): Map<string, Set<string>> {
	const owned = new Map<string, Set<string>>();
	const add = (path: string, hash: string) => {
		let hashes = owned.get(path);
		if (!hashes) owned.set(path, (hashes = new Set()));
		hashes.add(hash);
	};
	for (const [path, hash] of Object.entries(index?.committed ?? {})) add(path, hash);
	for (const [path, hash] of Object.entries(index?.pending ?? {})) add(path, hash);
	for (const path of index?.fresh ?? []) add(path, EMPTY_HASH);
	return owned;
}

/**
 * @param next the files the export wants, path to content hash
 * @param disk the current hash of every path in `next` or the index; null when missing
 * @param overwrite conflicting paths the user chose to replace, with the bytes they saw there: different bytes still conflict
 * @param adopt take ownership of identical files already there (only when the user asked for this publish)
 * @param removeStale remove generated files the export no longer has, when they still match what was published
 */
export function planPublish(o: {
	next: ReadonlyMap<string, string>;
	index: PublishIndex | null;
	disk: ReadonlyMap<string, string | null>;
	overwrite?: ReadonlyMap<string, string>;
	adopt?: boolean;
	removeStale?: boolean;
}): Plan {
	const owned = ownedFrom(o.index);
	const actions: PlanAction[] = [];
	for (const [path, hash] of o.next) {
		const current = o.disk.get(path) ?? null;
		const mine = owned.get(path);
		if (current === hash)
			actions.push({ path, kind: mine ? 'unchanged' : o.adopt ? 'adopt' : 'foreign' });
		else if (current === null) actions.push({ path, kind: mine ? 'restore' : 'create' });
		else if (current === NOT_A_FILE)
			actions.push({ path, kind: 'conflict', reason: 'folder', found: current });
		else if (mine?.has(current) || o.overwrite?.get(path) === current)
			actions.push({ path, kind: 'update' });
		else
			actions.push({
				path,
				kind: 'conflict',
				reason: mine ? 'edited-outside' : 'not-ours',
				found: current
			});
	}
	for (const [path, hashes] of owned) {
		if (o.next.has(path)) continue;
		const current = o.disk.get(path) ?? null;
		if (current === null) actions.push({ path, kind: 'gone' });
		else if (hashes.has(current)) actions.push({ path, kind: o.removeStale ? 'remove' : 'stale' });
		else actions.push({ path, kind: 'stale-edited' });
	}
	const conflicts = actions.filter((a) => a.kind === 'conflict');
	return {
		actions,
		conflicts,
		writes: actions.filter((a) => WRITES.has(a.kind)),
		removals: actions.filter((a) => a.kind === 'remove'),
		blocked: conflicts.length > 0,
		recovering: !!o.index?.pending
	};
}

export function pendingIndex(
	index: PublishIndex | null,
	next: ReadonlyMap<string, string>,
	plan: Plan,
	disk: ReadonlyMap<string, string | null>
): PublishIndex {
	const committed: Record<string, string> = { ...(index?.committed ?? {}) };
	// Bytes an earlier interrupted publish left behind are ours: record them as committed before the pending list is
	// replaced, so a second interruption still recognizes them.
	for (const a of plan.actions)
		if (a.kind === 'update' || a.kind === 'unchanged' || a.kind === 'stale') {
			const found = disk.get(a.path);
			if (found && found !== EMPTY_HASH && ownedFrom(index).get(a.path)?.has(found))
				committed[a.path] = found;
		}
	const pending: Record<string, string> = {};
	for (const a of plan.writes) pending[a.path] = next.get(a.path)!;
	const fresh = plan.writes.filter((a) => a.kind !== 'update').map((a) => a.path);
	return { version: 1, owner: index?.owner, committed, pending, fresh };
}

export function committedIndex(
	next: ReadonlyMap<string, string>,
	plan: Plan,
	disk: ReadonlyMap<string, string | null>,
	owner?: string
): PublishIndex {
	const committed: Record<string, string> = Object.fromEntries(
		[...next].filter(([path]) => !plan.actions.some((a) => a.path === path && a.kind === 'foreign'))
	);
	// A stale generated file stays owned, so a later removal can still prove it is unchanged.
	for (const a of plan.actions)
		if (a.kind === 'stale') {
			const hash = disk.get(a.path);
			if (hash) committed[a.path] = hash;
		}
	return { version: 1, owner, committed, pending: null };
}

/** The index as read from the folder, or 'invalid' when a file is there but is not one PixelDoll can read. */
export function parseIndex(text: string | null): PublishIndex | null | 'invalid' {
	if (text === null) return null;
	try {
		const value: unknown = JSON.parse(text);
		if (!value || typeof value !== 'object') return 'invalid';
		const { version, owner, committed, pending, fresh } = value as Record<string, unknown>;
		const hashes = (x: unknown): x is Record<string, string> =>
			!!x &&
			typeof x === 'object' &&
			!Array.isArray(x) &&
			Object.values(x).every((h) => typeof h === 'string');
		if (
			version !== 1 ||
			!hashes(committed) ||
			!(pending === null || hashes(pending)) ||
			!(owner === undefined || typeof owner === 'string') ||
			!(fresh === undefined || (Array.isArray(fresh) && fresh.every((p) => typeof p === 'string')))
		)
			return 'invalid';
		return {
			version,
			committed,
			pending,
			...(owner === undefined ? {} : { owner: owner as string }),
			...(fresh === undefined ? {} : { fresh: fresh as string[] })
		};
	} catch {
		return 'invalid';
	}
}
