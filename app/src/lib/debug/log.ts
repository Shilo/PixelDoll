// The debug log: console errors and warnings, uncaught errors and rejections, and the warnings and errors the app shows,
// recorded from the first module on so a debugging backup can say what went wrong and in what order. This tab's entries
// always stay in memory; while debugging backups are on (flags.ts) they are also kept in their own IndexedDB database, so
// they survive the reload that usually follows a failure and include other tabs. Every key this tab has seen is removed as
// each entry is recorded, and the backup removes the keys it knows again, so a key replaced in between never reaches a
// file. A failure of the log itself is noted in memory only: logging it to the console would record it again.
import { debugBackupEnabled } from './flags.ts';
import { keyForms, scrubText, SECRET_FIELD } from './sanitize.ts';

export interface DebugEntry {
	/** `tab:sequence`, unique across tabs and reloads. */
	id: string;
	at: number;
	tab: string;
	level: 'error' | 'warn' | 'info';
	source: string;
	message: string;
	stack?: string;
}

const MEMORY = 500;
const KEPT = 2000;
const TRIM_SLACK = 200;
const FIELD = 8000;
const DB = 'pixeldoll-debug';
const STORE = 'log';
const tab = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
let sequence = 0;
const memory: DebugEntry[] = [];
let pending: DebugEntry[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let installed = false;

export const debugTab = tab;

const seenKeys = new Set<string>();
/** Note a PixelLab key this tab connects with, so later entries and backups remove it even after it is replaced. */
export function rememberDebugKey(key: string) {
	if (key) seenKeys.add(key);
}
/** Every key this tab has seen; app.svelte.ts reports the remembered one at startup and each new connection. */
export const debugKeys = () => [...seenKeys];

function text(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value instanceof Error) return `${value.name}: ${value.message}`;
	try {
		const json = JSON.stringify(value, (key, entry: unknown) =>
			SECRET_FIELD.test(key) && typeof entry === 'string' && entry
				? '[redacted]'
				: entry instanceof Error
					? { name: entry.name, message: entry.message }
					: entry
		);
		return json ?? String(value);
	} catch {
		return String(value);
	}
}
const clip = (value: string) => (value.length > FIELD ? `${value.slice(0, FIELD)}…` : value);

/** Record one entry. Never throws. */
export function recordDebug(
	level: DebugEntry['level'],
	source: string,
	parts: readonly unknown[]
): void {
	try {
		const error = parts.find((part): part is Error => part instanceof Error);
		const forms = keyForms(debugKeys());
		const entry: DebugEntry = {
			id: `${tab}:${++sequence}`,
			at: Date.now(),
			tab,
			level,
			source,
			message: clip(scrubText(parts.map(text).join(' '), forms)),
			...(error?.stack && { stack: clip(scrubText(error.stack, forms)) })
		};
		memory.push(entry);
		if (memory.length > MEMORY) memory.splice(0, memory.length - MEMORY);
		if (!debugBackupEnabled()) return;
		if (pending.length < MEMORY) pending.push(entry);
		flushTimer ??= setTimeout(() => void flush(), 1000);
	} catch {
		// Recording must never break the caller, least of all console.error.
	}
}

/** Start recording. Call once, as early as possible, in a live (not workspace copy) top-level tab. */
export function installDebugLog(): void {
	if (installed) return;
	installed = true;
	for (const level of ['error', 'warn'] as const) {
		const native = console[level].bind(console);
		console[level] = (...args: unknown[]) => {
			native(...args);
			recordDebug(level, 'console', args);
		};
	}
	addEventListener('error', (event) =>
		recordDebug('error', 'uncaught', [
			event.error ?? event.message,
			event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : ''
		])
	);
	addEventListener('unhandledrejection', (event) =>
		recordDebug('error', 'unhandled rejection', [event.reason])
	);
	recordDebug('info', 'page', [`opened ${location.pathname}${location.hash}`, navigator.userAgent]);
}

let database: Promise<IDBDatabase> | undefined;
function open() {
	database ??= new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
		request.onsuccess = () => {
			request.result.onversionchange = () => {
				request.result.close();
				database = undefined;
			};
			resolve(request.result);
		};
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error('debug log database blocked'));
	});
	database.catch(() => (database = undefined));
	return database;
}

const done = (transaction: IDBTransaction) =>
	new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = transaction.onabort = () => reject(transaction.error);
	});

let logFailure = '';
async function flush() {
	flushTimer = undefined;
	const batch = pending;
	pending = [];
	// Turned off since these were queued: keep nothing.
	if (!batch.length || !debugBackupEnabled()) return;
	try {
		const db = await open();
		// Another tab may have turned it off while the database opened.
		if (!debugBackupEnabled()) return;
		const transaction = db.transaction(STORE, 'readwrite');
		const store = transaction.objectStore(STORE);
		for (const entry of batch) store.put(entry);
		// Keep the newest entries, trimming only once well past the limit: ids are not ordered, so trim by time.
		const count = store.count();
		count.onsuccess = () => {
			if (count.result <= KEPT + TRIM_SLACK) return;
			const all = store.getAll();
			all.onsuccess = () => {
				const entries = all.result as DebugEntry[];
				entries.sort((left, right) => left.at - right.at);
				for (const old of entries.slice(0, entries.length - KEPT)) store.delete(old.id);
			};
		};
		await done(transaction);
	} catch (error) {
		const reason = text(error);
		if (reason !== logFailure) {
			logFailure = reason;
			memory.push({
				id: `${tab}:${++sequence}`,
				at: Date.now(),
				tab,
				level: 'warn',
				source: 'debug log',
				message: `could not keep the debug log: ${reason}`
			});
		}
	}
}

/** Kept entries from every tab plus this tab's newest, oldest first. `kept` is false when the database could not be read. */
export async function readDebugLog(): Promise<{ entries: DebugEntry[]; kept: boolean }> {
	if (flushTimer) {
		clearTimeout(flushTimer);
		await flush();
	}
	const byId = new Map<string, DebugEntry>();
	let kept = false;
	try {
		const db = await open();
		const transaction = db.transaction(STORE, 'readonly');
		const all = transaction.objectStore(STORE).getAll();
		await done(transaction);
		for (const entry of all.result as DebugEntry[]) byId.set(entry.id, entry);
		kept = true;
	} catch (error) {
		recordDebug('warn', 'debug log', [`could not read the kept debug log: ${text(error)}`]);
	}
	for (const entry of memory) byId.set(entry.id, entry);
	return { entries: [...byId.values()].sort((left, right) => left.at - right.at), kept };
}

/** Forget every kept entry, for Delete local work. */
export async function clearDebugLog(): Promise<void> {
	memory.length = 0;
	pending = [];
	const db = await database?.catch(() => undefined);
	db?.close();
	database = undefined;
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DB);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
		request.onblocked = () => resolve();
	});
}
