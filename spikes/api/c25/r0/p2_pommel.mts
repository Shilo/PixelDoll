// P2: does majorComponents (per cell, before attachHeld) drop real held-item parts the wrist rule would keep?
// Control = production extractCell(posed) + postProcess. Variant = same registration, no majorComponents, then postProcess.
import { OUTR0 } from './lib.mts';
import { items, chroma, load, padTo, s4Rig, s4Base, count, sheet, save, blank, has, type Img } from './lib.mts';
const rig = s4Rig(), slot = items.slotOf('main_hand'), C = 96, pad = 16;
const OUT = OUTR0;
const full = { x: 0, y: 0, w: C, h: C };
const shift = (im: Img, dx: number, dy: number) => { const o = blank(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const X = x - dx, Y = y - dy; if (X >= 0 && Y >= 0 && X < im.w && Y < im.h) o.data.set(im.data.subarray((Y * im.w + X) * 4, (Y * im.w + X) * 4 + 4), (y * im.w + x) * 4); } return o; };
const rows: (Img | null)[][] = [];
let tot = { frames: 0, diff: 0, ctrlPx: 0, varPx: 0, rescued: 0, cvCtrl: 0, cvVar: 0, clips: 0, nearComp: 0, farComp: 0 };
const cv = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length) / m; };
for (const tag of ['d96', 'u96', 'a96', 'fsw', 'fax']) for (const clip of ['walk', 'slash']) for (const d of ['south', 'east', 'north']) {
  if (!has(`s5_held/pose_${tag}_${clip}_${d}_s7_0.png`)) continue;
  const ctrl: any[] = [], vari: any[] = [];
  for (let i = 0; i < 8; i++) {
    const base = padTo(await s4Base(d, clip, i), C), out = await load(`s5_held/pose_${tag}_${clip}_${d}_s7_${i}.png`), key = `${clip}/${d}/${i}`;
    const c = items.extractCell({ key, call: 0, base, out, route: 'green', band: full, posed: true });
    const o2 = shift(out, c.offset[0], c.offset[1]); // offset = -registration
    const v = items.extractCell({ key, call: 0, base, out: o2, route: 'green', band: full, posed: false });
    v.posed = true;
    ctrl.push(c); vari.push(v);
  }
  items.postProcess(rig, slot, ctrl, {}, pad); items.postProcess(rig, slot, vari, {}, pad);
  const R = +(process.argv[2] ?? 8);
  if (R >= 0) vari.forEach((v: any, i: number) => { // variant B: size floor for every piece except those touching the wrist zone
    const wr = rig.animations.find((x: any) => x.id === clip).sources[d].keypoints[i].find((k: any) => k.label === 'RIGHT ARM'), wx = wr.x * 64 + pad, wy = wr.y * 64 + pad;
    const comps = chroma.components(v.mask, C, C), big = Math.max(0, ...comps.map((c: number[]) => c.length));
    for (const c of comps) if (c.length < Math.max(4, 0.15 * big) && !c.some((p: number) => Math.hypot((p % C) + 0.5 - wx, ((p / C) | 0) + 0.5 - wy) <= R)) for (const p of c) { v.mask[p] = 0; v.layer.data.fill(0, p * 4, p * 4 + 4); }
  });
  tot.clips++; tot.cvCtrl += cv(ctrl.map((c) => count(c.mask))); tot.cvVar += cv(vari.map((c) => count(c.mask)));
  for (let i = 0; i < 8; i++) {
    const a = ctrl[i], b = vari[i], extra = b.mask.map((v: number, p: number) => (v && !a.mask[p] ? 1 : 0)), lost = a.mask.map((v: number, p: number) => (v && !b.mask[p] ? 1 : 0));
    { const wr = rig.animations.find((x: any) => x.id === clip).sources[d].keypoints[i].find((k: any) => k.label === 'RIGHT ARM');
      for (const comp of chroma.components(extra, C, C)) { const near = comp.some((p: number) => Math.hypot((p % C) + 0.5 - (wr.x * 64 + pad), ((p / C) | 0) + 0.5 - (wr.y * 64 + pad)) <= 8); if (near) tot.nearComp++; else tot.farComp++; } }
    tot.frames++; tot.ctrlPx += a.area; tot.varPx += count(b.mask); tot.rescued += count(extra);
    if (count(extra) || count(lost)) {
      tot.diff++;
      const hl = blank(C, C); hl.data.set(b.layer.data);
      for (let p = 0; p < extra.length; p++) if (extra[p]) hl.data.set([255, 0, 255, 255], p * 4);
      const crop = (im: Img) => { let x0 = C, y0 = C, x1 = 0, y1 = 0; for (let p = 0; p < C * C; p++) if (b.mask[p]) { const x = p % C, y = (p / C) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } x0 = Math.max(0, x0 - 3); y0 = Math.max(0, y0 - 3); const w = 40, o = blank(w, w); for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (y0 + y < C && x0 + x < C) o.data.set(im.data.subarray(((y0 + y) * C + x0 + x) * 4, ((y0 + y) * C + x0 + x) * 4 + 4), (y * w + x) * 4); return o; };
      if (rows.length < 12 && count(extra) >= 8 && (tot.diff % 3 === 0)) { const only = blank(C, C); for (let p = 0; p < extra.length; p++) if (extra[p]) only.data.set(b.layer.data.subarray(p * 4, p * 4 + 4), p * 4); rows.push([crop(items.recompose(b)), crop(b.layer), crop(only)]); }
      if (0) console.log(`${tag} ${clip}/${d}/${i}: control ${a.area} px, variant ${count(b.mask)} px, rescued ${count(extra)}, variant-only-lost ${count(lost)}`);
    }
  }
}
console.log(JSON.stringify(tot), 'mean clip area CV control', (tot.cvCtrl / tot.clips).toFixed(3), 'variant', (tot.cvVar / tot.clips).toFixed(3));
if (rows.length) await save(OUT + 'p2_pommel.png', sheet(rows, 5));
