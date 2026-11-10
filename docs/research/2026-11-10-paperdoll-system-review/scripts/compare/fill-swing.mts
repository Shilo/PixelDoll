// Idea 2: how much does an item's fill brightness swing between posed frames in PixelDoll (the other workflow's color-lock
// metric: largest fill brightness swing between frames, outline excluded)? Bench extraction, before standingDyeMatcher.
// Also: share of posed item px whose exact color is absent from the same-facing dressed keyframe (what a palette lock fixes).
import { readFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const L = (d: any, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
const rows: any[] = [];
const swings: number[] = [];
for (const c of cases) {
	if (c.role === 'reference' || !c.clips.length) continue;
	const r = await runCase(c);
	for (const clip of c.clips) {
		const cells = r.cells.filter((x: any) => x.key.startsWith(clip + '/'));
		const rest = r.cells.find((x: any) => x.key === `rest/${clip.split('/')[1]}/0`);
		const pal = new Set<number>();
		for (let p = 0; p < rest.mask.length; p++)
			if (rest.mask[p]) pal.add((rest.layer.data[p * 4] << 16) | (rest.layer.data[p * 4 + 1] << 8) | rest.layer.data[p * 4 + 2]);
		const means: number[] = [];
		let off = 0,
			tot = 0;
		for (const x of cells) {
			let s = 0,
				n = 0;
			for (let p = 0; p < x.mask.length; p++) {
				if (!x.mask[p]) continue;
				tot++;
				if (!pal.has((x.layer.data[p * 4] << 16) | (x.layer.data[p * 4 + 1] << 8) | x.layer.data[p * 4 + 2])) off++;
				const l = L(x.layer.data, p * 4);
				if (l >= 0.25) {
					s += l;
					n++;
				}
			}
			if (n >= 6) means.push(s / n);
		}
		if (means.length < 2) continue;
		const sorted = [...means].sort(),
			med = sorted[sorted.length >> 1];
		const swing = (100 * (Math.max(...means) - Math.min(...means))) / med;
		swings.push(swing);
		rows.push({ case: c.id, clip, frames: means.length, swingPct: swing.toFixed(1), offPalettePct: ((100 * off) / (tot || 1)).toFixed(1) });
	}
}
console.table(rows);
swings.sort((a, b) => a - b);
console.log('clips', swings.length, 'median swing %', swings[swings.length >> 1].toFixed(1), 'max', swings.at(-1)!.toFixed(1), '>4%:', swings.filter((s) => s > 4).length);
