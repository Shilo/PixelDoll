# External mount trial results

Date: November 16, 2026. Experimental branch: `experiment/runtime-mounts-live`. Local commit authorized after review and testing; no push authorized.

Tracking: [Qualify external mounting in Studio and engine exports](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307653465).

## What is implemented

- Studio Preview hosts two schematic external fixtures, labeled **Open seat** and **Covered seat**, with independently authored East and South-East views, rear/front images, a seat track and an independent bob timeline. These are not generated creatures or wardrobe items.
- Any existing move remains selectable. The composed rider comes from the canonical runtime, unchanged, and moves as one wrapper. Layer pivots remain untouched.
- **Reveal covered parts (diagnostic)** makes the fixture foreground translucent. It is not saved or exported and does not identify which leg pixels belong behind a mount.
- An optional three-frame `ride` action uses stored skeleton proportions and the existing Add move pipeline. A paid action prompt excludes mounts, saddles and props. No public mount API or schema was added.

## Council corrections

The independent implementation review found that the initial front/diagonal knees were almost straight. The original test accepted a straight 180-degree knee. Corrected target angles and an upper-bound assertion now require a genuine bend. Bone lengths stay unchanged. Hips and feet are stationary across the three requested frames, not necessarily on their standing ground contacts. Existing silhouette QA remains active.

Other corrected issues: a still rider now has Play/Pause for the mount gait; hip attachment is labeled unreviewed; unsupported-view and diagnostic messages stay visible on short layouts; notes clear the playback toolbar; zoom uses the mounted group.

## Free real-app baseline

Source: existing Pro Test, copied to a new East-only trial project. The original project was not edited. The copy allows one direction to be generated and reviewed before spending on a diagonal. Its current move is the stored standing Default frame.

These baseline observations and saved Studio screenshots predate the human-readable seat labels and help fixes below. They document the original negative baseline, not the final UI.

| Case                          | Observed result                                                                                            | Decision                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| East, standing, Saddle, solid | Rider stands through/on the flank. The legs are not bent into a seated posture.                            | Negative baseline confirmed. Placement cannot synthesize riding. |
| East, standing, Shell, solid  | Front wall conceals the lower body and reads as an enclosed seat.                                          | Plausible for this enclosure only; not a saddle success.         |
| East, Shell, diagnostic       | Covered rider is revealed by translucent front art with a visible diagnostic label.                        | Display-only aid, not evidence of correct limb ordering.         |
| 320 x 640, Shell, diagnostic  | Controls wrap, no document horizontal overflow; notes clear the toolbar but cover much of the small stage. | Functional, cramped; usability limit remains.                    |

The current saddle draws the whole rider above its rear art. It therefore cannot put the far leg behind the barrel. Do not describe it as already providing a far-leg pass. A foreground layer can hide overlapping pixels, but not choose near/far ownership on its own.

## Paid boundary and connection

For one three-frame East base clip, the app estimates **2.3 generations**: one skeleton-v3 clip submission (2) plus three joint measurements (0.1 each). There is no general server quote, so this is not guaranteed billing. No equipment is included in this first call.

The agent configuration intentionally selects `http://localhost:8000/v2`. The initial connection failure was resolved when the user restarted the local Docker API service, `pixellab-website-api-1` (host port 8000 to container port 80). Authenticated free balance checking then succeeded. No credential or API destination was changed. Studio itself runs separately with `npm run dev:agent` on localhost port 5199. Docker alone does not start that Studio process.

### Actual paid East result

One three-frame East `ride` clip was submitted through Studio on November 16, 2026, Pacific time. It completed remotely, followed by three skeleton measurements. Every request had one attempt. Reported usage was **2.3 generations, 0 USD**: 2 for the clip and 0.1 for each measurement. No second clip, South-East direction, equipment generation or automatic retry was submitted.

Only the isolated copy `rig-d673f419-0c60-4b6c-94db-df2138c174a8` was targeted. The original Pro Test project was left unchanged. The rejected images and measurements remain in Activity and IndexedDB. The untouched raw output strip is [mount-live-east-raw-strip.png](evidence/mount-live-east-raw-strip.png), three 64 x 64 cells. It visibly has bent legs and no drawn mount; this alone does not qualify seat fit, temporal stability or garment compatibility.

Offline recomputation using the existing `clipQa` and stored estimator responses found:

| Check                                 | Measured | Existing gate     | Result                                      |
| ------------------------------------- | -------- | ----------------- | ------------------------------------------- |
| Arm-joint adherence                   | 0.53 px  | At most 2 px      | Pass                                        |
| Palette similarity                    | 1.000    | At least 0.970    | Pass                                        |
| Frame-border pixels                   | 0        | 0                 | Pass                                        |
| Invalid/missing joints                | None     | None              | Pass                                        |
| Disconnected pixels                   | 0        | Review if present | None                                        |
| Silhouette-bottom shift from standing | 2 px     | At most 1 px      | Rejected by the partial-direction save gate |

The UI reported “The replacement still fails body-pose quality checks” even though this was a new move. The only failing numerical gate was the standing silhouette-bottom comparison, not an API/network failure. A seated pose intentionally raises the feet, so this is evidence that the acceptance policy needs independent review, not proof that the generated seated anatomy failed. Conversely, arm adherence does not measure leg quality and does not establish a good riding pose. The gate was not bypassed or relaxed, and the move was not published. Stop the paid sequence here and review a pose-aware acceptance contract against the preserved output before any additional spending.

Ledger: clip `1d8261a8-181c-4f1d-918c-f5d8671bbece`; remote job `048ccf2a-6cbe-4383-9af9-f4f41f4c86f3`; measurement records `745881cd-3341-4fa4-aec1-7870f8884220`, `832f55ef-d259-4cd7-86c9-a7d148de57a0`, `f0429123-afcd-4d0f-92cf-d6b7b5631f71`.

### Paid-output review correction and actual recovery

The original rejection above describes the first attempt, not the final outcome. Council review confirmed that `clipQa` already treats the standing-bottom difference as a warning. The targeted-direction publication gate had promoted it to a rejection without a usable acceptance action. The fix preserves that initial gate but adds a free, explicit **Keep frames** review for structurally usable cached results. It does not loosen the thresholds or exempt riding by name.

- The Moves sheet shows every cached frame and its numerical warnings before acceptance. **Keep frames** saves the body only. Selected equipment is not generated or charged; it remains a separate priced step. Existing views stay unchanged until acceptance.
- **Discard** abandons the operation and its same-character queued moves, with that consequence disclosed. Raw generated images remain in Activity rather than being destroyed.
- Acceptance rechecks the current rig, exact request identities, frames and QA hash. A changed character, missing cache, malformed joints, empty frames, frame-count mismatch or clipped artwork cannot silently publish or trigger a paid request.
- Preset, described and walk motion routes use the same cache-only acceptance contract. Missing motion or measurement results stop safely. Joint-check retry remains a separately priced action, not an implicit part of Keep. Ordinary full-move warning saves retain their existing behavior.

The original East trial was opened in the actual Studio Moves sheet with `pixeldoll.agentKey` set to `off`. Its three frames and the 2 px warning were visible. Clicking **Keep frames** published the three-cell `ride` move and retained the warning in `rigQa`. The job ledger stayed at **21 records with identical IDs, states and attempt counts**. No new generation or joint request was sent. The original Pro Test character was not modified.

Pixel inspection after saving found no alpha/shape changes versus the normalized cached raw frames. Each frame had 14 RGB pixels nudged by at most one channel unit by the existing shirt/shorts region-color partition (`splitBase`), which every normal move uses. Thus the final stored cells are not claimed bit-exact to the raw PNGs; there was no palette-repair operation, pose redraw or mount-specific pixel deletion. The untouched raw strip remains linked above.

### Preview clarity and council decisions

The UI now calls the examples **Open seat** and **Covered seat**, explains what each covers, and states that choosing one does not change the pose, spend credits or affect exports. An unsupported facing names the missing view and offers an explicit supported-facing action, including a disclosed standing still when the selected move lacks that animation. It never silently switches moves or directions. **Reveal covered parts (diagnostic)** appears only when a seat is actually drawn. Seat attachment remains explicitly unreviewed.

Browser regression testing caught a missing `directionLabel` import that interrupted missing-view rendering after updating the lead text, leaving old diagnostic notes behind. The import was fixed; no keyed-remount or alternative reactivity system was added. The existing mount E2E case now passes through the unsupported view, supported-view action and diagnostic transitions. A recovery E2E assertion was corrected to the fixture’s real border warning, rather than an arm warning the fixture did not produce; the safety assertions were retained.

The council approved the preset and subsequent cached text/walk acceptance paths after independent safety reviews. It also challenged unavailable diagnostic controls and the missing-view dead end; both were corrected. No none/far-leg/both-leg control was added because this trial has no reviewed rider-part ownership.

## Regression verification

The initial full run passed 360 of 362 end-to-end tests. Both failures were caused by the always-visible experimental mount picker wrapping the ordinary playback toolbar. The experiment is now explicitly opt-in at `http://localhost:5199/?mounts`; without that flag the original toolbar is preserved. After that fix, `npm run check` passed, and four targeted end-to-end cases passed: both original regressions, mount controls/diagnostic/transience wiring, and ordinary Preview controls with the experiment absent. Existing assertions were preserved.

Those were intermediate results. After the Keep implementation, described/walk extension, guidance fixes and council corrections, the final checks passed:

| Check                  | Final result                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------ |
| `npm run check`        | Passed; zero Svelte errors or warnings, TypeScript and formatting passed                         |
| `npm test`             | 193 files passed; 2598 tests passed, one skipped                                                 |
| `npm run e2e -- --all` | All 362 passed in 8.3 minutes, including both earlier regressions and the recovery/preview cases |
| Theme ownership script | Passed                                                                                           |
| `git diff --check`     | Passed                                                                                           |

Focused recovery/state/targeted tests passed 209 assertions before the motion extension; the final focused recovery/API run passed 83 tests after it. The new text/walk cache tests passed, including missing/stale cache refusal and zero-enqueue acceptance. No existing safety assertion was removed. The Svelte autofixer reported only existing unkeyed blocks and general suggestions outside the new controls; final Svelte checking was clean.

Actual Studio DOM checks at 1031 x 939 and 390 x 844 found no horizontal overflow and an 8 px gap between notes and playback controls. Covered-seat reveal toggled its diagnostic message, and the normal light/dark theme control changed the inherited foreground/background correctly. These are interaction and computed-layout checks, not final pixel-level visual signoff. T3 repeatedly could not produce new screenshot frames, so updated screenshot review, short-landscape visual qualification and a diagonal live-art review remain incomplete. The opt-in note stack is still cramped on small stages. Saved screenshots remain the labeled earlier baseline.

The initial six-clip batch does not authorize extra dressing prerequisites. Repository boots/cape fixtures are extracted layers without posable standing references. Existing browser hats/weapons do not validate boots, robes or capes. Report prerequisites instead of substituting easier items or silently increasing spend.

## Remaining qualification

Live seated-art quality, diagonal quality, real garment ownership, reviewed masks versus tuned skeleton segmentation, eight-view coverage, scale families and native engine mount parity remain unproven. Exported rider moves use the existing ordinary-move contract; fixture settings and diagnostic rendering are deliberately excluded.
