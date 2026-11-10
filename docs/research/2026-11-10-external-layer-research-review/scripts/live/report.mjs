import { readFileSync, writeFileSync } from 'node:fs';
const OUT = '<REPO>/app/test-results-crossview';
const J = (p) => JSON.parse(readFileSync(`${OUT}/${p}`, 'utf8'));
const labels = J('labels.json').labels, metrics = J('metrics.json'), jobs = J('jobs.json');
const rows = [];
const esc = (s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
for (const j of jobs) {
	const g = J(`calls/${j.id}/gates.json`), meta = J(`calls/${j.id}/meta.json`), m = metrics[j.id];
	const all = [...(g?.g1 ?? []).map(([, s]) => s), ...(g?.fails ?? []).flatMap(([, s]) => s), ...(g?.warnings ?? [])].flatMap((s) => String(s).split('; '));
	for (const d of Object.keys(m)) {
		const re = new RegExp(`(?:^|[\\s/])${esc(d)}(?:[/:\\s,]|$)`);
		const sig = all.filter((s) => re.test(s));
		const v = m[d], L = labels[`${j.id}/${d}`];
		rows.push({ call: j.id, group: j.group, item: j.prompt, slot: j.slot, seed: meta.calls[0].seed, key: meta.spec.key, view: d, label: L.label, reason: L.reason ?? '', note: L.note,
			gates: sig, itemStatus: g?.status, itemClean: g?.clean, d1: v.d1,
			palLOO: v.palLOO, palNearest: v.palNearest, palOthersToThis: v.palOthersToThis,
			top: v.top, bottom: v.bottom, dTop: v.dTop, dBottom: v.dBottom, extGap: v.extGap,
			share: v.share, shareToMinOther: v.shareToMinOther, shareToMaxOther: v.shareToMaxOther, area: v.area, bodyH: v.bodyH, gray: v.gray });
	}
}
const f = (x, n = 2) => (x == null || Number.isNaN(x) ? '-' : (+x).toFixed(n));
const isDef = (r) => r.label !== 'OK';
// threshold sweeps
const sweep = (name, val, ths) =>
	ths.map((t) => {
		const fl = rows.filter((r) => val(r) != null && val(r) > t);
		return { metric: name, threshold: t, flaggedA: fl.filter((r) => r.group === 'A').length, flaggedOKall: fl.filter((r) => !isDef(r)).length, defectsCaught: fl.filter(isDef).map((r) => `${r.call}/${r.view}`), okFlagged: fl.filter((r) => !isDef(r)).map((r) => `${r.call}/${r.view}`) };
	});
const sweeps = [
	...sweep('palLOO', (r) => r.palLOO, [5, 8, 10, 15, 20, 25]),
	...sweep('palNearest', (r) => r.palNearest, [5, 8, 10, 15, 20, 25]),
	...sweep('palOthersToThis', (r) => r.palOthersToThis, [5, 10, 15, 20, 25]),
	...sweep('extGap', (r) => r.extGap, [0.05, 0.1, 0.15, 0.2, 0.3]),
	...sweep('dBottom', (r) => r.dBottom, [0.05, 0.1, 0.15, 0.2]),
	...sweep('1/shareToMinOther (shrink)', (r) => (r.shareToMinOther ? 1 / r.shareToMinOther : null), [1.5, 2, 3, 5]),
	...sweep('shareToMaxOther (grow)', (r) => r.shareToMaxOther, [1.2, 1.5, 2])
];
const nA = rows.filter((r) => r.group === 'A').length, nOK = rows.filter((r) => !isDef(r)).length;
const defects = rows.filter(isDef);
// margins: defect metric value vs worst OK value
const margin = (k) => ({ metric: k, maxOK: Math.max(...rows.filter((r) => !isDef(r) && r[k] != null).map((r) => r[k])), maxOK_A: Math.max(...rows.filter((r) => r.group === 'A' && r[k] != null).map((r) => r[k])), defects: defects.map((r) => [`${r.call}/${r.view}`, r[k]]) });
const margins = ['palLOO', 'palNearest', 'palOthersToThis', 'extGap', 'dTop', 'dBottom'].map(margin);
writeFileSync(`${OUT}/results.json`, JSON.stringify({ rows, sweeps, margins, counts: { views: rows.length, A: nA, OK: nOK, defects: defects.length } }, null, 1));
let md = `# Cross-view qualification results (2026-11-10)\n\nLabels by eye first (labels.json), then metrics (metrics.json) with production helpers. Gates = current evaluateItem signals mentioning that view (G2/G3/G4/D1/D2/K1/H4...).\n\n`;
md += `Views: ${rows.length} (A ${nA}, OK total ${nOK}, defects ${defects.length}).\n\n`;
md += '| call | item | seed | view | eye label | current gates | palLOO | palNearest | palOthers→this | top | bottom | extGap | share | share/minOther | share/maxOther |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.call} | ${r.slot}: ${r.item} | ${r.seed} | ${r.view} | ${r.label}${r.reason ? ' (' + r.reason + ')' : ''} | ${r.gates.length ? r.gates.join('<br>') : '-'} | ${f(r.palLOO, 1)} | ${f(r.palNearest, 1)} | ${f(r.palOthersToThis, 1)} | ${f(r.top)} | ${f(r.bottom)} | ${f(r.extGap)} | ${f(r.share)} | ${f(r.shareToMinOther)} | ${f(r.shareToMaxOther)} |\n`;
md += '\n## Item-level gate outcome\n\n| call | status | clean |\n|---|---|---|\n';
for (const j of jobs) { const g = J(`calls/${j.id}/gates.json`); md += `| ${j.id} | ${g?.status} | ${g?.clean} |\n`; }
md += '\n## Threshold sweeps (flag when metric > threshold)\n\n| metric | threshold | A views flagged (of ' + nA + ') | all OK views flagged (of ' + nOK + ') | defects caught (of ' + defects.length + ') |\n|---|---|---|---|---|\n';
for (const s of sweeps) md += `| ${s.metric} | ${s.threshold} | ${s.flaggedA} | ${s.flaggedOKall} | ${s.defectsCaught.length}: ${s.defectsCaught.join(', ')} |\n`;
md += '\n## Margins\n\n| metric | max over OK views | max over A views | defect values |\n|---|---|---|---|\n';
for (const m of margins) md += `| ${m.metric} | ${f(m.maxOK)} | ${f(m.maxOK_A)} | ${m.defects.map(([k, v]) => `${k}: ${f(v)}`).join('; ')} |\n`;
writeFileSync(`${OUT}/results.md`, md);
console.log(md.split('## Item-level')[1]);
