// The only Cloud Save code in the startup bundle: decide whether to load the rest (client.ts) at all, and clear Cloud
// Save's own data with Delete local work.
/** Sync's own IndexedDB database (core/store.ts). */
export const SYNC_DATABASE = 'pixeldoll-sync';

/** Set while this device is connected, so startup can skip loading sync code for everyone else. A hint only: the
 *  sign-in itself lives in IndexedDB "pixeldoll-sync". */
export const CONNECTED_HINT = 'pixeldoll.cloudSave';

function connectedHint() {
	try {
		return localStorage.getItem(CONNECTED_HINT) === '1';
	} catch {
		return false;
	}
}

/** A provider just sent the browser back from its sign-in page. */
const returningFromSignIn = (url: URL) =>
	url.searchParams.has('state') && (url.searchParams.has('code') || url.searchParams.has('error'));

/** Load and start Cloud Save after first paint, only when this device is connected or a sign-in is finishing: sync code
 *  is never part of the first load. */
export function startCloudSave() {
	if (!connectedHint() && !returningFromSignIn(new URL(location.href))) return;
	requestAnimationFrame(() =>
		setTimeout(() =>
			import('./client.ts')
				.then((client) => client.start())
				.catch((error) => console.error('Cloud Save could not start', error))
		)
	);
}

/** Delete local work also removes this device's sign-in and sync state: the next connect starts like a new device. */
export function deleteSyncData(): Promise<void> {
	try {
		localStorage.removeItem(CONNECTED_HINT);
	} catch {
		// Storage blocked: the hint was never set.
	}
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(SYNC_DATABASE);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		// An open connection closes itself on versionchange (store.ts), so a block only delays the deletion.
		request.onblocked = () => resolve();
	});
}

/** Set by the Studio: whether a character may be written now (it is not open with edits still waiting to be saved), what
 *  to refresh after sync wrote characters, and whether Cloud Save needs the user (a quiet cue on the Settings opener). */
export const studioHooks = {
	mayWrite: (_id: string) => true,
	applied: (_ids: string[]) => {},
	attention: (_needed: boolean) => {}
};
