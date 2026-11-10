// Live cross-view qualification driver. Usage: node drive.mjs dry|run|balance
// Drives the agent dev server (port 5199) through Studio's itemRoute (draft + runItem), dress calls only.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const APP = '<REPO>/app';
const require = createRequire(APP + '/package.json');
const { chromium } = require('playwright');
const HERE = '<SCRATCH>/live';
const OUT = APP + '/test-results-crossview';
mkdirSync(OUT + '/calls', { recursive: true });
const mode = process.argv[2] ?? 'dry';

const A = [
	['hair', 'hair', 'waist-length straight black hair'],
	['quiver', 'back', 'a leather quiver full of arrows strapped to the back'],
	['capelet', 'shoulders', 'a short fur-trimmed capelet over the shoulders'],
	['backpack', 'back', 'a small canvas backpack'],
	['tabard', 'torso_outer', 'a blue tabard with a large gold lion crest on the front'],
	['cloak', 'back', 'a green hooded cloak with the hood down'],
	['foxtail', 'back', 'a bushy orange fox tail']
];
const B = [
	['redcape', 'back', 'a red cape attached at the shoulders'],
	['chest', 'torso_outer', 'leather chest armor'],
	['dress', 'torso_outer', 'a long blue dress reaching the ankles']
];
const jobs = [];
A.forEach(([n, slot, prompt], i) => [0, 1].forEach((s) => jobs.push({ id: `A-${n}-s${s + 1}`, group: 'A', body: 'C', slot, prompt, seed: 61000 + i * 100 + s * 10 })));
B.forEach(([n, slot, prompt], i) => [0, 1, 2].forEach((s) => jobs.push({ id: `B-${n}-s${s + 1}`, group: 'B', body: 'C', slot, prompt, seed: 62000 + i * 100 + s * 10 })));
[0, 1].forEach((s) => jobs.push({ id: `C-robe-s${s + 1}`, group: 'C', body: 'B', slot: 'torso_outer', prompt: 'a long blue mage robe with a gold belt', seed: 63000 + s * 10 }));
writeFileSync(OUT + '/jobs.json', JSON.stringify(jobs, null, 1));

const LEDGER = OUT + '/ledger.jsonl'; // started / finished markers: a started job is never submitted again by this script
const started = new Set(existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((e) => e.ev === 'start').map((e) => e.id) : []);

const ctx = await chromium.launchPersistentContext(HERE + '/profile', { headless: true });
const page = ctx.pages()[0] ?? (await ctx.newPage());
if (mode === 'dry') await page.addInitScript(() => localStorage.setItem('pixeldoll.agentKey', 'off'));
else await page.addInitScript(() => localStorage.removeItem('pixeldoll.agentKey'));
const bodies = new Map();
page.on('request', (r) => {
	if (r.method() !== 'POST' || !/\/v2\//.test(r.url())) return;
	try {
		const body = JSON.parse(r.postData() ?? 'null');
		bodies.set(body?.seed, { url: new URL(r.url()).pathname, body });
	} catch (e) {
		console.error('request body parse failed', String(e));
	}
});
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto('http://localhost:5199/');
await page.evaluate(readFileSync(HERE + '/inpage.js', 'utf8'));

if (mode === 'dry') {
	for (const [b, s, p] of [['C', 'back', 'a red cape'], ['C', 'hair', 'long hair'], ['B', 'torso_outer', 'a long blue mage robe with a gold belt']])
		console.log(b, s, JSON.stringify(await page.evaluate(([b, s, p]) => window.__xv.plan(b, s, p), [b, s, p])));
	const r = await page.evaluate(() => window.__xv.bodyRests('C'));
	for (const [d, png] of Object.entries(r)) writeFileSync(`${OUT}/bodyC_rest_${d}.png`, Buffer.from(png, 'base64'));
	const r2 = await page.evaluate(() => window.__xv.bodyRests('B'));
	for (const [d, png] of Object.entries(r2)) writeFileSync(`${OUT}/bodyB_rest_${d}.png`, Buffer.from(png, 'base64'));
	await ctx.close();
	process.exit(0);
}
for (let i = 0; i < 60 && !(await page.evaluate(() => window.__xv.hasKey())); i++) await page.waitForTimeout(500);
if (!(await page.evaluate(() => window.__xv.hasKey()))) throw new Error('agent mode did not connect');
const bal = await page.evaluate(() => window.__xv.balance());
console.log('balance', JSON.stringify(bal));
appendFileSync(OUT + '/balance.jsonl', JSON.stringify({ at: new Date().toISOString(), when: mode, ...bal }) + '\n');
if (mode === 'balance') {
	await ctx.close();
	process.exit(0);
}
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
const todo = jobs.filter((j) => !started.has(j.id) && (!only || only.test(j.id)));
console.log('todo', todo.length, todo.map((j) => j.id).join(' '));
const save = (j, r) => {
	const dir = `${OUT}/calls/${j.id}`;
	mkdirSync(dir, { recursive: true });
	for (const x of r.raws) writeFileSync(`${dir}/raw_c${x.call}_${x.i}${x.cell ? '_' + x.cell.split('/')[1] : ''}.png`, Buffer.from(x.png, 'base64'));
	for (const [d, png] of Object.entries(r.layers)) writeFileSync(`${dir}/layer_${d}.png`, Buffer.from(png, 'base64'));
	for (const c of r.calls) {
		const req = bodies.get(c.seed);
		if (req) writeFileSync(`${dir}/request_c${r.calls.indexOf(c)}.json`, JSON.stringify(req, null, 1)); // body only, no headers
	}
	writeFileSync(`${dir}/meta.json`, JSON.stringify({ job: j, spec: r.spec, calls: r.calls, log: r.log, err: r.err, areas: r.areas, raws: r.raws.map(({ png, ...x }) => x) }, null, 1));
	writeFileSync(`${dir}/gates.json`, JSON.stringify(r.gates, null, 1)); // not read until labels are written
};
let next = 0;
const worker = async () => {
	while (next < todo.length) {
		const j = todo[next++];
		appendFileSync(LEDGER, JSON.stringify({ ev: 'start', id: j.id, at: new Date().toISOString() }) + '\n');
		try {
			const r = await page.evaluate((j) => window.__xv.run(j), j);
			save(j, r);
			appendFileSync(LEDGER, JSON.stringify({ ev: 'done', id: j.id, states: r.calls.map((c) => c.state), gens: r.calls.map((c) => c.gens), usd: r.calls.map((c) => c.usd), err: r.err, at: new Date().toISOString() }) + '\n');
			console.log(j.id, r.calls.map((c) => c.state).join(','), r.err ?? '');
		} catch (e) {
			appendFileSync(LEDGER, JSON.stringify({ ev: 'error', id: j.id, error: String(e), at: new Date().toISOString() }) + '\n');
			console.error(j.id, 'ERROR', String(e));
		}
	}
};
await Promise.all([worker(), worker(), worker(), worker()]);
const bal2 = await page.evaluate(() => window.__xv.balance());
console.log('balance after', JSON.stringify(bal2));
appendFileSync(OUT + '/balance.jsonl', JSON.stringify({ at: new Date().toISOString(), when: 'after', ...bal2 }) + '\n');
await ctx.close();
