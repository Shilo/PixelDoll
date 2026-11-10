// Evaluate arm S (read-only, never spends): extraction for the practitioner strategies (fc, fg, sc) as pre-registered in
// docs/research/2026-11-09-paperdoll-video-review/evidence/chroma-strategies.md, production extraction for prod and cr (arm Y
// outputs), the same corrected metrics for every arm, and 4x sheets.
// Usage (from spikes/api): C25_RUN=chroma-strategies-2026-11-10 node c25/eval_s.mts
import fs from 'node:fs';
import path from 'node:path';
import { readOnly, items, chroma, save, load, exists, OUT, type Img } from './lib.mts';
readOnly();
import { sheet } from './evaluate.mts';
import { rotate } from './hue.mts';
import { DIRS, baseA } from './s4rig.mts';
import { S_ITEMS, BODY, HUE, mannequin, hsv, partOf, type A } from './arm_s.mts';

const YOUT = path.resolve(OUT, '../chroma-2026-11-09/Y');
type Arm = 'prod' | 'cr' | A;
const ARMS: Arm[] = ['prod', 'cr', 'fc', 'fg', 'sc'];
const KEYHUE: Record<Arm, number> = { prod: 120, cr: 180, ...HUE };
const SC_T = 24, WIN = 20, SMIN = 0.25, VMIN = 0.3;
const rgbOf = (im: Img, p: number): [number, number, number] => [im.data[p * 4], im.data[p * 4 + 1], im.data[p * 4 + 2]];
const op = (im: Img, p: number) => im.data[p * 4 + 3] >= 128;
const cheb = (a: number[], b: number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const hgap = (h: number, H: number) => { const g = Math.abs(h - H) % 360; return Math.min(g, 360 - g); };
const skelOf = (rig: any, d: string) => Object.fromEntries(rig.rest[d].keypoints.map((p: any) => [p.label, { x: p.x * rig.cell.w, y: p.y * rig.cell.h }]));
function nb8(w: number, h: number, p: number, f: (q: number) => boolean, r = 1) {
  const x = p % w, y = (p / w) | 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const X = x + dx, Y = y + dy;
    if ((dx || dy) && X >= 0 && Y >= 0 && X < w && Y < h && f(Y * w + X)) return true;
  }
  return false;
}
async function files(f: string) { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); }
const fileOf = (body: string, item: string, a: Arm, what: string) =>
  a === 'prod' ? (item === 'tunic' ? `${OUT}/S/${body}/${item}/prod-magenta_${what}` : `${YOUT}/${body}/${item}/green_${what}`) : a === 'cr' ? (item === 'tunic' ? `${OUT}/none` : `${YOUT}/${body}/${item}/cyan_${what}`) // arm Y's tunic is navy, not emerald
   : `${OUT}/S/${body}/${item}/${a}_${what}`;
const prodKey = (item: string) => (item === 'tunic' ? 'magenta' : 'green');

/** Strategy extraction (fc, fg, sc). Returns item mask, layer and the sc body-part masks. */
function extractS(a: A, base: Img, out: Img, input: Img, variant: 'pal' | 'none' | 'pos' | 'diff' = 'pal') {
  const { w, h } = out, N = w * h, H = HUE[a];
  const key = new Uint8Array(N);
  let vMinMannequin = 1;
  for (let p = 0; p < N; p++) if (op(input, p)) { const [hh, s, v] = hsv(...rgbOf(input, p)); if (hgap(hh, H) <= WIN && s >= SMIN) vMinMannequin = Math.min(vMinMannequin, v); }
  for (let p = 0; p < N; p++) if (op(out, p)) { const [hh, s, v] = hsv(...rgbOf(out, p)); if (hgap(hh, H) <= WIN && s >= SMIN && v >= VMIN) key[p] = 1; }
  let m = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (op(out, p) && !key[p]) m[p] = 1;
  // body parts (sc): learned non-skin palette of this base frame
  const body = new Uint8Array(N);
  if (a === 'sc' && variant !== 'none') {
    const pal: number[][] = [], seen = new Set<number>();
    for (let p = 0; p < N; p++) if (base.data[p * 4 + 3]) { const c = rgbOf(base, p), k = (c[0] << 16) | (c[1] << 8) | c[2]; if (partOf(k) !== 'skin' && !seen.has(k)) { seen.add(k); pal.push(c); } }
    const nonSkinAt = (q: number) => { if (!base.data[q * 4 + 3]) return false; const c = rgbOf(base, q); return partOf((c[0] << 16) | (c[1] << 8) | c[2]) !== 'skin'; };
    for (let p = 0; p < N; p++) {
      if (!m[p]) continue;
      if (!(base.data[p * 4 + 3] || nb8(w, h, p, (q) => !!base.data[q * 4 + 3]))) continue;
      const c = rgbOf(out, p);
      if (variant === 'diff') { if (!(nonSkinAt(p) && cheb(rgbOf(base, p), c) <= SC_T)) continue; }
      else if (!pal.some((k) => cheb(k, c) <= SC_T)) continue;
      if (variant === 'pos' && !(nonSkinAt(p) || nb8(w, h, p, nonSkinAt))) continue;
      body[p] = 1; m[p] = 0;
    }
  }
  // dark key px touching the item are item (two passes)
  for (let pass = 0; pass < 2; pass++) {
    const prev = m; m = new Uint8Array(prev);
    for (let p = 0; p < N; p++) if (key[p] && !prev[p] && hsv(...rgbOf(out, p))[2] < vMinMannequin - 0.08 && nb8(w, h, p, (q) => !!prev[q])) m[p] = 1;
  }
  const mask = new Uint8Array(N), layer: Img = { w, h, data: new Uint8ClampedArray(N * 4) };
  for (const comp of chroma.components(m, w, h)) if (comp.length >= 2) for (const p of comp) { mask[p] = 1; layer.data.set(out.data.subarray(p * 4, p * 4 + 4), p * 4); }
  return { mask, layer, key, body };
}

type Row = { body: string; item: string; arm: Arm; seed: number; view: string; frame?: number; hard: string[]; kept: number; area: number; leak: number; dark: number; darkNovel: number;
  satN: number; hue: number; sat: number; keyHueShare: number; grayN: number; grayHue: number; graySat: number; grayLean: number; gem: number; green: number; palLost: number; bodyRemoved: number };

function measure(arm: Arm, item: string, base: Img, out: Img, input: Img, mask: Uint8Array, layer: Img, band: any, isKeyOrBody: (p: number) => boolean, tol: number, extra: Partial<Row>) {
  const { w, h } = out, N = w * h, KH = KEYHUE[arm];
  const inCols: number[][] = []; const seen = new Set<number>();
  for (let p = 0; p < N; p++) if (input.data[p * 4 + 3]) { const c = rgbOf(input, p), k = (c[0] << 16) | (c[1] << 8) | c[2]; if (!seen.has(k)) { seen.add(k); inCols.push(c); } }
  let n = 0, kept = 0, area = 0, leak = 0, dark = 0, darkNovel = 0, satN = 0, sx = 0, sy = 0, ss = 0, kh = 0, grayN = 0, gx = 0, gy = 0, gs = 0, gl = 0, gem = 0, green = 0;
  for (let p = 0; p < N; p++) {
    const x = p % w, y = (p / w) | 0;
    if (mask[p]) {
      area++;
      if (y < band.y || y >= band.y + band.h) leak++;
      const [hh, s, v] = hsv(...rgbOf(layer, p)), r = (hh * Math.PI) / 180;
      if (s >= 0.35 && v >= 0.25) { satN++; sx += Math.cos(r); sy += Math.sin(r); ss += s; if (hgap(hh, KH) <= 30) kh++; }
      else if (v >= 0.25) { grayN++; gx += Math.cos(r) * s; gy += Math.sin(r) * s; gs += s; if (hgap(hh, KH) <= 40 && s >= 0.08) gl++; }
      if (hh >= 160 && hh <= 200 && s >= 0.3) gem++;
      if (hh >= 100 && hh <= 170 && s >= 0.3) green++;
    } else if (op(out, p)) {
      const c = rgbOf(out, p);
      if (hsv(...c)[2] < 0.35 && nb8(w, h, p, (q) => !!mask[q])) { dark++; if (!inCols.some((k) => cheb(k, c) <= 16)) darkNovel++; }
    }
    if (base.data[p * 4 + 3] && !mask[p] && x && y && x < w - 1 && y < h - 1) { n++; if (isKeyOrBody(p) || (tol && nb8(w, h, p, isKeyOrBody, tol))) kept++; }
  }
  const ang = (X: number, Y: number) => ((Math.atan2(Y, X) * 180) / Math.PI + 360) % 360;
  const k = n ? kept / n : 1;
  const hard = [!area && 'empty', k < 0.97 && 'kept'].filter(Boolean) as string[];
  return { kept: k, hard, area, leak, dark, darkNovel, satN, hue: satN ? ang(sx, sy) : NaN, sat: satN ? ss / satN : NaN, keyHueShare: satN ? kh / satN : 0, grayN, grayHue: grayN ? ang(gx, gy) : NaN, graySat: grayN ? gs / grayN : NaN, grayLean: grayN ? gl / grayN : 0, gem, green, palLost: 0, bodyRemoved: 0, ...extra };
}

/** One cell through its arm's extraction, plus metrics. */
function cell(arm: Arm, item: string, base: Img, out: Img, band: any, posed: boolean, variant: 'pal' | 'none' | 'pos' | 'diff' = 'pal') {
  const tol = posed ? 1 : 0;
  if (arm === 'prod' || arm === 'cr') {
    const k = arm === 'cr' ? 'green' : prodKey(item), o = arm === 'cr' ? rotate(out, -60) : out;
    const c: any = items.extractCell({ key: 'rest/x/0', call: 0, base, out: o, route: k, band, posed });
    const layer = arm === 'cr' ? rotate(c.layer, 60) : c.layer, input = arm === 'cr' ? rotate(chroma.toChroma(base, 'green'), 60) : chroma.toChroma(base, k);
    const isK = (p: number) => chroma.keyScore(k, o.data[p * 4], o.data[p * 4 + 1], o.data[p * 4 + 2]) >= chroma.KT && op(o, p);
    const m = measure(arm, item, base, c.out === o ? out : (arm === 'cr' ? rotate(c.out, 60) : c.out), input, c.mask, layer, band, isK, tol, {});
    // production G2 decides the production hard fail
    m.hard = [!c.area && 'empty', items.g2Fails(c) && 'kept'].filter(Boolean) as string[]; m.kept = c.keyKept;
    return { ...m, mask: c.mask, layer, input, out: c.out === o ? out : (arm === 'cr' ? rotate(c.out, 60) : c.out) };
  }
  const input = mannequin(base, arm), r = extractS(arm, base, out, input, variant);
  const { w, h } = out;
  let palLost = 0, bodyRemoved = 0;
  for (let p = 0; p < r.body.length; p++) if (r.body[p]) { bodyRemoved++; const c = rgbOf(base, p); if (!base.data[p * 4 + 3] || partOf((c[0] << 16) | (c[1] << 8) | c[2]) === 'skin') palLost++; }
  const m = measure(arm, item, base, out, input, r.mask, r.layer, band, (p) => !!r.key[p] || !!r.body[p], tol, { palLost, bodyRemoved });
  if (arm !== 'sc') {
    const rot = 120 - HUE[arm], D = rot ? rotate(chroma.despill(rotate(r.layer, rot), 'green'), -rot) : chroma.despill(r.layer, 'green');
    const t = (L: Img) => { let n = 0; for (let p = 0; p < L.w * L.h; p++) if (L.data[p * 4 + 3]) { const [hh, s2] = hsv(...rgbOf(L, p)); if (hgap(hh, HUE[arm]) <= 30 && s2 >= 0.3) n++; } return n; };
    let ch = 0; for (let p = 0; p < D.w * D.h; p++) if (D.data[p * 4 + 3] && cheb(rgbOf(D, p), rgbOf(r.layer, p)) > 2) ch++;
    const ds = measure(arm, item, base, out, input, r.mask, D, band, (p) => !!r.key[p], tol, {});
    Object.assign(m, { tintRaw: t(r.layer), tintDespill: t(D), despilled: ch, dsHue: ds.hue, dsSat: ds.sat, dsGraySat: ds.graySat, dsGrayHue: ds.grayHue });
  }
  void w; void h;
  return { ...m, mask: r.mask, layer: r.layer, input, out };
}
const over = (B: Img, L: Img): Img => { const o: Img = { w: B.w, h: B.h, data: new Uint8ClampedArray(B.data) }; for (let p = 0; p < B.w * B.h; p++) if (L.data[p * 4 + 3]) o.data.set(L.data.subarray(p * 4, p * 4 + 4), p * 4); return o; };
/** Raw output with dropped dark px touching the item marked: magenta = novel (an outline the model drew), yellow = mannequin color. */
function marks(c: any): Img {
  const o: Img = { w: c.out.w, h: c.out.h, data: new Uint8ClampedArray(c.out.data) }, { w, h } = o;
  const inCols = new Set<number>(); for (let p = 0; p < w * h; p++) if (c.input.data[p * 4 + 3]) inCols.add(p);
  const ic = [...inCols].map((p) => rgbOf(c.input, p));
  for (let p = 0; p < w * h; p++) if (!c.mask[p] && op(o, p)) { const col = rgbOf(o, p); if (hsv(...col)[2] < 0.35 && nb8(w, h, p, (q) => !!c.mask[q])) o.data.set(ic.some((k) => cheb(k, col) <= 16) ? [255, 230, 0, 255] : [255, 0, 255, 255], p * 4); }
  return o;
}

const rows: Row[] = [];
const variants: Record<string, Row[]> = { none: [], pos: [], diff: [] };
for (const body of ['A', 'B'] as const) {
  const B = BODY[body];
  for (const [item, { slot }] of Object.entries(S_ITEMS)) {
    const sr: Img[][] = [];
    for (const seed of [7, 11]) for (const arm of ARMS) {
      const outs = await files(fileOf(body, item, arm, `dress_s${seed}`)); if (!outs) continue;
      const g: Img[][] = [[], [], [], [], []];
      for (const [i, d] of B.views.entries()) {
        const base = await B.rest(d), band = items.bandOf(slot, skelOf(B.rig, d), B.rig.cell.h), c: any = cell(arm, item, base, outs[i], band, false);
        const { mask, layer, input, out, ...m } = c;
        rows.push({ body, item, arm, seed, view: d, ...m });
        if (arm === 'sc') for (const v of ['none', 'pos', 'diff'] as const) { const { mask: _m, layer: _l, input: _i, out: _o, ...mv } = cell(arm, item, base, outs[i], band, false, v) as any; variants[v].push({ body, item, arm, seed, view: d, ...mv }); }
        g[0].push(input); g[1].push(out); g[2].push(over(base, layer)); g[3].push(layer); g[4].push(marks(c));
      }
      sr.push(g.flat());
    }
    if (sr.length) await save(`${OUT}/S/${body}/${item}.sheet.png`, sheet(sr, 4));
  }
}
// walks: body A, seed 7, per frame on the walk base
const rig: any = BODY.A.rig;
const walkRows: Row[] = [];
for (const item of ['hair', 'cloak', 'helm']) for (const arm of ARMS) {
  const sh: Img[][] = [], sl: Img[][] = [];
  for (const d of DIRS) {
    const wf = await files(fileOf('A', item, arm, `walk_${d}`)); if (!wf) continue;
    const kp = items.clipKeypoints(rig, 'walk', d as any)!, r: Img[] = [], rl: Img[] = [];
    for (let fi = 0; fi < 8; fi++) {
      const base = await baseA(d, 'walk', fi), sk = Object.fromEntries(kp[fi].map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
      const c: any = cell(arm, item, base, wf[fi], items.bandOf(S_ITEMS[item].slot, sk, 64), true);
      const { mask, layer, input, out, ...m } = c;
      walkRows.push({ body: 'A', item, arm, seed: 7, view: d, frame: fi, ...m });
      r.push(over(base, layer)); rl.push(layer);
    }
    sh.push(r); sl.push(rl);
  }
  if (sh.length) await save(`${OUT}/S/A/${item}.${arm}.walk.sheet.png`, sheet(sh, 4));
  if (sl.length) await save(`${OUT}/S/A/${item}.${arm}.walk.layer.sheet.png`, sheet(sl, 4));
}
fs.writeFileSync(`${OUT}/S/rows.json`, JSON.stringify({ rows, walkRows, variants }, null, 1));

const f = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '-'), sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const circ = (rs: Row[], hk: 'hue' | 'grayHue', nk: 'satN' | 'grayN') => { let x = 0, y = 0; for (const r of rs) if (r[nk] && Number.isFinite(r[hk])) { x += Math.cos((r[hk] * Math.PI) / 180) * r[nk]; y += Math.sin((r[hk] * Math.PI) / 180) * r[nk]; } return x || y ? ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360 : NaN; };
const wmean = (rs: Row[], k: keyof Row, nk: 'satN' | 'grayN') => { const n = sum(rs.map((r) => r[nk] as number)); return n ? sum(rs.map((r) => ((r[k] as number) || 0) * (r[nk] as number))) / n : NaN; };
function agg(rs: Row[]) {
  return { n: rs.length, hard: rs.filter((r) => r.hard.length).length, kept: Math.min(...rs.map((r) => r.kept)), area: sum(rs.map((r) => r.area)), leak: sum(rs.map((r) => r.leak)), dark: sum(rs.map((r) => r.dark)), darkNovel: sum(rs.map((r) => r.darkNovel)),
    hue: circ(rs, 'hue', 'satN'), sat: wmean(rs, 'sat', 'satN'), kh: wmean(rs, 'keyHueShare', 'satN'), grayHue: circ(rs, 'grayHue', 'grayN'), graySat: wmean(rs, 'graySat', 'grayN'), grayLean: wmean(rs, 'grayLean', 'grayN'), gem: sum(rs.map((r) => r.gem)), green: sum(rs.map((r) => r.green)), palLost: sum(rs.map((r) => r.palLost)), bodyRemoved: sum(rs.map((r) => r.bodyRemoved)) };
}
const head = '| body | item | arm | seeds | views | hard | min kept | item px | band leak | dark dropped | novel dark | sat hue | sat S | key-hue share | gray hue | gray S | gray key-lean | gem px | green px | sc pal lost |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const line = (b: string, it: string, a: string, rs: Row[]) => { const g = agg(rs); return `| ${b} | ${it} | ${a} | ${[...new Set(rs.map((r) => r.seed))].join(',')} | ${g.n} | ${g.hard} | ${f(g.kept, 3)} | ${g.area} | ${g.leak} | ${g.dark} | ${g.darkNovel} | ${f(g.hue, 0)} | ${f(g.sat)} | ${f(g.kh)} | ${f(g.grayHue, 0)} | ${f(g.graySat)} | ${f(g.grayLean)} | ${g.gem} | ${g.green} | ${g.palLost} |`; };
console.log('### Dress, per item and arm\n\n' + head);
for (const body of ['A', 'B']) for (const item of Object.keys(S_ITEMS)) for (const arm of ARMS) { const rs = rows.filter((r) => r.body === body && r.item === item && r.arm === arm); if (rs.length) console.log(line(body, item, arm, rs)); }
const CORE = ['helm', 'plate', 'hair', 'cloak', 'jerkin'];
for (const [title, pick] of [['Body A seed 7, core items', (r: Row) => r.body === 'A' && r.seed === 7 && CORE.includes(r.item)], ['Body A seed 11, core items', (r: Row) => r.body === 'A' && r.seed === 11 && CORE.includes(r.item)], ['Body B seed 7', (r: Row) => r.body === 'B']] as const) {
  const rs = rows.filter(pick); if (!rs.length) continue;
  console.log(`\n### ${title}\n\n${head}`);
  for (const arm of ARMS) { const s = rs.filter((r) => r.arm === arm); if (s.length) console.log(line('', 'core', arm, s)); }
}
console.log('\n### Walk S/E/N, body A seed 7 (per frame on the walk base)\n\n' + head);
for (const item of ['hair', 'cloak', 'helm']) for (const arm of ARMS) { const rs = walkRows.filter((r) => r.item === item && r.arm === arm); if (rs.length) console.log(line('A', item + ' walk ' + [...new Set(rs.map((r) => r.view[0].toUpperCase()))].join(''), arm, rs)); }
console.log('\n### Post-hoc: production despill on fc / fg layers (dress)\n\n| body | item | arm | key-hue tint px raw | after despill | px despilled | sat hue/S after | gray hue/S after |\n|---|---|---|---|---|---|---|---|');
for (const body of ['A', 'B']) for (const item of Object.keys(S_ITEMS)) for (const arm of ['fc', 'fg'] as Arm[]) {
  const rs: any[] = rows.filter((r) => r.body === body && r.item === item && r.arm === arm); if (!rs.length) continue;
  const s2 = (k: string) => sum(rs.map((r) => r[k] ?? 0));
  console.log(`| ${body} | ${item} | ${arm} | ${s2('tintRaw')} | ${s2('tintDespill')} | ${s2('despilled')} | ${f(circ(rs.map((r) => ({ ...r, hue: r.dsHue })), 'hue', 'satN'), 0)}/${f(wmean(rs.map((r) => ({ ...r, sat: r.dsSat })), 'sat', 'satN'))} | ${f(circ(rs.map((r) => ({ ...r, grayHue: r.dsGrayHue })), 'grayHue', 'grayN'), 0)}/${f(wmean(rs.map((r) => ({ ...r, graySat: r.dsGraySat })), 'graySat', 'grayN'))} |`);
}
console.log('\n### sc body-part variants (dress), core items\n\n| variant | views | hard | item px | band leak | novel dark | pal lost | body px removed |\n|---|---|---|---|---|---|---|---|');
for (const [v, rs0] of [['pal', rows.filter((r) => r.arm === 'sc')], ['none', variants.none], ['pos', variants.pos], ['diff', variants.diff]] as const) { const rs = (rs0 as Row[]).filter((r) => CORE.includes(r.item)); if (!rs.length) continue; const g = agg(rs); console.log(`| ${v} | ${g.n} | ${g.hard} | ${g.area} | ${g.leak} | ${g.darkNovel} | ${g.palLost} | ${g.bodyRemoved} |`); }
