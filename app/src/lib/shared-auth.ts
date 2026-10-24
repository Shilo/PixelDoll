// Origin-wide PixelLab coordination: apps agree on names and message meaning, not identical code.
// Only pixellabApiKey contains a credential; app-generated channel messages never carry one.
export const SAVED_KEY = 'pixellabApiKey';
export const FORGET_MARKER = 'pixellabAuthForget';
export const AUTH_CHANNEL = 'pixellab-auth';

export function readSavedKey(): string {
  try { return localStorage.getItem(SAVED_KEY) ?? ''; } catch { return ''; }
}
export function readForgetMarker(): string {
  try { return localStorage.getItem(FORGET_MARKER) ?? ''; } catch { return ''; }
}

export function watchSharedAuth(onForget: () => void, onSavedChange: () => void) {
  let lastStoredForget = readForgetMarker();
  const seen = new Set<string>(lastStoredForget ? [lastStoredForget] : []);
  const remember = (id: string) => {
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > 64) seen.delete(seen.values().next().value!);
    return true;
  };
  let channel: BroadcastChannel | null = null;
  try { channel = new BroadcastChannel(AUTH_CHANNEL); } catch { /* storage events also work without BroadcastChannel */ }
  const checkForget = () => {
    const marker = readForgetMarker();
    if (marker === lastStoredForget) return false;
    lastStoredForget = marker;
    if (!marker || !remember(marker)) return false;
    onForget();
    return true;
  };
  const reconcile = () => { if (!checkForget()) onSavedChange(); };
  if (channel) channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (data && typeof data === 'object' && 'type' in data && data.type === 'signed-out' && 'id' in data && typeof data.id === 'string') {
      const stored = readForgetMarker();
      // Notifications from different senders can arrive out of order. Current storage is authoritative.
      if (stored && data.id !== stored) { checkForget(); return; }
      lastStoredForget = stored;
      if (remember(data.id)) onForget();
    } else if (event.data === 'key-changed') reconcile();
  };
  const storage = (event: StorageEvent) => {
    try { if (event.storageArea && event.storageArea !== localStorage) return; } catch { return; }
    if (event.key === null) { lastStoredForget = readForgetMarker(); onForget(); }
    else if (event.key === FORGET_MARKER) checkForget();
    else if (event.key === SAVED_KEY) reconcile(); // read current storage, not a potentially stale event.newValue
  };
  const visible = () => { if (document.visibilityState === 'visible') reconcile(); };
  globalThis.addEventListener?.('storage', storage);
  globalThis.addEventListener?.('pageshow', reconcile);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visible);
  return {
    acknowledge() {
      lastStoredForget = readForgetMarker();
      if (lastStoredForget) remember(lastStoredForget);
    },
    changed() { channel?.postMessage('key-changed'); },
    forget() {
      const id = crypto.randomUUID();
      remember(id);
      try { localStorage.setItem(FORGET_MARKER, id); } catch { /* channel-only */ }
      lastStoredForget = readForgetMarker();
      channel?.postMessage({ type: 'signed-out', id });
    },
    close() {
      channel?.close();
      globalThis.removeEventListener?.('storage', storage);
      globalThis.removeEventListener?.('pageshow', reconcile);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visible);
    },
  };
}
