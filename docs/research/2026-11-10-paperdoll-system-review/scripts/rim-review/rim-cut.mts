// Offline what-if: hide base px that peek past posed gear (outside the model's own figure, touching the item, on the base's
// outer edge) when every visible neighbor inward is item. Counts: rim px total, safe-to-hide, unsafe (would break an outline).
import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const agg: Record<string, { n: number; rim: number; safe: number; unsafe: number; frames3: number; frames3after: number }> = {};
for (const c of cases) {
	if (c.role === 'reference') continue;
	const r = await runCase(c);
	for (const cell of r.cells) {
		const posed = !cell.key.startsWith('rest');
		const { w, h } = cell.base, M = cell.mask, B = cell.base.data, O = cell.out.data, cut = cell.cut;
		const vis = (p: number) => B[p * 4 + 3] > 0 && !(cut && cut[p]);
		let rim = 0, safe = 0, unsafe = 0;
		for (let p = 0; p < w * h; p++) {
			if (M[p] || !vis(p) || O[p * 4 + 3] >= 128) continue;
			const x = p % w, y = (p / w) | 0;
			let touch = false;
			for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && M[Y * w + X]) touch = true; }
			if (!touch) continue;
			rim++;
			const n4 = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
			const edge = n4.some((q) => q < 0 || !vis(q));
			const inwardBare = n4.some((q) => q >= 0 && vis(q) && !M[q] && O[q * 4 + 3] >= 128); // visible body the model also drew: hiding p would cut its outline
			edge && !inwardBare ? safe++ : unsafe++;
		}
		const k = `${c.slot} ${posed ? 'POSED' : 'REST'}`;
		const a = (agg[k] ??= { n: 0, rim: 0, safe: 0, unsafe: 0, frames3: 0, frames3after: 0 });
		a.n++; a.rim += rim; a.safe += safe; a.unsafe += unsafe; if (rim >= 3) a.frames3++; if (rim - safe >= 3) a.frames3after++;
	}
}
console.table(Object.entries(agg).sort().map(([k, a]) => ({ k, n: a.n, rimPerFrame: (a.rim / a.n).toFixed(2), safeShare: a.rim ? (a.safe / a.rim).toFixed(2) : '-', 'frames>=3': a.frames3, 'after': a.frames3after })));
