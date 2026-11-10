// Arm Y live outputs through production extraction with the prototype outline rule. Run from spikes/api:
//   C25_RUN=chroma-2026-11-09 node --import <scratch>/outline/hook.mjs <scratch>/outline/ylive.mts
import fs from 'node:fs';
const SP = 'file:///C:/Programming_Files/Shilocity/PixelLab/PixelDoll/spikes/api/c25/';
const SCR = process.env.OUT_DIR ?? import.meta.dirname; // sheets and logs
const { readOnly, items, chroma, save, OUT, load, exists } = await import(SP + 'lib.mts');
readOnly();
const { rotate } = await import(SP + 'hue.mts');
const { rigA, restA, baseA, DIRS } = await import(SP + 's4rig.mts');
const { rigB, restB } = await import(SP + 'bodyB.mts');
const { zoomMark, cropMark } = await import('./sheet.mts');
type Img = { w: number; h: number; data: Uint8ClampedArray };
type K = 'green' | 'cyan' | 'azure' | 'blue';
const KS: K[] = ['green', 'cyan', 'azure', 'blue'];
const SLOT: Record<string, string> = { helm: 'head', boots: 'feet', cloak: 'back', crown: 'head', hair: 'hair', jerkin: 'torso_outer', plate: 'torso_outer', hood: 'head', amulet: 'neck', tunic: 'torso_outer' };
const BODY: any = { A: { rig: rigA(), rest: restA, views: [...DIRS] }, B: { rig: rigB(), rest: restB, views: ['south', 'east', 'north'] } };
const fileOf = (body: string, item: string, k: K, what: string) => `${OUT}/Y/${body}/${item}/${k}_${what}`;
const stored = async (f: string): Promise<Img[] | null> => {
  if (!exists(`${f}.json`)) return null;
  const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames;
  return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`)));
};
const skelOf = (rig: any, d: string) => Object.fromEntries(rig.rest[d].keypoints.map((p: any) => [p.label, { x: p.x * rig.cell.w, y: p.y * rig.cell.h }]));
const frame = (k: K) => (k === 'cyan' ? 'green' : k);
const inF = (im: Img, k: K) => (k === 'cyan' ? rotate(im, -60) : im);
const VARIANTS = (process.env.VARIANTS ?? 'off,v1,v2,v3').split(',');

interface CellRec { id: string; body: string; item: string; key: K; kind: string; view: string; c: any }
async function run(v: string) {
  (globalThis as any).__OUTLINE = v;
  const cells: CellRec[] = [], walkQa: Record<string, string[]> = {};
  for (const body of ['A', 'B']) {
    const Bd = BODY[body];
    for (const item of Object.keys(SLOT)) for (const seed of [7, 11]) for (const k of KS) {
      const outs = await stored(fileOf(body, item, k, `dress_s${seed}`));
      if (!outs) continue;
      for (const [i, d] of Bd.views.entries()) {
        const base = await Bd.rest(d);
        const c = items.extractCell({ key: `rest/${d}/0`, call: 0, base, out: inF(outs[i], k), route: frame(k), band: items.bandOf(SLOT[item], skelOf(Bd.rig, d), Bd.rig.cell.h) });
        cells.push({ id: `${body}/${item}/${k}/s${seed}/${d}`, body, item, key: k, kind: `dress_s${seed}`, view: d, c });
      }
    }
  }
  const rig: any = BODY.A.rig;
  for (const item of Object.keys(SLOT)) for (const k of KS) {
    const kf = await stored(fileOf('A', item, k, 'dress_s7'));
    if (!kf) continue;
    const slot = SLOT[item], keys: Record<string, Img> = {}, wc: any[] = [];
    for (const [i, d] of DIRS.entries()) {
      const w = await stored(fileOf('A', item, k, `walk_${d}`));
      if (!w) continue;
      keys[d] = items.extractCell({ key: `rest/${d}/0`, call: 0, base: await BODY.A.rest(d), out: inF(kf[i], k), route: frame(k), band: items.bandOf(slot, skelOf(rig, d), 64) }).layer;
      const kp = items.clipKeypoints(rig, 'walk', d)!;
      for (let fi = 0; fi < 8; fi++) {
        const sk = Object.fromEntries(kp[fi].map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
        const c = items.extractCell({ key: `walk/${d}/${fi}`, call: 1 + i, base: await baseA(d, 'walk', fi), out: inF(w[fi], k), route: frame(k), band: items.bandOf(slot, sk, 64), posed: true, clip: items.slotOf(slot).band });
        wc.push(c);
        cells.push({ id: `A/${item}/${k}/walk/${d}/${fi}`, body: 'A', item, key: k, kind: 'walk', view: `${d}/${fi}`, c });
      }
    }
    if (!wc.length) continue;
    for (const c of wc) c.preMask = new Uint8Array(c.mask); // lost/added measured before postProcess, as eval_y
    items.postProcess(rig, items.slotOf(slot), wc, keys, 0);
    const q = items.itemQa(rig, items.slotOf(slot), frame(k), wc, 0, items.GATES.keyOutsidePosed, 0), hh = items.dirGate(items.slotOf(slot), wc, keys, rig);
    walkQa[`${item}/${k}`] = [...[...q.failCalls.values(), ...hh.fails.values()].flat(), ...[...q.warnings, ...hh.warnings].map((x: any) => 'warn:' + (typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 80))];
  }
  return { cells, walkQa };
}
const px = (im: Img, p: number) => [im.data[p * 4], im.data[p * 4 + 1], im.data[p * 4 + 2]];
const lum = (c: number[]) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const fk = (k: K): any => frame(k);
const lostOf = (c: any, k: K, mask: Uint8Array) => {
  const o: number[] = [];
  for (let p = 0; p < mask.length; p++) {
    if (mask[p] || c.out.data[p * 4 + 3] < 128) continue;
    const [r, g, b] = px(c.out, p);
    if (chroma.keyScore(fk(k), r, g, b) >= chroma.KT && chroma.rampDistance(fk(k), r, g, b) > 40) o.push(p);
  }
  return o;
};
const nb8 = (m: Uint8Array, w: number, h: number, p: number) => {
  const x = p % w, y = (p / w) | 0;
  let n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) n++; }
  return n;
};
const near = (m: Uint8Array, w: number, h: number, p: number, r: number) => {
  const x = p % w, y = (p / w) | 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) return true; }
  return false;
};

const res: Record<string, Awaited<ReturnType<typeof run>>> = {};
for (const v of VARIANTS) res[v] = await run(v);
const base = res.off;
// ---- 1. root cause on baseline ----
const diag: any[] = [];
const farAway: Record<string, number> = {};
for (const r of base.cells) {
  const c = r.c, k = r.key, m = c.preMask ?? c.mask, { w, h } = c.base;
  for (const p of lostOf(c, k, m)) {
    const [R, G, B] = px(c.out, p), inBase = c.base.data[p * 4 + 3] > 0, bc = px(c.base, p);
    diag.push({ id: r.id, x: p % w, y: (p / w) | 0, rgb: [R, G, B], score: chroma.keyScore(fk(k), R, G, B), rd: chroma.rampDistance(fk(k), R, G, B), lum: +lum([R, G, B]).toFixed(3), inBase, baseMean: Math.round((bc[0] + bc[1] + bc[2]) / 3), itemNb8: nb8(m, w, h, p) });
  }
  for (let p = 0; p < m.length; p++) {
    if (m[p] || c.out.data[p * 4 + 3] < 128 || !c.base.data[p * 4 + 3]) continue;
    const [R, G, B] = px(c.out, p);
    if (chroma.keyScore(fk(k), R, G, B) >= chroma.KT && chroma.rampDistance(fk(k), R, G, B) > 40 && !near(m, w, h, p, 2)) farAway[k] = (farAway[k] ?? 0) + 1;
  }
}
fs.writeFileSync(SCR + 'y_lost_diag.json', JSON.stringify(diag));
const by = (f: (d: any) => string) => diag.reduce((a: any, d: any) => ((a[f(d)] = (a[f(d)] ?? 0) + 1), a), {});
console.log('baseline lost px', diag.length, 'cells', base.cells.length);
console.log('by item/key', by((d) => d.id.split('/').slice(0, 3).join('/') + (d.id.includes('walk') ? '/walk' : '')));
console.log('inBase', by((d) => String(d.inBase)), 'itemNb8', by((d) => String(d.itemNb8)));
console.log('lum<0.138', by((d) => String(d.lum < 0.138)), 'lum<=0.3', by((d) => String(d.lum <= 0.3)), 'baseMean<60', by((d) => String(d.baseMean < 60)));
console.log('top colors', Object.entries(by((d) => d.rgb.join(','))).sort((a: any, b: any) => b[1] - a[1]).slice(0, 15));
console.log('far-from-ramp key px inside body, >= 3 px from any item px, per key', farAway);
// ---- 2/3. variants ----
const sheets: string[] = [];
for (const v of VARIANTS.filter((x) => x !== 'off')) {
  let rec = 0, add = 0, addDark = 0, addInBase = 0, addIsolated = 0, g2c = 0, g3c = 0;
  const perItem: Record<string, [number, number, number]> = {};
  for (const [i, r] of res[v].cells.entries()) {
    const cb = base.cells[i].c, cv = r.c, k = r.key, mb = cb.preMask ?? cb.mask, mv = cv.preMask ?? cv.mask, { w, h } = cb.base;
    const lb = lostOf(cb, k, mb), lv = new Set(lostOf(cv, k, mv)), recd = lb.filter((p) => !lv.has(p)).length;
    let a = 0;
    for (let p = 0; p < mv.length; p++) if (mv[p] && !mb[p]) {
      a++;
      if (lum(px(cv.out, p)) < 0.138) addDark++;
      if (cb.base.data[p * 4 + 3]) addInBase++;
      if (nb8(mb, w, h, p) === 0) addIsolated++;
    }
    rec += recd; add += a;
    const key = `${r.body}/${r.item}/${k}${r.kind === 'walk' ? '/walk' : ''}`, pi = (perItem[key] ??= [0, 0, 0]);
    pi[0] += lb.length; pi[1] += recd; pi[2] += a;
    const lim = r.kind === 'walk' ? items.GATES.keyOutsidePosed : items.GATES.keyOutside;
    if (items.g2Fails(cb) !== items.g2Fails(cv)) g2c++;
    if (((cb.keyOutside ?? 0) > lim) !== ((cv.keyOutside ?? 0) > lim)) g3c++;
  }
  const qaDiff = Object.keys(base.walkQa).filter((k) => JSON.stringify(base.walkQa[k]) !== JSON.stringify(res[v].walkQa[k])).map((k) => `${k}: ${base.walkQa[k].join('|')} -> ${res[v].walkQa[k].join('|')}`);
  console.log(`\n## ${v}: lost(base) ${diag.length}, recovered ${rec} (${((100 * rec) / diag.length).toFixed(1)} %), added ${add} (dark ${addDark}, in base ${addInBase}, touching no baseline item px ${addIsolated}), G2 flips ${g2c}, G3 flips ${g3c}`);
  console.log('per body/item/key: lost/recovered/added', Object.entries(perItem).filter(([, x]) => x[0] || x[2]).map(([k, x]) => `${k} ${x.join('/')}`).join('; '));
  console.log('walk QA changes', qaDiff.length ? qaDiff : 'none');
  const groups = new Map<string, number[]>();
  for (const [i, r] of res[v].cells.entries()) {
    const g = `${r.body}_${r.item}_${r.key}_${r.kind}`, cb = base.cells[i].c, cv = r.c, mb = cb.preMask ?? cb.mask, mv = cv.preMask ?? cv.mask;
    if (lostOf(cb, r.key, mb).length || mv.some((x: number, p: number) => x && !mb[p])) (groups.get(g) ?? groups.set(g, []).get(g)!).push(i);
  }
  for (const [g, idx] of groups) {
    const rows = idx.slice(0, 8).map((i) => {
      const r = res[v].cells[i], cb = base.cells[i].c, cv = r.c, mb = cb.preMask ?? cb.mask, mv = cv.preMask ?? cv.mask;
      const un = (im: Img) => (r.key === 'cyan' ? rotate(im, 60) : im);
      return { out: un(cb.out), lb: items.recompose({ base: cb.base, layer: un(cb.layer) }), lv: items.recompose({ base: cv.base, layer: un(cv.layer) }), layerOnly: un(cv.layer), lost: lostOf(cb, r.key, mb), added: [...mv.keys()].filter((p) => mv[p] && !mb[p]) };
    });
    const f = `${SCR}sheets/${v}/${g}.png`;
    await save(f, zoomMark(rows, 6));
    const crows = idx.slice(0, 8).map((i) => { const r = res[v].cells[i], cb = base.cells[i].c, un = (im: Img) => (r.key === 'cyan' ? rotate(im, 60) : im); return { ...rows[idx.indexOf(i)], lb0: un(cb.layer) }; });
    await save(`${SCR}sheets/${v}/crop_${g}.png`, cropMark(crows, 12));
    sheets.push(f);
  }
}
fs.writeFileSync(SCR + 'y_sheets.txt', sheets.join('\n'));
