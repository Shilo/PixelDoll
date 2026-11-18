import { readFileSync, writeFileSync } from "node:fs";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import { FACINGS, PROFILES, renderProbe } from "./universal.mjs";

const source = new URL(
  "../2026-11-16-mounts/evidence/mount-live-east-raw-strip.png",
  import.meta.url,
);
const before = readFileSync(source);
const strip = await decodePngBytes(before);
const rider = { w: 64, h: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
for (let row = 0; row < 64; row++)
  rider.data.set(
    strip.data.subarray(row * strip.w * 4, row * strip.w * 4 + 256),
    row * 256,
  );
const sprite =
  "data:image/png;base64," +
  Buffer.from(await encodePngBytes(rider)).toString("base64");
const geometry = readFileSync(
  new URL("./geometry.mjs", import.meta.url),
  "utf8",
).replace(/^export /gm, "");
const model = readFileSync(new URL("./universal.mjs", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(/^export /gm, "");
const template = readFileSync(
  new URL("./universal-template.html", import.meta.url),
  "utf8",
);
const fragment = template
  .replace("__MODEL__", geometry + "\n" + model)
  .replace("__SPRITE__", JSON.stringify(sprite));
if (fragment.includes("__MODEL__") || fragment.includes("__SPRITE__"))
  throw new Error("Unresolved prototype placeholders");
writeFileSync(
  new URL("./universal-rider.html", import.meta.url),
  '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reusable riding pose probe</title></head><body>' +
    fragment +
    "</body></html>",
);
const colors = {
  foreground: "#dedede",
  border: "#555555",
  secondary: "#333333",
  "muted-foreground": "#999999",
  "chart-1": "#c8b68b",
  "chart-2": "#b7cedb",
};
const styles = (
  template.match(
    /#universal-rider \.(?:ground|body|head|mount-leg|neck|limb|far-limb|torso|rider-head|rein|saddle|seat|grip)\b[^{}]*\{[^{}]*\}/g,
  ) ?? []
)
  .join("\n")
  .replaceAll("#universal-rider ", "")
  .replace(
    /var\(--([a-z0-9-]+)\)/g,
    (_, name: string) => colors[name as keyof typeof colors],
  );
const tiles = FACINGS.flatMap((facing, row) =>
  PROFILES.map((mount, column) => {
    const result = renderProbe({ facing, mountId: mount.id, wide: true });
    return (
      '<text x="' +
      (column * 232 + 8) +
      '" y="' +
      (row * 180 + 20) +
      '" fill="#dedede" font-size="13">' +
      facing +
      " / " +
      mount.id +
      "</text>" +
      '<text x="' +
      (column * 232 + 8) +
      '" y="' +
      (row * 180 + 35) +
      '" fill="#dedede" font-size="11">Radius proxy: ' +
      (result.state.probe.clears ? "pass" : "FAIL") +
      "</text>" +
      result.svg.replace(
        "<svg ",
        '<svg x="' +
          column * 232 +
          '" y="' +
          (row * 180 + 36) +
          '" width="232" height="144" ',
      )
    );
  }),
).join("");
writeFileSync(
  new URL("./evidence/universal-directions.svg", import.meta.url),
  '<svg xmlns="http://www.w3.org/2000/svg" id="universal-rider" width="696" height="1440" viewBox="0 0 696 1440"><style>' +
    styles +
    '</style><rect width="696" height="1440" fill="#1c1c1c"/>' +
    tiles +
    "</svg>",
);
if (!before.equals(readFileSync(source)))
  throw new Error("Source fixture changed");
console.log(
  "Built isolated reusable-pose prototype. No API access or source-art changes.",
);
