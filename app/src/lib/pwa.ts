import { flushSync } from 'svelte';
import { get, writable } from 'svelte/store';
import { errorText, errorTranslation, LocalizedError, message, type Message } from './message.ts';

export interface Release {
	build: string;
	version: string;
	commit: string;
}

export function readRelease(value: unknown): Release {
	const r = value as Partial<Release> | null;
	if (
		!r ||
		typeof r.build !== 'string' ||
		!/^[a-zA-Z0-9-]{8,80}$/.test(r.build) ||
		typeof r.version !== 'string' ||
		!/^\d+\.\d+\.\d+$/.test(r.version) ||
		typeof r.commit !== 'string' ||
		!/^[a-f0-9]{7,40}$/.test(r.commit)
	)
		throw new LocalizedError('The update description is invalid.', 'pwa.invalidRelease');
	return { build: r.build, version: r.version, commit: r.commit };
}

export function workerMessage(
	worker: ServiceWorker,
	type: string,
	build?: string
): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const channel = new MessageChannel();
		const done = (error?: Error, value?: Record<string, unknown>) => {
			clearTimeout(timer);
			channel.port1.close();
			if (error) reject(error);
			else resolve(value!);
		};
		const timer = setTimeout(
			() => done(new LocalizedError('The update did not respond. Try again.', 'pwa.noResponse')),
			15_000
		);
		channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
			if (!data || typeof data !== 'object')
				return done(new LocalizedError('The update response is invalid.', 'pwa.invalidResponse'));
			const reply = data as Record<string, unknown>;
			done(typeof reply.error === 'string' ? new Error(reply.error) : undefined, reply);
		};
		try {
			worker.postMessage({ type, build, clientBuild: __APP_BUILD__ }, [channel.port2]);
		} catch (e) {
			done(e as Error);
		}
	});
}

export function bounded<T>(promise: Promise<T>, timeout: Error): Promise<T> {
	let timer: ReturnType<typeof setTimeout>;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(timeout), 15_000);
		})
	]).finally(() => clearTimeout(timer));
}

export async function fetchRelease(base: URL): Promise<Release> {
	const discovery = new URL('release.json', base);
	discovery.searchParams.set('check', String(Date.now()));
	const response = await fetch(discovery, {
		cache: 'no-store',
		credentials: 'omit',
		redirect: 'error',
		signal: AbortSignal.timeout(12_000)
	});
	if (!response.ok)
		throw new LocalizedError(`Update check failed (${response.status}).`, 'pwa.checkFailed', {
			status: response.status
		});
	return readRelease(await response.json());
}

export function waitForWorker(
	worker: ServiceWorker,
	ready: () => boolean,
	timeout: Error
): Promise<void> {
	return new Promise((resolve, reject) => {
		const finish = (error?: Error) => {
			clearTimeout(timer);
			worker.removeEventListener('statechange', changed);
			if (error) reject(error);
			else resolve();
		};
		const changed = () => {
			if (worker.state === 'redundant')
				finish(
					new LocalizedError(
						'The update was replaced or could not be downloaded. Try again.',
						'pwa.replaced'
					)
				);
			else if (ready()) finish();
		};
		const timer = setTimeout(() => finish(timeout), 15_000);
		worker.addEventListener('statechange', changed);
		changed();
	});
}

/** A PWA problem; a list holds the failures of one update check, which resumes by itself. */
export type PwaError = Message | string | (Message | string)[];
/** Translation-free: the UI formats these (studio/pwaText.ts), so this module stays testable without the i18n runtime. */
const errorMessage = (error: unknown): Message | string =>
	errorTranslation(error) ?? errorText(error);

interface InstallPrompt extends Event {
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface InstallCapture {
	readonly prompt: InstallPrompt | undefined;
	readonly installed: boolean | undefined;
	take(): InstallPrompt | undefined;
	subscribe(listener: () => void): () => void;
}
declare global {
	interface Window {
		__pixeldollInstall?: InstallCapture;
	}
}
export const pwa = writable({
	enabled: false,
	checking: false,
	discovery: 'idle' as 'idle' | 'checked' | 'failed',
	stagingFailed: false,
	available: null as Release | null,
	ready: false,
	reloading: false,
	offlineReady: false,
	error: '' as PwaError,
	installable: false,
	installed: false,
	installing: false,
	installError: '' as Message | string
});
let registration: ServiceWorkerRegistration | undefined;
let latest: Release | null = null;
let verifiedWorker: ServiceWorker | undefined;
let inspection:
	{ worker: ServiceWorker; build: string | undefined; result: Promise<void> } | undefined;
type UpdateSource = 'about';
let updateAction: ((source?: UpdateSource) => void) | undefined;
let installHelp: (() => void) | undefined;
let checking: Promise<void> | undefined;
let checkAgain = false;
let stopped = true;
let base: URL;
let registerWorker: (() => Promise<void>) | undefined;
let offlineLocale = 'en';
let localeSelectedAt = Date.now();

export function setOfflineLocale(locale: string, explicit = false) {
	if (!explicit && locale === offlineLocale) return;
	offlineLocale = locale;
	localeSelectedAt = Math.max(Date.now(), localeSelectedAt + 1);
	cacheActiveLocale();
}

function cacheLocale(worker: ServiceWorker | null | undefined) {
	if (stopped || !worker || worker.state === 'redundant') return;
	try {
		worker.postMessage({
			type: 'CACHE_LOCALE',
			locale: offlineLocale,
			selectedAt: localeSelectedAt,
			online: navigator.onLine && (worker.state === 'installed' || worker.state === 'activated')
		});
	} catch (error) {
		console.warn('PixelDoll could not request an offline language:', error);
	}
}

function cacheActiveLocale() {
	cacheLocale(registration?.active);
	cacheLocale(registration?.waiting ?? registration?.installing);
}

const preferredWorker = () => registration?.waiting ?? registration?.active;

function forgetVerifiedWorker() {
	verifiedWorker?.removeEventListener('statechange', invalidateVerifiedWorker);
	verifiedWorker = undefined;
}

function invalidateVerifiedWorker() {
	if (verifiedWorker === preferredWorker() && verifiedWorker?.state !== 'redundant') return;
	forgetVerifiedWorker();
	pwa.update((s) => ({ ...s, ready: false }));
}

function inspectWorker(): Promise<void> {
	if (stopped) return Promise.resolve();
	if (verifiedWorker) invalidateVerifiedWorker();
	const worker = preferredWorker();
	if (!worker || worker.state === 'redundant') return Promise.resolve();
	const build = latest?.build;
	// A wake and a lifecycle event can land together. Only one reads the same worker for this deployment.
	if (inspection?.worker === worker && inspection.build === build) return inspection.result;
	const result = inspectRelease(worker, build).finally(() => {
		if (inspection?.result === result) inspection = undefined;
	});
	inspection = { worker, build, result };
	return result;
}

async function inspectRelease(worker: ServiceWorker, build: string | undefined) {
	const targetStillPreferred = () =>
		!stopped && worker === preferredWorker() && worker.state !== 'redundant';
	let release: Release;
	try {
		release = readRelease(await workerMessage(worker, 'GET_RELEASE'));
	} catch (error) {
		// A replaced worker can stop responding while a newer worker has already passed verification.
		if (!targetStillPreferred() || latest?.build !== build) return;
		if (build && build === get(pwa).available?.build) {
			if (worker === verifiedWorker) forgetVerifiedWorker();
			pwa.update((s) => ({ ...s, ready: false, stagingFailed: true }));
		}
		throw error;
	}
	const relevant = () =>
		!stopped &&
		(release.build === __APP_BUILD__ ||
			(release.build === build && build === latest?.build && targetStillPreferred()));
	if (!relevant()) return;
	try {
		const check = await workerMessage(worker, 'VERIFY', release.build);
		if (!relevant()) return;
		if (check.ready !== true)
			throw new LocalizedError('The downloaded app is incomplete.', 'pwa.downloadIncomplete');
		if (release.build === __APP_BUILD__) pwa.update((s) => ({ ...s, offlineReady: true }));
		if (worker === preferredWorker()) cacheLocale(worker);
	} catch (e) {
		if (!relevant()) return;
		if (worker === verifiedWorker) forgetVerifiedWorker();
		pwa.update((s) => ({
			...s,
			...(release.build === __APP_BUILD__
				? { offlineReady: false }
				: { ready: false, stagingFailed: true }),
			error: errorMessage(e)
		}));
		throw e;
	}
	if (latest && release.build === latest.build && release.build !== __APP_BUILD__) {
		forgetVerifiedWorker();
		verifiedWorker = worker;
		worker.addEventListener('statechange', invalidateVerifiedWorker);
		pwa.update((s) => ({ ...s, available: release, ready: true, stagingFailed: false, error: '' }));
	}
}

/** A bounded foreground poll plus wake/reconnect events. Never gates discovery on successful staging. */
export function checkForUpdate(): Promise<void> {
	if (stopped) return Promise.resolve();
	if (checking) {
		checkAgain = true;
		return checking;
	}
	checking = (async () => {
		pwa.update((s) => ({ ...s, checking: true }));
		do {
			checkAgain = false;
			let stagingFailed = false;
			const failures: (Message | string)[] = [];
			// Discover first: stalled browser operations and cache/quota failures cannot hide newer deployments.
			try {
				latest = await fetchRelease(base);
				if (stopped) return;
				const available = latest.build === __APP_BUILD__ ? null : latest;
				pwa.update((s) => ({
					...s,
					discovery: 'checked',
					available,
					ready: available?.build === s.available?.build && s.ready,
					stagingFailed: available?.build === s.available?.build && s.stagingFailed,
					error: ''
				}));
			} catch (e) {
				if (stopped) return;
				pwa.update((s) => ({ ...s, discovery: 'failed' }));
				failures.push(errorMessage(e));
			}
			const target = latest;
			try {
				if (
					!registration?.active &&
					!registration?.waiting &&
					!registration?.installing &&
					registerWorker
				)
					await bounded(
						registerWorker(),
						new LocalizedError('Offline setup did not respond.', 'pwa.setupNoResponse')
					);
			} catch (e) {
				stagingFailed = true;
				failures.push(message('pwa.setupFailed', { reason: errorMessage(e) }));
			}
			const inspect = () =>
				inspectWorker().catch((e) => {
					failures.push(errorMessage(e));
				});
			// The old cache may need a slow repair. Its health check must not delay staging or verifying the new release.
			const update = async () => {
				if (!registration) return;
				try {
					await bounded(
						registration.update(),
						new LocalizedError(
							'The browser update check did not respond.',
							'pwa.browserCheckNoResponse'
						)
					);
				} catch (e) {
					stagingFailed = true;
					failures.push(errorMessage(e));
				}
				await inspect();
			};
			await Promise.all([inspect(), update()]);
			if (!stopped && failures.length)
				pwa.update((s) => ({
					...s,
					stagingFailed:
						s.stagingFailed ||
						(stagingFailed && !!target && s.available?.build === target.build && !s.ready),
					error: [...new Map(failures.map((f) => [JSON.stringify(f), f])).values()]
				}));
		} while (checkAgain && !stopped);
	})().finally(() => {
		checking = undefined;
		if (!stopped) pwa.update((s) => ({ ...s, checking: false }));
	});
	return checking;
}

export function setPwaActions(update: (source?: UpdateSource) => void, help: () => void) {
	updateAction = update;
	installHelp = help;
	return () => {
		updateAction = undefined;
		installHelp = undefined;
	};
}
export function requestUpdate(source?: UpdateSource) {
	updateAction?.(source);
}
export function requestInstallHelp() {
	installHelp?.();
}
export async function installApp() {
	const state = get(pwa);
	if (state.installed || state.installing) return false;
	const event = window.__pixeldollInstall?.take();
	if (!event) {
		requestInstallHelp();
		return false;
	}
	pwa.update((s) => ({ ...s, installable: false, installing: true, installError: '' }));
	try {
		await event.prompt();
		await event.userChoice;
		return true;
	} catch (e) {
		pwa.update((s) => ({
			...s,
			installError: message('pwa.installFailed', { reason: errorMessage(e) })
		}));
		requestInstallHelp();
		return false;
	} finally {
		pwa.update((s) => ({ ...s, installing: false }));
	}
}

export function startPwa() {
	if (!import.meta.env.PROD || !('serviceWorker' in navigator) || !window.isSecureContext)
		return () => {};
	stopped = false;
	base = new URL(import.meta.env.BASE_URL, document.baseURI);
	const capture = window.__pixeldollInstall;
	const syncInstalled = () =>
		pwa.update((s) => {
			const installed = capture?.installed === true;
			const installable = !installed && !!capture?.prompt;
			return {
				...s,
				installed,
				installable,
				...(installed || installable ? { installError: '' } : {})
			};
		});
	const wake = () => {
		if (document.visibilityState === 'visible') void checkForUpdate();
	};
	const reconnect = () => {
		cacheActiveLocale();
		wake();
	};
	const onController = () => {
		void inspectWorker().catch((e) => pwa.update((s) => ({ ...s, error: errorMessage(e) })));
	};
	let stopWatchingWorker: (() => void) | undefined;
	const watch = () => {
		const worker = registration?.installing;
		if (!worker) return;
		stopWatchingWorker?.();
		if (get(pwa).stagingFailed) pwa.update((s) => ({ ...s, stagingFailed: false }));
		cacheLocale(worker);
		const changed = () => {
			if (worker.state === 'installed' || worker.state === 'activated') onController();
			if (worker.state === 'redundant' && !stopped)
				pwa.update((s) => ({
					...s,
					stagingFailed: !!s.available && !s.ready,
					error: message('pwa.saveFailed')
				}));
		};
		worker.addEventListener('statechange', changed);
		stopWatchingWorker = () => worker.removeEventListener('statechange', changed);
	};
	pwa.update((s) => ({ ...s, enabled: true }));
	syncInstalled();
	const stopInstall = capture?.subscribe(syncInstalled);
	if (!capture)
		pwa.update((s) => ({
			...s,
			installError: message('pwa.installUnavailable')
		}));
	addEventListener('focus', wake);
	addEventListener('online', reconnect);
	addEventListener('pageshow', wake);
	document.addEventListener('visibilitychange', wake);
	navigator.serviceWorker.addEventListener('controllerchange', onController);
	registerWorker = async () => {
		const script = new URL('sw.js', base);
		const existing = await navigator.serviceWorker.getRegistration(base.href);
		const owned =
			existing?.scope === base.href &&
			[existing.active, existing.waiting, existing.installing].some(
				(worker) => worker?.scriptURL === script.href
			);
		const r = owned
			? existing!
			: await navigator.serviceWorker.register(script, {
					scope: base.pathname,
					updateViaCache: 'none'
				});
		if (stopped) return;
		registration?.removeEventListener('updatefound', watch);
		registration = r;
		cacheActiveLocale();
		r.addEventListener('updatefound', watch);
		watch();
	};
	void checkForUpdate();
	const interval = setInterval(wake, 60 * 60_000);
	return () => {
		stopped = true;
		stopWatchingWorker?.();
		forgetVerifiedWorker();
		pwa.update((s) => ({ ...s, enabled: false, checking: false }));
		registerWorker = undefined;
		clearInterval(interval);
		registration?.removeEventListener('updatefound', watch);
		stopInstall?.();
		removeEventListener('focus', wake);
		removeEventListener('online', reconnect);
		removeEventListener('pageshow', wake);
		document.removeEventListener('visibilitychange', wake);
		navigator.serviceWorker.removeEventListener('controllerchange', onController);
	};
}

interface StartupUpdate {
	validate: () => void;
	beforeReload: () => void;
}

export async function applyUpdate(prepare: () => Promise<void>, automatic?: StartupUpdate) {
	await activateUpdate(prepare, automatic, () => {
		automatic?.beforeReload();
		try {
			pwa.update((s) => ({ ...s, reloading: true }));
			flushSync();
			location.reload();
		} catch (error) {
			pwa.update((s) => ({ ...s, reloading: false }));
			throw error;
		}
	});
}

/** The existing Studio stays open. Verify the active worker that will serve the next navigation. */
export async function prepareUpdateInNewTab() {
	await activateUpdate();
	return base.href;
}

async function activateUpdate(
	prepare?: () => Promise<void>,
	automatic?: StartupUpdate,
	commitReload?: () => void
) {
	const target = get(pwa).available;
	if (!target || !registration) throw new LocalizedError('No update is ready yet.', 'pwa.notReady');
	const validate = () => {
		automatic?.validate();
		if (get(pwa).available?.build !== target.build || !get(pwa).ready)
			throw new LocalizedError(
				'The available update changed or is still downloading. Review the current version and try again.',
				'pwa.targetChanged'
			);
	};
	// An unresponsive save must leave the current tab open and let the user try the separate-tab update.
	const prepareToReload = () =>
		prepare &&
		bounded(
			prepare(),
			new LocalizedError(
				'Saving your work took too long. Open the update in a new tab to keep your work open.',
				'pwa.saveTimeout'
			)
		);
	validate();
	await prepareToReload();
	validate();
	// Startup discovery just verified this target. Do not enqueue another entire discovery/staging pass while it
	// finishes; that can consume the automatic opportunity. Explicit updates refresh an older notice first.
	if (!automatic) await checkForUpdate();
	validate();
	const worker = registration.waiting ?? registration.active;
	if (!worker || readRelease(await workerMessage(worker, 'GET_RELEASE')).build !== target.build)
		throw new LocalizedError('The update changed. Try again.', 'pwa.changed');
	validate();
	try {
		const verified = await workerMessage(worker, 'VERIFY', target.build);
		if (verified.ready !== true)
			throw new LocalizedError(
				'The update is incomplete. Reconnect and try again.',
				'pwa.incomplete'
			);
	} catch (error) {
		if (worker === preferredWorker() && get(pwa).available?.build === target.build) {
			forgetVerifiedWorker();
			pwa.update((s) => ({ ...s, ready: false, stagingFailed: true, error: errorMessage(error) }));
		}
		throw error;
	}
	validate();
	await prepareToReload();
	validate();
	if (worker === registration.waiting) {
		await workerMessage(worker, 'ACTIVATE', target.build);
		validate();
		await waitForWorker(
			worker,
			() => worker.state === 'activated',
			new LocalizedError('The update could not activate. Try again.', 'pwa.activateFailed')
		);
		validate();
	}
	// First-time/uncontrolled tabs use the active worker on their next navigation.
	const servingWorker = () =>
		(prepare ? navigator.serviceWorker.controller : null) ?? registration?.active;
	const active = servingWorker();
	if (!active || readRelease(await workerMessage(active, 'GET_RELEASE')).build !== target.build)
		throw new LocalizedError(
			'Another version activated. Review the update and try again.',
			'pwa.otherVersion'
		);
	validate();
	await prepareToReload();
	validate();
	if (active !== servingWorker() || active.state === 'redundant')
		throw new LocalizedError(
			'Another version activated. Review the update and try again.',
			'pwa.otherVersion'
		);
	commitReload?.();
}
