// The debug/ folder of a debugging backup (Settings > Library, Developer mode): what failed, in what order and in what
// state, beside the characters the backup already carries. Everything passes sanitize(), and the finished files are checked
// for the PixelLab keys once more. Restoring a backup ignores this folder (backup.ts).
import { get } from 'svelte/store';
import { app } from '../app.svelte.ts';
import { apiActivity } from '../pixellab/activity.ts';
import { queue } from '../pixellab/queue.ts';
import { browserEnvironment } from '../report/report.ts';
import { readDebugSnapshot, getBlob } from '../store/db.ts';
import { RETAINED_ARCHIVE_PREFIX } from '../store/incompatible.ts';
import { artworkRefs, studioCharacter } from '../store/workspace.ts';
import type { StoredProject } from '../store/project.ts';
import { debugKeys, readDebugLog, debugTab } from './log.ts';
import { keyForms, sanitize, type Json } from './sanitize.ts';
import { DEBUG_FOLDER } from './flags.ts';

const DEBUG_FORMAT = 1;
/** Artwork only drafts, jobs and debug fields refer to, packed beside the JSON up to this many bytes. */
const DEBUG_ARTWORK_BYTES = 16 * 1024 * 1024;
const HEX = /\b(?:sha256:)?([a-f0-9]{64})\b/g;
/** Character fields every backup leaves out (workspace.ts), kept here for diagnosis. */
const BACKUP_STRIPPED = [
	'creationSpec',
	'moveRecovery',
	'moveReviews',
	'stateGenerations',
	'appearanceEdits'
] as const;

export interface DebugContext {
	/** Every PixelLab key this tab knows: the connected and the remembered one. */
	keys: readonly string[];
	locale: string;
	preRelease: boolean;
	/** What the Studio holds in memory: screen, sheet, open character and unsaved edits. */
	studio: Record<string, unknown>;
}

export class DebugKeyError extends Error {
	constructor() {
		super('A debugging file still contained a PixelLab key.');
	}
}

const README = `PixelDoll debugging details
===========================
Written by Library backup while Developer mode and "Include debugging details" were on. Restoring this backup ignores
this folder. PixelLab keys, inline image data and URL queries were removed; prompts, names and IDs were kept.

index.json        Format, build, when and where it was written, and what each file holds or left out.
environment.json  Browser, device, screen, storage, service worker, locks and feature support.
state.json        The open tab's Studio state (screen, sheet, open character with unsaved edits), connection and queue.
log.json          Errors, warnings and shown problems from every tab while this setting was on, plus this tab's newest.
activity.json     This tab's PixelLab requests and downloads since it opened (bodies without image data).
jobs.json         The saved job ledger: every queued, running, failed and finished paid request.
records.json      Saved records that are not characters (drafts, creation and move forms, setup, export settings, demo
                  outfit) and the character fields a normal backup leaves out (creationSpec, moveRecovery, moveReviews,
                  stateGenerations, appearanceEdits).
storage.json      PixelDoll's local and session storage settings; other keys of this site by name and size only.
artwork.json      Every stored image: hash, size, type and where it is. "character": a saved character uses it, so
                  blobs/<hash> holds it unless it failed verification; "debug": debug/blobs/<hash>; "device only".
blobs/<hash>      Images that only drafts, jobs or the fields above refer to.
`;

async function environment(context: DebugContext) {
	const nav = navigator as Navigator & {
		deviceMemory?: number;
		connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
	};
	const settle = async <T>(work: () => Promise<T> | T) => {
		try {
			return await work();
		} catch (error) {
			return { failed: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
		}
	};
	const registration = await settle(() => navigator.serviceWorker?.getRegistration());
	const worker = (w: ServiceWorker | null | undefined) =>
		w ? { scriptURL: w.scriptURL, state: w.state } : null;
	return {
		report: browserEnvironment(context.locale, context.preRelease),
		url: `${location.origin}${location.pathname}${location.search}${location.hash}`,
		timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		languages: navigator.languages,
		devicePixelRatio,
		online: navigator.onLine,
		visibility: document.visibilityState,
		standalone: matchMedia('(display-mode: standalone)').matches,
		colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
		reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
		hardwareConcurrency: navigator.hardwareConcurrency,
		deviceMemory: nav.deviceMemory ?? null,
		connection: nav.connection
			? {
					effectiveType: nav.connection.effectiveType,
					downlink: nav.connection.downlink,
					saveData: nav.connection.saveData
				}
			: null,
		storage: {
			estimate: await settle(() => navigator.storage?.estimate()),
			persisted: await settle(() => navigator.storage?.persisted())
		},
		serviceWorker: {
			controller: worker(navigator.serviceWorker?.controller),
			registration:
				registration && 'scope' in registration
					? {
							scope: registration.scope,
							active: worker(registration.active),
							waiting: worker(registration.waiting),
							installing: worker(registration.installing)
						}
					: (registration ?? null)
		},
		locks: await settle(async () => {
			const state = await navigator.locks?.query();
			return state
				? {
						held: state.held?.map((lock) => ({ name: lock.name, mode: lock.mode })),
						pending: state.pending?.map((lock) => ({ name: lock.name, mode: lock.mode }))
					}
				: null;
		}),
		features: {
			indexedDB: typeof indexedDB !== 'undefined',
			locks: 'locks' in navigator,
			broadcastChannel: typeof BroadcastChannel !== 'undefined',
			serviceWorker: 'serviceWorker' in navigator,
			offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
			createImageBitmap: typeof createImageBitmap !== 'undefined',
			compressionStream: typeof CompressionStream !== 'undefined',
			clipboardWrite: typeof navigator.clipboard?.write === 'function',
			webgl2: await settle(() => !!document.createElement('canvas').getContext('webgl2')),
			modelContext: 'modelContext' in document || 'modelContext' in navigator,
			secureContext: isSecureContext,
			crossOriginIsolated
		}
	};
}

/** PixelDoll's own settings with their values; anything else on this origin (other apps may keep credentials there) by
 *  name and size only. */
function storageArea(area: () => Storage) {
	const out: Record<string, string> = {};
	try {
		const storage = area();
		for (let index = 0; index < storage.length; index++) {
			const key = storage.key(index);
			if (key === null) continue;
			const value = storage.getItem(key) ?? '';
			out[key] = key.startsWith('pixeldoll.')
				? value
				: `[not PixelDoll's: ${value.length} characters]`;
		}
	} catch (error) {
		out['(unreadable)'] = error instanceof Error ? error.message : String(error);
	}
	return out;
}

/** The debug/ files for a backup. */
export async function debugFiles(
	context: DebugContext
): Promise<{ name: string; data: Uint8Array }[]> {
	const forms = keyForms([...context.keys, ...debugKeys()]);
	const clean = (value: unknown) => sanitize(value, forms);
	const snapshot = await readDebugSnapshot();
	const characters = new Set<string>();
	const records: Record<string, unknown> = {};
	for (const [key, value] of snapshot.projects) {
		if (key.startsWith(RETAINED_ARCHIVE_PREFIX)) {
			records[key] = '[kept incompatible data, carried in the backup itself]';
		} else if (studioCharacter(key, value)) {
			const record = value as StoredProject & Record<string, unknown>;
			const fields = Object.fromEntries(
				BACKUP_STRIPPED.filter((field) => record[field] !== undefined).map((field) => [
					field,
					record[field]
				])
			);
			records[key] = { character: true, savedAt: record.savedAt, ...fields };
			try {
				for (const [hash] of artworkRefs(record.manifest)) {
					const hex = typeof hash === 'string' && /([a-f0-9]{64})$/.exec(hash)?.[1];
					if (hex) characters.add(hex);
				}
			} catch (error) {
				records[key] = { ...(records[key] as object), unreadableManifest: String(error) };
			}
		} else records[key] = value;
	}
	const { entries: log, kept } = await readDebugLog();
	const json: Record<string, Json> = {
		'environment.json': clean(await environment(context)),
		'state.json': clean({
			studio: context.studio,
			connection: {
				connected: !!app.key,
				remembered: app.remembered,
				keyRejected: app.keyRejected,
				balance: app.balance,
				balanceError: app.balanceError,
				balanceAt: app.balanceAt
			},
			queue: queue.snapshot()
		}),
		'log.json': clean(log),
		'activity.json': clean(get(apiActivity)),
		'jobs.json': clean(snapshot.jobs),
		'records.json': clean(records),
		'storage.json': clean({
			local: storageArea(() => localStorage),
			session: storageArea(() => sessionStorage)
		})
	};

	// Images that drafts, jobs and debug fields name but the backup does not carry.
	const stored = new Map(snapshot.blobs.map((blob) => [blob.hash, blob]));
	const named = new Set<string>();
	for (const name of ['records.json', 'jobs.json', 'state.json', 'activity.json'])
		for (const match of JSON.stringify(json[name]).matchAll(HEX))
			if (stored.has(match[1]) && !characters.has(match[1])) named.add(match[1]);
	const artwork: { name: string; data: Uint8Array }[] = [];
	let artworkBytes = 0;
	let artworkLeftOut = 0;
	for (const hash of named) {
		const size = stored.get(hash)!.size;
		if (artworkBytes + size > DEBUG_ARTWORK_BYTES) {
			artworkLeftOut++;
			continue;
		}
		const blob = await getBlob(hash);
		if (!(blob instanceof Blob)) continue;
		artworkBytes += blob.size;
		artwork.push({
			name: `${DEBUG_FOLDER}blobs/${hash}`,
			data: new Uint8Array(await blob.arrayBuffer())
		});
	}
	const carried = new Set(artwork.map((file) => file.name.slice(-64)));
	json['artwork.json'] = snapshot.blobs.map((blob) => ({
		...blob,
		in: characters.has(blob.hash) ? 'character' : carried.has(blob.hash) ? 'debug' : 'device only'
	}));
	json['index.json'] = {
		format: DEBUG_FORMAT,
		writtenAt: new Date().toISOString(),
		build: `${__APP_VERSION__} (${__APP_COMMIT__})`,
		tab: debugTab,
		counts: {
			log: log.length,
			activity: get(apiActivity).length,
			jobs: snapshot.jobs.length,
			records: Object.keys(records).length,
			storedImages: snapshot.blobs.length,
			debugImages: artwork.length
		},
		leftOut: {
			...(!kept && { keptLog: 'the kept log could not be read; only this tab is included' }),
			...(artworkLeftOut && {
				debugImages: `${artworkLeftOut} image(s) over the ${DEBUG_ARTWORK_BYTES / 1024 / 1024} MB limit`
			})
		}
	};

	const encoder = new TextEncoder();
	const files = [
		{ name: `${DEBUG_FOLDER}README.txt`, data: encoder.encode(README) },
		...Object.entries(json).map(([name, value]) => ({
			name: `${DEBUG_FOLDER}${name}`,
			data: encoder.encode(JSON.stringify(value, null, 1))
		}))
	];
	for (const file of files) {
		const text = new TextDecoder().decode(file.data);
		if (forms.some((form) => text.includes(form))) throw new DebugKeyError();
	}
	return [...files, ...artwork];
}
