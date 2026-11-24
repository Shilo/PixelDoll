// Offline: build blind review material from stored pilot/confirmation renders. No network, no spending.
// For each case (direction + seed) the arms are shuffled into rows X/Y/Z with a deterministic, case-specific order; the
// key goes to <out>/<set>/key.json, which reviewers never see. Output per case: a 4x labeled strip (PNG) and 4x GIFs.
// Usage: node --experimental-transform-types mocap-salvage/review.mts <set> <arm,arm,...> <case,...>
//   e.g. review.mts pilot M0,A,P south_s31,south_s47,east_s31,east_s47
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import "./env.mts";
import { OUT, load, save } from "../c25/lib.mts";
const require = createRequire(
  path.resolve(import.meta.dirname, "../../../app/package.json"),
);
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

type Img = { w: number; h: number; data: Uint8ClampedArray };
const [set, armsArg, casesArg] = process.argv.slice(2);
const arms = armsArg.split(","),
  cases = casesArg.split(",");
const src = path.join(OUT, set),
  dst = path.join(OUT, set, "blind");
fs.mkdirSync(dst, { recursive: true });
const SCALE = 4,
  GAP = 4,
  BG = [40, 40, 46];
const frames = async (stem: string) => {
  const meta = path.join(src, `${stem}.json`);
  if (!fs.existsSync(meta)) return null;
  const n = JSON.parse(fs.readFileSync(meta, "utf8")).frames;
  return Promise.all(
    Array.from({ length: n }, (_, i) =>
      load(path.join(src, `${stem}.${i}.png`)),
    ),
  );
};
const blank = (w: number, h: number): Img => {
  const im = { w, h, data: new Uint8ClampedArray(w * h * 4) };
  for (let p = 0; p < w * h; p++) im.data.set([...BG, 255], p * 4);
  return im;
};
const blit = (dstImg: Img, s: Img, ox: number, oy: number, scale: number) => {
  for (let y = 0; y < s.h * scale; y++)
    for (let x = 0; x < s.w * scale; x++) {
      const si = (Math.floor(y / scale) * s.w + Math.floor(x / scale)) * 4,
        a = s.data[si + 3] / 255;
      const di = ((oy + y) * dstImg.w + ox + x) * 4;
      if (ox + x >= dstImg.w || oy + y >= dstImg.h) continue;
      for (let c = 0; c < 3; c++)
        dstImg.data[di + c] = Math.round(
          s.data[si + c] * a + dstImg.data[di + c] * (1 - a),
        );
    }
};
// 3x5 digit/letter glyphs for row labels, so reviewers read X/Y/Z on the sheet without a font dependency.
const GLYPH: Record<string, string[]> = {
  X: ["101", "101", "010", "101", "101"],
  Y: ["101", "101", "010", "010", "010"],
  Z: ["111", "001", "010", "100", "111"],
  W: ["101", "101", "101", "111", "101"],
};
const label = (im: Img, ch: string, ox: number, oy: number) => {
  for (const [r, row] of GLYPH[ch].entries())
    for (const [c, bit] of [...row].entries())
      if (bit === "1")
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++)
            im.data.set(
              [230, 230, 230, 255],
              ((oy + r * 4 + y) * im.w + ox + c * 4 + x) * 4,
            );
};
const key: Record<string, Record<string, string>> = fs.existsSync(
  path.join(src, "blind-key.json"),
)
  ? JSON.parse(fs.readFileSync(path.join(src, "blind-key.json"), "utf8"))
  : {};
const letters = ["X", "Y", "Z", "W"];
for (const c of cases) {
  const order = [...arms].sort((a, b) =>
    createHash("sha256")
      .update(set + c + a)
      .digest("hex")
      .localeCompare(
        createHash("sha256")
          .update(set + c + b)
          .digest("hex"),
      ),
  );
  const rows = await Promise.all(order.map((a) => frames(`${a}_${c}`)));
  const present = rows.filter(Boolean) as Img[][];
  if (!present.length) {
    console.log(c, "no renders");
    continue;
  }
  const cell = present[0][0],
    maxN = Math.max(...present.map((r) => r.length));
  const W = 24 + maxN * (cell.w * SCALE + GAP),
    H = rows.length * (cell.h * SCALE + GAP) + GAP;
  const sheet = blank(W, H);
  key[c] = {};
  for (const [r, row] of rows.entries()) {
    const letter = letters[r];
    key[c][letter] = order[r];
    label(sheet, letter, 4, r * (cell.h * SCALE + GAP) + GAP + 8);
    if (!row) continue;
    for (const [i, f] of row.entries())
      blit(
        sheet,
        f,
        24 + i * (cell.w * SCALE + GAP),
        r * (cell.h * SCALE + GAP) + GAP,
        SCALE,
      );
    // GIF at 4x, 100 ms per frame, on the same background, so playback can be judged.
    const gif = GIFEncoder();
    for (const f of row) {
      const big = blank(f.w * SCALE, f.h * SCALE);
      blit(big, f, 0, 0, SCALE);
      const pal = quantize(big.data, 256);
      gif.writeFrame(applyPalette(big.data, pal), big.w, big.h, {
        palette: pal,
        delay: 100,
        repeat: 0,
      });
    }
    gif.finish();
    fs.writeFileSync(path.join(dst, `${c}_${letter}.gif`), gif.bytes());
  }
  await save(path.join(dst, `${c}.png`), sheet);
  console.log(c, "rows", order.length, "frames", maxN);
}
fs.writeFileSync(
  path.join(src, "blind-key.json"),
  JSON.stringify(key, null, 1),
);
