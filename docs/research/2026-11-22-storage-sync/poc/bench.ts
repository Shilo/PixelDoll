// Transfer and CPU benchmark of the PoC engine (per-file artwork vs packs) and the last-writer-wins baseline on identical
// synthetic workspaces. Network time is a model, not a measurement: requests run `parallel` at a time with `rtt` each, plus
// bytes over bandwidth. CPU time is measured wall time of the in-memory sync (hashing, gzip, merge, JSON).
// Run: node docs/research/2026-11-22-storage-sync/poc/bench.ts [small|medium|large]
import { Engine, Local } from './engine.ts';
import { SimProvider, type Stats } from './provider.ts';
import { LwwEngine } from './lww.ts';
import { cell, character, reseed, validate, type Shape } from './dataset.ts';

const sizes: Record<string, { chars: number; shape: Shape }> = {
	small: { chars: 3, shape: { items: 6, moves: 4, dirs: 4, frames: 6, cellBytes: 700 } },
	medium: { chars: 10, shape: { items: 8, moves: 6, dirs: 4, frames: 6, cellBytes: 900 } },
	large: { chars: 20, shape: { items: 10, moves: 8, dirs: 8, frames: 6, cellBytes: 900 } }
};
const NETS = {
	desktop: { rtt: 0.08, up: 10e6 / 8, down: 50e6 / 8, parallel: 6 },
	phone4g: { rtt: 0.15, up: 5e6 / 8, down: 20e6 / 8, parallel: 4 }
};
const size = process.argv[2] ?? 'medium';
const { chars, shape } = sizes[size];

function est(s: Stats, net: (typeof NETS)['desktop']) {
	return (s.requests * net.rtt) / net.parallel + s.bytesUp / net.up + s.bytesDown / net.down;
}
const rows: Record<string, string | number>[] = [];
async function measure(name: string, remote: SimProvider, fn: () => Promise<unknown>) {
	remote.reset();
	const heap0 = process.memoryUsage().heapUsed;
	const t0 = performance.now();
	await fn();
	const cpu = performance.now() - t0;
	const s = { ...remote.stats };
	rows.push({
		step: name,
		requests: s.requests,
		'MB up': +(s.bytesUp / 1e6).toFixed(2),
		'MB down': +(s.bytesDown / 1e6).toFixed(2),
		'CPU ms': Math.round(cpu),
		'heap MB': +((process.memoryUsage().heapUsed - heap0) / 1e6).toFixed(1),
		'est s desktop': +est(s, NETS.desktop).toFixed(1),
		'est s 4G phone': +est(s, NETS.phone4g).toFixed(1)
	});
}

async function workspace(local: Local) {
	reseed(11);
	for (let i = 0; i < chars; i++) local.save(`rig-${i}`, await character(local, `Character ${i}`, shape));
}
type Body = Awaited<ReturnType<typeof character>>;
async function editCells(local: Local, id: string, n: number, item = 1) {
	const b = structuredClone(local.records.get(id)) as Body;
	const cells = b.items[item].layers[0].cells;
	let k = 0;
	for (const m of Object.keys(cells))
		for (const d of Object.keys(cells[m]))
			for (let f = 0; f < cells[m][d].length && k < n; f++, k++) cells[m][d][f] = await cell(local);
	b.name += '*';
	local.save(id, b);
}

for (const mode of ['files', 'packs'] as const) {
	const remote = new SimProvider();
	const desk = new Local('desktop'),
		phone = new Local('phone');
	const D = new Engine(desk, remote, { validate, packs: mode === 'packs' }),
		P = new Engine(phone, remote, { validate, packs: mode === 'packs' });
	await workspace(desk);
	const tag = `[${mode}]`;
	await measure(`${tag} initial backup (desktop)`, remote, () => D.sync());
	await measure(`${tag} full restore (phone)`, remote, () => P.sync());
	await measure(`${tag} idle check, nothing changed`, remote, () => P.sync());
	await editCells(desk, 'rig-0', 20);
	await measure(`${tag} 20 edited cells: desktop push`, remote, () => D.sync());
	await measure(`${tag} 20 edited cells: phone pull`, remote, () => P.sync());
	await editCells(phone, 'rig-1', 10);
	await measure(`${tag} 10 edited cells: phone push`, remote, () => P.sync());
	await measure(`${tag} 10 edited cells: desktop pull`, remote, () => D.sync());
	await editCells(desk, 'rig-2', 5, 1);
	await editCells(phone, 'rig-2', 5, 2);
	await D.sync();
	await measure(`${tag} concurrent edits: phone merge`, remote, () => P.sync());
	await measure(`${tag} concurrent edits: desktop catch-up`, remote, () => D.sync());
	const fresh = new Local('desktop-cleared');
	for (let day = 0; day < 30; day++) {
		await editCells(desk, `rig-${day % chars}`, 3);
		await D.sync();
	}
	await editCells(phone, 'rig-0', 3, 3);
	await measure(`${tag} phone back after 30 desktop syncs offline`, remote, () => P.sync());
	await measure(`${tag} restore after clearing browser data`, remote, () => new Engine(fresh, remote, { validate, packs: mode === 'packs' }).sync());
	const objects = remote.putLog.filter((k) => !k.startsWith('devices/'));
	rows.push({ step: `${tag} duplicate object uploads over the whole run`, requests: objects.length - new Set(objects).size });
	rows.push({ step: `${tag} remote files / MB stored`, requests: remote.files.size, 'MB up': +(remote.used() / 1e6).toFixed(2) });
}

{
	const remote = new SimProvider();
	const desk = new Local('desktop'),
		phone = new Local('phone');
	const D = new LwwEngine(desk, remote),
		P = new LwwEngine(phone, remote);
	await workspace(desk);
	await measure('[lww] initial backup (desktop)', remote, () => D.sync());
	await measure('[lww] full restore (phone)', remote, () => P.sync());
	await measure('[lww] idle check, nothing changed', remote, () => P.sync());
	await editCells(desk, 'rig-0', 20);
	await measure('[lww] 20 edited cells: desktop push', remote, () => D.sync());
	await measure('[lww] 20 edited cells: phone pull', remote, () => P.sync());
}

const cells = chars * shape.items * shape.moves * shape.dirs * shape.frames;
console.log(`Workspace "${size}": ${chars} characters, ${cells} cells (${shape.items} items x ${shape.moves} moves x ${shape.dirs} directions x ${shape.frames} frames each)`);
console.table(rows);
