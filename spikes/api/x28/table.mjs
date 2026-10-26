// Prints the dressing evaluations (out/x28/D/*.eval.json) as one table, plus each tool's billed generations.
import fs from 'node:fs';
const D = 'out/x28/D', led = fs.readFileSync('out/x28/ledger.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const gens = (t) => led.filter((r) => r.arm === t).map((r) => r.gens ?? '?');
for (const t of ['ea', 'to', 'ei', 'ip']) console.log(t, 'gens per call', [...new Set(gens(t))].join('/'), 'calls', gens(t).length);
console.log('tool item clip           dir   kept  outside  area/anchor  areaCV  palDist  missing  shifts');
for (const f of fs.readdirSync(D).filter((f) => f.endsWith('.eval.json')).sort()) {
  const [t, item, ...rest] = f.replace('.eval.json', '').split('_'), clip = rest.slice(0, -1).join('_');
  for (const [d, r] of Object.entries(JSON.parse(fs.readFileSync(`${D}/${f}`)))) console.log(t.padEnd(4), item.padEnd(5), clip.padEnd(13), d.padEnd(5), String(r.keptMin).padEnd(5), String(r.outsideMax).padEnd(8), String(r.areaVsAnchor).padEnd(12), String(r.areaCV).padEnd(7), String(r.palMean).padEnd(8), String(r.missing).padEnd(8), r.shifts);
}
