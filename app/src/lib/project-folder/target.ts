// A destination folder as three operations, so the publisher never sees a browser handle (and a native shell or a test
// can supply its own). Paths are export-relative with forward slashes.

export interface FolderTarget {
	/** Throws NotFoundError when the linked folder itself is gone (moved or deleted). */
	check(): Promise<void>;
	/** The file's bytes, or null when it does not exist. Throws NotAFileError when a folder sits at the path. */
	read(path: string): Promise<Uint8Array | null>;
	/** Replaces the file in one step: readers see the old or the new bytes, never a mix. `unchanged` runs once the new
	 *  bytes are staged, just before they replace the file, and learns whether this write created the (still empty) file;
	 *  false cancels the write and throws ChangedError, leaving the file as it was. There is deliberately no delete. */
	write(
		path: string,
		data: Uint8Array,
		unchanged?: (createdHere: boolean) => Promise<boolean>
	): Promise<void>;
}

export class NotAFileError extends Error {
	constructor(readonly path: string) {
		super(`A folder is in the way of ${path}`);
		this.name = 'NotAFileError';
	}
}

/** The file changed after PixelDoll checked it, so the write was cancelled. */
export class ChangedError extends Error {
	constructor(readonly path: string) {
		super(`${path} changed while publishing`);
		this.name = 'ChangedError';
	}
}

export class UnsafePathError extends Error {
	constructor(path: string) {
		super(`Unsafe project folder path: ${path}`);
		this.name = 'UnsafePathError';
	}
}

// eslint-disable-next-line no-control-regex
const BAD = /[\u0000-\u001f<>:"\\|?*]/;

/** Splits a relative path, refusing anything that could leave the folder or that Windows cannot store. */
export function pathParts(path: string): string[] {
	const parts = path.split('/');
	if (
		!path ||
		parts.some(
			(part) => !part || part === '.' || part === '..' || BAD.test(part) || /[. ]$/.test(part)
		)
	)
		throw new UnsafePathError(path);
	return parts;
}

/** A File System Access directory, optionally narrowed to a subfolder that is created on first write. */
export function directoryTarget(
	root: FileSystemDirectoryHandle,
	base: readonly string[] = []
): FolderTarget {
	for (const part of base) pathParts(part);
	async function folder(parts: readonly string[], create: boolean) {
		let dir = root;
		for (const part of [...base, ...parts]) dir = await dir.getDirectoryHandle(part, { create });
		return dir;
	}
	return {
		async check() {
			// Listing the picked folder fails once it was moved or deleted; its subfolder may legitimately not exist yet.
			for await (const _ of root.keys()) break;
		},
		async read(path) {
			const parts = pathParts(path);
			try {
				const dir = await folder(parts.slice(0, -1), false);
				const file = await (await dir.getFileHandle(parts.at(-1)!)).getFile();
				return new Uint8Array(await file.arrayBuffer());
			} catch (error) {
				if (error instanceof DOMException && error.name === 'NotFoundError') return null;
				if (error instanceof DOMException && error.name === 'TypeMismatchError')
					throw new NotAFileError(path);
				throw error;
			}
		},
		async write(path, data, unchanged) {
			const parts = pathParts(path);
			const dir = await folder(parts.slice(0, -1), true);
			const name = parts.at(-1)!;
			let file: FileSystemFileHandle;
			let createdHere = false;
			try {
				file = await dir.getFileHandle(name);
			} catch (error) {
				if (!(error instanceof DOMException && error.name === 'NotFoundError')) {
					if (error instanceof DOMException && error.name === 'TypeMismatchError')
						throw new NotAFileError(path);
					throw error;
				}
				// Opening for writing creates the file empty; knowing this write made it lets the check below tell it
				// apart from an empty file someone else saved there.
				file = await dir.getFileHandle(name, { create: true });
				createdHere = true;
			}
			const out = await file.createWritable();
			try {
				// The browser stages these bytes in a temporary copy; the file itself changes only on close.
				await out.write(data as Uint8Array<ArrayBuffer>);
				if (unchanged) {
					// The content check reads and hashes the file, which takes a moment. The size and modified time are
					// taken before it and compared again right before the swap, so a change during the check is caught
					// too, leaving only the instant between this last comparison and close() (no browser API closes it).
					const before = await file.getFile();
					if (!(await unchanged(createdHere))) throw new ChangedError(path);
					const now = await file.getFile();
					if (now.size !== before.size || now.lastModified !== before.lastModified)
						throw new ChangedError(path);
				}
				await out.close();
			} catch (error) {
				// Abort drops the browser's temporary copy, leaving the previous file in place.
				await out.abort().catch(() => {});
				throw error;
			}
		}
	};
}
