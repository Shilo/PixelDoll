// An in-memory cloud folder for tests: it counts requests and bytes, and injects the failures sync must survive (an
// upload cut off midway, a full quota, lagging listings, corruption, no network). Never bundled: only tests import it.
import { SyncError, type Entry, type Provider } from './types.ts';

export interface Stats {
	requests: number;
	lists: number;
	gets: number;
	puts: number;
	dels: number;
	bytesUp: number;
	bytesDown: number;
}

export class SimProvider implements Provider {
	readonly kind = 'sim' as const;
	files = new Map<string, { bytes: Uint8Array; etag: string }>();
	/** Every path written, in order, to spot duplicate transfers. */
	putLog: string[] = [];
	stats: Stats = { requests: 0, lists: 0, gets: 0, puts: 0, dels: 0, bytesUp: 0, bytesDown: 0 };
	/** Total bytes the account may hold; puts beyond it fail like a full free tier. */
	quota = Infinity;
	/** Fail the request after this many more successful requests (an interrupted upload or lost connection). */
	failAfter = Infinity;
	offline = false;
	/** The sign-in was revoked: every request fails until it is cleared. */
	revoked = false;
	/** Files created within the last `listLag` puts are missing from listings (eventual consistency). */
	listLag = 0;
	private recent: string[] = [];
	private n = 0;

	resetStats() {
		for (const key of Object.keys(this.stats))
			(this.stats as unknown as Record<string, number>)[key] = 0;
	}
	used() {
		let size = 0;
		for (const file of this.files.values()) size += file.bytes.length;
		return size;
	}
	private tick() {
		if (this.offline) throw new SyncError('offline', 'offline');
		if (this.revoked) throw new SyncError('reconnect', 'revoked');
		if (this.failAfter-- <= 0) {
			this.failAfter = Infinity;
			throw new SyncError('offline', 'connection lost');
		}
		this.stats.requests++;
	}
	async list(prefix: string) {
		this.tick();
		this.stats.lists++;
		const hidden = new Set(this.listLag ? this.recent : []);
		const out: Entry[] = [];
		for (const [path, file] of this.files)
			if (path.startsWith(prefix) && !path.slice(prefix.length).includes('/') && !hidden.has(path))
				out.push({ path, size: file.bytes.length, etag: file.etag });
		// Providers page listings (Drive 1,000, Dropbox 2,000 entries per page).
		this.stats.requests += Math.max(0, Math.ceil(out.length / 1000) - 1);
		return out;
	}
	async get(path: string) {
		this.tick();
		this.stats.gets++;
		const file = this.files.get(path);
		if (!file) return null;
		this.stats.bytesDown += file.bytes.length;
		return file.bytes.slice();
	}
	async put(path: string, bytes: Uint8Array) {
		this.tick();
		const old = this.files.get(path);
		if (this.used() - (old?.bytes.length ?? 0) + bytes.length > this.quota)
			throw new SyncError('cloud-full', 'storage quota exceeded');
		this.stats.puts++;
		this.putLog.push(path);
		this.stats.bytesUp += bytes.length;
		const etag = String(++this.n);
		this.files.set(path, { bytes: bytes.slice(), etag });
		if (this.listLag) {
			this.recent.push(path);
			if (this.recent.length > this.listLag) this.recent.shift();
		}
		return { path, size: bytes.length, etag };
	}
	async del(path: string) {
		this.tick();
		this.stats.dels++;
		this.files.delete(path);
	}
	async destroy() {
		this.tick();
		this.files.clear();
	}
	/** Corrupt a stored file in place (bit rot, a hand-edited file, a buggy client). */
	corrupt(path: string) {
		const file = this.files.get(path);
		if (file) file.bytes[file.bytes.length >> 1] ^= 0xff;
	}
}
