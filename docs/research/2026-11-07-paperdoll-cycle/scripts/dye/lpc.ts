// LPC regression for the dye detectors: the ecosystem replay's ground truth (recolor palette variant covering the most
// pixels of walk.png, explicit sources first; same skips), rescored for production, the hybrid and the hue-guarded hybrid.
// Ground-truth logic follows checkouts/cycle-2026-11-07/ecosystem/_replay/ramps-replay.ts. Read-only on the LPC checkout.
// Usage (repo root): node docs/research/2026-11-07-paperdoll-cycle/scripts/dye/lpc.ts [lpc-root]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { autoRamps, colorCounts, fromHex, lab } from '../../../../../app/src/lib/dress/palette.ts';
import { decodePngBytes } from '../../../../../app/src/lib/image/pngraw.ts';
import type { Img } from '../../../../../app/src/lib/image/png.ts';
import { chains, hybrid, neutralFamily, sameFamily } from './detectors.ts';
import { saveJson } from './lib.ts';

const LPC = process.argv[2] ?? 'C:/Programming_Files/Shilocity/PixelLab/checkouts/lpc-generator';

function decodeIndexed(b: Buffer): Img {
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24];
  if (b[25] !== 3 || b[28]) throw new Error('not indexed non-interlaced');
  let plte = Buffer.alloc(0), trns = Buffer.alloc(0); const idat: Buffer[] = [];
  for (let p = 8; p < b.length;) { const len = b.readUInt32BE(p), t = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (t === 'PLTE') plte = d; else if (t === 'tRNS') trns = d; else if (t === 'IDAT') idat.push(d); p += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), stride = Math.ceil((w * depth) / 8), px = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) { const s = raw[y * (stride + 1) + 1 + x], a = x >= 1 ? px[y * stride + x - 1] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= 1 && y ? px[(y - 1) * stride + x - 1] : 0;
      const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c);
      px[y * stride + x] = (s + (f === 0 ? 0 : f === 1 ? a : f === 2 ? up : f === 3 ? (a + up) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; } }
  const data = new Uint8ClampedArray(w * h * 4), per = 8 / depth, mask = (1 << depth) - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (px[y * stride + Math.floor(x / per)] >> (8 - depth * (1 + (x % per)))) & mask;
    data.set([plte[i * 3], plte[i * 3 + 1], plte[i * 3 + 2], i < trns.length ? trns[i] : 255], (y * w + x) * 4); }
  return { w, h, data };
}
const walk = (dir: string, out: string[]): string[] => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (f.endsWith('.json')) out.push(p); } return out; };
const hx = (h: string) => fromHex(h.toLowerCase().slice(0, 7));

const rows: { item: string; material: string; multi: boolean; [k: string]: unknown }[] = [];
const items = new Map<string, Record<string, number>>(); // item -> mixed ramp counts per detector
for (const f of walk(join(LPC, 'sheet_definitions'), []).sort()) {
  let d: any; try { d = JSON.parse(readFileSync(f, 'utf8')); } catch { continue; }
  if (!d.recolors) continue;
  const mats: any[] = d.recolors.material ? [d.recolors] : Object.keys(d.recolors).filter((k) => /^color_\d+$/.test(k)).sort().map((k) => d.recolors[k]);
  if (!mats.length || mats.some((m) => !m.material)) continue;
  const rel = d.layer_1?.male ?? Object.values(d.layer_1 ?? {}).find((v) => typeof v === 'string');
  const file = rel && join(LPC, 'spritesheets', rel, 'walk.png');
  if (!file || !existsSync(file)) continue;
  let im: Img; try { const b = readFileSync(file); im = b[25] === 3 ? decodeIndexed(b) : await decodePngBytes(new Uint8Array(b)); } catch { continue; }
  const counts = colorCounts([im]), total = [...counts.values()].reduce((a, b) => a + b, 0);
  const claimed = new Set<number>(), Gs: { mat: string; G: Set<number>; cover: number }[] = [];
  for (const m of mats) if (Array.isArray(m.source)) { const G = new Set([...counts.keys()].filter((c) => m.source.map(hx).includes(c))); G.forEach((c) => claimed.add(c)); Gs.push({ mat: m.material, G, cover: 0 }); }
  for (const m of mats) if (!Array.isArray(m.source)) {
    const dir = join(LPC, 'palette_definitions', m.material); if (!existsSync(dir)) continue;
    const variants: Record<string, string[]> = {};
    for (const p of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('meta'))) Object.assign(variants, JSON.parse(readFileSync(join(dir, p), 'utf8')));
    let best = '', cover = 0;
    for (const [name, hexes] of Object.entries(variants)) { if (!Array.isArray(hexes)) continue; const st = new Set(hexes.map(hx)); const c = [...counts].filter(([col]) => st.has(col) && !claimed.has(col)).reduce((a, [, n]) => a + n, 0); if (c > cover) { cover = c; best = name; } }
    if (!best) continue;
    const G = new Set([...counts.keys()].filter((c) => !claimed.has(c) && variants[best].map(hx).includes(c)));
    G.forEach((c) => claimed.add(c)); Gs.push({ mat: m.material, G, cover: cover / total });
  }
  if (mats.length === 1 && (Gs[0]?.cover ?? 0) < 0.5) continue;
  const prod = autoRamps(counts).map((r) => r.map(fromHex)), ch = chains([im]);
  const det: Record<string, number[][]> = { prod, hybrid: hybrid(prod, ch), hybridGuarded: hybrid(prod, ch, sameFamily), hybridNeutral: hybrid(prod, ch, neutralFamily), hybridNeutralNoOutline: hybrid(prod, chains([im], false), neutralFamily) };
  const item = f.slice(LPC.length + 1).split('\\').join('/');
  const mixed = Object.fromEntries(Object.entries(det).map(([k, r]) => [k, r.filter((x) => Gs.filter((g) => g.G.size && x.some((c) => g.G.has(c))).length >= 2).length]));
  if (Gs.length > 1) items.set(item, mixed);
  for (const g of Gs) {
    if (g.G.size < 3) continue;
    const sc = (ramps: number[][]) => { let bj = 0; for (const r of ramps) { const j = r.filter((c) => g.G.has(c)).length / new Set([...r, ...g.G]).size; if (j > bj) bj = j; } return bj; };
    // policy-neutral: drop the neutral darks production deliberately leaves unrecolorable from the truth
    const G2 = new Set([...g.G].filter((c) => { const l = lab(c); return !(l[0] < 0.25 && Math.hypot(l[1], l[2]) < 0.035); }));
    const sc2 = (ramps: number[][]) => { let bj = 0; for (const r of ramps) { const j = r.filter((c) => G2.has(c)).length / new Set([...r, ...G2]).size; if (j > bj) bj = j; } return bj; };
    rows.push({ item, material: g.mat, multi: Gs.length > 1, ...Object.fromEntries(Object.entries(det).flatMap(([k, r]) => [[k, +sc(r).toFixed(3)], [`${k}Pol`, G2.size >= 2 ? +sc2(r).toFixed(3) : null]])) });
  }
}
const ks = ['prod', 'hybrid', 'hybridGuarded', 'hybridNeutral', 'hybridNeutralNoOutline'];
const agg = (rs: typeof rows) => Object.fromEntries(ks.map((k) => [k, { n: rs.length, exact: rs.filter((r) => r[k] === 1).length, meanJaccard: +(rs.reduce((s, r) => s + (r[k] as number), 0) / rs.length).toFixed(3),
  polExact: rs.filter((r) => r[`${k}Pol`] === 1).length, polJaccard: +(rs.filter((r) => r[`${k}Pol`] !== null).reduce((s, r) => s + (r[`${k}Pol`] as number), 0) / rs.filter((r) => r[`${k}Pol`] !== null).length).toFixed(3) }]));
const byMat = Object.fromEntries([...new Set(rows.map((r) => r.material))].map((m) => [m, agg(rows.filter((r) => r.material === m))]));
const multiItems = { items: items.size, ...Object.fromEntries(ks.map((k) => [k, [...items.values()].filter((x) => x[k] > 0).length])) };
const summary = { all: agg(rows), cloth: byMat.cloth, hair: byMat.hair, body: byMat.body, multiItemsWithMixedRamp: multiItems };
saveJson('lpc.json', { summary, rows, mixed: Object.fromEntries(items) });
console.log(JSON.stringify(summary, null, 1));
