// Offline: per-frame metrics of the run joints M0 sent (recomputed; deterministic). No network.
import fs from "node:fs";
import path from "node:path";
import "./env.mts";
import { OUT } from "../c25/lib.mts";
import { library, clipOf } from "./arms.mts";
import {
  newDocument,
  renderPoses,
} from "../../../app/src/ui/motion-lab/model.ts";
import { poseMetrics } from "./metrics.mts";
const fx = JSON.parse(
  fs.readFileSync(path.join(OUT, "benchmark84.json"), "utf8"),
);
const action = process.argv[2] ?? "run";
const len = clipOf(action).duration;
for (const d of ["south", "east"] as const) {
  const doc = newDocument(library, fx, clipOf(action), d);
  doc.times = Array.from({ length: 8 }, (_, i) =>
    action === "run" ? (len * i) / 8 : (len * i) / 7,
  );
  doc.padding = 0;
  doc.buffer = false;
  const { poses } = renderPoses(doc);
  const ref = poseMetrics(fx.references[d].keypoints, 84);
  console.log(d, "ref hipY", ref.hipY.toFixed(1));
  poses.forEach((p, i) => {
    const m = poseMetrics(p, 84);
    console.log(
      ` f${i + 1} hipDrop ${(m.hipY - ref.hipY).toFixed(1)} kneeMin ${m.kneeMin.toFixed(0)} elbowMin ${m.elbowMin.toFixed(0)} lean ${m.lean.toFixed(0)}`,
    );
  });
}
// MR check
import { styleRun } from "./style.mts";
for (const d of ["south", "east"] as const) {
  const doc = newDocument(library, fx, clipOf(action), d);
  doc.times = Array.from({ length: 8 }, (_, i) => (len * i) / 8);
  doc.padding = 0;
  doc.buffer = false;
  const poses = styleRun(
    renderPoses(doc).poses,
    fx.references[d].keypoints,
    84,
    84,
  );
  const ref = poseMetrics(fx.references[d].keypoints, 84);
  console.log("MR", d);
  poses.forEach((p, i) => {
    const m = poseMetrics(p, 84);
    console.log(
      ` f${i + 1} hipDrop ${(m.hipY - ref.hipY).toFixed(1)} kneeMin ${m.kneeMin.toFixed(0)}`,
    );
  });
}
