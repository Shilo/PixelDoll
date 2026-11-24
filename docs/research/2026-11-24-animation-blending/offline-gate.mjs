// Run from app/: node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs
import { readFileSync } from "node:fs";
import { runBench } from "../../../app/scripts/bench.ts";
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";

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

function components(pixels, size) {
  const unseen = new Set(pixels);
  const parts = [];
  for (const first of unseen) {
    const part = [first];
    unseen.delete(first);
    for (const pixel of part) {
      const x = pixel % size;
      const neighbors = [pixel - size, pixel + size];
      if (x) neighbors.push(pixel - 1);
      if (x + 1 < size) neighbors.push(pixel + 1);
      for (const next of neighbors) if (unseen.delete(next)) part.push(next);
    }
    parts.push(part);
  }
  return parts;
}

function pose(pixels, size, points, mirror, fallback) {
  const pointsFor = (part) =>
    points
      ?.filter(({ label }) => label.endsWith(" " + part))
      .map(({ x, y }) => ({ x: (mirror ? 1 - x : x) * size, y: y * size })) ??
    [];
  const hips = pointsFor("HIP");
  const [x, y] = hips.length
    ? ["x", "y"].map(
        (axis) => hips.reduce((sum, hip) => sum + hip[axis], 0) / hips.length,
      )
    : fallback;
  const waist = Math.round(y);
  const feet = pointsFor("LEG");
  const below = [...pixels].filter((pixel) => pixel >= waist * size);
  const footDistance = (pixel, foot) =>
    Math.hypot(
      (pixel % size) + 0.5 - foot.x,
      Math.floor(pixel / size) + 0.5 - foot.y,
    );
  const seeds = feet.length
    ? feet.map((foot) =>
        below.reduce(
          (best, p) =>
            footDistance(p, foot) < footDistance(best, foot) ? p : best,
          below[0],
        ),
      )
    : below.filter(
        (p) => Math.floor(p / size) === Math.floor(below.at(-1) / size),
      );
  const removed = new Set(
    components(below, size)
      .filter((part) => seeds.some((p) => part.includes(p)))
      .flat(),
  );
  const upper = new Set(
    components(
      [...pixels].filter((p) => !removed.has(p)),
      size,
    )
      .filter((part) => part.length >= 40)
      .flat(),
  );
  const lower = new Set(below);
  return { x, y, waist, upper, lower };
}

function compare(walk, action, size, gear, expected) {
  const range = Math.round(size / 8);
  const extent = (pixels, row, center, dx = 0) => {
    const xs = [];
    for (
      let x = Math.round(center) - range;
      x <= Math.round(center) + range;
      x++
    )
      if (x - dx >= 0 && x - dx < size && pixels.has(row * size + x - dx))
        xs.push(x);
    return xs.length ? [xs[0], xs.at(-1)] : null;
  };
  const bottom = extent(walk.lower, walk.waist, walk.x);
  const step = (dx, dy) => {
    const top = extent(action.upper, walk.waist - 1 - dy, walk.x, dx);
    return top && bottom
      ? Math.abs(top[0] - bottom[0]) + Math.abs(top[1] - bottom[1])
      : Infinity;
  };
  const initial = expected ?? [
    Math.round(walk.x - action.x),
    Math.round(walk.y - action.y),
  ];
  let fitted = [0, 0];
  let best = Infinity;
  // Lab search and tie-break. No use of fitted data from other characters.
  for (let dx = -5; dx <= 5; dx++)
    for (let dy = -5; dy <= 5; dy++) {
      const score = step(dx, dy) + 0.02 * (Math.abs(dx) + Math.abs(dy));
      if (score < best) {
        best = score;
        fitted = [dx, dy];
      }
    }
  const miss = Math.max(
    ...initial.map((value, axis) => Math.abs(value - fitted[axis])),
  );
  const [dx, dy] = miss > 1 ? fitted : initial;
  const out = new Set(walk.lower);
  for (const p of action.upper) {
    const x = (p % size) + dx;
    const y = Math.floor(p / size) + dy;
    if (x >= 0 && x < size && y >= 0 && y < size) out.add(y * size + x);
  }
  const parts = components(out, size).sort((a, b) => b.length - a.length);
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
    miss,
    initialStep: step(...initial),
    fittedStep: step(...fitted),
    fallbackStep: step(dx, dy),
    fragments: Math.max(0, parts.length - 1),
    detachedPixels: parts.slice(1).reduce((sum, part) => sum + part.length, 0),
    gearLoss,
    gearClippedInLab,
  };
}

function print(label, pairs) {
  const maxima = Object.fromEntries(
    Object.keys(pairs[0]).map((key) => [
      key,
      Math.max(...pairs.map((pair) => pair[key])),
    ]),
  );
  console.log(
    label,
    pairs.length,
    "pairs",
    pairs.filter(({ miss }) => miss > 1).length,
    "offset misses > 1 px",
    maxima,
  );
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
  const allPairs = [];
  for (const { id, mirrorOf } of rig.directions) {
    const source = mirrorOf ?? id;
    const make = (clip, i) =>
      pose(
        occupied(
          image,
          size,
          rows.indexOf(source),
          cols.indexOf(clip.id + "/" + i),
          !!mirrorOf,
        ),
        size,
        clip.sources[source].measured?.[i] ?? clip.sources[source].keypoints[i],
        !!mirrorOf,
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
    const pairs = [];
    for (let w = 0; w < walk.cells; w++)
      for (let a = 0; a < (slash ?? walk).cells; a++)
        pairs.push(
          compare(make(walk, w), make(slash ?? walk, a), size, gear(w, a)),
        );
    print("body" + body + " " + id, pairs);
    allPairs.push(...pairs);
  }
  print(
    "body" + body + (slash ? " actual" : " Walk/Walk diagnostic only"),
    allPairs,
  );
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
const demoPairs = [];
for (const [w, [wy, wl, wr]] of walking.entries())
  for (const [a, [ay, al, ar]] of punching.entries())
    demoPairs.push(
      compare(
        pose(occupied(demoWalk, 64, 0, w), 64, null, false, [
          (wl + wr) / 2,
          wy,
        ]),
        pose(occupied(demoAttack, 64, 0, a), 64, null, false, [
          (al + ar) / 2,
          ay,
        ]),
        64,
        demoGear.map((sheet) => ({
          pixels: occupied(sheet, 64, 0, a),
          width: 64,
          pad: 0,
          lower: false,
        })),
        [Math.round((wl + wr - al - ar) / 2), wy - ay],
      ),
    );
print("demo south, manual targets (no keypoints)", demoPairs);
