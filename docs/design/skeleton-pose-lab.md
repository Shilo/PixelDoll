# Skeleton pose lab (future tool, 2026-10-26)

Follow-up: the [October 27 diagnosis](../research/2026-10-27-animation-diagnosis.md) reproduces remaining depth and support-switch defects in `retarget2.mts`. Its motion is not yet validated as clean or universally proportion-independent. The lint and fit claims below are proposed goals, not proven acceptance criteria.

Status: **proposal, not built.** Skeleton-v3 is deferred by the owner until PixelLab improves it, and this tool is its
companion: build it when skeleton-v3 is picked up again, or to give PixelLab a reproducible bug report. Evidence:
[generation-pipeline-review §15–§16](../research/generation-pipeline-review-2026-10-25.md); the skeleton-free route is
a separate deferred board card.

## Why

Round 8 measured that **most of the uncanny skeleton-v3 look came from the keypoints we sent**, not from PixelLab's
renderer. The faults:
- a lurching root;
- a staggered reference stance;
- the chest twist leaking into the legs and head;
- straightened legs;
- limbs swinging sideways;
- a T-pose wind-up;
- a deep squat;
- the wrong attacking hand (in text animation).

A Spine-style pose tool fixes the input side. Its jobs:

1. **Improve** skeleton-v3 output: start from a retargeted mocap template, hand-polish the key poses, and fix timing.
2. **Dry-run for free:** see the move on the real sprite and lint the poses before paying 3 generations per render.
3. **Separate input from renderer:** if a hand-polished, lint-clean sequence still renders badly, the fault is
   PixelLab's. The export is the bug report.

It cannot fix the renderer's own limits:
- the whole body is redrawn every frame (the head and chest shift);
- the last frame of a lying pose dissolves;
- props are invented unless the wording forbids them;
- there are no spine, hair or cloth joints;
- poses land within about ±1 px;
- there are at most 15 frames per call.

## Non-goals

- **Not a Spine clone.** Meshes, weights, skins and slots do not apply: PixelLab takes 18 joints per frame and redraws
  the pixels itself.
- **Not the [Frame Editor](frame-editor/README.md).** That edits pixels; this edits poses.
- **No backend.** It stays client-only, like the app, and never handles the token outside the existing queue.

## PixelLab contract (raw `/animate-with-skeleton-v3`)

| Constraint | Value |
|---|---|
| Joints | 18 labels: NOSE, NECK, RIGHT/LEFT SHOULDER, ELBOW, ARM (wrist), HIP, KNEE, LEG (ankle), EYE, EAR. No spine, hands or feet beyond these. |
| Per joint | `x`, `y` (0–1 of the frame), optional `depth` (0–255, nearer = higher) and `z_index` (integer draw order) |
| Frames | 3–15 per call, ≤ 256 px; `first_frame` + `first_frame_keypoints` = the rest view |
| Cost and time | 2 gens (≤ 3 frames), 3 (≤ 12), 4 (13–15); 2–5 min |
| Measured | about ±1 px pose adherence; `depth`/`z_index` accepted but made no visible difference on authored poses (X1); the ZIP export has no keypoints |

## Features

### 1. Mocap template library

- **Source:** the [Quaternius Universal Animation Library](https://quaternius.com) (UAL1, **CC0**); credit is optional.
- **Not shipped:** the 23 MB GLB. A bake script turns the useful clips into small JSON tables of per-bone world
  rotations and the pelvis path, at about 30 fps. It is offline, under `spikes/api/mocap/`, and outputs to
  `app/public/mocap/`.
- **Clips (about 20):**

  | Group | UAL1 clips |
  |---|---|
  | Idle | `Idle_Loop`, `Idle_Tired_Loop`, `Sword_Idle` |
  | Locomotion | `Walk_Loop`, `Jog_Fwd_Loop`, `Sprint_Loop` |
  | Attacks | `Sword_Attack`, `Sword_Attack_Standing`, `Punch_Jab`, `Punch_Cross`, `Kick` |
  | Spell | `Spell_Simple_Enter`/`Shoot`/`Exit` |
  | Reactions | `Hit_Chest`, `Hit_Head`, `Death01`, `Death02` |
  | Mobility | `Jump_Start`/`Loop`/`Land`, `Roll`, `Dodge_Left`/`Right` |

  Climbing, swimming, sitting and props are left out.
- **Retarget at load** with the 2D cut-out math of `spikes/api/mocap/retarget2.mts`:
  - each drawn bone keeps its length and turns by the mocap bone's change of screen angle;
  - foreshortening is softened;
  - facing comes from the hips only;
  - the head rides the neck;
  - the root follows the pelvis.

  This fits any body's drawn proportions, chibi included.
- **Knobs per template:**

  | Knob | What it controls |
  |---|---|
  | `face` | facing lock |
  | `twist` | chest twist |
  | `lean` | spine bend |
  | `travel` | step and lunge distance |
  | `gain` | motion amount (subtle idles need about ×3) |
  | `legs` | squat depth |
  | `arms` | flailing balance arms |
  | `az` | the camera bearing for the clip, so a fall reads in south |

- **Key-pose picking:** frames are chosen at key times, not evenly; even spacing missed the strike of `Sword_Attack`.
  A hand-speed curve suggests the times (`spikes/api/x27/speed.mts`).

### 2. Pose editor

- **Timeline:** frames with **per-frame durations**. Hold a pose with time, never with repeated frames: three identical
  final frames preceded a dissolved last frame in round 8.
- **Editing:**
  - FK drag: rotate a joint about its parent, bone lengths locked;
  - optional 2-bone IK for wrists and ankles;
  - onion skin of the previous and next frames;
  - mirror a pose left/right;
  - copy, paste and interpolate frames.
- **Per-joint draw order** (`z_index`) and `depth`, shown as dot size, as in the round 8 strips.
- **The sword hand is explicit.** A skeleton names the attacking hand, which the text models get wrong.

### 3. Dry run (free)

- **Stick figure:** joints over a gray rest ghost (exists: `strip()` in `spikes/api/mocap/mocap.mts`).
- **Paper-puppet preview of the real sprite:**
  1. Cut the rest sprite into parts along its rest skeleton: each opaque pixel goes to the nearest bone segment (head,
     torso, upper/lower arm, upper/lower leg), with the draw order from the rest `z_index`.
  2. For each frame, move each part rigidly with its bone's 2D rotation and translation, using inverse mapping and
     nearest-neighbor sampling so there are no holes.

  It shows readability, silhouettes, overlaps, cell overflow and the T-pose look in the character's own pixels.
  It cannot turn a limb toward the camera or redraw anything, so it predicts the pose, not PixelLab's final
  quality.
- **Pose lint**, with the round 8 failure thresholds:

  | Check | Fails when |
  |---|---|
  | Bone length vs the rest view | outside 0.4–1.2× (stretchy limbs) |
  | Hip center drift in a loop | > 2 px (PixelLab's own walk drifts ≤ 1.1 px) |
  | Foot sliding while planted | > 1 px |
  | Head turn per frame | > 20° |
  | Legs crossing the midline | in a south walk or run |
  | Support knee bend | < 10° (stiff legs) |
  | Joints inside the cell | fewer than 2 px from the edge |
  | Identical consecutive frames | any |
  | Lying pose seen end-on (body < 20 px tall in south) | any |
  | Action wording | names a weapon or "dying"; suggest "… empty hands, no weapon, no props, no effects" |

### 4. Render and compare (paid)

- One raw call per move and direction, using the existing request builder (`clips.rawClip`) and the app queue.
- **Overlays:** the requested skeleton over the output; optionally `estimate-skeleton` on chosen frames (0.1 gen each)
  for the per-joint error.
- **Comparisons:** best-of-N seeds side by side; re-render one direction without touching the others.
- **Body QA** from round 8 (`spikes/api/x27/qa.mts`): props drawn into the body, detached pixels, area change vs the
  rest view.

### 5. Bug report export

A folder or ZIP with no token:
- the rest image and keypoints;
- the frame keypoints;
- the request body (images as files);
- the outputs;
- the lint results;
- one sentence per defect.

It is meant for PixelLab ("identical keypoints in frames 7–9, frame 9 dissolved").

## Placement and reuse

- **Start as a dev-only page** in `app/src/ui/` next to the milestone pages; move it into the Studio only if it earns a
  place.
- **Reuse:**
  - `app/src/lib/rig/clips.ts` (`rawClip`, `poseCallGens`, `paddedPoses`);
  - the queue and plan limits;
  - `image/pngraw.ts`;
  - the rig's stored rest keypoints.
- **Promote, don't copy:** the retarget math moves from `spikes/api/mocap/retarget2.mts` into `app/src/lib/rig/` as one
  module. The spike keeps importing it.

## Phases

| Phase | Scope | Cost |
|---|---|---|
| P0 | Bake script and JSON tables; retarget module in `app/src/lib/rig/` with self-tests; pose lint | free |
| P1 | Dev page: template picker and knobs, timeline, FK editor, stick and puppet preview | free |
| P2 | Render and compare; proof set: attack, hurt and die in S and E, before and after hand polish, blind side by side with round 8 | < 30 gens |
| P3 | Bug report export; send to PixelLab with the owner's approval | free |

## Success criteria

- **The lint catches every round 8 failure** on the stored round 8 keypoints, with no false alarm on PixelLab's own
  walk keypoints.
- **The puppet preview** flags the T-pose wind-up and the south end-on fall before any render.
- **In a blind review**, the owner prefers the hand-polished renders to round 8's for attack, hurt and die. If not,
  the bug report shows the remaining faults with lint-clean input.

## Open questions

1. Which body sizes and shapes to qualify: default 64 px, a 128 px body, chibi?
2. Should templates be curated per game style, such as top-down action vs RPG?
3. When skeleton-v3 is picked up again, does this page ship to users, as the "joint editor" of approach 4 in
   §11.3, or stay dev-only?
