// 0 gens: best whole-sheet translation of each returned sheet against its input (opaque-mask IoU over -3..3 px), and the
// same per cell, to tell a global sheet offset from per-frame drawing drift.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const arm = process.argv[2], dir = path.join(L.OUT, L.TAG + arm);
const iou = (a: L.Img, b: L.Img, dx: number, dy: number, r?: { x: number; y: number; w: number; h: number }) => {
	let i = 0, u = 0; const R = r ?? { x: 0, y: 0, w: a.w, h: a.h };
	for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) {
		const A = a.data[(y * a.w + x) * 4 + 3] > 0, X = x + dx, Y = y + dy;
		const B = X >= 0 && Y >= 0 && X < b.w && Y < b.h && b.data[(Y * b.w + X) * 4 + 3] > 0;
		if (A && B) i++; if (A || B) u++;
	}
	return u ? i / u : 0;
};
const best = (a: L.Img, b: L.Img, r?: any) => { let bs = [0, 0], bv = -1; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const v = iou(a, b, dx, dy, r); if (v > bv + 1e-9) { bv = v; bs = [dx, dy]; } } return { shift: bs, iou: +bv.toFixed(3), iou0: +iou(a, b, 0, 0, r).toFixed(3) }; };
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.plan.json')).sort()) {
	const plan = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), file = path.join(dir, f.replace('.plan.json', ''));
	if (plan.out !== 'sheet' || !fs.existsSync(`${file}.0.png`)) continue;
	const a = await L.load(`${file}.sheet.png`), b = await L.load(`${file}.0.png`);
	const g = best(a, b);
	const cells = plan.cells.filter((c: any) => !c.ref).map((c: any) => best(a, b, { x: c.x + 2, y: c.y + 2, w: c.win.w - 4, h: c.win.h - 4 }).shift.join(','));
	const hist: Record<string, number> = {}; cells.forEach((s: string) => (hist[s] = (hist[s] ?? 0) + 1));
	console.log(f.replace('.plan.json', ''), 'sheet', JSON.stringify(g), 'cells', JSON.stringify(hist));
}
