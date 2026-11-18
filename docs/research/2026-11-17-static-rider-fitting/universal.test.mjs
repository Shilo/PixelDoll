import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import {
  FACINGS,
  PROFILES,
  ridingPose,
  prepare,
  boneLengths,
  renderProbe,
} from "./universal.mjs";

const close = (actual, expected) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    actual + " differs from " + expected,
  );

test("one local candidate is reused for every mount and direction without body rotation", () => {
  const expected = ridingPose();
  for (const facing of FACINGS)
    for (const profile of PROFILES)
      for (let phase = 0; phase < 4; phase++) {
        const state = prepare({ mountId: profile.id, facing, phase });
        assert.deepEqual(state.pose, expected);
        close(state.joints.hip.x, state.seat.x);
        close(state.joints.hip.y, state.seat.y);
        close(state.joints.head.x, state.joints.hip.x);
      }
});

test("the explicit broad-back override changes only legs and preserves every bone length", () => {
  for (const scale of [0.75, 1, 1.25]) {
    const base = ridingPose(false, scale);
    const custom = ridingPose(true, scale);
    for (const [index, length] of boneLengths(base).entries())
      close(boneLengths(custom)[index], length);
    for (const name of Object.keys(base).filter(
      (name) => !/Knee|Ankle|Toe/.test(name),
    ))
      assert.deepEqual(custom[name], base[name]);
    assert.notDeepEqual(custom.rightKnee, base.rightKnee);
    for (const mountId of ["compact", "longneck"])
      assert.deepEqual(prepare({ mountId, custom: true, scale }).pose, base);
  }
});

test("synthetic negative controls expose broad-back incompatibility instead of claiming universal fit", () => {
  assert.ok(prepare({ mountId: "compact", wide: true }).probe.clears);
  assert.ok(prepare({ mountId: "longneck", wide: true }).probe.clears);
  assert.equal(prepare({ mountId: "broad" }).probe.clears, false);
  assert.equal(prepare({ mountId: "broad", custom: true }).probe.clears, false);
  assert.equal(
    prepare({ mountId: "broad", custom: true, broadWidth: 20 }).probe.clears,
    false,
  );
  assert.match(prepare().probe.scope, /limb radius/);
});

test("a wider candidate reuses its pose but still rejects insufficient limb clearance across scale bands", () => {
  const expected = ridingPose(true);
  for (const profile of PROFILES) {
    const state = prepare({ mountId: profile.id, wide: true });
    assert.deepEqual(state.pose, expected);
    assert.equal(state.probe.clears, profile.id !== "broad");
  }
  for (const scale of [0.75, 1, 1.25]) {
    for (const mountId of ["compact", "longneck"])
      assert.ok(prepare({ mountId, wide: true, scale }).probe.clears);
    assert.equal(
      prepare({ mountId: "broad", wide: true, scale }).probe.clears,
      scale === 1.25,
    );
    assert.equal(prepare({ mountId: "broad", scale }).probe.clears, false);
  }
  assert.equal(
    prepare({ mountId: "broad", wide: true, broadWidth: 20 }).probe.clears,
    false,
  );
});

test("independent head movement updates mount endpoints without moving the hands relative to the seat", () => {
  for (const facing of FACINGS)
    for (const profile of PROFILES) {
      const initial = prepare({ facing, mountId: profile.id, phase: 0 });
      for (const phase of [1, 2, 3]) {
        const moved = prepare({ facing, mountId: profile.id, phase });
        for (const name of Object.keys(initial.joints)) {
          close(
            moved.joints[name].x - moved.seat.x,
            initial.joints[name].x - initial.seat.x,
          );
          close(
            moved.joints[name].y - moved.seat.y,
            initial.joints[name].y - initial.seat.y,
          );
        }
        assert.notEqual(
          moved.head.y - moved.seat.y,
          initial.head.y - initial.seat.y,
        );
        assert.notDeepEqual(moved.reins[0].endpoint, initial.reins[0].endpoint);
      }
    }
});

test("harness anchors remain on the authored neck sides and axial legs share the same occlusion layer", () => {
  for (const mountId of ["longneck", "broad"])
    for (let phase = 0; phase < 4; phase++) {
      const state = prepare({ mountId, phase });
      for (const rein of state.reins) {
        close(Math.abs(rein.attachment.side), 3.5);
        close(
          (rein.attachment.forward - state.neckRoot.forward) /
            (state.neckHead.forward - state.neckRoot.forward),
          0.7,
        );
        close(
          (rein.attachment.up - state.neckRoot.up) /
            (state.neckHead.up - state.neckRoot.up),
          0.7,
        );
      }
    }
  for (const facing of ["north", "south"]) {
    const { svg } = renderProbe({ facing, tack: false, markers: false });
    const beforeBody = svg.slice(0, svg.indexOf('class="body"'));
    assert.equal((beforeBody.match(/class="far-limb"/g) ?? []).length, 2);
    assert.doesNotMatch(svg, /class="grip"|class="seat"/);
  }
});

test("3456 attachment combinations preserve exact endpoints and respect occupied hands and disabled tack", () => {
  let count = 0;
  for (const facing of FACINGS)
    for (const profile of PROFILES)
      for (let phase = 0; phase < 4; phase++)
        for (const scale of [0.75, 1, 1.25])
          for (const custom of [false, true])
            for (const busy of ["none", "right", "both"])
              for (const tack of [false, true]) {
                const state = prepare({
                  facing,
                  mountId: profile.id,
                  phase,
                  scale,
                  custom,
                  busy,
                  tack,
                });
                assert.equal(
                  state.reins.length,
                  !tack || busy === "both" ? 0 : busy === "right" ? 1 : 2,
                );
                for (const rein of state.reins) {
                  assert.deepEqual(
                    rein.points[0],
                    state.joints[rein.side + "Grip"],
                  );
                  assert.deepEqual(rein.points.at(-1), rein.endpoint);
                  assert.ok(
                    rein.points.every(
                      (joint) =>
                        Number.isFinite(joint.x) && Number.isFinite(joint.y),
                    ),
                  );
                  if (busy === "right") assert.equal(rein.side, "left");
                }
                count++;
              }
  assert.equal(count, 3456);
});

test("saved artwork stays native-size with no invented direction or target-grip attachment", () => {
  for (const facing of FACINGS) {
    const result = renderProbe(
      { facing, art: "saved", scale: 1.25, custom: true },
      "data:image/png;base64,example",
    );
    if (["east", "west"].includes(facing)) {
      assert.match(result.svg, /width="64" height="64"/);
      assert.doesNotMatch(result.svg, /class="rein"/);
      assert.equal(
        result.svg.includes('transform="scale(-1 1)"'),
        facing === "west",
      );
      assert.match(result.note, /grips/);
    } else {
      assert.equal(result.svg, "");
      assert.match(result.note, /East only/);
    }
  }
});

test("invalid probe options are rejected explicitly", () => {
  for (const options of [
    { facing: "unknown" },
    { mountId: "missing" },
    { phase: 4 },
    { phase: NaN },
    { busy: "unknown" },
    { scale: Infinity },
    { scale: 0.5 },
    { broadWidth: 30 },
  ])
    assert.throws(() => prepare(options));
});

test("generated controls change facing, pose, hand occupancy, width and motion without a network or real timer", () => {
  const html = readFileSync(
    new URL("./universal-rider.html", import.meta.url),
    "utf8",
  );
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const name of ["geometry.mjs", "universal.mjs"]) {
    const source = readFileSync(new URL("./" + name, import.meta.url), "utf8")
      .replace(/^import .*;\r?\n/gm, "")
      .replace(/^export /gm, "");
    assert.ok(
      script.includes(source),
      "Rebuild the prototype after changing " + name,
    );
  }
  const template = readFileSync(
    new URL("./universal-template.html", import.meta.url),
    "utf8",
  );
  assert.ok(
    script.endsWith(
      template.match(/<script>([\s\S]*?)<\/script>/)[1].split("__SPRITE__")[1],
    ),
    "Rebuild after changing the control template",
  );
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|WebSocket/);
  const fields = new Map();
  const defaults = {
    facing: "east",
    pose: "wide",
    busy: "none",
    art: "target",
    size: "1",
    width: "11",
  };
  for (const name of [
    "facing",
    "pose",
    "busy",
    "art",
    "size",
    "width",
    "tack",
    "mounts",
    "phase",
    "width-value",
    "status",
    "step",
    "play",
  ])
    fields.set(name, {
      value: defaults[name] ?? "",
      checked: true,
      disabled: false,
      textContent: "",
      innerHTML: "",
      listeners: {},
      attributes: {},
      addEventListener(event, listener) {
        this.listeners[event] = listener;
      },
      setAttribute(name, value) {
        this.attributes[name] = value;
      },
    });
  let interval = null;
  const document = {
    hidden: false,
    listeners: {},
    getElementById: () => ({
      querySelector: (selector) => fields.get(selector.slice(1)),
    }),
    addEventListener(name, listener) {
      this.listeners[name] = listener;
    },
  };
  runInNewContext(script, {
    document,
    setInterval: (callback) => {
      interval = callback;
      return 1;
    },
    clearInterval: () => {
      interval = null;
    },
  });
  const change = (name, value) => {
    fields.get(name).value = value;
    fields.get(name).listeners.change();
  };
  assert.equal(
    (fields.get("mounts").innerHTML.match(/<svg /g) ?? []).length,
    3,
  );
  change("facing", "north");
  assert.match(fields.get("mounts").innerHTML, /north/);
  change("pose", "custom");
  assert.match(fields.get("status").textContent, /Only the broad-back/);
  change("width", "20");
  assert.match(fields.get("mounts").innerHTML, /different pose or saddle/);
  change("busy", "both");
  assert.doesNotMatch(fields.get("mounts").innerHTML, /class="rein"/);
  fields.get("play").listeners.click();
  assert.equal(fields.get("play").attributes["aria-pressed"], "true");
  interval();
  assert.equal(fields.get("phase").textContent, "Phase 2 / 4");
  document.hidden = true;
  document.listeners.visibilitychange();
  assert.equal(interval, null);
  fields.get("step").listeners.click();
  assert.equal(fields.get("phase").textContent, "Phase 3 / 4");
  change("art", "saved");
  assert.equal(fields.get("size").disabled, true);
  assert.equal(fields.get("pose").disabled, true);
  assert.equal(fields.get("busy").disabled, true);
  assert.equal(fields.get("tack").disabled, true);
  assert.doesNotMatch(fields.get("mounts").innerHTML, /<image /);
  change("facing", "west");
  assert.equal(
    (fields.get("mounts").innerHTML.match(/<image /g) ?? []).length,
    3,
  );
});
