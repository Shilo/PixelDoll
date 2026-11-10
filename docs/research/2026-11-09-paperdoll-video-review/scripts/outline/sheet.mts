// 6x review sheet: per row (one cell) columns = raw output, baseline layer over body, variant layer over body, variant layer
// alone on gray, raw output with marks (magenta = baseline-lost px still lost, yellow = recovered/added px).
type Img = { w: number; h: number; data: Uint8ClampedArray };
export function zoomMark(rows: { out: Img; lb: Img; lv: Img; layerOnly: Img; lost: number[]; added: number[] }[], s = 6): Img {
  const w = rows[0].out.w, h = rows[0].out.h, gap = 4, cols = 5, W = cols * (w * s + gap), H = rows.length * (h * s + gap);
  const o: Img = { w: W, h: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let i = 0; i < W * H; i++) o.data.set([90, 90, 100, 255], i * 4);
  const blit = (im: Img, ri: number, ci: number, mark?: Map<number, number[]>, bg?: number[]) => {
    for (let y = 0; y < h * s; y++) for (let x = 0; x < w * s; x++) {
      const p = ((y / s) | 0) * w + ((x / s) | 0), i = p * 4, X = ci * (w * s + gap) + x, Y = ri * (h * s + gap) + y, j = (Y * W + X) * 4;
      const m = mark?.get(p), edge = x % s === 0 || y % s === 0 || x % s === s - 1 || y % s === s - 1;
      if (m && edge) { o.data.set([...m, 255], j); continue; }
      if (im.data[i + 3]) o.data.set([im.data[i], im.data[i + 1], im.data[i + 2], 255], j);
      else if (bg) o.data.set([...bg, 255], j);
    }
  };
  rows.forEach((r, ri) => {
    const mk = new Map<number, number[]>();
    for (const p of r.lost) mk.set(p, [255, 0, 255]);
    for (const p of r.added) mk.set(p, [255, 230, 0]);
    blit(r.out, ri, 0); blit(r.lb, ri, 1); blit(r.lv, ri, 2); blit(r.layerOnly, ri, 3, undefined, [140, 140, 150]); blit(r.out, ri, 4, mk);
  });
  return o;
}
/** Crop each row to the bounding box of its marks (+pad) and zoom s; columns: raw out, baseline layer over gray, variant layer over gray, marked raw out. */
export function cropMark(rows: { out: Img; lb0: Img; layerOnly: Img; lost: number[]; added: number[] }[], s = 12, pad = 5): Img {
  const boxes = rows.map((r) => { const ps = [...r.lost, ...r.added], w = r.out.w; if (!ps.length) return [0, 0, 1, 1]; const xs = ps.map((p) => p % w), ys = ps.map((p) => (p / w) | 0); return [Math.max(0, Math.min(...xs) - pad), Math.max(0, Math.min(...ys) - pad), Math.min(w, Math.max(...xs) + pad + 1), Math.min(r.out.h, Math.max(...ys) + pad + 1)]; });
  const bw = Math.max(...boxes.map((b) => b[2] - b[0])), bh = Math.max(...boxes.map((b) => b[3] - b[1])), gap = 6, cols = 4, W = cols * (bw * s + gap), H = rows.length * (bh * s + gap);
  const o: Img = { w: W, h: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let i = 0; i < W * H; i++) o.data.set([60, 60, 70, 255], i * 4);
  rows.forEach((r, ri) => {
    const [x0, y0, x1, y1] = boxes[ri], w = r.out.w, mk = new Map<number, number[]>();
    for (const p of r.lost) mk.set(p, [255, 0, 255]); for (const p of r.added) mk.set(p, [255, 230, 0]);
    [r.out, r.lb0, r.layerOnly, r.out].forEach((im, ci) => {
      for (let y = 0; y < (y1 - y0) * s; y++) for (let x = 0; x < (x1 - x0) * s; x++) {
        const p = (y0 + ((y / s) | 0)) * w + x0 + ((x / s) | 0), i = p * 4, j = ((ri * (bh * s + gap) + y) * W + ci * (bw * s + gap) + x) * 4;
        const m = ci === 3 ? mk.get(p) : undefined, e = x % s < 2 || y % s < 2 || x % s >= s - 2 || y % s >= s - 2;
        if (m && e) o.data.set([...m, 255], j);
        else if (im.data[i + 3]) o.data.set([im.data[i], im.data[i + 1], im.data[i + 2], 255], j);
        else o.data.set(ci === 1 || ci === 2 ? [150, 150, 160, 255] : [60, 60, 70, 255], j);
      }
    });
  });
  return o;
}
