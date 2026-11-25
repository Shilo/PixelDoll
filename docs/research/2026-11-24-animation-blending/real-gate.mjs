import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { exportZip } from "../../../app/src/lib/export/export.ts";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import { makeImg } from "../../../app/src/lib/image/png.ts";
import * as rigRuntime from "../../../app/src/lib/runtime/paperdoll.js";
import { renderPresentation } from "../../../app/src/studio/experience/presentation.ts";

const backup = process.argv[2];
assert(backup, "Pass the extracted Library backup directory");
const records = Object.values(
  JSON.parse(readFileSync(join(backup, "backup.json"), "utf8")).characters,
);
const [, { manifest }] = records.find(
  ([, record]) => record.manifest.name === "Bonequin",
);
const images = new Map();
for (const item of manifest.items)
  for (const layer of item.layers)
    for (const directions of Object.values(layer.cells ?? {}))
      for (const cells of Object.values(directions))
        for (const hash of cells)
          if (hash && !images.has(hash))
            images.set(
              hash,
              await decodePngBytes(
                readFileSync(join(backup, "blobs", hash.slice(7))),
              ),
            );
const project = { manifest, images };
const { rig } = manifest;
const outfit = {
  hair: "long_braided_hair",
  torso_inner: "camiseta_rasgada",
  legs: "cal_a_jeans",
  feet: "tenis_velho",
  torso_outer: "plate_carrier",
  main_hand: "faca_de_cozinha",
};
const cells = (clip) => [
  ...new Set(
    rig.animations.find(({ id }) => id === clip).frames.map(({ cell }) => cell),
  ),
];
const sequence = (clip, direction) => ({
  kind: "animation",
  clip,
  direction,
  cell: 0,
  sequence: rig.animations.find(({ id }) => id === clip),
});
const availability = {
  project,
  loading: false,
  complete: (item, clip, direction, cells) =>
    rigRuntime.actionGearComplete(project, item, clip, direction, cells),
};
const render = (direction, walk, attack, items) =>
  renderPresentation(
    availability,
    items,
    sequence("slash", direction),
    attack,
    undefined,
    { pose: sequence("walk", direction), cell: walk, waist: 0 },
  );
const sample = (image, scale) => {
  const output = makeImg(image.w * scale, image.h * scale);
  for (let y = 0; y < output.h; y++)
    for (let x = 0; x < output.w; x++) {
      const input =
        (Math.floor(y / scale) * image.w + Math.floor(x / scale)) * 4;
      const shade = ((Math.floor(x / 12) + Math.floor(y / 12)) % 2) * 10 + 29;
      output.data.set(
        image.data[input + 3]
          ? image.data.subarray(input, input + 4)
          : [shade, shade, shade + 6, 255],
        (y * output.w + x) * 4,
      );
    }
  return output;
};
for (const width of [48, 92, 128, 256])
  console.log(width, rigRuntime.actionSeamLimits(width));
for (const { id: direction } of rig.directions) {
  const fragment = (clip, cell, part) =>
    rigRuntime.actionFragment(project, { clip, direction, cell }, 0, part);
  const lowers = cells("walk").map((cell) => fragment("walk", cell, "lower"));
  const uppers = cells("slash").map((cell) => fragment("slash", cell, "upper"));
  const pairs = lowers.flatMap((lower) =>
    uppers.map((upper) => rigRuntime.layerOffset(lower, upper)),
  );
  const score = rigRuntime.actionSetScore(pairs, rig.cell.w);
  const profile = direction === "east" || direction === "west";
  assert.equal(score.fallback, profile ? "seam" : null);
  assert(pairs.every(({ seam }) => Number.isFinite(seam)));
  if (profile) {
    assert.equal(rigRuntime.actionHip(rig, "walk", direction, 4).hip.y, 47.5);
    assert.equal(lowers[4].waist, 51);
    assert.equal(lowers[4].source, "measured");
  }
  const probes = cells("walk").flatMap((walk) =>
    cells("slash").map((attack) => render(direction, walk, attack, outfit)),
  );
  assert.equal(probes.length, 48);
  for (const probe of probes) {
    assert.equal(probe.attackFallback, score.fallback ?? undefined);
    assert.equal(probe.attackLayered, !profile);
    assert.equal(probe.notice.count, 5);
    assert.deepEqual(
      new Set(probe.hiddenItems.map(({ id }) => id)),
      new Set(Object.values(outfit).filter((id) => id !== outfit.main_hand)),
    );
  }
  console.log(direction, score, {
    noJoin: pairs.filter(({ seam }) => !Number.isFinite(seam)).length,
    layered: probes.filter(({ attackLayered }) => attackLayered).length,
    hidden: probes[0].hiddenItems.map(({ id }) => id),
    walk4: {
      hip: lowers[4].hip,
      row: lowers[4].waist,
      source: lowers[4].source,
    },
  });
  if (score.fallback === null) {
    const shots = [0, 3, 7].map((attack, index) =>
      sample(render(direction, [0, 2, 5][index], attack, outfit).image, 4),
    );
    const sheet = makeImg(
      shots.reduce((width, image) => width + image.w, 0),
      shots[0].h,
    );
    let left = 0;
    for (const shot of shots) {
      rigRuntime.over(sheet, shot, left, 0);
      left += shot.w;
    }
    writeFileSync(
      new URL(`evidence/bonequin-dressed-${direction}-4x.png`, import.meta.url),
      await encodePngBytes(sheet),
    );
  }
}
const options = {
  engines: ["phaser"],
  baked: false,
  exportedAt: "2026-11-24T00:00:00.000Z",
};
const off = await exportZip(project, options);
const on = await exportZip(project, {
  ...options,
  actionLayering: { waist: 0, walk: ["walk"], attacks: ["slash"] },
});
assert.deepEqual(off.errors, []);
assert.deepEqual(on.errors, []);
const exported = JSON.parse(
  new TextDecoder().decode(
    on.entries.find(({ name }) => name === "manifest.json").data,
  ),
);
for (const { id: direction } of rig.directions)
  assert.equal(
    rigRuntime.canExportLayerAction(
      exported,
      outfit,
      "walk",
      direction,
      "slash",
    ),
    direction === "north" || direction === "south",
  );
console.log("Phaser ZIP", {
  off: off.zip.length,
  on: on.zip.length,
  added: on.zip.length - off.zip.length,
  percent: (on.zip.length / off.zip.length - 1) * 100,
});
