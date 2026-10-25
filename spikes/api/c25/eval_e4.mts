// Evaluate arm E4 (read-only): production keyframe extraction per view plus concept fidelity: layer -> concept mean nearest-color
// distance (foreign colors), concept -> layer area-weighted coverage within 24 (the concept's colors appear), south area vs paste-up.
import { readOnly, OUT, items, save, type Img } from './lib.mts';
readOnly();
import { sheet } from './evaluate.mts';
import { rigA, restA, DIRS } from './s4rig.mts';
import { arm, pasteUp } from './arm_e4.mts';
const rig = rigA(), skel = (d: string) => Object.fromEntries((rig.rest as any)[d].keypoints.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
const colors = (im: Img) => { const m = new Map<number, number>(); for (let i = 0; i < im.data.length; i += 4) if (im.data[i + 3]) { const c = (im.data[i] << 16) | (im.data[i + 1] << 8) | im.data[i + 2]; m.set(c, (m.get(c) ?? 0) + 1); } return m; };
const dist = (a: number, b: number) => Math.max(Math.abs((a >> 16) - (b >> 16)), Math.abs(((a >> 8) & 255) - ((b >> 8) & 255)), Math.abs((a & 255) - (b & 255)));
const nearest = (c: number, pal: Iterable<number>) => { let d = 1e9; for (const p of pal) d = Math.min(d, dist(c, p)); return d; };
for (const name of ['A', 'B'] as const) {
  const { item, scaled } = await pasteUp(name), cpal = colors(item), rows: (Img | null)[][] = [];
  for (const v of ['traw', 'tpaste', 'ea'] as const) {
    const out = await arm(name, v);
    if (!out) { console.log(name, v, 'missing'); continue; }
    const cells = await Promise.all(DIRS.map(async (d, i) => items.extractCell({ key: `rest/${d}/0`, call: 0, base: await restA(d), out: out[i], route: 'green', band: items.bandOf('head', skel(d), 64) })));
    const lp = new Map<number, number>(); for (const c of cells) for (const [k, n] of colors(c.layer)) lp.set(k, (lp.get(k) ?? 0) + n);
    let ld = 0, ln = 0; for (const [k, n] of lp) { ld += nearest(k, cpal.keys()) * n; ln += n; }
    let cov = 0, cn = 0; for (const [k, n] of cpal) { if (nearest(k, lp.keys()) <= 24) cov += n; cn += n; }
    const hard = cells.filter((c) => items.g2Fails(c) || (c.keyOutside ?? 0) > items.GATES.keyOutside || !c.area).length;
    console.log(`${name} ${v.padEnd(6)} hard ${hard} | layer->concept ${(ld / (ln || 1)).toFixed(1)} | concept coverage ${(cov / cn).toFixed(2)} | south area ${cells[0].area} vs paste-up ${[...colors(scaled).values()].reduce((a, b) => a + b, 0)} | ${cells.map((c) => `${(c.keyKept ?? 1).toFixed(3)}/${(c.keyOutside ?? 0).toFixed(3)}`).join(' ')}`);
    rows.push([out[0], ...cells.map((c) => items.recompose(c))]);
  }
  rows.unshift([(await import('./lib.mts')).load ? await (await import('./lib.mts')).load(`${OUT}/E4/paste_${name}.png`) : null]);
  await save(`${OUT}/E4/${name}${process.env.E4_SEED ? "_s" + process.env.E4_SEED : ""}.sheet.png`, sheet(rows, 4));
}
