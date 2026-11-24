// Free check: does the managed benchmark's registered south/east art equal the Lab's c27man references (after padding)?
import "./env.mts";
import { fixture } from "./arms.mts";
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
const key = process.env.PIXELLAB_API_KEY_AGENT_DEV!;
const ch = await (
  await fetch(
    "https://api.pixellab.ai/v2/characters/f69d3f89-043e-4e04-b904-dd97871c5d06",
    { headers: { Authorization: "Bearer " + key } },
  )
).json();
const fx = fixture("c27man");
for (const d of ["south", "east"] as const) {
  const reg = await decodePngBytes(
    new Uint8Array(await (await fetch(ch.rotation_urls[d])).arrayBuffer()),
  );
  const loc = await decodePngBytes(
    new Uint8Array(Buffer.from(fx.references[d]!.png, "base64")),
  );
  const ox = (loc.w - reg.w) / 2,
    oy = (loc.h - reg.h) / 2;
  let best = { diff: Infinity, dx: 0, dy: 0 };
  for (let dy = -12; dy <= 12; dy++)
    for (let dx = -12; dx <= 12; dx++) {
      let diff = 0;
      for (let y = 0; y < loc.h; y++)
        for (let x = 0; x < loc.w; x++) {
          const rx = x - ox - dx,
            ry = y - oy - dy,
            li = (y * loc.w + x) * 4;
          const ra =
            rx >= 0 && ry >= 0 && rx < reg.w && ry < reg.h
              ? reg.data[(ry * reg.w + rx) * 4 + 3]
              : 0;
          const la = loc.data[li + 3];
          if (ra > 127 !== la > 127) diff++;
          else if (la > 127) {
            const ri = (ry * reg.w + rx) * 4;
            if (
              Math.abs(reg.data[ri] - loc.data[li]) +
                Math.abs(reg.data[ri + 1] - loc.data[li + 1]) +
                Math.abs(reg.data[ri + 2] - loc.data[li + 2]) >
              12
            )
              diff++;
          }
        }
      if (diff < best.diff) best = { diff, dx, dy };
    }
  console.log(
    d,
    "registered",
    reg.w + "x" + reg.h,
    "local",
    loc.w + "x" + loc.h,
    "best mismatch px",
    best.diff,
    "at offset",
    best.dx,
    best.dy,
  );
}
console.log(
  "animations",
  ch.animation_count,
  JSON.stringify(ch.skeletons ? Object.keys(ch.skeletons) : []),
);
