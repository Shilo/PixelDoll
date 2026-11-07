// Free: the candidate rim-guard rules of lpc-fairness.ts on the real frozen benchmark (app/test/fixtures/bench), green-key cases
// only (keyFamily is defined in the green frame). Every raw cell runs through the production mask chain with the guard swapped
// (chromaMask -> rule -> absorbOutline -> components >= 2); prints the px each rule ships differently from production, with colors.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/lpc-fairness/bench-diff.ts
import { readFileSync } from 'node:fs';
import { runPipe } from '../extraction/bench-replay.ts';
import { FIX } from '../extraction/lib.ts';
import { pipe, RULES } from './lpc-fairness.ts';

const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { key: string; role?: string }) => c.key === 'green' && !c.role);
const totals: Record<string, { added: number; dropped: number }> = {}, lines: string[] = [];
for (const c of cases) {
  const run = await runPipe(c);
  for (const x of [...run.kf, ...run.cells]) {
    const ref = pipe(x.out, x.base, RULES.prod, 'green').mask;
    if (ref.some((v, i) => v !== x.mask[i]) && !x.posed) throw new Error(`${c.id} ${x.key}: reimplemented chain differs from extractCell`);
    for (const [name, rule] of Object.entries(RULES)) {
      if (name === 'prod') continue;
      const m = pipe(x.out, x.base, rule, 'green').mask, t = (totals[name] ??= { added: 0, dropped: 0 });
      for (let p = 0; p < m.length; p++) if (m[p] !== ref[p]) {
        if (m[p]) t.added++; else t.dropped++;
        if (name !== 'old' && name !== 'allLocal') { const o = x.out.data, b = x.base.data; lines.push(`${name} ${c.id} ${x.key} ${m[p] ? 'adds' : 'drops'} ${[o[p * 4], o[p * 4 + 1], o[p * 4 + 2]].join(',')} over body ${[b[p * 4], b[p * 4 + 1], b[p * 4 + 2]].join(',')} at ${p % x.base.w},${(p / x.base.w) | 0}`); }
      }
    }
  }
}
console.log(`green cases: ${cases.map((c: { id: string }) => c.id).join(' ')}`);
console.log('px vs production (raw extractor masks, before postProcess):', JSON.stringify(totals));
console.log(lines.join('\n'));
