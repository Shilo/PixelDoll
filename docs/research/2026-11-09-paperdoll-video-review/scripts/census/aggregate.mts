// Aggregates census.json + samples.json into markdown tables (stdout).
import fs from 'node:fs';
import { KEYDEFS, classify, hueOf, type RGB } from './lib.mts';
const R: any[] = JSON.parse(fs.readFileSync(new URL('census.json', import.meta.url), 'utf8'));
const S: Record<string, RGB[]> = JSON.parse(fs.readFileSync(new URL('samples.json', import.meta.url), 'utf8'));
const GENID: Record<string, string> = { green: 'green120', magenta: 'magenta300', blue: 'blue240', azure: 'azure210' };
const pct = (a: number, b: number) => (b ? ((100 * a) / b).toFixed(2) : '-');
const groups: [string, (r: any) => boolean][] = [
  ['Ordinary items (no key-colliding color word), all generated on green', (r) => !r.test],
  ['Color-test items (prompt names green with pink/red/purple; generated on magenta, blue, azure or the real base)', (r) => r.test],
  ['Real-base ("none") outputs only: no mannequin key could bias colors (K jester, K holly)', (r) => r.gen === 'none'],
  ['All items', () => true],
];
for (const bright of [false, true]) {
  console.log(`\n### Loss and near-key per key${bright ? ', bright px only (max channel >= 64; drops dark outlines)' : ', all item px'}\n`);
  console.log('Lost = item px scoring >= KT 35 (silently removed). Near = 20..34 with max >= 64 (production flag). Switch = items losing >= 1 % of px. Items generated on a key are excluded from that key\'s column (their key-colored px are indistinguishable from the mannequin); n = items/px counted.\n');
  for (const [title, f] of groups) {
    const rs = R.filter(f);
    console.log(`**${title}** (${rs.length} items)\n`);
    console.log('| Key | items | px | lost % | near % | items needing switch (>= 1 % lost) | items with >= 5 % near |');
    console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const k of KEYDEFS) {
      let n = 0, lost = 0, near = 0, sw = 0, nz = 0, items = 0;
      for (const r of rs) {
        if (GENID[r.gen] === k.id) continue;
        const px = S[r.id].filter((c) => !bright || Math.max(...c) >= 64);
        if (!px.length) continue;
        items++;
        let l = 0, m = 0;
        for (const c of px) { const x = classify(k, c); if (x === 'lost') l++; else if (x === 'near') m++; }
        n += px.length; lost += l; near += m;
        if (l / px.length >= 0.01) sw++;
        if (m / px.length >= 0.05) nz++;
      }
      console.log(`| ${k.id} | ${items} | ${n} | ${pct(lost, n)} | ${pct(near, n)} | ${sw} (${pct(sw, items)} %) | ${nz} |`);
    }
    console.log('');
  }
}
// generation-key upper bound: ambiguous off-ramp px share on green-generated ordinary items
{
  const rs = R.filter((r) => r.gen === 'green' && !r.test);
  const n = rs.reduce((a, r) => a + r.n + r.ambOff, 0), amb = rs.reduce((a, r) => a + r.ambOff, 0), ambBright = rs.reduce((a, r) => a + S[r.id + ' ambOff'].filter((c) => Math.max(...c) >= 64).length, 0);
  const sw = rs.filter((r) => r.ambOff / (r.n + r.ambOff) >= 0.01).length;
  console.log(`\n### Green on its own items (upper bound)\n\nOn the ${rs.length} ordinary green-generated items, ${amb} of ${n} candidate px (${pct(amb, n)} %) score as green and sit more than 24 off the green ramp (could be lost item px, or a redrawn mannequin / key-tinted outline); ${ambBright} of them are bright (max >= 64). ${sw} items exceed 1 %. All-ambiguous px (incl. on-ramp): ${rs.reduce((a, r) => a + r.amb, 0)}.\n`);
}
// per-item table
console.log('\n### Per item (lost px / near px per key; "gen" = generation key, its column is n/a)\n');
console.log('| Item | body | gen | fit | item px | amb (off-ramp) | ' + KEYDEFS.map((k) => k.id).join(' | ') + ' |');
console.log('| --- | --- | --- | ---: | ---: | ---: | ' + KEYDEFS.map(() => '---:').join(' | ') + ' |');
for (const r of R) console.log(`| ${r.id}${r.test ? ' *' : ''} | ${r.body} | ${r.gen} | ${r.fit} | ${r.n} | ${r.amb} (${r.ambOff}) | ` + KEYDEFS.map((k) => (GENID[r.gen] === k.id ? 'n/a' : `${r.per[k.id].lost}/${r.per[k.id].near}`)).join(' | ') + ' |');
// hue histogram
for (const [title, f] of groups.slice(0, 2)) {
  const h = new Array(24).fill(0); let sat = 0, all = 0;
  for (const r of R.filter(f)) { all += r.n; for (let i = 0; i < 24; i++) h[i] += r.hist[i]; sat += r.sat; }
  console.log(`\n### Hue histogram, ${title} (unambiguous item px with chroma >= 24: ${sat} of ${all})\n`);
  console.log('| Hue bin | px | % of saturated |\n| --- | ---: | ---: |');
  for (let i = 0; i < 24; i++) console.log(`| ${i * 15}-${i * 15 + 14} | ${h[i]} | ${pct(h[i], sat)} |`);
}
// dark-outline effect: lost px by brightness and hue per key on ordinary items
console.log('\n### What each key loses on ordinary items (top colors)\n');
for (const k of KEYDEFS) {
  const cnt = new Map<string, number>();
  for (const r of R.filter((r) => !r.test && GENID[r.gen] !== k.id)) for (const c of S[r.id]) if (classify(k, c) !== 'ok') { const key = `${classify(k, c)} #${c.map((v) => v.toString(16).padStart(2, '0')).join('')} h${Math.round(hueOf(...c))} s${k.score(c)}`; cnt.set(key, (cnt.get(key) ?? 0) + 1); }
  const top = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`- ${k.id}: ${top.map(([c, n]) => `${c} x${n}`).join('; ') || 'none'}`);
}
