// Evaluate arms D and K (read-only): production keyframe extraction per view, gates and presence; layer-over-base sheets.
import fs from 'node:fs';
import { readOnly, OUT, items, chroma, paid, type Img } from './lib.mts';
readOnly();
import { sheet, count } from './evaluate.mts';
import { save } from './lib.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { D_ITEMS, K_ITEMS, SEEDS, fileOf, swapGB } from './arm_dk.mts';
const rig = rigA();
const skel = (d: string) => Object.fromEntries((rig.rest as any)[d].keypoints.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));

/** Extract one dress output view the way production would for that route (blue = green code on swapped channels). */
export function extractView(variant: string, item: { slot: string; prompt: string }, d: string, base: Img, out: Img) {
  const key = variant === 'none' ? 'none' : variant === 'blue' ? 'green' : variant === 'magenta' ? 'magenta' : chroma.pickKey(item.prompt);
  const o = variant === 'blue' ? swapGB(out) : out, b = base;
  const c: any = items.extractCell({ key: `rest/${d}/0`, call: 0, base: b, out: o, route: key, band: items.bandOf(item.slot, skel(d), 64) });
  if (variant === 'blue') c.layer = swapGB(c.layer);
  return c;
}
export async function dressViews(arm: 'D' | 'K', name: string, variant: string, seed: number) {
  const f = fileOf(arm, name, variant, seed);
  if (!fs.existsSync(`${f}.json`)) return null;
  const item = (D_ITEMS[name] ?? K_ITEMS[name]);
  return Promise.all(DIRS.map(async (d, i) => { const base = await restA(d), out = await (await import('./lib.mts')).load(`${f}.${i}.png`); return { d, base, out, c: extractView(variant, item, d, base, out) }; }));
}
if (import.meta.main) {
  const report: any[] = [];
  for (const [arm, set, variants] of [['D', D_ITEMS, ['ctrl', 'view']], ['K', K_ITEMS, ['magenta', 'blue', 'none']]] as const) for (const name of Object.keys(set)) for (const seed of SEEDS) {
    const rows: Img[][] = [];
    for (const v of variants) {
      const views = await dressViews(arm, name, v, seed);
      if (!views) continue;
      const m = views.map(({ d, c }) => ({ d, keyKept: c.keyKept != null ? +c.keyKept.toFixed(3) : null, keyOutside: c.keyOutside != null ? +c.keyOutside.toFixed(3) : null, area: c.area, specks: c.specks, pinholes: c.pinholes, g2: items.g2Fails(c), g3: (c.keyOutside ?? 0) > items.GATES.keyOutside }));
      report.push({ arm, name, seed, v, views: m, present: m.every((x) => x.area > 0), hard: m.filter((x) => x.g2 || x.g3 || !x.area).length });
      rows.push([...views.map((x) => x.out), ...views.map((x) => items.recompose(x.c))]);
    }
    if (rows.length) await save(`${OUT}/${arm}/${name}/s${seed}.sheet.png`, sheet(rows, 4));
  }
  fs.writeFileSync(`${OUT}/dk_eval.json`, JSON.stringify(report, null, 1));
  for (const r of report) console.log(r.arm, r.name.padEnd(10), 's' + r.seed, r.v.padEnd(7), 'hard', r.hard, r.views.map((x: any) => `${x.d[0]}:${x.keyKept ?? '-'}/${x.keyOutside ?? '-'}/${x.area}`).join(' '));
}
