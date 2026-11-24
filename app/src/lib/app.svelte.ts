// App-wide UI state: API key (memory by default, localStorage only when opted in) and the /balance snapshot.
import { rememberDebugKey } from './debug/log.ts';
import { api, ApiError } from './pixellab/client.ts';
import type { Balance } from './pixellab/routes.ts';
import { queue } from './pixellab/queue.ts';
import type { ActivityContext } from './pixellab/activity.ts';
import { SAVED_KEY, readForgetMarker, readSavedKey, watchSharedAuth } from './shared-auth.ts';
import { workspaceCopy } from './store/workspace-mode.ts';

const clearSavedKey = () => {
	try {
		localStorage.removeItem(SAVED_KEY);
	} catch {}
};

let keyRevision = 0;
export const getKeyRevision = () => keyRevision;
const stored = workspaceCopy ? '' : readSavedKey();
rememberDebugKey(stored);
export const app = $state({
	key: stored,
	remembered: !!stored,
	keyRejected: false,
	balance: null as Balance | null,
	balanceError: '',
	balanceAt: 0
});
if (!workspaceCopy) queue.setKey(stored);
// A credential-free Forget signal from another tab also clears this tab. Typed credentials are never shared (queue.ts).
queue.subscribe(() => {
	if (queue.key === app.key) return;
	keyRevision++;
	Object.assign(app, {
		key: queue.key,
		keyRejected: false,
		balance: null,
		balanceError: '',
		balanceAt: 0,
		...(!queue.key ? { remembered: false } : {})
	});
});

const sharedAuth = watchSharedAuth(
	() => clearLocalKey(),
	() => {
		if (!app.remembered) return; // a session-only key remains local; future apps can read the saved key on load
		const saved = readSavedKey();
		if (saved === app.key) return;
		if (!saved) clearLocalKey();
		else app.remembered = false; // keep this account in memory; never silently run its paid work with another key
	}
);
import.meta.hot?.dispose(() => sharedAuth.close());

function installKey(key: string, remember: boolean) {
	sharedAuth.acknowledge(); // a fresh connection supersedes any already-persisted Forget notification
	keyRevision++;
	app.key = key.trim();
	rememberDebugKey(app.key);
	app.keyRejected = false;
	app.balance = null; // never show another key's balance
	app.balanceError = '';
	app.balanceAt = 0;
	app.remembered = false;
	if (!workspaceCopy) {
		try {
			if (remember && app.key) {
				localStorage.setItem(SAVED_KEY, app.key);
				app.remembered = true;
			} else clearSavedKey();
		} catch {
			clearSavedKey();
		}
		sharedAuth.changed();
	}
	queue.setKey(app.key);
}

export function setKey(key: string, remember: boolean, activity?: ActivityContext) {
	installKey(key, remember);
	return refreshBalance(activity);
}

export async function replaceKey(
	key: string,
	remember: boolean,
	isCurrent: () => boolean,
	activity: ActivityContext
) {
	const candidate = key.trim();
	const revision = keyRevision;
	const savedKey = workspaceCopy ? '' : readSavedKey();
	const forgetMarker = readForgetMarker();
	const balance = await readBalance(candidate, activity);
	if (
		!isCurrent() ||
		revision !== keyRevision ||
		(!workspaceCopy && savedKey !== readSavedKey()) ||
		forgetMarker !== readForgetMarker()
	)
		return false;
	installKey(candidate, remember);
	applyBalance(balance, candidate);
	return true;
}

export function forgetKey() {
	if (!workspaceCopy) clearSavedKey();
	clearLocalKey();
	if (!workspaceCopy) sharedAuth.forget();
}

// A remote notification must never delete a newer saved credential written by another app.
function clearLocalKey() {
	keyRevision++;
	app.key = '';
	app.remembered = false;
	app.balance = null;
	app.balanceError = '';
	app.keyRejected = false;
	app.balanceAt = 0;
	queue.setKey('', false);
}

function readBalance(key: string, activity?: ActivityContext) {
	return api<Balance>(key, 'GET', '/balance', undefined, undefined, activity);
}

function applyBalance(balance: Balance, key: string) {
	app.balance = balance;
	queue.setBalance(balance, key);
	app.balanceError = '';
	app.balanceAt = Date.now();
}

export async function refreshBalance(activity?: ActivityContext | Event) {
	if (!app.key) return;
	const key = app.key,
		revision = keyRevision;
	try {
		const balance = await readBalance(
			key,
			activity instanceof Event ? { label: 'Refresh balance', background: false } : activity
		);
		if (revision !== keyRevision || key !== app.key) return;
		applyBalance(balance, key);
	} catch (e) {
		if (revision !== keyRevision || key !== app.key) return;
		app.balanceError = (e as Error).message;
		if (e instanceof ApiError && e.kind === 'auth') app.keyRejected = true;
	}
}
