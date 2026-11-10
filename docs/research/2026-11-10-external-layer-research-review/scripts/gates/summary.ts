import { readFileSync } from 'node:fs';
import { crossView } from './proto.ts';
const OUT = '<SCRATCH>/gates/';
const rows = JSON.parse(readFileSync(OUT + 'results.json', 'utf8')), { real } = JSON.parse(readFileSync(OUT + 'sweep.json', 'utf8'));
const HELD = ['a-sword96', 'a-axe96', 'a-bow96'];
for (const rule of [{ shrink: 0, extent: 0.1, pal: 20 }, { shrink: 0.4, extent: 0.1, pal: 20 }]) {
  console.log('rule', JSON.stringify(rule));
  for (const m of ['lower40', 'remove', 'recolor', 'top50', 'shrink']) {
    const rs = rows.filter((r: any) => !HELD.includes(r.case) && (m !== 'recolor' || r.magnitude > 15) && r.mut === m);
    const caught = rs.filter((r: any) => r.hard.length || r.review.length), clean = rs.filter((r: any) => r.baseClean), silent = clean.filter((r: any) => r.clean);
    const codes: Record<string, number> = {}; for (const r of caught) for (const c of [...r.hard.map((x: string) => x + '(hard)'), ...r.review.map((x: string) => x + '(review)')]) codes[c] = (codes[c] ?? 0) + 1;
    const proto = rs.filter((r: any) => crossView(r.stats, rule)[r.dir]);
    const protoSilent = silent.filter((r: any) => crossView(r.stats, rule)[r.dir]);
    console.log(`${m.padEnd(8)} trials ${rs.length} anyNewSignal ${caught.length} | on clean items ${clean.length}: silent ${silent.length} | proto ${proto.length}/${rs.length}, of silent ${protoSilent.length}/${silent.length} | ${JSON.stringify(codes)}`);
  }
}
// margins on real non-held views
let ext = 0, area = 1, pal = 0; const at: any = {};
for (const r of real.filter((r: any) => !r.held)) { const v = r.s.filter((x: any) => x.area); for (const x of v) { const o = v.filter((y: any) => y !== x);
  const db = Math.min(...o.map((y: any) => Math.abs(y.bottom - x.bottom))), dt = Math.min(...o.map((y: any) => Math.abs(y.top - x.top))), a = x.share / Math.min(...o.map((y: any) => y.share));
  if (Math.max(db, dt) > ext) { ext = Math.max(db, dt); at.ext = r.id + '/' + x.dir; } if (a < area) { area = a; at.area = r.id + '/' + x.dir; } if (x.pal > pal) { pal = x.pal; at.pal = r.id + '/' + x.dir; } } }
console.log('real non-held worst: extent', ext.toFixed(3), at.ext, '| area ratio', area.toFixed(2), at.area, '| palette', pal, at.pal);
for (const rule of [{ shrink: 0, extent: 0.1, pal: 20 }, { shrink: 0.4, extent: 0.1, pal: 20 }, { shrink: 0.6, extent: 0.1, pal: 20 }]) console.log(JSON.stringify(rule), 'FP items', real.filter((r: any) => !r.held && Object.keys(crossView(r.s, rule)).length).map((r: any) => r.id).join(',') || 'none', '| held FP', real.filter((r: any) => r.held && Object.keys(crossView(r.s, rule)).length).map((r: any) => r.id + JSON.stringify(crossView(r.s, rule))).join(','));
