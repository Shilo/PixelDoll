import fs from 'node:fs';
const R = JSON.parse(fs.readFileSync('hand-front/r2.json', 'utf8'));
const bodyOf = (r) => (r.src === 'bench' ? r.item[0].toUpperCase() : 'A');
const frames = new Map();
for (const r of R) frames.set(`${bodyOf(r)} ${r.key}`, r);
const F = [...frames.values()];
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
console.log('unique body frames', F.length);
for (const b of ['A', 'B', 'C', 'N']) {
  const f = [...frames].filter(([k]) => k.startsWith(b + ' ')).map(([, v]) => v); if (!f.length) continue;
  const all = f.map((r) => r.med);
  console.log(`| ${b} | ${f.length} | ${f.reduce((s, r) => s + r.n, 0)} | ${q(all, 0.1)} / ${q(all, 0.5)} | ${(100 * f.reduce((s, r) => s + r.low10 * r.n, 0) / f.reduce((s, r) => s + r.n, 0)).toFixed(1)}% | ${(100 * f.reduce((s, r) => s + r.merged5 * r.n, 0) / f.reduce((s, r) => s + r.n, 0)).toFixed(1)}% | ${f.filter((r) => r.low10 >= 0.3).length} |`);
}
// failures per item-frame vs contrast
const fail = (r) => r.g2 || r.g3;
const low = R.filter((r) => r.low10 >= 0.3), hi = R.filter((r) => r.low10 < 0.3);
const rate = (a, f) => `${a.filter(f).length}/${a.length} (${(100 * a.filter(f).length / (a.length || 1)).toFixed(1)}%)`;
console.log('item-frames', R.length, 'low-contrast (>=30% of arm/torso steps < 10)', low.length);
console.log('G2 or G3: low', rate(low, fail), 'other', rate(hi, fail));
console.log('G2: low', rate(low, (r) => r.g2), 'other', rate(hi, (r) => r.g2));
console.log('G3: low', rate(low, (r) => r.g3), 'other', rate(hi, (r) => r.g3));
const pb = (xs, ys) => { const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let sxy = 0, sx = 0, sy = 0; for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sx += (xs[i] - mx) ** 2; sy += (ys[i] - my) ** 2; } return sxy / Math.sqrt(sx * sy || 1); };
console.log('r(low10 share, fail)', pb(R.map((r) => r.low10), R.map((r) => +fail(r))).toFixed(3), 'r(median step, fail)', pb(R.map((r) => r.med), R.map((r) => +fail(r))).toFixed(3), 'r(low10, keyLost)', pb(R.map((r) => r.low10), R.map((r) => r.keyLost ?? 0)).toFixed(3));
console.log('per item fails', JSON.stringify(Object.entries(R.reduce((m, r) => { const k = `${r.src}:${r.item}`; m[k] ??= [0, 0]; m[k][0] += +fail(r); m[k][1]++; return m; }, {})).filter(([, v]) => v[0])));
const lowF = F.filter((r) => r.low10 >= 0.3).map((r) => `${bodyOf(r)} ${r.key} ${(r.low10 * 100).toFixed(0)}% med ${r.med}`);
console.log('low-contrast body frames', lowF.length, lowF.slice(0, 40).join('; '));
for (const b of ['A', 'B', 'C', 'N']) {
  const f = [...frames].filter(([k]) => k.startsWith(b + ' ')).map(([, v]) => v); if (!f.length) continue;
  const n = f.reduce((s, r) => s + r.fn, 0);
  console.log(`skin-forearm/torso ${b}: frames ${f.length} pairs ${n} step<10 ${(100 * f.reduce((s, r) => s + r.flow10, 0) / (n || 1)).toFixed(1)}% five-tone merged ${(100 * f.reduce((s, r) => s + r.fmerged, 0) / (n || 1)).toFixed(1)}% frames with any pair ${f.filter((r) => r.fn).length}`);
}
const noJ = R.filter((r) => r.item !== 'b-jester');
console.log('without b-jester: fails', noJ.filter(fail).length, 'of', noJ.length, noJ.filter(fail).map((r) => `${r.item} ${r.key} low10 ${(r.low10*100).toFixed(0)}% fl ${r.fn ? (100*r.flow10/r.fn).toFixed(0) : '-'}%`).join('; '));
