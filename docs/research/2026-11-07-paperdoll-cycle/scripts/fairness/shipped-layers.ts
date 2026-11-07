// Free: synthetic thin items (belt, black strap, necklace, baldric) through the production extractor on bodies A and N recolored
// light, medium and deep, with no redraw, a fully redrawn rim and a half-redrawn outline. Prints kept item px / item px and false px.
// Run from the repo root: node docs/research/2026-11-07-paperdoll-cycle/scripts/fairness/shipped-layers.ts
const R = new URL('../../../../../', import.meta.url).href;
const { toChroma } = await import(R + 'app/src/lib/image/chroma.ts');
const { extractCell, bandOf } = await import(R + 'app/src/lib/items/items.ts');
const { baseCell, clone } = await import(R + 'docs/research/2026-11-07-paperdoll-cycle/scripts/extraction/lib.ts');
const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
const isSkin = (c) => c[0] > c[1] && c[1] > c[2] && c[0] - c[2] >= 40;
function skin(B, light, dark) { if (!light) return B; const o = clone(B), ls = [];
  for (let i = 0; i < B.data.length; i += 4) if (B.data[i + 3] && isSkin(B.data.subarray(i, i + 3))) ls.push(lum(B.data.subarray(i, i + 3)));
  const lo = Math.min(...ls), hi = Math.max(...ls);
  for (let i = 0; i < B.data.length; i += 4) if (B.data[i + 3] && isSkin(B.data.subarray(i, i + 3))) { const t = (lum(B.data.subarray(i, i + 3)) - lo) / (hi - lo || 1); o.data.set([0, 1, 2].map((j) => Math.round(dark[j] + t * (light[j] - dark[j]))), i); }
  return o; }
const SKINS = { light: [null, null], medium: [[196, 136, 98], [112, 68, 48]], deep: [[124, 80, 56], [48, 28, 22]] };
const hash = (p) => ((p * 2654435761) >>> 0) / 4294967296, BROWN = [112, 72, 40], SILVER = [178, 180, 192], BLACK = [40, 34, 36];
const out = [];
for (const bodyId of ['A', 'N']) {
  const B0 = await baseCell(bodyId, 'south', 'rest'), W = B0.w, H = B0.h, s = W / 64, cx = Math.round(W / 2), half = Math.round(10 * s);
  const op = (x, y) => B0.data[(y * W + x) * 4 + 3] > 0, outlinePx = (p) => Math.max(B0.data[p * 4], B0.data[p * 4 + 1], B0.data[p * 4 + 2]) < 40;
  const ring = (p) => { const x = p % W, y = (p / W) | 0; return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([X, Y]) => X < 0 || Y < 0 || X >= W || Y >= H || !B0.data[(Y * W + X) * 4 + 3]); };
  const items = {
    belt: (pt) => { const y = Math.round(38 * s); for (let x = cx - half; x <= cx + half; x++) if (op(x, y)) pt(x, y, BROWN); },
    strap: (pt) => { const y = Math.round(40 * s); for (let x = cx - half; x <= cx + half; x++) if (op(x, y)) pt(x, y, BLACK); },
    necklace: (pt) => { const y = Math.round(28 * s); for (let x = cx - Math.round(6 * s); x <= cx + Math.round(5 * s); x++) if (op(x, y)) pt(x, y, SILVER); },
    baldric: (pt) => { for (let i = 0; i <= Math.round(14 * s); i++) pt(cx - Math.round(8 * s) + i, Math.round(30 * s) + i, BROWN); },
  };
  for (const [sk, [light, dark]] of Object.entries(SKINS)) {
    const B = skin(B0, light, dark); let kept = 0, truth = 0, fp = 0;
    for (const frac of [0, 1, 0.5]) for (const paint of Object.values(items)) {
      const C = toChroma(B, 'green'), item = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) { if (!B.data[p * 4 + 3] || hash(p) >= frac) continue; if (frac === 1 && ring(p)) C.data.set([48, 46, 11, 255], p * 4); if (frac === 0.5 && !ring(p) && outlinePx(p)) C.data.set([48, 46, 11, 255], p * 4); }
      paint((x, y, c) => { C.data.set([...c, 255], (y * W + x) * 4); item[y * W + x] = 1; });
      const r = extractCell({ key: 'rest/south/0', call: 0, base: B, out: C, route: 'green', band: { x: 0, y: 0, w: W, h: H } });
      for (let p = 0; p < W * H; p++) { const on = r.layer.data[p * 4 + 3] > 0; if (item[p]) { truth++; if (on) kept++; } else if (on) fp++; }
    }
    out.push(`${bodyId} ${sk}: ${kept}/${truth} fp ${fp}`);
  }
}
console.log(out.join('\n'));
