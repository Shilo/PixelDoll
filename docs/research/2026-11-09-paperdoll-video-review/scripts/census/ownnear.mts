import fs from 'node:fs';
import { KEYDEFS, classify, hueOf, type RGB } from './lib.mts';
const R: any[] = JSON.parse(fs.readFileSync(new URL('census.json', import.meta.url), 'utf8'));
const S: Record<string, RGB[]> = JSON.parse(fs.readFileSync(new URL('samples.json', import.meta.url), 'utf8'));
const g = KEYDEFS[0]; let n = 0, near = 0, its = 0; const cnt = new Map<string, number>();
for (const r of R.filter((r) => r.gen === 'green' && !r.test)) { let m = 0; for (const c of S[r.id]) { n++; if (classify(g, c) === 'near') { near++; m++; const h = '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('') + ' h' + Math.round(hueOf(...c)); cnt.set(h, (cnt.get(h) ?? 0) + 1); } } if (m / S[r.id].length >= 0.05) its++; }
console.log(`green near-key on its own ordinary items: ${near}/${n} = ${(100 * near / n).toFixed(2)} %, items >= 5 %: ${its}; top`, [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([h, v]) => `${h} x${v}`).join('; '));
