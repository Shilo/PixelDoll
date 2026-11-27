// Where a link's files go inside the picked folder: the character's own files in its subfolder, and the engine runtime
// they all use once, in `pixeldoll-<engine>/`. A publish works on the picked folder with both, so one plan covers every
// file before any is written; each path's trusted record is the character's or the shared runtime's.
import type { Engine } from '../store/manifest.ts';
import type { FolderRecord, PlanAction } from './plan.ts';

/** The name of PixelDoll's own folders inside the picked one, one per engine (pixeldoll-godot). The name and every
 *  name starting with it are reserved: a character is never given one (see characterFolder), and they are matched
 *  without case, as Windows and macOS folders are. */
const SHARED_NAME = 'pixeldoll';

/** Whether a folder name is one of PixelDoll's own. */
export const isSharedDir = (name: string) => {
	const lower = name.toLowerCase();
	return lower === SHARED_NAME || lower.startsWith(`${SHARED_NAME}-`);
};

/** Whether a picked-folder-relative path is in one of PixelDoll's own folders. */
export const isSharedPath = (path: string) => isSharedDir(path.split('/')[0]);

/** A character's subfolder for its export ID: the ID itself, unless it is one of PixelDoll's reserved folder names. */
export const characterFolder = (exportId: string) =>
	isSharedDir(exportId) ? `character-${exportId}` : exportId;

/** The engines whose folder exports have a runtime shared by every character in the folder. */
export const RUNTIME_ENGINES: readonly Engine[] = ['godot', 'phaser', 'phaser-ae', 'unity'];

export const hasRuntime = (engine: Engine) => RUNTIME_ENGINES.includes(engine);

/** The picked-folder-relative directory of an engine's shared runtime. */
export const runtimeDir = (engine: Engine) => `pixeldoll-${engine}`;

/** The trusted record of a shared runtime: one per picked folder and engine, kept when a character is unlinked. */
export const runtimeKey = (destinationId: string, engine: Engine) =>
	`runtime|${destinationId}|${engine}`;

/** A part of the picked folder with its own trusted record. */
export interface Scope {
	/** Picked-folder-relative directory, without a trailing slash. */
	dir: string;
	/** Its record's key. */
	key: string;
}

/** Prefixes paths with their scope's directory. */
export const under = (dir: string, path: string) => `${dir}/${path}`;

/** The scope a picked-folder-relative path belongs to, and the path inside it; null when it is in none. */
export function scopeOf(scopes: readonly Scope[], path: string) {
	for (const scope of scopes)
		if (path.startsWith(`${scope.dir}/`)) return { scope, path: path.slice(scope.dir.length + 1) };
	return null;
}

/** One record over several scopes, with every path relative to the picked folder. */
export function combineRecords(
	parts: readonly { scope: Scope; record: FolderRecord }[]
): FolderRecord {
	const written: Record<string, string> = {};
	const kept: string[] = [];
	for (const { scope, record } of parts) {
		for (const [path, hash] of Object.entries(record.written))
			written[under(scope.dir, path)] = hash;
		for (const path of record.kept) kept.push(under(scope.dir, path));
	}
	return { written, kept };
}

/** Groups picked-folder-relative paths by scope, as paths inside it; paths in no scope are dropped. */
export function byScope(scopes: readonly Scope[], paths: readonly string[]) {
	const groups = new Map<Scope, string[]>();
	for (const path of paths) {
		const found = scopeOf(scopes, path);
		if (!found) continue;
		groups.set(found.scope, [...(groups.get(found.scope) ?? []), found.path]);
	}
	return groups;
}

/** Whether the user may keep a conflicting file as it is. A shared runtime file that is gone (or has a folder in its
 *  place) cannot be kept: every character in the folder needs it, so it can only be restored. An edited one can. */
export const keepable = (conflict: Pick<PlanAction, 'path' | 'reason'>) =>
	!(isSharedPath(conflict.path) && (conflict.reason === 'deleted' || conflict.reason === 'folder'));
