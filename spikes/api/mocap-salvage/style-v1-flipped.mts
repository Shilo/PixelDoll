// SUPERSEDED (bug kept for reproducing the MR renders judged before 2026-11-24): knees bend to the opposite side and an
// unreachable ankle stretches the leg. Use style.mts (MR2).
// MR style pass (2026-11-23, frozen before rendering): keep only 35% of each frame's pelvis drop below the reference, lifting
// the whole upper body with it, and re-solve each knee by 2D two-bone IK so the ankle stays where the mocap put it and the
// frame's own thigh/shin lengths are kept. The knee bends to the same side as before. Unreachable ankles lie on the line.
import type { Keypoint } from "../../../app/src/lib/rig/rig.ts";
const KEEP = 0.35;
const LEGS = [
  ["RIGHT HIP", "RIGHT KNEE", "RIGHT LEG"],
  ["LEFT HIP", "LEFT KNEE", "LEFT LEG"],
] as const;
const LOWER = new Set(["RIGHT KNEE", "RIGHT LEG", "LEFT KNEE", "LEFT LEG"]);
export function styleRun(
  frames: Keypoint[][],
  ref: Keypoint[],
  w: number,
  h: number,
): Keypoint[][] {
  const hipY = (k: Keypoint[]) =>
    (k.find((p) => p.label === "RIGHT HIP")!.y +
      k.find((p) => p.label === "LEFT HIP")!.y) /
    2;
  const refHip = hipY(ref);
  return frames.map((frame) => {
    const drop = (hipY(frame) - refHip) * h;
    const lift = drop > 0 ? (drop * (1 - KEEP)) / h : 0;
    const out = frame.map((p) =>
      LOWER.has(p.label) ? { ...p } : { ...p, y: p.y - lift },
    );
    const get = (l: string) => out.find((p) => p.label === l)!;
    const orig = (l: string) => frame.find((p) => p.label === l)!;
    for (const [hipL, kneeL, ankL] of LEGS) {
      const hip = get(hipL),
        knee = get(kneeL),
        ank = get(ankL);
      const H = { x: hip.x * w, y: hip.y * h },
        A = { x: ank.x * w, y: ank.y * h };
      const oH = orig(hipL),
        oK = orig(kneeL),
        oA = orig(ankL);
      const l1 = Math.hypot((oK.x - oH.x) * w, (oK.y - oH.y) * h),
        l2 = Math.hypot((oA.x - oK.x) * w, (oA.y - oK.y) * h);
      const dx = A.x - H.x,
        dy = A.y - H.y,
        d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-6);
      const side =
        Math.sign(
          (oA.x - oH.x) * (oK.y - oH.y) - (oA.y - oH.y) * (oK.x - oH.x),
        ) || 1;
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d),
        hh = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const ux = dx / Math.hypot(dx, dy),
        uy = dy / Math.hypot(dx, dy);
      const kx = H.x + a * ux - side * hh * -uy,
        ky = H.y + a * uy - side * hh * ux;
      knee.x = kx / w;
      knee.y = ky / h;
    }
    return out;
  });
}
