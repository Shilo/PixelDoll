// An in-memory project folder for project-folder unit tests: it can fail chosen operations (a locked or vanished file)
// and lets a test act at the moment a write's new bytes are staged, like a game editor saving at the worst time.
// `publish` runs publishFiles with an in-memory trusted record, as the Studio keeps one in IndexedDB.
import { PENDING, type FolderRecord } from '../../src/lib/project-folder/plan.ts';
import { publishFiles, type FolderFile } from '../../src/lib/project-folder/publish.ts';
import {
	ChangedError,
	NotAFileError,
	type FolderTarget
} from '../../src/lib/project-folder/target.ts';

export function memoryFolder(initial: Record<string, string> = {}) {
	const files = new Map(Object.entries(initial).map(([k, v]) => [k, new TextEncoder().encode(v)]));
	const dirs = new Set<string>();
	/** Every completed write, in order. */
	const log: string[] = [];
	/** PixelDoll's trusted record for this folder (kept outside it). */
	const record: { written: Record<string, string>; kept: string[] } = { written: {}, kept: [] };
	let failWrite: ((path: string) => Error | undefined) | undefined;
	let failRead: ((path: string) => Error | undefined) | undefined;
	let failRecord: ((path: string) => Error | undefined) | undefined;
	let onStage: ((path: string) => void) | undefined;
	const target: FolderTarget = {
		async check() {
			const e = failRead?.('');
			if (e) throw e;
		},
		async read(path) {
			const e = failRead?.(path);
			if (e) throw e;
			if (dirs.has(path)) throw new NotAFileError(path);
			return files.get(path) ?? null;
		},
		async write(path, data, unchanged, existing, created) {
			const e = failWrite?.(path);
			if (e) throw e;
			if (dirs.has(path)) throw new NotAFileError(path);
			// Like the browser, opening a missing file for writing creates it empty.
			const createdHere = !files.has(path);
			if (createdHere && existing) throw new ChangedError(path);
			if (createdHere) created?.();
			if (createdHere) files.set(path, new Uint8Array());
			onStage?.(path);
			if (unchanged && !(await unchanged(createdHere))) throw new ChangedError(path);
			files.set(path, data.slice());
			log.push(`write ${path}`);
		}
	};
	const folder = {
		target,
		files,
		dirs,
		log,
		record,
		text: (path: string) => {
			const b = files.get(path);
			return b ? new TextDecoder().decode(b) : null;
		},
		set: (path: string, text: string) => files.set(path, new TextEncoder().encode(text)),
		/** publishFiles with this folder's record, updated after each write as the Studio does. */
		publish: (entries: Record<string, string>, overwrite?: ReadonlyMap<string, string>) =>
			publishFiles(target, toFiles(entries), {
				record: structuredClone(record) as FolderRecord,
				overwrite,
				onRecord: async (path, hash) => {
					if (hash === null) return void delete record.written[path];
					if (hash === PENDING) return void (record.written[path] = hash);
					// failRecord fails recording a finished write (the moment a crash or full storage matters most).
					const e = failRecord?.(path);
					if (e) throw e;
					record.written[path] = hash;
				}
			}),
		set failWrite(f: typeof failWrite) {
			failWrite = f;
		},
		set failRead(f: typeof failRead) {
			failRead = f;
		},
		set failRecord(f: typeof failRecord) {
			failRecord = f;
		},
		set onStage(f: typeof onStage) {
			onStage = f;
		}
	};
	return folder;
}

const toFiles = (o: Record<string, string>): FolderFile[] =>
	Object.entries(o).map(([name, v]) => ({ name, data: new TextEncoder().encode(v) }));
export const files = toFiles;

export const domError = (name: string) => new DOMException('x', name);
