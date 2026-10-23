# Body processing and quality assumptions audit — 2026-10-23

## Evidence and challenges

Reviewed body normalization, component cleanup, skeleton estimation, clip QA, freezing, imported-rig setup, creation/Add move retry policy, quality-note presentation, and adjacent item extraction/quality contracts. All verification used existing saved images or controlled offline fixtures. No PixelLab generations or enhancement requests.

- **Foot contact inferred from silhouette bottoms:** `standing()` classified every clip except names containing walk/run/death/fall as planted. A perfectly requested foot lift in jump/dance/custom clips became a failed “feet drift” check. Reproduced with a failing regression. Silhouette displacement remains measurable, but no contact/sliding conclusion follows from it.
- **Estimator differences treated as rendering defects:** saved L04 walk/west measures 2.71 px mean arm-joint difference at 160 px. Identical normalized coordinates would measure 1.084 px at 64 px. This proves scale sensitivity, not incorrect art or estimator certainty. Rejected an uncalibrated replacement scaled threshold. Keep exact measurements and a visible estimated-difference review note; no automatic redraw based on it. Genuine deviations can still affect equipment alignment.
- **Palette/border observations trigger paid redraws:** controlled intact art with shading changes and border contact failed quality checks. These are review evidence, not proof of crop or wrong identity. Actual opaque pixels lost during normalization remain a hard error.
- **Detached components assumed unwanted:** actual Add move orchestration with two deliberately disconnected hands lost all hand pixels and made a second rendering request. This synthetic counterexample establishes an unsafe blanket deletion rule. Six saved exports and 333 unique saved estimator-input PNGs were also inspected; they were connected, so there is no evidence those existing saved characters lost legitimate parts. Body components now remain intact, with detached-pixel counts reported for review. Binary-alpha normalization remains intentional.
- **Six pixels of headroom treated as mandatory:** a contained body with 2 px above its head was refused by setup solely because future hats might need space. Reproduced before changing this to a conditional warning. Creation uses the same advisory policy; actual empty/cropped output remains rejected.

Retained item-specific chroma/key-preservation, registration, palette-role and coverage checks. Their contracts concern separate equipment layers and have existing fixture/spike evidence. The audit found no validated counterexample in the supplied artwork that justified a blanket removal of those checks. Other item cleanup heuristics remain limitations, not claims of infallibility.

## Changes

Body QA separates structural `fails` from review `warnings`. Complete valid measurements, nonempty art and frame layout remain required. Only empty output or a wrong frame count may trigger the existing single bounded body retry. Missing joint observations stop setup and retain the original generated artwork. Pose, silhouette, palette, border and connectivity observations cannot add a body redraw.

Creation and imported setup persist all observations. The review screen also reads nested clip warnings, and translates old saved “feet drift”/“arms off pose” notes into qualified silhouette/estimated-joint descriptions without rewriting historical records. API previews and architecture/user documentation describe the updated policy. The historical `feetDrift` numeric field remains a silhouette-bottom displacement metric; it is not physical foot drift.

## Verification before first commit

- New core regressions: three pre-fix failures demonstrated foot-lift misclassification, heuristic quality failures and headroom rejection. Two freeze-note regressions demonstrated misleading ground/feet wording.
- Independently authored actual Add move test: pre-fix unnecessary second rendering request, deleted hand pixels and heuristic failures reproduced together. Post-fix one request, intact normalized pixels, visible observations. Separate wrong-count/empty cases retain one bounded retry; invalid observations stop without redraw/publication. All transports are mocked and real `fetch` is forbidden.
- Full unit suite: **282/282 passed**. TypeScript/Svelte: **0 errors, 0 warnings**. Production build and secret guard passed (existing Vite chunk-size advisory only).
- Offline Playwright: **2/2 passed**, checking all quality notes/legacy wording and actual creation stopping on invalid required measurements without a second drawing. External PixelLab traffic was intercepted.
- `live-creator-2026-10-23/verify-body-quality.mjs <saved-evidence-directory>` rechecked **192 independent-direction frames** across L01–L06: complete structural checks, unchanged image hashes during component inspection, retained numeric metrics/observations and West's 2.71 px estimated mismatch. No saved projects changed.

Saved-art JSON and visual evidence stay outside Git. Credits spent: **zero**. A second independent review follows the first commit; validated follow-up findings are recorded below.

## Independent follow-up review and challenges

The first change was committed as `178db0c`. A second independent agent reviewed the full change and adjacent equipment policy, then reviewed the follow-up delta again. Its validated findings were:

- **Add move hid the observations:** the saved nested clip QA contained the notes, but `addMove()` returned only equipment errors. Extended actual-orchestration tests failed before the fix. It now returns deduplicated observations for the current move only, including resume; flattened historical notes are excluded to avoid stale replaced-clip warnings. Creation and Add move share the qualified legacy wording.
- **Equipment border contact was still called clipping:** idle/walk contact could trigger a paid G7 retry; fitted standing contact blocked approval. Challenged this against the documented zero-margin quality policy and export validation: transparent margins were a policy, not a technical export requirement. Three controlled idle/walk/slash tests and a connected fitted-headwear counterexample reproduced the problem before the fix. Contact now retains its count, framing warning and review status, without declaring unseen pixels cropped or triggering G7 retries. Actual crop/dimension, body-preservation, registration, presence and grip checks remain intact.
- **Fitting duplicated the six-pixel headroom restriction:** a contained target with 2 px headroom was blocked solely for hypothetical future hats. Reproduced before changing it to a visible warning in the fit plan, before payment, and in standing review. Complete joints and nonempty 64 × 64 target references remain required.

Rejected a proposed malformed-requested-pose scorer hardening as unproven in current callers: no reachable production reproduction established a bug. Neither review justified removing the other item-specific checks. The second agent's final review found no further concrete issue in the bounded follow-up change, including warning persistence/reload, resume, and budget guards. This is a review conclusion, not a guarantee that every future generated pose is correct.

## Follow-up verification

- **287/287 unit tests passed**, including no-extra-request Add move/resume, intact detached body parts, retained empty/count retry bounds, invalid-measurement stop, item border observations and fitted-headwear framing. The existing equipment-flow test mock was updated for the added offline framing helper.
- **2/2 offline Playwright tests passed:** nested creation notes and completed-move notes, including legacy wording and 390 px mobile bounds. PixelLab requests were blocked; the move UI made zero requests.
- TypeScript/Svelte: **0 errors, 0 warnings**. Production build and secret guard passed; only the existing bundle-size advisory remains.
- Saved-frame verification from the first commit remains applicable: no body geometry or saved assets changed in this follow-up. No screenshots, saved generations, mock-up assets or tokens added to Git. Credits spent across both reviews: **zero**.
