import { readFileSync, writeFileSync } from 'node:fs';
const APP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/app/';
const { runCase } = await import(APP + 'scripts/bench.ts');
const { evaluateTrialFrames } = await import(APP + 'scripts/item-trial-evaluate.ts');
const { base64ToBytes } = await import(APP + 'src/lib/image/png.ts');
const { decodePngBytes } = await import(APP + 'src/lib/image/pngraw.ts');
const { seam, agg } = await import('./rimlib.mts');
const cases = JSON.parse(readFileSync(new URL('test/fixtures/bench/cases.json', APP), 'utf8'));
const table: any[] = [], raw: any[] = [];
for (const c of cases) {
	if (c.role === 'reference') continue;
	const r = await runCase(c);
	const g: Record<string, any[]> = {};
	for (const cell of r.cells) {
		const [anim, dir] = cell.key.split('/');
		const s = seam(cell);
		raw.push({ src: 'bench', id: c.id, slot: c.slot, key: cell.key, ...s });
		(g[`${anim === 'rest' ? 'REST' : anim} ${dir}`] ??= []).push(s);
	}
	for (const [k, rows] of Object.entries(g)) table.push({ case: c.id, slot: c.slot, grp: k, ...agg(rows) });
}
console.table(table);
const plan = JSON.parse(readFileSync(new URL('test-results-item-trials/final-evidence/plan.json', APP), 'utf8'));
const tg: Record<string, any[]> = {};
for (const t of plan.trials) {
	const { packet, arm } = t.record;
	if (packet.conditioning !== 'raw') continue;
	const imgs = [...t.images].sort((a: any, b: any) => Number(a.label.match(/\d+$/)?.[0] ?? 0) - Number(b.label.match(/\d+$/)?.[0] ?? 0));
	const frames = await Promise.all(imgs.map((i: any) => decodePngBytes(base64ToBytes(i.png))));
	const { cells } = await evaluateTrialFrames(packet, arm, frames, packet.id);
	for (const cell of cells) {
		const s = seam(cell);
		raw.push({ src: 'trial', id: packet.id, arm, case: packet.caseId, dir: packet.direction, ...s });
		(tg[`${packet.caseId} ${packet.direction} ${arm}`] ??= []).push(s);
	}
}
console.table(Object.entries(tg).sort().map(([k, rows]) => ({ grp: k, ...agg(rows) })));
writeFileSync(new URL('./rim.json', import.meta.url), JSON.stringify({ table, raw }, null, 1));
