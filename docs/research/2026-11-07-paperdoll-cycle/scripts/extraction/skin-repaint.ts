// G2 repainted-skin blind spot. The provider repaints part of the keyed mannequin in skin tones; the px are off-key, so they
// are extracted as equipment and G2 (which skips item px) cannot see them.
//  Part 1 (synthetic, owners known): repaint sweeps of growing area on body A south rest (and a dark-skinned copy), in three
//    color models: the body's own palette at that px, a generic skin ramp, and a generic ramp shifted toward the body's tone.
//    Valid-gear controls: bracers in the exact body RGB, tan leather, a brown leather belt. Each item also has a red cap.
//    Scored through production extractCell (keyframe) and the posed path (extractCell posed + sizeFloor against the keyframe).
//  Part 2 (detector): body-palette check = item px inside the base silhouette whose RGB is within TOL (Chebyshev) of a color of
//    the frozen base's own opaque palette, minus colors the item design legitimately shares. "Design" is approximated two ways:
//    (a) none excluded; (b) colors that also occur on item px OFF the base silhouette in the same cell (gear extends past the body;
//    a repaint cannot). Reported per case as flagged px.
//    Variant (c) "skin": the palette is restricted to warm, saturated body colors (r > g > b, max - min >= 24), so a steel or
//    gray body color (shorts, outlines) cannot flag gear; scored at tol 24 with the off-body exclusion as `skin24x`.
//  Part 3 (real corpus): the same detector on all 627 benchmark cells, to measure how often valid real gear would be flagged.
import { readFileSync } from 'node:fs';
import { toChroma } from '../../../../../app/src/lib/image/chroma.ts';
import { extractCell, g2Fails, GATES, sizeFloor, type CellOut } from '../../../../../app/src/lib/items/items.ts';
import { runPipe } from './bench-replay.ts';
import { baseCell, clone, FIX, makeImg, save, saveJson, set, zoom, type Img } from './lib.ts';

const TOLS = [0, 12, 24];
const palette = (B: Img) => { const s: number[][] = [], seen = new Set<string>(); for (let p = 0; p < B.w * B.h; p++) { const i = p * 4; if (!B.data[i + 3]) continue; const k = `${B.data[i]},${B.data[i + 1]},${B.data[i + 2]}`; if (!seen.has(k)) { seen.add(k); s.push([B.data[i], B.data[i + 1], B.data[i + 2]]); } } return s; };
const near = (pal: number[][], r: number, g: number, b: number, tol: number) => pal.some((c) => Math.max(Math.abs(c[0] - r), Math.abs(c[1] - g), Math.abs(c[2] - b)) <= tol);
/** Body-palette detector on a shipped cell. Returns flagged px for each tolerance, without and with the off-body design exclusion. */
export function bodyPaletteFlags(c: Pick<CellOut, 'base' | 'layer' | 'mask'>) {
  const pal = palette(c.base), { w, h } = c.base, out: Record<string, number> = {};
  for (const tol of TOLS) {
    const offBody = new Set<string>();
    for (let p = 0; p < w * h; p++) if (c.mask[p] && !c.base.data[p * 4 + 3]) offBody.add([...c.layer.data.subarray(p * 4, p * 4 + 3)].join());
    let all = 0, excl = 0;
    for (let p = 0; p < w * h; p++) {
      const i = p * 4; if (!c.mask[p] || !c.base.data[i + 3]) continue;
      const [r, g, b] = [c.layer.data[i], c.layer.data[i + 1], c.layer.data[i + 2]];
      if (!near(pal, r, g, b, tol)) continue;
      all++;
      if (!offBody.has(`${r},${g},${b}`)) excl++;
    }
    out[`tol${tol}`] = all; out[`tol${tol}x`] = excl;
  }
  const skin = pal.filter(([r, g, b]) => r > g && g > b && r - b >= 24), offBody = new Set<string>();
  for (let p = 0; p < w * h; p++) if (c.mask[p] && !c.base.data[p * 4 + 3]) offBody.add([...c.layer.data.subarray(p * 4, p * 4 + 3)].join());
  let s24 = 0;
  for (let p = 0; p < w * h; p++) { const i = p * 4; if (c.mask[p] && c.base.data[i + 3] && near(skin, c.layer.data[i], c.layer.data[i + 1], c.layer.data[i + 2], 24) && !offBody.has([...c.layer.data.subarray(i, i + 3)].join())) s24++; }
  out.skin24x = s24;
  return out;
}

if (import.meta.main) {
  const A = await baseCell('A', 'south', 'rest'), W = A.w, H = A.h;
  const dark = clone(A); for (let i = 0; i < dark.data.length; i += 4) for (let j = 0; j < 3; j++) dark.data[i + j] = Math.round(dark.data[i + j] * 0.42);
  const lumOf = (d: Uint8ClampedArray, i: number) => (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
  const GENERIC = [[236, 188, 150], [214, 162, 124], [186, 130, 98], [150, 98, 72]];
  // regions in growth order: face, hands, forearms, upper arms, chest; only base px that are not dark outlines
  const regions: [string, (x: number, y: number) => boolean][] = [
    ['face 4', (x, y) => y === 21 && x >= 30 && x <= 33],
    ['face', (x, y) => y >= 19 && y <= 24 && x >= 29 && x <= 34],
    ['face+hands', (x, y) => (y >= 19 && y <= 24 && x >= 29 && x <= 34) || (y >= 44 && y <= 48 && (x <= 24 || x >= 39))],
    ['face+arms', (x, y) => (y >= 19 && y <= 24 && x >= 29 && x <= 34) || (y >= 33 && y <= 48 && (x <= 25 || x >= 38))],
    ['face+arms+chest', (x, y) => (y >= 19 && y <= 24 && x >= 29 && x <= 34) || (y >= 29 && y <= 48 && (x <= 25 || x >= 38)) || (y >= 30 && y <= 38 && x >= 28 && x <= 35)],
  ];
  type Kind = 'repaint-body-palette' | 'repaint-generic' | 'repaint-toned' | 'gear-bracer-exact' | 'gear-tan-leather' | 'gear-brown-belt';
  const rows: Record<string, unknown>[] = [];
  const sheet: Img[] = [];
  for (const [bodyName, B] of [['light', A], ['dark', dark]] as [string, Img][]) {
    const pal = palette(B), lo = Math.min(...pal.map((c) => c[0] + c[1] + c[2])), hi = Math.max(...pal.map((c) => c[0] + c[1] + c[2]));
    void lo; void hi;
    const skinBody = (x: number, y: number) => { const i = (y * W + x) * 4; return B.data[i + 3] > 0 && (A.data[i] + A.data[i + 1] + A.data[i + 2]) / 3 >= 60; };
    const cases: { kind: Kind; region: string; f: (x: number, y: number) => boolean }[] = [];
    for (const [name, f] of regions) for (const kind of ['repaint-body-palette', 'repaint-generic', 'repaint-toned'] as Kind[]) cases.push({ kind, region: name, f });
    cases.push({ kind: 'gear-bracer-exact', region: 'forearms', f: (x, y) => y >= 43 && y <= 47 && (x <= 24 || x >= 39) });
    cases.push({ kind: 'gear-tan-leather', region: 'forearms', f: (x, y) => y >= 43 && y <= 47 && (x <= 24 || x >= 39) });
    cases.push({ kind: 'gear-brown-belt', region: 'waist', f: (x, y) => y >= 41 && y <= 43 && x >= 22 && x <= 41 });
    for (const cs of cases) {
      const C = toChroma(B, 'green'), truthItem = new Uint8Array(W * H), repaint = new Uint8Array(W * H);
      for (let y = 15; y <= 18; y++) for (let x = 27; x <= 36; x++) { set(C, x, y, [150, 34, 38]); truthItem[y * W + x] = 1; } // red cap (half off the head)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!cs.f(x, y) || !skinBody(x, y)) continue;
        const i = (y * W + x) * 4, l = lumOf(A.data, i), shade = GENERIC[Math.min(3, Math.floor((1 - l) * 4))];
        let rgb: number[];
        if (cs.kind === 'repaint-body-palette' || cs.kind === 'gear-bracer-exact') rgb = [...B.data.subarray(i, i + 3)];
        else if (cs.kind === 'repaint-generic') rgb = shade;
        else if (cs.kind === 'repaint-toned') rgb = shade.map((v, j) => Math.round(0.5 * v + 0.5 * B.data[i + j]));
        else if (cs.kind === 'gear-tan-leather') rgb = [[205, 160, 112], [176, 128, 86], [140, 98, 64]][Math.min(2, Math.floor((1 - l) * 3))];
        else rgb = [[112, 72, 40], [86, 54, 30]][y % 2];
        set(C, x, y, rgb);
        (cs.kind.startsWith('gear') ? truthItem : repaint)[y * W + x] = 1;
      }
      const n = repaint.reduce((a, b) => a + b, 0), gear = truthItem.reduce((a, b) => a + b, 0), band = { x: 0, y: 0, w: 1e3, h: H };
      const k = extractCell({ key: 'rest/south/0', call: 0, base: B, out: C, route: 'green', band });
      const p = extractCell({ key: 'walk/south/0', call: 1, base: B, out: C, route: 'green', band, posed: true });
      sizeFloor([p], { south: k.layer });
      let survK = 0, survP = 0, gearK = 0;
      for (let q = 0; q < W * H; q++) { if (repaint[q] && k.mask[q]) survK++; if (repaint[q] && p.mask[q]) survP++; if (truthItem[q] && k.mask[q]) gearK++; }
      const det = bodyPaletteFlags(k);
      // detector precision against the known owners at tol 24 with exclusion
      let tp = 0, fp = 0; const pl = palette(B);
      const offBody = new Set<string>(); for (let q = 0; q < W * H; q++) if (k.mask[q] && !B.data[q * 4 + 3]) offBody.add([...k.layer.data.subarray(q * 4, q * 4 + 3)].join());
      for (let q = 0; q < W * H; q++) { const i = q * 4; if (!k.mask[q] || !B.data[i + 3]) continue; const c = [k.layer.data[i], k.layer.data[i + 1], k.layer.data[i + 2]]; if (!near(pl, c[0], c[1], c[2], 24) || offBody.has(c.join())) continue; if (repaint[q]) tp++; else fp++; }
      rows.push({ body: bodyName, kind: cs.kind, region: cs.region, repaintPx: n, survivesKeyframe: survK, survivesPosed: survP, gearPx: gear, gearKept: gearK, G2: `${k.keyKept?.toFixed(3)} ${g2Fails(k) ? 'FAIL' : 'pass'}`, G3: (k.keyOutside ?? 0) > GATES.keyOutside ? 'FAIL' : 'pass', ...det, 'tol24x TP/FP': `${tp}/${fp}` });
      if (bodyName === 'light' && (cs.region === 'face+arms' || cs.kind.startsWith('gear'))) sheet.push(C, k.layer);
    }
  }
  console.log('Synthetic: tolN = item px on the body within N of the body palette; tolNx = after excluding colors the item also has off the body');
  console.table(rows);
  const S = makeImg(W * 2, H * (sheet.length / 2));
  sheet.forEach((im, j) => { const r = (j / 2) | 0, col = j % 2; for (let y = 0; y < H; y++) S.data.set(im.data.subarray(y * W * 4, (y + 1) * W * 4), ((r * H + y) * S.w + col * W) * 4); });
  await save('skin-repaint-sheet.png', zoom(S, 4));

  // Part 3: real corpus false-flag rate
  const cases = JSON.parse(readFileSync(new URL('cases.json', FIX), 'utf8')).filter((c: { role?: string; key: string }) => !c.role && c.key !== 'none');
  const real: Record<string, unknown>[] = [];
  let cellsFlagged = 0, skinFlagged = 0, cells = 0;
  for (const c of cases) {
    const run = await runPipe(c), acc: Record<string, number> = {}; let worst = 0, worstKey = '', onBody = 0;
    for (const x of [...run.kf, ...run.cells]) {
      cells++;
      const f = bodyPaletteFlags(x); for (const [k, v] of Object.entries(f)) acc[k] = (acc[k] ?? 0) + v;
      for (let p = 0; p < x.mask.length; p++) if (x.mask[p] && x.base.data[p * 4 + 3]) onBody++;
      if (f.tol24x >= 12) cellsFlagged++;
      if (f.skin24x >= 12) skinFlagged++;
      if (f.tol24x > worst) { worst = f.tol24x; worstKey = x.key; }
    }
    real.push({ case: c.id, itemPxOnBody: onBody, ...acc, worstCellTol24x: `${worst} ${worstKey}` });
  }
  console.log(`Real corpus: ${cellsFlagged} of ${cells} cells have >= 12 flagged px at tol 24 with the off-body exclusion; skin-only palette: ${skinFlagged}`);
  console.table(real);
  saveJson('skin-repaint.json', { synthetic: rows, real, cellsFlagged, skinFlagged, cells });
}
