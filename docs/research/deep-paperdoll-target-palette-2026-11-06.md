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

The new requests reserve 80 estimated generations. Eight matching controls cost $0.08 each, so $0.64 cash is an inference from receipts, not a provider quote or billing cap. The existing claims are skipped. Unknown or failed claims remain inspectable and cannot become automatic retries. A user-performed final paid click is required by the browser approval handoff already encountered in this session.

## Acceptance and evidence

This document records a prepared protocol, not a claimed provider improvement. Once the eight new receipts complete, export the 16-row plan and independently validate all hashes with the existing report script. Retain failed quality outcomes alongside passing ones. Measure exact requested-palette membership on raw opaque pixels, same-facing approved gear-color membership after extraction, palette distance before local correction, alpha, key retention/expansion, raw and extracted silhouette changes, charge and complete returned cardinality.

Compare both seeds of both views before choosing a default. Inspect all eight frames of every failed clip and review matched images with palette labels withheld. A global RGB reduction can destroy an intended highlight or snap a body boundary into cloth, so lower palette distance cannot override missing details, changed geometry, opacity or incorrect ownership. A new default needs a held-out body and high-occlusion action qualification beyond this Walk pilot. Until that evidence exists, production generation defaults remain unchanged.

The dev-only harness accepts only distinct six-digit hex colors and rejects unsupported palette keys, stale changed palettes and palette conditions on unsupported trial arms during free preparation. Its single-request preview and plan table disclose exact color counts. Preparation preserves all earlier request hashes, so loading this experiment cannot reclassify an old paid request as a new one.

All 19 focused trial tests and the full 1,882-test unit/native suite pass, with zero skips. Type checks report zero errors and warnings. The browser loaded, prepared and retained the plan with exactly eight unclaimed requests, eight existing claims and the expected plan hash. No new paid submission is implied by those preparation checks.
