// App-wide UI state: API key (memory by default, localStorage only when opted in) and the /balance snapshot.
import { api, ApiError } from './pixellab/client.ts';
import type { Balance } from './pixellab/routes.ts';
import { queue } from './pixellab/queue.ts';

const LS_KEY = 'pixellabApiKey'; // shared across apps on this origin
const LEGACY_LS_KEY = 'pixeldoll.apiKey';
const SAVED_KEYS = [LS_KEY, LEGACY_LS_KEY, 'pixellab-backpack:key-kept'];
const lsGet = () => {
  let shared = '';
  let legacy = '';
  try {
    shared = localStorage.getItem(LS_KEY) ?? '';
    legacy = localStorage.getItem(LEGACY_LS_KEY) ?? '';
  } catch {}
  // A full store must not discard a readable saved key. Leave the old copy until a successful move or explicit Forget.
  try {
    if (!shared && legacy) localStorage.setItem(LS_KEY, legacy);
    if (shared || legacy) localStorage.removeItem(LEGACY_LS_KEY);
  } catch {}
  return shared || legacy;
};
const clearSavedKeys = () => { for (const name of SAVED_KEYS) { try { localStorage.removeItem(name); } catch {} } };

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
    else clearSavedKeys();
  } catch {}
  queue.setKey(app.key);
  void refreshBalance();
}

export function forgetKey() {
  clearSavedKeys();
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
