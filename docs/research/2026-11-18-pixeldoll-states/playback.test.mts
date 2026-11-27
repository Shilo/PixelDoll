import assert from "node:assert/strict";
import test from "node:test";
import { exportFiles } from "../../../app/src/lib/export/export.ts";
import { walkMove } from "../../../app/src/lib/export/rpg-maker.ts";
import { makeImg } from "../../../app/src/lib/image/png.ts";
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
import { retainMoves } from "../../../app/src/lib/rig/moves.ts";
import { normalize } from "../../../app/src/lib/rig/normalize.ts";
import { composeCell } from "../../../app/src/lib/runtime/paperdoll.js";
import { sampleTimeline } from "../../../app/src/lib/runtime/timeline.js";
import {
  DEFAULT_MOVE,
  DIRECTIONS,
  cellHash,
  playlist,
} from "../../../app/src/lib/rig/rig.ts";
import {
  bodyOnly,
  equipmentFixture,
} from "../../../app/test/unit/equipment-fixture.ts";

async function fixture() {
  const project = await equipmentFixture();
  const { rig, items } = project.manifest;
  const [body, gear] = items;
  const state = {
    id: "pose-crouched",
    cells: 1,
    frames: playlist(1, 100),
    loop: false,
  };
  const move = {
    id: "low-dodge",
    cells: 2,
    frames: playlist(2, 100),
    loop: true,
  };
  const setPixel = async (x: number, y: number, red: number) => {
    const image = makeImg(64, 64);
    image.data.set([red, 20, 30, 255], (y * 64 + x) * 4);
    const hash = await cellHash(image);
    project.images.set(hash, image);
    return hash;
  };
  const reference = await setPixel(9, 21, 100);
  const posture = await setPixel(9, 13, 101);
  const cells = await Promise.all([setPixel(9, 21, 102), setPixel(9, 21, 103)]);
  const fitted = await Promise.all([
    setPixel(9, 13, 104),
    setPixel(9, 13, 105),
  ]);
  const source = {
    south: { route: "skeleton-v3" as const, reference, provenance: [] },
  };
  rig.directions.push({ id: "east" }, { id: "west", mirrorOf: "east" });
  rig.animations.push(state, { ...move, sources: source });
  body.layers[0].cells![state.id] = { south: [reference], east: [reference] };
  gear.layers[0].cells![state.id] = { south: [posture], east: [posture] };
  body.layers[0].cells![move.id] = { south: cells, east: cells };
  gear.layers[0].cells![move.id] = { south: fitted, east: fitted };
  gear.coverage!.push(
    `${state.id}/south/0`,
    `${move.id}/south/0`,
    `${move.id}/south/1`,
  );
  return { project, state, move, reference };
}

test("the canonical player samples a still and an animated clip through the same compositor", async () => {
  const { project, state, move } = await fixture();
  const outfit = project.manifest.presets[0].items;
  for (const direction of ["south", "west"] as const) {
    const x = direction === "south" ? 9 : 54;
    const sample = (clip: typeof state, time: number, y: number) =>
      composeCell(
        project,
        outfit,
        clip.id,
        direction,
        sampleTimeline(clip.frames, time, clip.loop),
      ).data[(y * 64 + x) * 4];
    assert.equal(sample(state, 0, 21), 100);
    assert.equal(sample(state, 10000, 13), 101);
    assert.equal(sample(move, 0, 21), 102);
    assert.equal(sample(move, 100, 21), 103);
    assert.equal(sample(move, 0, 13), 104);
    assert.equal(sample(move, 100, 13), 105);
  }
});

test("finished move art and exported strips survive pruning a source pose", async () => {
  const { project, state, move, reference } = await fixture();
  const { rig, presets } = project.manifest;
  const frame = () =>
    composeCell(project, presets[0].items, move.id, "south", 1).data;
  const original = frame();
  const build = () =>
    exportFiles(project, { engines: ["generic"], baked: true });
  const strips = (entries: Awaited<ReturnType<typeof build>>["entries"]) =>
    entries.filter(
      ({ name }) =>
        name.startsWith("generic/") && name.includes(`/${move.id}_`),
    );
  const before = await build();
  assert.deepEqual(before.errors, []);
  assert.ok(strips(before.entries).length > 0);
  const keep = new Set(
    rig.animations.map(({ id }) => id).filter((id) => id !== state.id),
  );
  project.manifest = await retainMoves(project.manifest, keep);
  assert.notEqual(project.manifest.rig.baseHash, rig.baseHash);
  assert.ok(
    project.manifest.items.every(
      (item) => item.baseHash === project.manifest.rig.baseHash,
    ),
  );
  // Force a dangling authoring reference to prove the renderer only needs the saved move cells.
  project.images.delete(reference);
  assert.deepEqual(frame(), original);
  const { entries, errors } = await build();
  assert.deepEqual(errors, []);
  assert.deepEqual(strips(entries), strips(before.entries));
  const sheet = entries.find(
    ({ name }) => name === `generic/hat_main/${move.id}_south_strip2.png`,
  );
  assert.ok(sheet?.data instanceof Uint8Array);
  const image = await decodePngBytes(sheet.data);
  assert.equal(image.w, 128);
  assert.equal(image.data[(13 * image.w + 64 + 9) * 4], 105);
  assert.equal(
    entries.some(({ name }) => name.includes(state.id)),
    false,
  );
});

test("a public clip ID carrying a walk word currently interferes with RPG Maker gait selection", () => {
  const standing = {
    id: DEFAULT_MOVE,
    cells: 1,
    frames: playlist(1, 100),
    loop: false,
  };
  const state = { ...standing, id: "pose-walk-ready" };
  const gait = { id: "walk", cells: 3, frames: playlist(3, 100), loop: true };
  assert.equal(walkMove({ animations: [standing, state, gait] })?.id, state.id);
});

test("default normalization moves source pixels when its target canvas grows", () => {
  const art = makeImg(48, 48);
  art.data.set([255, 20, 30, 255], 0);
  assert.deepEqual(normalize(art, 64, 64).offset, [8, 12]);
  assert.deepEqual(normalize(art, 80, 80).offset, [16, 28]);
});

test("eight-facing artwork exports as four rows in each RPG Maker format", async () => {
  const project = bodyOnly(await equipmentFixture());
  const { rig, items } = project.manifest;
  const layer = items[0].layers[0];
  const cell = layer.cells!.rest.south;
  rig.directions = DIRECTIONS.map((id) => ({ id }));
  rig.animations[0].id = DEFAULT_MOVE;
  layer.cells = {
    [DEFAULT_MOVE]: Object.fromEntries(
      DIRECTIONS.map((direction) => [direction, cell]),
    ),
  };
  for (const [engine, columns] of [
    ["rpgmaker", 3],
    ["rpgmakerxp", 4],
  ] as const) {
    const { entries, errors } = await exportFiles(project, {
      engines: [engine],
      baked: true,
    });
    assert.deepEqual(errors, []);
    const sheet = entries.find(
      ({ name }) => !name.includes("/") && name.endsWith(".png"),
    );
    assert.ok(sheet?.data instanceof Uint8Array);
    const { w, h, data } = await decodePngBytes(sheet.data);
    assert.equal(w % columns, 0);
    assert.equal(h % 4, 0);
    const rowCounts = Array.from({ length: 4 }, () => 0);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (data[(y * w + x) * 4 + 3]) rowCounts[Math.floor(y / (h / 4))]++;
    assert.deepEqual(rowCounts, Array(4).fill(columns));
  }
});
