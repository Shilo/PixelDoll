// The only thing the sync engine knows about a cloud: a flat, path-addressed folder it owns. Paths are relative to the
// app's root folder ("PixelDoll/" on Google Drive, the app folder on Dropbox), use only lowercase hex, digits, dots,
// dashes and slashes, and are never renamed or appended to. Every file is either immutable (named by its content) or
// written by exactly one device, so no method needs compare-and-swap.

export interface Entry {
	/** Relative path, e.g. "devices/abc.json". */
	path: string;
	size: number;
	/** Changes whenever the file's content changes (Drive md5Checksum or version, Dropbox rev). */
	etag: string;
}

export interface Provider {
	readonly kind: ProviderKind;
	/** Files directly inside folder `prefix` ("" for the root, otherwise ending in "/"), every page. A missing folder is
	 *  empty, not an error. Subfolders are not listed. */
	list(prefix: string): Promise<Entry[]>;
	/** The whole file, or null when it does not exist. */
	get(path: string): Promise<Uint8Array | null>;
	/** Create or replace the file, creating missing folders. */
	put(path: string, bytes: Uint8Array): Promise<Entry>;
	/** Delete one file; a missing file is not an error. */
	del(path: string): Promise<void>;
	/** Delete the whole cloud copy (the root folder and everything in it). Only "Delete cloud copy" calls this. */
	destroy(): Promise<void>;
}

export type ProviderKind = 'google' | 'dropbox' | 'sim';

/** What went wrong, as the user can act on it. Every adapter maps its provider's errors onto these codes. */
export type SyncErrorCode =
	/** No network, or the provider could not be reached after retries: try again later by itself. */
	| 'offline'
	/** The sign-in is gone (revoked, expired, refresh refused): the user must connect again. */
	| 'reconnect'
	/** The user's cloud storage is full. */
	| 'cloud-full'
	/** The cloud copy was made by a newer PixelDoll (or is not a PixelDoll folder): update this device. */
	| 'update'
	/** The cloud folder this device used is gone (trashed by the user): ask before rebuilding it, never read it as deletes. */
	| 'missing'
	/** Anything else, with the provider's message. */
	| 'failed';

export class SyncError extends Error {
	readonly code: SyncErrorCode;
	constructor(code: SyncErrorCode, message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'SyncError';
		this.code = code;
	}
}

/** Supplies a valid access token; `refresh` asks for a new one after the provider rejected the last. Throws
 *  SyncError('reconnect') when the sign-in can no longer be renewed. */
export type TokenSource = (refresh?: boolean) => Promise<string>;
