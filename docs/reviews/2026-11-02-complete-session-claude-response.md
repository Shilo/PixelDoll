# Claude review of the complete PixelDoll animation session (response to the 2026-11-02 complete-session handoff)

Reviewed: committed `main` `3bbc61eebef42f0f123a87e886dfb8c54065055f` (app code equal to `7806be10`); the handoff and
evidence manifest were read at `05274fe0`, which is documentation-only on top of it. Offline only: no generations, no
credentials, no application or evidence files changed. This file is saved in the reviewer's scratchpad because a stale
worktree guard blocks writes to the main checkout and the handoff forbids bypassing it.

## Plain-language verdict

- **Keep the deployed engineering.** Mask containment, cache copies, the response-uncertainty fix, the exact-coordinate
  contract, analog walk cadence, grip and clipping guards, and stale-preview clearing all hold up under independent tests.
- **Fix six current defects, none in the art:**
  - **Production:** the Activity panel labels some possibly-charged requests "Free" (A1); one rare post-send error is
    recorded as failed instead of unknown (A2).
  - **Dev tooling:**
    - The Studio queue treats Motion Lab jobs as its own. It shares their lock and can delete them, stranding the
      starter pack's free review and export (C1).
    - A paid Motion Lab probe skips the grip-on-body guard (B1).
    - A second tab can change which source a starter request pays for (F2).
    - A never-sent failed attempt blocks a starter action forever (F3).
  - **Blocking:** none of these blocks the deployed app. C1, B1, F2 and F3 should be fixed before any further paid Motion
    Lab or starter run.
- **Do not promote the art.**
  - The east axe is the best equipped result so far and fixes the missing-head and floating-axe objections. But in frames
    1 and 2 the fist sits on top of the skull, so the handle reads as coming out of the head, and the body pops at the end.
  - The starter walk is a reasonable experimental body preset.
  - The starter attack reads as "raise hand, punch, hunch over", not a chop, and differs across views.
  - Keep all of it experimental and unqualified, as the handoff already does.
- **Highest-value next action:** the one shared fix for C1 (Studio and Motion Lab must not share queue ownership), then
  the Activity cost labels.

## 1. Inspection record

- **Code:** read at `3bbc61ee` via `git show`, including the per-commit diffs since `0acd88ab`:
  - queue, client and activity;
  - items and run;
  - Motion Lab attachment, equipment, native contacts and the starter pack, presets and project;
  - Studio presentation, WorldStage and state cleanup.
- **Tests:** three isolated `git archive` copies with `npm ci`.
  - `npm run check`: 0 errors and 0 warnings across 351 files.
  - `npm test`: 131 files, 1,508 passed, 1 skipped.
  - Committed starter tests: 54 of 54 pass.
  - Node was v25.0.0, not the pinned 24.22.1.
  - Counterexample tests were added only in those copies; each one listed below fails on the reviewed code as described.
  - No end-to-end, selftest, build or dist-guard runs.
- **Artifacts:** all six committed ZIPs; SHA-256 values match the manifest. Independent Pillow and numpy decoders were
  used for every pixel claim in section 6.
- **Visual:** ordered strips at 4x to 10x, onion skins, hand and hidden-shaft close-ups, and per-view walk and attack
  sheets, which I also looked at myself.
  - APNG and GIF files with the authored durations were built, but **I did not watch timed playback**: the viewer shows
    stills only. The owner should watch them.
- **Missing:**
  - the earlier target palms for the "0/1 hidden pixels earlier" claim;
  - the starter's source keypoints;
  - the UI-proof harness (ignored `spikes/api/out`);
  - real browser Web Locks (simulated with a name-aware fake);
  - live provider behavior for 423, 503 and 529 POSTs.
- **Report-only:** board synchronization, CI runs (not re-run), Unity and Phaser engine checks.
- **Review evidence (temporary, copy before the session ends):** everything is under the scratchpad
  `C:\Users\shilo\AppData\Local\Temp\claude\C--Programming-Files-Shilocity-PixelLab-PixelDoll\1d5ed24d-c990-4fd6-a8db-a6aebb084e2f\scratchpad\`:
  - `eng-3bbc61ee\app\test\unit\zz-review-*.test.ts`
  - `starter-3bbc61ee\app\test\unit\zz-audit-*.test.ts`
  - `scripts\verify_*.py` with their `out-*.txt` outputs
  - `visual\sheets\` (sheets, APNG and GIF)

## 2. Claim audit

| Claim | Verdict | Evidence | Confidence | Consequence |
|---|---|---|---|---|
| Mask containment holds on all item paths | Agree | `clipToStencil` before and after post-processing (`items.ts:608-611`); restored grids use the saved mask blob and recheck its hash (`run.ts:336-342`) | High | Keep |
| Cache arrays copied | Agree | `extractOnce` copies layer, mask, stencil and cut | High | Fixed |
| `gridItemClip` stencils come from the request, not the settled record | Agree it is equivalent | `requestIdentity` hashes the mask blob (`queue.ts:143-153`), so only an identical mask can be reused | High | Optional hardening only |
| Unread response bodies become uncertain, never resent | Agree for the queue | Status 0 on the unread path; accepted job evidence outranks every error | High | Keep |
| Activity shows correct costs for refused requests | Disagree | A1: possibly-charged POSTs labeled "Free" | High | Fix |
| Studio and Motion Lab queues are isolated ("Isolated records/channel prevent this lab from resuming unrelated Studio work", `motion-lab/run.ts:17`) | Disagree | One lock name `pixeldoll-queue` (`queue.ts:97,338,350`); the Studio queue loads every record (`queue.ts:240`) | High | C1 |
| Starter source pinning prevents stranded free review and export | Disagree for motion frames | Only the source is pinned (`starter-pack.ts:58-75`); Studio cleanup deletes Lab records and frame blobs | High | C1 |
| Analog walk cadence fixed without changing other timing | Agree | Constant leg time per unit of travel at 0.174, 0.5, 0.99 and 1; no NaN at magnitude 0; idle, fallback, non-walk and Preview unchanged | High | Keep |
| Grips must be on opaque body pixels on every path | Agree for render and export; disagree for the paid probe | `attachment.ts:46-47` guards rendering; `equipment.ts:54` builds a paid mask without it | High | B1 |
| Native pixels, layout, attack map, still idle, mirrors, B15 transform, east-axe holds, anchor move and occlusion | Agree | Every value in section 6 reproduced exactly | High | Artifacts are what the reports say |
| "Hid 27/21 item pixels versus 0/1 earlier" | 27/21 agree; 0/1 unknown | Re-rendering frames 3 and 4 with the old anchor and current palms hides 10/9; the earlier palms are not retained | Medium | Report the earlier figure as unverifiable |
| Managed custom skeleton-v3 is available over REST without a template ID | Agree | Dated capture `docs/research/pixellab/2026-11-02-managed-custom-v3-contract.json` quotes the live schema: without `template_animation_id`, `skeleton-v3` animates `action_description` into one 3D motion shared through `animation_group_id` | High | Supersedes "MCP only"; no MCP dependency needed |
| The repository OpenAPI snapshot reflects that contract | Disagree | `pixellab-openapi-v2.json` was last changed in `e1392768` and still describes `skeleton-v3` as template-only | High | Documentation gap; the dated capture in the same folder is the authority |
| AGENTS.md pipeline text is current | Partly | It still says held weapons use "a 96 px oversize layer" and bodies of "48-128 px" | High | Documentation gap (AGENTS edits follow `docs/agent-instructions.md`) |
| Thin valid item pixels can still be removed inside a mask | Agree | Unchanged in `attachHeld` and `dropKeyOutline`; recorded in reviews and the handoff (18.5), but not in `docs/known-issues.md` | High | Add to known issues |
| My earlier claims (armed/split, "0 body pixels differ", "editors paint over the face") | Retracted earlier; still retracted | Section 9 | High | Unchanged |
| Breathing idle rejected only for breath puffs | Incomplete | The west belly inflates into a sphere in frames 1-3; the east belly bulges with an orange mouth artifact | Medium | Add to the rejection reasons |

## 3. Actionable findings

Severity covers user and spending risk. "Current" means present at `3bbc61ee`.

**C1. Current, medium (dev only). The Studio queue owns Motion Lab jobs: it shares their lock, can stall them, and its
cleanup deletes them.**
- **Code:**
  - Every queue requests the lock `pixeldoll-queue` (`queue.ts:97,338,350`). `labQueue` has its own channel and a
    tag-filtered `all()` (`motion-lab/run.ts:18`).
  - The Studio queue's `all()` returns every record (`queue.ts:240`).
  - Studio `cleanUp` keeps only Studio drafts, fits, flow tags and the age cutoff (`state.svelte.ts:920`). It runs with a
    one-week cutoff at every leader start (`:673`) and with no cutoff from "Clear finished" (`ActivitySheet.svelte:11`),
    followed by blob garbage collection.
- **Reproductions:** `zz-review-sharedlock.test.ts`, `zz-audit-starter.test.ts`.
  - **(a) Studio opened first:** the Studio leader adopts and submits a Lab record (`posts {"studio":1,"lab":0}`).
  - **(b) Lab opened first:** Studio work stays queued, because the Studio handoff requests go to a channel the Lab never
    hears. This also breaks an assumption in my own earlier tab-handoff work: that one lock always meant one channel.
  - **AUDIT-1a:** Studio cleanup deletes an 8-day-old Lab record.
  - **AUDIT-1b:** without that record, `starterJobs` throws "A reserved starter job is missing". Both `refresh()` and
    `loadPack()` then fail before the "optional idle cannot block the pack" protection runs, so free review and export are
    permanently blocked.
- **Affected callers:** the Studio leader start, Activity "Clear finished", M1, the starter pack and every Lab candidate on
  the same origin (agent dev server port 5199).
- **No double submission happens:** the lock is exclusive and the starter adds its own lock.
- **Minimal fix (one root):**
  - Make the lock name a `Deps` field (default `pixeldoll-queue`; Lab passes `LAB_TAG`).
  - Exclude Lab-tagged records from the Studio queue's `all()`.
  - That removes Lab records from Studio cleanup and garbage collection as well; no cleanup special case is needed.
- **Regression tests:**
  - both shared-lock cases;
  - `cleanUp(WEEK)` and `cleanUp(0)` keep Lab records, and blob garbage collection keeps their result hashes;
  - `starterFrames` still succeeds afterwards.
- **Falsifier:** AUDIT-1a removing 0 records, or Studio and Motion Lab never being open on one origin.

**A1. Current, low to medium (production evidence). Activity labels possibly-charged POSTs "Free".**
- **Code:** `activity.ts:130` treats any POST with status 401, 402, 423, 429, 503 or 529 as refused and free. The
  unread-body path still passes the header status (`client.ts:92`).
- **Wrong labels:** the queue itself treats these as possibly charged (`lost`, `queue.ts:943`; job evidence first,
  `queue.ts:924`), yet Activity shows them as free:
  - an unread 429 or 503;
  - a read 423, 503 or 529;
  - a 401 or 402 that carries a `background_job_id`.
- **Reproduction:** `zz-review-transport.test.ts`. Output: `429 {"costSource":"free"...}`, the same for 503, 423 and 529,
  and `402+job {"costSource":"free","usagePending":true}`. An unread 200 correctly stays unknown.
- **Affected callers:** the ApiPeek price label and totals (`ApiPeek.svelte:27,34`), and exported activity JSON used as
  billing evidence.
- **Fix:** move the queue's clear-rejection and job-evidence rule into `client.ts` and use it for both. Only a fully read,
  clearly rejected response with no job evidence is free.
- **Falsifier:** provider documentation that 423, 503 and 529 POSTs never create a job.

**A2. Current, latent, low (production). A non-`ApiError` thrown after the HTTP call becomes `failed`, not unknown.**
- **Code:** `queue.ts:919` maps it to `other`, then `state:'failed'` (`:951-953`), keeping `requestStarted:true` and
  dropping accepted IDs.
- **Reproduction:** `posts 1 state failed requestStarted true`.
- **Where it can come from:** only post-response bookkeeping can raise it, such as `finishActivityCall` or a subscriber.
- **Fix:** when `requestStarted && submittedAt`, classify as `lost` ("may have run"), or wrap that bookkeeping in
  `client.ts`.
- **Falsifier:** proof that nothing after `fetch` resolves can throw.

**B1. Current, medium (dev, paid). The held-repair probe can pay for a mask around an off-body grip.**
- **Code:** `motion-lab/equipment.ts:54` checks only that a grip exists. `validateAttachment` checks bounds only
  (`attachment.ts:38`), and "Save attachment draft" persists typed or imported off-body grips.
- **Reproduction:** an off-body grip passes, `enqueueLab` (paid) is called, and the mask has 3,423 editable pixels.
- **Fix:** before building masks, require `attachmentPalmIsOpaque` on the padded result frame, ideally through one
  image-aware validation shared by save, import and the probe.
- **Falsifier:** retiring the probe.

**F2. Current, low to medium (dev, paid). A second tab can change which source a starter request pays for.**
- **Code:** `submitStarter` reads `projectId` from shared storage inside the lock (`starter-pack.ts:148-153`), while the
  UI guard compares the tab's own stale session (`StarterPack.svelte:26,37`).
- **Reproduction:** tab 1 prepares source A, tab 2 prepares B, and tab 1's click enqueues B's `character_id`.
- **Fix:** pass the expected `{projectId, plan.binding}` and reject on mismatch inside the lock.

**F3. Current, low to medium (dev). A provably unsent failed attempt blocks its action forever.**
- **Code:** `history()` throws for any non-done record (`starter-pack.ts:126`), and preparing changed artwork is refused
  (`:97`). A `failed` record with `requestStarted:false`, or an enqueue failure with no record, keeps its hold of 8 with
  no way out except editing storage, which conflicts with "old data cannot brick it".
- **Fix:** an explicit "resolve as not sent" action, only for provably unsent records. `lost` and unknown records stay
  blocked.

**B2. Current, low (dev, spec gap). Foot span is wrong when a looping stance crosses the seam.**
- **Code:** `native-contacts.ts:42,49` uses absolute times and ignores `binding.loop`.
- **Effect:** a planted foot over frames 6, 7 and 0 measures 17.75 px instead of about 0.5. It over-reports and never
  over-qualifies.
- **Fix:** unwrap cyclic frame times for looping bindings.

**D-series. Documentation.**
- Add the thin-fragment loss to `docs/known-issues.md`.
- Note in the OpenAPI snapshot's folder that the dated contract capture supersedes the snapshot for `/characters/animations`.
- Update the AGENTS.md pipeline statements about held padding and body sizes (through the documented process).
- The starter cap (150) is not checked in code against the allowance ledgers, so the budget is enforced only by human
  accounting. Say so, or enforce it.
- Cosmetic:
  - dropped spaces ("retains8native", "North96 to112");
  - the README names the wrong ZIP (`native-…` versus `experimental-…`);
  - the imported name reads "EXPERIMENTAL EXPERIMENTAL";
  - the east-axe Studio and engine projects carry warnings but no `qualified:false` field.

**H1. Hypothesis.** Studio's B15 split changes the blue low bit in 14 of 120 starter cells, inconsistently between frames
(west walk frames 0, 1, 4 and 5 versus 2, 3, 6 and 7). If Shirt and Shorts become recolorable on this body, recoloring
could flicker. Falsifier: derive materials, recolor and diff the frames.

**Not defects (checked):**
- G10 hard fail with fixed coordinates (intended).
- Stencil removals counted in `stray` (informational, documented).
- Detached gray counts depend on 4- versus 8-connectivity (the documents use 4).
- Starter approval invalidation (every relevant control resets review).

## 4. Mask, cache, transport and consent

- Ownership, provenance, fixed coordinates, restored jobs, body cuts, post-processing, valid mask replacement and mutation
  isolation are correct (claim audit).
- Accepted job evidence takes precedence over every error class.
- Only a parsed 429 and the B15 500 refusal are re-queued, and they are clear rejections, not quality rerolls.
- Free GETs retry. Polls never resubmit. A reload marks stuck `submitting` records lost.
- Queued Studio quality work needs `playerRequested`.
- A1 and A2 are the only gaps found, and both concern classification and labeling, not resending.

## 5. Starter durability and cost

- **Holds:**
  - source snapshot and pinning;
  - plan, group and frame-hash binding;
  - idempotent prepare;
  - validation of usage, overflow and USD-only results;
  - native per-view canvases;
  - approval invalidation.
- **Fails:**
  - motion-frame durability (C1);
  - selected versus paid source across tabs (F2);
  - recovery from a provably unsent attempt (F3).
- **Unenforced:** budget enforcement exists only in documents (D-series).
- **Billing:** totals reproduce from the campaign record: 74.25 = 2.25 source + 72 motion; the motion hold is 96.

## 6. Native artifact verification (all reproduced exactly)

- **Counts:** 168 raw PNGs (8 standing, 32 rejected breathing, 64 walk, 64 attack); 136 in the free pack.
- **Placement:**
  - Integer translation only: standing offset (16,16); motion (0,0), and (8,8) for north's 96 px canvas.
  - No clipping. All 120 exported cells equal an independent re-placement.
- **Attack map:** `[7,1,1,3,4,5,6,7]` becomes six cells `[7,1,3,4,5,6]` with playlist `[0,1,1,2,3,4,5,0]` in all eight
  views. Slots are 100 ms and the clip does not loop.
- **Timing:** walk 8 × 100 ms looping; Default 150 ms.
- **Still idle:** exactly the placed Default hash in all eight views, held 4 × 150 ms.
- **No mirror substitution:** all 168 hashes are distinct, and the best flip plus shift still differs by at least 107 px.
- **No fabricated data:** only the eight rest keypoint arrays; no FPS, anchors or character ID; `providerTiming:false`.
- **B15 normalization:** changes the blue low bit only, in 29/39/28/34/26/45/28/8 pixels; no other channel or bit changes.
- **Ready pose versus standing:** alpha identical in six views and 1 px off in NE/SW; RGBA differs in 136/154/109/172/94/182/91/185 pixels.
- **Walk seam (7 to 0):**
  - largest in south (147 versus a 113 maximum among other pairs);
  - east 140 versus 148;
  - not exceptional elsewhere.
- **East axe:**
  - holds `[120,120,80,80,80,120,100,220]`;
  - anchor moved exactly 6.000 px;
  - occlusion 17/14/9/27/21/20/31/21;
  - item colors are a subset of the axe palette, with 0 shared with the body palette, so there are no skin pixels in the layer;
  - Studio and engine exports equal the native pixels.

## 7. Hand, foot and playback

- **Verified:**
  - Missing, typed and imported grips are refused for render and export on the native and rigid paths.
  - Source anchors must be opaque.
  - Clipped source pixels block the ZIP.
  - Native overrides are per frame.
  - Async validation takes snapshots.
  - Failed previews clear.
  - The cadence fix holds (claim audit).
- **What these controls do not prove:**
  - a correct palm or closed fingers (a grip on any opaque body pixel passes);
  - the right occlusion intent;
  - physical foot contact;
  - stride-to-world calibration.
- **Foot data:** east walk stances measure 0.75 px at a test velocity of 22.5 px/s, but each 100 ms hold covers 2.25 px
  of travel, so the feet still slide between frames.
- **Gaps:** B1 and B2.

## 8. Visual review (composites and complete sequences, stills only)

**East axe (best equipped result):**
- **Resolved:**
  - Full head in all 8 frames, with constant design and scale (one native asset).
  - No floating axe: the shaft always enters the body at the palm.
  - f3/f4 read as a real grip, with the butt below the fist and the shaft above.
- **Visible at normal scale:**
  - **f1/f2:** the raised fist is a small knob on the skull, so the handle reads as resting on, or coming out of, the head.
  - **f0/f6/f7:** no distinct hand at the hip. The shaft vanishes into a thigh lump; in f6 the hidden part (31 px) crosses
    the groin.
  - **Body pops:** f5 to f6 changes from a soft profile crouch to a thinner, front-turned, heavily lined torso. f7 differs
    from f0 by 537 body pixels, so returning to idle pops.
  - **Snap:** f2 to f3 is a 114-degree swing with a roughly 40 px grip jump in 80 ms and no in-between frame.
- **At zoom:**
  - serrated handle at about 50 degrees from nearest-neighbor rotation;
  - handle thickness 2 to 3 px between f1 and f2;
  - head highlights flip in f1/f2 because the lit sprite is rotated rigidly;
  - no fingers anywhere.
- **Verdict:** usable as an experimental east-only preset with these limits disclosed. Not an eight-view equipment
  answer.

**Starter walk (8 views × 8 frames):**
- **Seam:** fine. The 7-to-0 step has the same 1 px bob as the other steps, and the head bobs twice per cycle in 7 of 8
  views.
- **Visible at normal scale:**
  - East and north-west faces flicker frame to frame (a black eye-socket block in f0; no face in f3/f4).
  - South-east and south-west twist the torso against a fixed head.
  - The lowest pixel moves 2 to 3 px in SW, NE and S, which is unqualified.
  - North-east and north-west cells all have a black notch in the torso side.
- **Verdict:** experimental preset with disclosed limits.

**Starter attack (six cells, eight slots):**
- **Reads as "raise hand, punch, hunch over", not an overhead chop:**
  - There is no downstroke; the strike is already horizontal.
  - The windup reads as hand-on-head or a salute in S, SE, N and NW.
- **Views disagree:**
  - the crouch drops the head 10 px in S and SW but 1 px in N;
  - in N and NE the visible arm swings toward the back.
- **Timing:** uniform 100 ms gives the strike only one slot, while the nearly identical crouch cells hold for about 200 ms.
- **Verdict:** a weak base for a weapon attack in S, SE, N, NW and SW without per-view authoring. Keep it experimental
  and body-only.

**Still idle:** reads as a frozen statue, as intended.

**Rejected breathing idle:** confirmed rejected. It also has belly-inflation artifacts that the reports do not mention.

## 9. Reconciling the earlier reviews

- **Common final body versus generation provenance:** unchanged. All final composites rebuild on B-star V2; generation
  provenance is mixed.
- **Seam cause:** still unproven.
- **15 percent limit:** stays a candidate-specific authoring criterion, not a gate.
- **x28/D inputs:** corroborated by source code and logs, not proven byte-identical.
- **Rules A/B:** stay deferred pending negative controls.
- **New evidence and how it bears on those dispositions:**
  - The native east axe now gives what the 736 family lacked: constant head and handle design. That supports the agreed
    conclusion that per-frame generation is the source of design drift for held items.
  - C1 is new. It is a weakness in shared queue ownership that my own tab-handoff design did not anticipate: it assumed
    one channel per lock.
  - No new evidence reopens my retracted claims (armed/split exactness, "0 body pixels differ", "editors paint over the
    face"); they stay retracted.

## 10. Recommendation

| Item | Disposition |
|---|---|
| Deployed engineering (containment, cache, uncertainty, exact coordinates, cadence, guards, stale clearing, import/tuck fixes, export timing fixes) | Keep |
| C1 shared queue ownership | Fix; blocks further paid Motion Lab or starter runs, not the deployed app |
| B1, F2, F3 | Fix before the next paid Lab or starter run |
| A1, A2 | Fix (production labeling and classification); not blocking |
| B2, D-series, H1 | Fix or document when convenient |
| East axe | Keep as an experimental east-only preset; do not promote |
| Starter walk and still idle | Keep experimental |
| Starter attack | Keep experimental and body-only; not a base for weapon attacks without per-view authoring |
| Breathing idle, 736 family, 737, 738 | Rejected or research controls (unchanged) |
| Default switch or promotion of any art | Reject |

**Blockers:** no blocker for the deployed application. C1, B1, F2 and F3 block any further paid Motion Lab or starter run
until fixed.

**Next actions (at most three, offline first):**
1. **One shared fix for C1:**
   - a per-queue lock name;
   - Studio `all()` excluding Lab records;
   - regression tests for both lock orders and for cleanup and garbage collection keeping Lab records.

   In the same pass, fix B1, F2 and F3, which are small and local, with their counterexamples as regressions.
2. **Fix A1 and A2:**
   - one shared clear-rejection and job-evidence rule in `client.ts`, used by both the queue and Activity;
   - post-send unknown classification.

   Add the D-series documentation corrections, including known issues and the API snapshot note.
3. **Art, if the owner wants it, offline and with no generations:**
   - one authoring pass on the east axe: move the f1/f2 raised palm off the skull and reconcile f6/f7 with f0;
   - the owner watches the attached APNGs before deciding anything else.

   No new generation is recommended from this review.

**What the owner must decide:**
- whether the starter attack's punch-and-hunch read is acceptable as a body-only experimental preset;
- whether the frozen still idle is acceptable product-wise;
- whether to keep the experimental starter pack importable from the dev tool at all.
