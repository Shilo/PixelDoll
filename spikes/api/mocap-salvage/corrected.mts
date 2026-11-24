// Offline: rebuild the corrected (motion.ts) Lab keypoints from the committed library and compare them with PixelLab's
// measured template walk on the same body. No network.
import fs from "node:fs";
import path from "node:path";
import {
  newDocument,
  renderPoses,
  type MotionLibrary,
} from "../../../app/src/ui/motion-lab/model.ts";
import { summarize } from "./metrics.mts";
const root = path.resolve(import.meta.dirname, "../../..");
const lib: MotionLibrary = JSON.parse(
  fs.readFileSync(
    path.join(root, "app/dev-fixtures/motion-lab/library.json"),
    "utf8",
  ),
);
const tmplFile = process.argv[2];
const out: Record<string, unknown> = {};
for (const fx of lib.fixtures)
  for (const dir of ["south", "east"] as const)
    for (const clip of lib.clips) {
      if (!fx.references[dir]) continue;
      try {
        const d = newDocument(lib, fx, clip, dir);
        const { poses } = renderPoses(d);
        out[`${fx.id}/${clip.id}/${dir}`] = summarize(
          poses.map((p) =>
            p.map((k) => ({
              ...k,
              x: (k.x * (fx.cell.w + 2 * d.padding) - d.padding) / fx.cell.w,
              y: (k.y * (fx.cell.h + 2 * d.padding) - d.padding) / fx.cell.h,
            })),
          ),
          fx.references[dir]!.keypoints,
          fx.cell.w,
        );
      } catch (e) {
        out[`${fx.id}/${clip.id}/${dir}`] = String((e as Error).message);
      }
    }
if (tmplFile) {
  const inputs = JSON.parse(fs.readFileSync(tmplFile, "utf8"));
  for (const c of inputs.cases)
    if (
      /^(stored_walk|walk2|slash2)_(south|east)_depth$|^stored_walk_(south|east)$/.test(
        c.id,
      )
    )
      out[`old:${c.id}`] = summarize(
        c.body.keypoints,
        c.body.first_frame_keypoints,
        80,
      );
}
console.log(JSON.stringify(out, null, 0).replace(/\},"/g, '},\n"'));
