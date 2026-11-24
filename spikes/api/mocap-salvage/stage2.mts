// Stage 2 (2026-11-23): replicate the frozen MR run fix. Fresh seeds 71 and 83, south and east.
//   chibi-run    chibi 80 px (Lab fixture), MR vs M0 vs P-standalone (the Studio's described route without a registered
//                character: /animate-pixminimax from the standing frame, leading echo required)
//   bench-walk   managed benchmark (84 px canvas as the pilot), MR vs M0 vs P-managed (described walk the Studio sends today)
//                vs T (PixelLab's walking-8-frames template on the managed character, the former Studio default), both
//                measured per frame and rendered through the same raw skeleton-v3 request
// Usage: node --experimental-transform-types --env-file=<.env> mocap-salvage/stage2.mts chibi-run|bench-walk [--dry]
import "./env.mts";
import fs from "node:fs";
import path from "node:path";
import { paid, paidJson, save, spent, OUT } from "../c25/lib.mts";
import { library, clipOf, fixture } from "./arms.mts";
import { styleRun } from "./style.mts"; // MR renders before 2026-11-24 used style-v1-flipped.mts
import {
  newDocument,
  renderPoses,
  type MotionFixture,
} from "../../../app/src/ui/motion-lab/model.ts";
import { rawClip, poseCallGens } from "../../../app/src/lib/rig/clips.ts";
import {
  moveMotionRequest,
  motionJoints,
  checkedKeypoints,
  bodyAction,
} from "../../../app/src/studio/create.ts";
import {
  skeletonInput,
  unpadSkeleton,
} from "../../../app/src/lib/rig/estimate.ts";
import { normalize } from "../../../app/src/lib/rig/normalize.ts";
import {
  routes,
  png,
  baseAnimation,
  BASE_ANIMS,
} from "../../../app/src/lib/pixellab/routes.ts";
import { encodePngBytes } from "../../../app/src/lib/image/pngraw.ts";
import type { Keypoint, DirectionName } from "../../../app/src/lib/rig/rig.ts";
import type { Req } from "../../../app/src/lib/pixellab/routes.ts";

const CASE = process.argv.find(
  (a) => a === "chibi-run" || a === "bench-walk" || a === "bench-run-template",
);
if (!CASE) throw new Error("usage: stage2.mts chibi-run|bench-walk [--dry]");
const DRY = process.argv.includes("--dry");
const ACTION = CASE === "bench-walk" ? "walk" : "run";
const TEMPLATE_ONLY = CASE === "bench-run-template";
// --mr2: render the corrected style pass as arm MR2 (style.mts) against the stored T renders; the old MR renders used
// the flipped-knee style-v1-flipped.mts.
const MR2 = process.argv.includes("--mr2"); // final decider: frozen MR vs PixelLab's running-8-frames template
const CHARACTER = "f69d3f89-043e-4e04-b904-dd97871c5d06";
const DIRS = ["south", "east"] as const,
  SEEDS = TEMPLATE_ONLY ? [97, 101] : [71, 83],
  CAP = MR2 ? 55 : TEMPLATE_ONLY ? 45 : 90;
const DIR = path.join(OUT, CASE);
const fx: MotionFixture =
  CASE === "chibi-run"
    ? fixture("chibi")
    : JSON.parse(fs.readFileSync(path.join(OUT, "benchmark84.json"), "utf8"));
const LOOKS =
  CASE === "chibi-run"
    ? "a short bald humanoid in a gray shirt and dark pants"
    : "a bald human man with plain bare skin, barefoot and empty hands";
const TEXT = `${ACTION === "run" ? "running" : "walking"}, continuous even strides, no stopping or settling into a standing pose`;
const action = bodyAction({
  id: ACTION,
  action: ACTION,
  poseStyle: "visible-side-v1",
});
const b64 = async (im: { w: number; h: number; data: Uint8ClampedArray }) =>
  Buffer.from(await encodePngBytes(im)).toString("base64");
const strip = (k: Keypoint[]) => k.map(({ label, x, y }) => ({ label, x, y }));

function mocap(dir: DirectionName) {
  const d = newDocument(library, fx, clipOf(ACTION), dir);
  const len = clipOf(ACTION).duration;
  d.times = Array.from({ length: 8 }, (_, i) => (len * i) / 8);
  d.padding = 0;
  d.buffer = false;
  return renderPoses(d).poses.map(strip);
}
async function render(
  arm: string,
  dir: DirectionName,
  seed: number,
  keypoints: Keypoint[][],
) {
  const ref = fx.references[dir]!;
  const req = rawClip({
    first: ref.png,
    rest: strip(ref.keypoints),
    keypoints,
    description: LOOKS,
    action,
    dir: dir as never,
    seed: seed + 101,
  });
  const label = `${CASE} ${arm} ${dir} s${seed}`;
  if (DRY) return console.log("DRY", label, keypoints.length, "frames");
  return paid({
    arm: CASE!,
    label,
    file: path.join(DIR, `${arm}_${dir}_s${seed}`),
    req,
    estimate: poseCallGens(keypoints.length),
    armCap: CAP,
  });
}
/** Motion request -> Studio frame handling -> estimate-skeleton per frame -> joints (one interior gap bridged). */
async function measuredMotion(
  arm: string,
  dir: DirectionName,
  seed: number,
  req: Req,
  echo: "required" | "optional",
  estimate: number,
) {
  if (DRY) {
    console.log(
      "DRY",
      arm,
      "motion",
      dir,
      seed,
      req.path,
      JSON.stringify(req.body)
        .replace(/"[A-Za-z0-9+/=]{200,}"/g, '"<png>"')
        .slice(0, 300),
    );
    return null;
  }
  const raw = await paid({
    arm: CASE!,
    label: `${CASE} ${arm} motion ${dir} s${seed}`,
    file: path.join(DIR, `${arm}motion_${dir}_s${seed}`),
    req,
    estimate,
    armCap: CAP,
  });
  if (!raw) return null;
  const n = 8;
  if (raw.length !== n && raw.length !== n + 1) {
    console.log(
      `${arm} ${dir} s${seed}: ${raw.length} frames returned, case stopped`,
    );
    return null;
  }
  if (echo === "required" && raw.length === n)
    console.log(
      `${arm} ${dir} s${seed}: N frames for a documented N+1 (Studio keeps them, flags short)`,
    );
  const frames = (raw.length === n + 1 ? raw.slice(1) : raw).map((im) => {
    const r = normalize(im, fx.cell.w, fx.cell.h, 128, fx.cell.w, 0);
    if (r.cutPx)
      throw new Error(
        `${arm} ${dir} s${seed}: motion exceeds the ${fx.cell.w} px frame`,
      );
    return r.img;
  });
  const measured: (Keypoint[] | undefined)[] = [];
  for (const [i, f] of frames.entries()) {
    await save(path.join(DIR, `${arm}motion_${dir}_s${seed}.norm.${i}.png`), f);
    const input = skeletonInput(f);
    const res = await paidJson({
      arm: CASE!,
      label: `${CASE} ${arm} joints ${dir} s${seed} f${i}`,
      file: path.join(DIR, `${arm}joints_${dir}_s${seed}_f${i}`),
      req: routes.estimateSkeleton(png(await b64(input.image))),
      estimate: 0.1,
      armCap: CAP,
    });
    const pts = res && checkedKeypoints(res.keypoints);
    measured.push(
      pts ? checkedKeypoints(unpadSkeleton(pts, input, f)) : undefined,
    );
  }
  const kps = motionJoints(measured);
  if (!kps) console.log(`${arm} ${dir} s${seed}: joints missing, case stopped`);
  return kps?.map(strip) ?? null;
}

console.log("spent so far", spent(), CASE, spent(CASE));
await Promise.all(
  DIRS.flatMap((dir) =>
    SEEDS.map(async (seed) => {
      const m = mocap(dir);
      if (!TEMPLATE_ONLY) await render("M0", dir, seed, m);
      await render(
        MR2 ? "MR2" : "MR",
        dir,
        seed,
        styleRun(m, fx.references[dir]!.keypoints, fx.cell.w, fx.cell.h),
      );
      if (CASE === "chibi-run") {
        const rec = {
          manifest: {
            name: "chibi",
            rig: {
              cell: fx.cell,
              view: "low top-down",
              directions: fx.directions,
              rest: {},
            },
          },
          character: { looks: LOOKS },
        } as never;
        const spec = {
          id: "run",
          action: "run",
          text: TEXT,
          frames: 8,
          motionSource: "standalone" as const,
          seed,
          poseStyle: "visible-side-v1" as const,
          items: [],
          animation: { model: "skeleton-v3" as const, loop: true },
        };
        const p = await measuredMotion(
          "P",
          dir,
          seed,
          moveMotionRequest(
            rec,
            spec as never,
            dir as never,
            fx.references[dir]!.png,
          ),
          "required",
          2,
        );
        if (p) await render("P", dir, seed, p);
      } else {
        const rec = {
          manifest: {
            name: "bench64",
            rig: {
              cell: fx.cell,
              view: "low top-down",
              directions: fx.directions,
              rest: {},
            },
          },
          character: { id: CHARACTER, looks: LOOKS },
        } as never;
        const spec = {
          id: "walk",
          action: "walk",
          text: TEXT,
          frames: 8,
          motionSource: "managed" as const,
          seed,
          poseStyle: "visible-side-v1" as const,
          items: [],
          animation: { model: "skeleton-v3" as const, loop: true },
        };
        if (!TEMPLATE_ONLY) {
          const p = await measuredMotion(
            "P",
            dir,
            seed,
            moveMotionRequest(rec, spec as never, dir as never),
            "optional",
            2,
          );
          if (p) await render("P", dir, seed, p);
        }
        const tmpl = TEMPLATE_ONLY
          ? {
              name: "run",
              template: "running-8-frames",
              action: "running",
              frames: 8,
            }
          : BASE_ANIMS.find((a) => a.name === "walk")!;
        const t = await measuredMotion(
          "T",
          dir,
          seed,
          routes.animateCharacter(
            baseAnimation("skeleton-v3", CHARACTER, tmpl, [dir as never], seed),
          ),
          "optional",
          4,
        );
        if (t) await render("T", dir, seed, t);
      }
    }),
  ),
);
console.log("spent total", spent(), CASE, spent(CASE));
