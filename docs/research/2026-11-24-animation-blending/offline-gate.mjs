// Run from app/: node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { runBench } from "../../../app/scripts/bench.ts";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import {
  actionHip,
  actionComponents,
  actionPairFallback,
  compositeAction,
  flipH,
  layerOffset,
  splitLower,
  splitUpper,
} from "../../../app/src/lib/runtime/paperdoll.js";

const bench = new URL("../../../app/test/fixtures/bench/", import.meta.url);
const demo = new URL("../../../app/public/fixtures/s2/", import.meta.url);
const json = (root, path) =>
  JSON.parse(readFileSync(new URL(path, root), "utf8"));
const png = (root, path) => decodePngBytes(readFileSync(new URL(path, root)));
const occupied = (image, size, row, col, mirror = false) => {
  const pixels = new Set();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (image.data[((row * size + y) * image.w + col * size + x) * 4 + 3])
        pixels.add((mirror ? size - 1 - x : x) + y * size);
  return pixels;
};

function pose(image, size, row, col, mirror, geometry) {
  const frame = {
    w: size,
    h: size,
    data: new Uint8ClampedArray(size * size * 4),
  };
  for (let y = 0; y < size; y++) {
    const start = ((row * size + y) * image.w + col * size) * 4;
    frame.data.set(image.data.subarray(start, start + size * 4), y * size * 4);
  }
  return { image: mirror ? flipH(frame) : frame, geometry };
}

function compare(walk, action, size, gear, w, a) {
  const lower = splitLower(walk.image, walk.geometry);
  const upper = splitUpper(action.image, action.geometry);
  const { x: dx, y: dy, seam, source } = layerOffset(lower, upper);
  const output = compositeAction(lower.image, upper.image, { x: dx, y: dy });
  const parts = actionComponents(occupied(output, size, 0, 0), size);
  let gearLoss = 0;
  let gearClippedInLab = 0;
  for (const { pixels, width, pad, lower } of gear) {
    for (const p of pixels) {
      const x = (p % width) + (lower ? 0 : dx);
      const y = Math.floor(p / width) + (lower ? 0 : dy);
      if (lower && y < walk.waist + pad) gearLoss++;
      else if (x < 0 || x >= width || y < 0 || y >= width) gearClippedInLab++;
    }
  }
  return {
    w,
    a,
    dx,
    dy,
    seam,
    source,
    gearLoss: gearLoss + gearClippedInLab,
    fragments: Math.max(0, parts.length - 1),
    output,
    fallback: actionPairFallback(seam, gearLoss + gearClippedInLab),
  };
}

function print(label, pairs, geometry = []) {
  const seams = pairs.map((p) => p.seam).sort((a, b) => a - b);
  const count = (keys) =>
    Object.fromEntries(
      [...new Set(keys)].map((key) => [
        key,
        keys.filter((other) => key === other).length,
      ]),
    );
  const worst = pairs.reduce((max, pair) =>
    pair.seam > max.seam ? pair : max,
  );
  console.log(label, {
    anchors:
      geometry.filter((p) => p?.source === "anchor").length +
      "/" +
      geometry.length,
    worst: worst.seam,
    median:
      (seams[Math.floor((seams.length - 1) / 2)] +
        seams[Math.floor(seams.length / 2)]) /
      2,
    worstPair: [worst.w, worst.a],
    worstOffset: [worst.dx, worst.dy],
    sources: count(pairs.map((p) => p.source)),
    gearLoss: Math.max(...pairs.map((p) => p.gearLoss)),
    fragments: Math.max(...pairs.map((p) => p.fragments)),
    eligible: pairs
      .filter((p) => !p.fallback)
      .map((p) => `${p.w}/${p.a}`)
      .join(" "),
    fallback: count(pairs.map((p) => p.fallback).filter(Boolean)),
  });
}

async function sheet(pairs, width, height) {
  const size = pairs[0].output.w,
    tile = size * 4;
  const image = {
    w: width * tile,
    h: height * tile,
    data: new Uint8ClampedArray(width * height * tile * tile * 4),
  };
  for (const { w, a, output } of pairs)
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const src = (Math.floor(y / 4) * size + Math.floor(x / 4)) * 4;
        const dst = ((w * tile + y) * image.w + a * tile + x) * 4;
        image.data.set(output.data.subarray(src, src + 4), dst);
      }
  return encodePngBytes(image);
}

const { cases, results } = await runBench();
const extracted = new Map(
  results.map(({ id, cells }) => [
    id,
    new Map(cells.map((cell) => [cell.key, cell.layer])),
  ]),
);
for (const body of ["A", "B", "C", "N"]) {
  const { rig, rows, cols } = json(bench, "body" + body + ".json");
  const size = rig.cell.w;
  const image = await png(bench, "body" + body + ".png");
  const walk = rig.animations.find(({ id }) => id === "walk");
  const slash = rig.animations.find(({ id }) => id === "slash");

  for (const { id, mirrorOf } of rig.directions) {
    const source = mirrorOf ?? id;
    const make = (clip, i) =>
      pose(
        image,
        size,
        rows.indexOf(source),
        cols.indexOf(clip.id + "/" + i),
        !!mirrorOf,
        actionHip(rig, clip.id, id, i),
      );
    const lower = Array.from({ length: walk.cells }, (_, i) => make(walk, i));
    const upper = Array.from({ length: (slash ?? walk).cells }, (_, i) =>
      make(slash ?? walk, i),
    );
    const gear = (w, a) =>
      cases
        .filter((entry) => entry.body === body)
        .flatMap(({ id, pad, slot }) => {
          const lower = slot === "feet";
          const frame = lower
            ? "walk/" + source + "/" + w
            : (slash?.id ?? "walk") + "/" + source + "/" + a;
          const piece = extracted.get(id)?.get(frame);
          return piece
            ? [
                {
                  pixels: occupied(piece, piece.w, 0, 0, !!mirrorOf),
                  width: piece.w,
                  pad,
                  lower,
                },
              ]
            : [];
        });
    const pairs = lower.flatMap((walk, w) =>
      upper.map((action, a) => compare(walk, action, size, gear(w, a), w, a)),
    );
    print(
      "body" + body + " " + id + (slash ? "" : " walk/walk"),
      pairs,
      [...lower, ...upper].map((p) => p.geometry),
    );
    if (body === "A")
      writeFileSync(
        new URL(`evidence/20-gate-bodyA-${id}-selected.png`, import.meta.url),
        await sheet(pairs, upper.length, lower.length),
      );
  }
}

const fixture = json(demo, "fixture.json");
const demoWalk = await png(demo, "layers/body/base/main/walk.png");
const demoAttack = await png(demo, "layers/body/base/main/cross-punch.png");
const demoGear = await Promise.all(
  fixture.items
    .filter(({ id }) => id !== "base")
    .flatMap(({ layers }) =>
      layers
        .filter(({ sheets }) => sheets?.["cross-punch"])
        .map(({ sheets }) => png(demo, sheets["cross-punch"])),
    ),
);
const walking = [
  [44, 27, 37],
  [43, 26, 37],
  [43, 27, 37],
  [43, 26, 37],
  [43, 26, 37],
  [43, 26, 37],
  [43, 27, 38],
  [43, 27, 38],
];
const punching = [
  [46, 29, 39],
  [46, 29, 39],
  [46, 28, 38],
  [45, 29, 39],
  [46, 29, 39],
  [46, 27, 37],
];
const manual = ([y, left, right]) => ({
  hip: { x: (left + right) / 2, y },
  feet: [],
  source: "manual",
});
const demoPairs = walking.flatMap((walk, w) =>
  punching.map((attack, a) =>
    compare(
      pose(demoWalk, 64, 0, w, false, manual(walk)),
      pose(demoAttack, 64, 0, a, false, manual(attack)),
      64,
      demoGear.map((sheet) => ({
        pixels: occupied(sheet, 64, 0, a),
        width: 64,
        pad: 0,
        lower: false,
      })),
      w,
      a,
    ),
  ),
);
print(
  "demo south (manual diagnostic)",
  demoPairs,
  [...walking, ...punching].map(manual),
);

writeFileSync(
  new URL("evidence/21-gate-demo-south-selected.png", import.meta.url),
  await sheet(demoPairs, punching.length, walking.length),
);
