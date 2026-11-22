// Written by the A4 reviewer during the cross-review (notes/cross-review.md) and kept as evidence.
// Adversarial fuzz of Design X (PoC engine): 3 devices, random field edits, random sync order, lagging listings.
// Invariants after quiescence: (1) all devices converge, (2) no un-superseded write is lost (it is in the body or a note).
import { test } from 'node:test';
import assert from 'node:assert/strict';
const POC = new URL('./', import.meta.url).href;
const { Engine, Local } = await import(POC + 'engine.ts');
const { SimProvider } = await import(POC + 'provider.ts');

let seed = 1;
const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
const pick = <T,>(a: T[]) => a[(rand() * a.length) | 0];
const FIELDS = ['name', 'prompt', 'slot'];
const ITEMS = ['i0', 'i1'];
const initial = () => ({
	format: 'pixeldoll/3',
	name: 'c',
	slots: [],
	materials: [],
	items: ITEMS.map((id) => ({ id, name: 'n0', prompt: 'p0', slot: 's0' })),
	presets: []
});

async function run(s: number, devices = 3, steps = 60) {
	seed = s;
	const remote = new SimProvider();
	const devs = Array.from({ length: devices }, (_, i) => {
		const local = new Local('d' + i);
		return { local, engine: new Engine(local, remote) };
	});
	devs[0].local.save('c', initial());
	await devs[0].engine.sync();
	for (const d of devs.slice(1)) await d.engine.sync();
	const superseded = new Set<string>();
	const written: string[] = [];
	let n = 0;
	for (let step = 0; step < steps; step++) {
		remote.listLag = rand() < 0.4 ? 1 + ((rand() * 3) | 0) : 0;
		const d = pick(devs);
		if (rand() < 0.55) {
			const body = structuredClone(d.local.records.get('c'));
			const item = body.items.find((x: { id: string }) => x.id === pick(ITEMS));
			if (!item) continue;
			const f = pick(FIELDS);
			superseded.add(item[f]);
			item[f] = `${d.local.device}-${n++}`;
			written.push(item[f]);
			d.local.save('c', body);
		} else await d.engine.sync();
	}
	remote.listLag = 0;
	for (let r = 0; r < 4; r++) for (const d of devs) await d.engine.sync();
	const bodies = devs.map((d) => JSON.stringify(d.local.records.get('c')));
	const all = devs.map((d) => JSON.stringify([d.local.records.get('c'), d.local.conflicts('c')])).join('');
	const lost = written.filter((t) => !superseded.has(t) && !all.includes(`"${t}"`));
	return { converged: bodies.every((b) => b === bodies[0]), lost, notes: devs[0].local.conflicts('c').length };
}

test('X fuzz: convergence and no lost writes', async () => {
	const fails: string[] = [];
	let notes = 0;
	for (let s = 1; s <= 300; s++) {
		const r = await run(s);
		notes += r.notes;
		if (!r.converged || r.lost.length) fails.push(`seed ${s}: converged=${r.converged} lost=${r.lost.join(',')}`);
	}
	console.log(`avg open notes per run: ${(notes / 300).toFixed(1)}; failures: ${fails.length}`);
	if (fails.length) console.log(fails.slice(0, 10).join('\n'));
	assert.equal(fails.length, 0);
});
