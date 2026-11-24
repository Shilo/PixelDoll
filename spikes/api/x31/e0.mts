// E0 (0 gens, DeepSeek's proposal): is the skeleton route's drift a whole-pixel translation? Ground truth = the item layer drawn
// on the real frame (anchored edit-animation-v2 for hair/jeans, edit-images-v2 sheet for hat/short hair; both pass QA).
// For each stored skeleton walk layer (union of its layers' alpha): IoU with the truth at 0 shift, the best integer shift in
// +-5 px and the IoU there. A drift that is pure translation would reach IoU near the truth's own seed-to-seed agreement.
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const truthArm: Record<string, string> = { long_braided_hair: 'anchored', cal_a_jeans: 'anchored', chapeu_de_palha: 'eiv2-all', short_2: 'eiv2-all' };
const alpha = (ims: L.Img[]) => { const m = new Uint8Array(ims[0].w * ims[0].h); for (const im of ims) for (let p = 0; p < m.length; p++) if (im.data[p * 4 + 3]) m[p] = 1; return m; };
const W = L.rig.cell.w, H = L.rig.cell.h;
const iou = (a: Uint8Array, b: Uint8Array, dx: number, dy: number) => { let i = 0, u = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const X = x - dx, Y = y - dy; const A = X >= 0 && Y >= 0 && X < W && Y < H ? a[Y * W + X] : 0; const B = b[y * W + x]; if (A && B) i++; if (A || B) u++; } return u ? i / u : 1; };
const rows: any[] = [];
for (const id of L.ITEMS) for (const d of L.DIRS) {
	const it = L.item(id), shas = it.layers.map((l: any) => l.cells.walk?.[d]);
	if (shas.some((s: any) => !s)) continue;
	for (let i = 0; i < shas[0].length; i++) {
		const sk = alpha(await Promise.all(shas.map((s: any) => L.blob(s[i]))));
		const tf = path.join(L.OUT, truthArm[id], `${id}.s7.layer.walk_${d}_${i}.png`);
		if (!fs.existsSync(tf)) continue;
		const t = alpha([await L.load(tf)]);
		let best = { dx: 0, dy: 0, v: -1 };
		for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const v = iou(sk, t, dx, dy); if (v > best.v) best = { dx, dy, v }; }
		rows.push({ id, key: `${d}/${i}`, iou0: +iou(sk, t, 0, 0).toFixed(3), shift: [best.dx, best.dy], iouBest: +best.v.toFixed(3) });
	}
}
// reference agreement: the same truth route on two seeds (eiv2-all s7 vs s11) for every frame of every item
const agree: number[] = [];
for (const id of L.ITEMS) for (const d of L.DIRS) for (let i = 0; i < 6; i++) {
	const a = path.join(L.OUT, 'eiv2-all', `${id}.s7.layer.walk_${d}_${i}.png`), b = path.join(L.OUT, 'eiv2-all', `${id}.s11.layer.walk_${d}_${i}.png`);
	if (fs.existsSync(a) && fs.existsSync(b)) agree.push(iou(alpha([await L.load(a)]), alpha([await L.load(b)]), 0, 0));
}
for (const r of rows) console.log(r.id.padEnd(18), r.key.padEnd(8), 'iou0', r.iou0, 'best', JSON.stringify(r.shift), r.iouBest);
const mean = (a: number[]) => +(a.reduce((s, x) => s + x, 0) / a.length).toFixed(3);
console.log('frames', rows.length, 'nonzero best shift', rows.filter((r) => r.shift[0] || r.shift[1]).length, 'mean iou0', mean(rows.map((r) => r.iou0)), 'mean iouBest', mean(rows.map((r) => r.iouBest)));
console.log('truth route seed-to-seed IoU (eiv2 s7 vs s11, same frames):', agree.length, 'frames, mean', mean(agree), 'min', +Math.min(...agree).toFixed(3));
fs.writeFileSync(path.join(L.OUT, 'e0.json'), JSON.stringify({ rows, agree }, null, 1));
