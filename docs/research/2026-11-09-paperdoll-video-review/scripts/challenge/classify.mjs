import fs from 'node:fs';
const rows = JSON.parse(fs.readFileSync('hand-front/rows.json', 'utf8')).filter((r) => r.cand);
const back = (d) => /north/.test(d);
// labels from viewing the 4x/6x sheets (hand-front/*.png, front_*.png)
function label(r) {
  const it = r.item, d = r.dir, k = r.key;
  if (r.slot === 'main_hand' || r.slot === 'off_hand') return ['legit', 'held grip'];
  if (r.slot === 'back' && back(d)) return ['legit', 'back-view cape'];
  if (/^tabard/.test(it)) return ['legit', 'gauntlet / plate sleeve'];
  if (/^robe/.test(it)) return ['legit', 'sleeve cuff'];
  if ((r.slot === 'head' || r.slot === 'hair') && /slash\/east\/2/.test(k)) return ['ambiguous', 'raised fist vs bald scalp (head item)'];
  if (it === 'b-tunic') return d === 'south' ? ['paint', 'tunic edge over hanging hand'] : ['ambiguous', '3/4 view, far hand may be behind skirt'];
  if (/^chest/.test(it)) return ['paint', 'vest over hand in back view (arm across back / hanging)'];
  if (r.slot === 'back') {
    if (d === 'south') return ['paint', 'cape edge over hanging hand (front view)'];
    if (it === 'n-cloak128' && k === 'walk/east/2') return ['legit', 'far hand behind cloak (side view)'];
    if (it === 'n-cloak128' && d === 'east') return ['paint', 'cloak over near hand (side view)'];
    return ['ambiguous', 'side or 3/4 view, near/far hand unclear'];
  }
  return ['ambiguous', 'unlabeled'];
}
const L = rows.map((r) => ({ ...r, lab: label(r) }));
const sum = (a, f) => a.reduce((s, r) => s + f(r), 0);
function report(title, set, px = (r) => r.cand) {
  const tot = sum(set, px), p = sum(set.filter((r) => r.lab[0] === 'paint'), px), l = sum(set.filter((r) => r.lab[0] === 'legit'), px), a = tot - p - l;
  console.log(`\n## ${title}\npx ${tot}: paint-over ${p} (${(100 * p / (tot || 1)).toFixed(1)}%), legitimate ${l} (${(100 * l / (tot || 1)).toFixed(1)}%), ambiguous ${a}; cells ${set.filter((r) => px(r)).length}`);
  const g = new Map();
  for (const r of set) { if (!px(r)) continue; const key = `${r.lab[0]} | ${r.lab[1]}`; const e = g.get(key) ?? { px: 0, cells: 0, items: new Set() }; e.px += px(r); e.cells++; e.items.add(`${r.src}:${r.item.split('.')[0]}`); g.set(key, e); }
  for (const [k, e] of [...g].sort((a, b) => b[1].px - a[1].px)) console.log(`| ${k} | ${e.px} | ${e.cells} | ${[...e.items].join(', ')} |`);
  const cls = new Map();
  for (const r of set) { if (!px(r)) continue; const c = r.slot; const e = cls.get(c) ?? [0, 0, 0]; e[r.lab[0] === 'paint' ? 0 : r.lab[0] === 'legit' ? 1 : 2] += px(r); cls.set(c, e); }
  for (const [c, [p2, l2, a2]] of cls) console.log(`| ${c} | ${p2} | ${l2} | ${a2} | ${(100 * p2 / (p2 + l2 + a2)).toFixed(0)}% |`);
}
report('Rule as stated (all slots, all views)', L);
const R1set = (r) => ['legs', 'waist', 'feet', 'torso_inner'].includes(r.slot) || (r.slot === 'back' && !back(r.dir));
report('Rule restricted to the R1 slot list (legs, waist, feet, torso_inner, back in non-back views)', L.filter(R1set));
const ref = L.filter((r) => !['main_hand', 'off_hand', 'arms'].includes(r.slot) && !back(r.dir));
report('Refinement step 1+2 (no held/arms, no back views)', ref);
report('Refinement 1+2+3 (also hand px outside the dressed keyframe layer; posed only)', ref.filter((r) => r.posed), (r) => r.candOutsideKf);
const all = JSON.parse(fs.readFileSync('hand-front/rows.json', 'utf8'));
const per = new Map();
for (const r of all) { const e = per.get(r.slot) ?? { cells: 0, hand: 0 }; e.cells++; e.hand += r.hand; per.set(r.slot, e); }
console.log('\nslots measured', JSON.stringify([...per]));
console.log('cells', all.length, 'cand cells', rows.length, 'zero-hand cells', all.filter((r) => !r.hand).length);
fs.writeFileSync('hand-front/labels.json', JSON.stringify(L.map((r) => ({ src: r.src, item: r.item, key: r.key, cand: r.cand, outKf: r.candOutsideKf, label: r.lab, sheet: r.sheet, row: r.row }))));
