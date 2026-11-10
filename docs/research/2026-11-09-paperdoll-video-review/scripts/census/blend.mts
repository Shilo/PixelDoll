// Edge contamination: an item shade mixed with the key's mid ramp (t = 0.5) at 25 % and 50 % key, as an anti-aliased or
// blended edge px would be. Score under the same key: lost (>= 35) = the edge is eaten, near = flagged, ok = kept as tinted.
import { KEYDEFS, classify, type RGB } from './lib.mts';
import { MATERIALS } from './materials.mts';
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const warm = ['skin light', 'skin medium', 'skin dark', 'hair blonde', 'hair ginger', 'hair brown', 'leather brown', 'wood', 'gold / brass', 'bronze / copper', 'red cloth', 'orange', 'bone / ivory', 'olive / khaki'];
const cool = ['iron / steel (neutral)', 'steel (blue-tinted)', 'silver highlights', 'navy', 'denim', 'purple', 'turquoise gem', 'ice / frost', 'forest green', 'white cloth (cool shade, real robe)'];
console.log('| Key | mix | warm materials (' + warm.length + ' x shades): lost / near | cool & other: lost / near | worst warm material |');
console.log('| --- | --- | --- | --- | --- |');
for (const k of KEYDEFS) for (const a of [0.25, 0.5]) {
  const key = k.ramp(0.5);
  const run = (ms: string[]) => { let l = 0, n = 0, t = 0; const per: Record<string, number> = {};
    for (const m of ms) for (const h of MATERIALS[m]) { const c = hex(h), x = c.map((v, i) => Math.round(v * (1 - a) + key[i] * a)) as RGB, r = classify(k, x); t++; if (r === 'lost') { l++; per[m] = (per[m] ?? 0) + 1; } else if (r === 'near') n++; }
    return { s: `${l}/${t} lost, ${n} near`, worst: Object.entries(per).sort((p, q) => q[1] - p[1]).slice(0, 3).map(([m, v]) => `${m} ${v}`).join(', ') }; };
  const w = run(warm), c = run(cool);
  console.log(`| ${k.id} | ${a * 100} % key | ${w.s} | ${c.s} | ${w.worst || '-'} |`);
}
