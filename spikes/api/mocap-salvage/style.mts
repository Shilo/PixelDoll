// MR2 style pass (2026-11-24; replaces MR, whose knees bent to the wrong side, see style-v1-flipped.mts). Keep only 35%
// of each frame's pelvis drop below the reference by lifting the upper body, reduced per frame as far as needed so both
// fixed ankles stay reachable, then re-solve each knee by 2D two-bone IK with the frame's own thigh and shin lengths,
// bending to the same side of the hip-ankle line as the original knee.
import type { Keypoint } from "../../../app/src/lib/rig/rig.ts";
const KEEP = 0.35;
const LEGS = [
  ["RIGHT HIP", "RIGHT KNEE", "RIGHT LEG"],
  ["LEFT HIP", "LEFT KNEE", "LEFT LEG"],
] as const;
const LOWER = new Set(["RIGHT KNEE", "RIGHT LEG", "LEFT KNEE", "LEFT LEG"]);
type P = { x: number; y: number };
export function styleRun(
  frames: Keypoint[][],
  ref: Keypoint[],
  w: number,
  h: number,
): Keypoint[][] {
  const at = (k: Keypoint[], l: string): P => {
    const p = k.find((q) => q.label === l)!;
    return { x: p.x * w, y: p.y * h };
  };
  const hipY = (k: Keypoint[]) =>
    (at(k, "RIGHT HIP").y + at(k, "LEFT HIP").y) / 2;
  const refHip = hipY(ref);
  return frames.map((frame) => {
    const legs = LEGS.map(([hl, kl, al]) => {
      const H = at(frame, hl),
        K = at(frame, kl),
        A = at(frame, al);
      return {
        hl,
        kl,
        H,
        A,
        l1: Math.hypot(K.x - H.x, K.y - H.y),
        l2: Math.hypot(A.x - K.x, A.y - K.y),
        side:
          Math.sign((A.x - H.x) * (K.y - H.y) - (A.y - H.y) * (K.x - H.x)) || 1,
      };
    });
    const drop = hipY(frame) - refHip;
    let lift = drop > 0 ? drop * (1 - KEEP) : 0;
    // Reach: lifting the hip by `lift` px must keep every ankle within thigh + shin.
    const reachable = (l: number) =>
      legs.every(
        (g) =>
          Math.hypot(g.A.x - g.H.x, g.A.y - (g.H.y - l)) <= g.l1 + g.l2 - 1e-6,
      );
    while (lift > 0 && !reachable(lift)) lift = Math.max(0, lift - 0.05);
    const out = frame.map((p) =>
      LOWER.has(p.label) ? { ...p } : { ...p, y: p.y - lift / h },
    );
    for (const g of legs) {
      const H = { x: g.H.x, y: g.H.y - lift },
        dx = g.A.x - H.x,
        dy = g.A.y - H.y,
        d = Math.hypot(dx, dy);
      const ux = dx / d,
        uy = dy / d;
      const a = (g.l1 * g.l1 - g.l2 * g.l2 + d * d) / (2 * d),
        hh = Math.sqrt(Math.max(0, g.l1 * g.l1 - a * a));
      // perp = (-uy, ux) gives cross(u, perp) = 1, so `side` places the knee on the original knee's side.
      const knee = out.find((p) => p.label === g.kl)!;
      knee.x = (H.x + a * ux + g.side * hh * -uy) / w;
      knee.y = (H.y + a * uy + g.side * hh * ux) / h;
    }
    return out;
  });
}
