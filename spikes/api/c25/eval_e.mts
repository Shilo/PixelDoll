// Evaluate round 2 arm E (read-only): production extraction per view (held at 96 px), hard gates, and color fidelity to the
// concept: layer -> concept mean nearest-color distance and concept -> layer area-weighted coverage within 24.
import { readOnly, OUT, items, save, load, type Img } from './lib.mts';
readOnly();
import { sheet, padTo } from './evaluate.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { arm, E_ITEMS } from './arm_e.mts';
const rig: any = rigA(), skel = (k: any[]) => Object.fromEntries(k.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
const colors = (im: Img) => { const m = new Map<number, number>(); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) { const c = (im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]; m.set(c, (m.get(c) ?? 0) + 1); } return m; };
const dist = (a: number, b: number) => Math.max(Math.abs((a >> 16) - (b >> 16)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)), Math.abs((a & 255) - (b & 255)));
const nearest = (c: number, pal: Iterable<number>) => { let d = 1e9; for (const p of pal) d = Math.min(d, dist(c, p)); return d; };
export async function views(item: string, v: 'traw' | 'ea', seed: number) {
  const { slot, size } = E_ITEMS[item], pad = (size - 64) / 2, out = await arm(item, v, seed);
  if (!out) return null;
  return Promise.all(DIRS.map(async (d, i) => items.extractCell({ key: `rest/${d}/0`, call: 0, base: items.padImg(await restA(d), pad), out: out[i], route: 'green', band: items.bandOf(slot, pad ? undefined : skel(rig.rest[d].keypoints), size) })));
}
if (import.meta.main) for (const item of Object.keys(E_ITEMS)) {
  const concept = await load(`${OUT}/E/concept_${item}.0.png`), cpal = colors(concept), rows: (Img | null)[][] = [];
  for (const seed of [7, 11]) for (const v of ['traw', 'ea'] as const) {
    const cs = await views(item, v, seed);
    if (!cs) { console.log(item, v, seed, 'missing'); continue; }
    const lp = new Map<number, number>(); for (const c of cs) for (const [k, n] of colors(c.layer)) lp.set(k, (lp.get(k) ?? 0) + n);
    let ld = 0, ln = 0; for (const [k, n] of lp) { ld += nearest(k, cpal.keys()) * n; ln += n; }
    let cov = 0, cn = 0; for (const [k, n] of cpal) { if (nearest(k, lp.keys()) <= 24) cov += n; cn += n; }
    const hard = cs.filter((c) => items.g2Fails(c) || (c.keyOutside ?? 0) > items.GATES.keyOutside || !c.area).length;
    console.log(`${item.padEnd(9)} ${v.padEnd(5)} s${seed}: hard ${hard}/3 | layer->concept ${(ld / (ln || 1)).toFixed(1)} | concept coverage ${(cov / cn).toFixed(2)} | areas ${cs.map((c) => c.area).join('/')}`);
    rows.push([padTo(concept, cs[0].base.w), ...cs.map((c) => items.recompose(c))]);
  }
  await save(`${OUT}/E/${item}.sheet.png`, sheet(rows, 3));
}
