// Proof-of-concept sync engine: immutable, content-addressed objects in a dumb cloud folder, plus one small "heads" file
// per device that only that device writes. No file is ever written by two devices, so no provider compare-and-swap is
// needed, and a listing that lags only delays a sync. Layout (identical on every provider):
//
//   blobs/<sha256>            artwork, immutable (packs/<sha256>.pack instead when packing is on)
//   revs/<record>/<rev>.json.gz  one immutable revision of one character: parents, body (manifest) or a tombstone
//   devices/<device>.json     this device's current revision per record, rewritten after each push
//
// Revisions form a DAG per record (like git or CouchDB). Several heads means concurrent edits: they are merged with a
// three-way merge against their nearest common ancestor (merge.ts). Merges are deterministic, so two devices that merge
// the same heads write the same revision id and converge without coordination.
import { merge3, stableStringify, type Conflict } from './merge.ts';
import { NetworkError, QuotaError, type Provider } from './provider.ts';

export interface ConflictNote extends Conflict {
	aRev: string;
	bRev: string;
}
export interface Rev {
	id: string;
	record: string;
	parents: string[];
	depth: number;
	deleted: boolean;
	body: unknown;
	conflicts: ConflictNote[];
	device: string;
	at: number;
}
export type Status = 'saved-locally' | 'syncing' | 'synced' | 'offline' | 'failed' | 'conflict' | 'cloud-full';

const enc = new TextEncoder(),
	dec = new TextDecoder();
export async function sha256(bytes: Uint8Array) {
	const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>));
	return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
}
async function pipe(bytes: Uint8Array, t: CompressionStream | DecompressionStream) {
	return new Uint8Array(await new Response(new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(t)).arrayBuffer());
}
const gzip = (b: Uint8Array) => pipe(b, new CompressionStream('gzip'));
const gunzip = (b: Uint8Array) => pipe(b, new DecompressionStream('gzip'));
const revId = (r: Omit<Rev, 'id' | 'device' | 'at' | 'depth'>) =>
	sha256(enc.encode(stableStringify({ r: r.record, p: [...r.parents].sort(), d: r.deleted, b: r.body, c: r.conflicts })));

/** Every "sha256:<hex>" string anywhere in a manifest, like the app's blobReferences. */
export function blobRefs(v: unknown, out = new Set<string>()) {
	if (typeof v === 'string') {
		if (/^sha256:[0-9a-f]{64}$/.test(v)) out.add(v.slice(7));
	} else if (v && typeof v === 'object') for (const x of Object.values(v)) blobRefs(x, out);
	return out;
}

/** Stand-in for PixelDoll's IndexedDB: the app's `projects` and `blobs` stores plus a separate `sync` metadata store. */
export class Local {
	records = new Map<string, unknown>();
	blobs = new Map<string, Uint8Array>();
	version = new Map<string, number>();
	meta = new Map<string, { base: string | null; synced: number; conflicts: ConflictNote[] }>();
	revs = new Map<string, Rev>();
	pending = new Set<string>(); // revisions made here and not yet confirmed uploaded
	remoteBlobs: Map<string, { pack?: string; off?: number; len?: number }> | null = null;
	deviceFiles = new Map<string, { etag: string; heads: Record<string, string>; packs?: string[] }>();
	packIndex = new Map<string, Record<string, [number, number]>>();
	objects = new Map<string, unknown>(); // item objects by content hash
	remoteObjects = new Set<string>(); // item objects known to be uploaded
	/** Set by rebuild(): the next push lists what exists instead of trusting what it believed was uploaded. */
	verifying = false;
	private chain: Promise<unknown> = Promise.resolve();
	device: string;
	constructor(device: string) {
		this.device = device;
	}
	async putBlob(bytes: Uint8Array) {
		const h = await sha256(bytes);
		this.blobs.set(h, bytes);
		return `sha256:${h}`;
	}
	save(id: string, body: unknown) {
		this.records.set(id, structuredClone(body));
		this.version.set(id, (this.version.get(id) ?? 0) + 1);
	}
	remove(id: string) {
		this.records.delete(id);
		this.version.set(id, (this.version.get(id) ?? 0) + 1);
	}
	/** The user picked a value for every conflict of this record: save it and clear the notes. */
	resolve(id: string, body: unknown) {
		this.save(id, body);
		const m = this.meta.get(id);
		if (m) m.conflicts = [];
	}
	conflicts(id: string) {
		return this.meta.get(id)?.conflicts ?? [];
	}
	/** Web Locks stand-in: one sync at a time per browser profile, across tabs. */
	exclusive<T>(fn: () => Promise<T>): Promise<T> {
		const run = this.chain.then(fn, fn);
		this.chain = run.catch(() => undefined);
		return run;
	}
}

export interface Options {
	packs?: boolean;
	packLimit?: number;
	validate?: (body: unknown) => string[];
	useLock?: boolean;
}

export class Engine {
	status: Status = 'saved-locally';
	error?: string;
	/** Packs downloaded whole during this sync, shared by every record that needs cells from them. */
	private packs = new Map<string, Uint8Array>();
	/** Revision graphs listed during this sync. */
	private dag = new Map<string, Map<string, { depth: number; parents: string[]; path: string }>>();
	local: Local;
	remote: Provider;
	opt: Options;
	constructor(local: Local, remote: Provider, opt: Options = {}) {
		this.local = local;
		this.remote = remote;
		this.opt = opt;
	}

	sync(): Promise<Status> {
		return this.opt.useLock === false ? this.run() : this.local.exclusive(() => this.run());
	}

	private async run(): Promise<Status> {
		this.status = 'syncing';
		this.packs.clear();
		this.dag.clear();
		try {
			const heads = await this.pull();
			await this.reconcile(heads);
			await this.push();
			const conflicted = [...this.local.meta.values()].some((m) => m.conflicts.length);
			return (this.status = conflicted ? 'conflict' : 'synced');
		} catch (e) {
			this.error = String(e);
			return (this.status =
				e instanceof QuotaError ? 'cloud-full' : e instanceof NetworkError ? 'offline' : 'failed');
		}
	}

	// ---- pull: read changed device files; fetch head revisions we lack ----
	/** Forget what the remote is believed to hold and queue every revision the local heads need, so the next push
	 *  re-uploads anything missing (idempotent: content-named files that exist are rewritten with the same bytes). Used
	 *  when this device's own heads file has vanished (a wiped or restored folder) and when switching providers. */
	rebuild() {
		const L = this.local;
		L.remoteBlobs = null;
		L.remoteObjects.clear();
		L.deviceFiles.clear();
		L.packIndex.clear();
		L.verifying = true;
		const stack = [...L.meta.values()].map((m) => m.base).filter((b): b is string => !!b);
		while (stack.length) {
			const id = stack.pop()!;
			const r = L.revs.get(id);
			if (!r || L.pending.has(id)) continue;
			L.pending.add(id);
			stack.push(...r.parents);
		}
	}

	private async pull() {
		const L = this.local,
			heads = new Map<string, Set<string>>();
		const listed = await this.remote.list('devices/');
		const mine = `devices/${L.device}.json`;
		if (L.deviceFiles.has(mine) && !listed.some((e) => e.path === mine)) this.rebuild();
		for (const e of listed) {
			let f = L.deviceFiles.get(e.path);
			if (!f || f.etag !== e.etag) {
				const bytes = await this.remote.get(e.path);
				if (!bytes) continue; // listed but gone: read it next time
				const json = JSON.parse(dec.decode(bytes));
				f = { etag: e.etag, heads: json.heads, packs: json.packs };
				L.deviceFiles.set(e.path, f);
			}
			for (const [rec, rev] of Object.entries(f.heads)) {
				if (!heads.has(rec)) heads.set(rec, new Set());
				heads.get(rec)!.add(rev);
			}
		}
		for (const [rec, set] of heads)
			for (const id of set) if (!(await this.rev(rec, id))) set.delete(id); // not readable yet: next sync
		return heads;
	}

	/** The DAG of one record from a single listing: file names carry depth and parents, so finding a common ancestor needs
	 *  no revision downloads. Listed once per sync, and again when a revision is not in it yet (a lagging listing). */
	private async graph(record: string, refresh = false) {
		let g = this.dag.get(record);
		if (!g || refresh) {
			g = new Map();
			for (const e of await this.remote.list(`revs/${record}/`)) {
				const [depth, id, ...parents] = e.path.slice(`revs/${record}/`.length, -'.json.gz'.length).split('.');
				g.set(id, { depth: Number(depth), parents, path: e.path });
			}
			this.dag.set(record, g);
		}
		return g;
	}

	private async node(record: string, id: string): Promise<{ depth: number; parents: string[]; path?: string } | undefined> {
		const known = this.local.revs.get(id);
		if (known) return known;
		const g = await this.graph(record);
		return g.get(id) ?? (await this.graph(record, true)).get(id);
	}

	private async rev(record: string, id: string): Promise<Rev | undefined> {
		const known = this.local.revs.get(id);
		if (known) return known;
		const n = await this.node(record, id);
		if (!n?.path) return undefined;
		const bytes = await this.remote.get(n.path);
		if (!bytes) return undefined;
		let r: Rev;
		try {
			r = JSON.parse(dec.decode(await gunzip(bytes)));
			r.body = await this.expand(r.body);
		} catch {
			return undefined; // corrupt or incomplete: treated as missing until it can be read
		}
		if ((await revId(r)) !== id) return undefined;
		this.local.revs.set(id, r);
		return r;
	}

	// ---- items as their own content-addressed objects (git trees): a small edit uploads only the item it changed ----
	private async objectKey(item: unknown) {
		return sha256(enc.encode(stableStringify(item)));
	}
	private async flatten(body: unknown) {
		const b = body as { items?: unknown[] } | null;
		if (!b || !Array.isArray(b.items)) return body;
		const items = [];
		for (const it of b.items) {
			const h = await this.objectKey(it);
			this.local.objects.set(h, it);
			items.push(`obj:${h}`);
		}
		return { ...b, items };
	}
	private async expand(body: unknown) {
		const b = body as { items?: unknown[] } | null;
		if (!b || !Array.isArray(b.items)) return body;
		const items = [];
		for (const ref of b.items as string[]) {
			const h = ref.slice(4);
			let it = this.local.objects.get(h);
			if (it === undefined) {
				const bytes = await this.remote.get(`objects/${h}.json.gz`);
				if (!bytes) throw new Error(`object ${h} missing`);
				it = JSON.parse(dec.decode(await gunzip(bytes)));
				if ((await this.objectKey(it)) !== h) throw new Error(`object ${h} corrupt`);
				this.local.objects.set(h, it);
				this.local.remoteObjects.add(h);
			}
			items.push(it);
		}
		return { ...b, items };
	}

	private async isAncestor(record: string, x: Rev, of: Rev): Promise<boolean> {
		const stack = [...of.parents],
			seen = new Set<string>();
		while (stack.length) {
			const id = stack.pop()!;
			if (id === x.id) return true;
			if (seen.has(id)) continue;
			seen.add(id);
			const n = await this.node(record, id);
			if (n && n.depth > x.depth) stack.push(...n.parents);
		}
		return false;
	}

	private async ancestors(record: string, id: string) {
		const out = new Map<string, number>(),
			stack = [id];
		while (stack.length) {
			const x = stack.pop()!;
			if (out.has(x)) continue;
			const n = await this.node(record, x);
			if (!n) continue; // a pruned or unlisted ancestor ends the walk: the merge becomes two-way
			out.set(x, n.depth);
			stack.push(...n.parents);
		}
		return out;
	}

	/** Nearest common ancestor: the deepest shared revision, ties broken by id so every device picks the same one. Only
	 *  its body is downloaded. */
	private async lca(record: string, a: Rev, b: Rev) {
		const A = await this.ancestors(record, a.id),
			B = await this.ancestors(record, b.id);
		let best: string | undefined;
		for (const [id, depth] of A)
			if (B.has(id) && (!best || depth > A.get(best)! || (depth === A.get(best)! && id > best))) best = id;
		return best ? this.rev(record, best) : undefined;
	}

	private async make(
		record: string,
		parents: Rev[],
		deleted: boolean,
		body: unknown,
		conflicts: ConflictNote[]
	): Promise<Rev> {
		const r = {
			record,
			parents: parents.map((p) => p.id).sort(),
			deleted,
			body: deleted ? null : body,
			conflicts
		};
		const id = await revId(r);
		const known = this.local.revs.get(id);
		if (known) return known;
		const rev: Rev = {
			...r,
			id,
			depth: 1 + Math.max(0, ...parents.map((p) => p.depth)),
			device: this.local.device,
			at: Date.now()
		};
		this.local.revs.set(id, rev);
		this.local.pending.add(id);
		return rev;
	}

	private async merge(record: string, x: Rev, y: Rev): Promise<Rev> {
		const [a, b] = x.id > y.id ? [x, y] : [y, x];
		const base = await this.lca(record, a, b);
		const val = (r: Rev | undefined) => (r && !r.deleted ? r.body : undefined);
		const found: Conflict[] = [];
		let body = merge3(val(base), val(a), val(b), [], found);
		const invalid = body !== undefined ? (this.opt.validate?.(body) ?? []) : [];
		if (invalid.length) {
			// Field merges that break the manifest's own rules (an outfit naming an item the other side removed): keep A
			// whole and B whole in the note instead.
			found.length = 0;
			found.push({ path: [], base: val(base), a: val(a), b: val(b) });
			body = val(a) ?? val(b);
		}
		// Open notes merge three-way too: a note the ancestor had and one side no longer has was resolved there.
		const key = (c: ConflictNote) => stableStringify([c.path, c.aRev, c.bRev]);
		const keys = (r: Rev | undefined) => new Set((r?.conflicts ?? []).map(key));
		const [K0, KA, KB] = [keys(base), keys(a), keys(b)];
		const notes = new Map<string, ConflictNote>();
		for (const c of [...a.conflicts, ...b.conflicts, ...found.map((c) => ({ ...c, aRev: a.id, bRev: b.id }))]) {
			const k = key(c);
			if (!(K0.has(k) && (!KA.has(k) || !KB.has(k)))) notes.set(k, c);
		}
		return this.make(record, [a, b], body === undefined, body, [...notes.values()]);
	}

	// ---- reconcile: one revision per record that includes every head and any local edit ----
	private async reconcile(remoteHeads: Map<string, Set<string>>) {
		const L = this.local;
		const records = new Set([...remoteHeads.keys(), ...L.meta.keys(), ...L.records.keys(), ...L.version.keys()]);
		for (const rec of records) {
			const meta = L.meta.get(rec) ?? { base: null, synced: 0, conflicts: [] };
			const ver = L.version.get(rec) ?? 0;
			const cands = new Map<string, Rev>();
			for (const id of remoteHeads.get(rec) ?? []) cands.set(id, L.revs.get(id)!);
			const base = meta.base ? L.revs.get(meta.base) : undefined;
			if (base) cands.set(base.id, base);
			if (ver !== meta.synced) {
				const has = L.records.has(rec);
				const same =
					base && base.deleted === !has && stableStringify(base.body) === stableStringify(has ? L.records.get(rec) : null);
				if (!same && (has || base)) {
					const mine = await this.make(rec, base ? [base] : [], !has, L.records.get(rec), meta.conflicts);
					cands.set(mine.id, mine);
				}
			}
			let heads = [...cands.values()];
			const dropped = new Set<string>();
			for (const x of heads)
				for (const y of heads)
					if (x !== y && !dropped.has(y.id) && (await this.isAncestor(rec, x, y))) dropped.add(x.id);
			heads = heads.filter((h) => !dropped.has(h.id)).sort((p, q) => (p.id < q.id ? 1 : -1));
			if (!heads.length) continue;
			let result = heads[0];
			for (const h of heads.slice(1)) result = await this.merge(rec, result, h);
			if (!(await this.ensureBlobs(result))) continue; // artwork not readable yet: keep the local copy for now
			if ((L.version.get(rec) ?? 0) !== ver) continue; // edited during this sync: merge it next time
			if (result.deleted) L.records.delete(rec);
			else L.records.set(rec, structuredClone(result.body));
			L.meta.set(rec, { base: result.id, synced: ver, conflicts: result.conflicts });
		}
	}

	private async ensureBlobs(r: Rev) {
		const L = this.local,
			missing = [...blobRefs(r.body), ...r.conflicts.flatMap((c) => [...blobRefs([c.a, c.b])])].filter(
				(h) => !L.blobs.has(h)
			);
		if (!missing.length) return true;
		await this.loadRemoteBlobIndex();
		if (missing.some((h) => !L.remoteBlobs!.has(h))) await this.loadRemoteBlobIndex(true);
		const byPack = new Map<string, string[]>();
		for (const h of missing) {
			const where = L.remoteBlobs!.get(h);
			if (!where) return false;
			if (where.pack) {
				if (!byPack.has(where.pack)) byPack.set(where.pack, []);
				byPack.get(where.pack)!.push(h);
			} else {
				const bytes = await this.remote.get(`blobs/${h}`);
				if (!bytes || (await sha256(bytes)) !== h) return false;
				L.blobs.set(h, bytes);
			}
		}
		for (const [pack, hs] of byPack) {
			const index = L.packIndex.get(pack)!;
			// Many cells from one pack: one download of the whole pack beats one ranged read per cell.
			let whole = this.packs.get(pack) ?? null;
			if (!whole && hs.length > 2) {
				whole = await this.remote.get(`packs/${pack}.pack`);
				if (whole) this.packs.set(pack, whole);
			}
			for (const h of hs) {
				const [off, len] = index[h];
				const bytes = whole ? whole.slice(off, off + len) : await this.remote.get(`packs/${pack}.pack`, { start: off, end: off + len });
				if (!bytes || (await sha256(bytes)) !== h) return false;
				L.blobs.set(h, bytes);
			}
		}
		return true;
	}

	/** Learn which artwork the remote holds: once per session, and again when a needed cell is not in what we know. */
	private async loadRemoteBlobIndex(refresh = false) {
		const L = this.local;
		if (L.remoteBlobs && !refresh) return;
		L.remoteBlobs ??= new Map();
		if (this.opt.packs) {
			for (const e of await this.remote.list('packs/')) {
				const name = e.path.slice(6, -5);
				if (L.packIndex.has(name)) continue;
				// One ranged read covers the header of any pack up to ~1,000 cells; a bigger header needs a second read.
				const head = await this.remote.get(e.path, { start: 0, end: 1 << 16 });
				if (!head) continue;
				const n = new DataView(head.buffer, head.byteOffset).getUint32(0);
				const text = n + 4 <= head.length ? head.slice(4, 4 + n) : await this.remote.get(e.path, { start: 4, end: 4 + n });
				const idx: Record<string, [number, number]> = JSON.parse(dec.decode(text!));
				for (const v of Object.values(idx)) v[0] += 4 + n;
				L.packIndex.set(name, idx);
				for (const h of Object.keys(idx)) L.remoteBlobs.set(h, { pack: name });
			}
		} else for (const e of await this.remote.list('blobs/')) L.remoteBlobs.set(e.path.slice(6), {});
	}

	// ---- push: artwork first, then revisions, then this device's heads file (readers never see a head they can't read) ----
	private async push() {
		const L = this.local;
		const pending = [...L.pending].map((id) => L.revs.get(id)!);
		if (pending.length) {
			await this.loadRemoteBlobIndex();
			const need = new Set<string>();
			for (const r of pending)
				for (const h of [...blobRefs(r.body), ...r.conflicts.flatMap((c) => [...blobRefs([c.a, c.b])])])
					if (!L.remoteBlobs!.has(h) && L.blobs.has(h)) need.add(h);
			if (this.opt.packs) await this.uploadPacks([...need]);
			else
				for (const h of need) {
					await this.remote.put(`blobs/${h}`, L.blobs.get(h)!);
					L.remoteBlobs!.set(h, {});
				}
			if (L.verifying)
				for (const e of await this.remote.list('objects/')) L.remoteObjects.add(e.path.slice(8, -'.json.gz'.length));
			for (const r of pending) {
				if (L.verifying && (await this.graph(r.record)).has(r.id)) {
					L.pending.delete(r.id);
					continue;
				}
				const body = await this.flatten(r.body);
				if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items))
					for (const ref of (body as { items: string[] }).items) {
						const h = ref.slice(4);
						if (L.remoteObjects.has(h)) continue;
						await this.remote.put(`objects/${h}.json.gz`, await gzip(enc.encode(JSON.stringify(L.objects.get(h)))));
						L.remoteObjects.add(h);
					}
				const name = [r.depth, r.id, ...r.parents].join('.');
				await this.remote.put(`revs/${r.record}/${name}.json.gz`, await gzip(enc.encode(JSON.stringify({ ...r, body }))));
				L.pending.delete(r.id);
			}
		}
		L.verifying = false;
		const heads: Record<string, string> = {};
		for (const [rec, m] of L.meta) if (m.base) heads[rec] = m.base;
		const path = `devices/${L.device}.json`;
		const mine = L.deviceFiles.get(path);
		if (mine && stableStringify(mine.heads) === stableStringify(heads)) return;
		const e = await this.remote.put(path, enc.encode(JSON.stringify({ format: 'pixeldoll-sync/1', device: L.device, heads })));
		L.deviceFiles.set(path, { etag: e.etag, heads });
	}

	private async uploadPacks(hashes: string[]) {
		const L = this.local,
			limit = this.opt.packLimit ?? 4 << 20;
		let batch: string[] = [],
			size = 0;
		const flush = async () => {
			if (!batch.length) return;
			const index: Record<string, [number, number]> = {};
			let off = 0;
			for (const h of batch) {
				index[h] = [off, L.blobs.get(h)!.length];
				off += L.blobs.get(h)!.length;
			}
			// [u32 header length][JSON {hash: [offset from data start, length]}][cell bytes...]
			const head = enc.encode(JSON.stringify(index));
			const shift = 4 + head.length;
			const out = new Uint8Array(shift + off);
			new DataView(out.buffer).setUint32(0, head.length);
			out.set(head, 4);
			let p = shift;
			for (const h of batch) {
				out.set(L.blobs.get(h)!, p);
				p += L.blobs.get(h)!.length;
			}
			const name = await sha256(out);
			await this.remote.put(`packs/${name}.pack`, out);
			for (const h of batch) index[h][0] += shift;
			L.packIndex.set(name, index);
			for (const h of batch) L.remoteBlobs!.set(h, { pack: name });
			batch = [];
			size = 0;
		};
		for (const h of hashes) {
			batch.push(h);
			size += L.blobs.get(h)!.length;
			if (size >= limit) await flush();
		}
		await flush();
	}
}
