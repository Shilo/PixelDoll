// App-wide UI state: API key (memory by default, localStorage only when opted in) and the /balance snapshot.
import { api, ApiError } from './pixellab/client.ts';
import type { Balance } from './pixellab/routes.ts';
import { queue } from './pixellab/queue.ts';

const LS_KEY = 'pixeldoll.apiKey';
const lsGet = () => { try { return localStorage.getItem(LS_KEY) ?? ''; } catch { return ''; } };

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
// The leader tab can get (or lose) its key from a follower tab where the user typed it or pressed Forget key (queue.ts).
queue.subscribe(() => { if (queue.key !== app.key) Object.assign(app, { key: queue.key, keyRejected: false, balance: null, balanceError: '' }); });

export function setKey(key: string, remember: boolean) {
  app.key = key.trim();
  app.keyRejected = false;
  app.balance = null; // never show another key's balance
  app.balanceError = '';
  app.remembered = remember && !!app.key;
  try {
    if (app.remembered) localStorage.setItem(LS_KEY, app.key);
    else localStorage.removeItem(LS_KEY);
  } catch {}
  queue.setKey(app.key);
  void refreshBalance();
}

export function forgetKey() {
  try { localStorage.removeItem(LS_KEY); } catch {}
  app.key = '';
  app.remembered = false;
  app.balance = null;
  queue.setKey('');
}

export async function refreshBalance() {
  if (!app.key) return;
  try {
    app.balance = await api<Balance>(app.key, 'GET', '/balance');
    app.balanceError = '';
    app.balanceAt = Date.now();
  } catch (e) {
    app.balanceError = (e as Error).message;
    if (e instanceof ApiError && e.kind === 'auth') app.keyRejected = true;
  }
}
