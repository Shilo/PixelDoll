import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fitRotation, distance, rotate, reinPoints } from "./geometry.mjs";
import { authoredPoses, LABELS } from "../../../app/src/lib/rig/poses.ts";
import {
  mountView,
  TEST_MOUNT,
} from "../../../app/src/studio/experience/mounts.ts";
import { decodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
import type { DirectionName } from "../../../app/src/lib/store/manifest.ts";

const pivot = { x: 0, y: 0 };
const directions: DirectionName[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];
const close = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    actual + " differs from " + expected,
  );

test("hip rotation preserves its pivot and every radial distance, not arbitrary hand targets", () => {
  for (let degrees = -180; degrees <= 180; degrees++) {
    const angle = (degrees * Math.PI) / 180;
    assert.deepEqual(rotate(pivot, pivot, angle), pivot);
    close(
      distance(rotate({ x: 7, y: -11 }, pivot, angle), pivot),
      Math.hypot(7, 11),
    );
  }
  const result = fitRotation([{ x: 4, y: 0 }], [{ x: 12, y: 0 }], pivot);
  close(result.maximumError, 8);
});

test("the fit finds a known simultaneous solution and rejects contradictory hands", () => {
  const hands = [
    { x: 8, y: -9 },
    { x: 12, y: -7 },
  ];
  const angle = 0.2;
  const targets = hands.map((point) => rotate(point, pivot, angle));
  close(fitRotation(hands, targets, pivot).angle, angle);
  close(fitRotation(hands, targets, pivot).maximumError, 0);
  const incompatible = [
    { x: 0, y: -10 },
    { x: 0, y: -10 },
  ];
  const opposite = [
    { x: -10, y: 0 },
    { x: 10, y: 0 },
  ];
  assert.ok(fitRotation(incompatible, opposite, pivot).maximumError >= 10);
});

test("bounded fit agrees with an independent brute-force squared-error search across 8 headings", () => {
  for (let direction = 0; direction < 8; direction++)
    for (const size of [8, 34, 64, 256]) {
      const heading = (direction * Math.PI) / 4;
      const hands = [
        { x: size * 0.15, y: -size * 0.2 },
        { x: size * 0.3, y: -size * 0.15 },
      ].map((point) => rotate(point, pivot, heading));
      const targets = [
        { x: size * 0.45, y: -size * 0.1 },
        { x: size * 0.5, y: -size * 0.1 },
      ].map((point) => rotate(point, pivot, heading));
      const solution = fitRotation(hands, targets, pivot, Math.PI / 12);
      const score = (angle: number) =>
        hands.reduce(
          (sum, point, index) =>
            sum + distance(rotate(point, pivot, angle), targets[index]) ** 2,
          0,
        );
      let sampledMinimum = Infinity;
      for (let step = -1500; step <= 1500; step++)
        sampledMinimum = Math.min(
          sampledMinimum,
          score((step * Math.PI) / 18000),
        );
      assert.ok(score(solution.angle) <= sampledMinimum + 1e-7);
    }
});

test("a 20-degree screen rotation displaces a 20-pixel vertical head vector 6.84 pixels sideways", () => {
  const head = { x: 0, y: -20 };
  const leaned = rotate(head, pivot, Math.PI / 9);
  close(Math.abs(leaned.x), 6.8404028665, 1e-8);
  assert.ok(Math.abs(leaned.x) > 1);
});

test("reins preserve endpoints and mirror parity at every mount phase and scale", () => {
  let cases = 0;
  for (const direction of directions)
    for (const height of [8, 34, 64, 256]) {
      const result = mountView(TEST_MOUNT, direction, height);
      assert.ok(result.ok);
      if (!result.ok) continue;
      for (const frame of result.view.frames) {
        const hand = { x: frame.seat.x + 2, y: frame.seat.y - 4 };
        const bit = {
          x: frame.seat.x + height * 0.4,
          y: frame.seat.y - height * 0.15,
        };
        for (const sag of [0, 2]) {
          const points = reinPoints(hand, bit, sag);
          assert.deepEqual(points[0], hand);
          assert.deepEqual(points.at(-1), bit);
          const mirrored = reinPoints(
            { x: -hand.x, y: hand.y },
            { x: -bit.x, y: bit.y },
            sag,
          );
          for (let index = 0; index < points.length; index++) {
            close(mirrored[index].x, -points[index].x);
            close(mirrored[index].y, points[index].y);
          }
          cases++;
        }
      }
    }
  assert.equal(cases, 256);
});

test("existing Ride requests repeat one target skeleton for a synthetic rest in all eight facings", () => {
  const coordinates: Record<string, number[]> = {
    NOSE: [32, 13],
    NECK: [32, 22],
    SHOULDER: [5, 23],
    ELBOW: [7, 31],
    ARM: [8, 39],
    HIP: [4, 39],
    KNEE: [5, 47],
    LEG: [5, 55],
    EYE: [2, 13],
    EAR: [4, 15],
  };
  const rest = Object.fromEntries(
    LABELS.map((label) => {
      const joint = label.replace(/^(LEFT|RIGHT) /, "");
      const [spread, vertical] = coordinates[joint];
      const side = label.startsWith("LEFT")
        ? -1
        : label.startsWith("RIGHT")
          ? 1
          : 0;
      return [
        label,
        { x: side ? 32 + spread * side : spread, y: vertical, z: 0 },
      ];
    }),
  );
  for (const direction of directions) {
    const poses = authoredPoses("ride", rest, direction);
    assert.equal(poses.length, 3);
    assert.deepEqual(poses[0], poses[1]);
    assert.deepEqual(poses[1], poses[2]);
    assert.deepEqual(poses[0].NOSE, rest.NOSE);
    for (const point of Object.values(poses[0]))
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  }
});

test("real-art annotation uncertainty cannot rescue the direct neck-contact fit", () => {
  const data = JSON.parse(
    readFileSync(
      new URL("./evidence/measurements.json", import.meta.url),
      "utf8",
    ),
  );
  for (const measurement of data.measurements) {
    assert.ok(measurement.bounded.maximumError > 10);
    assert.ok(measurement.unrestricted.maximumError > 10);
    assert.ok(measurement.boundedFootShift > 2);
    assert.ok(measurement.maximumFootShift > 6);
    assert.ok(measurement.radialLowerBounds[0] - 4 * Math.SQRT2 > 1);
  }
});

test("source fixture remains a transparent three-cell strip with opaque annotated grips", async () => {
  const source = await decodePngBytes(
    readFileSync(
      new URL(
        "../2026-11-16-mounts/evidence/mount-live-east-raw-strip.png",
        import.meta.url,
      ),
    ),
  );
  assert.equal(source.w, 192);
  assert.equal(source.h, 64);
  assert.equal(source.data[3], 0);
  for (let cell = 0; cell < 3; cell++)
    for (const point of [
      { x: 37, y: 39 },
      { x: 44, y: 37 },
    ])
      assert.equal(
        source.data[(point.y * source.w + cell * 64 + point.x) * 4 + 3],
        255,
      );
});

test("missing and malformed experimental endpoints fail clearly", () => {
  assert.throws(() => fitRotation([], [], pivot));
  assert.throws(() => fitRotation([{ x: NaN, y: 0 }], [pivot], pivot));
  assert.throws(() => fitRotation([pivot], [pivot], pivot, -1));
  assert.throws(() => reinPoints(pivot, { x: Infinity, y: 0 }));
  assert.throws(() => reinPoints(pivot, pivot, -1));
});

const html = readFileSync(
  new URL("./comparison.html", import.meta.url),
  "utf8",
);
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const imageData = JSON.parse(script.match(/const images = (\{[^\n]*\});/)![1]);

test("all 96 images decode and every reflected output matches the independent column-reversal oracle", async () => {
  assert.equal(Object.keys(imageData).length, 96);
  for (let cell = 0; cell < 3; cell++)
    for (let gait = 0; gait < 4; gait++)
      for (let method = 0; method < 4; method++) {
        const key =
          "-cell-" + cell + "-gait-" + gait + "-method-" + method + ".png";
        const east = await decodePngBytes(
          Buffer.from(imageData["east" + key], "base64"),
        );
        const west = await decodePngBytes(
          Buffer.from(imageData["west" + key], "base64"),
        );
        assert.equal(east.w, 90);
        assert.equal(east.h, 104);
        assert.equal(west.w, east.w);
        assert.equal(west.h, east.h);
        for (let row = 0; row < east.h; row++)
          for (let column = 0; column < east.w; column++) {
            const source = (row * east.w + column) * 4;
            const reflected = (row * west.w + west.w - 1 - column) * 4;
            assert.deepEqual(
              west.data.subarray(reflected, reflected + 4),
              east.data.subarray(source, source + 4),
            );
          }
      }
});

test("comparison controls select every static cell and gait without changing the selected source", () => {
  const elements = new Map<
    string,
    {
      value: string;
      src: string;
      textContent: string;
      listeners: Record<string, () => void>;
      addEventListener: (event: string, listener: () => void) => void;
    }
  >();
  for (const name of [
    "facing",
    "cell",
    "gait",
    "step",
    "detail",
    "method-0",
    "method-1",
    "method-2",
    "method-3",
  ]) {
    const element = {
      value: name === "facing" ? "east" : "0",
      src: "",
      textContent: "",
      listeners: {},
      addEventListener(event: string, listener: () => void) {
        this.listeners[event] = listener;
      },
    };
    elements.set("#" + name, element);
  }
  const root = { querySelector: (selector: string) => elements.get(selector) };
  runInNewContext(script, { document: { getElementById: () => root } });
  for (const facing of ["east", "west"])
    for (let cell = 0; cell < 3; cell++) {
      elements.get("#facing")!.value = facing;
      elements.get("#cell")!.value = String(cell);
      elements.get("#gait")!.value = "0";
      elements.get("#cell")!.listeners.change();
      for (let gait = 0; gait < 4; gait++) {
        for (let method = 0; method < 4; method++)
          assert.equal(
            elements.get("#method-" + method)!.src,
            "data:image/png;base64," +
              imageData[
                facing +
                  "-cell-" +
                  cell +
                  "-gait-" +
                  gait +
                  "-method-" +
                  method +
                  ".png"
              ],
          );
        elements.get("#step")!.listeners.click();
        assert.equal(elements.get("#cell")!.value, String(cell));
      }
      assert.equal(elements.get("#gait")!.value, "0");
    }
});
