// Request builders for the 2026-11-23 mocap salvage study. Pure: no network, no spending.
// Every raw skeleton-v3 render shares the body description, the Studio's action text and the render seed, so arms differ
// only in the joints they send (and the frame count each route produces).
import fs from "node:fs";
import path from "node:path";
import {
  newDocument,
  renderPoses,
  paddedReference,
  type MotionLibrary,
  type MotionFixture,
} from "../../../app/src/ui/motion-lab/model.ts";
import { rawClip, poseCallGens } from "../../../app/src/lib/rig/clips.ts";
import {
  authoredPoses,
  armDepth,
  fromApi,
  toApi,
} from "../../../app/src/lib/rig/poses.ts";
import {
  bodyAction,
  moveMotionRequest,
} from "../../../app/src/studio/create.ts";
import {
  decodePngBytes,
  encodePngBytes,
} from "../../../app/src/lib/image/pngraw.ts";
import type { Keypoint, DirectionName } from "../../../app/src/lib/rig/rig.ts";
import type { Req } from "../../../app/src/lib/pixellab/routes.ts";

const root = path.resolve(import.meta.dirname, "../../..");
export const library: MotionLibrary = JSON.parse(
  fs.readFileSync(
    path.join(root, "app/dev-fixtures/motion-lab/library.json"),
    "utf8",
  ),
);
export const fixture = (id: string) =>
  library.fixtures.find((f) => f.id === id)!;
export const clipOf = (id: string) => library.clips.find((c) => c.id === id)!;

export type Action = "walk" | "run" | "attack" | "hurt" | "death";
export type Arm = "M" | "M0" | "A" | "P";
/** The Studio move that a user would make for each mocap action. */
export const STUDIO: Record<
  Action,
  { id: string; authored?: string; text: string; loop?: boolean }
> = {
  walk: {
    id: "walk",
    text: "walking, continuous even strides, no stopping or settling into a standing pose",
    loop: true,
  },
  run: {
    id: "run",
    text: "running, continuous even strides, no stopping or settling into a standing pose",
    loop: true,
  },
  attack: {
    id: "slash",
    authored: "slash",
    text: "overhead strike with the right arm",
  },
  hurt: {
    id: "hurt",
    authored: "hurt",
    text: "recoil from a hit to the chest",
  },
  death: {
    id: "death",
    authored: "death",
    text: "fall backward and lie still",
  },
};
/** Same subject text for every arm (the Studio sends the character's looks). */
export const LOOKS: Record<string, string> = {
  c27man: "a bald human man with plain bare skin, barefoot and empty hands",
  chibi: "a short bald humanoid in a gray shirt and dark pants",
  body128: "a bald human man with plain bare skin, barefoot and empty hands",
};

const b64 = async (png: Uint8Array) => Buffer.from(png).toString("base64");
export const refPng = (fx: MotionFixture, dir: DirectionName) =>
  fx.references[dir]!.png;

export interface RenderPlan {
  kind: "render";
  req: Req;
  estimate: number;
  frames: number;
  padding: number;
}
const studioSpec = (action: Action) => ({
  id: STUDIO[action].id,
  action: STUDIO[action].authored,
  poseStyle: "visible-side-v1" as const,
});
const renderReq = async (
  fx: MotionFixture,
  dir: DirectionName,
  action: Action,
  rest: Keypoint[],
  keypoints: Keypoint[][],
  seed: number,
  padding: number,
): Promise<RenderPlan> => {
  const image = await decodePngBytes(
    new Uint8Array(Buffer.from(refPng(fx, dir), "base64")),
  );
  const first = await b64(
    await encodePngBytes(padding ? paddedReference(image, padding) : image),
  );
  return {
    kind: "render",
    req: rawClip({
      first,
      rest,
      keypoints,
      description: LOOKS[fx.id],
      action: bodyAction(studioSpec(action)),
      dir: dir as never,
      seed,
    }),
    estimate: poseCallGens(keypoints.length),
    frames: keypoints.length,
    padding,
  };
};

/** M / M0: the corrected converter with Motion Lab defaults (timing, padding, death buffer). */
export async function mocapRender(
  fxId: string,
  action: Action,
  dir: DirectionName,
  seed: number,
  depth: boolean,
) {
  const fx = fixture(fxId);
  const d = newDocument(library, fx, clipOf(action), dir);
  const { result, poses } = renderPoses(d);
  const strip = (k: Keypoint[]) =>
    k.map(({ label, x, y }) => ({ label, x, y }));
  const kps = depth ? poses : poses.map(strip);
  return renderReq(
    fx,
    dir,
    action,
    depth ? result.rest : strip(result.rest),
    kps,
    seed,
    d.padding,
  );
}

/** A: the Studio's authored tables (Slash, Hurt, Death pills), exactly as the body render builds them. */
export async function authoredRender(
  fxId: string,
  action: Action,
  dir: DirectionName,
  seed: number,
) {
  const fx = fixture(fxId),
    a = STUDIO[action].authored;
  if (!a) return undefined;
  const rest = fx.references[dir]!.keypoints;
  const kps = authoredPoses(
    a,
    fromApi(rest, fx.cell),
    dir,
    fx.cell.w,
    "visible-side-v1",
  ).map((p) => armDepth(toApi(p, fx.cell), dir));
  return renderReq(fx, dir, action, rest, kps, seed, 0);
}

/** P step 1: the Studio's standalone described motion (PixMiniMax from the standing frame), 8 frames. */
export function describedMotion(
  fxId: string,
  action: Action,
  dir: DirectionName,
  seed: number,
): { req: Req; estimate: number; frames: number } {
  const fx = fixture(fxId);
  const rec = {
    manifest: {
      name: fxId,
      rig: {
        cell: fx.cell,
        view: "low top-down",
        directions: fx.directions,
        rest: {},
      },
    },
    character: { looks: LOOKS[fxId] },
  } as never;
  const spec = {
    id:
      STUDIO[action].id === "slash"
        ? "overhead-strike"
        : STUDIO[action].id === "death"
          ? "fall-backward"
          : STUDIO[action].id === "hurt"
            ? "recoil"
            : STUDIO[action].id,
    action: action === "walk" || action === "run" ? action : undefined,
    text: STUDIO[action].text,
    frames: 8,
    motionSource: "standalone" as const,
    seed,
    poseStyle: "visible-side-v1" as const,
    ...(STUDIO[action].loop
      ? { animation: { model: "skeleton-v3" as const, loop: true } }
      : {}),
  };
  return {
    req: moveMotionRequest(rec, spec as never, dir as never, refPng(fx, dir)),
    estimate: 1,
    frames: 8,
  };
}
/** P step 3: render the measured described motion through the same raw skeleton-v3 request. */
export async function describedRender(
  fxId: string,
  action: Action,
  dir: DirectionName,
  seed: number,
  measured: Keypoint[][],
) {
  const fx = fixture(fxId);
  return renderReq(
    fx,
    dir,
    action,
    fx.references[dir]!.keypoints,
    measured,
    seed,
    0,
  );
}
