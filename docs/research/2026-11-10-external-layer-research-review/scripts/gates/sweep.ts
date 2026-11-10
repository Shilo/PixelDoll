// False positives of the prototype on every real dressed view set in the frozen bench, and detection on the mutations,
// over a threshold grid. Reads results.json (mutate.ts); recomputes baseline view stats itself.
import { readFileSync, writeFileSync } from 'node:fs';
import { cases, evaluate, load, cell, I, PO, FIX } from './pipe.ts';
import { stats, crossView, type ViewStat, type Rule } from './proto.ts';
const OUT = '<SCRATCH>/gates/';
const real: { id: string; slot: string; held: boolean; s: ViewStat[] }[] = [];
for (const c of cases) {
	const held = I.slotOf(c.slot).class === 'held';
	if (c.clips.length) { const e = await evaluate(c); real.push({ id: c.id, slot: c.slot, held, s: stats(e.keys, e.bodies, c.pad) }); continue; }
	// keyframe-only cases: one row, one column per drawn view
	const b = JSON.parse(readFileSync(new URL(`body${c.body}.json`, FIX), 'utf8'));
	const N = b.rig.cell.w, bodySheet = await load(`body${c.body}.png`), sheet = await load(`${c.id}.png`), keys: any = {}, bodies: any = {};
	for (const [j, d] of b.rows.entries()) {
		const B = cell(bodySheet, N, j, b.cols.indexOf('rest')), s0 = PO.fromApi(b.rig.rest[d].keypoints, b.rig.cell), maxY = I.cutRows(c.slot, s0, N);
		keys[d] = I.extractCell({ key: `rest/${d}/0`, call: 0, base: B, out: cell(sheet, N, 0, j), route: c.key, band: I.bandOf(c.slot, s0, N), ...(maxY != null ? { cut: { maxY } } : {}) }).layer;
		bodies[d] = B;
	}
	real.push({ id: c.id, slot: c.slot, held, s: stats(keys, bodies) });
}
console.log('Real view stats (share = item/body area; top/bottom in body heights; pal = distance to the other views\' colors):');
for (const r of real) console.log(r.id.padEnd(18), r.s.map((v) => `${v.dir}:${v.share.toFixed(2)}/${v.top.toFixed(2)}-${v.bottom.toFixed(2)}/p${v.pal}`).join('  '));
const rows = JSON.parse(readFileSync(OUT + 'results.json', 'utf8'));
const meaningful = (r: any) => r.mut !== 'recolor' || r.magnitude > 15;
const grid: Rule[] = [];
for (const shrink of [0.5, 0.6, 0.7]) for (const extent of [0.1, 0.15, 0.2]) for (const pal of [10, 15, 20, 25]) grid.push({ shrink, extent, pal });
const table: any[] = [];
for (const g of grid) {
	const fpItems = real.filter((r) => !r.held && Object.keys(crossView(r.s, g)).length), fpViews = real.filter((r) => !r.held).reduce((n, r) => n + Object.keys(crossView(r.s, g)).length, 0);
	const fpHeld = real.filter((r) => r.held && Object.keys(crossView(r.s, g)).length).length;
	const det: Record<string, string> = {};
	for (const m of ['lower40', 'top50', 'shrink', 'recolor']) {
		const rs = rows.filter((r: any) => r.mut === m && meaningful(r) && !['a-sword96', 'a-axe96', 'a-bow96'].includes(r.case));
		det[m] = `${rs.filter((r: any) => crossView(r.stats, g)[r.dir]).length}/${rs.length}`;
	}
	table.push({ ...g, fpItems: `${fpItems.length}/${real.filter((r) => !r.held).length}`, fpViews: `${fpViews}/${real.filter((r) => !r.held).reduce((n, r) => n + r.s.filter((v) => v.area).length, 0)}`, fpHeldItems: `${fpHeld}/3`, ...det, fpWhich: fpItems.map((r) => `${r.id}:${Object.entries(crossView(r.s, g)).map(([d, w]) => d + '[' + w.join(',') + ']').join(';')}`).join(' ') });
}
console.table(table.map(({ fpWhich, ...t }) => t));
for (const t of table) if (t.fpWhich) console.log(`${t.shrink}/${t.extent}/${t.pal}: ${t.fpWhich}`);
// which component detects what, at the default rule
const comp = (r: any) => (crossView(r.stats)[r.dir] ?? []).map((w: string) => w.split(' ')[0]).join('+') || 'MISS';
const by: Record<string, Record<string, number>> = {};
for (const r of rows.filter(meaningful)) (by[r.mut] ??= {})[comp(r)] = ((by[r.mut] ??= {})[comp(r)] ?? 0) + 1;
console.log('default rule components:', JSON.stringify(by));
console.log('recolor no-op (magnitude <= 15, gray/steel items):', rows.filter((r: any) => r.mut === 'recolor' && r.magnitude <= 15).map((r: any) => `${r.case}/${r.dir}`).join(' '));
writeFileSync(OUT + 'sweep.json', JSON.stringify({ real, table }, null, 1));
