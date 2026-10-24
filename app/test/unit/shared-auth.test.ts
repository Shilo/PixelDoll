import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AUTH_CHANNEL, FORGET_MARKER, SAVED_KEY, watchSharedAuth } from '../../src/lib/shared-auth.ts';

let saved: Map<string, string>, events: EventTarget, posts: unknown[];
const clients: ReturnType<typeof watchSharedAuth>[] = [];
class Channel {
  static all = new Set<Channel>();
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { Channel.all.add(this); }
  postMessage(data: unknown) { posts.push(data); for (const peer of Channel.all) if (peer !== this && peer.name === this.name) peer.onmessage?.({ data }); }
  close() { Channel.all.delete(this); }
}
beforeEach(() => {
  saved = new Map(); events = new EventTarget(); posts = []; Channel.all.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v), removeItem: (k: string) => saved.delete(k) });
  vi.stubGlobal('BroadcastChannel', Channel);
  vi.stubGlobal('addEventListener', events.addEventListener.bind(events));
  vi.stubGlobal('removeEventListener', events.removeEventListener.bind(events));
});
afterEach(() => { clients.splice(0).forEach((client) => client.close()); vi.unstubAllGlobals(); });
function watch(forget = vi.fn(), change = vi.fn()) { const client = watchSharedAuth(forget, change); clients.push(client); return { client, forget, change }; }
function storage(key: string | null, newValue: string | null = null) { events.dispatchEvent(Object.assign(new Event('storage'), { key, newValue, storageArea: localStorage })); }

test('the common origin channel carries only events; Forget reaches session-only apps once without loops', () => {
  const a = watch(), b = watch();
  saved.set(SAVED_KEY, 'synthetic-shared-key');
  a.client.changed();
  expect(b.change).toHaveBeenCalledOnce();
  a.client.forget();
  storage(FORGET_MARKER); // the same notification also arrives through the browser storage event
  expect(b.forget).toHaveBeenCalledOnce();
  expect(posts).toEqual(['key-changed', { type: 'signed-out', id: expect.any(String) }]);
  expect(JSON.stringify(posts)).not.toContain('synthetic-shared-key');
  expect([...Channel.all].every((c) => c.name === AUTH_CHANNEL)).toBe(true);
});

test('Forget still reaches every watcher with BroadcastChannel unavailable', () => {
  vi.stubGlobal('BroadcastChannel', undefined);
  const a = watch(), b = watch(); a.client.forget(); storage(FORGET_MARKER);
  expect(b.forget).toHaveBeenCalledOnce();
  expect(posts).toEqual([]);
});

test('saved changes and clear-site-data are observed, including after a background page resumes', () => {
  const a = watch();
  storage(SAVED_KEY, 'old-event-value');
  expect(a.change).toHaveBeenCalledOnce();
  saved.set(FORGET_MARKER, 'missed-forget'); events.dispatchEvent(new Event('pageshow'));
  expect(a.forget).toHaveBeenCalledOnce();
  storage(null);
  expect(a.forget).toHaveBeenCalledTimes(2);
  a.client.close(); storage(SAVED_KEY);
  expect(a.change).toHaveBeenCalledOnce();
});

test('storage failure falls back to channel-only Forget; no token storage or notification is needed', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('denied'); } });
  const a = watch(), b = watch(); a.client.forget();
  expect(b.forget).toHaveBeenCalledOnce();
  expect(posts).toEqual([{ type: 'signed-out', id: expect.any(String) }]);
});

test('delayed older Forget messages cannot sign out a fresh connection', () => {
  const a = watch();
  const channel = [...Channel.all][0]!;
  const message = (id: string) => channel.onmessage?.({ data: { type: 'signed-out', id } });
  saved.set(FORGET_MARKER, 'm1'); message('m1');
  saved.set(FORGET_MARKER, 'm2'); message('m2');
  message('m1');
  expect(a.forget).toHaveBeenCalledTimes(2);
  saved.set(FORGET_MARKER, 'm3'); a.client.acknowledge();
  message('m2'); message('m3'); storage(FORGET_MARKER);
  expect(a.forget).toHaveBeenCalledTimes(2);
});

test('duplicate out-of-order Forget messages are deduplicated when storage is denied', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('denied'); } });
  const a = watch(), channel = [...Channel.all][0]!;
  for (const id of ['m1', 'm2', 'm1']) channel.onmessage?.({ data: { type: 'signed-out', id } });
  expect(a.forget).toHaveBeenCalledTimes(2);
});

test('an obsolete channel message cannot swallow a newer storage-only Forget', () => {
  const a = watch(), channel = [...Channel.all][0]!;
  saved.set(FORGET_MARKER, 'm2');
  channel.onmessage?.({ data: { type: 'signed-out', id: 'm1' } });
  storage(FORGET_MARKER);
  expect(a.forget).toHaveBeenCalledOnce();
});
