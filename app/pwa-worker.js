/* RELEASE and FILES are injected by pwa-build.ts. This worker caches shipped bytes only, never user data or requests. */
const SCOPE = self.registration.scope;
const PREFIX = `pixeldoll-static:${SCOPE}:`;
const CACHE = PREFIX + RELEASE.build;
const PARTIAL_PREFIX = `pixeldoll-partial:${SCOPE}:`;
const PARTIAL = PARTIAL_PREFIX + RELEASE.build;
const META = `pixeldoll-meta:${SCOPE}`;
const ACTIVE = new URL('.pwa-meta/active', SCOPE).href;
const LANGUAGE = new URL('.pwa-meta/language', SCOPE).href;
const PENDING = new URL('.pwa-meta/pending/', SCOPE).href;
const METADATA_LOCK = `pixeldoll-cache-metadata:${SCOPE}`;
const FILE_URLS = FILES.map((file) => ({ ...file, url: new URL(file.path, SCOPE).href }));
const CURRENT_FILES = new Map(FILE_URLS.map((file) => [file.url, file]));
const REQUIRED_FILES = FILE_URLS.filter((file) => !file.locale);
const LOCALES = new Map(FILE_URLS.filter((file) => file.locale).map((file) => [file.locale, file]));
const localeDownloads = new Map();
const INDEX = new URL(`index.html?pd-build=${encodeURIComponent(RELEASE.build)}`, SCOPE).href;

const leaseUrl = (id) => new URL(`.pwa-meta/client/${encodeURIComponent(id)}`, SCOPE).href;
const pendingUrl = (id) => PENDING + encodeURIComponent(id);
function metadataChange(change) {
	const locks = self.navigator?.locks;
	// Without Web Locks collection is disabled below, so these conservative records can still be written safely.
	return locks?.request ? locks.request(METADATA_LOCK, change) : change();
}
async function rememberClient(event) {
	const client = event.source,
		build = event.data?.clientBuild;
	if (
		!client?.id ||
		!client.url?.startsWith(SCOPE) ||
		typeof build !== 'string' ||
		!/^[a-zA-Z0-9-]{1,80}$/.test(build)
	)
		return;
	await metadataChange(async () => {
		const meta = await caches.open(META);
		await meta.put(leaseUrl(client.id), new Response(build));
		if ((await (await meta.match(pendingUrl(client.id)))?.text()) === build)
			await meta.delete(pendingUrl(client.id));
	});
}

async function retireUnusedReleases() {
	if (!self.navigator?.locks?.request) return;
	return metadataChange(async () => {
		const meta = await caches.open(META);
		const previous = await (await meta.match(ACTIVE))?.text();
		const keep = new Set([CACHE, ...(previous ? [PREFIX + previous] : [])]);
		const windows = (
			await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
		).filter((client) => client.url.startsWith(SCOPE));
		let known = true;
		for (const client of windows) {
			const build = client.id && (await (await meta.match(leaseUrl(client.id)))?.text());
			if (!build) {
				known = false;
				break;
			}
			keep.add(PREFIX + build);
		}
		const records = await meta.keys();
		// Reserved navigation clients are absent from matchAll until their document can execute. Their pins have no expiry.
		for (const request of records)
			if (request.url.startsWith(PENDING)) {
				const build = await (await meta.match(request))?.text();
				if (!build || !/^[a-zA-Z0-9-]{1,80}$/.test(build))
					throw new Error('Recovery file ownership is unavailable; existing files were retained.');
				keep.add(PREFIX + build);
			}
		await meta.put(ACTIVE, new Response(RELEASE.build));
		// Only activation retires caches: the platform then evicts BFCache pages whose controller became redundant.
		// Frozen live windows retain durable leases. Unknown windows and a concurrent install conservatively defer cleanup.
		// Keep the previous active build too, covering navigations that began just before controller replacement.
		if (!known || self.registration.installing || self.registration.waiting) return;
		for (const name of await caches.keys()) {
			if (self.registration.installing || self.registration.waiting) return;
			if (name.startsWith(PREFIX) && !keep.has(name)) await caches.delete(name);
			if (name.startsWith(PARTIAL_PREFIX)) await caches.delete(name);
		}
		const live = new Set(windows.map((client) => leaseUrl(client.id)));
		for (const request of await meta.keys())
			if (
				request.url !== ACTIVE &&
				request.url !== LANGUAGE &&
				!request.url.startsWith(PENDING) &&
				!live.has(request.url)
			)
				await meta.delete(request);
	});
}

async function pinNavigation(id, build) {
	// A browser without a resulting client ID gets a conservative pin that cannot be acknowledged or timed out.
	const clientId = id || `unidentified-${build}`;
	await metadataChange(async () => {
		await (await caches.open(META)).put(pendingUrl(clientId), new Response(build));
	});
	return clientId;
}

async function cancelNavigationPin(id, build) {
	await metadataChange(async () => {
		const meta = await caches.open(META);
		if ((await (await meta.match(pendingUrl(id)))?.text()) === build)
			await meta.delete(pendingUrl(id));
	});
}

async function digest(bytes) {
	return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) =>
		byte.toString(16).padStart(2, '0')
	).join('');
}

/** Reads the body once and returns a factory for responses holding exactly the verified bytes. Never answer with a clone's
 * twin: Chromium streams that body through this worker, so a worker the browser stops before the page has read it fails
 * the request, and a failed startup module left PixelDoll on its opening message. */
async function verified(response, file) {
	if (!response?.ok) return undefined;
	const bytes = await response.arrayBuffer();
	if ((await digest(bytes)) !== file.hash) return undefined;
	const { status, statusText, headers } = response;
	return () => new Response(bytes, { status, statusText, headers });
}

async function currentResponse(file, repair = true) {
	const cache = await caches.open(CACHE);
	const stored = await verified(await cache.match(file.url), file);
	if (stored) return stored();
	if (!repair) throw new Error('The downloaded update is incomplete. Reconnect and try again.');
	// A public URL can now belong to a later deployment. Only this worker's exact bytes can repair its release.
	if (!file.locale) return (await download(file, cache))();
	if (!localeDownloads.has(file.url)) {
		localeDownloads.set(
			file.url,
			loadLocale(file, cache).finally(() => localeDownloads.delete(file.url))
		);
	}
	return (await localeDownloads.get(file.url))();
}

async function loadLocale(file, cache) {
	const stored = await retainedFile(file, await caches.keys());
	if (!stored) return download(file, cache);
	await saveDownload(file, cache, stored);
	return stored;
}

async function retainedFile(file, names) {
	for (const name of names) {
		if (!name.startsWith(PREFIX) || name === CACHE) continue;
		const url = new URL(file.url);
		if (url.searchParams.has('pd-build'))
			url.searchParams.set('pd-build', name.slice(PREFIX.length));
		const stored = await verified(await (await caches.open(name)).match(url.href), file);
		if (stored) return stored;
	}
}

function timedSignal(milliseconds, parent) {
	const controller = new AbortController();
	const abort = () => controller.abort(parent.reason);
	if (parent?.aborted) abort();
	else parent?.addEventListener('abort', abort, { once: true });
	const timer = setTimeout(
		() => controller.abort(new DOMException('The offline download timed out.', 'TimeoutError')),
		milliseconds
	);
	return {
		signal: controller.signal,
		clear() {
			clearTimeout(timer);
			parent?.removeEventListener('abort', abort);
		}
	};
}

async function download(file, cache, installationSignal) {
	const deadline = timedSignal(installationSignal ? 120_000 : 20_000, installationSignal);
	const request = async (cacheMode) =>
		verified(
			await fetch(file.url, {
				cache: cacheMode,
				credentials: 'omit',
				redirect: 'error',
				signal: deadline.signal
			}),
			file
		);
	let downloaded;
	try {
		if (file.path.startsWith('assets/')) downloaded = await request('force-cache');
		if (!downloaded) downloaded = await request('no-store');
		if (deadline.signal.aborted) throw deadline.signal.reason;
	} catch (error) {
		throw deadline.signal.aborted ? deadline.signal.reason : error;
	} finally {
		deadline.clear();
	}
	if (!downloaded)
		throw new Error(
			installationSignal
				? 'PWA release bytes did not match this build'
				: 'The downloaded update is incomplete. Reconnect and try again.'
		);
	await saveDownload(file, cache, downloaded);
	return downloaded;
}

async function saveDownload(file, cache, downloaded) {
	try {
		await cache.put(file.url, downloaded());
	} catch (error) {
		if (!file.locale) throw error;
		console.warn('PixelDoll could not save a language for offline use:', error);
	}
}

async function verify(repair = true) {
	for (const file of REQUIRED_FILES) {
		await currentResponse(file, repair);
	}
	return true;
}

async function savePartial(cache) {
	const requests = await cache.keys();
	if (!requests.length) return;
	const partial = await caches.open(PARTIAL);
	for (const request of requests) {
		const response = await cache.match(request);
		if (response) await partial.put(request, response);
	}
}

async function prepareLanguage(cache) {
	if (!(await caches.keys()).includes(META)) return;
	const meta = await caches.open(META);
	const preference = await (await meta.match(LANGUAGE))?.json();
	const file = LOCALES.get(preference?.locale);
	if (!file || (await verified(await cache.match(file.url), file))) return;
	const deadline = timedSignal(10_000);
	try {
		const retained = await retainedFile(file, await caches.keys());
		if (retained) await saveDownload(file, cache, retained);
		else await download(file, cache, deadline.signal);
	} finally {
		deadline.clear();
	}
}

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			const cancel = new AbortController();
			const deadline = timedSignal(180_000, cancel.signal);
			const installSignal = deadline.signal;
			const required = REQUIRED_FILES.values();
			let failure;
			try {
				const names = await caches.keys();
				const partial = names.includes(PARTIAL) ? await caches.open(PARTIAL) : undefined;
				// A failed deployment or a CDN serving mixed releases must never replace the last complete offline app.
				await Promise.all(
					Array.from({ length: 4 }, async () => {
						for (const file of required) {
							if (installSignal.aborted) return;
							try {
								const saved =
									(await verified(await partial?.match(file.url), file)) ??
									(await retainedFile(file, names));
								if (installSignal.aborted) return;
								if (saved) await saveDownload(file, cache, saved);
								else await download(file, cache, installSignal);
							} catch (error) {
								if (!installSignal.aborted) {
									failure = error;
									cancel.abort();
								}
								return;
							}
						}
					})
				);
				if (cancel.signal.aborted) throw failure;
				if (installSignal.aborted) throw installSignal.reason;
				await verify(false);
				if (installSignal.aborted) throw installSignal.reason;
				if (partial) await caches.delete(PARTIAL);
			} catch (error) {
				try {
					await savePartial(cache);
				} catch (backupError) {
					console.warn('PixelDoll could not retain offline download progress:', backupError);
				}
				await caches.delete(CACHE);
				throw error;
			} finally {
				deadline.clear();
			}
			try {
				await prepareLanguage(cache);
			} catch (error) {
				console.warn('PixelDoll could not prepare a language for offline use:', error);
			}
			// Updates wait for an explicit action. Automatically activating can interrupt a paid request or an unsaved form.
		})()
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Cleanup is optional. A failed ownership read/write must retain old files, never fail an otherwise valid activation.
			try {
				await retireUnusedReleases();
			} catch (error) {
				console.error('PixelDoll cache cleanup deferred:', error);
			}
			// Do not claim uncontrolled documents or reload any page.
		})()
	);
});

self.addEventListener('message', (event) => {
	const message = event.data;
	if (message?.type === 'CACHE_LOCALE') {
		const file = LOCALES.get(message.locale);
		if (
			(file || message.locale === 'en') &&
			Number.isFinite(message.selectedAt) &&
			event.source?.url?.startsWith(SCOPE)
		)
			event.waitUntil(
				(async () => {
					await metadataChange(async () => {
						const meta = await caches.open(META);
						const previous = await (await meta.match(LANGUAGE))?.json();
						if (previous && previous.selectedAt >= message.selectedAt) return;
						await meta.put(
							LANGUAGE,
							new Response(
								JSON.stringify({ locale: message.locale, selectedAt: message.selectedAt })
							)
						);
					});
					if (file && message.online !== false) await currentResponse(file);
				})().catch((error) => {
					console.warn('PixelDoll could not prepare a language for offline use:', error);
				})
			);
		return;
	}
	const port = event.ports[0];
	if (!port) return;
	event.waitUntil(
		(async () => {
			try {
				await rememberClient(event);
				if (message?.type === 'GET_RELEASE') port.postMessage(RELEASE);
				else if (
					message?.type === 'VERIFY' ||
					message?.type === 'ACTIVATE' ||
					message?.type === 'GET_SHELL'
				) {
					if (message.build !== RELEASE.build)
						throw new Error('The available update changed. Please try again.');
					await verify();
					if (message.type === 'ACTIVATE') await self.skipWaiting();
					const html =
						message.type === 'GET_SHELL'
							? await (await currentResponse(CURRENT_FILES.get(INDEX))).text()
							: undefined;
					port.postMessage({ ...RELEASE, ready: true, ...(html === undefined ? {} : { html }) });
				}
			} catch (error) {
				port.postMessage({
					error: error instanceof Error ? error.message : 'The update could not be verified.'
				});
			}
		})()
	);
});

function bounded(promise, milliseconds) {
	let timer;
	return Promise.race([
		promise,
		new Promise((_, reject) => {
			timer = setTimeout(
				() => reject(new Error('The app download timed out. Reconnect and reload.')),
				milliseconds
			);
		})
	]).finally(() => clearTimeout(timer));
}

function askWorker(worker, message) {
	const channel = new MessageChannel();
	return bounded(
		new Promise((resolve, reject) => {
			channel.port1.onmessage = (event) => {
				const reply = event.data;
				if (!reply || typeof reply !== 'object')
					reject(new Error('The downloaded app response is invalid.'));
				else if (typeof reply.error === 'string') reject(new Error(reply.error));
				else resolve(reply);
			};
			worker.postMessage(message, [channel.port2]);
		}),
		20_000
	).finally(() => channel.port1.close());
}

function installed(worker) {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => finish(new Error('The new app files are still downloading. Reconnect and reload.')),
			20_000
		);
		function finish(error) {
			clearTimeout(timer);
			worker.removeEventListener('statechange', changed);
			if (error) reject(error);
			else resolve();
		}
		function changed() {
			if (worker.state === 'redundant')
				finish(new Error('The new app files could not be downloaded.'));
			else if (worker.state !== 'installing') finish();
		}
		worker.addEventListener('statechange', changed);
		changed();
	});
}

function validRelease(value) {
	return (
		typeof value?.build === 'string' &&
		/^[a-zA-Z0-9-]{8,80}$/.test(value.build) &&
		typeof value.version === 'string' &&
		/^\d+\.\d+\.\d+$/.test(value.version) &&
		typeof value.commit === 'string' &&
		/^[a-f0-9]{7,40}$/.test(value.commit)
	);
}

async function candidateNavigation(candidate, reservedClientId) {
	if (!candidate || candidate.scriptURL !== new URL('sw.js', SCOPE).href)
		throw new Error('No verified app update is available.');
	const release = await askWorker(candidate, { type: 'GET_RELEASE' });
	if (!validRelease(release) || release.build === RELEASE.build)
		throw new Error('No complete newer app files are available.');
	const pinnedClient = await pinNavigation(reservedClientId, release.build);
	try {
		// The pin precedes readback, but no lock spans this RPC: the candidate may itself be activating.
		// Its compiled inventory verifies the full closure. Never infer readiness from an orphan cache name.
		const reply = await askWorker(candidate, { type: 'GET_SHELL', build: release.build });
		if (
			reply.build !== release.build ||
			reply.version !== release.version ||
			reply.commit !== release.commit ||
			reply.ready !== true ||
			typeof reply.html !== 'string'
		)
			throw new Error('The new app files could not be verified.');
		return new Response(reply.html, {
			headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
		});
	} catch (error) {
		await cancelNavigationPin(pinnedClient, release.build);
		throw error;
	}
}

async function availableNavigation(reservedClientId) {
	for (const candidate of new Set(
		[self.registration.waiting, self.registration.active].filter(Boolean)
	)) {
		try {
			return await candidateNavigation(candidate, reservedClientId);
		} catch (error) {
			console.warn('PixelDoll cached app recovery unavailable:', error);
		}
	}
	return null;
}

/** A navigation has no running form to preserve. It may use a fully verified newer shell without activating it for other tabs. */
async function recoveredNavigation(reservedClientId) {
	// A complete waiting release already works offline; discovering another deployment must not gate that recovery.
	const cached = await availableNavigation(reservedClientId);
	if (cached) return cached;
	await bounded(self.registration.update(), 20_000);
	if (self.registration.installing) await installed(self.registration.installing);
	const downloaded = await availableNavigation(reservedClientId);
	if (downloaded) return downloaded;
	throw new Error('No complete app files are available. Reconnect and reload.');
}

async function staticResponse(request) {
	const current = CURRENT_FILES.get(request.url);
	if (current) {
		try {
			return await currentResponse(current);
		} catch {
			return new Response(
				'This app resource could not be verified. Reconnect and reload PixelDoll.',
				{ status: 503 }
			);
		}
	}
	const own = await caches.open(CACHE);
	const match = await own.match(request);
	if (match) return match;
	for (const name of await caches.keys()) {
		if (!name.startsWith(PREFIX) || name === CACHE) continue;
		const response = await (await caches.open(name)).match(request);
		if (response) return response;
	}
	// Fetching an old public path from today's deploy would silently substitute another release's bytes.
	if (new URL(request.url).searchParams.has('pd-build'))
		return new Response('This app resource is unavailable. Reconnect and reload PixelDoll.', {
			status: 503
		});
	return fetch(request);
}

self.addEventListener('fetch', (event) => {
	const request = event.request,
		url = new URL(request.url);
	if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
	const path = url.pathname.slice(new URL(SCOPE).pathname.length);
	// This retired page can still exist under a revisioned URL in an older release cache.
	if (path === 'update.html') {
		event.respondWith(fetch(request, { cache: 'no-store' }));
	} else if (request.mode === 'navigate' && (path === '' || path === 'index.html')) {
		event.respondWith(
			(async () => {
				try {
					return await currentResponse(CURRENT_FILES.get(INDEX));
				} catch {
					try {
						return await recoveredNavigation(event.resultingClientId);
					} catch {
						return new Response(
							'PixelDoll could not verify its app files. Reconnect and reload. If this continues while connected, close every PixelDoll tab and reopen the app.',
							{ status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }
						);
					}
				}
			})()
		);
	} else if (path.startsWith('assets/') || url.searchParams.has('pd-build')) {
		event.respondWith(staticResponse(request));
	}
	// All other URLs, including release.json, PixelLab API/CDNs and dev endpoints, use the browser network unchanged.
});
