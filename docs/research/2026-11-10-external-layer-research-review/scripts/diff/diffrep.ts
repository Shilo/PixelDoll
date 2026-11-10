// Offline comparison: friend's plain-base diff (+5% component rule, +palette clean) vs PixelDoll chroma extraction.
// Run from the worktree root: node <this file>. No PixelLab calls. Production code imported, never copied.
// Part A: S2 X3(c)-style semi-synthetic GT: 5 items x 16 cells (S1 walk south+east), GT = S2 green chroma ea2 layers,
//   diff composite = real S1 skin body drift (edit-animation-v2 on the plain body, donor item's run outside its rect) + GT layer,
//   chroma composite = real S2 green-key body drift (donor item's run outside the same rect) + GT layer.
// Part B: 627 real benchmark cells (shipped layers over real bodies): how much gear the palette clean would delete.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ROOT = '<REPO>/';
const OUTD = '<SCRATCH>/diffrep/';
const S1 = '<MAIN_CHECKOUT>/spikes/api/out/';
const { decodePngBytes } = await import('file:///' + ROOT + 'app/src/lib/image/pngraw.ts');
const { chromaLayer, components, toChroma } = await import('file:///' + ROOT + 'app/src/lib/image/chroma.ts');
const { diffLayer } = await import('file:///' + ROOT + 'app/src/lib/image/diff.ts');
type Img = { w: number; h: number; data: Uint8ClampedArray };
const load = async (p: string): Promise<Img> => decodePngBytes(new Uint8Array(readFileSync(S1 + p)));
const clone = (im: Img): Img => ({ w: im.w, h: im.h, data: new Uint8ClampedArray(im.data) });
const over = (bot: Img, top: Img) => { const o = clone(bot); for (let i = 0; i < o.data.length; i += 4) if (top.data[i + 3] >= 128) o.data.set([top.data[i], top.data[i + 1], top.data[i + 2], 255], i); return o; };
const N = 64, A = (im: Img, p: number) => im.data[p * 4 + 3] >= 128;
const cheb = (a: Img, b: Img, p: number) => Math.max(Math.abs(a.data[p * 4] - b.data[p * 4]), Math.abs(a.data[p * 4 + 1] - b.data[p * 4 + 1]), Math.abs(a.data[p * 4 + 2] - b.data[p * 4 + 2]));
const rgbKey = (im: Img, p: number) => (im.data[p * 4] << 16) | (im.data[p * 4 + 1] << 8) | im.data[p * 4 + 2];
const sum = (im: Img, p: number) => im.data[p * 4] + im.data[p * 4 + 1] + im.data[p * 4 + 2];
const paletteOf = (im: Img) => { const s = new Set<number>(); for (let p = 0; p < im.w * im.h; p++) if (A(im, p)) s.add(rgbKey(im, p)); return s; };

// ---- friend's pipeline ----
const friendDiff = (B: Img, C: Img, t: number) => { const m = new Uint8Array(N * N); for (let p = 0; p < m.length; p++) if (A(C, p) && (!A(B, p) || cheb(B, C, p) > t)) m[p] = 1; return m; };
const relFloor = (m: Uint8Array, frac: number, minAbs = 0) => { const cs = components(m, N, N), big = Math.max(0, ...cs.map((c: number[]) => c.length)), o = new Uint8Array(m.length); for (const c of cs) if (c.length >= Math.max(minAbs, frac * big)) for (const p of c) o[p] = 1; return o; };
const palClean = (m: Uint8Array, C: Img, pal: Set<number>) => m.map((v, p) => (v && (!pal.has(rgbKey(C, p)) || sum(C, p) < 150) ? 1 : 0));
const nearPal = (pal: Set<number>, r: number, g: number, b: number, tol: number) => { for (const v of pal) if (Math.max(Math.abs((v >> 16) - r), Math.abs(((v >> 8) & 255) - g), Math.abs((v & 255) - b)) <= tol) return true; return false; };
const palCleanTol = (m: Uint8Array, C: Img, pal: Set<number>, tol: number) => m.map((v, p) => (v && (sum(C, p) < 150 || !nearPal(pal, C.data[p * 4], C.data[p * 4 + 1], C.data[p * 4 + 2], tol)) ? 1 : 0));

// ---- scoring ----
type Acc = { tp: number; fp: number; fn: number; n: number };
const acc = (): Acc => ({ tp: 0, fp: 0, fn: 0, n: 0 });
const score = (a: Acc, m: Uint8Array, gt: Uint8Array) => { for (let p = 0; p < m.length; p++) { if (m[p] && gt[p]) a.tp++; else if (m[p]) a.fp++; else if (gt[p]) a.fn++; } a.n++; };
const prf = (a: Acc) => { const P = a.tp / (a.tp + a.fp || 1), R = a.tp / (a.tp + a.fn || 1); return { P: +P.toFixed(3), R: +R.toFixed(3), F1: +((2 * P * R) / (P + R || 1)).toFixed(3), FPcell: +(a.fp / a.n).toFixed(1), FNcell: +(a.fn / a.n).toFixed(1) }; };

// ---- Part A data (same donors/rects as spikes/api/s2_x3b.mjs) ----
const SK = JSON.parse(readFileSync(S1 + 'e4_anim/walk_skeletons.json', 'utf8'));
const cl = (x0: number, y0: number, x1: number, y1: number) => { x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(64, Math.ceil(x1)); y1 = Math.min(64, Math.ceil(y1)); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const HEAD = ['NOSE', 'LEFT EYE', 'RIGHT EYE', 'LEFT EAR', 'RIGHT EAR'];
const REG: Record<string, (k: any) => { x: number; y: number; w: number; h: number }> = {
  helmet: (k) => { const cx = HEAD.reduce((a, l) => a + k[l][0], 0) / 5; return cl(cx - 12, 0, cx + 12, k.NECK[1] + 2); },
  chest: (k) => { const xs = ['LEFT SHOULDER', 'RIGHT SHOULDER', 'LEFT ELBOW', 'RIGHT ELBOW'].map((l) => k[l][0]); return cl(Math.min(...xs) - 2, k.NECK[1] - 2, Math.max(...xs) + 3, Math.max(k['LEFT HIP'][1], k['RIGHT HIP'][1]) + 3); },
};
const inR = (r: any, p: number) => { const x = p % N, y = (p / N) | 0; return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; };
// skin donors exactly as s2_x3b; chroma donors: the same item's green ea2 run (s2_x1), cells 0-7 south, 8-15 east
const SKIN: any = { south: { helmet: ['chest_south__ea2', 'chest'], default: ['helmet_south__ea2', 'helmet'] }, east: { helmet: ['helmet_east__to2', 'helmet'], default: ['helmet_east__ea2', 'helmet'] } };
const KEYD: any = { helmet: 'chest', default: 'helmet' };
const FULL = { x: 0, y: 0, w: 64, h: 64 };
const methods = ['F t0', 'F t8', 'F t18', 'F t32', 'F t0 +clean', 'F t8 +clean', 'F t18 +clean', 'F t32 +clean', 'F t18 +clean(no5%)', 'F t18 +clean tol8', 'F t18 +clean tol18', 'F t32 +clean tol8', 'F t32 +clean tol18', 'diffLayer (prod fallback, full region)', 'chroma (prod chromaLayer)', 'chroma +clean', 'chroma +5% rule', 'chroma +15% rule', 'chroma +dark(sum<150) adj'];
const all: Record<string, Acc> = {}, byItem: Record<string, Record<string, Acc>> = {};
const add = (name: string, item: string, m: Uint8Array, gt: Uint8Array) => { score((all[name] ??= acc()), m, gt); score(((byItem[item] ??= {})[name] ??= acc()), m, gt); };
// drift stats + clean diagnostics
let bodyPx = 0, exact = 0, w8 = 0, w18 = 0, keyBody = 0, keyExact = 0;
const cleanDiag = { fpBefore: 0, fpRemoved: 0, fpRemovedTol8: 0, tpBefore: 0, tpRemoved: 0, gtInPal: 0, gtTot: 0, gtEqBase: 0 };
const chromaCleanDiag = { tpRemoved: 0, tp: 0 };
for (const item of ['helmet', 'chest', 'boots', 'cape', 'sword']) for (const d of ['south', 'east']) {
  const [srun, sitem] = SKIN[d][item] || SKIN[d].default, kitem = KEYD[item] || KEYD.default;
  for (let i = 0; i < 8; i++) {
    const j = i + (d === 'east' ? 8 : 0), k = SK[`${d}_${i}`];
    const B = await load(`e2_anim/walk_${d}_${i}.png`), L = await load(`s2_x1/${item}_green_ea2.layer${j}.png`);
    const Ds = await load(`e4_anim/${srun}.out${i}.png`), Dk = await load(`s2_x1/${kitem}_green_ea2.out${j}.png`);
    const rs = REG[sitem](k), rk = REG[kitem](k), K0 = toChroma(B, 'green');
    const Bd = clone(B), Kd = clone(K0);
    for (let p = 0; p < N * N; p++) {
      if (!A(B, p)) continue;
      if (!inR(rs, p) && A(Ds, p)) { Bd.data.set(Ds.data.subarray(p * 4, p * 4 + 4), p * 4); bodyPx++; const c = cheb(B, Ds, p); if (c === 0) exact++; if (c <= 8) w8++; if (c <= 18) w18++; }
      if (!inR(rk, p) && A(Dk, p)) { Kd.data.set(Dk.data.subarray(p * 4, p * 4 + 4), p * 4); keyBody++; if (cheb(K0, Dk, p) === 0) keyExact++; }
    }
    const C = over(Bd, L), KC = over(Kd, L), gt = new Uint8Array(N * N), pal = paletteOf(B);
    for (let p = 0; p < N * N; p++) if (A(L, p)) { gt[p] = 1; cleanDiag.gtTot++; if (A(B, p) && cheb(B, L, p) === 0) cleanDiag.gtEqBase++; if (pal.has(rgbKey(L, p)) && sum(L, p) >= 150) cleanDiag.gtInPal++; }
    for (const t of [0, 8, 18, 32]) {
      const m = relFloor(friendDiff(B, C, t), 0.05), mc = palClean(m, C, pal);
      add(`F t${t}`, item, m, gt); add(`F t${t} +clean`, item, mc, gt);
      if (t === 18 || t === 32) for (const tol of [8, 18]) add(`F t${t} +clean tol${tol}`, item, palCleanTol(m, C, pal, tol), gt);
      if (t === 18) {
        add('F t18 +clean(no5%)', item, palClean(friendDiff(B, C, t), C, pal), gt);
        const palArr = [...pal].map((v) => [v >> 16, (v >> 8) & 255, v & 255]);
        for (let p = 0; p < m.length; p++) {
          if (!m[p]) continue;
          if (gt[p]) { cleanDiag.tpBefore++; if (!mc[p]) cleanDiag.tpRemoved++; continue; }
          cleanDiag.fpBefore++; if (!mc[p]) cleanDiag.fpRemoved++;
          const r = C.data[p * 4], g = C.data[p * 4 + 1], b = C.data[p * 4 + 2];
          if (sum(C, p) >= 150 && palArr.some((q) => Math.max(Math.abs(q[0] - r), Math.abs(q[1] - g), Math.abs(q[2] - b)) <= 8)) cleanDiag.fpRemovedTol8++;
        }
      }
    }
    add('diffLayer (prod fallback, full region)', item, diffLayer(B, C, FULL).mask, gt);
    const ch = chromaLayer(KC, 'green', B).mask;
    add('chroma (prod chromaLayer)', item, ch, gt);
    const chc = palClean(ch, KC, pal); add('chroma +clean', item, chc, gt);
    for (let p = 0; p < ch.length; p++) if (ch[p] && gt[p]) { chromaCleanDiag.tp++; if (!chc[p]) chromaCleanDiag.tpRemoved++; }
    add('chroma +5% rule', item, relFloor(ch, 0.05), gt);
    add('chroma +15% rule', item, relFloor(ch, 0.15, 4), gt);
    const dk = new Uint8Array(ch);
    for (let p = 0; p < N * N; p++) { if (ch[p] || !A(KC, p) || sum(KC, p) >= 150) continue; const x = p % N, y = (p / N) | 0; let adj = false; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < N && Y < N && ch[Y * N + X]) adj = true; } if (adj) dk[p] = 1; }
    add('chroma +dark(sum<150) adj', item, dk, gt);
  }
}
const tabA = methods.map((m) => ({ method: m, ...prf(all[m]) }));
console.log('Part A: 80 cells, real drift. Skin drift: body px', bodyPx, 'exact', (exact / bodyPx).toFixed(3), '<=8', (w8 / bodyPx).toFixed(3), '<=18', (w18 / bodyPx).toFixed(3), '| key drift exact', (keyExact / keyBody).toFixed(3));
console.table(tabA);
const itemF1 = Object.fromEntries(Object.entries(byItem).map(([it, t]) => [it, Object.fromEntries(['F t18', 'F t18 +clean', 'F t32', 'F t32 +clean tol8', 'F t32 +clean tol18', 'diffLayer (prod fallback, full region)', 'chroma (prod chromaLayer)', 'chroma +clean'].map((m) => [m, prf(t[m]).F1]))]));
console.table(itemF1);
console.log('clean diag (F t18):', cleanDiag, 'chroma clean:', chromaCleanDiag);

// ---- Part B: 627 real benchmark cells ----
const { runPipe } = await import('file:///' + ROOT + 'docs/research/2026-11-07-paperdoll-cycle/scripts/extraction/bench-replay.ts');
const cases = JSON.parse(readFileSync(ROOT + 'app/test/fixtures/bench/cases.json', 'utf8')).filter((c: any) => !c.role && c.key !== 'none');
const rowsB: any[] = []; let tot = { cells: 0, item: 0, onBody: 0, inPal: 0, inPalLight: 0, inPalDarkKept: 0, tol8: 0, tol18: 0 };
for (const c of cases) {
  const run = await runPipe(c), cells = [...run.kf, ...run.cells];
  const r = { case: c.id, cells: cells.length, item: 0, onBody: 0, deleted: 0, darkKept: 0, tol8: 0, tol18: 0 };
  for (const x of cells) {
    const pal = paletteOf(x.base), L = x.layer;
    for (let p = 0; p < L.w * L.h; p++) {
      if (L.data[p * 4 + 3] < 128) continue;
      r.item++; if (x.base.data[p * 4 + 3]) r.onBody++;
      if (pal.has(rgbKey(L, p))) { if (sum(L, p) >= 150) r.deleted++; else r.darkKept++; }
      if (sum(L, p) >= 150) { const R = L.data[p * 4], G = L.data[p * 4 + 1], Bl = L.data[p * 4 + 2]; if (nearPal(pal, R, G, Bl, 8)) r.tol8++; if (nearPal(pal, R, G, Bl, 18)) r.tol18++; }
    }
  }
  tot.cells += r.cells; tot.item += r.item; tot.onBody += r.onBody; tot.inPalLight += r.deleted; tot.inPalDarkKept += r.darkKept; tot.tol8 += r.tol8; tot.tol18 += r.tol18;
  rowsB.push({ ...r, tol8Share: +(r.tol8 / Math.max(1, r.item)).toFixed(3), tol18Share: +(r.tol18 / Math.max(1, r.item)).toFixed(3) });
}
console.log('Part B: friend clean on 627 shipped layers vs their real base cells (exact base-palette px with RGB sum >= 150 are deleted)');
console.table(rowsB); console.log(tot, 'exact share', (tot.inPalLight / tot.item).toFixed(4), 'tol8', (tot.tol8 / tot.item).toFixed(3), 'tol18', (tot.tol18 / tot.item).toFixed(3));
mkdirSync(OUTD, { recursive: true });
writeFileSync(OUTD + 'diffrep.json', JSON.stringify({ tabA, itemF1, cleanDiag, chromaCleanDiag, drift: { bodyPx, exact, w8, w18, keyBody, keyExact }, rowsB, tot }, null, 1));
