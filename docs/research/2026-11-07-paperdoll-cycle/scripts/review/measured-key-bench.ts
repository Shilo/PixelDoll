// Review of the staged measured-key change (K1 note, retryKey): replay every frozen benchmark keyframe through the production
// keyframe extractor (runPipe, as the bench harness does), emulate the keyframe G3/G4 gates evaluateItem runs first, then call
// the production measuredKeyCollision with a plausible prompt per case. Reports, per case and dressed view: near-key share,
// whether K1 fires (>= KEY_COLLISION), the measured retry key versus pickKey(prompt), and the top near-key colors.
// Offline, production code imported. Run from the repo root:
//   node docs/research/2026-11-07-paperdoll-cycle/scripts/review/measured-key-bench.ts
import { readFileSync } from 'node:fs';
import { keyFor, keyScore, KEYS, KT, NEAR_KEY, nearKeyShare, pickKey, type Key } from '../../../../../app/src/lib/image/chroma.ts';
import { GATES } from '../../../../../app/src/lib/items/items.ts';
import { KEY_COLLISION, measuredKeyCollision } from '../../../../../app/src/lib/items/run.ts';
import { FIX } from '../extraction/lib.ts';
import { runPipe } from '../extraction/bench-replay.ts';

// Prompts are reconstructed from the campaign docs (exact ones where quoted, otherwise the item as described).
const PROMPT: Record<string, string> = {
  'a-helmet': 'a simple gray steel knight helmet', 'a-cape': 'a long red cloth cape', 'a-chest': 'a brown leather chest armor vest',
  'a-boots': 'brown leather boots', 'a-hair': 'short messy dark brown hair', 'a-sword96': 'a steel longsword', 'a-axe96': 'a steel battle axe',
  'a-jester-magenta': 'green-and-pink jester hat', 'a-jester-blue': 'green-and-pink jester hat', 'b-tunic': 'red and green holly-trimmed tunic',
  'b-cloak': 'a hooded elven cloak', 'b-greathelm': 'a steel great helm', 'b-jester': 'green-and-pink jester hat', 'b-jester-blue': 'green-and-pink jester hat',
  'n-cloak128': 'a long traveler cloak', 'c-greathelm': 'a steel great helm', 'a-bow96': 'a wooden longbow with a leather grip',
  'a-plume-azure': 'a steel helmet with a green and purple plume', 'a-stripes-azure': 'a green and purple striped tunic', 'a-stripes-magenta': 'a green and purple striped tunic',
};
interface Case { id: string; body: string; slot: string; key: Key | 'none'; pad: number; clips: string[]; role?: string }
const cases: Case[] = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: Case) => c.key !== 'none');
const hex = (c: number[]) => c.map((v) => v.toString(16).padStart(2, '0')).join('');
let flaggedClean = 0;
for (const c of cases) {
  const route = c.key as Key, run = await runPipe(c as never), prompt = PROMPT[c.id] ?? '';
  const dressOuts = run.kf.map((x) => ({ k: 0, key: x.key, out: x.out }));
  const g1 = new Map<number, string>();
  for (const x of run.kf) {
    const bad = [(x.keyOutside ?? 0) > GATES.keyOutside && `G3 keyframe ${x.key} key outside ${x.keyOutside!.toFixed(3)}`, !x.area && `G4 keyframe ${x.key}: item missing`].filter(Boolean);
    if (bad.length) g1.set(0, [g1.get(0), ...bad].filter(Boolean).join('; '));
  }
  const pre = g1.get(0) ?? '';
  const retry = measuredKeyCollision(prompt, route, run.kf, dressOuts, g1);
  const views = run.kf.map((x) => {
    const s = nearKeyShare(x.out, x.mask, route), hist = new Map<string, number>();
    for (let p = 0; p < x.mask.length; p++) if (x.mask[p]) { const o = x.out.data, sc = keyScore(route, o[p * 4], o[p * 4 + 1], o[p * 4 + 2]); if (sc >= NEAR_KEY && sc < KT) { const h = hex([o[p * 4], o[p * 4 + 1], o[p * 4 + 2]]); hist.set(h, (hist.get(h) ?? 0) + 1); } }
    const top = [...hist].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h, n]) => `#${h}x${n}`).join(' ');
    return `${x.key.split('/')[1]}:${Math.round(s * 100)}%${s >= KEY_COLLISION ? '*' : ''}(${x.area}px${top ? ' ' + top : ''})`;
  });
  const k1 = (g1.get(0) ?? '').split(/;\s*/).filter((s) => s.startsWith('K1'));
  if (k1.length && !c.role) flaggedClean++;
  console.log(`${c.id.padEnd(18)} ${route.padEnd(7)} pick ${pickKey(prompt).padEnd(7)} pre[${pre ? pre.replace(/keyframe rest\//g, '').slice(0, 70) : ''}] K1 ${k1.length} retry ${retry ?? '-'}`);
  console.log(`    ${views.join('  ')}`);
}
console.log(`\nnon-reference cases with a K1 note: ${flaggedClean}`);

// Same views, threshold sweep: how many non-reference views (cases) would be flagged at each threshold.
console.log('\nThreshold sweep (views flagged / cases flagged), non-reference cases vs recorded collisions (reference role):');
const all: { id: string; ref: boolean; s: number }[] = [];
for (const c of cases) { const run = await runPipe(c as never); for (const x of run.kf) all.push({ id: c.id, ref: !!c.role, s: nearKeyShare(x.out, x.mask, c.key as Key) }); }
for (const t of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
  const f = (ref: boolean) => { const v = all.filter((a) => a.ref === ref && a.s >= t); return `${v.length}/${new Set(v.map((a) => a.id)).size}`; };
  console.log(`  >= ${t}: clean ${f(false)}  reference ${f(true)}`);
}
void KEYS; void keyFor;
