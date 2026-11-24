// x32: compare native92 vs up184-then-downscale item layers (0 gens). Writes metrics.json and montages.
// usage: node --experimental-transform-types --no-warnings compare.mts [items] [seed] [dirs]
process.env.C25_RUN ??= "x32";
const L = await import("../x31/lib.mts");
const palette = await import(
  new URL("../../../app/src/lib/dress/palette.ts", import.meta.url).href
);
const {
  items,
  rig,
  slotOf,
  skel,
  bodyFrames,
  standingLayers,
  save,
  OUT,
  blank,
  blit,
} = L;
import fs from "node:fs";
import path from "node:path";

const ids = process.argv[2] ? process.argv[2].split(",") : L.ITEMS.slice(0, 2);
const seed = +(process.argv[3] ?? 7);
const dirs = (process.argv[4]?.split(",") ?? [
  "south",
  "east",
  "north",
]) as L.Dir[];
const W = rig.cell.w,
  H = rig.cell.h,
  route = "green",
  OUTDIR = path.join(OUT, "res");

const mask = (im: L.Img) => {
  const m = new Uint8Array(im.w * im.h);
  for (let p = 0; p < m.length; p++) m[p] = im.data[p * 4 + 3] ? 1 : 0;
  return m;
};
const count = (m: Uint8Array) => m.reduce((s, v) => s + v, 0);
const iou = (a: Uint8Array, b: Uint8Array) => {
  let i = 0,
    u = 0;
  for (let p = 0; p < a.length; p++) {
    if (a[p] && b[p]) i++;
    if (a[p] || b[p]) u++;
  }
  return u ? i / u : 1;
};
/** Boundary px with exactly one opaque 4-neighbour: a 1 px spur. */
const spurs = (m: Uint8Array, w: number, h: number) => {
  let n = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (!m[p]) continue;
      let k = 0;
      if (x > 0 && m[p - 1]) k++;
      if (x < w - 1 && m[p + 1]) k++;
      if (y > 0 && m[p - w]) k++;
      if (y < h - 1 && m[p + w]) k++;
      if (k === 1) n++;
    }
  return n;
};
const scale = (im: L.Img, f: number) => {
  const o = blank(im.w * f, im.h * f);
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) {
          const s = (y * im.w + x) * 4;
          o.data.set(
            im.data.subarray(s, s + 4),
            ((y * f + dy) * o.w + x * f + dx) * 4,
          );
        }
  return o;
};
const over = (dst: L.Img, src: L.Img) => {
  for (let p = 0; p < dst.w * dst.h; p++)
    if (src.data[p * 4 + 3])
      dst.data.set(src.data.subarray(p * 4, p * 4 + 4), p * 4);
  return dst;
};
/** A 3x montage: row 1 native, row 2 up184→92, each frame recomposed on the real body frame. */
const montage = async (
  id: string,
  d: L.Dir,
  body: L.Img[],
  nat: L.Img[],
  up: L.Img[],
) => {
  const f = 3,
    gap = 3;
  const cw = W * f,
    ch = H * f,
    g = blank(6 * cw + 5 * gap, 2 * ch + gap);
  const put = (im: L.Img, i: number, row: number) =>
    blit(
      g,
      scale(over(scale(body[i], f), scale(im, f)), 1),
      i * (cw + gap),
      row * (ch + gap),
    );
  nat.forEach((im, i) => put(im, i, 0));
  up.forEach((im, i) => put(im, i, 1));
  await save(path.join(OUTDIR, `cmp.${id}.s${seed}.${d}.png`), g);
  return g;
};

const metrics: any[] = [];
for (const id of ids) {
  const slot = slotOf(id);
  for (const d of dirs) {
    const keys = Array.from({ length: 6 }, (_, i) => `walk/${d}/${i}`);
    const fl = (arm: string, suffix = "") =>
      keys.map((_, i) =>
        path.join(OUTDIR, `${arm}.${id}.s${seed}.${d}${suffix}.${i}.png`),
      );
    const natFiles = fl("native92"),
      upFiles = fl("up184", ".down");
    if (
      !natFiles.every((f) => fs.existsSync(f)) ||
      !upFiles.every((f) => fs.existsSync(f))
    ) {
      console.log(`skip ${id} ${d}: missing outputs`);
      continue;
    }
    const nat = await Promise.all(natFiles.map((f) => L.load(f)));
    const upl = await Promise.all(upFiles.map((f) => L.load(f)));
    const body = await bodyFrames("walk", d);
    const stand = await standingLayers(id, d);
    const colors = palette.colorCounts(stand);
    const ref = colors.size <= 256 ? [...colors.keys()] : [];
    const extract = (ims: L.Img[]) =>
      ims.map((im, i) =>
        items.extractCell({
          key: keys[i],
          call: 0,
          base: body[i],
          out: im,
          route,
          band: items.bandOf(slot, skel(keys[i]), H),
          posed: true,
          clip: slot.band,
          held: false,
          pad: 0,
        }),
      );
    const ca = extract(nat),
      cb = extract(upl);
    // fair comparison: the app's own postProcess (speck/pinhole cleanup, outline recovery) runs on both arms.
    items.postProcess(rig, slot, ca, { [d]: stand } as any, 0);
    items.postProcess(rig, slot, cb, { [d]: stand } as any, 0);
    const a = ca.map((c) => c.layer),
      b = cb.map((c) => c.layer),
      ma = a.map(mask),
      mb = b.map(mask);
    for (let i = 0; i < 6; i++)
      metrics.push({
        id,
        dir: d,
        frame: i,
        native: {
          area: count(ma[i]),
          spurs: spurs(ma[i], W, H),
          paletteDist: +items.paletteDistance(ref, [a[i]]).toFixed(2),
        },
        up: {
          area: count(mb[i]),
          spurs: spurs(mb[i], W, H),
          paletteDist: +items.paletteDistance(ref, [b[i]]).toFixed(2),
        },
        iouNativeUp: +iou(ma[i], mb[i]).toFixed(3),
      });
    await montage(id, d, body, a, b);
  }
}
fs.writeFileSync(
  path.join(OUTDIR, "compare.json"),
  JSON.stringify(metrics, null, 1),
);
const sum = (k: "native" | "up", key: string) =>
  metrics.reduce((s, m) => s + m[k][key], 0);
console.log(
  JSON.stringify(
    {
      units: metrics.length,
      native: {
        area: sum("native", "area"),
        spurs: sum("native", "spurs"),
        paletteDist: +(sum("native", "paletteDist") / metrics.length).toFixed(
          2,
        ),
      },
      up: {
        area: sum("up", "area"),
        spurs: sum("up", "spurs"),
        paletteDist: +(sum("up", "paletteDist") / metrics.length).toFixed(2),
      },
      meanIoU: +(
        metrics.reduce((s, m) => s + m.iouNativeUp, 0) / metrics.length
      ).toFixed(3),
    },
    null,
    1,
  ),
);
