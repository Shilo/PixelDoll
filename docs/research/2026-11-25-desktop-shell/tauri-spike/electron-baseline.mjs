import { app, session } from 'electron';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.PIXELDOLL_SPIKE_ROOT;
if (!root) throw new Error('Set PIXELDOLL_SPIKE_ROOT to a test directory');
const profile = join(root, 'profile');
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.once('ready', () => {
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_request, done) => done({ cancel: true })
  );
});
app.once('browser-window-created', (_event, window) => {
  window.webContents.once('did-finish-load', async () => {
    const result = await window.webContents.executeJavaScript(`(async () => {
      const deadline = performance.now() + 15000;
      while (document.getElementById('startup-message')) {
        if (performance.now() > deadline) throw new Error('Studio startup did not complete');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { pageMs: performance.now(), epochMs: Date.now(), origin: location.origin };
    })()`);
    writeFileSync(join(root, 'events.jsonl'), JSON.stringify({
      event: { name: 'studio-ready', ...result }
    }) + '\n');
  });
});
await import('../../../../desktop/main.mjs');
