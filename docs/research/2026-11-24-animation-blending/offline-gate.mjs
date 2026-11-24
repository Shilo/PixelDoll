// Run from app/: node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { runBench } from "../../../app/scripts/bench.ts";
import { exportZip } from "../../../app/src/lib/export/export.ts";
import { makeImg } from "../../../app/src/lib/image/png.ts";
import { baseHashOf, cellHash } from "../../../app/src/lib/rig/rig.ts";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import {
  actionHip,
  actionComponents,
  actionSetScore,
  compositeAction,
  composeLayeredAction,
  flipH,
  layerOffset,
  over,
  rigFrame,
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
  const { x: dx, y: dy, seam, source, hipDeparture, hipDepartureX } = layerOffset(lower, upper);
  const output = compositeAction(lower.image, upper.image, { x: dx, y: dy });
  const parts = actionComponents(occupied(output, size, 0, 0), size);
  return {
    w,
    a,
    dx,
    dy,
    seam,
    source,
    hipDeparture,
    hipDepartureX,
    gearPixels: gear.reduce((sum, entry) => sum + entry.pixels.size, 0),
    fragments: Math.max(0, parts.length - 1),
    output,
  };
}

function print(label, pairs, geometry = [], actionLoops = false) {
  const score = actionSetScore(pairs.map((pair) => pair.seam));
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
  const walkCells = 1 + Math.max(...pairs.map(({ w }) => w));
  const actionCells = 1 + Math.max(...pairs.map(({ a }) => a));
  const maxFrameChange = (x, y) => Math.max(...pairs.flatMap((pair) => {
    const nextWalk = (pair.w + 1) % walkCells;
    const nextAction = pair.a + 1 < actionCells || actionLoops
      ? (pair.a + 1) % actionCells
      : pair.a;
    return [[nextWalk, pair.a], [pair.w, nextAction], [nextWalk, nextAction]].map(([w, a]) => {
      const next = pairs[w * actionCells + a];
      return Math.max(Math.abs(next[x] - pair[x]), Math.abs(next[y] - pair[y]));
    });
  }));
  console.log(label, {
    anchors:
      geometry.filter((p) => p?.source === "anchor").length +
      "/" +
      geometry.length,
    worst: score.worst,
    median: score.median,
    worstPair: [worst.w, worst.a],
    worstOffset: [worst.dx, worst.dy],
    sources: count(pairs.map((p) => p.source)),
    worstHipDeparture: worst.hipDeparture,
    maxHipDeparture: Math.max(...pairs.map((p) => Math.abs(p.hipDeparture))),
    maxHipDepartureX: Math.max(...pairs.map((p) => Math.abs(p.hipDepartureX))),
    maxFramePlacementChange: maxFrameChange("dx", "dy"),
    maxFrameHipDepartureChange: maxFrameChange("hipDepartureX", "hipDeparture"),
    maxGearPixelsBeforeComposition: Math.max(...pairs.map((p) => p.gearPixels)),
    fragments: Math.max(...pairs.map((p) => p.fragments)),
    verdict: score.fallback ?? "layered",
  });
}

async function sheet(pairs, width, height, zoom = 4) {
  const size = pairs[0].output.w,
    tile = size * zoom;
  const image = {
    w: width * tile,
    h: height * tile,
    data: new Uint8ClampedArray(width * height * tile * tile * 4),
  };
  for (const { w, a, output } of pairs)
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const src = (Math.floor(y / zoom) * size + Math.floor(x / zoom)) * 4;
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
      !slash,
    );
    if (body === "A")
      writeFileSync(
      new URL(`evidence/22-set-gate-bodyA-${id}.png`, import.meta.url),
        await sheet(pairs, upper.length, lower.length),
      );
    if (body === "A" && id === "south") {
      const worst = pairs.reduce((max, pair) => pair.seam > max.seam ? pair : max);
      writeFileSync(
        new URL("evidence/27-south-slash-source-vs-composite-8x.png", import.meta.url),
        await sheet([
          { w: 0, a: 0, output: upper[worst.a].image },
          { w: 0, a: 1, output: worst.output },
        ], 2, 1, 8),
      );
    }
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
  new URL("evidence/23-set-gate-demo-south.png", import.meta.url),
  await sheet(demoPairs, punching.length, walking.length),
);

const bodyA = json(bench, "bodyA.json");
const sourceAtlas = await png(bench, "bodyA.png");
const images = new Map();
const rig = bodyA.rig;
const stored = {};
const trousers = {};
const cape = {};
const alpha = (image, x, y) => image.data[(y * image.w + x) * 4 + 3];
const store = async (image) => {
  const hash = await cellHash(image);
  images.set(hash, image);
  return hash;
};
for (const move of rig.animations) {
  stored[move.id] = {};
  for (const { id } of rig.directions) {
    const row = bodyA.rows.indexOf(id);
    if (row < 0) continue;
    stored[move.id][id] = [];
    if (move.id === "walk") trousers[id] = [];
    if (move.id === "slash") cape[id] = [];
    for (let cell = 0; cell < move.cells; cell++) {
      const geometry = actionHip(rig, move.id, id, cell);
      const { image } = pose(sourceAtlas, 64, row, bodyA.cols.indexOf(`${move.id}/${cell}`), false, geometry);
      stored[move.id][id].push(await store(image));
      const gear = makeImg(64, 64);
      if (move.id === "walk") {
        const part = splitLower(image, geometry);
        for (let y = part.waist - 2; y < 57; y++)
          for (let x = 20; x < 45; x++) {
            const waistband = y < part.waist && Math.abs(x - geometry.hip.x) <= 4 && alpha(image, x, y);
            if (waistband || alpha(part.image, x, y)) gear.data.set([44, 115, 182, 255], (y * 64 + x) * 4);
          }
        trousers[id].push(await store(gear));
      } else {
        for (let y = 36; y < 53; y++)
          for (let x = 17; x < 38; x++) gear.data.set([185, 50, 100, 255], (y * 64 + x) * 4);
        cape[id].push(await store(gear));
      }
    }
  }
}
rig.baseHash = await baseHashOf(rig, Object.fromEntries(Object.entries(stored).flatMap(([move, directions]) =>
  Object.entries(directions).flatMap(([direction, cells]) => cells.map((hash, cell) => [`${move}/${direction}/${cell}`, hash])))));
const item = (id, slot, layers) => ({ id, name: id, slot, layers, baseHash: rig.baseHash, status: "accepted", mirror: "flip", materials: [], prompt: "", provenance: [] });
const project = { images, manifest: {
  format: "pixeldoll/3", app: "test", name: "Bench bodyA with trousers and cape", rig, materials: [], presets: [],
  slots: [{ id: "body", class: "base", z: 10 }, { id: "legs", class: "worn", z: 20 }, { id: "back", class: "worn", z: 10 }],
  items: [item("base", "body", [{ id: "main", role: "fg", z: 10, cells: stored }]),
    item("trousers", "legs", [{ id: "main", role: "fg", z: 20, cells: { walk: trousers } }]),
    item("cape", "back", [{ id: "bg", role: "bg", z: 1, cells: { slash: cape } }, { id: "fg", role: "fg", z: 30, cells: { slash: Object.fromEntries(Object.entries(cape).map(([direction, cells]) => [direction, cells.map(() => stored.slash[direction][0])])) } }])]
} };
const blank = await store(makeImg(64, 64));
for (const direction of Object.keys(cape)) project.manifest.items[2].layers[1].cells.slash[direction].fill(blank);
const walkCell = { clip: "walk", direction: "south", cell: 1 };
const slashCell = { ...walkCell, clip: "slash" };
const dressed = { legs: "trousers", back: "cape" };
const layered = composeLayeredAction(project, dressed, walkCell, slashCell, 0, rigFrame(rig));
if (layered.image) {
const contact = makeImg(layered.frame.w * 3, layered.frame.h);
over(contact, images.get(stored.walk.south[1]), layered.frame.x - rig.pivot.x, layered.frame.y - rig.pivot.y);
over(contact, images.get(stored.slash.south[1]), layered.frame.w + layered.frame.x - rig.pivot.x, layered.frame.y - rig.pivot.y);
over(contact, layered.image, layered.frame.w * 2, 0);
writeFileSync(new URL("evidence/24-bodyA-hands-trousers-cape.png", import.meta.url), await encodePngBytes(contact));
}
const options = { engines: ["phaser"], baked: false, exportedAt: "2026-11-24T00:00:00.000Z" };
const off = await exportZip(project, options);
const on = await exportZip(project, { ...options, actionLayering: { waist: 0, walk: ["walk"], attacks: ["slash"] } });
assert.deepEqual(off.errors, []);
assert.deepEqual(on.errors, []);
assert(off.zip && on.zip);
console.log("bodyA south + synthetic trousers + cape", { verdict: layered.fallback ?? "layered", frame: layered.frame, zipOff: off.zip.length, zipOn: on.zip.length, added: on.zip.length - off.zip.length, newPngs: on.entries.filter(({ name }) => name.startsWith("action/")).map(({ name }) => name) });

for (const size of [64, 128]) {
  const square = makeImg(size, size);
  for (let y = 14; y < size - 10; y++)
    for (let x = size / 2 - 6; x < size / 2 + 6; x++) square.data[(y * size + x) * 4 + 3] = 255;
  const body = project.manifest.items[0];
  const moves = rig.animations.map((move) => ({ ...move, sources: undefined }));
  const actions = Object.fromEntries(moves.map(({ id, cells }) => [id, { south: Array(cells).fill(blank) }]));
  const timedRig = { ...rig, cell: { w: size, h: size }, pivot: { x: size / 2, y: size - 10 }, animations: moves, anchors: { hip: Object.fromEntries(moves.map(({ id, cells }) => [id, { south: Array.from({ length: cells }, () => [size / 2, size / 2]) }])) } };
  const timedManifest = { ...project.manifest, rig: timedRig, items: [{ ...body, layers: [{ ...body.layers[0], cells: actions }] }] };
  const timedProject = { manifest: timedManifest, images: new Map([[blank, square]]) };
  const measure = (index) => composeLayeredAction(timedProject, {}, { ...walkCell, cell: index % 8 }, { ...slashCell, cell: Math.floor(index / 8) % 8 }, 0, rigFrame(timedRig));
  const start = performance.now();
  assert.equal(measure(0).fallback, null);
  const coldMs = performance.now() - start;
  const hotStart = performance.now();
  for (let index = 0; index < 256; index++) assert.equal(measure(index).fallback, null);
  console.log("set cache", { size, coldMs, warmMsPerPaint: (performance.now() - hotStart) / 256 });
}
