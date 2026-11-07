# Target-palette equipment experiment

November 6, 2026. This is the next controlled experiment after the [completed 60-request campaign](deep-paperdoll-live-trials-2026-11-06.md). The preceding raw edits have mean per-frame palette distance 8.39 on the matched 80 px subset, despite eight passing clips. The existing automatic local matcher improves exact dye coverage but can merge color boundaries. This experiment asks whether the provider's explicit palette condition improves exact standing-color retention without changing input pixels or weakening extraction quality.

## Verified provider contract

The live [PixelLab OpenAPI](https://api.pixellab.ai/v2/openapi.json) was fetched again on November 6. `EditAnimationV2Request.target_palette` accepts `TargetPalette`. Its `colors` list specifies two to 256 hex colors, shared across all returned frames. The separate optional `max_colors` limits the animation to two to 64 colors. The beta `smart` mode is documented for single images. This pilot sends **only `colors`**, with no `max_colors`, name or smart mode. The [color options manual](https://www.pixellab.ai/docs/options/color) separately distinguishes loose palette guidance from enforced colors and palette reduction; these product controls are not assumed identical to the REST field.

The palette is a global RGB contract. It does not identify skin, cloth, metal or a motif. A valid color assigned to the wrong pixel can still satisfy it. Exact palette membership is therefore one measurement beside silhouette, body retention, depth and design identity.

## Fixed plan

The plan contains eight already completed raw-edit controls and eight new edit variants. The new requests cover the green/gold tunic and red hooded cape, south/east, and seeds 110601/110602. Each has eight target Walk frames plus its standing anchor. The generator proves that **the sole request-body difference is `target_palette`**. Every input PNG identity, prompt, seed, route, target order and reference stays identical. All 60 earlier packet/request hashes are rechecked against the committed evidence ledger first.

| Design/view | Palette colors | Seeds | New requests |
| --- | ---: | --- | ---: |
| Tunic south | 53 | 110601, 110602 | 2 |
| Tunic east | 56 | 110601, 110602 | 2 |
| Hooded cape south | 64 | 110601, 110602 | 2 |
| Hooded cape east | 65 | 110601, 110602 | 2 |

Each palette is the exact sorted union of opaque colors from the submitted standing reference and the submitted keyed target body bitmaps. It therefore includes the mannequin shades and approved garment colors. Nothing is quantized, truncated or sampled away when constructing the list. The 65-color palette is allowed because this pilot does not set the separate 64-color `max_colors` cap.

Plan ID: `matched-target-palette-2026-11-06-r1`. Plan SHA256: `d42231a4ec5e841549c8ed552f8776457179208df8818c0d0721336218a2da97`. The [prepared identity ledger](evidence/target-palette-plan-2026-11-06.json) records every pair, original receipt and PNG identity. Generate it with `node scripts/item-trial-palette-packets.ts` from `app/` after regenerating the original public packets. The script cannot connect or submit a request.

The new requests reserved 80 estimated generations. All eight completed after the user-performed final paid click, each with one submission attempt. Actual new charges were $0.64 and zero subscription generations. Each new receipt contains nine returned images, yielding 72 images and 64 evaluated targets. The 16-row bundle also includes eight previously purchased controls; its $1.28 total must not be added wholesale to the earlier campaign. Existing claims were skipped. Unknown or failed claims remain inspectable and cannot become automatic retries.

## Acceptance and evidence

The 16-row bundle was exported through the browser and independently audited. All 144 PNG hashes, output labels and receipt identities match. The eight control jobs and outputs are byte-identical to the earlier campaign, and actual saved request parameters differ only by `target_palette`. The raw bundle is retained locally at `app/test-results-item-trials/palette-evidence/plan.json`, byte SHA256 `dc77380953da0face0b0de4c37b9b0f41b69280b69276d3a0954ec24cc4d789f`. Failed quality outcomes remain alongside passing ones.

All 64 new target frames have zero extracted palette distance to their same-facing approved gear before local dye correction. All eight controls pass QA; six palette variants pass and two fail:

- Hooded cape south, seed 110601, frame 0: G2 key retention 0.956 with 32 lost pixels and G3 key expansion 0.041.
- Hooded cape east, seed 110602, frame 7: G3 key expansion 0.022.

A fresh reviewer inspected all eight frames of every pair, with request labels and metrics withheld. Each panel repeats the same approved standing reference, followed by raw output and frozen-body recomposition for both candidates at integer 2x enlargement. The palette variant was preferred for east cloak in both seeds because its darker, narrower cape stayed closer to the reference, especially frames 1 and 2. The other six pairs tied, all at medium confidence. The preferred east cloak at seed 110602 still fails G3 in frame 7. Visual preference cannot erase that recorded failure. Static all-frame panels do not qualify temporal playback.

## Free counterfactual and measured tradeoffs

The [completed measurement ledger](evidence/target-palette-results-2026-11-06.json) retains all 16 receipt/output identities and every paired frame measurement. `node scripts/item-trial-palette-report.ts <evidence-directory>` first runs the hash-validating report, verifies original controls and planned variant identities, and then compares a free RGB-nearest baseline. The baseline maps each visible control pixel to the closest requested palette color by squared RGB distance; exact ties follow sorted palette order. Alpha and hidden transparent RGB stay unchanged. This is an independent reference algorithm, not a claim about PixelLab's implementation.

Both paid output and the free counterfactual pass through the same shared production extraction, post-processing and QA functions. The research-only evaluator was extracted for these two callers. All 60 earlier report records and contact PNG bytes remain unchanged after that refactor.

| Result over 64 target frames | Original controls | Paid palette | Free RGB-nearest |
| --- | ---: | ---: | ---: |
| Passing clips | 8 / 8 | 6 / 8 | 8 / 8 |
| Raw visible pixels in requested palette | 0 / 64,106 | 63,727 / 63,727 | 64,106 / 64,106 |
| Extracted pixels in approved standing gear palette | 0 / 28,656 | 28,158 / 28,158 | 28,253 / 28,253 |
| Mean frame palette distance before local dye correction | 8.39 | 0 | 0 |
| Pooled retained-proxy mask IoU | 0.8402 | 0.8287 | 0.8415 |
| Raw alpha values changed from control | 0 | 2,051 | 0 |
| Extracted gear alpha values changed from control | 0 | 3,228 | 405 |
| Previously distinct gear-color edges collapsed | 0 | 6,257 | 2,825 |

The free baseline removes 404 control-layer pixels and adds one after extraction, despite preserving every raw alpha value. Those changes are measurable mask differences, not proof that every removed pixel was intended artwork. Its passing QA and slightly higher proxy IoU cannot establish semantic correctness. The retained proxy is older accepted output, not an independent owner mask. Color-edge counts compare the same native coordinates and consider each horizontal/vertical edge once, only where both endpoints are opaque in both gear layers. Changed pose-dependent shading can also affect this count; geometry changes are reported separately. An edge loss describes changed visible contrast, not a guaranteed lost artistic motif.

The free nearest result agrees with paid output on only 22,573 of 62,891 shared visible RGB pixels, or 35.9%. That algorithm does not reproduce the paid output. This does not identify the provider's internal color metric or prove that its palette condition acts during synthesis rather than preprocessing/post-processing.

Authored controls verify tie handling, fractional versus transparent pixels, separate geometry/edge counts, immutable inputs and the full extraction stage. One intentionally incomplete two-green-color palette preserves raw alpha while erasing all 80 pixels of a known blue garment during extraction. That palette deliberately omits approved blue and differs from the actual pilot's complete input-color union. It demonstrates why alpha preservation alone is insufficient; it is not claimed to reproduce a failure in these eight requests.

Neither global reduction becomes a production default. The paid option introduces two new body-key failures. The free option is useful as a comparison but changes masks and collapses color boundaries while the current QA still passes. Exact palette membership, a passing verdict and semantic preservation remain separate acceptance dimensions.

## Qualified local safeguard

The narrower production change strengthens the existing bounded standing-dye correction. Its 12-channel limit, three-unit nearest-match margin, unowned-color competition and preservation of already approved colors remain unchanged. It now inspects every visible horizontal/vertical RGB boundary in the complete same-facing clip before applying corrections. If a proposed replacement would make two previously distinct neighboring colors equal, the implicated replacement is canceled throughout the clip. A source RGB therefore receives the same decision in every supplied frame. No new match or wider tolerance is introduced.

The caller supplies exactly all extracted layers it will map. Inputs are immutable; alpha, dimensions and positions stay exact. Every resulting pixel is either the former bounded proposal or its original RGB. A single veto pass suffices because every replacement belongs to the standing palette and every modified source color lies outside it; reverting a proposal cannot collide with a replacement target. Empty standing/owned palettes and absent eligible corrections return the original images.

The [controlled replay ledger](evidence/dye-boundary-veto-2026-11-06.json) uses all 64 original raw-edit control layers. Owned shade labels are derived with `autoRamps` from each same-facing approved isolated standing layer; they are not independent artist annotations or a claim to reproduce every existing project's material assignment. Against the exact prior bounded implementation:

| Measured property | Previous bounded rule | Clip-wide boundary veto |
| --- | ---: | ---: |
| Pixels assigned to an approved owned shade | 16,500 | 13,070 |
| Previously distinct visible gear-color boundaries collapsed | 652 | 0 |
| Alpha changes | 0 | 0 |

The safeguard cancels 3,430 assignments, or 20.8% of the former corrections, to retain those RGB boundaries. Six clips keep identical corrections; the reduced coverage is concentrated in two cloak clips. This is a deliberate tradeoff: fewer pixels join exact dye ramps, while visible contrast is retained. It does not prove that every retained boundary is an intended motif or every remaining assignment is the correct semantic shade. Ambiguous shared RGB ownership remains unresolved.

Four focused controls cover a two-pixel highlighted buckle, a boundary in one frame vetoing the same RGB across the full clip, an isolated safe correction and unseen-color abstention, and visible four-neighbor versus diagonal/transparent cases including fractional alpha. The existing correction test keeps its original expected RGB values. An independent reviewer verified the caller and the subset proof, then checked 2,000 deterministic randomized contexts containing 6,000 frames and 159,553 distinct visible edges with zero invariant failures. No paid request, model route or generation default changes for this safeguard. [Matcher](../../app/src/lib/dress/item-palette.ts) · [Production caller](../../app/src/lib/items/run.ts) · [Regression controls](../../app/test/unit/item-palette.test.ts)

That independent randomized probe ran inline and has no saved script/hash. Its seed was 93271, using `seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0` and modulo sampling. Each context used three 6x6 frames, up to four grayscale standing shades, independently perturbed RGB channels within ±8, and alpha values 0/128/255. It checked immutable dimensions/alpha/hidden RGB, old-proposal-or-original output, frame-consistent mapping and every distinct visible four-neighbor edge. The authored regression tests and the measured corpus ledger are the committed reproduction artifacts; the inline randomized count is supplementary evidence.

This pilot compared both seeds of both views and inspected all eight frames, including the failed clips, with palette labels withheld from the visual reviewer. A global RGB reduction can destroy an intended highlight or snap a body boundary into cloth, so lower palette distance cannot override missing details, changed geometry, opacity or incorrect ownership. A provider-palette default still needs a held-out body and high-occlusion action qualification beyond this Walk pilot. Production generation defaults remain unchanged.

## Production integration boundary

An independent source audit identified the anchored move edit branch with an existing `c.reference` as the narrowest prospective integration point. Its exact same-facing approved reference and keyed target bodies already exist before the request is hashed. Initial text dressing has no approved outfit colors in its input, so a mannequin-derived palette there could prevent new garment colors from appearing. Skeleton posing has a different contract. Grid repair needs separate proof that palette reduction preserves every protected reference/body pixel outside its mask. Padded weapons need independent thin-hilt, outline, grip and polarity controls. [Request construction](../../app/src/lib/items/run.ts)

Do not dynamically introduce a palette when reconstructing an old paid request. Cache-only anchored recovery rebuilds its request before matching the retained hash. A new global default could therefore hide an already purchased cache match. Any promoted policy must be frozen on new draft calls and retained through reload. The existing queue identity already hashes palette values and their array order, and saved provenance retains the request parameters. No parallel identity system is needed. [Queue identity](../../app/src/lib/pixellab/queue.ts) · [Cache-only recovery and provenance](../../app/src/lib/items/run.ts)

The dev-only harness accepts only distinct six-digit hex colors and rejects unsupported palette keys, stale changed palettes and palette conditions on unsupported trial arms during free preparation. Its single-request preview and plan table disclose exact color counts. Preparation preserves all earlier request hashes, so loading this experiment cannot reclassify an old paid request as a new one.

Preparation passed all 19 focused trial tests and the full 1,882-test unit/native suite, with zero skips. The five added counterfactual measurement controls pass, and type checks report zero errors and warnings. The browser loaded, prepared and retained the expected plan before the user submitted it. All eight new requests subsequently completed and were exported without resubmission.

Final verification after the shared evaluator and local boundary safeguard: **1,891 tests in 151 unit files pass, including native Godot and Aseprite, with zero skips**. Type checks have zero errors and warnings; the affected Studio and browser-selftest suites pass all 68 tests, and the production build guard is clean. The earlier stable full browser suite remains the 248-test export qualification described in the preceding campaign; it was not rerun for this localized correction.
