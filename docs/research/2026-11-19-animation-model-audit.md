# Animation model default audit

Status: archival screen and automated checks complete. One live PixMiniMax body-only preflight billed 1 of the approved 120 generations; the matched pilot has not started. No new artwork was saved.

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

## Stage 1: paid pilot, approved and pending preflight

The bundled 64×64 demo has finished headwear and sword layers but no stored rest rig, managed Walk source, or per-direction dressed references. Before spending, qualify a disposable rig-ready fixture, verify the exact production plans, and confirm transient review and per-request spend controls without retaining artwork. No paid fixture preparation or unmatched substitute was run.

### Live body-only preflight, November 20, 2026

- Fixture: existing rig-ready 64×64 Adventurer copy with independently drawn east and south views and a fitted sword. One-item plans for both moves, both views and all three routes total 73.2 estimated generations. Adding the missing hat and its pose calls increases the estimate to 119.2, before this preflight's one-generation receipt.
- Submitted one south Walk to `/animate-pixminimax` through the configured localhost development API, using the production request builder, seed 7, eight frames and prompt enhancement off. One submission, no retry. No project or artwork was written.
- Completed in 91 seconds including polling. The receipt reported 1 generation. The response contained nine 64×64 frames; the leading frame was excluded, leaving eight distinct motion frames. Exact and tolerance-based palette fit were both 100%, including the worst frame. There were 50 nontransparent border pixels summed across the eight raw frames; contact alone does not show clipping.
- This measured response shape, palette, and billing only. It did not run production publication QA, pose the sword, score perceived motion, or test the other models. It is not a matched observation or evidence for changing the default.

Use one frozen 64×64 humanoid with east and south views, one already-fitted head item and one already-fitted hand item. Test Walk and unarmed Slash at eight frames, one predeclared seed, all three body routes: 4 matched cases, **12 body clips and up to 24 fitted gear clips**. Do not redress items between arms. Use the same action intent and direction; document the actual pose source for Skeleton V3 and exact text for both native arms. A shared seed is a blocking label, not a guarantee of matched random draws across models. Randomize arm order within each case. Run the actual production body normalization, measurement, item pose, extraction and QA; in-memory observation must not change whether production would save a result.

Budget envelope: at 64 px and eight frames the app estimates 1 generation for a native body draw plus 0.8 for joint checks; an authored Skeleton V3 Slash estimates 3.8 for body and checks, and Skeleton V3 Walk estimates 7.6 including the motion source. Two ordinary eight-frame gear poses add about 6 per clip before any special item plan. Estimated pilot total is **109.2 generations**, assuming two ordinary poses for every clip. Request a **120-generation approval ceiling**, only if the exact fixture plans fit it; stop before any possibly over-budget submission. Report receipts separately from estimates, including charges for failed jobs. No automatic retries, redress, repair, or paid fallback. If the actual request plan adds such a step, stop and record that arm as unqualified under the first-pass protocol. Body failures stay in the denominator even if gear was never requested. If usage remains uncertain, suspend rather than submit again.

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

Persist only aggregate and per-case numeric or categorical records, prompt text and reproducibility metadata without account or job identifiers. Do not commit, export, or retain generated artwork, screenshots, base64, raw provider responses, or credentials. For paid measurement use a disposable in-memory review surface; do not write fixture output to the workspace or sync browser storage. Review both raters' scores while the temporary session is open. Without transient image access or both raters, report the affected metric as unverified.
