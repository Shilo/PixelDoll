// App-wide UI state: API key (memory by default, localStorage only when opted in) and the /balance snapshot.
import { api, ApiError } from './pixellab/client.ts';
import type { Balance } from './pixellab/routes.ts';
import { queue } from './pixellab/queue.ts';
import type { ActivityContext } from './pixellab/activity.ts';

const LS_KEY = 'pixellabApiKey'; // shared across apps on this origin
const lsGet = () => {
  try { return localStorage.getItem(LS_KEY) ?? ''; } catch { return ''; }
};
const clearSavedKey = () => { try { localStorage.removeItem(LS_KEY); } catch {} };

let keyRevision = 0;
const stored = lsGet();
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

export function setKey(key: string, remember: boolean, activity?: ActivityContext) {
  keyRevision++;
  app.key = key.trim();
  app.keyRejected = false;
  app.balance = null; // never show another key's balance
  app.balanceError = '';
  app.remembered = remember && !!app.key;
  try {
    if (app.remembered) localStorage.setItem(LS_KEY, app.key);
    else clearSavedKey();
  } catch {}
  queue.setKey(app.key);
  void refreshBalance(activity);
}

export function forgetKey() {
  keyRevision++;
  clearSavedKey();
  app.key = '';
  app.remembered = false;
  app.balance = null;
  app.balanceError = '';
  app.keyRejected = false;
  app.balanceAt = 0;
  queue.setKey('');
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
