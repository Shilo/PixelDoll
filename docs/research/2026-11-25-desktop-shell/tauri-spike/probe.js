const { invoke } = window.__TAURI__.core;
const report = (name, details = {}) => invoke('report', { event: { name, ...details } });

async function waitFor(read, description) {
  const deadline = performance.now() + 10000;
  do {
    const result = await read();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (performance.now() < deadline);
  throw new Error('Timed out waiting for ' + description);
}

async function check(name, run) {
  try {
    await report(name, { result: await run() });
  } catch (error) {
    await report(name, { error: String(error) });
  }
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function restartProbe() {
  const open = indexedDB.open('tauri-spike-probe', 1);
  open.onupgradeneeded = () => open.result.createObjectStore('probe');
  const db = await idbRequest(open);
  try {
    const previous = (await idbRequest(db.transaction('probe').objectStore('probe').get('boot'))) ?? 0;
    const tx = db.transaction('probe', 'readwrite');
    tx.objectStore('probe').put(previous + 1, 'boot');
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    return previous + 1;
  } finally {
    db.close();
  }
}

async function studioReady() {
  if (document.getElementById('startup-message')) {
    await new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        if (document.getElementById('startup-message')) return;
        observer.disconnect();
        clearTimeout(timeout);
        resolve();
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        reject(new Error('Studio startup did not complete'));
      }, 15000);
      observer.observe(document.getElementById('app'), { subtree: true, childList: true });
    });
  }
  // Two frames allow the mounted screen to paint before measuring readiness.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await report('studio-ready', { pageMs: performance.now(), epochMs: Date.now(), origin: location.origin });
}

async function main() {
  await studioReady();
  const mode = window.__PIXELDOLL_SPIKE_CASE__;
  if (mode === 'startup') {
    await report('finished');
    return;
  }
  await check('capabilities', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('PixelDoll'));
    const canvas = new OffscreenCanvas(1, 1);
    canvas.getContext('2d').fillRect(0, 0, 1, 1);
    const bitmap = await createImageBitmap(await canvas.convertToBlob());
    bitmap.close();
    const before = await navigator.storage.persisted();
    return {
      secure: isSecureContext, digestBytes: digest.byteLength,
      lock: await navigator.locks.request('tauri-spike-probe', (lock) => lock.name),
      boot: await restartProbe(), persistedBefore: before, persistedAfter: await navigator.storage.persist(),
      renderer: navigator.userAgent,
      clipboardRead: typeof navigator.clipboard?.read,
      clipboardWrite: typeof navigator.clipboard?.write,
      webgl2: Boolean(document.createElement('canvas').getContext('webgl2')),
      workers: (await navigator.serviceWorker?.getRegistrations())?.length,
      controlled: Boolean(navigator.serviceWorker?.controller)
    };
  });
  await check('compression', async () => {
    const source = new TextEncoder().encode('PixelDoll'.repeat(4096));
    const compressed = new Blob([source]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const inflated = compressed.pipeThrough(new DecompressionStream('deflate-raw'));
    const result = new Uint8Array(await new Response(inflated).arrayBuffer());
    if (result.length !== source.length || !source.every((byte, i) => result[i] === byte)) {
      throw new Error('Compression round trip changed bytes');
    }
    return result.length;
  });
  await check('demo', async () => {
    const find = (selector) => waitFor(() => document.querySelector(selector), selector);
    (await find('.customize-action:not([disabled])')).click();
    const canvas = await find('.experience-stage canvas');
    return { width: canvas.width, height: canvas.height };
  });
  if (mode === 'download' || mode === 'backup' || mode === 'publish') {
    await check('studio-' + mode, async () => {
      const click = async (label) => {
        const button = await waitFor(
          () => [...document.querySelectorAll('dialog[open] button, #app button')].find((el) => {
            if (el.disabled || !el.getClientRects().length) return false;
            const name = (el.getAttribute('aria-label') ||
              el.querySelector('.row-name')?.textContent || el.textContent).trim();
            return typeof label === 'string' ? name === label : label.test(name);
          }),
          String(label)
        );
        button.click();
      };
      await click('More options');
      await click('Edit a copy');
      await waitFor(() => document.body.innerText.includes('Adventurer copy'), 'saved demo copy');
      if (mode !== 'backup') {
        await click('Export');
        if (mode === 'publish') {
          const godot = await waitFor(
            () => document.querySelector('dialog[open] input[value="godot"]:not(:disabled)'),
            'Godot export format'
          );
          godot.click();
        }
        await click(/^Download ZIP/);
      } else {
        await click('More options');
        await click(/^Settings(?:…|\.\.\.)?$/);
        await click('Library');
        await click('Back up library');
      }
      if (mode === 'publish') return waitFor(() => invoke('project_publish_result'), 'project publish');
      return waitFor(async () => await invoke('completed_downloads'), mode + ' ZIP');
    });
    await report('finished');
    return;
  }
  if (mode === 'online') {
    await check('pixellab-cors', async () => {
      const response = await fetch('https://api.pixellab.ai/v2/balance', {
        credentials: 'omit',
        cache: 'no-store',
        headers: { Authorization: 'Bearer invalid-desktop-probe' },
        signal: AbortSignal.timeout(12000)
      });
      return response.status;
    });
    await report('finished');
    return;
  }
  for (const size of [1024 * 1024, 64 * 1024 * 1024, 128 * 1024 * 1024]) {
    if (mode === 'chunked') {
      await check('chunked-transfer-' + size, async () => {
        const chunk = new Uint8Array(1024 * 1024).fill(0xa5);
        const start = performance.now();
        await invoke('begin_transfer');
        for (let i = 0; i < size; i += chunk.length) await invoke('append_chunk', chunk);
        const result = await invoke('finish_transfer', { expected: size });
        if (result.bytes !== size) throw new Error('Native write size mismatch');
        return { ...result, roundTripMs: performance.now() - start };
      });
      continue;
    }
    await check('raw-transfer-' + size, async () => {
      const bytes = new Uint8Array(size);
      bytes.fill(0xa5);
      const start = performance.now();
      const result = await invoke('transfer', bytes);
      if (result.bytes !== size) throw new Error('Native write size mismatch');
      return { ...result, roundTripMs: performance.now() - start };
    });
  }
  if (mode === 'chunked') {
    await check('interrupted-transfer', async () => {
      await invoke('begin_transfer');
      await invoke('append_chunk', new Uint8Array(1024));
      try {
        await invoke('finish_transfer', { expected: 2048 });
        throw new Error('Unexpectedly published an incomplete transfer');
      } catch (error) {
        if (error !== 'transfer ended before all bytes arrived') throw error;
      }
      await invoke('begin_transfer');
      await invoke('append_chunk', new Uint8Array(1024));
      return invoke('finish_transfer', { expected: 1024 });
    });
  }
  await report('finished');
}

document.addEventListener('securitypolicyviolation', (event) => {
  void report('csp', { directive: event.effectiveDirective });
});
void main().catch((error) => report('fatal', { error: String(error) }));
