// Cloud Save in a running app: the connection, one syncing tab per browser (Web Lock "pixeldoll-sync"), the triggers,
// and the actions Settings offers. Loaded only by dynamic import (connection.ts decides when).
import {
	completeSignIn,
	revokeEverywhere,
	signInUrl,
	stripCallback,
	tokenSource
} from './auth/auth.ts';
import type { AuthKV, Credentials, SignInProvider } from './auth/auth.ts';
import { Engine, type ConflictNote, type Status } from './core/engine.ts';
import { IndexedSyncStore, MemoryStore } from './core/store.ts';
import { pixeldollLibrary } from './pixeldoll.ts';
import { Dropbox } from './providers/dropbox.ts';
import { GoogleDrive } from './providers/google-drive.ts';
import { SimProvider } from './providers/sim.ts';
import { SyncError, type Provider } from './providers/types.ts';
import { unzip } from '../store/zip.ts';
import { projectWrites } from '../store/db.ts';
import { CONNECTED_HINT, studioHooks } from './connection.ts';

export interface CloudState {
	provider?: SignInProvider;
	email?: string;
	/** 'local': not connected. */
	status: Status | 'local';
	/** What went wrong, for 'failed' (provider text) and sign-in errors. */
	error?: string;
	syncedAt?: number;
	conflicts: number;
}

const INTERVAL_MS = 60_000;
const AFTER_SAVE_MS = 3_000;
const store = new IndexedSyncStore();
const kv: AuthKV = {
	get: (key) => store.get('kv', `auth:${key}`),
	set: (key, value) => store.put('kv', `auth:${key}`, value),
	delete: (key) => store.del('kv', `auth:${key}`)
};
const channel =
	typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('pixeldoll:sync');

let state: CloudState = { status: 'local', conflicts: 0 };
const listeners = new Set<(state: CloudState) => void>();
/** Svelte store contract: `$cloudSave` in components. */
export const cloudSave = {
	subscribe(listener: (state: CloudState) => void) {
		listeners.add(listener);
		listener(state);
		return () => listeners.delete(listener);
	}
};
/** Connected states the user has to act on. */
const ATTENTION = new Set<CloudState['status']>([
	'reconnect',
	'conflict',
	'cloud-full',
	'failed',
	'update',
	'missing'
]);
function publish(next: Partial<CloudState>, broadcast = true) {
	state = { ...state, ...next };
	studioHooks.attention(!!state.provider && (ATTENTION.has(state.status) || state.conflicts > 0));
	for (const listener of listeners) listener(state);
	if (broadcast) channel?.postMessage({ state });
}

let engine: Engine | undefined;
let provider: Provider | undefined;
let leader = false;
let running: Promise<unknown> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | undefined;
let applying = 0;

const credentials = () => store.get<Credentials>('kv', 'credentials');

function hint(connected: boolean) {
	try {
		if (connected) localStorage.setItem(CONNECTED_HINT, '1');
		else localStorage.removeItem(CONNECTED_HINT);
	} catch {
		// Storage blocked: the app then only finds the connection when Settings opens Cloud Save.
	}
}

function providerFor(c: Credentials): Provider {
	const token = tokenSource(c);
	return c.provider === 'google' ? new GoogleDrive(token) : new Dropbox(token);
}

/** Run engine work one at a time: in this tab, and across tabs (Resolve in one tab while another syncs), because
 *  every engine call reads and rewrites the same stored state. */
function serial<T>(work: () => Promise<T>): Promise<T> {
	const locked = () =>
		globalThis.navigator?.locks
			? (navigator.locks.request('pixeldoll-sync-state', work) as Promise<T>)
			: work();
	const next = running.then(locked, locked);
	running = next.catch(() => undefined);
	return next;
}

async function refreshConflicts() {
	if (engine) publish({ conflicts: [...(await engine.conflicts()).values()].flat().length });
}

/** One sync now in the syncing tab; other tabs ask it to. */
export function syncNow(): Promise<unknown> {
	clearTimeout(timer);
	if (!leader) {
		channel?.postMessage({ request: true });
		return Promise.resolve();
	}
	return serial(async () => {
		if (!engine) return;
		publish({ status: 'syncing' });
		try {
			const status = await engine.sync();
			publish({
				status,
				error: engine.error,
				...(status === 'synced' || status === 'conflict' ? { syncedAt: Date.now() } : {})
			});
			await refreshConflicts();
		} finally {
			schedule(INTERVAL_MS);
		}
	});
}

function schedule(ms: number) {
	clearTimeout(timer);
	if (engine && document.visibilityState === 'visible')
		timer = setTimeout(() => void syncNow(), ms);
}

/** One syncing tab per browser: the lock passes to another tab when this one closes. */
let leading = false;
function lead() {
	if (leading) return;
	leading = true;
	if (globalThis.navigator?.locks)
		void navigator.locks.request('pixeldoll-sync', () => {
			leader = true;
			void syncNow();
			return new Promise<void>(() => {});
		});
	else {
		leader = true;
		void syncNow();
	}
}

let started = false;
/** Called once per page: finishes a sign-in that just returned, then syncs if connected. */
export async function start() {
	if (started) return;
	started = true;
	// Listen first: a tab that is not connected still follows another tab that connects.
	channel?.addEventListener('message', ({ data }) => {
		if (data?.state && !leader) publish(data.state, false);
		if (data?.request && leader) void syncNow();
		if (data?.connected !== undefined) void reload();
	});
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void syncNow();
		else clearTimeout(timer);
	});
	addEventListener('online', () => void syncNow());
	projectWrites.addEventListener('write', () => {
		if (!applying) schedule(AFTER_SAVE_MS);
	});
	await finishSignIn();
	// AI-agent automation only (`npm run dev:agent`): connect with a test account's token from the .env when a script set
	// localStorage 'pixeldoll.agentSync' to google or dropbox. Statically false in every build.
	if (import.meta.env.DEV && import.meta.env.MODE === 'agent' && !(await credentials())) {
		let wanted: string | null = null;
		try {
			wanted = localStorage.getItem('pixeldoll.agentSync');
		} catch {
			// Optional storage unavailable: no agent connection.
		}
		if (wanted) {
			const response = await fetch(
				`/__dev/sync-credentials?provider=${encodeURIComponent(wanted)}`,
				{
					cache: 'no-store'
				}
			);
			if (response.ok) await store.put('kv', 'credentials', await response.json());
		}
	}
	const saved = await credentials();
	if (!saved) {
		hint(false);
		return;
	}
	await connectEngine(saved);
	lead();
}

/** The library sync writes through: its own writes do not schedule another sync, the user's writes meanwhile do. */
const library = {
	...pixeldollLibrary,
	async apply(...args: Parameters<typeof pixeldollLibrary.apply>) {
		applying++;
		try {
			return await pixeldollLibrary.apply(...args);
		} finally {
			applying--;
		}
	}
};

async function connectEngine(saved: Credentials) {
	provider = providerFor(saved);
	engine = new Engine(store, provider, library, {
		account: `${saved.provider}:${saved.email ?? ''}`
	});
	hint(true);
	publish({ provider: saved.provider, email: saved.email, status: 'idle' }, false);
	await refreshConflicts();
}

/** Another tab connected or disconnected: follow it. */
async function reload() {
	const saved = await credentials();
	if (saved) {
		await connectEngine(saved);
		lead();
	} else {
		engine = provider = undefined;
		hint(false);
		publish({ provider: undefined, email: undefined, status: 'local', conflicts: 0 }, false);
	}
}

async function finishSignIn() {
	const url = new URL(location.href);
	if (!url.searchParams.has('state')) return;
	history.replaceState(history.state, '', stripCallback(url).href);
	try {
		const signedIn = await completeSignIn(url, kv);
		if (!signedIn) return;
		await store.put('kv', 'credentials', signedIn);
		channel?.postMessage({ connected: true });
	} catch (error) {
		publish(
			{ status: 'failed', error: error instanceof Error ? error.message : String(error) },
			false
		);
	}
}

// ---- actions ----

export async function connect(kind: SignInProvider) {
	location.assign(await signInUrl(kind, kv));
}

async function forget() {
	clearTimeout(timer);
	await store.del('kv', 'credentials');
	engine = provider = undefined;
	hint(false);
	publish({
		provider: undefined,
		email: undefined,
		status: 'local',
		error: undefined,
		conflicts: 0
	});
	channel?.postMessage({ connected: false });
}

/** This device stops syncing; the cloud copy and other devices are untouched. */
export const disconnect = () => serial(forget);

/** Google only: ends the sign-in on every device (Google revokes the whole grant). */
export const disconnectEverywhere = () =>
	serial(async () => {
		const saved = await credentials();
		if (saved) await revokeEverywhere(saved);
		await forget();
	});

/** Delete the whole cloud copy and disconnect. Local work stays. */
export const deleteCloudCopy = () =>
	serial(async () => {
		if (!provider) return;
		await provider.destroy();
		await store.del('kv', 'state');
		await forget();
	});

/** The cloud folder vanished and the user agreed to rebuild it from this device. */
export const rebuild = () =>
	serial(async () => {
		await engine?.rebuild();
	}).then(syncNow);

export const conflicts = () =>
	serial(async () => (engine ? engine.conflicts() : new Map<string, ConflictNote[]>()));

export const resolve = (
	record: string,
	note: ConflictNote,
	keep: 'live' | 'other',
	body?: unknown
) =>
	serial(async () => {
		const done = !!engine && (await engine.resolve(record, note, keep, body));
		await refreshConflicts();
		return done;
	}).then((done) => {
		if (done) schedule(AFTER_SAVE_MS);
		return done;
	});

/** A character as it syncs now (device-local fields stripped), to build a resolved body from. */
export const characterBody = async (record: string) =>
	(await pixeldollLibrary.read()).bodies.get(record);

export const versions = (record: string) =>
	serial(async () => (engine ? engine.history(record) : []));

export const restoreVersion = (record: string, rev: string) =>
	serial(async () => !!engine && (await engine.restore(record, rev))).then((done) => {
		if (done) schedule(AFTER_SAVE_MS);
		return done;
	});

/** Read a downloaded copy of the cloud folder (ZIPs from the provider's website) into the library. Nothing is written to
 *  the folder; a connected device then syncs the result as usual. Returns how many characters were added. */
export async function importFolder(zips: Uint8Array[]): Promise<number> {
	const folder = new SimProvider();
	for (const bytes of zips)
		for (const [name, data] of await unzip(bytes)) {
			// Provider downloads wrap the files in the folder's name ("PixelDoll/devices/…").
			const path = name.replace(
				/^(?:[^/]*\/)?(?=pixeldoll-sync\.json$|devices\/|revs\/|objects\/|packs\/)/,
				''
			);
			folder.files.set(path, { bytes: data, etag: path });
		}
	if (!folder.files.has('pixeldoll-sync.json'))
		throw new SyncError('failed', 'This is not a downloaded Cloud Save folder.');
	// Only characters this device does not have are added: the import has no shared history with local work, so a merge
	// could pick its side without keeping the other.
	let applied = 0;
	const counting = {
		...pixeldollLibrary,
		apply: async (...args: Parameters<typeof pixeldollLibrary.apply>) => {
			const [, expected, next] = args;
			if (expected !== undefined || next === undefined) return false;
			const done = await pixeldollLibrary.apply(...args);
			if (done) applied++;
			return done;
		}
	};
	const reader = new Engine(new MemoryStore(), folder, counting, { writes: false });
	const status = await reader.sync();
	if (status !== 'synced' && status !== 'conflict')
		// The engine's own explanation, never the bare status name.
		throw new SyncError(status === 'update' ? 'update' : 'failed', reader.error ?? status);
	if (engine) schedule(AFTER_SAVE_MS);
	return applied;
}
