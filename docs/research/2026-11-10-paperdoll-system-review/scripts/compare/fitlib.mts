// Shared fit metrics: does an extracted item layer fit the frozen base frame it is drawn over?
// Pure functions over production Img/CellOut shapes; imports production chroma scoring read-only.
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { keyScore, KT } = await import(APP + 'src/lib/image/chroma.ts');

type Img = { w: number; h: number; data: Uint8ClampedArray };
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
	const o = new Uint8Array(m.length);
	for (let p = 0; p < m.length; p++) {
		if (!m[p]) continue;
		const x = p % w,
			y = (p / w) | 0;
		for (let dy = -r; dy <= r; dy++)
			for (let dx = -r; dx <= r; dx++) {
				const X = x + dx,
					Y = y + dy;
				if (X >= 0 && Y >= 0 && X < w && Y < h) o[Y * w + X] = 1;
			}
	}
	return o;
}
/** Non-item px not reachable from the cell border through non-item px (enclosed by the item). */
export function holes(m: Uint8Array, w: number, h: number): Uint8Array {
	const seen = new Uint8Array(m.length),
		st: number[] = [];
	for (let x = 0; x < w; x++) for (const y of [0, h - 1]) if (!m[y * w + x]) st.push(y * w + x);
	for (let y = 0; y < h; y++) for (const x of [0, w - 1]) if (!m[y * w + x]) st.push(y * w + x);
	while (st.length) {
		const p = st.pop()!;
		if (seen[p] || m[p]) continue;
		seen[p] = 1;
		const x = p % w,
			y = (p / w) | 0;
		if (x > 0) st.push(p - 1);
		if (x < w - 1) st.push(p + 1);
		if (y > 0) st.push(p - w);
		if (y < h - 1) st.push(p + w);
	}
	const o = new Uint8Array(m.length);
	for (let p = 0; p < m.length; p++) if (!m[p] && !seen[p]) o[p] = 1;
	return o;
}
export interface Fit {
	bodyPx: number; // base px away from the item (the friend's "looked at" area)
	friend: number; // (model key body XOR real base) away from item+1: the other workflow's two_bodies metric
	beyond1: number; // the same disagreement, ignoring 1 px redraw slack (posed tolerance)
	jut: number; // real base px right at the item edge that the item leaves bare where the model drew nothing (base pokes past gear)
	holeBare: number; // real base px enclosed by the item (arm-shaped holes and legit gaps)
	bulge: number; // model key-body px more than 1 px outside the real silhouette (gear wrapped around a body that is not there)
	floatPx: number; // item px more than 1 px outside the real silhouette
	area: number;
}
export function fit(cell: { out: Img; base: Img; mask: Uint8Array }, key: string): Fit {
	const { w, h } = cell.base,
		n = w * h,
		C = cell.out.data,
		B = cell.base.data,
		M = cell.mask;
	const keyM = new Uint8Array(n),
		bare = new Uint8Array(n),
		outOp = new Uint8Array(n);
	for (let p = 0; p < n; p++) {
		bare[p] = B[p * 4 + 3] > 0 ? 1 : 0;
		outOp[p] = C[p * 4 + 3] >= 128 ? 1 : 0;
		keyM[p] = outOp[p] && keyScore(key, C[p * 4], C[p * 4 + 1], C[p * 4 + 2]) >= KT && !M[p] ? 1 : 0;
	}
	const g1 = dilate(M, w, h, 1),
		bare1 = dilate(bare, w, h, 1),
		key1 = dilate(keyM, w, h, 1),
		hole = holes(M, w, h);
	const f: Fit = { bodyPx: 0, friend: 0, beyond1: 0, jut: 0, holeBare: 0, bulge: 0, floatPx: 0, area: 0 };
	for (let p = 0; p < n; p++) {
		const x = p % w,
			y = (p / w) | 0;
		const border = !x || !y || x === w - 1 || y === h - 1;
		if (M[p]) f.area++;
		if (!g1[p] && !border) {
			if (bare[p]) f.bodyPx++;
			if (keyM[p] !== bare[p]) f.friend++;
			if ((keyM[p] && !bare1[p]) || (bare[p] && !key1[p])) f.beyond1++;
		}
		if (bare[p] && !M[p] && !outOp[p] && g1[p] && !border) f.jut++;
		if (bare[p] && hole[p]) f.holeBare++;
		if (keyM[p] && !bare1[p]) f.bulge++;
		if (M[p] && !bare1[p]) f.floatPx++;
	}
	return f;
}
export const KEYS: (keyof Fit)[] = ['friend', 'beyond1', 'jut', 'holeBare', 'bulge', 'floatPx', 'bodyPx', 'area'];
export function summarize(rows: Fit[]) {
	const o: Record<string, string> = { n: String(rows.length) };
	for (const k of KEYS) {
		const v = rows.map((r) => r[k]),
			m = v.reduce((a, b) => a + b, 0) / (v.length || 1);
		o[k] = `${m.toFixed(1)}/${Math.max(0, ...v)}`;
	}
	return o;
}
