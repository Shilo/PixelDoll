// Offline: which side of the hip-ankle line each knee is on, before (M0) and after the MR pass. No network.
import fs from "node:fs";
import path from "node:path";
import "./env.mts";
import { OUT } from "../c25/lib.mts";
import { library, clipOf } from "./arms.mts";
import {
  newDocument,
  renderPoses,
} from "../../../app/src/ui/motion-lab/model.ts";
import { styleRun } from "./style.mts";
const fx = JSON.parse(
  fs.readFileSync(path.join(OUT, "benchmark84.json"), "utf8"),
);
const side = (k: any[], h: string, n: string, a: string) => {
  const H = k.find((p) => p.label === h),
    K = k.find((p) => p.label === n),
    A = k.find((p) => p.label === a);
  return Math.sign((A.x - H.x) * (K.y - H.y) - (A.y - H.y) * (K.x - H.x));
};
const len = (k: any[], a: string, b: string) => {
  const P = k.find((p) => p.label === a),
    Q = k.find((p) => p.label === b);
  return Math.hypot((P.x - Q.x) * 84, (P.y - Q.y) * 84);
};
for (const d of ["south", "east"] as const) {
  const doc = newDocument(library, fx, clipOf("run"), d);
  const L = clipOf("run").duration;
  doc.times = Array.from({ length: 8 }, (_, i) => (L * i) / 8);
  doc.padding = 0;
  doc.buffer = false;
  const m = renderPoses(doc).poses,
    r = styleRun(m, fx.references[d].keypoints, 84, 84);
  let flips = 0,
    nonzero = 0,
    lenErr = 0;
  m.forEach((f, i) => {
    for (const s of ["RIGHT", "LEFT"]) {
      const a = side(f, `${s} HIP`, `${s} KNEE`, `${s} LEG`),
        b = side(r[i], `${s} HIP`, `${s} KNEE`, `${s} LEG`);
      if (a) nonzero++;
      if (a && b && a !== b) flips++;
      lenErr = Math.max(
        lenErr,
        Math.abs(
          len(r[i], `${s} HIP`, `${s} KNEE`) - len(f, `${s} HIP`, `${s} KNEE`),
        ),
        Math.abs(
          len(r[i], `${s} KNEE`, `${s} LEG`) - len(f, `${s} KNEE`, `${s} LEG`),
        ),
      );
    }
  });
  console.log(
    d,
    "knees",
    nonzero,
    "flipped",
    flips,
    "max segment length error px",
    lenErr.toFixed(2),
  );
}
