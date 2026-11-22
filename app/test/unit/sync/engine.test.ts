// The research's twelve sync scenarios and its robustness cases, against the simulated cloud folder.
import { describe, expect, it } from 'vitest';
import { SimProvider } from '../../../src/lib/sync/providers/sim.ts';
import { character, Device, type Character } from './devices.ts';

const C = 'rig-c1';
async function pair() {
	const remote = new SimProvider();
	const desktop = new Device(remote),
		phone = new Device(remote);
	desktop.library.save(C, await character(desktop, 'Knight'));
	expect(await desktop.sync()).toBe('synced');
	expect(await phone.sync()).toBe('synced');
	return { remote, desktop, phone };
}
const edit = (device: Device, change: (c: Character) => void) => {
	const body = device.library.get(C);
	change(body);
	device.library.save(C, body);
};
const item = (c: Character, id: string) => c.manifest.items.find((i) => i.id === id)!;

describe('sync engine', () => {
	it('T1 downloads a new character with identical artwork', async () => {
		const { desktop, phone } = await pair();
		expect(phone.library.get(C)).toEqual(desktop.library.get(C));
		for (const hash of desktop.library.refs(desktop.library.get(C)))
			expect(phone.library.blobs.get(hash)).toEqual(desktop.library.blobs.get(hash));
	});

	it('T2 brings an edit from the phone to the desktop', async () => {
		const { desktop, phone } = await pair();
		edit(phone, (c) => (item(c, 'boots').color = 'red'));
		await phone.sync();
		await desktop.sync();
		expect(item(desktop.library.get(C), 'boots').color).toBe('red');
	});

	it('T3 merges edits to different items without a conflict', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => (item(c, 'helmet').color = 'gold'));
		edit(phone, (c) => (item(c, 'boots').color = 'red'));
		await desktop.sync();
		expect(await phone.sync()).toBe('synced');
		expect(await desktop.sync()).toBe('synced');
		for (const device of [desktop, phone]) {
			expect(item(device.library.get(C), 'helmet').color).toBe('gold');
			expect(item(device.library.get(C), 'boots').color).toBe('red');
		}
	});

	it('T4 keeps both versions of one item, converges, and syncs the resolution', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => (item(c, 'helmet').color = 'gold'));
		edit(phone, (c) => (item(c, 'helmet').name = 'Crown'));
		await desktop.sync();
		expect(await phone.sync()).toBe('conflict');
		expect(await desktop.sync()).toBe('conflict');
		expect(desktop.library.get(C)).toEqual(phone.library.get(C));
		const [note] = (await desktop.engine.conflicts()).get(C)!;
		expect(note.path).toEqual(['manifest', 'items', 'helmet']);
		const values = [note.a, note.b].map((v) => JSON.stringify(v));
		expect(values.some((v) => v.includes('gold'))).toBe(true);
		expect(values.some((v) => v.includes('Crown'))).toBe(true);
		expect(await desktop.engine.resolve(C, note, 'other')).toBe(true);
		const chosen = item(desktop.library.get(C), 'helmet');
		expect(await desktop.sync()).toBe('synced');
		expect(await phone.sync()).toBe('synced');
		expect(item(phone.library.get(C), 'helmet')).toEqual(chosen);
		expect((await phone.engine.conflicts()).size).toBe(0);
	});

	it('T5 reconciles days offline with edits made meanwhile', async () => {
		const { remote, desktop, phone } = await pair();
		for (let day = 0; day < 5; day++) {
			edit(desktop, (c) => (item(c, 'helmet').name = `helmet day ${day}`));
			await desktop.sync();
		}
		remote.offline = true;
		edit(phone, (c) => c.manifest.presets.push({ id: 'travel', name: 'Travel' }));
		expect(await phone.sync()).toBe('offline');
		remote.offline = false;
		await phone.sync();
		await desktop.sync();
		for (const device of [desktop, phone]) {
			expect(item(device.library.get(C), 'helmet').name).toBe('helmet day 4');
			expect(device.library.get(C).manifest.presets).toHaveLength(1);
		}
	});

	it('T6 resumes an interrupted upload without duplicates', async () => {
		const remote = new SimProvider();
		const desktop = new Device(remote);
		desktop.library.save(C, await character(desktop, 'Knight', ['a', 'b', 'c', 'd']));
		remote.failAfter = 4;
		expect(await desktop.sync()).toBe('offline');
		expect(await desktop.sync()).toBe('synced');
		const counts = new Map<string, number>();
		for (const path of remote.putLog)
			if (!path.startsWith('devices/')) counts.set(path, (counts.get(path) ?? 0) + 1);
		expect([...counts.values()].every((n) => n === 1)).toBe(true);
		const phone = new Device(remote);
		await phone.sync();
		expect(phone.library.get(C)).toEqual(desktop.library.get(C));
	});

	it('T7 restores everything after browser data is cleared', async () => {
		const { desktop } = await pair();
		const before = desktop.library.get(C);
		desktop.clear();
		expect(await desktop.sync()).toBe('synced');
		expect(desktop.library.get(C)).toEqual(before);
	});

	it('T8 asks before rebuilding a wiped cloud folder, then rebuilds it from local work', async () => {
		const { remote, desktop } = await pair();
		remote.files.clear();
		expect(await desktop.sync()).toBe('missing');
		desktop.reload(); // also after the page loads again
		expect(await desktop.sync()).toBe('missing');
		await desktop.engine.rebuild();
		expect(await desktop.sync()).toBe('synced');
		const fresh = new Device(remote);
		await fresh.sync();
		expect(fresh.library.get(C)).toEqual(desktop.library.get(C));
	});

	it('re-uploads by itself when only its heads file is gone (an older copy of the folder came back)', async () => {
		const { remote, desktop } = await pair();
		for (const path of [...remote.files.keys()])
			if (path.startsWith('devices/')) remote.files.delete(path);
		expect(await desktop.sync()).toBe('synced');
		expect([...remote.files.keys()].some((p) => p.startsWith('devices/'))).toBe(true);
	});

	it('a revision cut off by closing the tab is uploaded after the reload', async () => {
		const { remote, desktop, phone } = await pair();
		edit(desktop, (c) => c.manifest.items.push({ id: 'cape', name: 'cape', cells: [] }));
		edit(desktop, (c) => (c.manifest.name = 'Closed mid-upload'));
		const put = remote.put.bind(remote);
		remote.put = (path, bytes) =>
			path.startsWith('revs/') ? new Promise(() => {}) : put(path, bytes); // the tab closes here
		void desktop.sync();
		await new Promise((resolve) => setTimeout(resolve, 50));
		remote.put = put;
		desktop.reload();
		expect(await desktop.sync()).toBe('synced');
		await phone.sync();
		expect(phone.library.get(C).manifest.name).toBe('Closed mid-upload');
	});

	it('a device that stopped syncing costs nothing on later idle syncs', async () => {
		const { remote, desktop, phone } = await pair();
		const stale = new Device(remote);
		await stale.sync(); // then never opened again
		for (let i = 0; i < 3; i++) {
			edit(phone, (c) => (c.manifest.name = `edit ${i}`));
			await phone.sync();
		}
		await desktop.sync();
		await desktop.sync();
		remote.resetStats();
		await desktop.sync();
		expect(remote.stats.requests).toBe(1);
		expect(desktop.library.get(C).manifest.name).toBe('edit 2');
	});

	it('a lagging listing that misses its own heads file triggers no re-upload', async () => {
		const { remote, desktop } = await pair();
		const list = remote.list.bind(remote);
		remote.list = async (prefix) =>
			(await list(prefix)).filter((e) => !e.path.startsWith('devices/'));
		remote.resetStats();
		expect(await desktop.sync()).toBe('synced');
		remote.list = list;
		expect(remote.stats.puts).toBe(0);
	});

	it('T9 pauses when the cloud is full and resumes when space returns', async () => {
		const { remote, desktop, phone } = await pair();
		remote.quota = remote.used();
		edit(desktop, (c) => c.manifest.items.push({ id: 'cape', name: 'cape', cells: [] }));
		expect(await desktop.sync()).toBe('cloud-full');
		edit(desktop, (c) => (c.manifest.name = 'Saved locally anyway'));
		expect(desktop.library.get(C).manifest.name).toBe('Saved locally anyway');
		remote.quota = Infinity;
		expect(await desktop.sync()).toBe('synced');
		await phone.sync();
		expect(phone.library.get(C)).toEqual(desktop.library.get(C));
	});

	it('T10 switches provider by re-uploading, and a rerun uploads nothing new', async () => {
		const { desktop } = await pair();
		const other = new SimProvider();
		desktop.use(other);
		expect(await desktop.sync()).toBe('synced');
		const puts = other.stats.puts;
		expect(await desktop.sync()).toBe('synced');
		expect(other.stats.puts).toBe(puts);
		const fresh = new Device(other);
		await fresh.sync();
		expect(fresh.library.get(C)).toEqual(desktop.library.get(C));
	});

	it('T11 a delete never beats an edit, and deletes an untouched copy', async () => {
		const { desktop, phone } = await pair();
		desktop.library.remove(C);
		edit(phone, (c) => (item(c, 'boots').color = 'red'));
		await desktop.sync();
		await phone.sync();
		await desktop.sync();
		expect(item(desktop.library.get(C), 'boots').color).toBe('red');
		expect(item(phone.library.get(C), 'boots').color).toBe('red');

		desktop.library.deleted.clear();
		desktop.library.remove(C);
		await desktop.sync();
		await phone.sync();
		expect(phone.library.records.has(C)).toBe(false);
	});

	it('T12 a refused apply (busy character) is retried on the next sync', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => (c.manifest.name = 'Paladin'));
		await desktop.sync();
		phone.library.busy = true;
		await phone.sync();
		expect(phone.library.get(C).manifest.name).toBe('Knight');
		phone.library.busy = false;
		await phone.sync();
		expect(phone.library.get(C).manifest.name).toBe('Paladin');
	});

	it('merges deterministically: two devices merging the same heads write one revision', async () => {
		const { remote, desktop, phone } = await pair();
		edit(desktop, (c) => (item(c, 'helmet').color = 'gold'));
		edit(phone, (c) => (item(c, 'boots').color = 'red'));
		await desktop.sync();
		await phone.sync();
		await desktop.sync();
		const heads = [...remote.files.keys()].filter((p) => p.startsWith('devices/'));
		const values = heads.map(
			(p) => JSON.parse(new TextDecoder().decode(remote.files.get(p)!.bytes)).heads[C]
		);
		expect(new Set(values).size).toBe(1);
	});

	it('the same item id added on two devices is a conflict, not a mix', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => c.manifest.items.push({ id: 'cape', name: 'Red cape' }));
		edit(phone, (c) => c.manifest.items.push({ id: 'cape', name: 'Blue cape' }));
		await desktop.sync();
		expect(await phone.sync()).toBe('conflict');
		const [note] = (await phone.engine.conflicts()).get(C)!;
		expect(note.path).toEqual(['manifest', 'items', 'cape']);
	});

	it('what a character wears syncs without conflicts', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => (c.dress = { head: 'helmet' }));
		edit(phone, (c) => (c.dress = { head: 'none' }));
		await desktop.sync();
		expect(await phone.sync()).toBe('synced');
		expect(await desktop.sync()).toBe('synced');
		expect(desktop.library.get(C).dress).toEqual(phone.library.get(C).dress);
	});

	it('never applies a corrupt revision or artwork', async () => {
		const { remote, desktop, phone } = await pair();
		edit(desktop, async (c) => (item(c, 'boots').name = 'Corrupted'));
		await desktop.sync();
		for (const path of remote.files.keys())
			if (path.startsWith('revs/') || path.startsWith('objects/')) remote.corrupt(path);
		await phone.sync();
		expect(item(phone.library.get(C), 'boots').name).toBe('boots');

		const fresh = new Device(remote);
		const art = new SimProvider();
		fresh.use(art);
		for (const [path, file] of remote.files)
			art.files.set(path, { ...file, bytes: file.bytes.slice() });
		for (const path of art.files.keys()) if (path.endsWith('.zip')) art.corrupt(path);
		await fresh.sync();
		expect(fresh.library.records.size).toBe(0);
	});

	it('lagging listings only delay', async () => {
		const { remote, desktop, phone } = await pair();
		remote.listLag = 3;
		edit(desktop, (c) => (c.manifest.name = 'Late'));
		await desktop.sync();
		await phone.sync();
		remote.listLag = 0;
		await phone.sync();
		expect(phone.library.get(C).manifest.name).toBe('Late');
	});

	it('an evicted library is restored, never synced as deletes', async () => {
		const { desktop, phone } = await pair();
		phone.library.records.clear(); // gone without the user deleting it
		await phone.sync();
		await desktop.sync();
		expect(desktop.library.records.has(C)).toBe(true);
		expect(phone.library.records.has(C)).toBe(true);
	});

	it('an idle sync is one request', async () => {
		const { remote, desktop } = await pair();
		await desktop.sync();
		remote.resetStats();
		await desktop.sync();
		expect(remote.stats.requests).toBe(1);
	});

	it('pauses for a newer build instead of merging across formats', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => (c.manifest.format = 'pixeldoll/99'));
		await desktop.sync();
		expect(await phone.sync()).toBe('update');
		expect(phone.library.get(C).manifest.format).toBe('pixeldoll/3');
	});

	it('a vanished cloud folder waits for the user before rebuilding', async () => {
		const { remote, desktop } = await pair();
		const list = remote.list.bind(remote);
		remote.list = async () => {
			throw new (await import('../../../src/lib/sync/providers/types.ts')).SyncError(
				'missing',
				'trashed'
			);
		};
		expect(await desktop.sync()).toBe('missing');
		remote.list = list;
		expect(await desktop.sync()).toBe('missing');
		await desktop.engine.rebuild();
		expect(await desktop.sync()).toBe('synced');
	});

	it('two libraries that already existed merge by id without duplicates', async () => {
		const remote = new SimProvider();
		const a = new Device(remote),
			b = new Device(remote);
		const shared = await character(a, 'Knight');
		a.library.save(C, shared);
		await character(b, 'Knight');
		b.library.save(C, structuredClone(shared));
		b.library.save('rig-c2', await character(b, 'Mage'));
		await a.sync();
		expect(await b.sync()).toBe('synced');
		await a.sync();
		expect([...a.library.records.keys()].sort()).toEqual([C, 'rig-c2']);
		expect(a.library.get(C).manifest.items).toHaveLength(2);
	});

	it('restores an earlier version as a new edit', async () => {
		const { desktop, phone } = await pair();
		edit(desktop, (c) => (c.manifest.name = 'Second'));
		await desktop.sync();
		const history = await desktop.engine.history(C);
		expect(history).toHaveLength(2);
		expect(await desktop.engine.restore(C, history[1].id)).toBe(true);
		expect(desktop.library.get(C).manifest.name).toBe('Knight');
		await desktop.sync();
		await phone.sync();
		expect(phone.library.get(C).manifest.name).toBe('Knight');
	});
});

// Written by the research's A4 reviewer against the proof of concept, adapted to item-level merging: three devices, random
// edits and syncs with lagging listings. After quiescence every device converges, and every write that was not
// overwritten later is still in the body or a conflict note.
describe('sync fuzz', () => {
	let seed = 1;
	const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
	const pick = <T>(list: T[]) => list[(rand() * list.length) | 0];

	async function run(s: number) {
		seed = s;
		const remote = new SimProvider();
		const devices = [0, 1, 2].map(() => new Device(remote));
		devices[0].library.save(C, {
			manifest: {
				format: 'pixeldoll/3',
				name: 'c',
				items: ['i0', 'i1'].map((id) => ({ id, name: 'n0', color: 'c0' })),
				presets: []
			}
		});
		for (const device of devices) await device.sync();
		const superseded = new Set<string>(),
			written: string[] = [];
		let n = 0;
		for (let step = 0; step < 60; step++) {
			remote.listLag = rand() < 0.4 ? 1 + ((rand() * 3) | 0) : 0;
			const device = pick(devices);
			if (rand() < 0.55) {
				const body = device.library.get(C);
				const target = body.manifest.items.find((i) => i.id === pick(['i0', 'i1']));
				if (!target) continue;
				const field = pick(['name', 'color'] as const);
				superseded.add(target[field]!);
				target[field] = `w${n++}`;
				written.push(target[field]!);
				device.library.save(C, body);
			} else await device.sync();
		}
		remote.listLag = 0;
		for (let round = 0; round < 4; round++) for (const device of devices) await device.sync();
		const bodies = devices.map((d) => JSON.stringify(d.library.get(C)));
		const all = (
			await Promise.all(
				devices.map(async (d) =>
					JSON.stringify([d.library.get(C), [...(await d.engine.conflicts()).values()]])
				)
			)
		).join('');
		const lost = written.filter((w) => !superseded.has(w) && !all.includes(`"${w}"`));
		return { converged: bodies.every((b) => b === bodies[0]), lost };
	}

	it('converges and loses no write over 300 seeds', async () => {
		const failures: string[] = [];
		for (let s = 1; s <= 300; s++) {
			const result = await run(s);
			if (!result.converged || result.lost.length)
				failures.push(`seed ${s}: converged=${result.converged} lost=${result.lost.join(',')}`);
		}
		expect(failures).toEqual([]);
	}, 120_000);
});
