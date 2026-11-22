// The handoff's twelve sync tests, plus corruption, lagging listings and deterministic merges, against the simulated
// drive. Run: node --test docs/research/2026-11-22-storage-sync/poc/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, Local, blobRefs } from './engine.ts';
import { NetworkError, SimProvider, copyAll, type Provider } from './provider.ts';
import { LwwEngine } from './lww.ts';
import { cell, character, reseed, validate } from './dataset.ts';

const SMALL = { items: 4, moves: 2, dirs: 4, frames: 4, cellBytes: 600 };
type Body = Awaited<ReturnType<typeof character>>;

/** One device's connection to the shared drive, which it can lose on its own. */
function link(p: Provider) {
	const l = {
		offline: false,
		list: (x: string) => (l.offline ? Promise.reject(new NetworkError('offline')) : p.list(x)),
		get: (x: string, r?: { start: number; end: number }) => (l.offline ? Promise.reject(new NetworkError('offline')) : p.get(x, r)),
		put: (x: string, b: Uint8Array) => (l.offline ? Promise.reject(new NetworkError('offline')) : p.put(x, b)),
		del: (x: string) => (l.offline ? Promise.reject(new NetworkError('offline')) : p.del(x))
	};
	return l;
}
function world(packs = false) {
	reseed(7);
	const remote = new SimProvider();
	const mk = (name: string) => {
		const local = new Local(name),
			net = link(remote);
		return { local, net, engine: new Engine(local, net, { validate, packs }) };
	};
	return { remote, desk: mk('desktop'), phone: mk('phone') };
}
const body = (l: Local, id: string) => structuredClone(l.records.get(id)) as Body;
function sameArtwork(a: Local, b: Local, id: string) {
	for (const h of blobRefs(a.records.get(id))) assert.deepEqual(b.blobs.get(h), a.blobs.get(h), `cell ${h} intact`);
}

for (const packs of [false, true]) {
	const w = () => world(packs);
	const tag = packs ? ' [packs]' : '';

	test(`T1 desktop creates a character, phone downloads it intact${tag}`, async () => {
		const { desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		assert.equal(await desk.engine.sync(), 'synced');
		assert.equal(await phone.engine.sync(), 'synced');
		assert.deepEqual(phone.local.records.get('c1'), desk.local.records.get('c1'));
		sameArtwork(desk.local, phone.local, 'c1');
	});

	test(`T2 phone edits, desktop retrieves the edit${tag}`, async () => {
		const { desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		await desk.engine.sync();
		await phone.engine.sync();
		const b = body(phone.local, 'c1');
		b.name = 'Sir Knight';
		b.items[1].layers[0].cells.move0.south[2] = await cell(phone.local);
		phone.local.save('c1', b);
		await phone.engine.sync();
		await desk.engine.sync();
		assert.deepEqual(desk.local.records.get('c1'), b);
		sameArtwork(phone.local, desk.local, 'c1');
	});

	test(`T3 different items edited on each device merge (and frame 1 vs frame 2 of one item)${tag}`, async () => {
		const { desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		await desk.engine.sync();
		await phone.engine.sync();
		const d = body(desk.local, 'c1'),
			p = body(phone.local, 'c1');
		d.materials[1].ramp = ['#ff0000', '#aa0000', '#550000']; // helmet color
		p.items[2].prompt = 'leather boots'; // boots
		d.items[3].layers[0].cells.move1.east[0] = await cell(desk.local); // same item, frame 1 ...
		p.items[3].layers[0].cells.move1.east[1] = await cell(phone.local); // ... and frame 2
		desk.local.save('c1', d);
		phone.local.save('c1', p);
		await desk.engine.sync();
		assert.equal(await phone.engine.sync(), 'synced');
		await desk.engine.sync();
		const m = body(desk.local, 'c1');
		assert.deepEqual(m.materials[1].ramp, d.materials[1].ramp);
		assert.equal(m.items[2].prompt, 'leather boots');
		assert.equal(m.items[3].layers[0].cells.move1.east[0], d.items[3].layers[0].cells.move1.east[0]);
		assert.equal(m.items[3].layers[0].cells.move1.east[1], p.items[3].layers[0].cells.move1.east[1]);
		assert.deepEqual(phone.local.records.get('c1'), m);
		assert.equal(desk.local.conflicts('c1').length, 0);
	});

	test(`T4 same item edited on both: conflict detected, both versions kept, resolution syncs${tag}`, async () => {
		const { remote, desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		await desk.engine.sync();
		await phone.engine.sync();
		const d = body(desk.local, 'c1'),
			p = body(phone.local, 'c1');
		d.materials[1].ramp = ['#ff0000', '#aa0000', '#550000'];
		p.materials[1].ramp = ['#00ff00', '#00aa00', '#005500'];
		const red = (d.items[1].layers[0].cells.move0.south[0] = await cell(desk.local));
		const green = (p.items[1].layers[0].cells.move0.south[0] = await cell(phone.local));
		desk.local.save('c1', d);
		phone.local.save('c1', p);
		await desk.engine.sync();
		assert.equal(await phone.engine.sync(), 'conflict');
		assert.equal(await desk.engine.sync(), 'conflict');
		assert.deepEqual(desk.local.records.get('c1'), phone.local.records.get('c1'), 'both show the same value');
		for (const l of [desk.local, phone.local]) {
			const notes = l.conflicts('c1');
			assert.equal(notes.length, 2);
			const art = notes.find((n) => String(n.path.at(-1)) === '0')!;
			assert.deepEqual(new Set([art.a, art.b]), new Set([red, green]));
			assert.ok(l.blobs.has(red.slice(7)) && l.blobs.has(green.slice(7)), 'both images kept locally');
		}
		const stored = [...remote.files.keys()].join('\n');
		assert.ok(stored.includes(red.slice(7)) || packs, 'red art kept remotely');
		assert.ok(stored.includes(green.slice(7)) || packs, 'green art kept remotely');
		// The user keeps green on the phone.
		const r = body(phone.local, 'c1');
		r.materials[1].ramp = p.materials[1].ramp;
		r.items[1].layers[0].cells.move0.south[0] = green;
		phone.local.resolve('c1', r);
		assert.equal(await phone.engine.sync(), 'synced');
		assert.equal(await desk.engine.sync(), 'synced');
		assert.deepEqual(desk.local.records.get('c1'), r);
	});

	test(`T5 offline device reconciles after days of edits on the other${tag}`, async () => {
		const { desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		desk.local.save('c2', await character(desk.local, 'Mage', SMALL));
		await desk.engine.sync();
		await phone.engine.sync();
		phone.net.offline = true;
		for (let day = 0; day < 5; day++) {
			const p = body(phone.local, 'c1');
			p.items[1].layers[0].cells.move0.west[day % 4] = await cell(phone.local);
			phone.local.save('c1', p);
			assert.equal(await phone.engine.sync(), 'offline');
			const d = body(desk.local, 'c1');
			d.items[2].name = `Boots v${day}`;
			desk.local.save('c1', d);
			const m = body(desk.local, 'c2');
			m.name = `Mage ${day}`;
			desk.local.save('c2', m);
			await desk.engine.sync();
		}
		const offlineArt = body(phone.local, 'c1').items[1].layers[0].cells.move0.west;
		phone.net.offline = false;
		assert.equal(await phone.engine.sync(), 'synced');
		await desk.engine.sync();
		for (const l of [desk.local, phone.local]) {
			const c1 = body(l, 'c1');
			assert.deepEqual(c1.items[1].layers[0].cells.move0.west, offlineArt);
			assert.equal(c1.items[2].name, 'Boots v4');
			assert.equal(body(l, 'c2').name, 'Mage 4');
		}
		sameArtwork(phone.local, desk.local, 'c1');
	});

	test(`T6 an upload cut off midway resumes without corruption or duplicate transfers${tag}`, async () => {
		const { remote, desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', { ...SMALL, items: 6 }));
		remote.failAfter = packs ? 2 : 40;
		assert.equal(await desk.engine.sync(), 'offline');
		assert.equal(await phone.engine.sync(), 'synced');
		assert.equal(phone.local.records.size, 0, 'nothing half-written is visible');
		assert.equal(await desk.engine.sync(), 'synced');
		const objects = remote.putLog.filter((k) => !k.startsWith('devices/'));
		assert.equal(new Set(objects).size, objects.length, 'no object uploaded twice');
		await phone.engine.sync();
		assert.deepEqual(phone.local.records.get('c1'), desk.local.records.get('c1'));
		sameArtwork(desk.local, phone.local, 'c1');
	});

	test(`T7 cleared browser data: everything comes back from the cloud${tag}`, async () => {
		const { remote, desk } = w();
		for (const n of ['A', 'B', 'C']) desk.local.save(n, await character(desk.local, n, SMALL));
		await desk.engine.sync();
		const fresh = new Local('desktop-after-clear');
		assert.equal(await new Engine(fresh, remote, { validate, packs }).sync(), 'synced');
		assert.deepEqual([...fresh.records.keys()].sort(), ['A', 'B', 'C']);
		for (const n of ['A', 'B', 'C']) {
			assert.deepEqual(fresh.records.get(n), desk.local.records.get(n));
			sameArtwork(desk.local, fresh, n);
		}
	});

	test(`T8 disconnecting keeps local work, and a wiped cloud folder is rebuilt from it${tag}`, async () => {
		const { remote, desk } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		await desk.engine.sync();
		const kept = structuredClone(desk.local.records.get('c1'));
		desk.net.offline = true; // disconnected: no sync at all
		const b = body(desk.local, 'c1');
		b.name = 'Edited while disconnected';
		desk.local.save('c1', b);
		assert.equal(desk.local.records.size, 1);
		remote.files.clear(); // the user deletes the cloud folder
		desk.net.offline = false;
		assert.equal(await desk.engine.sync(), 'synced', 'its own heads file is gone, so it re-uploads by itself');
		assert.equal(body(desk.local, 'c1').name, 'Edited while disconnected');
		assert.notDeepEqual(kept, desk.local.records.get('c1'));
		const fresh = new Local('check');
		await new Engine(fresh, remote, { validate, packs }).sync();
		assert.deepEqual(fresh.records.get('c1'), desk.local.records.get('c1'));
	});

	test(`T9 cloud storage full: local saving continues, sync pauses with a clear state, then resumes${tag}`, async () => {
		const { remote, desk, phone } = w();
		remote.quota = 20_000;
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		assert.equal(await desk.engine.sync(), 'cloud-full');
		const b = body(desk.local, 'c1');
		b.name = 'Still saving locally';
		desk.local.save('c1', b);
		assert.equal(desk.local.records.size, 1);
		assert.equal(await phone.engine.sync(), 'synced');
		assert.equal(phone.local.records.size, 0);
		remote.quota = Infinity; // the user frees space or upgrades
		assert.equal(await desk.engine.sync(), 'synced');
		await phone.engine.sync();
		assert.equal(body(phone.local, 'c1').name, 'Still saving locally');
	});

	test(`T10 switching providers migrates every file and keeps history${tag}`, async () => {
		const { remote, desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		await desk.engine.sync();
		const b = body(desk.local, 'c1');
		b.name = 'v2';
		desk.local.save('c1', b);
		await desk.engine.sync();
		const other = new SimProvider();
		await copyAll(remote, other);
		assert.equal(await copyAll(remote, other), 1, 'a rerun copies only the heads file again');
		const copiedPuts = other.putLog.length;
		desk.engine.rebuild();
		desk.engine.remote = other;
		phone.engine.remote = other;
		assert.equal(await desk.engine.sync(), 'synced');
		assert.equal(await phone.engine.sync(), 'synced');
		assert.equal(body(phone.local, 'c1').name, 'v2');
		sameArtwork(desk.local, phone.local, 'c1');
		assert.equal([...other.files.keys()].filter((k) => k.startsWith('revs/')).length, 2, 'both revisions moved');
		assert.equal(other.putLog.length - copiedPuts, 1, 'the switched device found everything already there: one heads write');
	});

	test(`T11 delete on one device vs unsynced edits on another: the edits survive and are flagged${tag}`, async () => {
		const { desk, phone } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		await desk.engine.sync();
		await phone.engine.sync();
		desk.local.remove('c1');
		await desk.engine.sync();
		phone.net.offline = true;
		const p = body(phone.local, 'c1');
		p.items[1].name = 'Edited offline';
		phone.local.save('c1', p);
		await phone.engine.sync();
		phone.net.offline = false;
		assert.equal(await phone.engine.sync(), 'conflict');
		await desk.engine.sync();
		for (const l of [desk.local, phone.local]) {
			assert.equal(body(l, 'c1').items[1].name, 'Edited offline');
			assert.deepEqual(l.conflicts('c1')[0].path, []);
		}
		// A delete of an untouched copy is not a conflict: it just deletes.
		desk.local.remove('c1');
		await desk.engine.sync();
		await phone.engine.sync();
		assert.equal(phone.local.records.has('c1'), false);
	});

	test(`T12 two tabs of one browser do not duplicate or clobber sync work${tag}`, async () => {
		const { remote, desk } = w();
		desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
		const tab2 = new Engine(desk.local, desk.net, { validate, packs });
		await Promise.all([desk.engine.sync(), tab2.sync()]);
		const locked = remote.stats.puts;
		const { remote: r2, desk: d2 } = w();
		d2.local.save('c1', await character(d2.local, 'Knight', SMALL));
		const t1 = new Engine(d2.local, d2.net, { validate, packs, useLock: false }),
			t2 = new Engine(d2.local, d2.net, { validate, packs, useLock: false });
		await Promise.all([t1.sync(), t2.sync()]);
		console.log(`T12${tag}: puts with Web Lock ${locked}, without ${r2.stats.puts}`);
		assert.ok(locked < r2.stats.puts, 'the lock removes duplicate uploads');
		assert.equal([...remote.files.keys()].filter((k) => k.startsWith('revs/')).length, 1);
	});
}

test('Merges are deterministic: two devices merging the same heads write the same revision', async () => {
	const { remote, desk, phone } = world();
	desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
	await desk.engine.sync();
	await phone.engine.sync();
	const d = body(desk.local, 'c1'),
		p = body(phone.local, 'c1');
	d.items[1].name = 'desk';
	p.items[2].name = 'phone';
	desk.local.save('c1', d);
	phone.local.save('c1', p);
	desk.net.offline = phone.net.offline = true;
	await desk.engine.sync();
	await phone.engine.sync();
	desk.net.offline = phone.net.offline = false;
	// Push both edits without merging (each device pushes before it sees the other), then both merge.
	await desk.engine.sync();
	await phone.engine.sync();
	await desk.engine.sync();
	await phone.engine.sync();
	const revs = [...remote.files.keys()].filter((k) => k.startsWith('revs/'));
	assert.equal(revs.length, 4, 'base, two edits, one shared merge');
	assert.equal(desk.local.meta.get('c1')!.base, phone.local.meta.get('c1')!.base);
});

test('The same item added on two devices under one id is kept twice, not blended', async () => {
	const { desk, phone } = world();
	desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
	await desk.engine.sync();
	await phone.engine.sync();
	const d = body(desk.local, 'c1'),
		p = body(phone.local, 'c1');
	const helmet = (prompt: string, art: string) => ({ ...structuredClone(d.items[1]), id: 'helmet', name: 'Helmet', prompt, layers: [{ id: 'main', role: 'fg', z: 9, cells: { move0: { south: [art] } } }] });
	d.items.push(helmet('iron helmet', await cell(desk.local)));
	p.items.push(helmet('leather cap', await cell(phone.local)));
	desk.local.save('c1', d);
	phone.local.save('c1', p);
	await desk.engine.sync();
	await phone.engine.sync();
	await desk.engine.sync();
	const m = body(desk.local, 'c1');
	const helmets = m.items.filter((i) => i.id.startsWith('helmet'));
	assert.deepEqual(new Set(helmets.map((h) => h.prompt)), new Set(['iron helmet', 'leather cap']));
	assert.deepEqual(phone.local.records.get('c1'), m);
	assert.equal(desk.local.conflicts('c1').length, 1);
});

test('Browser eviction or Delete local work never propagates as deletes', async () => {
	const { remote, desk, phone } = world();
	desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
	await desk.engine.sync();
	await phone.engine.sync();
	// The browser evicts the phone's whole database (records and sync metadata alike): it comes back as a new device.
	const evicted = new Local('phone-after-eviction');
	await new Engine(evicted, remote, { validate }).sync();
	await desk.engine.sync();
	assert.ok(desk.local.records.has('c1'), 'nothing deleted on the other device');
	assert.deepEqual(evicted.records.get('c1'), desk.local.records.get('c1'), 'and the evicted device is restored');
});

test('Catching up after 150 syncs elsewhere downloads only the heads and their common ancestor', async () => {
	const { remote, desk, phone } = world();
	desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
	await desk.engine.sync();
	await phone.engine.sync();
	const p = body(phone.local, 'c1');
	p.items[3].prompt = 'offline edit';
	phone.local.save('c1', p);
	for (let i = 0; i < 150; i++) {
		const d = body(desk.local, 'c1');
		d.name = `v${i}`;
		desk.local.save('c1', d);
		await desk.engine.sync();
	}
	remote.reset();
	assert.equal(await phone.engine.sync(), 'synced');
	const m = body(phone.local, 'c1');
	assert.equal(m.name, 'v149');
	assert.equal(m.items[3].prompt, 'offline edit');
	console.log(`catch-up after 150 syncs: ${remote.stats.requests} requests, ${remote.stats.gets} downloads`);
	assert.ok(remote.stats.gets <= 6, `downloads ${remote.stats.gets}`);
});

test('Revision growth: a one-field edit stores only the changed item, not the whole character', async () => {
	const { remote, desk } = world();
	desk.local.save('c1', await character(desk.local, 'Knight', { items: 10, moves: 8, dirs: 8, frames: 6, cellBytes: 100 }));
	await desk.engine.sync();
	const art = [...remote.files].filter(([k]) => k.startsWith('blobs/')).reduce((n, [, f]) => n + f.bytes.length, 0);
	const first = remote.used() - art;
	for (let i = 0; i < 50; i++) {
		const d = body(desk.local, 'c1');
		d.items[i % 10].prompt = `edit ${i}`;
		desk.local.save('c1', d);
		await desk.engine.sync();
	}
	const growth = (remote.used() - art - first) / 50;
	console.log(`first revision ${(first / 1024).toFixed(0)} KB; each one-field edit adds ${(growth / 1024).toFixed(1)} KB`);
	assert.ok(growth < first / 5);
});

test('Corrupt remote files are never applied', async () => {
	const { remote, desk, phone } = world();
	desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
	await desk.engine.sync();
	const blob = [...remote.files.keys()].find((k) => k.startsWith('blobs/'))!;
	remote.corrupt(blob);
	await phone.engine.sync();
	assert.equal(phone.local.records.has('c1'), false, 'a character with a corrupt cell is not applied');
	assert.equal(phone.local.blobs.has(blob.slice(6)), false);
	const rev = [...remote.files.keys()].find((k) => k.startsWith('revs/'))!;
	remote.corrupt(rev);
	const fresh = new Local('x');
	await new Engine(fresh, remote, { validate }).sync();
	assert.equal(fresh.records.size, 0);
});

test('Lagging listings only delay a sync', async () => {
	const { remote, desk, phone } = world();
	remote.listLag = 3;
	desk.local.save('c1', await character(desk.local, 'Knight', SMALL));
	await desk.engine.sync();
	await phone.engine.sync();
	assert.equal(phone.local.records.size, 0, 'heads file not listed yet');
	remote.listLag = 0;
	await remote.put('unrelated', new Uint8Array(1));
	await phone.engine.sync();
	assert.deepEqual(phone.local.records.get('c1'), desk.local.records.get('c1'));
});

test('Baseline: last-writer-wins file sync loses work in T3 and T11', async () => {
	reseed(7);
	const remote = new SimProvider();
	const desk = new Local('desktop'),
		phone = new Local('phone');
	const D = new LwwEngine(desk, remote),
		P = new LwwEngine(phone, remote);
	desk.save('c1', await character(desk, 'Knight', SMALL));
	await D.sync();
	await P.sync();
	const d = structuredClone(desk.records.get('c1')) as Body,
		p = structuredClone(phone.records.get('c1')) as Body;
	d.materials[1].ramp = ['#ff0000', '#aa0000', '#550000'];
	p.items[2].prompt = 'leather boots';
	desk.save('c1', d);
	phone.save('c1', p);
	await D.sync();
	await P.sync();
	await D.sync();
	const m = desk.records.get('c1') as Body;
	assert.notDeepEqual(m.materials[1].ramp, d.materials[1].ramp, 'the desktop recolor was silently lost');
	assert.equal(m.items[2].prompt, 'leather boots');
	desk.remove('c1');
	await D.sync();
	const q = structuredClone(phone.records.get('c1')) as Body;
	q.name = 'edited';
	phone.save('c1', q);
	await P.sync();
	await D.sync();
	assert.equal((desk.records.get('c1') as Body).name, 'edited', 'LWW happened to keep the edit here only because it was written last');
});
