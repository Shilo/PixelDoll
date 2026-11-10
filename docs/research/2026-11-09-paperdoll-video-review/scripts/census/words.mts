// The 2026-11-07 audit's 169 color words (parsed from color-words.ts, not copied), each as 4 shades (its shades()), per key.
import fs from 'node:fs';
import { KEYDEFS, KT, type RGB } from './lib.mts';
const src = fs.readFileSync('C:/Programming_Files/Shilocity/PixelLab/PixelDoll/docs/research/2026-11-07-paperdoll-cycle/scripts/audit/color-words.ts', 'utf8');
const body = src.slice(src.indexOf('const WORDS'), src.indexOf('};', src.indexOf('const WORDS')));
const W: Record<string, string> = Object.fromEntries([...body.matchAll(/(\w+): '([0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]));
// families by the audit's own comments
const fam = (w: string) => { const keys = Object.keys(W), i = keys.indexOf(w); return i < keys.indexOf('red') ? 'green/blue-green' : i < keys.indexOf('blue') ? 'red/pink/purple' : i < keys.indexOf('orange') ? 'blue' : 'warm/neutral'; };
const shades = (c: number[]): RGB[] => [c.map((v) => Math.round(v * 0.55)), c.map((v) => Math.round(v * 0.75)), c, c.map((v) => Math.round(v + (255 - v) * 0.3))] as RGB[];
const fams = ['green/blue-green', 'red/pink/purple', 'blue', 'warm/neutral'];
console.log(`${Object.keys(W).length} words: ` + fams.map((f) => `${f} ${Object.keys(W).filter((w) => fam(w) === f).length}`).join(', ') + '\n');
console.log('| Key | words with >= 1 of 4 shades lost | ' + fams.join(' | ') + ' | words |');
console.log('| --- | ---: | ' + fams.map(() => '---:').join(' | ') + ' | --- |');
for (const k of KEYDEFS) {
  const hit = Object.entries(W).filter(([, h]) => shades([0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))).some((s) => k.score(s) >= KT)).map(([w]) => w);
  console.log(`| ${k.id} | ${hit.length} | ` + fams.map((f) => hit.filter((w) => fam(w) === f).length).join(' | ') + ` | ${hit.join(', ')} |`);
}
