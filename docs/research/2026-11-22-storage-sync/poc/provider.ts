// Simulated "dumb" cloud drive: list / get / put / delete on paths, like a Google Drive, Dropbox or OneDrive app folder.
// It counts requests and bytes, and can inject the failures the sync design must survive: an upload cut off midway,
// a full quota, lagging listings (eventual consistency) and, for Drive-like stores, duplicate files on racing creates.

export interface Entry {
	path: string;
	size: number;
	etag: string;
}
export interface Provider {
	list(prefix: string): Promise<Entry[]>;
	/** Whole file, or bytes [start, end) when a range is given (Drive, Dropbox and Graph all accept HTTP Range). */
	get(path: string, range?: { start: number; end: number }): Promise<Uint8Array | null>;
	put(path: string, bytes: Uint8Array): Promise<Entry>;
	del(path: string): Promise<void>;
}

export class QuotaError extends Error {
	constructor() {
		super('storage quota exceeded');
	}
}
export class NetworkError extends Error {}

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
	files = new Map<string, { bytes: Uint8Array; etag: string; copies: number }>();
	/** Every path written, in order, to spot duplicate transfers. */
	putLog: string[] = [];
	stats: Stats = { requests: 0, lists: 0, gets: 0, puts: 0, dels: 0, bytesUp: 0, bytesDown: 0 };
	/** Total bytes the account may hold; puts beyond it fail like a full free tier. */
	quota = Infinity;
	/** Fail the request after this many more successful requests (an interrupted session or lost connection). */
	failAfter = Infinity;
	offline = false;
	/** Files created within the last `listLag` puts are missing from listings (eventual consistency). */
	listLag = 0;
	private recent: string[] = [];
	private n = 0;

	reset() {
		for (const k of Object.keys(this.stats)) (this.stats as unknown as Record<string, number>)[k] = 0;
	}
	used() {
		let s = 0;
		for (const f of this.files.values()) s += f.bytes.length * f.copies;
		return s;
	}
	private tick() {
		if (this.offline) throw new NetworkError('offline');
		if (this.failAfter-- <= 0) {
			this.failAfter = Infinity;
			throw new NetworkError('connection lost');
		}
		this.stats.requests++;
	}
	async list(prefix: string) {
		this.tick();
		this.stats.lists++;
		const hidden = new Set(this.listLag ? this.recent : []);
		const out: Entry[] = [];
		for (const [path, f] of this.files)
			if (path.startsWith(prefix) && !hidden.has(path)) out.push({ path, size: f.bytes.length, etag: f.etag });
		// A provider pages listings (Drive and Graph up to 1000, Dropbox up to 2000 entries per page).
		this.stats.requests += Math.max(0, Math.ceil(out.length / 1000) - 1);
		return out;
	}
	async get(path: string, range?: { start: number; end: number }) {
		this.tick();
		this.stats.gets++;
		const f = this.files.get(path);
		if (!f) return null;
		const bytes = range ? f.bytes.slice(range.start, range.end) : f.bytes;
		this.stats.bytesDown += bytes.length;
		return bytes;
	}
	async put(path: string, bytes: Uint8Array) {
		this.tick();
		const old = this.files.get(path);
		if (this.used() - (old ? old.bytes.length : 0) + bytes.length > this.quota) throw new QuotaError();
		this.stats.puts++;
		this.putLog.push(path);
		this.stats.bytesUp += bytes.length;
		const etag = String(++this.n);
		this.files.set(path, { bytes: bytes.slice(), etag, copies: 1 });
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
	/** Corrupt a stored file in place (bit rot, a hand-edited file, a buggy client). */
	corrupt(path: string) {
		const f = this.files.get(path);
		if (f) f.bytes[f.bytes.length >> 1] ^= 0xff;
	}
}

/** Copy every file from one provider to another (provider switch). Immutable files make this resumable: copied ones are skipped. */
export async function copyAll(from: Provider, to: Provider) {
	const have = new Set((await to.list('')).map((e) => e.path));
	let copied = 0;
	for (const e of await from.list('')) {
		if (have.has(e.path) && !e.path.startsWith('devices/')) continue;
		const bytes = await from.get(e.path);
		if (bytes) {
			await to.put(e.path, bytes);
			copied++;
		}
	}
	return copied;
}
