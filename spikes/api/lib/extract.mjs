// Extraction variants compared in E6. Each returns a mask; `extractAll` returns layers + metrics per variant.
import { growInto, maskNovel2, maskNovel, maskExact, maskThreshold, maskHysteresis, filterComponents, closeChanged, layerFrom, metrics } from './diff.mjs';

const inRect = (r) => (p, w) => { const x = p % w, y = (p / w) | 0; return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h; };
const clip = (m, w, r) => { if (!r) return m; const f = inRect(r), o = new Uint8Array(m.length); for (let p = 0; p < m.length; p++) if (m[p] && f(p, w)) o[p] = 1; return o; };

export const VARIANTS = {
  exact: (B, C) => maskExact(B, C),
  thr8: (B, C) => maskThreshold(B, C, { t: 8, ta: 16 }),
  thr18: (B, C) => maskThreshold(B, C, { t: 18, ta: 16 }),
  thr32: (B, C) => maskThreshold(B, C, { t: 32, ta: 16 }),
  hyst40_8: (B, C) => maskHysteresis(B, C, { hi: 40, lo: 8 }),
  thr18_cc: (B, C) => filterComponents(maskThreshold(B, C), B.w, B.h, { minArea: 6 }).mask,
  thr18_regioncc: (B, C, r) => filterComponents(maskThreshold(B, C), B.w, B.h, { minArea: 3, region: r }).mask,
  hyst_regioncc_close: (B, C, r) => closeChanged(filterComponents(maskHysteresis(B, C), B.w, B.h, { minArea: 3, region: r }).mask, B, C),
  novel: (B, C) => maskNovel(B, C),
  novel_cc: (B, C, r) => filterComponents(maskNovel(B, C), B.w, B.h, { minArea: 3, region: r }).mask,
  slot_novel_cc: (B, C, r) => clip(filterComponents(maskNovel(B, C), B.w, B.h, { minArea: 3, region: r }).mask, B.w, r),
  slot_novel2_cc: (B, C, r) => filterComponents(maskNovel2(B, C, r), B.w, B.h, { minArea: 3, region: r }).mask,
  slot_novel2_grow1: (B, C, r) => clip(growInto(filterComponents(maskNovel2(B, C, r), B.w, B.h, { minArea: 3, region: r }).mask, B, C, { steps: 1 }), B.w, r),
  slot_novel2_grow2: (B, C, r) => clip(growInto(filterComponents(maskNovel2(B, C, r), B.w, B.h, { minArea: 3, region: r }).mask, B, C, { steps: 2 }), B.w, r),
  // ponytail: area-ratio heuristic picks novel2 (clean) unless it ate >25% of the novel_cc layer (item colours overlap skin, e.g. leather) — upgrade to per-item colour classes if this misfires.
  auto: (B, C, r) => { const a = VARIANTS.slot_novel_cc(B, C, r), b = VARIANTS.slot_novel2_grow1(B, C, r), n = m => m.reduce((x, y) => x + y, 0); return n(b) >= 0.75 * n(a) ? b : a; },
  // slot mask: only accept changes inside the slot rect, tolerance snap 18 (PM/R1 recommendation)
  slot_thr18: (B, C, r) => clip(maskThreshold(B, C), B.w, r),
  slot_hyst_cc: (B, C, r) => clip(filterComponents(maskHysteresis(B, C), B.w, B.h, { minArea: 3, region: r }).mask, B.w, r),
};

export function extractAll(B, C, region, names = Object.keys(VARIANTS)) {
  const out = {};
  for (const n of names) {
    const mask = VARIANTS[n](B, C, region);
    out[n] = { mask, layer: layerFrom(C, mask), m: metrics(B, C, mask, { region }) };
  }
  return out;
}
