// Evaluate arm Z (read-only): azure dress sets (G2/G3 per view, purple-hue px kept with their exact color), azure walk poses
// (production cleanup and QA), and the magenta reference. Writes layer-over-base sheets.
import fs from 'node:fs';
import { readOnly, items, chroma, save, load, exists, OUT, type Img } from './lib.mts';
readOnly();
import { sheet } from './evaluate.mts';
import { rigA, restA, baseA, DIRS } from './s4rig.mts';
import { azureCell, rotate } from './hue.mts';
import { Z_ITEMS, fileOf } from './arm_z.mts';
const rig: any = rigA(), skel = (k: any[]) => Object.fromEntries(k.map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
const frames = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
const hsv = (r: number, g: number, b: number) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = 0; if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, mx ? d / mx : 0, mx / 255]; };
/** Purple-hue px of the raw output (250–320°, saturated): share that ships in the layer within 24 per channel of the raw color. */
function purpleKept(out: Img, c: any) {
  let n = 0, kept = 0;
  for (let p = 0; p < c.mask.length; p++) {
    const q = p * 4, [h, s, v] = hsv(out.data[q], out.data[q + 1], out.data[q + 2]);
    if (out.data[q + 3] < 128 || h < 250 || h > 320 || s < 0.3 || v < 0.2) continue;
    n++;
    const X = (p % c.layer.w) + c.offset[0], Y = ((p / c.layer.w) | 0) + c.offset[1], r = Y * c.layer.w + X;
    if (c.mask[r] && [0, 1, 2].every((ch) => Math.abs(c.layer.data[r * 4 + ch] - out.data[q + ch]) <= 24)) kept++;
  }
  return [kept, n];
}
for (const item of Object.keys(Z_ITEMS)) {
  const { slot } = Z_ITEMS[item], rows: Img[][] = [];
  for (const [v, seed] of [['azure', 7], ['azure', 11], ['magenta', 7]] as const) {
    const outs = await frames(fileOf(item, v, `dress_s${seed}`)); if (!outs) continue;
    const cs = await Promise.all(DIRS.map(async (d, i) => { const o = { key: `rest/${d}/0`, call: 0, base: await restA(d), out: outs[i], route: 'magenta' as const, band: items.bandOf(slot, skel(rig.rest[d].keypoints), 64) }; return v === 'azure' ? azureCell(o) : items.extractCell(o); }));
    const pk = cs.map((c, i) => purpleKept(outs[i], c)), k = pk.reduce((s, x) => s + x[0], 0), n = pk.reduce((s, x) => s + x[1], 0);
    const hard = cs.filter((c) => items.g2Fails(c) || (c.keyOutside ?? 0) > items.GATES.keyOutside || !c.area).length;
    console.log(`${item.padEnd(8)} ${v.padEnd(7)} s${seed}: hard ${hard}/3 | purple kept exactly ${n ? ((100 * k) / n).toFixed(1) : '-'} % (${k}/${n}) | ${cs.map((c) => `${(c.keyKept ?? 1).toFixed(3)}/${(c.keyOutside ?? 0).toFixed(3)}`).join(' ')}`);
    rows.push([...outs, ...cs.map((c) => items.recompose(c))]);
  }
  const kf = await frames(fileOf(item, 'azure', 'dress_s7'));
  if (kf) { // azure walk poses through production cleanup and QA
    const keys: Record<string, Img> = {}, cells: any[] = [];
    for (const [i, d] of DIRS.entries()) {
      keys[d] = azureCell({ key: `rest/${d}/0`, call: 0, base: await restA(d), out: kf[i], route: 'green', band: items.bandOf(slot, skel(rig.rest[d].keypoints), 64) }).layer;
      const w = await frames(fileOf(item, 'azure', `walk_${d}`)); if (!w) continue;
      const kp = items.clipKeypoints(rig, 'walk', d as any)!;
      for (let f = 0; f < 8; f++) cells.push(azureCell({ key: `walk/${d}/${f}`, call: 1, base: await baseA(d, 'walk', f), out: w[f], route: 'green', band: items.bandOf(slot, skel(kp[f]), 64), posed: true, clip: items.slotOf(slot).band }));
    }
    if (cells.length) {
      // QA runs in the green frame: rotate keys and layers back for the gates that read colors (H4 compares layers to keyframes)
      const g = cells.map((c) => ({ ...c, layer: rotate(c.layer, -90), out: rotate(c.out, -90) })), gk = Object.fromEntries(Object.entries(keys).map(([d, k]) => [d, rotate(k, -90)]));
      items.postProcess(rig, items.slotOf(slot), g, gk, 0);
      const q = items.itemQa(rig, items.slotOf(slot), 'green', g, 0, items.GATES.keyOutsidePosed, 0), h = items.dirGate(items.slotOf(slot), g, gk, rig);
      const fails = [...q.failCalls.values(), ...h.fails.values()].flat();
      console.log(`${item.padEnd(8)} azure walk S/E/N: ${fails.length} hard fails ${fails.slice(0, 3).join('; ')} | warnings ${q.warnings.length + h.warnings.length}`);
      for (const d of DIRS) rows.push(g.filter((c) => c.key.startsWith(`walk/${d}/`)).map((c) => items.recompose({ base: c.base, layer: rotate(c.layer, 90) })));
    }
  }
  if (rows.length) await save(`${OUT}/Z/${item}.sheet.png`, sheet(rows, 3));
}
