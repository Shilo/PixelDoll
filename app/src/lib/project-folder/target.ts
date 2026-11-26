// A destination folder as three operations, so the publisher never sees a browser handle (and a native shell or a test
// can supply its own). Paths are export-relative with forward slashes.

export interface FolderTarget {
	/** The file's bytes, or null when it does not exist. Throws NotAFileError when a folder sits at the path. */
	read(path: string): Promise<Uint8Array | null>;
	/** Replaces the file in one step: readers see the old or the new bytes, never a mix. */
	write(path: string, data: Uint8Array): Promise<void>;
	remove(path: string): Promise<void>;
}

export class NotAFileError extends Error {
	constructor(path: string) {
		super(`A folder is in the way of ${path}`);
		this.name = 'NotAFileError';
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
		async write(path, data) {
			const parts = pathParts(path);
			const dir = await folder(parts.slice(0, -1), true);
			const out = await (await dir.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
			try {
				await out.write(data as Uint8Array<ArrayBuffer>);
				await out.close();
			} catch (error) {
				// Abort drops the browser's temporary copy, leaving the previous file in place.
				await out.abort().catch(() => {});
				throw error;
			}
		},
		async remove(path) {
			const parts = pathParts(path);
			await (await folder(parts.slice(0, -1), false)).removeEntry(parts.at(-1)!);
		}
	};
}
