// Task 2: rim before/after on the frozen bench (posed + rest keyframes) and the stored matched trials.
import { readFileSync, writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { evaluateTrialFrames } = await import(APP + 'scripts/item-trial-evaluate.ts');
const { recompose } = await import(APP + 'src/lib/items/items.ts');
const { base64ToBytes } = await import(APP + 'src/lib/image/png.ts');
const { decodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { seam } = await import('../challenge2/rimlib.mts');
const { rimCut, union, lum } = await import('./rimcut.mts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
type Row = { src: string; id: string; slot: string; clip: string; i: number; posed: boolean; b: number; bd: number; a: number; ad: number; cut: number; cutDark: number; y1b: number; y1a: number; wb: number; wa: number };
const rows: Row[] = [];
const box = (im: any) => { let x0 = 1e9, x1 = -1, y1 = -1; for (let p = 0; p < im.w * im.h; p++) if (im.data[p * 4 + 3]) { const x = p % im.w, y = (p / im.w) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { y1, wd: x1 - x0 + 1 }; };
function one(src: string, id: string, slot: string, cell: any, clip: string, i: number, posed: boolean) {
	const s0 = seam(cell), rc = rimCut(cell, slot), after = { ...cell, cut: union(cell.cut, rc) }, s1 = seam(after);
	let cut = 0, cutDark = 0;
	if (rc) for (let p = 0; p < rc.length; p++) if (rc[p]) { cut++; if (lum(cell.base.data, p * 4) < 0.28) cutDark++; }
	const bb = box(recompose(cell)), ba = box(recompose(after));
	rows.push({ src, id, slot, clip, i, posed, b: s0.rimDark + s0.rimColor, bd: s0.rimDark, a: s1.rimDark + s1.rimColor, ad: s1.rimDark, cut, cutDark, y1b: bb.y1, y1a: ba.y1, wb: bb.wd, wa: ba.wd });
}
for (const c of cases) {
	if (c.role === 'reference') continue;
	const r = await runCase(c);
	for (const cell of r.cells) {
		const [anim, dir, i] = cell.key.split('/');
		one('bench', c.id, c.slot, cell, `${anim}/${dir}`, +i, anim !== 'rest');
	}
}
const plan = JSON.parse(readFileSync(new URL('test-results-item-trials/final-evidence/plan.json', APP), 'utf8'));
for (const t of plan.trials) {
	const { packet, arm } = t.record;
	if (packet.conditioning !== 'raw') continue;
	const imgs = [...t.images].sort((a: any, b: any) => Number(a.label.match(/\d+$/)?.[0] ?? 0) - Number(b.label.match(/\d+$/)?.[0] ?? 0));
	const frames = await Promise.all(imgs.map((x: any) => decodePngBytes(base64ToBytes(x.png))));
	const { cells } = await evaluateTrialFrames(packet, arm, frames, packet.id);
	cells.forEach((cell: any, i: number) => one('trial', `${packet.caseId}`, packet.slot, cell, `${arm} ${packet.direction} ${packet.id}`, i, arm === 'pose'));
}
writeFileSync('measure.json', JSON.stringify(rows));
console.log('rows', rows.length);
