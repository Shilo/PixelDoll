// 0 gens: seed-to-seed agreement of the sheet route on the 64 px fixture (opaque-mask IoU, s7 vs s11, same cell), the baseline
// for the fixture-truth IoU printed by eval.mts TRUTH=1.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const dir = path.join(L.OUT, L.TAG + 'eiv2-all');
const iou = (a: L.Img, b: L.Img) => { let i = 0, u = 0; for (let p = 0; p < a.w * a.h; p++) { const A = a.data[p * 4 + 3] > 0, B = b.data[p * 4 + 3] > 0; if (A && B) i++; if (A || B) u++; } return u ? i / u : 1; };
for (const id of L.ITEMS) {
	const v: number[] = [], t7: number[] = [];
	for (const d of L.DIRS) for (const t of await L.targets(d)) {
		if (L.bbox(t.im).x1 < 0) continue;
		const f = (s: number) => path.join(dir, `${id}.s${s}.layer.${t.key.replace(/\//g, '_')}.png`);
		if (!fs.existsSync(f(7)) || !fs.existsSync(f(11))) continue;
		v.push(iou(await L.load(f(7)), await L.load(f(11))));
	}
	const m = (a: number[]) => (a.reduce((s, x) => s + x, 0) / a.length).toFixed(3);
	console.log(id.padEnd(14), 'seed-to-seed IoU', m(v), 'min', Math.min(...v).toFixed(3), `(${v.length} cells)`);
}
