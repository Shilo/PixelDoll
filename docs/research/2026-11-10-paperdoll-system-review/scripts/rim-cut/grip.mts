// Task 3: how far held items float from the fist. Per frame: Chebyshev gap (px) between the item and the nearest hand px
// (base px within 3 px of the requested wrist keypoint, RIGHT ARM for main_hand, LEFT ARM for off_hand); 0 = touching/over.
import { readFileSync, writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const FIX = new URL('test/fixtures/bench/', APP);
const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8'));
const out: any[] = [];
for (const id of ['a-sword96', 'a-axe96', 'a-bow96']) {
	const c = cases.find((x: any) => x.id === id), rig = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8')).rig;
	const lab = c.slot === 'off_hand' ? 'LEFT ARM' : 'RIGHT ARM';
	const r = await runCase(c);
	for (const cell of r.cells) {
		const [a, d, i] = cell.key.split('/');
		const kps = a === 'rest' ? rig.rest[d]?.keypoints : rig.animations.find((x: any) => x.id === a)?.sources?.[d]?.keypoints?.[+i];
		const k = kps?.find((q: any) => q.label === lab);
		if (!k) { out.push({ id, a, d, i, gap: null }); continue; }
		const wx = k.x * rig.cell.w + c.pad, wy = k.y * rig.cell.h + c.pad, w = cell.base.w, n = w * cell.base.h;
		const hand: number[] = [];
		for (let p = 0; p < n; p++) if (cell.base.data[p * 4 + 3] && Math.hypot((p % w) + 0.5 - wx, ((p / w) | 0) + 0.5 - wy) <= 3) hand.push(p);
		let gap = Infinity, wristGap = Infinity;
		for (let p = 0; p < n; p++) {
			if (!cell.mask[p]) continue;
			const x = p % w, y = (p / w) | 0;
			wristGap = Math.min(wristGap, Math.max(Math.abs(x + 0.5 - wx), Math.abs(y + 0.5 - wy)));
			for (const q of hand) gap = Math.min(gap, Math.max(Math.abs(x - (q % w)), Math.abs(y - ((q / w) | 0))) - 1);
		}
		out.push({ id, a, d, i: +i, gap: hand.length && cell.area ? Math.max(0, gap) : null, hand: hand.length, area: cell.area, wristGap: +wristGap.toFixed(1) });
	}
}
writeFileSync('grip.json', JSON.stringify(out));
const g: Record<string, any[]> = {};
for (const r of out) (g[`${r.id} ${r.a === 'rest' ? 'REST' : r.a} ${r.d}`] ??= []).push(r);
console.log('| Case / move / view | frames | gap 0 | gap 1 | gap 2 | gap >= 3 | max | mean | no hand/item |\n|---|---|---|---|---|---|---|---|---|');
for (const [k, rs] of Object.entries(g)) {
	const v = rs.filter((r) => r.gap != null).map((r) => r.gap);
	console.log(`| ${k} | ${rs.length} | ${v.filter((x) => x === 0).length} | ${v.filter((x) => x === 1).length} | ${v.filter((x) => x === 2).length} | ${v.filter((x) => x >= 3).length} | ${Math.max(0, ...v)} | ${(v.reduce((s, x) => s + x, 0) / (v.length || 1)).toFixed(2)} | ${rs.length - v.length} |`);
}
const big = out.filter((r) => r.gap >= 2);
console.log(big);
