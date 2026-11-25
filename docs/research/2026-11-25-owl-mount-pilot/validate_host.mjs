import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { makeImg } from "../../../app/src/lib/image/png.ts";
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
import { PAPERDOLL_JS } from "../../../app/src/lib/export/phaser.ts";
import { exportFiles } from "../../../app/src/lib/export/export.ts";
import { baseHashOf, cellHash } from "../../../app/src/lib/rig/rig.ts";
import { join, dirname } from "node:path";
import { exportManifest } from "../../../app/src/lib/export/generic.ts";
import {
  placeRider,
  riderContact,
} from "../../../app/src/studio/experience/mounts.ts";
import * as studio from "../../../app/src/lib/runtime/paperdoll.js";

const file = (name) => new URL(name, import.meta.url);
const data = JSON.parse(await readFile(file("east-measurements.json"), "utf8"));
const exported = await import(
  "data:text/javascript;base64," + Buffer.from(PAPERDOLL_JS).toString("base64")
);
const size = { w: 128, h: 128 };
const pivot = { x: 64, y: 112 };
const point = ([x, y]) => ({ x, y });
const frame = { ...size, ...pivot };
const png = async (name) => decodePngBytes(await readFile(file(name)));

const timeline = data.track.map(({ ms }, cell) => ({ cell, ms }));
const mountImages = await Promise.all(
  data.track.map(({ image }) => png(image)),
);

async function riderProject(letter, withBoot) {
  const contact = data.riderContacts[letter];
  const facingContacts =
    letter === "b" ? { east: contact, south: [63, 52] } : { east: contact };
  const images = new Map();
  const makeItem = async (id, slot, z, filename) => {
    const cells = {};
    for (const [facing, name] of Object.entries(filename)) {
      const image = await png(name);
      const hash = await cellHash(image);
      images.set(hash, image);
      cells[facing] = [hash];
    }
    return {
      id,
      name: id,
      slot,
      baseHash: "sha256:pilot",
      materials: [],
      provenance: [],
      coverage: Object.keys(cells).map((facing) => "riding/" + facing + "/0"),
      layers: [{ id: "main", role: "fg", z, cells: { riding: cells } }],
    };
  };
  const items = [
    await makeItem("base", "body", 0, {
      east: "east-rider-" + letter + ".png",
      ...(letter === "b" ? { south: "south-rider-b.png" } : {}),
    }),
  ];
  if (withBoot)
    items.push(
      await makeItem("boot", "feet", 1, { east: "east-boot-overlay.png" }),
    );
  const manifest = {
    format: "pixeldoll/3",
    app: "Mount pilot",
    name: "Rider " + letter,
    rig: {
      cell: size,
      pivot,
      baseItem: "base",
      baseHash: "sha256:pilot",
      directions: Object.keys(facingContacts).map((id) => ({ id })),
      animations: [
        {
          id: "riding",
          kind: "state",
          cells: 1,
          loop: true,
          frames: [{ cell: 0, ms: 120 }],
        },
      ],
      anchors: {
        hip: {
          riding: Object.fromEntries(
            Object.entries(facingContacts).map(([id, value]) => [id, [value]]),
          ),
        },
      },
    },
    slots: [
      { id: "body", class: "base", required: true, z: 0 },
      { id: "feet", class: "worn", z: 1 },
    ],
    items,
    presets: [],
    materials: [],
  };
  const bodyHashes = Object.values(items[0].layers[0].cells.riding).flat();
  const baseHash = await baseHashOf(manifest.rig, bodyHashes);
  manifest.rig.baseHash = baseHash;
  for (const item of items) item.baseHash = baseHash;
  return { manifest, images };
}

function drawMounted(rider, back, seat, contact, keepContact) {
  const origin = point(data.mountGround);
  const art = makeImg(size.w, size.h);
  const currentSeat = keepContact ? seat : point(data.track[0].seat);
  const placement = placeRider(origin, contact, {
    ground: origin,
    seat: currentSeat,
  });
  const hostOffset = {
    x: Math.round(currentSeat.x - contact.x),
    y: Math.round(currentSeat.y - contact.y),
  };
  assert.deepEqual(placement.mount, { x: 0, y: 0 });
  assert.deepEqual(placement.rider, hostOffset);
  exported.over(art, back);
  exported.over(art, rider, hostOffset.x, hostOffset.y);
  return art;
}

const choices = [
  { label: "rider-a", letter: "a", items: {} },
  { label: "rider-a-boot", letter: "a", items: { feet: "boot" } },
  { label: "rider-b", letter: "b", items: {} },
];
const byOutfit = new Map();
for (const { label, letter, items } of choices) {
  const project = await riderProject(letter, letter === "a");
  const { manifest } = exportManifest(project, {
    engines: ["phaser"],
    baked: false,
  });
  assert.deepEqual(manifest.rig.anchors, project.manifest.rig.anchors);
  const contact = riderContact(
    project.manifest.rig,
    frame,
    "riding",
    "east",
    0,
    point(data.mountGround),
    40,
  );
  assert.equal(contact.source, "hip");
  const canonicalRider = studio.composeCell(
    project,
    items,
    "riding",
    "east",
    0,
  );
  const exportedRider = exported.composeCell(
    project,
    items,
    "riding",
    "east",
    0,
  );
  assert.deepEqual(exportedRider, canonicalRider);
  const results = [];
  for (const [index, { seat }] of data.track.entries()) {
    const back = mountImages[index];
    const mounted = drawMounted(
      exportedRider,
      back,
      point(seat),
      contact,
      true,
    );
    const timestamp = index * 120;
    assert.equal(exported.sampleTimeline(timeline, timestamp), index);
    assert.equal(exported.sampleTimeline(timeline, timestamp + 119), index);
    results.push(mounted);
  }
  if (label === "rider-a") {
    const wrong = drawMounted(
      exportedRider,
      mountImages[2],
      point(data.track[2].seat),
      contact,
      false,
    );
    assert.notDeepEqual(wrong.data, results[2].data);
  }
  byOutfit.set(label, results);
}

assert.equal(exported.sampleTimeline(timeline, 960), 0);
for (let i = 0; i < timeline.length; i++) {
  const base = byOutfit.get("rider-a")[i].data;
  const boot = byOutfit.get("rider-a-boot")[i].data;
  const other = byOutfit.get("rider-b")[i].data;
  assert.notDeepEqual(base, boot);
  assert.notDeepEqual(base, other);
  // The nose and tail pixels are well outside the two rider silhouettes.
  for (let y = 0; y < size.h; y++) {
    for (const [xmin, xmax] of [
      [0, 46],
      [81, 128],
    ]) {
      const left = 4 * (y * size.w + xmin);
      const right = 4 * (y * size.w + xmax);
      assert.deepEqual(base.slice(left, right), other.slice(left, right));
      assert.deepEqual(base.slice(left, right), boot.slice(left, right));
    }
  }
}
console.log(
  "24 mounted outputs passed. Eight phase boundaries, loop wrap, contact negative control, rider swap, and boot toggle.",
);

const nativePath = process.argv[2];
if (nativePath) {
  await mkdir(nativePath, { recursive: true });
  for (const letter of ["a", "b"]) {
    const project = await riderProject(letter, letter === "a");
    const output = await exportFiles(project, {
      engines: ["godot"],
      baked: false,
    });
    assert.deepEqual(output.errors, []);
    for (const entry of output.entries) {
      const path = join(nativePath, "rider-" + letter, entry.name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, entry.data);
    }
  }
  await writeFile(
    join(nativePath, "project.godot"),
    'config_version=5\n[application]\nconfig/name="PixelDoll Mount Pilot"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n',
  );
  await copyFile(file("verify_godot.gd"), join(nativePath, "verify.gd"));
  await copyFile(file("capture_godot.gd"), join(nativePath, "capture.gd"));
  for (const image of ["south-mount-back.png", "south-mount-front.png"])
    await copyFile(file(image), join(nativePath, image));
  await copyFile(
    file("east-measurements.json"),
    join(nativePath, "track.json"),
  );
  for (const { image } of data.track)
    await copyFile(file(image), join(nativePath, image));
}
