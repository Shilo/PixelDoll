import fs from 'node:fs';
import { KEYDEFS, hueOf, type RGB } from './lib.mts';
const S: Record<string, RGB[]> = JSON.parse(fs.readFileSync(new URL('samples.json', import.meta.url), 'utf8'));
const [id, keyId] = [process.argv[2], process.argv[3]];
const k = KEYDEFS.find((x) => x.id === keyId);
const cnt = new Map<string, number>();
for (const c of S[id]) if (!k || k.score(c) >= (+process.argv[4] || 35)) { const h = '#' + c.map((v) => v.toString(16).padStart(2, '0')).join(''); cnt.set(h, (cnt.get(h) ?? 0) + 1); }
const top = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, 14);
console.log(id, keyId ?? '', [...cnt.values()].reduce((a, b) => a + b, 0), top.map(([h, n]) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB; return `${h}x${n}(h${Math.round(hueOf(...c))}${k ? ' s' + k.score(c) : ''})`; }).join(' '));
