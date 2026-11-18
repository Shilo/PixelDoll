import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import {
  mountView,
  TEST_MOUNT,
} from "../../../app/src/studio/experience/mounts.ts";
import { fitRotation, rotate, reinPoints, distance } from "./geometry.mjs";

const output = new URL("./evidence/", import.meta.url);
mkdirSync(output, { recursive: true });
const strip = await decodePngBytes(
  readFileSync(
    new URL(
      "../2026-11-16-mounts/evidence/mount-live-east-raw-strip.png",
      import.meta.url,
    ),
  ),
);
const enlarged = {
  w: strip.w * 6,
  h: strip.h * 6,
  data: new Uint8ClampedArray(strip.w * strip.h * 36 * 4),
};
for (let row = 0; row < enlarged.h; row++)
  for (let column = 0; column < enlarged.w; column++) {
    const source = (Math.floor(row / 6) * strip.w + Math.floor(column / 6)) * 4;
    enlarged.data.set(
      strip.data.subarray(source, source + 4),
      (row * enlarged.w + column) * 4,
    );
  }
writeFileSync(
  new URL("source-enlarged.png", output),
  await encodePngBytes(enlarged),
);
console.log("Enlarged existing paid Ride strip; no API access.");

type Point = { x: number; y: number };
type Image = { w: number; h: number; data: Uint8ClampedArray };
const hip = { x: 32.5, y: 43.5 };
const hands = [
  { x: 37.5, y: 39.5 },
  { x: 44.5, y: 37.5 },
];
const feet = [
  { x: 33.5, y: 50.5 },
  { x: 40.5, y: 48.5 },
];
const methods = [
  "Upright static Ride",
  "Hip fit, max 15 degrees",
  "Unrestricted hip fit",
  "Upright + reins",
];
const blank = (width: number, height: number): Image => ({
  w: width,
  h: height,
  data: new Uint8ClampedArray(width * height * 4),
});
function pixel(
  image: Image,
  column: number,
  row: number,
  color: ArrayLike<number>,
) {
  if (column >= 0 && row >= 0 && column < image.w && row < image.h)
    image.data.set(Array.from(color), (row * image.w + column) * 4);
}
function line(image: Image, first: Point, second: Point, color: number[]) {
  let column = Math.round(first.x - 0.5);
  let row = Math.round(first.y - 0.5);
  const endColumn = Math.round(second.x - 0.5);
  const endRow = Math.round(second.y - 0.5);
  const horizontal = Math.abs(endColumn - column);
  const vertical = -Math.abs(endRow - row);
  const stepColumn = column < endColumn ? 1 : -1;
  const stepRow = row < endRow ? 1 : -1;
  let error = horizontal + vertical;
  for (;;) {
    pixel(image, column, row, color);
    if (column === endColumn && row === endRow) break;
    const doubled = error * 2;
    if (doubled >= vertical) {
      error += vertical;
      column += stepColumn;
    }
    if (doubled <= horizontal) {
      error += horizontal;
      row += stepRow;
    }
  }
}
function paste(
  destination: Image,
  source: Image,
  offset: Point,
  angle = 0,
  pivot: Point = hip,
) {
  for (let row = 0; row < destination.h; row++)
    for (let column = 0; column < destination.w; column++) {
      const point = rotate(
        { x: column + 0.5 - offset.x, y: row + 0.5 - offset.y },
        pivot,
        -angle,
      );
      const sourceColumn = Math.floor(point.x);
      const sourceRow = Math.floor(point.y);
      if (
        sourceColumn < 0 ||
        sourceRow < 0 ||
        sourceColumn >= source.w ||
        sourceRow >= source.h
      )
        continue;
      const index = (sourceRow * source.w + sourceColumn) * 4;
      if (source.data[index + 3])
        pixel(destination, column, row, source.data.subarray(index, index + 4));
    }
}
function crop(cell: number): Image {
  const image = blank(64, 64);
  for (let row = 0; row < 64; row++) {
    const start = (row * strip.w + cell * 64) * 4;
    image.data.set(strip.data.subarray(start, start + 256), row * 256);
  }
  return image;
}
function flip(image: Image): Image {
  const result = blank(image.w, image.h);
  for (let row = 0; row < image.h; row++)
    for (let column = 0; column < image.w; column++) {
      const start = (row * image.w + column) * 4;
      pixel(
        result,
        image.w - 1 - column,
        row,
        image.data.subarray(start, start + 4),
      );
    }
  return result;
}
function scale(image: Image, factor: number): Image {
  const result = blank(image.w * factor, image.h * factor);
  for (let row = 0; row < result.h; row++)
    for (let column = 0; column < result.w; column++) {
      const start =
        (Math.floor(row / factor) * image.w + Math.floor(column / factor)) * 4;
      pixel(result, column, row, image.data.subarray(start, start + 4));
    }
  return result;
}
const mountResult = mountView(TEST_MOUNT, "east", 34);
if (!mountResult.ok) throw new Error(mountResult.reason);
const images: Record<string, string> = {};
const measurements: unknown[] = [];
const stripBefore = strip.data.slice();
for (let cell = 0; cell < 3; cell++) {
  const rider = crop(cell);
  for (const hand of hands)
    if (
      !rider.data[(Math.floor(hand.y) * rider.w + Math.floor(hand.x)) * 4 + 3]
    )
      throw new Error("Manual hand annotation misses opaque artwork");
  for (let gait = 0; gait < 4; gait++) {
    const mount = mountResult.view.frames[gait];
    const base = { x: 10, y: 35 };
    const seat = { x: base.x + mount.seat.x, y: base.y + mount.seat.y };
    const riderOffset = { x: seat.x - hip.x, y: seat.y - hip.y };
    const bob = mount.seat.y - mountResult.view.frames[0].seat.y;
    const bit = { x: base.x + 45.5, y: base.y + 12.5 + bob };
    const contactTargets = [
      { x: base.x + 38.5, y: base.y + 18.5 + bob },
      { x: base.x + 40.5, y: base.y + 18.5 + bob },
    ];
    const localTargets = contactTargets.map((point) => ({
      x: point.x - riderOffset.x,
      y: point.y - riderOffset.y,
    }));
    const bounded = fitRotation(hands, localTargets, hip, Math.PI / 12);
    const unrestricted = fitRotation(hands, localTargets, hip);
    if (cell === 0)
      measurements.push({
        gait,
        bounded,
        unrestricted,
        boundedFootShift: Math.max(
          ...feet.map((foot) =>
            distance(foot, rotate(foot, hip, bounded.angle)),
          ),
        ),
        maximumFootShift: Math.max(
          ...feet.map((foot) =>
            distance(foot, rotate(foot, hip, unrestricted.angle)),
          ),
        ),
        radialLowerBounds: hands.map((hand, index) =>
          Math.abs(distance(hand, hip) - distance(localTargets[index], hip)),
        ),
      });
    for (let method = 0; method < methods.length; method++) {
      const canvas = blank(90, 104);
      paste(canvas, mount.back, base);
      const mountedHands = hands.map((hand) => ({
        x: hand.x + riderOffset.x,
        y: hand.y + riderOffset.y,
      }));
      const rein = (hand: Point, shade: number[]) => {
        const points = reinPoints(hand, bit, 2);
        for (let index = 1; index < points.length; index++)
          line(canvas, points[index - 1], points[index], shade);
      };
      if (method === 3) rein(mountedHands[1], [72, 49, 34, 255]);
      paste(
        canvas,
        rider,
        riderOffset,
        method === 1 ? bounded.angle : method === 2 ? unrestricted.angle : 0,
      );
      paste(canvas, mount.front, base);
      if (method === 3) rein(mountedHands[0], [174, 121, 68, 255]);
      for (const direction of ["east", "west"]) {
        const image = direction === "west" ? flip(canvas) : canvas;
        const filename = `${direction}-cell-${cell}-gait-${gait}-method-${method}.png`;
        const bytes = await encodePngBytes(image);
        images[filename] = Buffer.from(bytes).toString("base64");
      }
    }
  }
}
if (!stripBefore.every((value, index) => value === strip.data[index]))
  throw new Error("Source mutated");
writeFileSync(
  new URL("measurements.json", output),
  JSON.stringify(
    {
      provenance:
        "Manual illustrative landmarks on existing East raw Ride strip, approximate +/- 2 pixels. West is an explicit reflection, not independent artwork. Contact targets and bit are research-only annotations, not production mount metadata.",
      hip,
      hands,
      feet,
      measurements,
    },
    null,
    2,
  ) + "\n",
);
const sheet = blank(90 * 4, 104 * 3);
for (let cell = 0; cell < 3; cell++)
  for (let method = 0; method < 4; method++) {
    const image = await decodePngBytes(
      Buffer.from(
        images[`east-cell-${cell}-gait-0-method-${method}.png`],
        "base64",
      ),
    );
    paste(sheet, image, { x: method * 90, y: cell * 104 }, 0, { x: 0, y: 0 });
  }
writeFileSync(
  new URL("comparison.png", output),
  await encodePngBytes(scale(sheet, 3)),
);
const dataset = JSON.stringify(images);
const html = `<style>
:root { color-scheme: light dark; }
#rider-spike { display: grid; gap: 12px; color: var(--foreground); font-family: var(--font-sans); }
#rider-spike .controls { display: flex; flex-wrap: wrap; gap: 12px; }
#rider-spike label { display: flex; gap: 6px; align-items: center; }
#rider-spike select, #rider-spike button { font: inherit; min-height: 44px; background: var(--secondary); color: var(--foreground); border: 1px solid var(--border); border-radius: var(--radius); }
#rider-spike .grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 8px; }
#rider-spike figure { margin: 0; min-width: 0; }
#rider-spike figcaption { min-height: 3em; }
#rider-spike img { width: 100%; image-rendering: pixelated; background: var(--secondary); border-radius: var(--radius); }
@media(max-width:500px) { #rider-spike .grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
</style>
<div id="rider-spike">
<div class="controls"><label>Facing <select id="facing"><option value="east">East, real art</option><option value="west">West, mirrored East</option></select></label>
<label>Static source <select id="cell"><option value="0">Ride cell 1</option><option value="1">Ride cell 2</option><option value="2">Ride cell 3</option></select></label>
<label>Mount phase <select id="gait"><option value="0">Level</option><option value="1">Up 1px</option><option value="2">Level again</option><option value="3">Down 1px</option></select></label>
<button id="step" type="button">Step gait</button></div>
<div class="grid">${methods.map((name, index) => `<figure><figcaption>${name}</figcaption><img id="method-${index}" alt="${name}, existing Ride art on schematic mount"></figure>`).join("")}</div>
<span id="detail" role="status"></span></div>
<script>
(() => {
const root = document.getElementById('rider-spike');
const images = ${dataset};
const facing = root.querySelector('#facing'); const cell = root.querySelector('#cell'); const gait = root.querySelector('#gait');
function render() {
for (let method = 0; method < 4; method++) root.querySelector('#method-' + method).src = 'data:image/png;base64,' + images[facing.value + '-cell-' + cell.value + '-gait-' + gait.value + '-method-' + method + '.png'];
root.querySelector('#detail').textContent = 'Static rider; manually annotated contacts. No leg hiding, new generation, or production changes.';
}
for (const control of [facing, cell, gait]) control.addEventListener('change', render);
root.querySelector('#step').addEventListener('click', () => { gait.value = String((Number(gait.value) + 1) % 4); render(); });
render();
})();
</script>`;
writeFileSync(
  new URL("./comparison.html", import.meta.url),
  '<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Static rider comparison</title></head><body>' +
    html +
    "</body></html>",
);
console.log(
  JSON.stringify({
    realRiderCells: 3,
    gaitPhases: 4,
    methods: 4,
    facings: ["east", "mirrored west"],
    images: Object.keys(images).length,
    sourceUnchanged: true,
  }),
);
