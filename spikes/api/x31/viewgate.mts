// 0 gens: prototype cross-view gate for edit cells (production dirGate skips them). Signature of a frame = for 8 equal row
// bands of the body's bounding box, the share of body px the item covers plus the item px beside the body (per body px).
// A frame fails when another view's standing signature is closer than its own by MARGIN (L1 distance).
// Tested on every stored sheet output (false alarms) and on synthetic swaps (each view's frames carrying another view's layers).
// usage: [X31_SRC=s2] node --experimental-transform-types --no-warnings viewgate.mts [margin]
import fs from 'node:fs';
import path from 'node:path';
import * as L from './lib.mts';
const MARGIN = +(process.argv[2] ?? 0.1), BANDS = 8;
const dir = path.join(L.OUT, L.TAG + 'eiv2-all');
function sig(layer: L.Img, body: L.Img) {
	const b = L.bbox(body), h = b.y1 - b.y0 + 1, cov = new Array(BANDS).fill(0), side = new Array(BANDS).fill(0), n = new Array(BANDS).fill(0);
	for (let y = 0; y < body.h; y++)
		for (let x = 0; x < body.w; x++) {
			const p = y * body.w + x, k = Math.min(BANDS - 1, Math.max(0, Math.floor(((y - b.y0) / h) * BANDS)));
			const B = body.data[p * 4 + 3] > 0, I = layer.data[p * 4 + 3] > 0;
			if (B) { n[k]++; if (I) cov[k]++; } else if (I) side[k]++;
		}
	return [...cov.map((c, k) => (n[k] ? c / n[k] : 0)), ...side.map((s, k) => (n[k] ? Math.min(1, s / n[k]) : 0))];
}
const l1 = (a: number[], b: number[]) => a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
const union = (ims: L.Img[]) => { const o = L.blank(ims[0].w, ims[0].h); for (const im of ims) for (let p = 0; p < o.w * o.h; p++) if (im.data[p * 4 + 3]) o.data.set(im.data.subarray(p * 4, p * 4 + 4), p * 4); return o; };
let real = 0, realFlag = 0, swaps = 0, swapFlag = 0;
const flagged: string[] = [];
for (const id of L.ITEMS) {
	const std: Record<string, number[]> = {};
	for (const d of L.DIRS) std[d] = sig(union(await L.standingLayers(id, d)), await L.restBody(d));
	for (const seed of [7, 11]) {
		const layer = async (key: string) => { const f = path.join(dir, `${id}.s${seed}.layer.${key.replace(/\//g, '_')}.png`); return fs.existsSync(f) ? L.load(f) : null; };
		for (const d of L.DIRS)
			for (const t of await L.targets(d)) {
				if (L.bbox(t.im).x1 < 0) continue;
				const own = await layer(t.key);
				if (!own) continue;
				const judge = (lay: L.Img) => { const s = sig(lay, t.im), o = l1(s, std[d]); return L.DIRS.some((e) => e !== d && l1(s, std[e]) + MARGIN < o); };
				real++;
				if (judge(own)) { realFlag++; flagged.push(`${id} s${seed} ${t.key}`); }
				for (const e of L.DIRS) {
					if (e === d) continue;
					const other = await layer(`${t.anim}/${e}/${t.key.split('/')[2]}`);
					if (!other) continue;
					swaps++;
					if (judge(other)) swapFlag++;
				}
			}
	}
}
console.log(`${L.SRC} margin ${MARGIN}: real frames flagged ${realFlag}/${real}; synthetic swapped frames caught ${swapFlag}/${swaps}`);
if (flagged.length) console.log('flagged real frames:', flagged.join(', '));
