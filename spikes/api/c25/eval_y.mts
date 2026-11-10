// Evaluate arm Y (read-only, never spends): per dress call and view the production gates (G2 key kept, G3 key outside) plus
// the chroma-default metrics pre-registered in out/<C25_RUN>/RESULTS.md; walk poses through production cleanup and QA. Writes
// 4x sheets per item (rows: key + seed; columns: input mannequin, dressed output, layer over the real body, key heatmap).
// Usage (from spikes/api): C25_RUN=chroma-2026-11-09 node c25/eval_y.mts
import fs from 'node:fs';
import { readOnly, items, chroma, save, OUT, type Img } from './lib.mts';
readOnly();
import { sheet } from './evaluate.mts';
import { rotate } from './hue.mts';
import { DIRS } from './s4rig.mts';
import { Y_ITEMS, KS, ROT, BODY, fileOf, mannequin, extract, stored, type K } from './arm_y.mts';

/** Image in the key's frame: hue-rotated so the key sits at green, where the production green scorer measures it. */
const toG = (im: Img, k: K) => (ROT[k] ? rotate(im, -ROT[k]) : im);
const px = (im: Img, p: number): [number, number, number] => [im.data[p * 4], im.data[p * 4 + 1], im.data[p * 4 + 2]];
const cheb = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
const skelOf = (rig: any, d: string) => Object.fromEntries(rig.rest[d].keypoints.map((p: any) => [p.label, { x: p.x * rig.cell.w, y: p.y * rig.cell.h }]));

type Row = { body: string; item: string; key: K; seed: number; view: string; g2: number; lostBody: number; g3: number; hard: string[]; area: number;
  near: number; lostKey: number; lostOut: number; despill: number; drift: number; driftN: number; repaint: number; tint: number; lean: number };

function measure(k: K, base: Img, out: Img, c: any) {
  const G = toG(out, k), L = toG(c.layer, k), M = mannequin(base, k), w = base.w;
  let lostKey = 0, lostOut = 0, despill = 0, dsum = 0, dn = 0, rep = 0, repN = 0, tint = 0, leanN = 0, itemN = 0;
  for (let p = 0; p < c.mask.length; p++) {
    const a = out.data[p * 4 + 3] >= 128, [r, g, b] = px(G, p);
    if (c.mask[p]) {
      itemN++; if (chroma.keyScore('green', r, g, b) > 0 && Math.max(r, g, b) >= 64) leanN++;
      if (cheb(px(c.layer, p), px(out, p)) > 2) despill++; // > 2: the cyan rotation round trip moves a channel by 1
      if (chroma.keyScore('green', ...px(L, p)) >= chroma.NEAR_KEY) tint++;
      if (Math.max(r, g, b) - Math.min(r, g, b) < 48 && Math.max(r, g, b) >= 40) { dsum += g - Math.max(r, b); dn++; }
    } else if (a && chroma.keyScore('green', r, g, b) >= chroma.KT && chroma.rampDistance('green', r, g, b) > 40) {
      if (base.data[p * 4 + 3]) lostKey++; else lostOut++;
    }
    const x = p % w, y = (p / w) | 0;
    if (base.data[p * 4 + 3] && !c.mask[p] && x && y && x < w - 1 && y < base.h - 1) { repN++; if (cheb(px(out, p), px(M, p)) > 24) rep++; }
  }
  return { near: chroma.nearKeyShare(G, c.mask, 'green'), lostKey, lostOut, despill, drift: dn ? dsum / dn : 0, driftN: dn, repaint: repN ? rep / repN : 0, tint, lean: itemN ? leanN / itemN : 0 };
}

/** keyHeatmap scored in the key's frame, item px kept in their real colors (orange = weak key tint, blue to white = key). */
const heat = (out: Img, k: K) => { const H = chroma.keyHeatmap(toG(out, k), 'green'), G = toG(out, k); for (let p = 0; p < out.w * out.h; p++) if (out.data[p * 4 + 3] >= 128 && !chroma.keyScore('green', ...px(G, p))) H.data.set(out.data.subarray(p * 4, p * 4 + 3), p * 4); return H; };
const rows: Row[] = [];
for (const body of ['A', 'B'] as const) {
  const B = BODY[body];
  for (const [item, { slot }] of Object.entries(Y_ITEMS)) {
    const sheetRows: Img[][] = [];
    for (const seed of [7, 11]) for (const k of KS) {
      const outs = await stored(fileOf(body, item, k, `dress_s${seed}`)); if (!outs) continue;
      const sr: Img[][] = [[], [], [], []];
      for (const [i, d] of B.views.entries()) {
        const base = await B.rest(d), out = outs[i];
        const c: any = extract(k, { key: `rest/${d}/0`, call: 0, base, out, band: items.bandOf(slot, skelOf(B.rig, d), B.rig.cell.h) });
        const hard = [items.g2Fails(c) && 'G2', (c.keyOutside ?? 0) > items.GATES.keyOutside && 'G3', !c.area && 'empty'].filter(Boolean) as string[];
        rows.push({ body, item, key: k, seed, view: d, g2: c.keyKept, lostBody: c.keyLost, g3: c.keyOutside, hard, area: c.area, ...measure(k, base, out, c) });
        sr[0].push(mannequin(base, k)); sr[1].push(out); sr[2].push(items.recompose(c)); sr[3].push(heat(out, k));
      }
      sheetRows.push(sr.flat());
    }
    if (sheetRows.length) await save(`${OUT}/Y/${body}/${item}.sheet.png`, sheet(sheetRows, 4));
  }
}
fs.writeFileSync(`${OUT}/Y/dress_rows.json`, JSON.stringify(rows, null, 1));

const f = (n: number, d = 3) => n.toFixed(d), sum = (a: number[]) => a.reduce((s, x) => s + x, 0), mean = (a: number[]) => (a.length ? sum(a) / a.length : NaN);
function agg(rs: Row[]) {
  return { n: rs.length, hard: rs.filter((r) => r.hard.length).length, g2: mean(rs.map((r) => r.g2)), g2min: Math.min(...rs.map((r) => r.g2)), g3: sum(rs.map((r) => r.g3)),
    near: mean(rs.map((r) => r.near)), lostKey: sum(rs.map((r) => r.lostKey)), lostOut: sum(rs.map((r) => r.lostOut)), despill: sum(rs.map((r) => r.despill)),
    drift: sum(rs.map((r) => r.drift * r.driftN)) / (sum(rs.map((r) => r.driftN)) || 1), repaint: mean(rs.map((r) => r.repaint)), tint: sum(rs.map((r) => r.tint)), lean: mean(rs.map((r) => r.lean)), area: sum(rs.map((r) => r.area)) };
}
const head = '| key | views | hard fails | G2 mean | G2 min | G3 sum | near-key mean | lost px (body/out) | despilled px | drift | repaint | tint px | key-leaning | item px |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const line = (k: string, a: ReturnType<typeof agg>) => `| ${k} | ${a.n} | ${a.hard} | ${f(a.g2)} | ${f(a.g2min)} | ${f(a.g3)} | ${f(a.near)} | ${a.lostKey}/${a.lostOut} | ${a.despill} | ${f(a.drift, 1)} | ${f(a.repaint)} | ${a.tint} | ${f(a.lean)} | ${a.area} |`;
const nonColl = (r: Row) => !Y_ITEMS[r.item].collides;
for (const [title, pick] of [
  ['Body A seed 7, non-colliding items', (r: Row) => r.body === 'A' && r.seed === 7 && nonColl(r)],
  ['Body A seed 11, non-colliding items', (r: Row) => r.body === 'A' && r.seed === 11 && nonColl(r)],
  ['Body B seed 7', (r: Row) => r.body === 'B'],
  ['Collision controls (amulet, tunic), body A', (r: Row) => r.body === 'A' && !nonColl(r)],
] as const) {
  const rs = rows.filter(pick); if (!rs.length) continue;
  console.log(`\n### ${title}\n\n${head}`);
  for (const k of KS) { const s = rs.filter((r) => r.key === k); if (s.length) console.log(line(k, agg(s))); }
}
console.log('\n### Per item and key (all stored dress calls; hard fails list view:gate)\n\n| body | item | key | seeds | hard | G2 min | G3 max | near-key | lost px | despilled | drift | repaint | tint | item px |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const body of ['A', 'B']) for (const item of Object.keys(Y_ITEMS)) for (const k of KS) {
  const s = rows.filter((r) => r.body === body && r.item === item && r.key === k); if (!s.length) continue;
  const a = agg(s), hs = s.filter((r) => r.hard.length).map((r) => `s${r.seed}${r.view[0].toUpperCase()}:${r.hard.join('+')}`).join(' ');
  console.log(`| ${body} | ${item} | ${k} | ${[...new Set(s.map((r) => r.seed))].join(',')} | ${hs || 0} | ${f(a.g2min)} | ${f(Math.max(...s.map((r) => r.g3)))} | ${f(a.near)} | ${a.lostKey + a.lostOut} | ${a.despill} | ${f(a.drift, 1)} | ${f(a.repaint)} | ${a.tint} | ${f(a.lean)} | ${a.area} |`);
}

// walk poses: production cleanup and QA. Green, azure and blue run their production route; cyan runs in the green frame
// (outputs rotated -60), as eval_z did for azure before it shipped. Keys and layers stay in the same frame for H4.
const rig: any = BODY.A.rig;
console.log('\n### Walk S/E/N (body A, seed 7)\n\n| item | key | hard fails | warnings | G2 min | G3 max | lost px | tint px | layer px |\n|---|---|---|---|---|---|---|---|---|');
const { baseA } = await import('./s4rig.mts');
for (const item of Object.keys(Y_ITEMS)) for (const k of KS) {
  const kf = await stored(fileOf('A', item, k, 'dress_s7')); if (!kf) continue;
  const fr: K = k === 'cyan' ? 'green' : k, route = fr as 'green' | 'azure' | 'blue', inF = (im: Img) => (k === 'cyan' ? toG(im, k) : im);
  const slot = Y_ITEMS[item].slot, keys: Record<string, Img> = {}, cells: any[] = [];
  for (const [i, d] of DIRS.entries()) {
    const w = await stored(fileOf('A', item, k, `walk_${d}`)); if (!w) continue;
    keys[d] = items.extractCell({ key: `rest/${d}/0`, call: 0, base: await BODY.A.rest(d), out: inF(kf[i]), route, band: items.bandOf(slot, skelOf(rig, d), 64) }).layer;
    const kp = items.clipKeypoints(rig, 'walk', d as any)!;
    for (let fi = 0; fi < 8; fi++) {
      const sk = Object.fromEntries(kp[fi].map((p: any) => [p.label, { x: p.x * 64, y: p.y * 64 }]));
      cells.push(items.extractCell({ key: `walk/${d}/${fi}`, call: 1 + i, base: await baseA(d, 'walk', fi), out: inF(w[fi]), route, band: items.bandOf(slot, sk, 64), posed: true, clip: items.slotOf(slot).band }));
    }
  }
  if (!cells.length) continue;
  const m = cells.map((c) => measure(fr, c.base, c.out, c));
  items.postProcess(rig, items.slotOf(slot), cells, keys, 0);
  const q = items.itemQa(rig, items.slotOf(slot), route, cells, 0, items.GATES.keyOutsidePosed, 0), h = items.dirGate(items.slotOf(slot), cells, keys, rig);
  const fails = [...q.failCalls.values(), ...h.fails.values()].flat();
  console.log(`| ${item} | ${k} | ${fails.length}${fails.length ? ' (' + fails.slice(0, 3).join('; ') + ')' : ''} | ${q.warnings.length + h.warnings.length} | ${f(Math.min(...cells.map((c) => c.keyKept ?? 1)))} | ${f(Math.max(...cells.map((c) => c.keyOutside ?? 0)))} | ${sum(m.map((x) => x.lostKey + x.lostOut))} | ${sum(m.map((x) => x.tint))} | ${sum(cells.map((c) => c.area))} |`);
  await save(`${OUT}/Y/A/${item}.${k}.walk.sheet.png`, sheet(DIRS.map((d) => cells.filter((c) => c.key.startsWith(`walk/${d}/`)).map((c) => items.recompose({ base: c.base, layer: k === 'cyan' ? rotate(c.layer, 60) : c.layer }))), 4));
}
