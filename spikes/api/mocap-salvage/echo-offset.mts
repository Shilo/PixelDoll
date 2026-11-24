import "./env.mts";
import path from "node:path";
import fs from "node:fs";
import { OUT, load } from "../c25/lib.mts";
const fx = JSON.parse(
  fs.readFileSync(path.join(OUT, "benchmark.json"), "utf8"),
);
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
for (const d of ["south", "east"])
  for (const s of [31, 47]) {
    const echo = await load(
      path.join(OUT, "pilot", `Pmotion_${d}_s${s}.0.png`),
    );
    const ref = await decodePngBytes(
      new Uint8Array(Buffer.from(fx.references[d].png, "base64")),
    );
    let best = { diff: Infinity, x: 0, y: 0 };
    for (let oy = 0; oy <= echo.h - ref.h; oy++)
      for (let ox = 0; ox <= echo.w - ref.w; ox++) {
        let diff = 0;
        for (let y = 0; y < echo.h; y++)
          for (let x = 0; x < echo.w; x++) {
            const rx = x - ox,
              ry = y - oy;
            const ra =
              rx >= 0 && ry >= 0 && rx < ref.w && ry < ref.h
                ? ref.data[(ry * ref.w + rx) * 4 + 3] > 127
                : false;
            if (ra !== echo.data[(y * echo.w + x) * 4 + 3] > 127) diff++;
          }
        if (diff < best.diff) best = { diff, x: ox, y: oy };
      }
    console.log(
      d,
      s,
      "motion canvas",
      echo.w + "x" + echo.h,
      "standing at",
      best.x,
      best.y,
      "mask mismatch",
      best.diff,
    );
  }
