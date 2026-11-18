import { reinPoints } from "./geometry.mjs";

export const FACINGS = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
];
export const PROFILES = [
  {
    id: "compact",
    name: "Compact saddle",
    width: 7,
    length: 17,
    bodyHeight: 8,
    seatHeight: 21,
    neckLength: 22,
    neckHeight: 9,
    tack: "bridle",
  },
  {
    id: "longneck",
    name: "Long neck / high seat",
    width: 7,
    length: 19,
    bodyHeight: 9,
    seatHeight: 29,
    neckLength: 32,
    neckHeight: 18,
    tack: "harness",
  },
  {
    id: "broad",
    name: "Broad back",
    width: 11,
    length: 16,
    bodyHeight: 9,
    seatHeight: 17,
    neckLength: 18,
    neckHeight: 6,
    tack: "harness",
  },
];
const PHASES = [
  { bob: 0, headForward: 0, headUp: 0 },
  { bob: -1, headForward: 2, headUp: 1 },
  { bob: 0, headForward: -2, headUp: 2 },
  { bob: 1, headForward: 1, headUp: -1 },
];
const point = (side, forward, up) => ({ side, forward, up });
const length3 = (first, second) =>
  Math.hypot(
    first.side - second.side,
    first.forward - second.forward,
    first.up - second.up,
  );

export function ridingPose(custom = false, scale = 1) {
  if (!Number.isFinite(scale) || scale < 0.75 || scale > 1.25)
    throw new Error("Rider scale outside this probe's 0.75 to 1.25 range");
  const kneeSide = custom ? 10 : 8;
  const kneeDrop = Math.sqrt(50 - (kneeSide - 4) ** 2 - 3 ** 2);
  const ankleSplay = custom ? 3 : 1;
  const shinDrop = Math.sqrt(105 - ankleSplay ** 2 - 2 ** 2);
  const pose = {
    hip: point(0, 0, 0),
    neck: point(0, 0, 19),
    head: point(0, 0, 25),
  };
  for (const [side, sign] of [
    ["right", 1],
    ["left", -1],
  ]) {
    pose[side + "Hip"] = point(sign * 4, 0, 0);
    pose[side + "Knee"] = point(sign * kneeSide, 3, -kneeDrop);
    pose[side + "Ankle"] = point(
      sign * (kneeSide + ankleSplay),
      1,
      -kneeDrop - shinDrop,
    );
    pose[side + "Toe"] = point(
      sign * (kneeSide + ankleSplay),
      5,
      -kneeDrop - shinDrop,
    );
    pose[side + "Shoulder"] = point(sign * 5, 0, 17);
    pose[side + "Elbow"] = point(sign * 4, 2, 10);
    pose[side + "Grip"] = point(sign * 3, 8, 7);
  }
  return Object.fromEntries(
    Object.entries(pose).map(([name, joint]) => [
      name,
      point(joint.side * scale, joint.forward * scale, joint.up * scale),
    ]),
  );
}

export function project(joint, facing) {
  const index = FACINGS.indexOf(facing);
  if (index < 0) throw new Error("Unknown facing");
  const angle = (index * Math.PI) / 4;
  const horizontal =
    joint.forward * Math.sin(angle) - joint.side * Math.cos(angle);
  const depth = joint.forward * Math.cos(angle) + joint.side * Math.sin(angle);
  return { x: horizontal, y: depth * 0.45 - joint.up, depth };
}

export function legProbe(pose, mount) {
  let margin = Infinity;
  for (const side of ["left", "right"])
    for (const [first, second] of [
      ["Hip", "Knee"],
      ["Knee", "Ankle"],
    ])
      for (let sample = 1; sample <= 32; sample++) {
        const fraction = sample / 32;
        const start = pose[side + first];
        const end = pose[side + second];
        const joint = point(
          start.side + (end.side - start.side) * fraction,
          start.forward + (end.forward - start.forward) * fraction,
          start.up + (end.up - start.up) * fraction,
        );
        const section =
          1 -
          ((joint.up + mount.bodyHeight) / mount.bodyHeight) ** 2 -
          (joint.forward / mount.length) ** 2;
        if (section <= 0) continue;
        margin = Math.min(
          margin,
          Math.abs(joint.side) - mount.width * Math.sqrt(section),
        );
      }
  const radius = 1.5;
  return {
    clears: margin >= radius,
    margin,
    radius,
    surfaceMargin: margin - radius,
    scope:
      "Sampled lateral clearance minus a 1.5-unit limb radius versus a synthetic ellipsoid. Not full capsule collision, silhouette or equipment acceptance.",
  };
}

export function prepare(options = {}) {
  const {
    mountId = "compact",
    facing = "east",
    phase = 0,
    custom = false,
    wide = false,
    scale = 1,
    busy = "none",
    tack = true,
    broadWidth = 11,
  } = options;
  const source = PROFILES.find((profile) => profile.id === mountId);
  if (
    !source ||
    !Number.isInteger(phase) ||
    phase < 0 ||
    phase >= PHASES.length ||
    !["none", "right", "both"].includes(busy) ||
    !Number.isFinite(broadWidth) ||
    broadWidth < 7 ||
    broadWidth > 20
  )
    throw new Error("Invalid mount probe options");
  const mount = {
    ...source,
    width: mountId === "broad" ? broadWidth : source.width,
  };
  const gait = PHASES[phase];
  const pose = ridingPose(wide || (custom && mountId === "broad"), scale);
  const seat = { x: 0, y: -mount.seatHeight + gait.bob };
  const place = (joint) => {
    const result = project(joint, facing);
    return { x: result.x + seat.x, y: result.y + seat.y, depth: result.depth };
  };
  const joints = Object.fromEntries(
    Object.entries(pose).map(([name, joint]) => [name, place(joint)]),
  );
  const head = point(
    0,
    mount.neckLength + gait.headForward,
    mount.neckHeight + gait.headUp,
  );
  const neckRoot = point(0, mount.length * 0.65, -mount.bodyHeight / 2);
  const harness = point(
    0,
    neckRoot.forward + (head.forward - neckRoot.forward) * 0.7,
    neckRoot.up + (head.up - neckRoot.up) * 0.7,
  );
  const reins = [];
  if (tack && busy !== "both")
    for (const side of ["left", "right"]) {
      if (side === "right" && busy === "right") continue;
      const sign = side === "right" ? 1 : -1;
      const attachment =
        mount.tack === "bridle"
          ? point(sign * 2, head.forward + 1, head.up - 1)
          : point(sign * 3.5, harness.forward, harness.up);
      const grip = joints[side + "Grip"];
      const endpoint = place(attachment);
      reins.push({
        side,
        grip,
        attachment,
        endpoint,
        points: reinPoints(grip, endpoint, 1.5),
      });
    }
  return {
    mount,
    pose,
    seat,
    joints,
    neckRoot,
    neckHead: head,
    head: place(head),
    reins,
    probe: legProbe(pose, mount),
    phase,
    facing,
    place,
  };
}

export function boneLengths(pose) {
  return ["left", "right"].flatMap((side) =>
    [
      ["Hip", "Knee"],
      ["Knee", "Ankle"],
      ["Shoulder", "Elbow"],
      ["Elbow", "Grip"],
    ].map(([first, second]) =>
      length3(pose[side + first], pose[side + second]),
    ),
  );
}

const coordinates = (joint) => joint.x.toFixed(3) + "," + joint.y.toFixed(3);
const path = (points) =>
  points
    .map((joint, index) => (index ? "L" : "M") + coordinates(joint))
    .join(" ");

export function renderProbe(options = {}, sprite = "") {
  const state = prepare(options);
  const { joints, mount, place, seat } = state;
  const savedArt = options.art === "saved";
  if (savedArt && !["east", "west"].includes(state.facing))
    return {
      state,
      svg: "",
      note: "Saved art is East only; West is a reflection. Choose East/West or pose target.",
    };
  const headBase = place(state.neckRoot);
  const headMark =
    '<ellipse class="head" cx="' +
    state.head.x +
    '" cy="' +
    state.head.y +
    '" rx="5" ry="4"/>';
  const neck =
    '<path class="neck" d="' + path([headBase, state.head]) + '"/>' + headMark;
  const bodyTop = place(point(0, 0, 0));
  const bodyBottom = place(point(0, 0, -mount.bodyHeight * 2));
  const projectedSide = project(point(mount.width, 0, 0), state.facing);
  const projectedLength = project(point(0, mount.length, 0), state.facing);
  const horizontalVariance = projectedSide.x ** 2 + projectedLength.x ** 2;
  const verticalVariance =
    projectedSide.y ** 2 + projectedLength.y ** 2 + mount.bodyHeight ** 2;
  const covariance =
    projectedSide.x * projectedSide.y + projectedLength.x * projectedLength.y;
  const spread = Math.hypot(
    horizontalVariance - verticalVariance,
    2 * covariance,
  );
  const radiusMajor = Math.sqrt(
    (horizontalVariance + verticalVariance + spread) / 2,
  );
  const radiusMinor = Math.sqrt(
    (horizontalVariance + verticalVariance - spread) / 2,
  );
  const bodyAngle =
    (Math.atan2(2 * covariance, horizontalVariance - verticalVariance) * 90) /
    Math.PI;
  const bodyCenter = (bodyTop.y + bodyBottom.y) / 2;
  const body =
    '<ellipse class="body" cx="0" cy="' +
    bodyCenter +
    '" rx="' +
    radiusMajor +
    '" ry="' +
    radiusMinor +
    '" transform="rotate(' +
    bodyAngle +
    " 0 " +
    bodyCenter +
    ')"/>';
  const legs = [-1, 1]
    .flatMap((side) =>
      [-1, 1].map((forward) => {
        const root = place(
          point(
            side * mount.width * 0.6,
            forward * mount.length * 0.6,
            -mount.bodyHeight,
          ),
        );
        return (
          '<path class="mount-leg" d="' +
          path([root, { x: root.x + forward, y: 10.5 }]) +
          '"/>'
        );
      }),
    )
    .join("");
  const axial = ["north", "south"].includes(state.facing);
  const nearSide =
    joints.rightHip.depth >= joints.leftHip.depth ? "right" : "left";
  const farSide = nearSide === "right" ? "left" : "right";
  const limb = (side, names, className) =>
    '<path class="' +
    className +
    '" d="' +
    path(names.map((name) => joints[side + name])) +
    '"/>';
  const rein = (side) =>
    state.reins
      .filter((item) => item.side === side)
      .map((item) => '<path class="rein" d="' + path(item.points) + '"/>')
      .join("");
  const farLeg = savedArt
    ? ""
    : (axial ? ["left", "right"] : [farSide])
        .map((side) => limb(side, ["Hip", "Knee", "Ankle", "Toe"], "far-limb"))
        .join("");
  const nearLeg =
    savedArt || axial
      ? ""
      : limb(nearSide, ["Hip", "Knee", "Ankle", "Toe"], "limb");
  const torso =
    '<path class="torso" d="' +
    path([joints.hip, joints.neck]) +
    '"/><circle class="rider-head" cx="' +
    joints.head.x +
    '" cy="' +
    joints.head.y +
    '" r="' +
    4 * (options.scale ?? 1) +
    '"/>';
  const arms =
    limb(farSide, ["Shoulder", "Elbow", "Grip"], "far-limb") +
    torso +
    limb(nearSide, ["Shoulder", "Elbow", "Grip"], "limb");
  const direction = state.facing === "west" ? ' transform="scale(-1 1)"' : "";
  const rider = savedArt
    ? "<g" +
      direction +
      '><image href="' +
      sprite +
      '" x="-32.5" y="' +
      (seat.y - 43.5) +
      '" width="64" height="64" style="image-rendering:pixelated"/></g>'
    : nearLeg + arms;
  const frontNeck = ["south", "south-east", "south-west"].includes(
    state.facing,
  );
  const grips =
    savedArt || options.markers === false
      ? []
      : ["left", "right"].map(
          (side) =>
            '<circle class="grip" cx="' +
            joints[side + "Grip"].x +
            '" cy="' +
            joints[side + "Grip"].y +
            '" r="1.2"/>',
        );
  const landmark =
    options.markers === false
      ? ""
      : '<circle class="seat" cx="0" cy="' + seat.y + '" r="1.8"/>';
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-58 -72 116 92" role="img" aria-label="' +
    mount.name +
    ", " +
    state.facing +
    ", " +
    (savedArt
      ? "existing chair-sit art, no new pose"
      : "synthetic astride pose target") +
    '"><path class="ground" d="M-50 13 H50"/>' +
    legs +
    (!savedArt ? rein(farSide) : "") +
    farLeg +
    body +
    (!frontNeck ? neck : "") +
    '<path class="saddle" d="M-5 ' +
    seat.y +
    ' H5"/>' +
    rider +
    (!savedArt ? rein(nearSide) : "") +
    (frontNeck ? neck : "") +
    grips.join("") +
    landmark +
    "</svg>";
  return {
    state,
    svg,
    note: savedArt
      ? "Existing art unchanged; reins disabled because target grips do not describe those pixels."
      : state.probe.clears
        ? "Sampled limb-radius proxy clears; anatomy and silhouettes are not qualified."
        : "Insufficient sampled limb clearance. A different pose or saddle is needed.",
  };
}
