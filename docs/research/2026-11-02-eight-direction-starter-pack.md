# Eight-direction starter pack: shared native motion

November 2, 2026. New branch `codex/eight-direction-presets`. Scope: one humanoid style, idle, walk and one right-handed overhead attack, with eight independently drawn source views. Custom motion authoring is outside this starter flow.

## Main integration completed first

The 32 motion-lab commits were fast-forwarded onto `main` and pushed to origin at `9073b7d4d0bc845cfd5c9ed30317a20a609db162`. The remote ref matched exactly. [CI and Pages run 41453724438](https://github.com/Shilo/PixelDoll/actions/runs/41453724438) completed successfully, including build, all sixteen browser shards and deployment. The fully merged local `codex/motion-lab` branch was deleted; it had no remote branch. The existing clean worktree was reused on `codex/eight-direction-presets`.

Unrelated token-handling edits in the main checkout were preserved, not staged or claimed as this agent's work. Main's committed tree was pushed; its unrelated local modifications were not included. Active and archived board reads still fail for missing GitHub project scopes, so tracking synchronization remains pending without permission expansion.

## Important current API finding

The fresh [official REST schema](https://api.pixellab.ai/v2/openapi.json) now explicitly documents `mode:skeleton-v3` **without** `template_animation_id`: `action_description` creates one shared 3D motion, and subsequent directions can use its `animation_group_id`. The fixed starter flow therefore needs neither MCP nor the old per-direction 3D-to-2D conversion/rerender chain.

The saved October snapshot only described skeleton-v3 using a template animation. A compact [dated contract capture](pixellab/2026-11-02-managed-custom-v3-contract.json) records both schema hashes, relevant fields and the response receipt contract. This does not establish parity for MCP's explicit `poses`, `move` or `scale` fields, which this implementation does not send. It also does not establish a release date, native pivot, anatomical correctness or output-quality guarantee.

Existing **Unique 8** creation already retains all eight supplied views. Default Top-down 8 retains five independent views and derives three mirrors; modern V3's initial creation call still requests its default eight views. Those app-derived mirrored references cannot qualify this pack. Native here means a separately returned provider view retained without an app flip, not proof of the provider's internal generation mechanism.

## Brainstorming and rejected shortcuts

An independent agent mapped the current creator/move/direction pipeline and challenged the design before implementation:

| Approach | Decision |
|---|---|
| Replace the model name in the current move generator. | Rejected. That generator makes separate per-direction requests, estimates their joints and redraws through raw skeleton-v3. It could create eight unrelated motions and discard the managed renderer's benefit. |
| Promote the existing east axe example into eight directions. | Rejected. The other native artwork does not exist. Western views also need independent handedness/grip checks. |
| Infer animation placement from `paste_x`/`paste_y`. | Rejected. Historical documentation identifies those as Pro Flash outputs; no managed-animation pivot contract is established. The optional fields in a generic job type are insufficient evidence. |
| Center or align each frame independently. | Rejected. It can manufacture sliding or erase root travel. Native frames remain unchanged; only one reviewed integer translation per action/view is permitted. |
| Immediately switch production Studio defaults. | Rejected until actual source, canvas and art are qualified. The narrow dev flow must export a real project that imports into Studio, not merely another diagnostic JSON. |
| Buy all motions and directions before inspecting anything. | Rejected. Start each action with south/east, retain that group's receipt, and require review of those exact native pixels before purchasing the remaining six. |

## Implemented behavior

The dev-only Motion Lab has an **Eight-direction starter pack** section. It selects a native Studio source, prepares three fixed action plans, and previews the exact pilot API request before spending. The recommended pack uses free **still idle** from the frozen standing reference, walking in place (8 samples), and one closed-right-fist overhead strike with follow-through (8 playback slots). The generated breathing idle (4 samples) remains an explicitly experimental research option; it failed the full-view no-effects check. No action draws a weapon. Body motion and equipped-weapon acceptance are separate.

Each generated action starts one animation group. Still idle needs no animation request, receipt or paid prerequisite. An explicit six-view continuation references that same group. Different actions cannot reuse a group or paid direction job. Receipts must contain exactly the requested unique direction/job pairs. Returned frames must have complete indexed counts and a consistent native canvas within each direction. Different directions may legitimately have different canvas sizes; no view is silently mirrored or filled from another action.

Source validation binds character ID, camera, humanoid model, native direction order, exact standing image hashes, canvas and pivot. Before any POST, the saved local images and the server's actual rotation PNGs must match those hashes. Unknown/mismatched camera/model metadata refuses generation before a reservation or paid submission.

Calls use the existing durable queue. The starter ledger saves a conservative reservation before enqueue; unknown, failed or missing job outcomes are never silently replaced. Free preparation is idempotent and recovers existing paid plan identity. It cannot mint a new seed to bypass an unresolved reservation. The continuation review binds exact plan, animation group and native frame hashes, and its notes are retained with the call. Changing the displayed source or action clears that review. A different selected source disables paid actions until prepared.

The motion-stage counter allocates at most 150 reserved/known generation units inside the previously approved remaining 485 units, rather than creating a new allowance or reopening older campaigns. Source creation/registration is accounted separately in the total task ledger below; the motion counter is not total task spending. Estimates are not guaranteed bills; unknown or dollar-only outcomes retain their reservation. Nonfinite/negative usage and numeric overflow prevent further paid work. No new account, backend, dependency, production MCP bridge or automatic art retry was added.

## Native layout, preview and real Studio artifact

The builder retains native raster frames directly, rather than estimating a 2D skeleton and generating the body again. Centered padding is only an initial **authored proposal**, not a provider measurement. The author reviews a shared square 32–256 px canvas, one standing translation and one translation for each action/view. The pivot is the existing source pivot plus the standing translation. Fractional translations, out-of-canvas joints and any clipped visible pixel are rejected.

Preview and export share the same exact integer-placement helper. Failed placements clear both canvases and keep a distinct visible rendering error. A stale successful frame cannot stand in for an invalid placement. Changing placement clears layout approval. Export requires the complete three-action/eight-view pack, explicit approval and notes.

The resulting PixelDoll ZIP includes Default plus idle/walk/attack, all eight native views, transparent body cells, exact source/group/layout evidence and 136 raw standing/walk/attack PNGs, or 168 when the optional rejected breathing attempt is retained. An explicitly authored source-frame map is shared across every direction of an action. Repeated complete poses compile into unique playable cells and a repeated-cell playlist; unselected original samples remain exclusively in raw evidence. No pixels are erased or invented to make a rejected pose appear clean. Hashes distinguish native RGBA, re-encoded archive PNG bytes and placed output images. Export does not claim its PNG encoding is the provider's original byte encoding. Attack metadata is nonlooping; frame durations use existing PixelDoll defaults, not unreported provider timing. Studio preview and global export preferences retain their existing behavior.

The project is explicitly **experimental and body-only**, with saved warning/unmeasured QA and no fabricated animation joints or pose-adherence scores. It does not attach the old server character ID to a changed canvas. Pose setup/registration and equipped grip/perspective qualification remain separate. Studio's existing blue-bit garment tagging is also separate from exact native archive pixels.

## Review findings and fixes before paid work

The challenger found three concrete first-draft defects: a displayed source could differ from the paid target, pilot review notes were unbound, and repeated free preparation created a fresh seed. All three were fixed as described above and independently re-reviewed. Recovery tests check the source/group/pixel binding, no replay after enqueue failure, unchanged preparation and preservation of uncertain reservations.

The browser test found a real export failure: a Svelte reactive proxy could not be passed to `structuredClone`. UI snapshots now preserve plain metadata and typed pixel arrays before the shared builder receives them. The test was not weakened; the actual download and Studio import now pass.

A further reviewer flagged invalid billed usage and camera/model mismatch. Both now fail before paid submission, with dedicated tests. Reviewers also challenged a claim that body-only imports have an equipment-style **Needs a look** badge. The test instead checks the actual experimental project label, saved body QA and the real export warning; it does not invent a main-preview badge.

## Verification and live qualification

Strict Svelte/TypeScript checks passed with zero errors/warnings after the final still-idle, snapshot and per-direction canvas implementation. The final full unit suite passed 1,493 tests with one existing skip across 130 files. All 12 relevant browser self-tests passed in 15.0 seconds, including the new end-to-end case (5.7 seconds in the final run). Build and distribution guard passed. The old full 168-test suite also passed in main CI before this new dev-only work; it is not misreported as a new full-suite execution.

The new keyless browser test uses clearly labeled synthetic artwork. It checks native-source preparation and mirror refusal, repeated preparation retaining all paid bindings, all 24 action/view canvas identities, frame wrapping, fractional/clipping errors and recovery, approval reset, raw pixel/hash/group evidence, a real downloaded ZIP and actual Studio import. The imported project has eight directions and Default plus the three actions; an asymmetric north-west pixel and the actual saved quality warning are checked. It observes zero PixelLab requests or page errors. These tests establish transport/authoring correctness, not artistic quality.

Live testing uses an isolated persistent test-browser profile and a localhost-only agent server on port 5201, leaving the existing port 5199 review server intact. The temporary port override changes no key handling or production configuration. A free app-client balance preflight succeeded; credential values were never returned to the driver, logged or exported. The completed live outcomes, actual spending and retained artifacts are recorded below.

The live source creation completed once, producing eight native standing views in an 80 px canvas for a 48 px body. Two POSTs created and registered the exact views; no separate estimate-skeleton call was needed. The independent reviewer inspected the complete standing sheet and found no obvious missing/extra limbs, props, clipping or source defect warranting another attempt. The same build, skin palette, approximate scale and camera are retained. Small finger/hidden-limb details remain unqualified; this is approval for a bounded motion pilot, not anatomical certification. The south/east attack pilot was then submitted once with an eight-unit reservation and two saved direction jobs in one shared group. No six-direction expansion was purchased before its results.


## First attack pilot: rejection and bounded whole-pose curation

The native south/east attack returned eight 112 by 112 px frames per view in group `a1d61c62-e68b-4a3e-99c3-d53deeafb324`. Both completed direction jobs billed three generations, six total. South sample 0 contains five gray pixels, three detached; east sample 2 contains 56 gray pixels, 48 detached. Close inspection showed that connected gray pixels may be untextured or malformed forearm/hand anatomy. An initial attempted offline cleanup failed its own guard before any corrected image was written. The challenger withdrew the assumption that all gray pixels were disposable effects. **No anatomy deletion or repaint was accepted. The raw pilot did not pass.**

A bounded authored alternative selects complete native samples `[7,1,1,3,4,5,6,7]` in the same order for every view. This creates six unique playable poses in eight playback slots; the discarded samples 0 and 2 remain in raw evidence only. Both reviewers see a recognizable ready, overhead anticipation, strike, controlled crouch/lunge and recovery in the selected south/east poses. The map avoids the phase mismatch of an earlier, superseded per-view map. The updated browser test checks the actual selector, every view, raw exclusions, six-cell sheet, eight-slot playlist, imported pixels and held samples.

The timed preview uses the existing 100 ms per slot (800 ms sequence), an explicit authoring choice rather than provider timing. The image tool exposes a single GIF frame, so human real-time motion perception is not claimed from that tool. Static sequence review plus exact playback regression supports one bounded same-group direction expansion; it does not establish professional naturalness. Soles move during the crouch: this is a controlled-lunge candidate, not locked-foot certification. Metadata has no per-frame joints, pivot or timing to settle those questions automatically.


## Eight-view attack and implementation corrections

The six additional attack directions completed once, at three generations each (18 total). The provider returned north on a 96 px canvas and the other seven directions on 112 px canvases. Our initial group-wide uniform-canvas rule refused assembly after the jobs completed. All raw results and billing were recovered through read-only stored-job/blob inspection; **no paid request was repeated**. The contract now retains a separate exact canvas per direction, while still rejecting size changes between frames of the same direction. Its maximum extent is merely a layout convenience, not a provider pivot. Preview proposes separate integer padding for each view; export keeps the originals and records native sizes.

The selected attack sequence is recognizable across all eight views: preparation, right-arm overhead anticipation, down strike, crouch/lunge and recovery. The back-facing arm is partly occluded by the body. Native gray pixels occur only in discarded south sample 0 and east sample 2. This observation supports this candidate map, not a universal gray-pixel cleanup rule.

An offline comparison of integer-padded ready sample 7 against standing found identical alpha silhouettes in six attack views and one differing alpha pixel in north-east and south-west. RGB differences remain (91 to 185 pixels by view), so this is **not** exact standing/body-pixel identity or proof of the reason for color variation. Idle sample 0 has identical alpha silhouettes in the south/east pilot but 81/76 differing RGBA pixels. These comparisons support the placement proposal at listed ready samples, not every moving pose or physical foot contact.

The final code reviewer found a separate source-durability defect: source hashes in localStorage do not keep original PNGs reachable by IndexedDB garbage collection, and editing/deleting the original project would strand later review/export. Free preparation now atomically pins a hidden dev source project and all referenced blobs. Identical preparation reuses the pin; older pins are retained. Review/export validates and uses that exact snapshot. Paid submission still verifies the original selected source and is disabled when it is absent. This is a narrow research-source retention fix using existing project/blob transactions, not a store migration or new cloud service.


## Full idle rejection and free fallback

South/east alone did not reveal the full idle failure. The six additional views contain visible breath puffs in south-east, north-east, north, west and south-west despite the no-effects instruction. Exact-RGB128 counting reports zero gray for these puffs, illustrating why that narrow metric cannot qualify anatomy or absence of effects. No common clean generated sample covers every view. The raw eight-direction breathing idle is rejected. No generic gray/color deletion, face-boundary cleanup or paid reroll was adopted.

The challenger recommended an explicit still idle. A proposed negative frame-index sentinel was rejected because it could blur standing provenance with provider frame indices. The implementation instead uses `idleSource:standing` with an empty raw idle selection. It copies the exact placed Default/standing hash and offset into one playable idle cell per direction, with four 150 ms hold slots. The label says still idle; animated breathing is not claimed. Motion offsets cannot shift this fallback independently from Default. Changing its source clears layout approval.

This path needs only the walk and attack groups. It never requires an idle generation to create a free still idle. The failed breathing experiment cost 24 units in this campaign; future use of the recommended still idle avoids that entire paid stage. The two accepted generated action families billed 48 combined here, while the tool conservatively reserves 64 for the same eight-view workflow. Those observations are not guaranteed future pricing. If a complete generated idle was previously purchased, its 32 raw samples, receipts and charges can remain as research-only evidence; they have no playable output hashes or managed-animation provenance on the static idle. If no such attempt exists, the evidence contains no fabricated group, job or binding. An incomplete old idle stays visibly in the saved journal rather than blocking the free pack or being mislabeled as complete archived art.

## Walk review and bounded stopping point

All eight walk views returned once in group `59a5b094-b39a-41fb-86b2-e51d237daf7a`. Root and challenger found a recognizable alternating gait and consistent facing without a specific gross limb/effects defect requiring a reroll. All 64 frames have one connected opaque component and no exact-RGB128 pixels. These are descriptive checks, not anatomical or physical contact certification.

The unchanged 7-to-0 loop seam remains the named temporal check. In the pilot, south closing silhouette changes 147 pixels versus a maximum of 113 at other transitions; east closing changes 140 versus a normal maximum of 148. Those observations do not establish a universal threshold, pause or cause, and no remapping was justified from counts alone. Foot-contact behavior also depends on engine movement speed and perspective. No frame-by-frame recentering was introduced to disguise travel.

The final walk continuation initially stopped before submission because the test driver raced the page startup connection: zero POSTs, no starter reservation and no queue record. Read-only reconciliation proved non-submission, archived that harness-only preflight intent, and waited for the completed Agent-connected page state before the one actual submission. This was not a retry of an unknown or paid request. The free evidence file records that decision.

## Scope and remaining limits

This is one moderate-proportion humanoid source and one camera. A shared group synchronizes directional samples for that character; the same prompt/seed does not establish an identical reusable 3D motion across every new body shape. Chibi, extreme proportions, other cameras and arbitrary sprite geometries were not qualified. Hidden hands, equipped weapon grips, frame joint measurements, physics-level planted feet and professional real-time naturalness remain outside this body-only acceptance.

The dev tool and exported experimental artifact are the deliverable on this branch. Production Studio defaults were not switched to this route. The practical next acceptance step is a short visual review of the saved walk closing seam and attack timing, followed by a separately scoped equipment-fit pass if this body pack is chosen. There is no justification for another broad research or paid retry cycle from this campaign.


## Actual artwork export/import proof and retained artifacts

The final native-artwork check used the actual saved jobs through the Motion Lab UI, rather than synthetic sprites: 24 action/view previews, all eight still-idle canvases exactly equal to placed standing, shared attack holds, a real ZIP download and actual Studio import. Inspect showed eight direction buttons and Default/Idle/Walk/Slash. The ZIP contains one Default cell, one still-idle cell with four holds, eight walk cells, and six attack cells with eight playback slots. Attack metadata is nonlooping. It retains all 168 raw PNGs, including rejected breathing and attack samples. The imported project presents its saved quality/export warning. All PixelLab requests were blocked; zero requests and zero page errors were observed.

The harness initially used select-label matching that included option text, then expected an untruncated character name. Those harness expectations were corrected to accessible combobox names and Studio's existing 60-character name limit. No production import behavior or assertions about native pixels/directions were weakened.

A final challenger found that a completed but malformed optional breathing-idle receipt could block the free pack during archive assembly. Standing mode now loads required walk/attack first, then attempts optional idle archival separately. Its failure is surfaced explicitly as retained in the job journal and excluded from the free pack. The final browser regression corrupts a completed idle receipt, proves visible omission and a valid 136-raw-PNG free export, and proves generated-idle mode still rejects it. It then restores the valid receipt and checks the complete 168-PNG artifact. Generated-idle mode remains strict. No missing native view is synthesized, and no failure is silently called complete.

| Durable artifact | Contents |
|---|---|
| [Importable experimental body pack](artifacts/2026-11-02-eight-direction-starter.pixeldoll.zip) | Real Studio project, eight views, still idle/walk/curated attack, source/layout/receipt/hash evidence and all 168 raw PNGs. |
| [Review archive](artifacts/2026-11-02-eight-direction-starter-review.zip) | Before/after sheets, raw-puff rejection, attack anomaly crop, timed previews, descriptive audits, source-bound reviews, final campaign billing and actual UI proof. No credentials or browser profile. |

The body ZIP SHA-256 is `7adb8a87fea7af4dd52b52d9fb2b363b6c43f6ea583700642ba99954dff93c29`. Review GIFs repeat for inspection; that does not change project attack metadata. The evidence distinguishes sampled native art, authored timing/layout and unmeasured quality.

## Final spending and closure

| Stage | Paid POSTs | Reported generations | Outcome |
|---|---:|---:|---|
| Create/register one native eight-view source | 2 | 2.25 | Retained exactly; source and snapshot checks pass. |
| Attack, pilot plus six directions | 2 | 24 | Raw rejected; shared complete-pose curation retained as experimental body candidate. |
| Breathing idle, pilot plus six directions | 2 | 24 | Rejected for unwanted effects; retained as research only. Free still idle replaces playable output. |
| Walk, pilot plus six directions | 2 | 24 | Retained as experimental body candidate; closing seam/engine contact remain unqualified. |
| **Total** | **8** | **74.25** | **All 24 native direction jobs completed; no paid replay.** |

The motion ledger conservatively holds 96 units against its 150-unit allocation; actual motion billing is 72. Including source creation, this campaign spent 74.25. The latest 500-unit allowance previously had 15 spent, giving 89.25 used and 410.75 remaining. Older campaign ledgers remain separate. No further generations are planned for this batch.

The bounded implementation and static/frame review are complete. Broad professional/universal animation qualification is not claimed. The source, tool, raw failures, usable body candidate and remaining acceptance checks are all retained; production defaults were not promoted based on tests or raster counts alone. Board synchronization remains pending because project scopes are unavailable.


## Remote verification and cleanup

Implementation commit `39e782bdc00b4f5352f7550758f58d44fe233a81` was pushed to `origin/codex/eight-direction-presets`, and the remote ref matched. [CI run 41469234815](https://github.com/Shilo/PixelDoll/actions/runs/41469234815) passed the build and all sixteen browser shards; deployment was correctly skipped for this non-main branch. This is full remote browser verification of the new implementation, separate from the earlier main deployment.

Main still matches origin at `9073b7d4d0bc845cfd5c9ed30317a20a609db162`. The old local `codex/motion-lab` branch is absent. The temporary localhost 5201 agent server was stopped after verifying its exact Vite process. Existing 5199/5200 servers and unrelated main-checkout edits were preserved. The isolated test profile remains opted out of the agent key; no browser profile or credential is in either committed artifact.

The subsequent [animation closeout](2026-11-02-animation-closeout.md) fixes the live analog gait-speed mismatch, connects these native frames to manual hand/foot review without invented joints, and records actual held-frame foot-travel evidence. It also closes grip-validation paths that could otherwise produce floating attachments. No additional paid generation is involved.
