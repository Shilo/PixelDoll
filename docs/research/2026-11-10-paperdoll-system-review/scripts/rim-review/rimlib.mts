// Shipped-composite seam metrics: what a player sees where an item layer meets the frozen base.
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { recompose } = await import(APP + 'src/lib/items/items.ts');
type Img = { w: number; h: number; data: Uint8ClampedArray };
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];
const lum = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
export interface Seam {
	rimDark: number; // visible base OUTLINE px (lum<.28) 8-touching the item, where the model drew nothing: body outline peeking past gear
	rimColor: number; // same, non-outline body color
	float1: number; // item px exactly 1 px off the base silhouette (overhang the old metric ignored)
	gap: number; // empty composite px 4-touching both item and visible base: pinholes / 1 px gaps
	dblOutline: number; // item-edge outline px whose outward neighbor is a visible base outline px (2 px thick outline)
	edge: number; // item edge px (normalizer)
}
export function seam(cell: { out: Img; base: Img; mask: Uint8Array; layer: Img; cut?: Uint8Array }): Seam {
	const comp = recompose(cell);
	const { w, h } = comp,
		M = cell.mask,
		B = comp.data, // composite
		VB = new Uint8Array(w * h); // visible base px in composite
	for (let p = 0; p < w * h; p++) VB[p] = !M[p] && B[p * 4 + 3] > 0 ? 1 : 0;
	const s: Seam = { rimDark: 0, rimColor: 0, float1: 0, gap: 0, dblOutline: 0, edge: 0 };
	const baseOp = (p: number) => cell.base.data[p * 4 + 3] > 0;
	const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
	for (let p = 0; p < w * h; p++) {
		const x = p % w, y = (p / w) | 0;
		if (M[p]) {
			let isEdge = false, nearBase = false;
			for (const [dx, dy] of N4) {
				const q = at(x + dx, y + dy);
				if (q < 0 || !M[q]) isEdge = true;
				if (q >= 0 && VB[q] && lum(B, q * 4) < 0.28 && lum(B, p * 4) < 0.28) s.dblOutline++, (nearBase = true);
			}
			if (isEdge) s.edge++;
			if (!baseOp(p)) {
				let adj = false;
				for (const [dx, dy] of N8) { const q = at(x + dx, y + dy); if (q >= 0 && baseOp(q)) adj = true; }
				if (adj) s.float1++;
			}
			continue;
		}
		if (VB[p]) {
			let touch = false;
			for (const [dx, dy] of N8) { const q = at(x + dx, y + dy); if (q >= 0 && M[q]) touch = true; }
			if (touch && cell.out.data[p * 4 + 3] < 128) lum(B, p * 4) < 0.28 ? s.rimDark++ : s.rimColor++;
			continue;
		}
		if (B[p * 4 + 3] === 0 && x && y && x < w - 1 && y < h - 1) {
			let ti = false, tb = false;
			for (const [dx, dy] of N4) { const q = at(x + dx, y + dy); if (M[q]) ti = true; if (VB[q]) tb = true; }
			if (ti && tb) s.gap++;
		}
	}
	return s;
}
export function agg(rows: Seam[]) {
	const o: any = { n: rows.length };
	for (const k of ['rimDark', 'rimColor', 'float1', 'gap', 'dblOutline'] as const) {
		const v = rows.map((r) => r[k]);
		o[k] = `${(v.reduce((a, b) => a + b, 0) / (v.length || 1)).toFixed(1)}/${Math.max(0, ...v)}`;
	}
	o.edge = (rows.reduce((a, r) => a + r.edge, 0) / (rows.length || 1)).toFixed(0);
	return o;
}
