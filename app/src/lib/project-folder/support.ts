// Whether this browser can write into a folder the user picks. Firefox, Safari and every iOS browser cannot (they lack the
// File System Access API); Brave can once its flag is on, so it gets an optional hint instead of silence.

export type FolderSupport = 'supported' | 'brave-disabled' | 'unsupported';

/** Brave's switch for the API; pages cannot open brave:// links, so the hint shows it for copying. */
export const BRAVE_FLAG = 'brave://flags/#file-system-access-api';

interface Env {
	isSecureContext?: boolean;
	self?: unknown;
	top?: unknown;
	showDirectoryPicker?: unknown;
	FileSystemHandle?: { prototype?: { queryPermission?: unknown; requestPermission?: unknown } };
	navigator?: { brave?: { isBrave?: () => Promise<boolean> }; locks?: unknown };
}

export async function folderSupport(env: Env = globalThis as Env): Promise<FolderSupport> {
	try {
		// Pickers refuse insecure pages and cross-origin frames.
		if (!env.isSecureContext || env.self !== env.top) return 'unsupported';
		const handle = env.FileSystemHandle?.prototype;
		if (
			typeof env.showDirectoryPicker === 'function' &&
			typeof handle?.queryPermission === 'function' &&
			typeof handle?.requestPermission === 'function' &&
			// Tabs publishing into one folder take turns through Web Locks; without them two could write at once.
			!!env.navigator?.locks
		)
			return 'supported';
		const brave = env.navigator?.brave;
		if (typeof brave?.isBrave === 'function' && (await brave.isBrave())) return 'brave-disabled';
	} catch (error) {
		console.warn('Could not check project folder support', error);
	}
	return 'unsupported';
}
