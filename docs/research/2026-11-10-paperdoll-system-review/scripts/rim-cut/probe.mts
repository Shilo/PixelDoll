import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { rimCut, lum } = await import('./rimcut.mts');
const [id, key] = process.argv.slice(2);
const c = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8')).find((x: any) => x.id === id);
const cell = (await runCase(c)).cells.find((x: any) => x.key === key);
const rc = rimCut(cell, c.slot)!, w = cell.base.w;
const ps = [...rc.keys()].filter((p) => rc[p]);
const xs = ps.map((p) => p % w), ys = ps.map((p) => (p / w) | 0);
for (let y = Math.min(...ys) - 3; y <= Math.max(...ys) + 3; y++) {
	let s = '';
	for (let x = Math.min(...xs) - 4; x <= Math.max(...xs) + 4; x++) {
		const p = y * w + x, d = cell.base.data, L = cell.layer.data;
		s += rc[p] ? ' X' : cell.mask[p] ? (lum(L, p * 4) < 0.28 ? ' i' : ' I') : d[p * 4 + 3] ? (lum(d, p * 4) < 0.28 ? ' b' : ' B') : ' .';
		s += cell.out.data[p * 4 + 3] >= 128 && !cell.mask[p] ? '*' : ' ';
	}
	console.log(String(y).padStart(3), s);
}
