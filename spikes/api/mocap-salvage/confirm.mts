// Confirmation (2026-11-23): run, hurt and death with the pilot's matched setup. Pilot header follows.
// Pilot (2026-11-23): one overhead strike on the managed adult benchmark, south and east, seeds 31 and 47.
//   M0  corrected mocap (motion.ts, Lab attack weights), 8 frozen sample times, XY only (no depth or z_index)
//   A   the Studio's authored Slash table (what the Slash pill renders)
//   P   the Studio's managed described route: /characters/animations PixMiniMax, estimate-skeleton per frame, raw render
// Every arm renders through the same raw skeleton-v3 request with the same reference art, rest joints, description,
// action text, view and render seed (motion seed + 101). Run: node --experimental-transform-types --env-file=<.env>
// mocap-salvage/pilot.mts [--dry]. Paid calls go through c25/lib.mts paid()/paidJson(): ledger, caps, never resent.
import "./env.mts";
import fs from "node:fs";
import path from "node:path";
import { paid, paidJson, save, spent, OUT } from "../c25/lib.mts";
import { library, clipOf } from "./arms.mts";
import {
  newDocument,
  renderPoses,
  type MotionFixture,
} from "../../../app/src/ui/motion-lab/model.ts";
import { rawClip, poseCallGens } from "../../../app/src/lib/rig/clips.ts";
import {
  authoredPoses,
  armDepth,
  fromApi,
  toApi,
  LABELS,
} from "../../../app/src/lib/rig/poses.ts";
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
import { styleRun } from "./style.mts";
import { normalize } from "../../../app/src/lib/rig/normalize.ts";
import { padImg } from "../../../app/src/lib/items/items.ts";
import { routes, png } from "../../../app/src/lib/pixellab/routes.ts";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import type { Keypoint, DirectionName } from "../../../app/src/lib/rig/rig.ts";

const DRY = process.argv.includes("--dry");
const CHARACTER = "f69d3f89-043e-4e04-b904-dd97871c5d06";
const LOOKS = "a bald human man with plain bare skin, barefoot and empty hands";
const ACTION = process.argv.find((a) =>
  ["run", "hurt", "death"].includes(a),
) as "run" | "hurt" | "death";
if (!ACTION) throw new Error("usage: confirm.mts run|hurt|death [--dry]");
// What the Studio sends: Run pill text (described, looping); Hurt and Death pills use authored tables (A), and P is what a
// user gets by typing the same move.
const CFG = {
  run: {
    id: "run",
    text: "running, continuous even strides, no stopping or settling into a standing pose",
    loop: true,
    authored: undefined,
  },
  hurt: {
    id: "recoil",
    text: "recoil from a hit to the chest",
    loop: false,
    authored: "hurt",
  },
  death: {
    id: "fall-backward",
    text: "fall backward and lie still",
    loop: false,
    authored: "death",
  },
}[ACTION];
const TEXT = CFG.text,
  ID = CFG.id;
const DIRS = ["south", "east"] as const;
const FOLLOW = process.argv.includes("--follow"); // run follow-up: fresh seeds, adds MR (style.mts)
const SEEDS = FOLLOW ? [53, 61] : [31, 47];
const PILOT_CAP = 80; // pilot only
const ACTION_CAP = 70;
const FOLLOW_CAP = 70; // raised from 60 after the 64 px canvas proved too tight for managed motion (deviation, logged)
const PAD = 10; // managed motion returns 84x84 with the registered 64 px standing at (10, 10)
// Frozen before any render: anticipation, raise, strike, impact (0.4 s), follow-through, recovery, end.
const clipLen = clipOf(ACTION).duration;
// Frozen before any render: 8 samples, uniform over the loop for run, open (first and last kept) for hurt and death.
const M_TIMES = Array.from({ length: 8 }, (_, i) =>
  ACTION === "run" ? (clipLen * i) / 8 : (clipLen * i) / 7,
);
const DIR = path.join(OUT, FOLLOW ? `${ACTION}-follow` : ACTION);
const MOTION_DIR = DIR;
const key = process.env.PIXELLAB_API_KEY_AGENT_DEV!;

const b64 = async (im: { w: number; h: number; data: Uint8ClampedArray }) =>
  Buffer.from(await encodePngBytes(im)).toString("base64");
const action = bodyAction({
  id: ID,
  action: CFG.authored ?? (ACTION === "run" ? "run" : undefined),
  poseStyle: "visible-side-v1",
});

// The benchmark's registered art and estimated 2D joints, read free and cached so every run uses identical inputs.
async function benchmark(): Promise<MotionFixture> {
  const file = path.join(OUT, "benchmark84.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const ch = await (
    await fetch(`https://api.pixellab.ai/v2/characters/${CHARACTER}`, {
      headers: { Authorization: "Bearer " + key },
    })
  ).json();
  const references: MotionFixture["references"] = {};
  for (const d of DIRS) {
    const bytes = new Uint8Array(
      await (await fetch(ch.rotation_urls[d])).arrayBuffer(),
    );
    const k = ch.skeletons["2d_references"][d].keypoints;
    references[d] = {
      png: Buffer.from(bytes).toString("base64"),
      keypoints: LABELS.map((label) => ({
        label,
        x: k[label].x,
        y: k[label].y,
      })),
    };
  }
  const c27 = library.fixtures.find((f) => f.id === "c27man")!;
  const W = ch.size.width + 2 * PAD,
    H = ch.size.height + 2 * PAD;
  for (const d of DIRS) {
    const r = references[d]!;
    const padded = padImg(
      await decodePngBytes(new Uint8Array(Buffer.from(r.png, "base64"))),
      PAD,
    );
    references[d] = {
      png: await b64(padded),
      keypoints: r.keypoints.map((k) => ({
        label: k.label,
        x: (k.x * ch.size.width + PAD) / W,
        y: (k.y * ch.size.height + PAD) / H,
      })),
    };
  }
  const fx: MotionFixture = {
    id: "bench64",
    name: "Managed adult benchmark",
    cell: { w: W, h: H },
    pivot: { x: W / 2, y: H - PAD },
    camera: c27.camera,
    directions: DIRS.map((id) => ({ id })),
    references,
  };
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(fx));
  return fx;
}

function mocapPoses(fx: MotionFixture, dir: DirectionName): Keypoint[][] {
  const d = newDocument(library, fx, clipOf(ACTION), dir);
  d.times = M_TIMES;
  // Same 84 px canvas as every other arm: the Lab's extra fall padding and duplicated terminal buffer are not used.
  d.padding = 0;
  d.buffer = false;
  return renderPoses(d).poses.map((p) =>
    p.map(({ label, x, y }) => ({ label, x, y })),
  );
}

async function render(
  arm: string,
  fx: MotionFixture,
  dir: DirectionName,
  seed: number,
  keypoints: Keypoint[][],
  act = action,
) {
  const ref = fx.references[dir]!;
  const req = rawClip({
    first: ref.png,
    rest: ref.keypoints.map(({ label, x, y }) => ({ label, x, y })),
    keypoints,
    description: LOOKS,
    action: act,
    dir: dir as never,
    seed: seed + 101,
  });
  const label = `${ACTION} ${arm} ${dir} s${seed}`;
  if (DRY) {
    console.log(
      "DRY",
      label,
      req.path,
      keypoints.length,
      "frames",
      poseCallGens(keypoints.length),
      "gens",
      "| action:",
      act,
    );
    return null;
  }
  return paid({
    arm: FOLLOW ? `${ACTION}-follow` : ACTION,
    label,
    file: path.join(DIR, `${arm}_${dir}_s${seed}`),
    req,
    estimate: poseCallGens(keypoints.length),
    armCap: FOLLOW ? FOLLOW_CAP : ACTION_CAP,
  });
}

async function described(fx: MotionFixture, dir: DirectionName, seed: number) {
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
    id: ID,
    action: ACTION === "run" ? "run" : undefined,
    text: TEXT,
    frames: 8,
    motionSource: "managed" as const,
    seed,
    poseStyle: "visible-side-v1" as const,
    items: [],
    ...(CFG.loop
      ? { animation: { model: "skeleton-v3" as const, loop: true } }
      : {}),
  };
  const req = moveMotionRequest(rec, spec as never, dir as never);
  if (DRY) {
    console.log("DRY P-motion", dir, seed, req.path, JSON.stringify(req.body));
    return null;
  }
  const file = path.join(MOTION_DIR, `Pmotion_${dir}_s${seed}`);
  const raw = await paid({
    arm: FOLLOW ? `${ACTION}-follow` : ACTION,
    label: `${ACTION} P motion ${dir} s${seed}`,
    file,
    req,
    estimate: 2,
    armCap: FOLLOW ? FOLLOW_CAP : ACTION_CAP,
  });
  if (!raw) return null;
  // Studio: a returned N+1 drops the leading echo (optional-leading for managed motion); exactly N is used as is.
  if (raw.length !== 8 && raw.length !== 9) {
    console.log(
      `P motion ${dir} s${seed}: ${raw.length} frames, stopping this case`,
    );
    return null;
  }
  const frames = (raw.length === 9 ? raw.slice(1) : raw).map((im) => {
    const n = normalize(im, fx.cell.w, fx.cell.h, 128, fx.cell.w, 0);
    if (n.cutPx) throw new Error(`P motion ${dir} s${seed} exceeds the frame`);
    return n.img;
  });
  for (const [i, f] of frames.entries())
    await save(path.join(DIR, `Pmotion_${dir}_s${seed}.norm.${i}.png`), f);
  const measured: (Keypoint[] | undefined)[] = [];
  for (const [i, f] of frames.entries()) {
    const input = skeletonInput(f);
    const res = await paidJson({
      arm: FOLLOW ? `${ACTION}-follow` : ACTION,
      label: `${ACTION} P joints ${dir} s${seed} f${i}`,
      file: path.join(DIR, `Pjoints_${dir}_s${seed}_f${i}`),
      req: routes.estimateSkeleton(png(await b64(input.image))),
      estimate: 0.1,
      armCap: FOLLOW ? FOLLOW_CAP : ACTION_CAP,
    });
    const pts = res && checkedKeypoints(res.keypoints);
    measured.push(
      pts ? checkedKeypoints(unpadSkeleton(pts, input, f)) : undefined,
    );
  }
  const kps = motionJoints(measured);
  if (!kps) {
    console.log(
      `P ${dir} s${seed}: joints missing on ${measured.filter((m) => !m).length} frames, stopping this case`,
    );
    return null;
  }
  return kps.map((p) => p.map(({ label, x, y }) => ({ label, x, y })));
}

const fx = await benchmark();
console.log("spent so far", spent(), ACTION, spent(ACTION));
await Promise.all(
  DIRS.flatMap((dir) =>
    SEEDS.map(async (seed) => {
      const m = mocapPoses(fx, dir);
      const rest = fromApi(fx.references[dir]!.keypoints, fx.cell);
      await render("M0", fx, dir, seed, m);
      if (FOLLOW)
        await render(
          "MR",
          fx,
          dir,
          seed,
          styleRun(m, fx.references[dir]!.keypoints, fx.cell.w, fx.cell.h),
        );
      if (CFG.authored) {
        const a = authoredPoses(
          CFG.authored,
          rest,
          dir,
          fx.cell.w,
          "visible-side-v1",
        ).map((p) => armDepth(toApi(p, fx.cell), dir));
        await render(
          "A",
          fx,
          dir,
          seed,
          a,
          bodyAction({
            id: CFG.authored,
            action: CFG.authored,
            poseStyle: "visible-side-v1",
          }),
        );
      }
      const p = await described(fx, dir, seed);
      if (p) await render("P", fx, dir, seed, p);
    }),
  ),
);
console.log("spent total", spent(), ACTION, spent(ACTION));
