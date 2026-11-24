// 0 gens: cost per item per move (all generated views): anchored and skeleton routes vs edit-images-v2 sheets.
// Generated views: 3 for a 4-direction rig (west mirrors east), 5 for 8 directions. Sheet price by mean side with the app's
// conservative edges (<=256: 10, <=336: 15, else 25; receipts: 392x284 mean 338 billed 15, so 336 never under-quotes), each
// side <=512. Cells are crop windows with a 4 px margin: content 0.62 W x 0.92 H (the widest measured: 0.50-0.61 W, 0.81-0.89 H)
// plus 8 px, capped at the frame. A view too large for one sheet is split with its reference repeated.
import * as L from './lib.mts';
const sheetGens = (w: number, h: number) => { const m = (w + h) / 2; return m <= 256 ? 10 : m <= 336 ? 15 : 25; };
function sheet(cw: number, ch: number, cells: number) {
	let best: { w: number; h: number; gens: number } | null = null;
	for (let c = 1; c * cw <= 512; c++) {
		const r = Math.ceil(cells / c), w = c * cw, h = r * ch;
		if (h > 512 || w < 32 || h < 32) continue;
		const g = sheetGens(w, h);
		if (!best || g < best.gens || (g === best.gens && w * h < best.w * best.h)) best = { w, h, gens: g };
	}
	return best;
}
/** One view of F frames on its own sheets (split with the reference repeated when it does not fit). */
function oneView(cw: number, ch: number, F: number) {
	const s = sheet(cw, ch, F + 1);
	if (s) return s.gens;
	let m = 0;
	while (sheet(cw, ch, m + 2)) m++;
	if (!m) return Infinity;
	let g = 0;
	for (let f = F; f > 0; f -= m) g += sheet(cw, ch, Math.min(m, f) + 1)!.gens;
	return g;
}
/** All views: whole views grouped per sheet, cheapest grouping; views that never fit fall back to oneView. */
function allViews(cw: number, ch: number, D: number, F: number) {
	const memo = new Map<number, number>();
	const go = (left: number): number => {
		if (!left) return 0;
		if (memo.has(left)) return memo.get(left)!;
		let best = Infinity;
		for (let k = 1; k <= left; k++) { const s = sheet(cw, ch, k * (F + 1)); if (s) best = Math.min(best, s.gens + go(left - k)); }
		if (!Number.isFinite(best)) best = oneView(cw, ch, F) * left;
		memo.set(left, best);
		return best;
	};
	return go(D);
}
const anchored = (W: number, D: number, F: number) => D * Math.ceil(F / (L.routes.editFrameCap(W) - 1)) * L.items.editGens({ w: W, h: W });
const skeleton = (D: number, F: number) => D * L.clips.poseGensFor(F);
const win = (W: number) => ({ w: Math.min(W, Math.ceil(W * 0.62) + 8), h: Math.min(W, Math.ceil(W * 0.92) + 8) });
const rows: string[] = [
	'| Frame | Views (drawn) | Frames | Anchored today | All-view sheet | Per-view sheets | Skeleton (drifts) |',
	'|---:|---|---:|---:|---:|---:|---:|'
];
for (const W of [32, 48, 64, 80, 92, 96, 128, 160, 192, 256])
	for (const [dirs, D] of [[4, 3], [8, 5]] as const)
		for (const F of [4, 6, 8, 12]) {
			const { w, h } = win(W), f = (n: number) => (Number.isFinite(n) ? String(n) : 'does not fit');
			rows.push(`| ${W} | ${dirs} (${D}) | ${F} | ${anchored(W, D, F)} | ${f(allViews(w, h, D, F))} | ${f(D * oneView(w, h, F))} | ${skeleton(D, F)} |`);
		}
// the two measured rigs with their actual 4 px-margin windows
const measured = [
	['92 px rig (56x90 cells)', 56, 90],
	['64 px fixture (47x58 cells)', 47, 58]
] as const;
rows.push('', '| Measured rig | Views | Frames | All-view sheet | Per-view sheets |', '|---|---:|---:|---:|---:|');
for (const [name, cw, ch] of measured)
	for (const D of [3, 5]) for (const F of [6, 8, 13]) rows.push(`| ${name} | ${D} | ${F} | ${allViews(cw, ch, D, F)} | ${D * oneView(cw, ch, F)} |`);
console.log(rows.join('\n'));
