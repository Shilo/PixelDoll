// Free reads only: balance, Pro Flash capabilities and edit quotes, and the crop windows the trimmed layouts need.
import { api, API_BASE, DIRS, ITEMS, bodyFrames, dressed, bbox, rig, OUT } from './lib.mts';
import fs from 'node:fs';
console.log('base', API_BASE.replace(/\/\/[^/]*@/, '//'), 'cell', rig.cell);
for (const d of DIRS) {
	const f = await bodyFrames('walk', d);
	const b = f.map(bbox), k = await Promise.all(ITEMS.map((i) => dressed(i, d).then(bbox)));
	const u = (r: any[]) => ({ x0: Math.min(...r.map((q) => q.x0)), y0: Math.min(...r.map((q) => q.y0)), x1: Math.max(...r.map((q) => q.x1)), y1: Math.max(...r.map((q) => q.y1)) });
	const ub = u(b), uk = u(k), all = u([...b, ...k]);
	console.log(d, 'body', JSON.stringify(ub), 'dressed', JSON.stringify(uk), 'union w×h', all.x1 - all.x0 + 1, '×', all.y1 - all.y0 + 1);
}
if (process.argv[2] === 'live') {
	const bal = await api.balance();
	console.log('balance', JSON.stringify({ gens: bal.subscription?.generations, usd: bal.credits?.usd, tier: bal.subscription?.tier ?? bal.subscription?.plan }));
	const cap = await api.get('/pro-flash/capabilities');
	fs.writeFileSync(`${OUT}/proflash-capabilities.json`, JSON.stringify(cap, null, 1));
	console.log('capabilities keys', Object.keys(cap));
	for (const [w, h] of [[64, 64], [128, 128], [184, 184], [256, 256], [252, 256], [256, 168]]) {
		try { const q = await api.get(`/pro-flash/cost?operation=edit&width=${w}&height=${h}&n_directions=1`); console.log('pro-flash edit quote', w, h, JSON.stringify(q)); }
		catch (e: any) { console.log('quote', w, h, e.status); }
	}
}
