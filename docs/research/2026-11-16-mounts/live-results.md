# External mount trial results

Date: November 16, 2026. Experimental branch: `experiment/runtime-mounts-live`. Local commit authorized after review and testing; no push authorized.

Tracking: [Qualify external mounting in Studio and engine exports](https://github.com/users/Shilo/projects/7/views/1?pane=issue&itemId=307653465).

## What is implemented

- Studio hosts one schematic open-saddle mount across Preview, Top-down and Side-scroller. A **Test mount** paw toggle beside the view controls replaces the seat picker. Five authored facings and three explicit westward mirrors cover all eight directions; these are schematic views, not qualified generated creatures.
- Any existing move remains selectable. The composed rider comes from the canonical runtime, unchanged, and moves as one wrapper. Layer pivots remain untouched.
- The covered enclosure and see-through diagnostic were removed from the interactive UI. Their historical comparisons remain below. Ordinary use has no permanent explanatory text stack; the toggle's tooltip identifies the experiment and save/export limit.
- An optional three-frame `ride` action uses stored skeleton proportions and the existing Add move pipeline. A paid action prompt excludes mounts, saddles and props. No public mount API or schema was added.

## Initial council corrections

The independent implementation review found that the initial front/diagonal knees were almost straight. The original test accepted a straight 180-degree knee. Corrected target angles and an upper-bound assertion now require a genuine bend. Bone lengths stay unchanged. Hips and feet are stationary across the three requested frames, not necessarily on their standing ground contacts. Existing silhouette QA remains active.

Other corrected issues: a still rider now has Play/Pause for the mount gait; hip attachment is labeled unreviewed; unsupported-view and diagnostic messages stay visible on short layouts; notes clear the playback toolbar; zoom uses the mounted group.

## Single-toggle council decision

The follow-up council challenged both the choice and its placement. Open and covered seats used the same rider pose, contact calculation and canonical compositor; only fixture artwork, foreground overlap and the bob track differed. The enclosure hid the exact standing-leg and far-leg failures the qualification needs to expose. The single interactive fixture therefore keeps the open saddle, not the more flattering enclosure.

The toggle sits beside the shared view controls rather than below Off hand. Equipment slots promise persistent character layers, priced item generation and exports; this independent scene prop provides none of those. Its state is shared across the three Studio views but is never saved. The flag remains `?mounts`. No extra PixelLab generation was submitted for the new schematic directions.

Preview preserves the selected move. Live views choose an existing Ride view only for the intended facing, otherwise idle/default or standing art, never a walking rider. World movement and camera handling are unchanged. Both the mount bob and Ride playback stop at zero movement; the clocks remain independent. Preview fits the complete mounted group to avoid clipping, which can change its default fit compared with the unmounted body. Live views retain body-based scale. This is an explicit framing tradeoff, not automatic fitting.

The public paper-doll API composes layers and palettes and samples animation time. The consuming game owns input, position, collision and camera movement. PixelLab generates image/animation assets, not gameplay movement. Real mount generation, reviewed seat metadata and save/export support remain a separate entity-authoring task. A user-facing Mount picker may eventually make sense, but it should not send the animal through the clothing extraction pipeline. No public attachment API or engine parity promise was added merely for this demo.

One initial fixture test incorrectly counted the total foreground pixels on a row as a continuous wall: the separate pommel and neck together counted 21 pixels. It now measures the longest continuous run, preserving the no-broad-wall assertion without narrowing legitimate separated artwork.

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

## Initial implementation regression verification

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

## Single-toggle verification

Final combined checks on November 16, 2026: `npm run check` passed with zero Svelte errors or warnings; `npm test` passed 2,602 tests across 193 files with one skipped; and `npm run e2e -- --all` passed all 362 browser tests after the responsive alignment fix. The focused cross-mode mount E2E also passed independently. The theme-ownership check and `git diff --check` passed. No new paid requests were made.

The follow-up independent review accepted the shared renderer, eight schematic views, direction-specific contact and separate host movement. Its clipping concern was addressed by restoring the full mounted-group bounds for Preview only. Its rider-clock concern was addressed by scaling Ride playback with live movement and holding it at zero velocity. The custom help bubble was removed in favor of one concise native tooltip, avoiding duplicate hover help and custom dismissal/layout behavior.

The eight-view geometry and mirroring tests pass. The new body-presentation test proves that live movement chooses Ride only for a matching view, falls back to standing art instead of Walk, preserves ordinary unmounted Walk, and holds/scales Ride time with movement. The cross-mode toggle E2E also passes at 320 x 400 and 844 x 390, asserting mounted pixels stay below the controls, above playback and inside the canvas. Its first tiny-screen run caught an off-screen toggle at 320 px: the floating controls centered within a narrow header grid cell. Spanning the full header fixes that alignment without changing Bronze appearance.

Manual T3 checks confirmed the on/off state, absence of the permanent note stack, light-theme inherited control color and no horizontal overflow at the readable 390 x 844 layout. Its mounted actor pixels stayed within the canvas and above the playback bar there. Subsequent screenshot capture and short-landscape rendering were not reliable: the preview service reported no screenshot frames and later retained an unpainted canvas while still allowing DOM reads. These are tooling limitations, not a claimed visual pass. No final full-page screenshot signoff is available.

## Remaining qualification

### Travel and leg-cutout follow-up

The baseline was committed first as `67ed48a7`. Council review rejected a dedicated Mount panel for one unsaved schematic prop. The toolbar now uses Mount/Dismount text alongside the view tabs when labels fit, with independent 44 px icon targets on narrow screens. More options contains Hide legs: None, Far leg, Both legs. None remains the unchanged baseline.

The council disagreed about deletion versus interleaving: far-leg drawing behind the mount would preserve pixels outside its silhouette, while this explicitly experimental cutout removes selected composed pixels. The cutout was retained as the requested reversible comparison, not as validated segmentation. It may remove equipment and clothing, refuses ambiguous far-leg ownership in North/South, and leaves the image unchanged with an explanation when actual displayed-frame geometry is missing. The bundled demo lacks those measurements; synthetic E2E geometry proves wiring only, not real-art quality. Source art, exports, pivots and contact remain unchanged.

Side-scroller previously used the same 300 world-units/second as Top-down, but its projection made travel appear faster. The trial now uses 150 walking and 195 mounted in Side-scroller, and 300 walking and 390 mounted in Top-down. Mounting is therefore 130% of each mode's walking speed. Official Guild Wars 2 movement-design and ESO riding-system references in `try-the-preview.md` support treating movement as game-specific; they do not establish 130% as a universal standard. Rider and mount clocks scale with analog travel, without claiming foot-contact synchronization.

Independent review caught and resolved a transparent-cell mirror-source mismatch. The full unit run also caught a new movement-to-scene-config asset side effect; travel constants now live with pure movement math. Final type/format checking passed with zero Svelte errors or warnings, and all 2,630 unit tests passed with one skipped. Manual T3 checks verified desktop label adjacency, the contextual control in light mode, dark-mode icon controls and separate 44 px mobile targets. At 320 x 400 the controls fit but leave very little stage height, making the actor tiny. A later preview snapshot timed out, so this is not a complete visual-quality signoff. Browser regression and full-suite results are recorded after completion below. No paid requests were made.

The focused cross-mode mount test passed, including synthetic per-frame cutout wiring and missing-geometry feedback. The full browser suite passed 360 of 362 tests on its first run. The ordinary wrapped-Preview geometry case passed unchanged when rerun alone, a suspected load-sensitive flake. The export looping check sampled too little animation time after Side-scroller was intentionally slowed: its unchanged loop-count assertions now run for equivalent locomotion time using the mode speed ratio. That corrected test passed on its focused rerun. No full-suite rerun was performed after this test-only timing correction.

Live seated-art quality, diagonal quality, real garment ownership, reviewed masks versus tuned skeleton segmentation, eight-view coverage, scale families and native engine mount parity remain unproven. Exported rider moves use the existing ordinary-move contract; fixture settings and diagnostic rendering are deliberately excluded.
