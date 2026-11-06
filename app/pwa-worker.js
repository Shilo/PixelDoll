/* RELEASE and FILES are injected by pwa-build.ts. This worker caches shipped bytes only, never user data or requests. */
const SCOPE = self.registration.scope;
const PREFIX = `pixeldoll-static:${SCOPE}:`;
const CACHE = PREFIX + RELEASE.build;
const META = `pixeldoll-meta:${SCOPE}`;
const ACTIVE = new URL('.pwa-meta/active', SCOPE).href;
const PENDING = new URL('.pwa-meta/pending/', SCOPE).href;
const METADATA_LOCK = `pixeldoll-cache-metadata:${SCOPE}`;
const FILE_URLS = FILES.map(file => ({ url: new URL(file.path, SCOPE).href, hash: file.hash }));
const CURRENT_FILES = new Map(FILE_URLS.map(file => [file.url, file]));
const INDEX = new URL(`index.html?pd-build=${encodeURIComponent(RELEASE.build)}`, SCOPE).href;

const leaseUrl = id => new URL(`.pwa-meta/client/${encodeURIComponent(id)}`, SCOPE).href;
const pendingUrl = id => PENDING + encodeURIComponent(id);
function metadataChange(change) {
  const locks = self.navigator?.locks;
  // Without Web Locks collection is disabled below, so these conservative records can still be written safely.
  return locks?.request ? locks.request(METADATA_LOCK, change) : change();
}
async function rememberClient(event) {
  const client = event.source, build = event.data?.clientBuild;
  if (!client?.id || !client.url?.startsWith(SCOPE) || typeof build !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(build)) return;
  await metadataChange(async () => {
    const meta = await caches.open(META);
    await meta.put(leaseUrl(client.id), new Response(build));
    if (await (await meta.match(pendingUrl(client.id)))?.text() === build) await meta.delete(pendingUrl(client.id));
  });
}

async function retireUnusedReleases() {
  if (!self.navigator?.locks?.request) return;
  return metadataChange(async () => {
  const meta = await caches.open(META);
  const previous = await (await meta.match(ACTIVE))?.text();
  const keep = new Set([CACHE, ...(previous ? [PREFIX + previous] : [])]);
  const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => client.url.startsWith(SCOPE));
  let known = true;
  for (const client of windows) {
    const build = client.id && await (await meta.match(leaseUrl(client.id)))?.text();
    if (!build) { known = false; break; }
    keep.add(PREFIX + build);
  }
  const records = await meta.keys();
  // Reserved navigation clients are absent from matchAll until their document can execute. Their pins have no expiry.
  for (const request of records) if (request.url.startsWith(PENDING)) {
    const build = await (await meta.match(request))?.text();
    if (!build || !/^[a-zA-Z0-9-]{1,80}$/.test(build)) throw new Error('Recovery file ownership is unavailable; existing files were retained.');
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
  }
  const live = new Set(windows.map(client => leaseUrl(client.id)));
  for (const request of await meta.keys()) if (request.url !== ACTIVE && !request.url.startsWith(PENDING) && !live.has(request.url)) await meta.delete(request);
  });
}

async function pinNavigation(id, build) {
  // A browser without a resulting client ID gets a conservative pin that cannot be acknowledged or timed out.
  const clientId = id || `unidentified-${build}`;
  await metadataChange(async () => { await (await caches.open(META)).put(pendingUrl(clientId), new Response(build)); });
  return clientId;
}

async function cancelNavigationPin(id, build) {
  await metadataChange(async () => {
    const meta = await caches.open(META);
    if (await (await meta.match(pendingUrl(id)))?.text() === build) await meta.delete(pendingUrl(id));
  });
}

async function digest(response) {
  const bytes = await response.arrayBuffer();
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function currentResponse(file, repair = true) {
  const cache = await caches.open(CACHE);
  const stored = await cache.match(file.url);
  if (stored?.ok && await digest(stored.clone()) === file.hash) return stored;
  if (!repair) throw new Error('The downloaded update is incomplete. Reconnect and try again.');
  // A public URL can now belong to a later deployment. Only this worker's exact bytes can repair its release.
  const response = await fetch(file.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || await digest(response.clone()) !== file.hash) throw new Error('The downloaded update is incomplete. Reconnect and try again.');
  await cache.put(file.url, response.clone());
  return response;
}

async function verify(repair = true) {
  for (const file of FILE_URLS) {
    await currentResponse(file, repair);
  }
  return true;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // A failed deployment or a CDN serving mixed releases must never replace the last complete offline app.
      const results = await Promise.allSettled(FILE_URLS.map(async file => {
        const response = await fetch(file.url, { cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(20_000) });
        if (!response.ok || await digest(response.clone()) !== file.hash) throw new Error('PWA release bytes did not match this build');
        await cache.put(file.url, response);
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      await verify(false);
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    // Updates wait for an explicit action. Automatically activating can interrupt a paid request or an unsaved form.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Cleanup is optional. A failed ownership read/write must retain old files, never fail an otherwise valid activation.
    try { await retireUnusedReleases(); }
    catch (error) { console.error('PixelDoll cache cleanup deferred:', error); }
    // Do not claim uncontrolled documents or reload any page.
  })());
});

self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  const message = event.data;
  event.waitUntil((async () => {
    try {
      await rememberClient(event);
      if (message?.type === 'GET_RELEASE') port.postMessage(RELEASE);
      else if (message?.type === 'VERIFY' || message?.type === 'ACTIVATE' || message?.type === 'GET_SHELL') {
        if (message.build !== RELEASE.build) throw new Error('The available update changed. Please try again.');
        await verify();
        if (message.type === 'ACTIVATE') await self.skipWaiting();
        const html = message.type === 'GET_SHELL' ? await (await currentResponse(CURRENT_FILES.get(INDEX))).text() : undefined;
        port.postMessage({ ...RELEASE, ready: true, ...(html === undefined ? {} : { html }) });
      }
    } catch (error) {
      port.postMessage({ error: error instanceof Error ? error.message : 'The update could not be verified.' });
    }
  })());
});

function bounded(promise, milliseconds) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('The app download timed out. Reconnect and reload.')), milliseconds); })])
    .finally(() => clearTimeout(timer));
}

function askWorker(worker, message) {
  const channel = new MessageChannel();
  return bounded(new Promise((resolve, reject) => {
    channel.port1.onmessage = event => {
      const reply = event.data;
      if (!reply || typeof reply !== 'object') reject(new Error('The downloaded app response is invalid.'));
      else if (typeof reply.error === 'string') reject(new Error(reply.error));
      else resolve(reply);
    };
    worker.postMessage(message, [channel.port2]);
  }), 20_000).finally(() => channel.port1.close());
}

function installed(worker) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('The new app files are still downloading. Reconnect and reload.')), 20_000);
    function finish(error) {
      clearTimeout(timer); worker.removeEventListener('statechange', changed);
      if (error) reject(error); else resolve();
    }
    function changed() {
      if (worker.state === 'redundant') finish(new Error('The new app files could not be downloaded.'));
      else if (worker.state !== 'installing') finish();
    }
    worker.addEventListener('statechange', changed); changed();
  });
}

function validRelease(value) {
  return typeof value?.build === 'string' && /^[a-zA-Z0-9-]{8,80}$/.test(value.build)
    && typeof value.version === 'string' && /^\d+\.\d+\.\d+$/.test(value.version)
    && typeof value.commit === 'string' && /^[a-f0-9]{7,40}$/.test(value.commit);
}

async function candidateNavigation(candidate, reservedClientId) {
  if (!candidate || candidate.scriptURL !== new URL('sw.js', SCOPE).href) throw new Error('No verified app update is available.');
  const release = await askWorker(candidate, { type: 'GET_RELEASE' });
  if (!validRelease(release) || release.build === RELEASE.build) throw new Error('No complete newer app files are available.');
  const pinnedClient = await pinNavigation(reservedClientId, release.build);
  try {
    // The pin precedes readback, but no lock spans this RPC: the candidate may itself be activating.
    // Its compiled inventory verifies the full closure. Never infer readiness from an orphan cache name.
    const reply = await askWorker(candidate, { type: 'GET_SHELL', build: release.build });
    if (reply.build !== release.build || reply.version !== release.version || reply.commit !== release.commit || reply.ready !== true || typeof reply.html !== 'string') throw new Error('The new app files could not be verified.');
    return new Response(reply.html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  } catch (error) {
    await cancelNavigationPin(pinnedClient, release.build);
    throw error;
  }
}

async function availableNavigation(reservedClientId) {
  for (const candidate of new Set([self.registration.waiting, self.registration.active].filter(Boolean))) {
    try { return await candidateNavigation(candidate, reservedClientId); }
    catch (error) { console.warn('PixelDoll cached app recovery unavailable:', error); }
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
    try { return await currentResponse(current); }
    catch { return new Response('This app resource could not be verified. Reconnect and reload PixelDoll.', { status: 503 }); }
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
  if (new URL(request.url).searchParams.has('pd-build')) return new Response('This app resource is unavailable. Reconnect and reload PixelDoll.', { status: 503 });
  return fetch(request);
}

self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  const path = url.pathname.slice(new URL(SCOPE).pathname.length);
  // This retired page can still exist under a revisioned URL in an older release cache.
  if (path === 'update.html') {
    event.respondWith(fetch(request, { cache: 'no-store' }));
  } else if (request.mode === 'navigate' && (path === '' || path === 'index.html')) {
    event.respondWith((async () => {
      try { return await currentResponse(CURRENT_FILES.get(INDEX)); }
      catch {
        try { return await recoveredNavigation(event.resultingClientId); }
        catch { return new Response('PixelDoll could not verify its app files. Reconnect and reload. If this continues while connected, close every PixelDoll tab and reopen the app.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }); }
      }
    })());
  } else if (path.startsWith('assets/') || url.searchParams.has('pd-build')) {
    event.respondWith(staticResponse(request));
  }
  // All other URLs, including release.json, PixelLab API/CDNs and dev endpoints, use the browser network unchanged.
});
