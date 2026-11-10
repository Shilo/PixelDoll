// Prototype "rim cut" (RESULTS.md section 0): base px peeking 1 px past a worn item's edge, hidden like Item.baseCut.
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { slotOf } = await import(APP + 'src/lib/items/items.ts');
type Img = { w: number; h: number; data: Uint8ClampedArray };
export interface Cell { key: string; base: Img; out: Img; mask: Uint8Array; layer: Img; cut?: Uint8Array }
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function rimCut(c: Cell, slot: string, keepOutline = process.env.RIM_V === '2'): Uint8Array | undefined {
	if (slotOf(slot)?.class !== 'worn') return undefined;
	const { w, h } = c.base, M = c.mask, n = w * h;
	const V = new Uint8Array(n);
	for (let p = 0; p < n; p++) V[p] = c.base.data[p * 4 + 3] > 0 && !(c.cut && c.cut[p]) && !M[p] ? 1 : 0;
	const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x);
	const open = (q: number) => q < 0 || (!V[q] && !M[q]);
	const onEdge = (x: number, y: number) => N4.some(([dx, dy]) => open(at(x + dx, y + dy)));
	const out = new Uint8Array(n);
	let any = 0;
	for (let p = 0; p < n; p++) {
		if (!V[p] || c.out.data[p * 4 + 3] >= 128) continue; // 1
		const x = p % w, y = (p / w) | 0;
		let touch = false, ok = true;
		for (const [dx, dy] of N4) {
			const q = at(x + dx, y + dy);
			if (q >= 0 && M[q]) {
				touch = true; // 2
				const o = at(x - dx, y - dy);
				if (o >= 0 && V[o]) ok = false; // 4
			} else if (q >= 0 && V[q] && (!onEdge(x + dx, y + dy) || (keepOutline && lum(c.base.data, q * 4) >= 0.28))) ok = false; // 5 (v2: visible neighbors must be outline-dark too, so no visible body color loses its outline)
		}
		if (touch && ok && onEdge(x, y)) (out[p] = 1), any++; // 3
	}
	return any ? out : undefined;
}
export const union = (a?: Uint8Array, b?: Uint8Array) => {
	if (!a) return b; if (!b) return a;
	const o = new Uint8Array(a.length);
	for (let i = 0; i < a.length; i++) o[i] = a[i] | b[i];
	return o;
};
export const lum = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
