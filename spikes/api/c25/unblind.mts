// Score blind judgments against the sealed key with the pre-registered rules: a judge counts only with ≥ 80 % calibration
// agreement and placebo side bias ≤ 65/35; judges that disagree make a tie. Usage: node c25/unblind.mts r1 judge1.txt judge2.txt
import fs from 'node:fs';
import path from 'node:path';
const [round, ...files] = process.argv.slice(2);
const key: any[] = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, `../out/c25/sealed_${round}.json`), 'utf8'));
const byFile = new Map(key.map((k) => [k.file, k]));
const parse = (f: string) => new Map(fs.readFileSync(f, 'utf8').split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((p) => p.length >= 2 && byFile.has(p[0].replace(/\.png$/, ''))).map((p) => [p[0].replace(/\.png$/, ''), { v: p[1].toLowerCase(), conf: +p[2], tags: p[3] }]));
const judges = files.map((f) => ({ f, j: parse(f) }));
const ok: typeof judges = [];
for (const { f, j } of judges) {
  const calib = key.filter((k) => k.kind === 'calib'), hit = calib.filter((k) => j.get(k.file)?.v === k.expectedTop).length;
  const plac = key.filter((k) => k.kind === 'placebo').map((k) => j.get(k.file)?.v).filter((v) => v === 'top' || v === 'bottom');
  const top = plac.filter((v) => v === 'top').length, bias = plac.length ? Math.max(top, plac.length - top) / plac.length : 0;
  const pass = hit / calib.length >= 0.8 && bias <= 0.65;
  console.log(`${path.basename(f)}: answered ${j.size}/${key.length}, calibration ${hit}/${calib.length}, placebo top/bottom ${top}/${plac.length - top} (ties ${key.filter((k) => k.kind === 'placebo').length - plac.length}) -> ${pass ? 'COUNTS' : 'EXCLUDED'}`);
  if (pass) ok.push({ f, j });
}
const winner = (k: any, v?: string) => (v === 'top' ? k.top : v === 'bottom' ? k.bottom : 'tie');
const tally: Record<string, Record<string, number>> = {};
for (const k of key.filter((x) => x.kind === 'test')) {
  const votes = ok.map(({ j }) => winner(k, j.get(k.file)?.v));
  const v = votes.length && votes.every((x) => x === votes[0]) ? votes[0] : 'tie';
  const comp = k.id.split(' ')[0] + ' ' + [k.top, k.bottom].sort().join(' vs ');
  (tally[comp] ??= {})[v] = (tally[comp][v] ?? 0) + 1;
  console.log(`${k.id.padEnd(36)} -> ${v}${votes.length > 1 && v === 'tie' && new Set(votes).size > 1 ? ` (split: ${votes.join('/')})` : ''}`);
}
console.log(JSON.stringify(tally, null, 1));
