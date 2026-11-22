// Baseline for comparison: what most "sync to Drive" code does. One file per character, overwritten on every push; a pull
// takes any remote file that changed unless the local copy has unsynced edits, which then overwrite it (last writer wins).
import { stableStringify } from './merge.ts';
import type { Provider } from './provider.ts';
import { blobRefs, type Local } from './engine.ts';

const enc = new TextEncoder(),
	dec = new TextDecoder();

export class LwwEngine {
	seen = new Map<string, string>(); // path -> etag
	synced = new Map<string, number>();
	local: Local;
	remote: Provider;
	constructor(local: Local, remote: Provider) {
		this.local = local;
		this.remote = remote;
	}
	async sync() {
		const L = this.local;
		for (const e of await this.remote.list('chars/')) {
			const id = e.path.slice(6, -5);
			const dirty = (L.version.get(id) ?? 0) !== (this.synced.get(id) ?? 0);
			if (this.seen.get(e.path) === e.etag || dirty) continue;
			const body = JSON.parse(dec.decode((await this.remote.get(e.path))!));
			for (const h of blobRefs(body))
				if (!L.blobs.has(h)) L.blobs.set(h, (await this.remote.get(`blobs/${h}`))!);
			if (body === null) L.records.delete(id);
			else L.records.set(id, body);
			this.seen.set(e.path, e.etag);
		}
		const remoteBlobs = new Set((await this.remote.list('blobs/')).map((e) => e.path.slice(6)));
		for (const [id, v] of L.version) {
			if (v === (this.synced.get(id) ?? 0)) continue;
			const body = L.records.get(id) ?? null;
			for (const h of blobRefs(body)) if (!remoteBlobs.has(h)) await this.remote.put(`blobs/${h}`, L.blobs.get(h)!);
			const e = await this.remote.put(`chars/${id}.json`, enc.encode(stableStringify(body)));
			this.seen.set(e.path, e.etag);
			this.synced.set(id, v);
		}
	}
}
