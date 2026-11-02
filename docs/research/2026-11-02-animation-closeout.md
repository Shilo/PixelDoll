# Animation closeout: movement cadence and native hand/foot review

November 2, 2026. Continuation on `codex/eight-direction-presets`, after the [eight-direction starter experiment](2026-11-02-eight-direction-starter-pack.md). The owner requested that the remaining work continue autonomously. This pass uses retained artwork and existing code. No additional PixelLab generation, dependency, account or backend is required.

## What was still missing

The previous pass delivered a real eight-view body pack, exact native pixels, shared walk/attack motion and free still idle. It did not establish physical foot contact or equipped weapon quality. The static walk seam flag also needed a more specific check rather than another generation or an arbitrary silhouette threshold.

Independent review found two actionable application defects:

1. Live movement used analog input strength, but its walk animation always advanced at full cadence. Half-strength joystick movement therefore covered half the distance while the legs continued at full speed.
2. Managed starter results could not open the existing hand/foot authoring tools. The old candidate editor required an authored mocap document; the attachment editor also required requested right-wrist joints. Managed native frames intentionally have no fabricated per-frame joints.

These are software defects that can be corrected without asking the image model for another body.

## Production movement fix

`WorldStage.svelte` now passes live animation time through `livePlaybackDelta`. It scales time only for an actually displayed, moving `walk` animation. The same analog magnitude already controls ground travel, so half-strength input now advances both distance and gait phase by half.

Full-strength keyboard/cardinal/diagonal input retains its cadence. Idle and Default fallbacks, nonlocomotion clips and Preview retain wall-clock timing. Existing facing-phase carry and genuine clip/source reset semantics are preserved. Nonfinite input cannot advance the walk; excessive strength is capped at one.

Tests integrate ground movement and animation together at full/half input, rather than merely checking the helper's formula. The worker deliberately restored the old full-rate gait: the half-strength regression failed with 200 ms instead of 100 ms, then passed after the exact fix was restored.

This removes an evidenced source of sliding. It does not establish the correct stride length for every sprite or change `MOTION.speed` from 95 world units to a guessed native-pixel value. Projection, sprite scale and authored gait remain separate.

## Exact native authoring bridge

The starter panel now opens **Hand and foot review** for the selected action/view at no generation cost. It feeds the exact placed playback slots into the editors, including the shared authored holds. The same integer-placement helper serves preview and authoring; north's smaller raw canvas is padded, never stretched.

The review binding includes source/action/view identity, selected samples, actual placed RGBA hashes, canvas, pivot and playback durations. Changes to source, map, view or placement invalidate the editor. A delayed preparation also checks that the selection did not change while hashes were computed.

The attachment editor receives no fabricated wrist hints. Missing palms start explicitly unmarked. Source artwork and the current bare frozen body remain visible, with no target guide or item at an invented position. The author must click a fully opaque visible palm pixel. Unset targets can be saved as drafts, but cannot render or export a weapon, including when native frame artwork is supplied. The held-item repair-mask caller also refuses an unmarked grip before planning a paid repair.

Review then found two ways to bypass the click guard: typed target coordinates and imported documents. A shared opacity check now applies before rendering or exporting either a rigid or native layer. Invalid targets show the current bare body with an error, not a stale composite or a floating weapon. This is geometric contact only, not automatic identification of a palm or fingers.

The corresponding source anchor also needs actual contact. The retained axe's initial image-center anchor lies on transparent space, so a correct body target alone could still float the weapon. Rigid placement now rejects a source anchor outside an opaque attachment pixel. Source artwork stays visible and clickable when calibration fails; a failed composite clears. Native frame art still bypasses rotation/source-anchor placement, preserving its exact pixels.

Known clipping also blocks the authored ZIP export. Preview can report cropped source pixels for correction, and drafts/documents preserve the complete source, but a layer with a reported cut-off blade cannot silently export as the authored result. This cannot detect a blade that was already absent from the source artwork; that semantic check remains visual.

The old synthetic candidate test reused one standing bitmap for animated death poses. Three generated wrist hints pointed into transparent pixels, and an arbitrary quarter-image source click also missed the artwork. The fixture now marks real opaque body/source pixels explicitly. Original body preservation, timing, source-image and native-art independence assertions remain intact. These were invalid synthetic landmarks, not assertions weakened to accept floating art.

An attachment diagnostic export uses the same eight playback slots, timing, body hashes and common pivot that were reviewed. It does not silently reinterpret eight authored layers as the body's six deduplicated attack cells. This is a research export, not an automatic publication of an equipped Studio preset.

## Native foot measurements without invented 3D data

The new native contact editor tracks visible contours as **A/B**, rather than guessing anatomical side. Each mark records its native pixel, heel/toe label, stance label and playback slot. Hidden or ambiguous feet remain unmarked.

Both travel-speed components start unset. Values are explicitly native pixels/second, with positive X right and positive Y down. They are not world coordinates or recovered provider camera parameters. Before import, save or export, the editor verifies actual image hashes, timing and opaque marked pixels. Asynchronous validation snapshots its inputs so mutation during hashing cannot change the accepted evidence.

For a manually named stance, the tool reports the span of sampled positions `point + speed × playbackStartTime`, requiring at least two distinct frames and a consistent heel/toe landmark. It reports held-frame travel `|speed| × frameDuration` separately. Neither value becomes a foot-planting score or moves the body.

The first implementation could stop showing Partial after only two marks. Review corrected that: annotation coverage remains partial when either track is unmarked in any frame, or the observed stance lacks usable data. Coverage completeness is bookkeeping only. Even fully annotated evidence stays `qualified:false`; it does not establish physical support windows.

## Actual retained-artwork check

The actual east walk was loaded through the panel on an ordinary localhost development server. The agent-key switch stayed off, and every PixelLab request was blocked. The check observed zero requests and zero page errors.

The following are candidate visible sole-contour annotations, with approximately one native pixel of landmark uncertainty. They do not identify anatomical side or prove full support:

| Track | Raw/playback frames | Native pixel indices | Explicit test speed | Sampled span |
|---|---|---|---|---|
| A, front contour | 0, 1, 2, 3 | `(64,90)`, `(62,90)`, `(60,90)`, `(58,90)` | `(22.5,0)` native px/s | 0.75 px |
| B, rear contour | 4, 5, 6 | `(64,87)`, `(61,87)`, `(59,87)` | `(22.5,0)` native px/s | 0.75 px |

Frame 7 overlaps ambiguously and was left unmarked. The exported review is partial and source-bound to all eight frames. At that same speed, each 100 ms held frame spans **2.25 native pixels of root travel**. The smaller sampled residual therefore cannot be called continuously planted feet.

The same UI check imported the complete retained east axe asset. Its body frames had no joint hints, so target controls remained absent and attachment export stayed disabled. No floating weapon was accepted merely because source artwork existed. This is a negative control, not qualification of that axe on the new body or another direction.

The actual-artwork harness also imported a deliberately off-body target. The current bare body stayed visible, the error was explicit, and clicking export produced zero downloads. A separate negative control combined a known opaque body pixel with the transparent source-center anchor; rigid rendering rejected the source contact without changing the body. Neither control is a claimed palm annotation.

All eight frames of the earlier retained gripped-east-axe archive were replayed through the stricter shared renderer. Each layer matched its archived pixels exactly and reported zero clipped source pixels. The new guards therefore preserve the valid calibrated control rather than changing old artwork to pass a check.

## Walk seam decision

The independent reviewer compared actual neighboring poses. East frames 6, 7 and 0 have top rows 45,45,46 and bottom rows 89,90,90. South has tops 45,45,46 and bottoms 90,90,91. Those one-pixel seam height changes are not exceptional relative to other transitions; south frames 3 to 4 have a larger bottom-row change.

Together with the visible leg progression, the ready-like final silhouette does not establish a pause. The eight-frame walk stays unchanged. No frame was deleted, remapped or regenerated merely to reduce a silhouette count. Timed viewing and game-specific motion remain stronger acceptance evidence than that count.

## Completion boundary

The verified software defects can be completed and tested. The original aspiration of professional automatic rigging for any humanoid shape, and seamless equipped attacks in every view, has not been established by this one-body experiment.

The new pack has no weapon layers. Hidden or foreshortened palms require appropriate directional/frame artwork or an explicitly authored rig; rotating the single east axe cannot supply missing perspective. The editors preserve that uncertainty and block missing targets. No evidence shows another body-generation request would resolve the missing directional weapon art or an engine's stride-speed contract.

The stopping point is the corrected live cadence, usable native authoring connection, exact export evidence and regression coverage. Body-only acceptance is separate from equipped-art acceptance. Passing software tests does not establish that the new generator should become the production default. Implementation remained on the requested branch until the owner's subsequent integration authorization recorded below.

## Tracking and spending

Active and archived board reads were retried outside the sandbox using saved authorization. GitHub still reports missing project scopes, so board synchronization is pending; no card status change is claimed. Explicitly authorized file work continued independently.

Additional generations in this pass: **0**. Previous campaign spending stays 74.25, or 89.25 used from the latest 500-unit allowance after the earlier 15 units. The remaining 410.75 units were not reopened as an automatic retry budget.

## Verification

- Final strict Svelte/TypeScript checks: zero errors and warnings.
- Final unit suite: 1,508 passed, one existing skip, 131 files.
- Full local browser suite after the cadence/bridge changes: 169 passed in 5.5 minutes.
- Targeted browser suite after the final source/body/clipping guards: all 12 selftests passed in 37.1 seconds. Build and distribution guard passed.
- Actual saved-artwork UI: zero PixelLab requests, zero page errors, seven source-bound candidate foot marks, unmarked/off-body hand export blocked.
- Deliberately restored full-rate analog cadence failed the new half-strength regression. Valid fixed code was restored before final verification.

The source-only/body-only guards, frame/pivot/hash bindings, eight-slot exports, stale import refusal and unchanged native art are checked in both pure tests and the real editor workflow. Separate CI verifies the final commit after push; its result is recorded below when available.

## Retained evidence

[Closeout review archive](artifacts/2026-11-02-animation-closeout-review.zip) contains the actual east foot-review JSON, current UI screenshots, source/body negative controls, unchanged eight-frame axe replay and a before/after cadence illustration. The illustration uses the production playback helper with half-strength movement and retained sprite frames. Its floor speed is a labeled 2D illustration, not a measured calibration of the app's 95 world units/second or its perspective camera.

The earlier [importable body pack](artifacts/2026-11-02-eight-direction-starter.pixeldoll.zip) stays unchanged. No raw generation, body image or asset was erased to manufacture an acceptance result. No credential, `.env`, browser profile or authentication output is in either archive.


## Final remote result and cleanup

Implementation commit `7806be10e73e905b5dae3e30e27ee99af6edec1c` was pushed to `origin/codex/eight-direction-presets`. [CI run 41476761164](https://github.com/Shilo/PixelDoll/actions/runs/41476761164) passed the build and all sixteen browser shards on the final code, including the final source/body/clipping guards. Deployment was skipped for the non-main branch. The earlier full-local and final-targeted test timing distinctions above remain accurate; remote CI supplies the full final-code browser pass.

The temporary ordinary localhost 5201 server was stopped after verifying its process identity. Existing 5199/5200 servers were preserved. The isolated profile retains the agent-key opt-out. Main and unrelated main-checkout edits were not changed, and the body-pack ZIP remains identical.

Independent code/evidence challenge found no further concrete material blocker in this bounded delta. The reviewer did not independently rerun the test commands; executed checks and the old-axe replay are separately recorded above. No further broad research or paid body retry is supported by the remaining evidence gaps.

## Integration decision

The owner subsequently authorized the recommended next step autonomously: document the concerns, merge the tested fixes
to main, push origin and delete the merged branch. The recommendation is to integrate the verified engineering work and
stop broad research. The experimental pack is not promoted to a default or reclassified as a qualified equipped preset.

The standing concerns are now recorded in [known issues](../known-issues.md): one-body/camera coverage, unqualified hidden
hands and directional weapon art, geometric guards versus anatomical acceptance, and sampled versus held-frame foot
travel. Further art work should target a specific failing body/view with acceptance evidence; this merge authorizes no
automatic regeneration or additional spending.

The application code matches tested commit `7806be10e73e905b5dae3e30e27ee99af6edec1c`; subsequent integration edits are
documentation only. Main's unrelated token-handling working changes are excluded from the merge commit and preserved.
Integration will use a fast-forward and normal push, with main CI/Pages verification before branch cleanup. Board
synchronization remains pending because project scopes are unavailable.
