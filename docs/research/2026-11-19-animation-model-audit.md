# Animation model default audit

Status: PixMiniMax is the product default, not a finding of equipment parity. In the recorded matched tests both body routes passed the Walk cap checks. In the later eight-frame, east/south Slash comparison with the same coat, PixMiniMax failed both item checks at 9.6 generations; Skeleton V3 passed both at 13.6 generations. That is one coat and character, not a general failure rate. Sword fit and repeatability remain unqualified. The earlier interrupted receipt is still unknown. No artwork is included.

PixMiniMax is the product default for new moves; this is not a finding of equipment-fit parity. When a native body or its fitted motion equipment fails automatic checks, the results can offer a priced Skeleton V3 option, not a promise of better output. Opening it does not spend or replace artwork. If confirmed, it generates a body-only draft for review. Equipment remains a separate paid choice after saving. Suggestions attached to saved body drafts can be reopened with the draft; suggestions attached to a completed equipment job stay with that job's current results.

Decision: could PixMiniMax replace Skeleton V3 as the Add a move default without trading expressive motion for lower equipment accuracy, character consistency, or reliability? Text V3 is the third arm, not a presumed fallback. The equipment renderer stays Skeleton V3 in every arm. Ride is out of scope and stays on its pose-driven path.

## Stage 0: executed offline

Read existing PNG blobs from `1f95029` directly into memory. The screen covers S2 `b48`, Walk, Slash, and Death, east/south/north, with eight archived frames per clip: **9 clips per route, 27 clips and 216 frames total**. For Skeleton V3, use `s3_k1/walk_{dir}_v3tpl_s7` and `s3_k1/{slash,death}_{dir}_v3_s7`; for native routes, use `s4_anim/a48_{pixminimax,v3}_{move}_{dir}`. Read frame suffixes `_0.png` through `_7.png`. Hurt was excluded from this screen because the same complete eight-frame archive set was unavailable. Use the directional standing `s2_base/b48_{dir}.png` as the RGB palette. Weight each visible pixel equally within its clip, with alpha of at least 128. Excursion is the range of the horizontal silhouette center; bottom range is the difference between the highest and lowest bottom edge across frames. Border is measured on the raw canvas.

| Route | Median clip palette fit | Clips below 97% | Raw border-touch clips | East / south / north slash excursion |
| --- | ---: | ---: | ---: | --- |
| Skeleton V3 | 100% | 0/9 | 6/9 | 9.5 / 5.5 / 5.5 px |
| PixMiniMax | 100% | 2/9 | 0/9 | 7 / 11 / 4 px |
| Text V3 | 97.30% | 3/9 | 0/9 | 5 / 4 / 0 px |

- PixMiniMax missed the palette threshold on east Walk (90.83%) and east Slash (96.00%). Walk bottom range was 1–2 px; south Slash was 7 px. The separate earlier Slash prompt produced more excursion, so a single prompt cannot establish a stable motion advantage.
- Text V3 missed on east Walk (96.36%), east Death (91.79%), and north Death (95.49%). The prior live six-frame Cast body saved, but four headwear frames failed key retention. No matched equipment results were added here.
- Skeleton V3 touched the raw border on all three Walk and Death clips. Those files are 64×64; the native files are 68×68. The extra native padding and the historical pose/prompt differences rule out causal ranking. Raw border touch is not proof of lost pixels. Inspect against the submitted pose and intended floor line in the live matrix. Intentional movement such as a fall is not a stabilization failure.
- `npm test -- targeted-move dress-regions`: 27 passed. These are fixture-backed regression checks for route/frame handling, recovery, item batching, and native body recolor behavior, not a measurement of provider quality. A read-only fetch of the public PixelLab OpenAPI confirmed that the three body routes and `/estimate-skeleton` still exist. It does not establish billing or quality.

### Archived palette screen with the production tolerance

Rescored 216 raw frames using the color comparison in `paletteFit`: count pixels with nonzero alpha, and accept a pixel if one standing palette color differs by no more than 12 in each RGB channel. The 97% gate applies to the pooled clip score; individual frame misses are diagnostics, not additional gates. This reproduces the color comparison on archived inputs, not the full production QA path.

| Route | Median clip fit | Clips below 97% | Individual frames below 97% |
| --- | ---: | ---: | ---: |
| Skeleton V3 | 100.00% | 0/9 | 1/72 |
| PixMiniMax | 100.00% | 1/9 | 8/72 |
| Text V3 | 97.47% | 3/9 | 25/72 |

PixMiniMax east Slash clears the clip gate at 97.35% but falls to 90.84% on its worst frame. East Walk still misses at 96.11%. Palette fit measures color retention, not motion quality, exact dye compatibility, or equipment alignment. These historical inputs are unmatched and do not establish parity.

### Archived motion continuity screen

Decoded the same 216 archived frames to RGBA in memory, ignoring RGB at fully transparent pixels. Every clip had eight distinct frames. Across the seven adjacent transitions in each clip, a stationary silhouette means no change to the binary alpha mask at a threshold of 128. This is not the same as a frozen frame: color or interior details can still change. Exclude the loop seam from this screen to avoid imposing a loop on Death.

| Route | Walk clips with a stationary transition | Death clips with a stationary transition | Slash clips with a stationary transition |
| --- | ---: | ---: | ---: |
| Skeleton V3 | 0/3 | 0/3 | 0/3 |
| PixMiniMax | 0/3 | 2/3 (east, south) | 2/3 (east, north) |
| Text V3 | 0/3 | 0/3 | 0/3 |

PixMiniMax's median adjacent silhouette change on Walk was 157 / 86 / 78 pixels for east / south / north, versus 157 / 77 / 69 for Skeleton V3 and 115 / 86 / 72 for Text V3. This challenges any conclusion that PixMiniMax is inherently static based on the live Slash alone. A stationary transition can be a deliberate hold, especially at the end of a one-shot. Conversely, high silhouette change can be jitter, camera drift, unintended props, or a different pose. The archive lacks matched inputs and blind ratings, so these are diagnostics, not a route ranking.

## Stage 1: approved paid pilot and follow-up

The bundled 64×64 demo has finished headwear and sword layers but no stored rest rig, managed Walk source, or per-direction dressed references. Before spending, qualify a disposable rig-ready fixture, verify the exact production plans, and confirm transient review and per-request spend controls without retaining artwork. No paid fixture preparation or unmatched substitute was run.

### Live body-only preflight, November 20, 2026

- Fixture: existing rig-ready 64×64 Adventurer copy with independently drawn east and south views and a fitted sword. One-item plans for both moves, both views and all three routes total 73.2 estimated generations. Adding the missing hat and its pose calls increases the estimate to 119.2, before this preflight's one-generation receipt.
- Submitted one south Walk to `/animate-pixminimax` through the configured localhost development API, using the production request builder, seed 7, eight frames and prompt enhancement off. One submission, no retry. No project or artwork was written.
- Completed in 91 seconds including polling. The receipt reported 1 generation. The response contained nine 64×64 frames; the leading frame was excluded, leaving eight distinct motion frames. Exact and tolerance-based palette fit were both 100%, including the worst frame. There were 50 nontransparent border pixels summed across the eight raw frames; contact alone does not show clipping.
- This measured response shape, palette, and billing only. It did not run production publication QA, pose the sword, score perceived motion, or test the other models. It is not a matched observation or evidence for changing the default.

### Live sword-only Slash qualification

- Ran the production Add a move path on an in-memory copy of the same character, facing south, at eight frames and seed 7. The PixMiniMax body returned nine frames; production kept eight and stored joints for all eight. Four paid skeleton checks supplied the measurements; the other frames needed no additional paid check. Skeleton V3 posed and extracted all eight sword frames.
- Body QA reported 100% tolerant palette fit, zero foot drift, and 80 border-contact pixels. Sword QA retained the full key and reported zero shifted frames, but marked all eight grips ambiguous. That is a first-pass review warning, not confirmation of a wrong hand or a clean equipment pass. No blind visual rating was recorded.
- Receipts: 1 generation for the Slash body, 0.4 for skeleton checks, and 3 for the sword, totaling 4.4 generations for this case. The earlier body-only Walk brings confirmed spend to 5.4.
- The browser session ended during the Skeleton V3 baseline without a recovered submission or terminal receipt. Its artwork, outcome, and charges are unverified. Do not assume zero spend or rerun it automatically. Text V3 and the remaining matched cases were not run. Keep Skeleton V3 as the default.

After restarting Docker and the local API, an authenticated read-only balance request returned HTTP 200. The audit browser session was gone, and the available API logs did not identify the interrupted job. A successful balance request establishes connectivity, not per-job billing. No additional generation was submitted. Full offline verification passed: 2,895 unit tests passed, one skipped, and the static, localization and formatting checks passed. These checks do not qualify live motion or gear fit.

Seven targeted browser regressions passed. The move draft test covered model order, keyboard frame steps, and clamping from 40 PixMiniMax frames to 16 V3 frames on the test canvas. Three replacement tests covered retained views and estimates, eligible equipment, and mirrored effects. Three API Preview tests covered draft updates without submission, recorded request and usage details, and phone layout. No live artwork was available for screenshots.

### Matched live body-only Slash after restart

The prior browser fixture was no longer available. On the configured local development API, created a fresh humanoid with independent south and east views and a 64×64 cell. The standing sword returned artwork but received a QA warning, so it was not accepted as a reference and no gear comparison ran. Used the same standing south view, eight frames and seed 7 through the production body path for all three arms. No palette repair, re-roll, or visual rating was performed.

| Body route | Returned / kept / distinct frames | Exact RGB fit on saved pixels | Production tolerant fit | Median adjacent silhouette change | Body render generations |
| --- | --- | ---: | ---: | ---: | ---: |
| Skeleton V3 | 8 / 8 / 8 | 84.01% | 100% | 93 px | 3 |
| PixMiniMax | 9 / 8 / 4 | 100% | 100% | 0 px | 1 |
| Text V3 | 9 / 8 / 7 | 97.72% | 97.70% | 25 px | 1 |

All arms saved eight joint sets with zero reported foot drift and border contact. Text V3 had one production warning. The tolerant score is measured by production before post-save region processing and reported at its stored precision; exact fit is a separate diagnostic on saved cells. Different region processing makes the exact figures unsuitable for ranking color fidelity. Silhouette change counts binary-alpha pixel differences, not motion quality. PixMiniMax repeated the same opening frame three times and returned to it on the last frame. Distinct-frame counts show where to look for a stall but do not establish perceived motion quality.

Reported charges for this round: 2 generations for the initial body fixture, 10 for the standing sword, 5 for the three Slash body renders, and 1.6 for 16 skeleton checks. The additional character registration returned no explicit receipt, so 18.6 is a confirmed subtotal, not total spend. Combined with the earlier 5.4, confirmed charges are at least 24 generations; the interrupted baseline charge also remains unknown.

Keep Skeleton V3 as default. This is one action, one view, one character and one seed, without a qualified gear reference or independent visual review. The matched Walk, east Slash, and equipped comparisons remain open.

### Matched live Walk follow-up

Opened a fresh, disposable browser session with an in-memory database. Created one 64×64 humanoid fixture (48 px body, seed 19017, two independent views) and reused its standing art and joints. Initial preflight tried to add a new move for east only. Production correctly refused because a new move needs all independently drawn directions; the attempts made no generation requests. Each actual Walk arm used both south and east, eight frames, seed 7 and the production Add a move path, restoring the same frozen standing project between arms. This is a new Walk block, not a resend of the interrupted Slash request.

The native motion intent was `walking, unarmed, no weapon, no props, no other people, no effects`. Text V3 appended the requested facing. PixMiniMax received the facing and view as separate fields, with `standing upright with empty hands` as its initial pose. Its production subject caption combined the creation description with canonical base-body styling, including some conflicting appearance cues. Keep this in mind when interpreting the result as a comparison of the routes as shipped, not a controlled comparison of provider internals. Skeleton V3 used managed `walking-8-frames` motion, then the normal Skeleton V3 body render. The two-view body plans estimated 3.6 generations each for PixMiniMax and Text V3 and 15.2 for Skeleton V3. Fixture drawing reported 2 generations; the completed registration has no reported charge and is not counted as free.

| Route and view | Returned / kept / distinct | Palette fit | Bottom displacement | Border pixels | Median adjacent silhouette change |
| --- | --- | ---: | ---: | ---: | ---: |
| PixMiniMax east | 9 / 8 / 8 | 99.16% | 0 px | 0 | 79 px |
| PixMiniMax south | 9 / 8 / 8 | 100.00% | 3 px | 0 | 64 px |
| Text V3 east | 9 / 8 / 8 | 96.00% | 1 px | 0 | 129 px |
| Text V3 south | 9 / 8 / 8 | 99.20% | 1 px | 0 | 107 px |
| Skeleton V3 east | 8 / 8 / 8 | 96.30% | 1 px | 0 | 177 px |
| Skeleton V3 south | 8 / 8 / 8 | 100.00% | 1 px | 0 | 66 px |

PixMiniMax published both views, completed 16 joint measurements and reported one QA warning. The audit readout initially looked up saved blobs with the wrong key format after publication. Recovered the metrics from the already-paid results in memory using the production normalization and palette comparison, without any regeneration. The 3 px bottom displacement exceeds the normal 1 px warning threshold; it is not a direct foot-sliding measurement. The body and joint receipts total 3.6 generations. Walk did not reproduce the repeated frames from the matched south Slash, so that earlier result is not grounds for calling PixMiniMax generally static.

Text V3 also published both views and completed 16 joint measurements for 3.6 generations. East was below the 97% palette threshold. South had a facing warning on frames 7 and 8, where estimated shoulder width fell to 46% of standing. That is a review flag, not independent confirmation that the body turned. The published new-move path reports QA warnings without automatically replacing, trimming, or repairing the artwork.

Skeleton V3 published both views and measured all 16 body frames. Estimated arm-joint difference from the input poses was 0.59 px east and 0.33 px south. Native models have no supplied pose, so those numbers are not a cross-model accuracy ranking. Skeleton V3 also crossed the palette warning threshold on east; its south view had no warnings. Receipts matched the 15.2-generation estimate: 6 for the motion source, 6 for body renders and 3.2 for measurements. This block makes PixMiniMax the cheaper Walk body route with better palette retention on east, at the cost of more south floor displacement. None of these measures establishes a blind motion win.

Measured ankle motion relative to the midpoint of the hips. East horizontal ankle excursion (right/left) was 10.11/9.39 px for PixMiniMax, 14.93/14.12 px for Text V3, and 15.10/16.42 px for Skeleton V3. At the loop seam, mean two-ankle movement was 4.11 / 10.68 / 5.42 px east and 3.32 / 3.10 / 0.52 px south, in that same route order. The median interior movement was 2.22 / 3.18 / 4.65 px east and 1.13 / 1.64 / 1.16 px south. The clearest seam outliers here are Text V3 east and PixMiniMax south. These are estimator-based motion cues, not annotations of actual ankle placement, cadence, contact, or perceived animation quality.

For the equipment check, a simple black cap passed both standing views (seed 27183, 10 generations). The short sword (seed 27184, 10 generations) passed south but received an ambiguous-grip warning on east and was not used for a two-view fitted comparison. It was not rerolled. To restore PixMiniMax's original production clip record for fitting the shared cap, replayed exactly 18 completed requests in memory by request hash with network fallback disabled. It reproduced the saved body QA, including the 3 px south warning, without another POST.

The same two standing cap references were posed by Skeleton V3 for every Walk arm at seed 7. All six calls returned eight frames and billed 3 generations each. Published coverage is not a pass: Text V3's south cap remained in review despite all eight cells being present. The lowest key-retention score there was on frame 6. Anchor drift is the maximum change in the cap centroid relative to the measured head anchor and the matching standing offset. It checks whether the saved layer follows the measured head, not whether the head estimate or the cap is correct by independent visual annotation.

| Body route | Cap QA east / south | Minimum key retention east / south | Maximum anchor drift east / south | Reported body + cap cost (both views) |
| --- | --- | --- | --- | ---: |
| PixMiniMax | Pass / Pass | 99.1% / 100.0% | 1.39 / 0.00 px | 9.6 gens |
| Text V3 | Pass / Fail | 97.5% / 96.7% | 1.46 / 1.23 px | 9.6 gens |
| Skeleton V3 | Pass / Pass | 100.0% / 99.6% | 1.39 / 0.15 px | 21.2 gens |

The fitted costs exclude standing-item creation and character registration. This follow-up reported **62.4 generations**: 2 for character drawing, 22.4 for Walk bodies and checks, 20 for standing cap and sword, and 18 for cap fitting. The fixture's completed registration had no usage receipt. Combined with prior rounds, reported spend is at least **86.4 generations**, plus unreported charges. No in-flight jobs remained when this block ended. The browser rendered six in-memory filmstrip rows, but the T3 preview could not produce a screenshot frame. No image was written to disk and no visual-preference or independent landmark score is claimed.

**Decision:** PixMiniMax is a viable optional Walk route on this fixture: cap QA and measured head tracking were comparable to the Skeleton V3 baseline, and body-plus-cap cost was 9.6 versus 21.2 generations. The larger south loop seam and the prior Slash repeats argue against a universal default switch. Text V3 had both a body-facing warning and a cap failure on south. Keep it as an advanced option, preserve the equipment gates, and inspect Text V3's repeated headwear failures before broadening its use. The next discriminating comparison is unarmed Slash on the Walk fixture configuration, across all three routes at eight frames and seed 7, with a clean shared standing cap and held reference. With no qualifying held reference, report the cap comparison separately and do not infer grip parity.

Use one frozen 64×64 humanoid with east and south views, one already-fitted head item and one already-fitted hand item. Test Walk and unarmed Slash at eight frames, one predeclared seed, all three body routes: 4 matched cases, **12 body clips and up to 24 fitted gear clips**. Do not redress items between arms. Use the same action intent and direction; document the actual pose source for Skeleton V3 and exact text for both native arms. A shared seed is a blocking label, not a guarantee of matched random draws across models. Randomize arm order within each case. Run the actual production body normalization, measurement, item pose, extraction and QA; in-memory observation must not change whether production would save a result.

Budget envelope: at 64 px and eight frames the app estimates 1 generation for a native body draw plus 0.8 for joint checks; an authored Skeleton V3 Slash estimates 3.8 for body and checks, and Skeleton V3 Walk estimates 7.6 including the motion source. Two ordinary eight-frame gear poses add about 6 per clip before any special item plan. Estimated pilot total is **109.2 generations**, assuming two ordinary poses for every clip. Request a **120-generation approval ceiling**, only if the exact fixture plans fit it; stop before any possibly over-budget submission. Report receipts separately from estimates, including charges for failed jobs. No automatic retries, redress, repair, or paid fallback. If the actual request plan adds such a step, stop and record that arm as unqualified under the first-pass protocol. Body failures stay in the denominator even if gear was never requested. If usage remains uncertain, suspend rather than submit again.

### Matched live Slash coat comparison

Both arms used the same registered 64×64 character and qualified standing coat, with eight frames per view, east and south, and seed 7. PixMiniMax used a tuned empty-hand Slash prompt; Skeleton V3 used authored Slash poses. Both arms used Skeleton V3 to pose the coat and returned all 16 coat frames per arm.

| Body route | Coat QA east / south | Minimum backing-color retention east / south | Body and coat cost |
| --- | --- | --- | ---: |
| PixMiniMax | Fail / Fail | 94.4% / 84.3% | 9.6 generations |
| Skeleton V3 | Pass / Pass | 97.2% / 98.5% | 13.6 generations |

Backing-color retention measures how much of the expected keyed body survives the item render; it is not a direct measure of coat coverage or layering. PixMiniMax east also flagged three disconnected body pixels. Skeleton V3 east flagged a 2.7 px body arm-pose difference. All 40 comparison requests settled with 23.2 reported generations and no retries or unknown receipts for this block. The browser rendered in-memory filmstrips; no independent visual rating is claimed. One matched fixture supports keeping the optional retry, not a general conclusion about coats.

Standing setup was separate: 12.25 generations for the character, registration and first sword, then 20 for the shared coat and a revised sword, totaling 32.25. The first sword failed east standing QA with a left-hand detection and stray pixels. The revised sword passed south, but east still had an ambiguous grip. Neither sword entered the matched animation comparison. The proposed two-route sword-and-garment block was estimated at 35.2 generations before setup or fallbacks; it was not run. See the [equipment fit follow-up](pixminimax-equipment-fit-followup.md).

### Offline follow-up: dye coverage and prompt sensitivity

Replayed the archived RGB frames through production `splitBase`, `deriveMaterials` and `recolor` in memory, applying different colors to Shirt and Shorts. Each route contributed 72 measured move frames. Mixed cases also used 72 Skeleton V3 frames to seed dye colors but scored only the named native route. The denominator is nontransparent pixels classified as garment grays by production, not hand-labeled clothing.

| Body route | Extra Skeleton V3 frames seed colors | Garment-gray pixels changed | Lowest frame coverage |
| --- | --- | --- | ---: |
| Skeleton V3 | No | 12,550 / 12,550 (100%) | 100% |
| PixMiniMax | No | 2,344 / 11,243 (20.8%) | 7.2% |
| PixMiniMax | Yes | 7,499 / 11,243 (66.7%) | 38.6% |
| Text V3 | No | 2,424 / 11,331 (21.4%) | 11.5% |
| Text V3 | Yes | 7,489 / 11,331 (66.1%) | 44.6% |

Source artwork and alpha were unchanged. These unmatched archive results show a limitation for dyeing base clothing, not a failure rate for all characters or a test of swappable equipment dyes. Skeleton V3 covering its own encoded ramps does not prove correct garment classification. In the earlier S4 PixMiniMax Slash prompt comparison, both prompts produced eight distinct frames in each of east, south and north. The original prompt produced an unwanted sword and a south facing change; the revised unarmed prompt produced no props. That shows prompt sensitivity, not the cause of the later repeated-frame result or equipment parity. Raw loop seams did not test interpolation and are not evidence about item fit.

## Stage 2: replication and stress testing, separately budgeted

1. **Matched quality matrix:** Three character proportions across at least two supported canvas sizes, Walk (loop), Slash (held-side accuracy), Hurt or Death (one-shot), and one described action (prompt fidelity). Use four actual rendered directions, not mirrors, and two predeclared seeds. At eight frames this makes 96 matched cases and 288 body clips before equipment. Stage in blocks, audit after each, and stop for reproducible systemic defects. Include a material/recolor-sensitive character. Fit identical head and hand items per case; add torso gear in a predefined subset to check layered coverage and dye behavior. A single pilot or one body is not enough to promote a default.
2. **Frame boundaries:** In separate blocked comparisons test common 4, 8 and 12 frames where supported. At 256×256, V3 tops out at eight, so 12 is not a common cell there. Verify Skeleton V3 at 3 and 15, PixMiniMax at 16 and 40, and V3 at 16 on a smaller canvas and 8 on 256×256. Track actual returned and kept counts, dropped leading frames, timestamps, order across item pose batches, and discontinuity at batch boundaries. Do not pool model-only counts into a head-to-head quality result. Test invalid counts and quote/request agreement without paying.
3. **Repeatability:** Repeat a predefined subset once with the same inputs, and compare with the alternate-seed condition. Test renderer predictability separately from robustness across different seeds. One repeat or a pixel similarity score alone cannot establish that an animation is stable.

## Measurements and decision rule

| Dimension | What to record per matched case |
| --- | --- |
| Motion | Blind paired preference for naturalness and readability at the same playback duration; action completion, limb excursion, loop seam and one-shot ending. Show bodies alone before showing composites. Two reviewers score independently; record agreement and ties. |
| Accuracy and identity | Facing, intended limb/hand, invented props or effects, per-frame palette fit and worst frame, floor contact for planted phases, bounding box, crop and silhouette. Pose adherence is only defined when a pose was supplied; use shared visible landmark annotations on a fixed, blind subset for cross-route accuracy. |
| Gear and stability | First-pass publication and reasons for rejection; joint measurement completeness, head/hand displacement from the annotated anchor, grip pixel distance and wrong-hand frames, key retention, stray pixels, garment coverage and temporal jumps. Use production QA unchanged and report any result that the production gates miss. Include dye and export results for the predefined torso subset. |
| Operations | Requested/returned/kept frames, first-pass failure and fallback eligibility, elapsed time, charged generations and USD where reported, and cost per fully accepted body-plus-gear case. Record exact route, app revision, canvas, action intent, route-specific cue, seed, and reviewer scores. |

Promotion requires all of the following on replication: zero observed critical wrong-facing, wrong-hand, invented-prop, clipped-body, or gear-loss defects for the candidate; no reproducible regressions in recolor or export; PixMiniMax's paired first-pass fitted success no worse than Skeleton V3 by more than five percentage points using a one-sided 95% bound that accounts for clustering by character and action; at least two-thirds PixMiniMax wins among non-tied blind motion comparisons, with ties and reviewer agreement reported; and no higher cost per accepted fitted case. Report paired counts, interval and results by action, direction, body and canvas. With too few independent blocks or an inconclusive interval, keep Skeleton V3 and extend the matrix rather than declaring parity. Apply the same gates to Text V3; report which actions it does well rather than hiding a failure in the pooled result. Keep manual Skeleton V3 available even if the default changes.

Treat the Stage 2 grid as a defect screen, not as a guarantee of statistical power. Directions, frame counts and seeds on the same body/action do not count as independent trials. Even in a simplified zero-discordance binomial check, 12 independent character/action blocks give a one-sided 95% upper bound of 22.1% for a candidate-only failure. That simplified check needs 59 independent blocks to get below 5% with no candidate-only failures. Shared characters or actions and nonzero discordance require a paired, clustered analysis and may require more cases. If the pilot passes, set the replication sample size from the paired pilot data before buying a larger run. If the pilot finds a reproducible critical failure, diagnose and rerun only a deliberately scoped qualification block instead of expanding the whole grid.

Persist only aggregate and per-case numeric or categorical records, prompt text and reproducibility metadata without account or job identifiers. Do not commit, export, or retain generated artwork, screenshots, base64, raw provider responses, or credentials. For paid measurement use a disposable in-memory review surface; do not write fixture output to the workspace or sync browser storage. Review both raters' scores while the temporary session is open. Without transient image access or both raters, report the affected metric as unverified.
