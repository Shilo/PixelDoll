// The sync engine: immutable, content-addressed files in the user's cloud folder plus one small "heads" file per device
// that only that device writes, so no provider compare-and-swap is ever needed and a lagging listing only delays a sync.
// Port of the research proof of concept (docs/research/2026-11-22-storage-sync/poc/engine.ts), with its state kept in
// IndexedDB, item-level merging, ZIP packs and pixel-hash verification. Remote layout:
//
//   pixeldoll-sync.json                               format marker
//   packs/<sha>.zip, packs/<sha>.json.gz              artwork: stored ZIP of <hash>.png (≤ 4 MB) and its hash list
//   objects/<sha>.json.gz                             one item, shared by every revision that has it
//   revs/<record>/<depth>.<rev>.<parents>.json.gz     one revision of one character, or its deletion
//   devices/<device>.json                             this device's head revision per character
//
// Revisions form a graph per character. Several heads are concurrent edits, merged three ways against their nearest
// common ancestor. Merges are deterministic, so two devices that merge the same heads write the same revision.
import { sha256, stableStringify } from '../../image/hash.ts';
import { unzip, zip } from '../../store/zip.ts';
import { merge3, type Conflict, type MergePolicy } from './merge.ts';
import type { SyncStore } from './store.ts';
import { SyncError, type Provider, type SyncErrorCode } from '../providers/types.ts';

export const FORMAT = 'pixeldoll-sync/1';
const MARKER = 'pixeldoll-sync.json';
const PACK_LIMIT = 4 << 20;

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

/** What the engine needs from the app: its records as synced bodies, their artwork, and a safe way to write. */
export interface Library {
	/** Every local record that syncs, as the body that syncs (device-local fields stripped), and the ids the user deleted
	 *  on purpose. A record that is simply missing is not a delete: it is restored from the cloud. */
	read(): Promise<{ bodies: Map<string, unknown>; deleted: Set<string> }>;
	/** Artwork hashes (hex) a body references. */
	refs(body: unknown): string[];
	/** Stored artwork bytes (PNG), or undefined. */
	blob(hash: string): Promise<Uint8Array | undefined>;
	/** Whether downloaded bytes really are artwork `hash`. */
	verify(hash: string, bytes: Uint8Array): Promise<boolean>;
	/** Replace record `id` with `next` (undefined removes it) while its synced body still equals `expected` (undefined:
	 *  absent), storing `art` with it. False when it cannot now (generation work, unsaved edits, changed meanwhile): the
	 *  next sync tries again. */
	apply(
		id: string,
		expected: unknown,
		next: unknown,
		art: Map<string, Uint8Array>
	): Promise<boolean>;
	/** 'newer': made by a newer build (this device must update); 'invalid': breaks the format's own rules. */
	check(body: unknown): 'ok' | 'invalid' | 'newer';
	policy: MergePolicy;
}

export type Status =
	'idle' | 'syncing' | 'synced' | 'conflict' | Exclude<SyncErrorCode, 'failed'> | 'failed';

interface RecordMeta {
	base: string | null;
	/** Digest of the body and notes the base gave this device; a different digest now means a local change. */
	digest: string | null;
	conflicts: ConflictNote[];
}
interface State {
	device: string;
	records: Record<string, RecordMeta>;
	/** Revisions made here and not yet uploaded. */
	pending: string[];
	/** Heads files read, by path. */
	devices: Record<string, { etag: string; heads: Record<string, string> }>;
	/** Remote packs this device knows, with the artwork each holds. */
	packs: Record<string, string[]>;
	/** Item objects known to be uploaded. */
	objects: string[];
	/** The next push lists what exists instead of trusting what it believed was uploaded (after a lost folder). */
	verifying: boolean;
	/** The cloud folder vanished: nothing syncs until the user confirms a rebuild. */
	missing?: boolean;
}

const enc = new TextEncoder(),
	dec = new TextDecoder();
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
	return new Uint8Array(
		await new Response(
			new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream)
		).arrayBuffer()
	);
}
const gzip = (bytes: Uint8Array) => pipe(bytes, new CompressionStream('gzip'));
const gunzip = (bytes: Uint8Array) => pipe(bytes, new DecompressionStream('gzip'));
const packJson = async (value: unknown) => gzip(enc.encode(JSON.stringify(value)));
const unpackJson = async (bytes: Uint8Array) => JSON.parse(dec.decode(await gunzip(bytes)));
const revId = (r: Pick<Rev, 'record' | 'parents' | 'deleted' | 'body' | 'conflicts'>) =>
	sha256(
		stableStringify({
			r: r.record,
			p: [...r.parents].sort(),
			d: r.deleted,
			b: r.body,
			c: r.conflicts
		})
	);
const digestOf = (body: unknown, conflicts: ConflictNote[]) =>
	body === undefined ? Promise.resolve(null) : sha256(stableStringify({ b: body, c: conflicts }));
const noteKey = (note: ConflictNote) => stableStringify([note.path, note.aRev, note.bRev]);
const hex = /^[0-9a-f]{64}$/;
const safeRecord = /^[a-z0-9-]{1,80}$/;

export function newDevice(): string {
	return crypto.randomUUID().replace(/-/g, '');
}

export class Engine {
	status: Status = 'idle';
	error?: string;
	private state!: State;
	private formatChecked = false;
	/** Revision graphs listed during this sync. */
	private dag = new Map<string, Map<string, { depth: number; parents: string[]; path: string }>>();
	/** Packs downloaded during this sync. */
	private art = new Map<string, Map<string, Uint8Array>>();
	private remoteObjects = new Set<string>();

	constructor(
		private store: SyncStore,
		private remote: Provider,
		private library: Library,
		/** False for a one-off import: read a folder into the library, write nothing to it. */
		private writes = true
	) {}

	async sync(): Promise<Status> {
		this.status = 'syncing';
		this.error = undefined;
		this.dag.clear();
		this.art.clear();
		try {
			this.state = await this.load();
			if (this.state.missing) return (this.status = 'missing');
			this.remoteObjects = new Set(this.state.objects);
			await this.checkFormat();
			const heads = await this.pull();
			await this.reconcile(heads);
			if (this.writes) await this.push();
			const conflicted = Object.values(this.state.records).some((m) => m.conflicts.length);
			this.status = conflicted ? 'conflict' : 'synced';
		} catch (error) {
			this.error = error instanceof Error ? error.message : String(error);
			const code = error instanceof SyncError ? error.code : 'failed';
			if (code === 'missing' && this.state) this.state.missing = true;
			this.status = code;
			if (!(error instanceof SyncError)) console.error('Cloud Save failed', error);
		} finally {
			if (this.state) {
				this.state.objects = [...this.remoteObjects];
				await this.save();
			}
		}
		return this.status;
	}

	/** The user confirmed rebuilding a vanished cloud folder: upload everything this device has again. */
	async rebuild() {
		this.state = await this.load();
		this.state.missing = false;
		this.forgetRemote();
		await this.save();
	}

	/** Open conflict notes per character. */
	async conflicts(): Promise<Map<string, ConflictNote[]>> {
		const state = await this.load();
		return new Map(
			Object.entries(state.records)
				.filter(([, meta]) => meta.conflicts.length)
				.map(([id, meta]) => [id, meta.conflicts])
		);
	}

	/** Settle one note. `keep` 'live' leaves the body as it is; 'other' puts the other value back at the note's path.
	 *  `body` is the record after the user's choice when it needs more than that (keep both as a copy). The change syncs
	 *  like any edit. */
	async resolve(record: string, note: ConflictNote, keep: 'live' | 'other', body?: unknown) {
		const state = await this.load();
		const meta = state.records[record];
		if (!meta) return false;
		const { bodies } = await this.library.read();
		const current = bodies.get(record);
		let next = body ?? current;
		if (keep === 'other' && body === undefined) next = setAt(current, note.path, note.b);
		if (next !== current) {
			const art = await this.download(this.library.refs(next));
			if (!art || !(await this.library.apply(record, current, next, art))) return false;
		}
		meta.conflicts = meta.conflicts.filter((n) => noteKey(n) !== noteKey(note));
		this.state = state;
		await this.save();
		return true;
	}

	/** Earlier revisions of a character, newest first (the cloud listing plus what this device made). */
	async history(
		record: string
	): Promise<{ id: string; depth: number; at?: number; deleted?: boolean }[]> {
		this.state = await this.load();
		const graph = await this.graph(record, true);
		const out = new Map<string, { id: string; depth: number; at?: number; deleted?: boolean }>();
		for (const [id, node] of graph) out.set(id, { id, depth: node.depth });
		for (const id of this.state.pending) {
			const rev = await this.store.get<Rev>('revs', id);
			if (rev?.record === record) out.set(id, { id, depth: rev.depth });
		}
		for (const entry of out.values()) {
			const rev = await this.store.get<Rev>('revs', entry.id);
			if (rev) Object.assign(entry, { at: rev.at, deleted: rev.deleted });
		}
		return [...out.values()].sort((x, y) => y.depth - x.depth || (x.id < y.id ? 1 : -1));
	}

	/** Make revision `id` the character's current version: an ordinary edit on top of what is there now. */
	async restore(record: string, id: string) {
		this.state = await this.load();
		const rev = await this.rev(record, id);
		if (!rev || rev.deleted) return false;
		const { bodies } = await this.library.read();
		const art = await this.download(this.library.refs(rev.body));
		if (!art) return false;
		return this.library.apply(record, bodies.get(record), structuredClone(rev.body), art);
	}

	// ---- state ----

	private async load(): Promise<State> {
		const saved = await this.store.get<State>('kv', 'state');
		return (
			saved ?? {
				device: newDevice(),
				records: {},
				pending: [],
				devices: {},
				packs: {},
				objects: [],
				verifying: false
			}
		);
	}
	private save() {
		return this.store.put('kv', 'state', this.state);
	}
	private forgetRemote() {
		const state = this.state;
		state.devices = {};
		state.packs = {};
		state.objects = [];
		this.remoteObjects.clear();
		state.verifying = true;
		// Queue every revision the local heads need, so the next push re-uploads anything missing.
		state.pending = [
			...new Set([
				...state.pending,
				...Object.values(state.records)
					.map((meta) => meta.base)
					.filter((base): base is string => !!base)
			])
		];
	}

	private async checkFormat() {
		if (this.formatChecked) return;
		const marker = await this.remote.get(MARKER);
		if (marker) {
			let format: unknown;
			try {
				format = JSON.parse(dec.decode(marker)).format;
			} catch {
				format = undefined;
			}
			if (format !== FORMAT)
				throw new SyncError('update', 'The cloud copy was made by a newer PixelDoll.');
		} else if (this.writes)
			await this.remote.put(MARKER, enc.encode(JSON.stringify({ format: FORMAT })));
		this.formatChecked = true;
	}

	// ---- pull: read changed heads files, then the head revisions this device lacks ----

	private async pull() {
		const state = this.state,
			heads = new Map<string, Set<string>>();
		const listed = await this.remote.list('devices/');
		const mine = `devices/${state.device}.json`;
		// Our own heads file vanished (a wiped or restored folder, a provider switch): re-upload what we have.
		if (this.writes && state.devices[mine] && !listed.some((entry) => entry.path === mine))
			this.forgetRemote();
		for (const entry of listed) {
			let file = state.devices[entry.path];
			if (!file || file.etag !== entry.etag) {
				const bytes = await this.remote.get(entry.path);
				if (!bytes) continue; // listed but gone: next time
				try {
					const json = JSON.parse(dec.decode(bytes));
					if (json.format !== FORMAT)
						throw new SyncError('update', 'A device uses a newer PixelDoll.');
					file = { etag: entry.etag, heads: json.heads ?? {} };
				} catch (error) {
					if (error instanceof SyncError) throw error;
					continue; // unreadable: ignored like a missing file
				}
				state.devices[entry.path] = file;
			}
			for (const [record, rev] of Object.entries(file.heads)) {
				if (!safeRecord.test(record) || !hex.test(rev)) continue;
				if (!heads.has(record)) heads.set(record, new Set());
				heads.get(record)!.add(rev);
			}
		}
		for (const [record, set] of heads)
			for (const id of set) if (!(await this.rev(record, id))) set.delete(id); // not readable yet: next sync
		return heads;
	}

	/** One listing gives a character's whole graph: names carry depth and parents. */
	private async graph(record: string, refresh = false) {
		let graph = this.dag.get(record);
		if (!graph || refresh) {
			graph = new Map();
			const prefix = `revs/${record}/`;
			for (const entry of await this.remote.list(prefix)) {
				const [depth, id, ...parents] = entry.path
					.slice(prefix.length, -'.json.gz'.length)
					.split('.');
				if (hex.test(id) && parents.every((p) => hex.test(p)))
					graph.set(id, { depth: Number(depth), parents, path: entry.path });
			}
			this.dag.set(record, graph);
		}
		return graph;
	}

	private async node(record: string, id: string) {
		const known = await this.store.get<Rev>('revs', id);
		if (known) return known;
		const graph = await this.graph(record);
		return graph.get(id) ?? (await this.graph(record, true)).get(id);
	}

	/** A revision with its items expanded, from this device's cache or the cloud (verified against its id). */
	private async rev(record: string, id: string): Promise<Rev | undefined> {
		const cached = await this.store.get<Rev>('revs', id);
		if (cached) return { ...cached, body: await this.expand(cached.body) };
		const node = await this.node(record, id);
		if (!node || !('path' in node)) return undefined;
		const bytes = await this.remote.get(node.path as string);
		if (!bytes) return undefined;
		let rev: Rev, body: unknown;
		try {
			rev = await unpackJson(bytes);
			body = await this.expand(rev.body, true);
		} catch (error) {
			if (error instanceof SyncError) throw error;
			return undefined; // corrupt or incomplete: missing until it can be read
		}
		const full = { ...rev, body };
		if (rev.record !== record || (await revId(full)) !== id) return undefined;
		if (!rev.deleted && this.library.check(body) === 'newer')
			throw new SyncError('update', 'A character was saved by a newer PixelDoll.');
		await this.store.put('revs', id, rev);
		return full;
	}

	// ---- items as their own content-addressed objects: a small edit uploads only the item it changed ----

	private async flatten(body: unknown) {
		const value = body as { manifest?: { items?: unknown[] } } | null;
		if (!Array.isArray(value?.manifest?.items)) return body;
		const items: string[] = [];
		for (const item of value.manifest.items) {
			const hash = await sha256(stableStringify(item));
			await this.store.put('objects', hash, item);
			items.push(`obj:${hash}`);
		}
		return { ...value, manifest: { ...value.manifest, items } };
	}
	private async expand(body: unknown, remote = false) {
		const value = body as { manifest?: { items?: unknown[] } } | null;
		if (!Array.isArray(value?.manifest?.items)) return body;
		const items = [];
		for (const ref of value.manifest.items as string[]) {
			const hash = String(ref).slice(4);
			if (!hex.test(hash)) throw new Error('bad object reference');
			let item = await this.store.get('objects', hash);
			if (item === undefined) {
				if (!remote) throw new Error(`object ${hash} missing locally`);
				const bytes = await this.remote.get(`objects/${hash}.json.gz`);
				if (!bytes) throw new Error(`object ${hash} missing`);
				item = await unpackJson(bytes);
				if ((await sha256(stableStringify(item))) !== hash)
					throw new Error(`object ${hash} corrupt`);
				await this.store.put('objects', hash, item);
				this.remoteObjects.add(hash);
			}
			items.push(item);
		}
		return { ...value, manifest: { ...value.manifest, items } };
	}

	// ---- graph walks ----

	private async isAncestor(record: string, x: Rev, of: Rev): Promise<boolean> {
		const stack = [...of.parents],
			seen = new Set<string>();
		while (stack.length) {
			const id = stack.pop()!;
			if (id === x.id) return true;
			if (seen.has(id)) continue;
			seen.add(id);
			const node = await this.node(record, id);
			if (node && node.depth > x.depth) stack.push(...node.parents);
		}
		return false;
	}
	private async ancestors(record: string, id: string) {
		const out = new Map<string, number>(),
			stack = [id];
		while (stack.length) {
			const x = stack.pop()!;
			if (out.has(x)) continue;
			const node = await this.node(record, x);
			if (!node) continue; // an unlisted ancestor ends the walk: the merge becomes two-way
			out.set(x, node.depth);
			stack.push(...node.parents);
		}
		return out;
	}
	/** Nearest common ancestor: the deepest shared revision, ties broken by id so every device picks the same one. */
	private async lca(record: string, a: Rev, b: Rev) {
		const A = await this.ancestors(record, a.id),
			B = await this.ancestors(record, b.id);
		let best: string | undefined;
		for (const [id, depth] of A)
			if (B.has(id) && (!best || depth > A.get(best)! || (depth === A.get(best)! && id > best)))
				best = id;
		return best ? this.rev(record, best) : undefined;
	}

	private async make(
		record: string,
		parents: Rev[],
		body: unknown,
		conflicts: ConflictNote[]
	): Promise<Rev> {
		const deleted = body === undefined;
		const fields = {
			record,
			parents: parents.map((p) => p.id).sort(),
			deleted,
			body: deleted ? null : body,
			conflicts
		};
		const id = await revId(fields);
		const known = await this.store.get<Rev>('revs', id);
		if (known) return { ...known, body: fields.body };
		const rev: Rev = {
			...fields,
			id,
			depth: 1 + Math.max(0, ...parents.map((p) => p.depth)),
			device: this.state.device,
			at: Date.now()
		};
		await this.store.put('revs', id, { ...rev, body: await this.flatten(rev.body) });
		this.state.pending.push(id);
		return rev;
	}

	private async merge(record: string, x: Rev, y: Rev): Promise<Rev> {
		const [a, b] = x.id > y.id ? [x, y] : [y, x];
		const base = await this.lca(record, a, b);
		const value = (r: Rev | undefined) => (r && !r.deleted ? r.body : undefined);
		const found: Conflict[] = [];
		let body = merge3(value(base), value(a), value(b), this.library.policy, [], found);
		if (body !== undefined && this.library.check(body) !== 'ok') {
			// A field merge broke the format's rules (an outfit naming an item the other side removed): keep A whole, B
			// whole in the note.
			found.length = 0;
			found.push({ path: [], base: value(base), a: value(a), b: value(b) });
			body = value(a) ?? value(b);
		}
		// Notes merge three ways too: one the ancestor had that a side no longer has was settled there.
		const keys = (r: Rev | undefined) => new Set((r?.conflicts ?? []).map(noteKey));
		const [K0, KA, KB] = [keys(base), keys(a), keys(b)];
		const notes = new Map<string, ConflictNote>();
		for (const note of [
			...a.conflicts,
			...b.conflicts,
			...found.map((c) => ({ ...c, aRev: a.id, bRev: b.id }))
		]) {
			const key = noteKey(note);
			if (!(K0.has(key) && (!KA.has(key) || !KB.has(key)))) notes.set(key, note);
		}
		return this.make(record, [a, b], body, [...notes.values()]);
	}

	// ---- reconcile: one revision per character that includes every head and any local change ----

	private async reconcile(remoteHeads: Map<string, Set<string>>) {
		const state = this.state;
		const { bodies, deleted } = await this.library.read();
		const records = new Set([
			...remoteHeads.keys(),
			...Object.keys(state.records),
			...bodies.keys()
		]);
		for (const record of records) {
			if (!safeRecord.test(record)) continue;
			const meta = state.records[record] ?? { base: null, digest: null, conflicts: [] };
			const candidates = new Map<string, Rev>();
			for (const id of remoteHeads.get(record) ?? []) {
				const rev = await this.rev(record, id);
				if (rev) candidates.set(id, rev);
			}
			const base = meta.base ? await this.rev(record, meta.base) : undefined;
			if (base) candidates.set(base.id, base);
			const local = bodies.get(record);
			// Missing without the user deleting it (eviction, Delete local work) is no change: the cloud copy comes back.
			const removed = local === undefined && deleted.has(record) && !!base && !base.deleted;
			if (local !== undefined || removed) {
				const digest = await digestOf(local, meta.conflicts);
				if (digest !== meta.digest) {
					const mine = await this.make(record, base ? [base] : [], local, meta.conflicts);
					candidates.set(mine.id, mine);
				}
			}
			let heads = [...candidates.values()];
			const dropped = new Set<string>();
			for (const x of heads)
				for (const y of heads)
					if (x !== y && !dropped.has(y.id) && (await this.isAncestor(record, x, y)))
						dropped.add(x.id);
			heads = heads.filter((h) => !dropped.has(h.id)).sort((p, q) => (p.id < q.id ? 1 : -1));
			if (!heads.length) continue;
			let result = heads[0];
			for (const head of heads.slice(1)) result = await this.merge(record, result, head);
			const next = result.deleted ? undefined : result.body;
			if (
				stableStringify(next) !== stableStringify(local) &&
				!(next === undefined && local === undefined)
			) {
				const art = next === undefined ? new Map() : await this.download(this.library.refs(next));
				if (!art) continue; // artwork not readable yet: keep the local copy for now
				if (
					!(await this.library.apply(
						record,
						local,
						next === undefined ? undefined : structuredClone(next),
						art
					))
				)
					continue; // busy or changed meanwhile: merge it next time
			}
			state.records[record] = {
				base: result.id,
				digest: await digestOf(next, result.conflicts),
				conflicts: result.conflicts
			};
		}
	}

	/** The artwork `hashes` not stored here, downloaded and verified; undefined when any cannot be had yet. */
	private async download(hashes: string[]): Promise<Map<string, Uint8Array> | undefined> {
		const out = new Map<string, Uint8Array>();
		const missing: string[] = [];
		for (const hash of new Set(hashes)) if (!(await this.library.blob(hash))) missing.push(hash);
		if (!missing.length) return out;
		const where = async (refresh: boolean) => {
			await this.loadPacks(refresh);
			const map = new Map<string, string>();
			for (const [pack, list] of Object.entries(this.state.packs))
				for (const h of list) map.set(h, pack);
			return map;
		};
		let index = await where(false);
		if (missing.some((h) => !index.has(h))) index = await where(true);
		for (const hash of missing) {
			const pack = index.get(hash);
			if (!pack) return undefined;
			let files = this.art.get(pack);
			if (!files) {
				const bytes = await this.remote.get(`packs/${pack}.zip`);
				if (!bytes || (await sha256(bytes)) !== pack) return undefined;
				files = new Map();
				for (const [name, data] of await unzip(bytes)) files.set(name.replace(/\.png$/, ''), data);
				this.art.set(pack, files);
			}
			const data = files.get(hash);
			if (!data || !(await this.library.verify(hash, data))) return undefined;
			out.set(hash, data);
		}
		return out;
	}

	/** Learn which artwork the cloud holds: packs this device has not seen yet, from their small hash lists. */
	private async loadPacks(refresh: boolean) {
		if (!refresh && Object.keys(this.state.packs).length) return;
		for (const entry of await this.remote.list('packs/')) {
			const match = /^packs\/([0-9a-f]{64})\.json\.gz$/.exec(entry.path);
			if (!match || this.state.packs[match[1]]) continue;
			const bytes = await this.remote.get(entry.path);
			if (!bytes) continue;
			try {
				const list = await unpackJson(bytes);
				if (Array.isArray(list) && list.every((h) => typeof h === 'string' && hex.test(h)))
					this.state.packs[match[1]] = list;
			} catch {
				// An unreadable list only hides that pack's artwork until it is written again.
			}
		}
	}

	// ---- push: artwork first, then items, then revisions, then this device's heads file ----

	private async push() {
		const state = this.state;
		const pending: Rev[] = [];
		for (const id of state.pending) {
			const rev = await this.store.get<Rev>('revs', id);
			if (rev) pending.push(rev);
		}
		if (pending.length) {
			await this.loadPacks(state.verifying);
			const remote = new Set(Object.values(state.packs).flat());
			const need = new Set<string>();
			for (const rev of pending) {
				const body = await this.expand(rev.body);
				for (const hash of [
					...(rev.deleted ? [] : this.library.refs(body)),
					...rev.conflicts.flatMap((c) => this.library.refs([c.a, c.b]))
				])
					if (!remote.has(hash)) need.add(hash);
			}
			await this.uploadArt([...need]);
			if (state.verifying)
				for (const entry of await this.remote.list('objects/')) {
					const match = /^objects\/([0-9a-f]{64})\.json\.gz$/.exec(entry.path);
					if (match) this.remoteObjects.add(match[1]);
				}
			for (const rev of pending) {
				if (state.verifying && (await this.graph(rev.record)).has(rev.id)) {
					state.pending = state.pending.filter((id) => id !== rev.id);
					continue;
				}
				const items =
					(rev.body as { manifest?: { items?: string[] } } | null)?.manifest?.items ?? [];
				for (const ref of items) {
					const hash = ref.slice(4);
					if (this.remoteObjects.has(hash)) continue;
					await this.remote.put(
						`objects/${hash}.json.gz`,
						await packJson(await this.store.get('objects', hash))
					);
					this.remoteObjects.add(hash);
				}
				const name = [rev.depth, rev.id, ...rev.parents].join('.');
				await this.remote.put(`revs/${rev.record}/${name}.json.gz`, await packJson(rev));
				state.pending = state.pending.filter((id) => id !== rev.id);
				await this.save(); // an interrupted push resumes here
			}
		}
		state.verifying = false;
		const heads: Record<string, string> = {};
		for (const [record, meta] of Object.entries(state.records))
			if (meta.base) heads[record] = meta.base;
		const path = `devices/${state.device}.json`;
		if (stableStringify(state.devices[path]?.heads) === stableStringify(heads)) return;
		const entry = await this.remote.put(
			path,
			enc.encode(JSON.stringify({ format: FORMAT, device: state.device, heads }))
		);
		state.devices[path] = { etag: entry.etag, heads };
	}

	private async uploadArt(hashes: string[]) {
		let batch: { name: string; data: Uint8Array }[] = [],
			size = 0;
		const flush = async () => {
			if (!batch.length) return;
			const bytes = await zip(batch);
			const name = await sha256(bytes);
			const list = batch.map((entry) => entry.name.slice(0, -4));
			await this.remote.put(`packs/${name}.zip`, bytes);
			await this.remote.put(`packs/${name}.json.gz`, await packJson(list));
			this.state.packs[name] = list;
			await this.save();
			batch = [];
			size = 0;
		};
		for (const hash of hashes) {
			const data = await this.library.blob(hash);
			if (!data) continue; // the revision still uploads; devices that need it wait until some device has it
			batch.push({ name: `${hash}.png`, data });
			size += data.length;
			if (size >= PACK_LIMIT) await flush();
		}
		await flush();
	}
}

function setAt(body: unknown, path: (string | number)[], value: unknown): unknown {
	if (!path.length) return structuredClone(value);
	const copy = structuredClone(body) as Record<string, unknown>;
	let node: Record<string, unknown> | unknown[] = copy;
	for (let i = 0; i < path.length; i++) {
		const key = path[i];
		const last = i === path.length - 1;
		if (Array.isArray(node)) {
			const index = node.findIndex((entry) => (entry as { id?: unknown })?.id === key);
			if (last) {
				if (value === undefined) {
					if (index >= 0) node.splice(index, 1);
				} else if (index >= 0) node[index] = structuredClone(value);
				else node.push(structuredClone(value));
				return copy;
			}
			node = node[index] as Record<string, unknown>;
		} else {
			if (last) {
				if (value === undefined) delete node[key];
				else node[key] = structuredClone(value);
				return copy;
			}
			node = node[key] as Record<string, unknown>;
		}
		if (node === undefined || node === null) return copy;
	}
	return copy;
}
