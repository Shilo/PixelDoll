// Default dye materials on retained PixelLab items: production autoRamps vs a spritesplit-style chain detector vs the
// hybrid (production hue groups merged where a mutual-best adjacency step links them), scored against hand labels
// (labels.json, made from render.ts sheets before any detector ran on these items).
// Usage (repo root): node docs/research/2026-11-07-paperdoll-cycle/scripts/dye/compare.ts
import { readFileSync } from 'node:fs';
import { autoRamps, colorCounts, fromHex, lab, OUTLINE_C, OUTLINE_L, type Hex } from '../../../../../app/src/lib/dress/palette.ts';
import { variantRampOf } from '../../../../../app/src/lib/dress/dress.ts';
import { itemPaletteMatcher } from '../../../../../app/src/lib/dress/item-palette.ts';
import { chains, hybrid, neutralDark, neutralFamily, sameFamily } from './detectors.ts';
import { loadItems, saveJson } from './lib.ts';

interface Label { note: string; lowConfidence?: boolean; materials: Record<string, string[]>; outline: string[]; ignore: string[] }
const LABELS: Record<string, Label> = JSON.parse(readFileSync(new URL('labels.json', import.meta.url), 'utf8'));

// ---- scoring
type Ramps = number[][];
function score(lb: Label, counts: Map<number, number>, ramps: Ramps) {
  const mats = Object.entries(lb.materials).map(([name, hx]) => ({ name, set: new Set(hx.map(fromHex)) }));
  const scored = new Set(mats.flatMap((m) => [...m.set])), outline = new Set(lb.outline.map(fromHex));
  const r = ramps.map((x) => x.filter((c) => scored.has(c))).filter((x) => x.length);
  const px = (cs: Iterable<number>) => [...cs].reduce((s, c) => s + (counts.get(c) ?? 0), 0);
  const per = mats.map((m) => {
    let bj = 0, best: number[] = [];
    for (const x of r) { const inter = x.filter((c) => m.set.has(c)).length, j = inter / new Set([...x, ...m.set]).size; if (j > bj) { bj = j; best = x; } }
    const inside = best.filter((c) => m.set.has(c));
    return { material: m.name, colors: m.set.size, exact: bj === 1, jaccard: +bj.toFixed(3), fragments: r.filter((x) => x.some((c) => m.set.has(c))).length,
      pxRecall: +(px(inside) / Math.max(1, px(m.set))).toFixed(3), pxForeign: px(best.filter((c) => !m.set.has(c))), unassigned: [...m.set].filter((c) => !ramps.some((x) => x.includes(c))).length };
  });
  const merges = r.filter((x) => mats.filter((m) => x.some((c) => m.set.has(c))).length >= 2)
    .map((x) => mats.filter((m) => x.some((c) => m.set.has(c))).map((m) => `${m.name}:${px(x.filter((c) => m.set.has(c)))}px`).join('+'));
  const outlineInRamps = lb.outline.map(fromHex).filter((c) => ramps.some((x) => x.includes(c))).length;
  return { per, merges, ramps: ramps.length, outlineInRamps, outlineColors: outline.size };
}

/** Dye check: give every material ramp of the item the same swatch (what "dye the steel" needs today when it is split) and
 * count lightness-order inversions among recolored pixels' source colors versus the original. */
function dyeInversions(ramps: Ramps, pick = 'crimson'): number {
  const map = new Map<number, number>();
  for (const r of ramps) { const hex = r.map((c) => `#${c.toString(16).padStart(6, '0')}` as Hex), v = variantRampOf({ id: 'x', label: '', ramp: hex, variants: {}, owner: 'x' }, pick)!; r.forEach((c, i) => map.set(c, fromHex(v[i]))); }
  const cs = [...map.keys()].sort((a, b) => lab(a)[0] - lab(b)[0]); let inv = 0;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (lab(map.get(cs[i])!)[0] > lab(map.get(cs[j])!)[0] + 1e-3) inv++;
  return inv;
}

const rows: Record<string, unknown>[] = [];
for (const it of await loadItems()) {
  const lb = LABELS[it.id]; if (!lb) continue;
  const counts = colorCounts(it.frames);
  const prod = (autoRamps(counts) as Hex[][]).map((r) => r.map(fromHex));
  const chStanding = chains(it.standing), chAll = chains(it.frames);
  const det: Record<string, Ramps> = {
    prod,
    spritesplit: chStanding,
    hybrid: hybrid(prod, chStanding),
    hybridAllFrames: hybrid(prod, chAll),
    hybridGuarded: hybrid(prod, chStanding, sameFamily),
    hybridNeutral: hybrid(prod, chStanding, neutralFamily),
    hybridNeutralNoOutline: hybrid(prod, chains(it.standing, false), neutralFamily),
    hybridNeutralAllFrames: hybrid(prod, chAll, neutralFamily),
    mergeAll: [[...counts.keys()].filter((c) => !neutralDark(c))],
  };
  const res = Object.fromEntries(Object.entries(det).map(([k, r]) => [k, score(lb, counts, r)]));
  const neutralRamps = Object.fromEntries(Object.entries(det).map(([k, r]) => [k, r.filter((x) => x.every((c) => { const [L, a, b] = lab(c); return L >= OUTLINE_L && Math.hypot(a, b) <= OUTLINE_C; })).length]));
  // explicit 'Match colors' (itemPaletteMatcher) needs exactly one all-neutral material on the item
  const matcher = Object.fromEntries(Object.entries(det).map(([k, r]) => { const mats = r.map((x, i) => ({ id: `m${i}`, label: '', owner: 'it', variants: {}, ramp: x.map((c) => `#${c.toString(16).padStart(6, '0')}` as Hex) }));
    try { itemPaletteMatcher({ id: 'it', materials: mats.map((m) => m.id) }, mats); return [k, 'ok']; } catch { return [k, 'refused']; } }));
  const steelish = Object.entries(lb.materials).filter(([n]) => n === 'steel' || n === 'blade');
  const dye = steelish.length ? Object.fromEntries(Object.entries(det).filter(([k]) => k !== 'mergeAll').map(([k, r]) => {
    const set = new Set(steelish.flatMap(([, h]) => h.map(fromHex)));
    return [k, dyeInversions(r.filter((x) => x.some((c) => set.has(c))).map((x) => x.filter((c) => set.has(c))))];
  })) : undefined;
  rows.push({ id: it.id, multi: Object.keys(lb.materials).length > 1, lowConfidence: !!lb.lowConfidence, colors: counts.size, res, neutralRamps, matcher, dye,
    ramps: Object.fromEntries(Object.entries(det).map(([k, r]) => [k, r.map((x) => x.map((c) => `#${c.toString(16).padStart(6, '0')}`))])) });
}

const keys = ['prod', 'spritesplit', 'hybrid', 'hybridAllFrames', 'hybridGuarded', 'hybridNeutral', 'hybridNeutralNoOutline', 'hybridNeutralAllFrames', 'mergeAll'];
const agg = (filter: (r: any) => boolean) => Object.fromEntries(keys.map((k) => {
  const rs = rows.filter(filter) as any[], per = rs.flatMap((r) => r.res[k].per);
  return [k, { items: rs.length, materials: per.length, exact: per.filter((p: any) => p.exact).length, meanJaccard: +(per.reduce((s: number, p: any) => s + p.jaccard, 0) / per.length).toFixed(3),
    meanPxRecall: +(per.reduce((s: number, p: any) => s + p.pxRecall, 0) / per.length).toFixed(3), fragmented: per.filter((p: any) => p.fragments > 1).length,
    itemsWithMerge: rs.filter((r) => r.res[k].merges.length).length, outlineColorsInRamps: rs.reduce((s, r) => s + r.res[k].outlineInRamps, 0) }];
}));
const summary = { all: agg(() => true), single: agg((r) => !r.multi), multi: agg((r) => r.multi), multiConfident: agg((r) => r.multi && !r.lowConfidence) };
saveJson('compare.json', { summary, rows });
for (const [name, s] of Object.entries(summary)) { console.log(`\n== ${name}`); console.table(s); }
console.log('\nper item: exact materials / total, merges');
for (const r of rows as any[]) console.log(r.id.padEnd(22), keys.map((k) => `${k}:${r.res[k].per.filter((p: any) => p.exact).length}/${r.res[k].per.length}(${r.res[k].ramps}r)${r.res[k].merges.length ? '!' + r.res[k].merges.join(';') : ''}`).join('  '), r.dye ? `dyeInv ${JSON.stringify(r.dye)}` : '', `matcher prod ${r.matcher.prod} hybrid ${r.matcher.hybrid} neutral ${r.matcher.hybridNeutral}`);
