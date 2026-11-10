// Evaluate keys3 stage 1 (read-only, never spends): prod through the WORKING-TREE production extractCell (rim guard, rule (c),
// despill), fg through k3_flat's window detector at window 20 (decisive) and window 12 (sensitivity), both despilled by the
// working-tree production despill; the chroma.ts hash is printed so a report names the despill it measured. Inputs are the
// exact PNGs arm_k3 sent. R0 criteria from PLAN-v2 section 4, with the allowance each criterion used (tie band: <= 0.5).
// Usage (from spikes/api): C25_RUN=keys3-2026-11-10 node c25/eval_k3.mts [cell filter]
import fs from 'node:fs';
import crypto from 'node:crypto';
import { readOnly, items, chroma, load, save, exists, OUT, type Img } from './lib.mts';
readOnly();
import { sheet } from './evaluate.mts';
import { STAGE1, BODY, ITEMS, VIEWS, HUE, keyHue, fileOf, labelOf, type Cell } from './arm_k3.mts';
import { extractFlat, darkKeyKept, hsv, hgap, px, op, nb8, W20, W12, type Win } from './k3_flat.mts';

const chromaTs = fs.readFileSync(new URL('../../../app/src/lib/image/chroma.ts', import.meta.url));
console.log(`chroma.ts sha ${crypto.createHash('sha256').update(chromaTs).digest('hex').slice(0, 12)} (working tree)`);
const cheb = (a: number[], b: number[]) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const outs = async (f: string) => { if (!exists(`${f}.json`)) return null; const n = JSON.parse(fs.readFileSync(`${f}.json`, 'utf8')).frames; return Promise.all(Array.from({ length: n }, (_, i) => load(`${f}.${i}.png`))); };
const skelOf = (rig: any, d: string) => Object.fromEntries(rig.rest[d].keypoints.map((p: any) => [p.label, { x: p.x * rig.cell.w, y: p.y * rig.cell.h }]));

/** One view through its arm's detector: mask, final layer, key predicate, production cell (prod only). */
function extract(c: Cell, base: Img, out: Img, input: Img, band: any, pad: number, w: Win) {
  if (c.arm === 'prod') {
    // production G2 and G3 come from the cell itself; isKey is only used by the flat branch
    const x: any = items.extractCell({ key: 'rest/x/0', call: 0, base, out, route: chroma.pickKey(ITEMS[c.item].prompt), band, posed: false, held: !!pad, pad });
    return { mask: x.mask as Uint8Array, layer: x.layer as Img, isKey: (_p: number) => false, x };
  }
  const r = extractFlat(HUE[c.arm], out, input, w);
  return { mask: r.mask, layer: r.layer, isKey: (p: number) => !!r.key[p], x: null as any };
}
type Row = Record<string, any>;
function measure(c: Cell, base: Img, out: Img, input: Img, band: any, pad: number, w: Win): Row {
  const r = extract(c, base, out, input, band, pad, w), { w: W, h } = out, N = W * h, KH = keyHue(c);
  const inCols: number[][] = [], seen = new Set<number>();
  for (let p = 0; p < N; p++) if (input.data[p * 4 + 3]) { const q = px(input, p), k = (q[0] << 16) | (q[1] << 8) | q[2]; if (!seen.has(k)) { seen.add(k); inCols.push(q); } }
  let n = 0, kept = 0, keyN = 0, keyOut = 0, area = 0, leakM = 0, leakNat = 0, dark = 0, novel = 0, satN = 0, sx = 0, sy = 0, ss = 0, grayN = 0, gs = 0, gl = 0, grayRew = 0, dk10 = 0, dk10edge = 0, tinted = 0;
  const flatKey = (p: number) => r.isKey(p);
  for (let p = 0; p < N; p++) {
    const x = p % W, y = (p / W) | 0;
    if (r.mask[p]) {
      area++;
      const o = px(out, p), L = px(r.layer, p), [hh, s, v] = hsv(...L), rad = (hh * Math.PI) / 180;
      if (base.data[p * 4 + 3]) {
        if (cheb(o, px(input, p)) <= 24) leakM++; // mannequin kept as item
        if (cheb(o, px(base, p)) <= 16 && cheb(px(input, p), px(base, p)) > 48) leakNat++; // natural body redrawn and kept
        if (darkKeyKept(o, KH)) { dk10++; if (nb8(W, h, p, (q) => !r.mask[q])) dk10edge++; }
      }
      if (hgap(hh, KH) <= 30 && s >= 0.25) tinted++; // key-tinted in the FINAL layer (decisive metric 10)
      if (s >= 0.35 && v >= 0.25) { satN++; sx += Math.cos(rad); sy += Math.sin(rad); ss += s; }
      else if (v >= 0.25) { grayN++; gs += s; if (hgap(hh, KH) <= 40 && s >= 0.08) gl++; if (cheb(L, o) > 2) grayRew++; }
    } else if (op(out, p)) {
      const q = px(out, p);
      if (hsv(...q)[2] < 0.35 && nb8(W, h, p, (z) => !!r.mask[z])) { dark++; if (!inCols.some((k) => cheb(k, q) <= 16)) novel++; }
    }
    if (c.arm !== 'prod') {
      if (base.data[p * 4 + 3] && !r.mask[p] && x && y && x < W - 1 && y < h - 1) { n++; if (flatKey(p)) kept++; }
      if (flatKey(p) && !r.mask[p]) { keyN++; if (!base.data[p * 4 + 3]) keyOut++; }
    }
  }
  const g2 = r.x ? r.x.keyKept : n ? kept / n : 1, g3 = r.x ? r.x.keyOutside : keyN ? keyOut / keyN : 0;
  const g2fail = r.x ? items.g2Fails(r.x) : g2 < 0.97 && n - kept > items.GATES.keyLostPx;
  const hard = [!area && 'empty', g2fail && 'G2', g3 > items.GATES.keyOutside && 'G3'].filter(Boolean);
  return { area, g2, g3, hard, leak: leakM + leakNat, leakM, leakNat, dark, novel, satN, sx, sy, ss, grayN, gs, gl, grayRew, dk10, dk10edge, tinted, mask: r.mask, layer: r.layer };
}
const over = (B: Img, L: Img): Img => { const o: Img = { w: B.w, h: B.h, data: new Uint8ClampedArray(B.data) }; for (let p = 0; p < B.w * B.h; p++) if (L.data[p * 4 + 3]) o.data.set(L.data.subarray(p * 4, p * 4 + 4), p * 4); return o; };

const filter = process.argv[2], rows: Row[] = [];
for (const c of STAGE1.filter((x) => !filter || labelOf(x).includes(filter))) {
  const o = await outs(fileOf(c)); if (!o) { console.log(`missing ${labelOf(c)}`); continue; }
  const B = BODY[c.body], { slot } = ITEMS[c.item], pad = items.padOf(slot, 'skel', B.rig.cell), sh: Img[] = [];
  for (const [i, d] of VIEWS.entries()) {
    const base = items.padImg(await B.rest(d), pad), input = await load(`${fileOf(c)}.input.${i}.png`), H = B.rig.cell.h + 2 * pad;
    const band = items.bandOf(slot, pad ? undefined : skelOf(B.rig, d), H);
    for (const [win, w] of [['20', W20], ['12', W12]] as const) {
      if (c.arm === 'prod' && win === '12') continue;
      const { mask, layer, ...m } = measure(c, base, o[i], input, band, pad, w);
      rows.push({ ...c, view: d, win, ...m });
      if (win === '20') sh.push(input, o[i], over(base, layer), layer);
    }
  }
  await save(`${fileOf(c)}.sheet.png`, sheet([sh.slice(0, 4), sh.slice(4, 8), sh.slice(8, 12)], c.body === 'body128' ? 2 : 4));
}
fs.writeFileSync(`${OUT}/K3/stage1.rows.json`, JSON.stringify(rows));

const sum = (rs: Row[], k: string) => rs.reduce((s, r) => s + (r[k] ?? 0), 0);
function agg(rs: Row[]) {
  const satN = sum(rs, 'satN'), grayN = sum(rs, 'grayN');
  return { satN, hard: rs.filter((r) => r.hard.length).length, g2mean: sum(rs, 'g2') / rs.length, g2min: Math.min(...rs.map((r) => r.g2)), g3: sum(rs, 'g3'), area: sum(rs, 'area'), leak: sum(rs, 'leak'), novel: sum(rs, 'novel'), dark: sum(rs, 'dark'), dk10: sum(rs, 'dk10'), dk10edge: sum(rs, 'dk10edge'), tinted: sum(rs, 'tinted'),
    hue: satN ? ((Math.atan2(sum(rs, 'sy'), sum(rs, 'sx')) * 180) / Math.PI + 360) % 360 : NaN, sat: satN ? sum(rs, 'ss') / satN : NaN, grayRew: grayN ? sum(rs, 'grayRew') / grayN : 0, lean: grayN ? sum(rs, 'gl') / grayN : 0 };
}
const f = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '-');
/** R0 criteria for fg against prod on one pair: [name, fg value, prod value, allowance used (1 = at the limit)]. */
function criteria(g: ReturnType<typeof agg>, p: ReturnType<typeof agg>): [string, string, string, number][] {
  // NaN = not applicable: the hue and S criteria need at least 20 saturated px on both arms (steel has almost none)
  const use = (excess: number, allow: number) => (Number.isNaN(excess) ? NaN : excess <= 0 ? 0 : allow > 0 ? excess / allow : Infinity);
  const sat = g.satN >= 20 && p.satN >= 20, dh = sat ? hgap(g.hue, p.hue) : NaN;
  return [
    ['1 hard fails', `${g.hard}`, `${p.hard}`, use(g.hard - p.hard, 0)],
    ['2 body leak px', `${g.leak}`, `${p.leak}`, use(g.leak - p.leak, 0.25 * p.leak + 10)],
    ['10 key-tinted px in the final layer', `${g.tinted}`, `${p.tinted}`, use(g.tinted - p.tinted, 0.25 * p.tinted + 10)],
    ['4 sat hue gap to prod (deg)', f(g.hue, 0), f(p.hue, 0), use(dh, 10)],
    ['4 sat S', f(g.sat), f(p.sat), use(sat ? p.sat - g.sat : NaN, 0.08)],
    ['5 gray rewritten share', f(g.grayRew), f(p.grayRew), use(g.grayRew - p.grayRew, 0.05)],
    ['5 gray key-lean', f(g.lean), f(p.lean), use(g.lean - p.lean, 0.1)],
    ['6 G2 mean', f(g.g2mean, 4), f(p.g2mean, 4), use(p.g2mean - g.g2mean, 0.005)],
    ['6 G3 sum', f(g.g3, 3), f(p.g3, 3), use(g.g3 - p.g3, 0.02)],
  ];
}
console.log('\n| pair | window | criterion | fg | prod | allowance used |\n|---|---|---|---|---|---|');
const pairs = [...new Set(rows.map((r) => `${r.body}|${r.item}|${r.seed}`))];
let worst = 0, fails = 0;
for (const k of pairs) {
  const [body, item, seed] = k.split('|'), pick = (a: string, win: string) => rows.filter((r) => r.body === body && r.item === item && r.seed === +seed && r.arm === a && r.win === win);
  const p = pick('prod', '20'); if (!p.length) continue;
  for (const win of ['20', '12']) {
    const g = pick('fg', win); if (!g.length) continue;
    for (const [name, a, b, u] of criteria(agg(g), agg(p))) {
      if (win === '20' && !Number.isNaN(u)) { worst = Math.max(worst, u); if (u > 1) fails++; }
      if (win === '20' || u > 0.5) console.log(`| ${body} ${item} s${seed} | ${win}${win === '12' ? ' (sensitivity)' : ''} | ${name} | ${a} | ${b} | ${Number.isNaN(u) ? 'n/a' : f(u)}${u > 1 ? ' FAIL' : u > 0.5 ? ' (tie band)' : ''} |`);
    }
  }
}
console.log('\n| pair | arm | metric 10 as written (dark key-hue px kept on the silhouette) | of which on the item edge | novel dark dropped (reported) | item px |\n|---|---|---|---|---|---|');
for (const k of pairs) for (const a of ['prod', 'fg']) {
  const [body, item, seed] = k.split('|'), g = agg(rows.filter((r) => r.body === body && r.item === item && r.seed === +seed && r.arm === a && r.win === '20'));
  console.log(`| ${body} ${item} s${seed} | ${a} | ${g.dk10} | ${g.dk10edge} | ${g.novel} | ${g.area} |`);
}
console.log(`\nwindow 20: ${fails} criterion failures; worst allowance used ${f(worst)} (${worst > 0.5 ? 'outside' : 'inside'} the 0.5 tie band). Review every sheet (K3/<body>/<item>/<arm>_dress_s<seed>.sheet.png) before any verdict.`);
