// Test devices for the sync engine: an in-memory library standing in for PixelDoll's IndexedDB, with artwork keyed by
// the SHA-256 of its bytes, plus the engine's own memory store.
import { sha256, stableStringify } from '../../../src/lib/image/hash.ts';
import { Engine, type Library } from '../../../src/lib/sync/core/engine.ts';
import { MemoryStore } from '../../../src/lib/sync/core/store.ts';
import type { Provider } from '../../../src/lib/sync/providers/types.ts';

const refsOf = (value: unknown, out = new Set<string>()) => {
	if (typeof value === 'string') {
		const match = /^sha256:([0-9a-f]{64})$/.exec(value);
		if (match) out.add(match[1]);
	} else if (value && typeof value === 'object')
		for (const v of Object.values(value)) refsOf(v, out);
	return out;
};

export class MemLibrary implements Library {
	records = new Map<string, unknown>();
	blobs = new Map<string, Uint8Array>();
	deleted = new Set<string>();
	busy = false;
	applied = 0;
	policy = { quiet: (path: (string | number)[]) => path[0] === 'dress' };
	async read() {
		return { bodies: structuredClone(this.records), deleted: new Set(this.deleted) };
	}
	refs(body: unknown) {
		return [...refsOf(body)];
	}
	async blob(hash: string) {
		return this.blobs.get(hash);
	}
	async verify(hash: string, bytes: Uint8Array) {
		return (await sha256(bytes)) === hash;
	}
	async apply(id: string, expected: unknown, next: unknown, art: Map<string, Uint8Array>) {
		if (this.busy || stableStringify(this.records.get(id)) !== stableStringify(expected))
			return false;
		for (const [hash, bytes] of art) this.blobs.set(hash, bytes);
		if (next === undefined) this.records.delete(id);
		else this.records.set(id, structuredClone(next));
		this.applied++;
		return true;
	}
	check(body: unknown) {
		const manifest = (body as { manifest?: { format?: string; items?: { id: string }[] } })
			.manifest;
		if (manifest?.format === 'pixeldoll/99') return 'newer' as const;
		return manifest && Array.isArray(manifest.items) ? ('ok' as const) : ('invalid' as const);
	}
	// ---- what a user does ----
	async art(text: string) {
		const bytes = new TextEncoder().encode(text);
		const hash = await sha256(bytes);
		this.blobs.set(hash, bytes);
		return `sha256:${hash}`;
	}
	get(id: string) {
		return structuredClone(this.records.get(id)) as Character;
	}
	save(id: string, body: Character) {
		this.records.set(id, structuredClone(body));
	}
	remove(id: string) {
		this.records.delete(id);
		this.deleted.add(id);
	}
}

export interface Item {
	id: string;
	name: string;
	color?: string;
	cells?: string[];
}
export interface Character {
	manifest: {
		format: string;
		name: string;
		items: Item[];
		presets: { id: string; name: string }[];
	};
	dress?: Record<string, string>;
}

export class Device {
	library = new MemLibrary();
	store = new MemoryStore();
	engine: Engine;
	account = 'first';
	constructor(public remote: Provider) {
		this.engine = new Engine(this.store, remote, this.library, { account: this.account });
	}
	/** Another provider account (a provider switch). */
	use(remote: Provider, account = 'second') {
		this.remote = remote;
		this.account = account;
		this.engine = new Engine(this.store, remote, this.library, { account });
	}
	/** The tab closed and the page loaded again: same stored state, a new engine. */
	reload() {
		this.engine = new Engine(this.store, this.remote, this.library, { account: this.account });
	}
	sync() {
		return this.engine.sync();
	}
	/** Browser data cleared: everything local is gone, the device starts over. */
	clear() {
		this.library = new MemLibrary();
		this.store = new MemoryStore();
		this.engine = new Engine(this.store, this.remote, this.library, { account: this.account });
	}
}

export async function character(device: Device, name: string, items = ['helmet', 'boots']) {
	const lib = device.library;
	return {
		manifest: {
			format: 'pixeldoll/3',
			name,
			items: await Promise.all(
				items.map(async (id) => ({
					id,
					name: id,
					color: 'gray',
					cells: [await lib.art(`${name}-${id}-0`), await lib.art(`${name}-${id}-1`)]
				}))
			),
			presets: []
		}
	} satisfies Character;
}
