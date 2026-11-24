# Is 3D motion (mocap) salvageable for PixelDoll moves? (2026-11-23)

**Verdict: not with this route.** In matched blind comparisons, converted 3D clips lost to a route PixelDoll already has
or PixelLab already offers for every move tested:

- Strike, hurt and walk lost outright.
- The death fall did not fit the Studio frame as tested.
- Run beat only the Studio's weak described run. PixelLab's own `running-8-frames` template then won or tied on every
  sheet, including against a corrected mocap run.

Keep the Motion Lab and converter as research tooling. Do not ship mocap presets.

Spend: **351.7 of 1,000** approved generations, 397 paid calls, 0 errors, 0 lost or resent requests. The ledger is
`spikes/api/out/mocap-salvage-2026-11-23/ledger.jsonl` (ignored). The plan and its adversarial pre-run review are in
[plan.md](plan.md).

## Why the earlier strips looked so bad

The Oct 27 strips the owner judged "horrible" came from the older retargeter. Measured offline from the stored requests
(`spikes/api/mocap-salvage/corrected.mts`), it:

- sank the head 1.7-5.6 px into the neck;
- raised the shoulders to neck height;
- bent knees to 95 degrees;
- crouched up to 8 px.

The corrected Oct 28 converter (`app/src/lib/rig/motion.ts`) fixed the head, shoulders and crouch. Its 84 renders were
gone: the jobs had expired and the frames had only been kept in a browser. This study therefore re-rendered it.

## Method

**Bodies.** The main body is the managed adult benchmark `f69d3f89-…` (64 px, mannequin, registered on PixelLab). All its
arms use the 84 px canvas that managed motion returns, with the registered art at (10, 10). The run replication used the
Lab's chibi (80 px, standalone route). The adult mocap projection borrows `c27man`'s calibrated camera; `c27man`'s art
differs from the benchmark.

**One renderer for every arm.** Every arm renders through the same raw `animate-with-skeleton-v3` request: the same
reference art and rest joints, description, view and render seed (motion seed + 101). The action text and frame count
follow each route as configured:

- the authored Slash table sends `slash`, while M0 and P send `overhead-strike`;
- the authored Hurt table sends `hurt` and renders 6 frames, while M0 and P send `recoil` and render 8.

So this compares routes as they ship. It does not isolate joint trajectories.

**Arms.**

| Arm     | What it is                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0**  | Corrected mocap with Motion Lab defaults, 8 frozen samples, XY joints only.                                                                                                                                                                                                                                                                                                           |
| **MR**  | M0 plus a joint fix for the run crouch: keep 35% of the pelvis drop and re-solve the knees by 2D IK. **It had a sign bug:** every knee bent to the wrong side, and unreachable ankles stretched the leg by up to 3.7 px (`style-v1-flipped.mts`). Codex found this in the final challenge.                                                                                            |
| **MR2** | The same idea with the bug fixed (`style.mts`): knees stay on their original side, segment lengths are exact, and the hip lift is reduced until both ankles are reachable. Checked offline with `knee-check.mts` (0 of 32 knees flipped, 0 px length error). Because of the reach limit, south and east frames 1 and 5 get no lift; the fix mainly applies to the east crouch frames. |
| **A**   | The Studio's authored tables (the Slash and Hurt pills), built exactly as the body render builds them.                                                                                                                                                                                                                                                                                |
| **P**   | The Studio's described route, which is what typing "stab" does: `moveMotionRequest` from `create.ts` (managed PixMiniMax on the registered character, or standalone `/animate-pixminimax` with the standing frame as `last_frame` for the chibi loop), then the Studio's echo handling and normalization, `estimate-skeleton` per frame, `motionJoints` and the raw render.           |
| **T**   | PixelLab skeleton-v3 templates on the managed character (`walking-8-frames`, `running-8-frames`), measured and rendered the same way.                                                                                                                                                                                                                                                 |

**Seeds and views.** South and east, two seeds per case, with fresh seeds for every new stage. MR2 reused the T seeds,
so it could be compared against the stored T renders.

**Blind review.**

- Arms were shuffled into lettered rows per sheet. The key stayed outside the folder reviewers saw.
- Each set had independent reviewers (Claude Opus, Claude Sonnet and Codex GPT 6.2 Sol; Opus was rate-limited for MR2).
  None was told the arm mapping.
- The rubric covered action read, anatomy and identity, facing, stability, critical defects and a ranking.
- Reviewers saw ordered 4x stills, not playback.
- The coordinating agent's own blind reads are recorded where made.
- Every first-place ballot is in [evidence/ballots.json](evidence/ballots.json). The sheets and keys are in
  [evidence/](evidence/).

**Decision rule, and how it drifted.** [plan.md](plan.md) pre-registered a pass rule over the non-walk actions, a P-only
comparator and second-body replication. Following the pre-run review, the study instead used a per-action rule: mocap
passes an action only if it is ranked first by majority on at least 3 of 4 sheets with no critical defect. It also added
the arms that actually ship (A, T) as comparators, and dropped the planned depth-hint arm (M) and the planned style arm
(MS). Those changes make mocap's bar higher (beat the best route, not only P), not lower. The rule for reopening run
after the bug fix was set by the Codex reviewer before MR2 was rendered: tie or beat T on at least 3 of 4 sheets, with
no critical defect, in both views.

## Results

| Set (seeds)                             | Arms         | Mocap first or tied      | Winner by majority                          | What reviewers saw in mocap                                                                                                                                                           |
| --------------------------------------- | ------------ | ------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overhead strike (31, 47)                | M0, A, P     | 0 of 4                   | **A** 4 of 4 (11 of 12 votes, plus my read) | East: the arm winds back horizontally, then gives a low forward hook. South: a readable overhead raise, then a sideways reach and a late dip. One challenger ranked south M0 above P. |
| Hurt (31, 47)                           | M0, A, P     | 0 of 4 (1 of 12 votes)   | A 3, P 1                                    | Near-static, or a forward-leaning walk stride with a facing change                                                                                                                    |
| Death                                   | not rendered | n/a                      | n/a                                         | The fall leaves the 84 px frame in both views. Its visual quality on a padded canvas was not tested. Oct 27/28 falls corrupted on the last frame.                                     |
| Run (31, 47)                            | M0, P        | 4 of 4                   | M0                                          | Near-kneel crouch at frames 2 and 6 (east), arm flapping (south). P often stalled on standing poses.                                                                                  |
| Run follow-up (53, 61)                  | M0, MR, P    | 4 of 4                   | MR                                          | South is still a flared-arm jog. MR's knees were flipped.                                                                                                                             |
| Run, chibi (71, 83)                     | M0, MR, P    | 4 of 4                   | mocap (M0 and MR tie in east)               | East is a convincing run. South is a short shuffle. Chibi P ended on its standing frame (`last_frame`), which favours mocap in the loop judgement.                                    |
| Walk (71, 83)                           | M0, MR, P, T | 0 of 4                   | P (south), T (east)                         | Hunched crouch-walk; dark eye band and spiky-hair artifacts                                                                                                                           |
| Run vs template (97, 101)               | MR, T        | 0 of 4 (2 of 12 votes)   | T 4 of 4                                    | MR's knees were flipped; this result is superseded by the next row                                                                                                                    |
| **Corrected run vs template (97, 101)** | MR2, T       | 1 of 4 (a tie, east 101) | **T** 3, tie 1                              | South: arms flared wide (one reviewer called it a critical flail). East: close to the template.                                                                                       |

## What this means

**Mocap.** The 18-point raw renderer reproduces mocap joints too literally. Real 3D locomotion includes deep knee folds,
wide arm carriage and forward lean, which read as crouching and flailing at 64 px. A 3D overhead strike projects to a
backward arm swing in profile. Correcting the knee bug brought the east run close to PixelLab's template, but the
template still won or tied every sheet and won both south sheets.

Per view, mocap is the cheapest route:

| Route           | Generations per view                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| Mocap           | about 3 (the render only)                                                     |
| Described route | about 4.8                                                                     |
| Template        | about 6.8 (3 for the template motion, 0.8 for joint checks, 3 for the render) |

That saving does not buy acceptable motion.

**Findings for the current Studio.** These are outside this study's scope and were recorded, not changed.

1. The Studio sends the walk template only when `motionSource` is unset (`create.ts` `moveMotionRequest`). Since
   `27b8cd064` (2026-11-21), the Move sheet always sets it to `managed` or `standalone`, so a Skeleton V3 Walk now always
   takes the described route. In this study, the walk template won east (on both seeds) and the described walk won
   south.
2. The Studio has no run template. PixelLab's `running-8-frames` beat mocap, which itself beat the described run. That
   suggests, but does not show directly, that the template beats the described run, because they were never compared on
   the same seeds.
3. Described loops can stall on or end at a standing pose. The chibi's standalone route requests the standing frame as
   `last_frame`. Several, not all, adult P runs started on a near-standing pose.
4. The authored Slash table was ranked first on every strike sheet.
5. PixelLab lists further mannequin templates (`taking-punch`, `falling-back-death`, `cross-punch`, kicks) that were not
   tested here.

## Recommended next steps

Update 2026-11-24: steps 1-4 were carried out in the [template study](../2026-11-24-template-study/README.md). Walk and Run
use templates on registered characters, Jump was added, Hurt stays authored (its template faces three-quarter in
south), and described loops drop exact standing seam frames.

In priority order. Each needs its own board card and approval; none was started.

1. **Restore the walk template for Skeleton V3 Walk (free to build, no study needed).** The Move sheet's Walk pill has
   not reached `walking-8-frames` since `27b8cd064`, and the template won the east view here. First confirm with the
   owner whether that change was intended. Then route the Walk pill on a registered character back to the template, and
   keep the described route for edited text and fallbacks.
2. **Add the run template for the Run pill.** `running-8-frames` beat every other run tested. It is wired the same way as
   walk (`BASE_ANIMS` in `routes.ts`). It costs about 2 generations more per view than the described run, so the price
   display must show that.
3. **Run a small template study for Hurt, Death and Slash (about 60-80 generations).** Compare `taking-punch`,
   `falling-back-death` and a strike template against the authored tables, using this study's harness (`stage2.mts`
   pattern, blind panel, fresh seeds). Adopt a template only where it beats the authored table.
4. **Fix the described route's standing-pose stalls in loops.** For a looping described move, do not request the
   standing frame as `last_frame`, or detect and replace near-standing frames at the loop seam. Prove it offline on the
   stored P frames in `spikes/api/out/mocap-salvage-2026-11-23/` first.
5. **Retire the mocap route.**
   - Close or redirect the "Replace skeleton-v3 animation for natural motion" card.
   - Keep the Motion Lab as research tooling, and do not extend the converter further.
   - Revisit only if PixelLab's renderer accepts richer input (hands, spine, feet), or a source with
     pixel-art-style motion appears.

## Limits

- Only bare mannequins were tested: no equipment, clothing or item layers.
- Reviewers saw ordered stills, not playback. GIFs are under the ignored output folder.
- The study used one managed adult and one standalone chibi, with two seeds per case. The final run result rests on one
  body and two or three reviewers per sheet.
- Death was judged on frame fit for the tested 84 px setup (the Lab's padding and terminal hold were disabled), plus
  older evidence. A padded or reframed death remains untested.
- The adult camera came from `c27man`. A camera calibrated to the benchmark itself might project somewhat differently.

## Reproduce

From `spikes/api`, using Node 24+ and the repo-root `.env`:

```text
node --experimental-transform-types --env-file=<.env> mocap-salvage/<pilot|confirm|stage2>.mts …
```

- Add `--dry` to print the requests without spending.
- `stage2.mts bench-run-template --mr2` renders MR2.
- Paid calls go through `c25/lib.mts` (ledger, caps, never resent), and stored renders are reused from disk.
- `mocap-salvage/review.mts <set> <arms> <cases>` rebuilds the blind sheets offline.
