// Offline pose metrics shared by the 2026-11-23 mocap salvage study. No network.
import type { Keypoint } from "../../../app/src/lib/rig/rig.ts";
const P = (k: Keypoint[], l: string) => k.find((p) => p.label === l)!;
const mid = (a: Keypoint, b: Keypoint) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});
const ang = (
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
) => {
  const v1 = [a.x - b.x, a.y - b.y],
    v2 = [c.x - b.x, c.y - b.y];
  return (
    (Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          (v1[0] * v2[0] + v1[1] * v2[1]) /
            Math.hypot(v1[0], v1[1]) /
            Math.hypot(v2[0], v2[1]),
        ),
      ),
    ) *
      180) /
    Math.PI
  );
};
/** px = cell size; returns pixel offsets relative to the neck and joint angles in degrees. */
export function poseMetrics(k: Keypoint[], px: number) {
  const n = P(k, "NECK"),
    h = mid(P(k, "RIGHT HIP"), P(k, "LEFT HIP")),
    nose = P(k, "NOSE");
  const sh = mid(P(k, "RIGHT SHOULDER"), P(k, "LEFT SHOULDER"));
  return {
    lean: (Math.atan2(n.x - h.x, h.y - n.y) * 180) / Math.PI,
    noseAboveNeck: (n.y - nose.y) * px,
    shoulderBelowNeck: (sh.y - n.y) * px,
    hipY: h.y * px,
    noseY: nose.y * px,
    kneeMin: Math.min(
      ang(P(k, "RIGHT HIP"), P(k, "RIGHT KNEE"), P(k, "RIGHT LEG")),
      ang(P(k, "LEFT HIP"), P(k, "LEFT KNEE"), P(k, "LEFT LEG")),
    ),
    elbowMin: Math.min(
      ang(P(k, "RIGHT SHOULDER"), P(k, "RIGHT ELBOW"), P(k, "RIGHT ARM")),
      ang(P(k, "LEFT SHOULDER"), P(k, "LEFT ELBOW"), P(k, "LEFT ARM")),
    ),
    depth: k.some((p) => p.depth !== undefined),
  };
}
export function summarize(seq: Keypoint[][], ref: Keypoint[], px: number) {
  const r = poseMetrics(ref, px),
    m = seq.map((k) => poseMetrics(k, px));
  const range = (f: (x: ReturnType<typeof poseMetrics>) => number) =>
    [Math.min(...m.map(f)), Math.max(...m.map(f))].map((v) => +v.toFixed(1));
  return {
    ref: {
      noseAboveNeck: +r.noseAboveNeck.toFixed(1),
      shoulderBelowNeck: +r.shoulderBelowNeck.toFixed(1),
      hipY: +r.hipY.toFixed(1),
    },
    lean: range((x) => x.lean),
    noseAboveNeck: range((x) => x.noseAboveNeck),
    shoulderBelowNeck: range((x) => x.shoulderBelowNeck),
    hipDrop: range((x) => x.hipY - r.hipY),
    kneeMin: range((x) => x.kneeMin),
    elbowMin: range((x) => x.elbowMin),
    depth: m.some((x) => x.depth),
  };
}
