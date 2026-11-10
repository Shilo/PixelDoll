// Why torso rim px remain after the rim cut: first failing condition per remaining rim px.
import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { rimCut, union, lum } = await import('./rimcut.mts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const want = process.argv[2] ?? 'torso_outer';
const why: Record<string, number> = {};
for (const c of cases.filter((c: any) => c.slot === want && !c.role)) {
	const r = await runCase(c);
	for (const cell of r.cells) {
		if (cell.key.startsWith('rest')) continue;
		const rc = rimCut(cell, c.slot), cut = union(cell.cut, rc);
		const { w, h } = cell.base, M = cell.mask;
		const V = (p: number) => p >= 0 && cell.base.data[p * 4 + 3] > 0 && !(cut && cut[p]) && !M[p];
		const V0 = (p: number) => p >= 0 && cell.base.data[p * 4 + 3] > 0 && !(cell.cut && cell.cut[p]) && !M[p];
		const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
		const open = (q: number) => q < 0 || (!V0(q) && !M[q]);
		for (let p = 0; p < w * h; p++) {
			if (!V(p) || cell.out.data[p * 4 + 3] >= 128) continue;
			const x = p % w, y = (p / w) | 0;
			let t8 = false, t4 = false;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const q = at(x + dx, y + dy); if (q >= 0 && M[q]) { t8 = true; if (!dx || !dy) t4 = true; } }
			if (!t8) continue;
			const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
			const edge = N4.some(([dx, dy]) => open(at(x + dx, y + dy)));
			let beyond = false, interior = false;
			for (const [dx, dy] of N4) { const q = at(x + dx, y + dy); if (q >= 0 && M[q]) { if (V0(at(x - dx, y - dy))) beyond = true; } else if (q >= 0 && V0(q) && !N4.some(([ex, ey]) => open(at(x + dx + ex, y + dy + ey)))) interior = true; }
			const k = `${lum(cell.base.data, p * 4) < 0.28 ? 'dark' : 'color'} ${!t4 ? 'diagonal-only' : !edge ? 'not-on-silhouette' : beyond ? 'body-beyond' : interior ? 'borders-interior' : '??'}`;
			why[k] = (why[k] ?? 0) + 1;
		}
	}
}
console.log(want, why);
