import { readFileSync } from 'node:fs';
const rows: any[] = JSON.parse(readFileSync('measure.json', 'utf8'));
const f = (x: number) => x.toFixed(2);
function tab(title: string, key: (r: any) => string, filt: (r: any) => boolean) {
	const g: Record<string, any[]> = {};
	for (const r of rows.filter(filt)) (g[key(r)] ??= []).push(r);
	console.log(`\n### ${title}\n\n| Group | n | rim px/frame before | after | frames >= 3 before | after | cut px/frame (dark share) | changed frames |\n|---|---|---|---|---|---|---|---|`);
	for (const [k, rs] of Object.entries(g).sort()) {
		const n = rs.length, s = (fn: (r: any) => number) => rs.reduce((a, r) => a + fn(r), 0);
		const cut = s((r) => r.cut);
		console.log(`| ${k} | ${n} | ${f(s((r) => r.b) / n)} | ${f(s((r) => r.a) / n)} | ${s((r) => +(r.b >= 3))} (${Math.round((100 * s((r) => +(r.b >= 3))) / n)} %) | ${s((r) => +(r.a >= 3))} (${Math.round((100 * s((r) => +(r.a >= 3))) / n)} %) | ${f(cut / n)} (${cut ? Math.round((100 * s((r) => r.cutDark)) / cut) : 0} %) | ${s((r) => +(r.cut > 0))} |`);
	}
}
tab('Bench by slot, posed vs rest', (r) => `${r.slot} ${r.posed ? 'posed' : 'REST'}`, (r) => r.src === 'bench');
tab('Bench by case and view (posed)', (r) => `${r.id} ${r.clip.split('/')[1]}`, (r) => r.src === 'bench' && r.posed && ['torso_outer', 'feet', 'back'].includes(r.slot));
tab('Bench rest keyframes by case', (r) => `${r.id} ${r.clip.split('/')[1]}`, (r) => r.src === 'bench' && !r.posed && ['torso_outer', 'feet', 'back'].includes(r.slot));
tab('Matched trials by case, arm, view', (r) => `${r.id} ${r.clip.split(' ').slice(0, 2).join(' ')}`, (r) => r.src === 'trial');
// flicker proxy: per clip, frame-to-frame changes of bottom row and width (consecutive frames, looping)
const clips: Record<string, any[]> = {};
for (const r of rows.filter((r) => r.posed && r.src === 'bench')) (clips[`${r.id} ${r.clip}`] ??= []).push(r);
let yb = 0, ya = 0, wb = 0, wa = 0, db = 0, da = 0; const worst: any[] = [];
for (const [k, rs] of Object.entries(clips)) {
	rs.sort((a, b) => a.i - b.i);
	let cyb = 0, cya = 0, cwb = 0, cwa = 0, cdb = 0, cda = 0;
	for (let i = 0; i < rs.length; i++) { const p = rs[(i + rs.length - 1) % rs.length], q = rs[i];
		cyb += +(p.y1b !== q.y1b); cya += +(p.y1a !== q.y1a); cwb += +(p.wb !== q.wb); cwa += +(p.wa !== q.wa); cdb += Math.abs(p.b - q.b); cda += Math.abs(p.a - q.a); }
	yb += cyb; ya += cya; wb += cwb; wa += cwa; db += cdb; da += cda;
	if (cya > cyb || cwa > cwb) worst.push({ k, cyb, cya, cwb, cwa });
	worst.push({ k, rim: rs.reduce((a, r) => a + r.b, 0), rimA: rs.reduce((a, r) => a + r.a, 0), cdb, cda, cut: rs.reduce((a, r) => a + r.cut, 0) });
}
console.log(`\nflicker proxy over ${Object.keys(clips).length} posed bench clips: bottom-row changes ${yb} -> ${ya}; width changes ${wb} -> ${wa}; sum |rim delta| ${db} -> ${da}`);
console.log(worst.filter((x) => 'cya' in x));
console.log(worst.filter((x) => 'rim' in x).sort((a, b) => b.rim - a.rim).slice(0, 10));
const h = rows.filter((r) => ['main_hand', 'off_hand', 'head', 'hair'].includes(r.slot));
console.log('held/head/hair cells', h.length, 'with cut', h.filter((r) => r.cut).length);
