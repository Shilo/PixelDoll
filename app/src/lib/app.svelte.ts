// App-wide UI state: API key (memory by default, localStorage only when opted in) and the /balance snapshot.
import { api, ApiError } from './pixellab/client.ts';
import type { Balance } from './pixellab/routes.ts';
import { queue } from './pixellab/queue.ts';
import type { ActivityContext } from './pixellab/activity.ts';
import { SAVED_KEY, readSavedKey, watchSharedAuth } from './shared-auth.ts';

const clearSavedKey = () => { try { localStorage.removeItem(SAVED_KEY); } catch {} };

let keyRevision = 0;
const stored = readSavedKey();
export const app = $state({
  key: stored,
  remembered: !!stored,
  keyRejected: false,
  balance: null as Balance | null,
  balanceError: '',
  balanceAt: 0,
});
queue.setKey(stored);
// A credential-free Forget signal from another tab also clears this tab. Typed credentials are never shared (queue.ts).
queue.subscribe(() => {
  if (queue.key === app.key) return;
  keyRevision++;
  Object.assign(app, { key: queue.key, keyRejected: false, balance: null, balanceError: '', balanceAt: 0, ...(!queue.key ? { remembered: false } : {}) });
});

const sharedAuth = watchSharedAuth(() => clearLocalKey(), () => {
  if (!app.remembered) return; // a session-only key remains local; future apps can read the saved key on load
  const saved = readSavedKey();
  if (saved === app.key) return;
  if (!saved) clearLocalKey();
  else app.remembered = false; // keep this account in memory; never silently run its paid work with another key
});
import.meta.hot?.dispose(() => sharedAuth.close());

export function setKey(key: string, remember: boolean, activity?: ActivityContext) {
  sharedAuth.acknowledge(); // a fresh connection supersedes any already-persisted Forget notification
  keyRevision++;
  app.key = key.trim();
  app.keyRejected = false;
  app.balance = null; // never show another key's balance
  app.balanceError = '';
  app.remembered = false;
  try {
    if (remember && app.key) {
      localStorage.setItem(SAVED_KEY, app.key);
      app.remembered = true;
    } else clearSavedKey();
  } catch { clearSavedKey(); }
  sharedAuth.changed();
  queue.setKey(app.key);
  void refreshBalance(activity);
}

export function forgetKey() {
  clearSavedKey();
  clearLocalKey();
  sharedAuth.forget();
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

export async function refreshBalance(activity?: ActivityContext | Event) {
  if (!app.key) return;
  const key = app.key, revision = keyRevision;
  try {
    const balance = await api<Balance>(key, 'GET', '/balance', undefined, undefined, activity instanceof Event ? { label: 'Refresh balance', background: false } : activity);
    if (revision !== keyRevision || key !== app.key) return;
    app.balance = balance;
    queue.setBalance(balance, key);
    app.balanceError = '';
    app.balanceAt = Date.now();
  } catch (e) {
    if (revision !== keyRevision || key !== app.key) return;
    app.balanceError = (e as Error).message;
    if (e instanceof ApiError && e.kind === 'auth') app.keyRejected = true;
  }
}
