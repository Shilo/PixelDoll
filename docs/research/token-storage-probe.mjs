// Offline browser security probe. All pages are synthetic; every network request is intercepted.
// Run from any directory: node docs/research/token-storage-probe.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../app/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!['suite.example.test', 'other.example.test'].includes(url.hostname)) return route.abort();
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic security probe</title>' });
  });
  const a = await context.newPage();
  const sibling = await context.newPage();
  const other = await context.newPage();
  await a.goto('https://suite.example.test/PixelDoll/');
  await sibling.goto('https://suite.example.test/unrelated-project/');
  await other.goto('https://other.example.test/');
  await a.evaluate(() => {
    localStorage.setItem('pixellabApiKey', 'synthetic-audit-value');
    sessionStorage.setItem('probe-session', 'synthetic-session-value');
  });
  const results = {};
  results.siblingPathReadsLocalStorage = await sibling.evaluate(() => localStorage.getItem('pixellabApiKey') === 'synthetic-audit-value');
  results.otherOriginCannotReadLocalStorage = await other.evaluate(() => localStorage.getItem('pixellabApiKey') === null);
  results.separateTabDoesNotShareSessionStorage = await sibling.evaluate(() => sessionStorage.getItem('probe-session') === null);
  await a.goto('https://suite.example.test/pixellab-backpack/');
  results.sameTabOtherPathReadsSessionStorage = await a.evaluate(() => sessionStorage.getItem('probe-session') === 'synthetic-session-value');

  await sibling.evaluate(() => {
    window.probeHeard = false;
    window.probeChannel = new BroadcastChannel('pixeldoll-queue');
    window.probeChannel.onmessage = (event) => { window.probeHeard = event.data.key === 'synthetic-broadcast-value'; };
  });
  await a.evaluate(() => {
    window.probeChannel = new BroadcastChannel('pixeldoll-queue');
    window.probeChannel.postMessage({ key: 'synthetic-broadcast-value' });
  });
  await sibling.waitForFunction(() => window.probeHeard === true);
  results.siblingPathReceivesRawKeyBroadcast = true;

  await a.evaluate(async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode('synthetic-encrypted-value'));
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('synthetic-vault-probe', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('vault');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readwrite');
      tx.objectStore('vault').put({ key, iv, ciphertext }, 'record');
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const cryptoResults = await sibling.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('synthetic-vault-probe', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('vault').objectStore('vault').get('record');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    let exportRejected = false;
    try { await crypto.subtle.exportKey('raw', record.key); } catch { exportRejected = true; }
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: record.iv }, record.key, record.ciphertext);
    return { nonExtractableKeyRejectsExport: exportRejected, siblingPathCanStillDecrypt: new TextDecoder().decode(plaintext) === 'synthetic-encrypted-value' };
  });
  Object.assign(results, cryptoResults);
  for (const [name, passed] of Object.entries(results)) assert.equal(passed, true, name);
  console.log(JSON.stringify({ browser: browser.version(), checks: results }, null, 2));
} finally {
  await browser.close();
}
