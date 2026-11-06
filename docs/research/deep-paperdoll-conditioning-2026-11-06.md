# Stable chroma and standing reference conditioning

November 6, 2026. Two offline ablations using tracked PixelDoll benchmark fixtures. This study evaluates the images a model would receive. It does not measure PixelLab render quality, billing, or latency. The [provider audit](deep-paperdoll-provider-2026-11-06.md) explains why the source image matters to Skeleton v3. The [earlier chroma spike](tool-spikes-2026-11-06-chroma-and-occlusion.md) identifies how the extraction mask can misclassify repainted body as equipment.

## Keep mannequin shades stable across views and poses

Production [`toChroma`](../../app/src/lib/image/chroma.ts#L54) maps the luminance range of each input cell onto the same key ramp. The same source color can move along the ramp when that cell loses a dark outline pixel or gains a highlight. This introduces a second change alongside the intended motion. A fixed profile derived from all independent standing views keeps the mapping constant while retaining the existing chroma hue and alpha rules.

**Method.** Read the A, B, N, and C body JSON and PNG pairs in [the benchmark fixtures](../../app/test/fixtures/bench). Slice each sheet using `rows`, `cols`, and `rig.cell`. The 150 occupied cells include 14 standing views, 112 Walk frames, and 24 Slash frames. Compare the current per-cell range, one range per direction over all its cells, the shared range from all standing cells, the oracle range from all cells, the absolute range [0, 1], and a shared five-shade range. Keep the same green ramp, native geometry, and alpha throughout. For each occupied pixel use `L = (0.299R + 0.587G + 0.114B) / 255` and `t = clamp((L - low) / (high - low), 0, 1)`. The green channel is `round(60 + 195t)`. Verify the per-cell calculation against production for every input pixel. The five-shade variant uses `round(4t) / 4`. All evaluated green shades met the current key threshold.

| Body / native cell | Occupied cells / visible pixel observations | Current largest same-RGB green-channel spread | Current pixels with a source color spreading ≥10 | Mean P90−P10 green contrast, current / standing profile / absolute | Local luminance edges merged by five shades |
| --- | ---: | ---: | ---: | ---: | ---: |
| A / 64 px | 51 / 27,760 | 43 | 17,498 | 150.6 / 141.2 / 134.9 | 6,262 / 28,155 (22.2%) |
| B / 80 px | 45 / 37,661 | 10 | 640 | 165.0 / 158.6 / 138.2 | 14,844 / 47,330 (31.4%) |
| N / 160 px | 27 / 84,442 | 17 | 42,739 | 168.9 / 161.3 / 144.2 | 36,398 / 94,681 (38.4%) |
| C / 80 px | 27 / 32,855 | 24 | 20,205 | 175.9 / 165.6 / 155.6 | 12,398 / 37,847 (32.8%) |

“Visible” means source alpha greater than zero. Group observations by the exact source RGB within each body, then compare the minimum and maximum green channel across all occurrences. The ≥10 column includes every occurrence of a color whose group spreads by that much. For contrast, take the 90th and 10th percentiles of each cell's green channel using integer rank, subtract, then average the cell differences. For edges, compare right and down neighbor pairs where both are visible and the original luminance differs by at least 3/255. Count how many map to the same green channel.

The standing profile produced zero same-color drift and zero out-of-range observations among 182,718 visible pixels. Each standing range matched its all-cell oracle exactly. Average within-cell contrast fell 3.9–6.2%, with zero collapsed luminance edges at the measured threshold. Absolute [0, 1] also stopped drift but lost 10.4–16.2% of the existing contrast. Direction-only pooling still left 8–24 levels of cross-view spread. Five shades stopped drift and retained a large gross luminance span, but merged 22.2–38.4% of local edges that the continuous ramp preserves. That argues for comparing a **continuous shared profile** first. The five-shade arm answers a separate question about provider palette adherence.

These fixtures all contain a dark outline and cover Walk and one Slash family. A new side-scroller import can have a narrow or flat standing palette, and a later move can expose lighter or darker shades outside the calibrated range. Synthetic control: a standing image with gray levels 96–110 cannot distinguish 80 from 95 or 112 from 125 after clamp. Track saturation per input, and qualify either a profile with headroom or an absolute fallback fixed at calibration time for a low-span body. Keep one mapping for a planned batch. A per-cell fallback reintroduces the original drift.

## Rebuild the standing reference from frozen body and equipment

Several routes use a provider-dressed raw composite as a standing reference. Skeleton v3 redraws that source before posing it. Anchored edit uses it as the first input. Frozen inpaint places it in a protected grid cell. Reconstructing a conditioning image makes the source match the frozen pixel contract outside the proposed item and permitted body cut. Compare this separately from changing the key profile. [Request construction](../../app/src/lib/items/run.ts) · [Live provider behavior](deep-paperdoll-provider-2026-11-06.md#live-provider-audit)

**Method.** Run [`runBench()`](../../app/scripts/bench.ts) on the tracked corpus and select the `rest/<direction>/0` cells. This uses the production chroma extractor, per-slot band, and standing cut policy with the frozen body, including the original held-item padding. For each cell:

1. Compute the present per-cell `toChroma(base, case.key)` raster.
2. Record the exact input-composite differences in the subset where the keyed body is opaque and the extractor assigned neither an item pixel nor a permitted cut. Separately count raw visible pixels outside both the body and item.
3. Apply [`cutBase`](../../app/src/lib/compose/compose.ts#L63) to the keyed body using the extracted cut indices. Copy it before source-over compositing the extracted layer with [`over`](../../app/src/lib/compose/compose.ts#L189). At native coordinates compare the rebuilt result against the body and the extracted equipment separately. Inspect RGBA only where the source body or item owns a pixel.
4. Run [`extractCell`](../../app/src/lib/items/items.ts#L695) again on the reconstructed raster with the original standing parameters, then compare masks, retained colors, and cuts. This round-trip deliberately treats the existing extractor as the policy under test. It supplies no semantic ground truth for item ownership.

The table excludes 11 standing cells in three historical cases marked `reference` because their chroma keys were superseded. Standing cells in the remaining 17 cases are retained benchmark evidence, not a set of manually approved masks. “Raw protected change” compares against the current canonical keyed body. The benchmark stores response cells and paired bare artwork rather than the historical submitted PNG for every case. Differences can include renderer redraw, quantization, or a historical keying difference.

| Slot | Standing cells | Raw protected RGBA differences | Of those, alpha differences | Raw outside-body pixels with no item owner | Extracted equipment pixels retained exactly in rebuild | Added pixels on re-extraction |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Head | 22 | 13,404 / 13,404 | 6 | 0 | 7,075 / 7,075 | 4 |
| Back | 11 | 8,287 / 8,287 | 15 | 17 | 13,386 / 13,386 | 7 |
| Outer torso | 11 | 4,891 / 4,891 | 4 | 0 | 2,817 / 2,817 | 0 |
| Feet | 3 | 1,382 / 1,382 | 4 | 0 | 341 / 341 | 0 |
| Hair | 3 | 1,452 / 1,452 | 0 | 2 | 341 / 341 | 0 |
| Main hand | 6 | 3,244 / 3,244 | 5 | 3 | 867 / 867 | 0 |
| Off hand | 3 | 1,531 / 1,531 | 3 | 5 | 515 / 515 | 0 |
| **Total** | **59** | **34,191 / 34,191** | **37** | **27** | **25,342 / 25,342** | **11** |

The rebuild has zero protected RGBA differences, respects all 109 permitted cuts, and retains every extracted item pixel exactly. It replaces the raw color of 4,268 already-extracted item pixels with the corresponding layer color, reflecting the existing extraction and despill policy. The retained sample has no fractional alpha. A partly transparent item can produce different RGB and alpha when source-over composited over the body, so exact item RGBA within the *conditioning composite* is not a general guarantee. Leave authored translucency outside the pilot.

The second extraction lost no original mask pixels or their colors and changed no cuts. It added 11 foreground pixels on top of the body in five cases. All additions are from the result of reapplying extraction to the reconstructed composite. The benchmark does not identify their true owner. The result confirms that a rebuilt reference should be a **derived conditioning input only**. Keep the raw provider result for evidence and keep the accepted item layer and body cut as separate canonical data. Repeatedly extracting the conditioning composite can change the item.

The 11 superseded comparison cells have 6,082 / 6,082 raw protected RGBA differences, 827 unowned outside-body pixels, and eight foreground additions on second extraction. The rebuild preserved the 3,512 pixels classified as item. This cannot recover design pixels that the wrong key had already removed. The published labels for the old key arms are a stronger ownership check than agreement between two outputs of the same extractor. [Benchmark labels](../testing/bench.md)

## Test each conditioning choice independently

| Arm | Source image | Target inputs | What it tests |
| --- | --- | --- | --- |
| Existing raw Skeleton v3 | Stored same-direction dressed output | Identical frozen target skeletons | Control. |
| Rebuilt Skeleton v3 | Frozen keyed standing body, same-direction extracted item and recorded body cut | Same skeletons, source keypoints, prompt, seed, palette policy and dimensions | Whether removing the raw body's repaint helps grip, garment consistency, and body registration. |
| Existing anchored edit or inpaint | Existing standing reference and per-cell keyed frozen target rasters | Identical target indices, prompt, seed, grid, and mask | Control for range stability. |
| Shared-profile edit or inpaint | Same extracted item, and standing plus target mannequins keyed with one body profile | Same inputs except the ramp mapping | Whether stable luminance helps without reducing pose readability. Compare with a rebuilt **per-cell** condition first to isolate the profile effect from reconstruction. |

Start with a rigid head item, a long cape, and a padded asymmetric held item. Include facing changes, a checked body cut, a hidden limb, an intentionally overhanging part, and a negative control with key-colored clothing. Use paired results on the exact native grid. Count protected-region errors, visible retained design and motif pixels, new off-key body fragments, grid/pivot drift, and significant frame-to-frame shifts. Inspect both the isolated item and recomposed sprite. Keep body and item appearance checks independent. Record actual costs and the endpoint/seed with every candidate, including failures. Repeat across bodies and seeds before changing the default. Keep any request hash and saved-frame recovery policy consistent with the derived conditioning version.

## Leave-one-frame-out repair stencils on frozen renders

I withheld each animated cell in four public benchmark cases. These are the 80 px tunic, cloak, and greathelm, plus the 64 px cape with walk and slash moves. The 168 held-out cells use the production benchmark's post-processed item alpha and body cuts as a proxy for wanted output. The cape includes the existing failing north slash. I retained that direction as a stress case and report failures on passing directions separately. This test measures how much of an existing result the stencil would permit. It cannot tell which pixels belong to the intended design, how the provider responds to a smaller mask, or whether the provider paints any permitted body and background. [Frozen cases and verdicts](../testing/bench.md) · [Benchmark reader](../../app/scripts/bench.ts)

- **Band** uses the same `bandOf → garmentBand → bandMask` path as production, with the direction's standing design extracted from its stored composite by `chromaLayer`. The 80 px rig has measured target joints. The 64 px fixture stores requested joints only, so its band and projected stencil use those as a proxy. In production, an absent observed skeleton can also leave the band broader. [Grid mask construction](../../app/src/lib/items/run.ts#L149) · [Garment extent](../../app/src/lib/items/garment-coverage.ts#L22)
- **Neighbors** union the binary masks immediately before and after the held-out index from the same clip and direction. At an endpoint only one neighbor contributes, even for looping moves. **Joint neighbors** project each mask independently before the union. The head stencil translates by the mean eye and ear displacement. The cloak and cape use the neck and shoulder center and the hip center. The tunic also uses knee and foot centers. For each source row, interpolate the two surrounding anchor displacements and round the result to whole pixels, with constant displacement beyond the outer anchors. Both arms dilate by two pixels in a square neighborhood and intersect the broad band. This deliberately limits new edit permission to coordinates already inside the band.
- **Truncated edge** removes the rightmost four occupied columns of the target item. Dilate the surviving target mask by two pixels and compare it alone and in union with either neighbor stencil. The complete-loss run supplies no target item or cuts to the stencil. Report the portion of the omitted alpha or body cut that the stencil makes editable. Body and background exposure count permitted pixels outside the proxy item alpha, separated by original body alpha. Some permitted body pixels are legitimate cut candidates and are scored separately.

### Complete loss

| Case | Arm | Item pixels retained | Worst frame retained | Extra body / background px per frame |
| --- | --- | ---: | ---: | ---: |
| 80 px tunic, 40 frames | Band | 14,803 / 14,803 | 100% | 194.5 / 2,147.4 |
| | Neighbors | 14,788 / 14,803 | 345 / 352 | 115.0 / 144.4 |
| | Joint neighbors | 14,783 / 14,803 | 345 / 352 | 115.6 / 144.4 |
| 80 px cloak, 40 frames | Band | 29,415 / 29,415 | 100% | 407.6 / 4,479.0 |
| | Neighbors | 29,234 / 29,415 | 509 / 559 | 190.8 / 360.1 |
| | Joint neighbors | 29,226 / 29,415 | 509 / 559 | 191.7 / 357.1 |
| 80 px greathelm, 40 frames | Band | 12,560 / 12,560 | 100% | 105.0 / 2,757.0 |
| | Neighbors | 12,560 / 12,560 | 100% | 42.8 / 137.4 |
| | Joint neighbors | 12,560 / 12,560 | 100% | 42.3 / 133.7 |
| 64 px cape, 48 frames | Band | 16,068 / 16,071 | 620 / 623 | 343.3 / 1,870.0 |
| | Neighbors | 15,878 / 16,071 | 176 / 225 | 141.3 / 227.4 |
| | Joint neighbors | 15,866 / 16,071 | 177 / 225 | 141.1 / 227.9 |

The most consequential misses were in passing clips. The 80 px cloak lost 50 of 559 pixels on southeast walk frame 1, and the 64 px cape lost 49 of 225 on south walk frame 0. The joint projection lost more pixels in aggregate in every case with any loss. Agreement between neighbors did not guarantee support for the middle frame. At least 95% IoU between the two projected masks admitted 8 of 40 cloak frames. In that subset the joint arm still covered just 515 of 550 pixels in east walk frame 2, compared with 526 for fixed neighbors. The same gate admitted 2 of 40 tunic frames, 27 of 40 greathelm frames, and 2 of 48 cape frames. The greathelm passed alpha coverage but each basic neighbor arm excluded 35 of 329 recorded body-cut pixels, including 24 of 232 in the high-agreement subset.

### Truncated edge

| Case | Lost edge px | Band permission | Surviving crop only | Crop plus neighbors | Crop plus joint neighbors | Worst crop-plus-neighbors frame |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 80 px tunic | 1,401 | 1,401 | 1,011 | 1,398 | 1,396 | 65 / 68 |
| 80 px cloak | 2,228 | 2,228 | 1,474 | 2,183 | 2,183 | 40 / 79 |
| 80 px greathelm | 2,637 | 2,637 | 1,551 | 2,637 | 2,637 | 100% |
| 64 px cape | 1,648 | 1,648 | 1,106 | 1,637 | 1,637 | 5 / 8 |

The crop-plus-neighbors mask covered 14,800 of 14,803 total tunic pixels, 29,370 of 29,415 cloak pixels, 12,560 of 12,560 greathelm pixels, and 16,057 of 16,071 cape pixels. It allowed a mean of 119.8 / 148.3 body and background pixels outside the tunic, 201.1 / 375.3 for the cloak, 43.5 / 139.7 for the greathelm, and 150.2 / 241.5 for the cape. The cape's 5-of-8 worst edge was east slash frame 0 in a passing clip. The cloak's edge miss was the same southeast walk frame that failed the complete-loss test.

A full-disappearance input is visually identical to one with no equipment expected. The four cases supplied no genuinely empty target, so I also made a synthetic expected-empty control at south walk frame 3 in each case while leaving the same neighbors. With no semantic visibility signal, the narrow neighbor stencil still opened 529 pixels for the greathelm, 727 for the tunic, 1,366 for the cloak, and 727 for the cape. Every one of those pixels was outside the now-empty proxy item. Eligibility needs a separate visibility or deliberate repair decision before it opens such a frame.

### Candidate order and regressions to preserve

1. **Rigid headwear with supported body cuts.** A union of the two neighbor item masks and their recorded cut masks, dilated by two pixels, retained every proxy greathelm item pixel and all 329 cut pixels over 40 frames. Mean extra exposure was 43.6 body and 153.9 background pixels, compared with 105.0 and 2,757.0 for the band. Projecting the item and cut masks produced the same coverage with 43.1 and 150.1 extra pixels. Adding projected standing cuts did nothing further in this case. A three-pixel dilation without explicit cuts also retained everything, with higher exposure at 62.4 and 216.3. Test the fixed neighbor union with explicit cuts first. Include held-out headwear styles, asymmetric horns, ear and hair occlusion, facing changes, and a known body cut. Any candidate must keep cut permission independent from item alpha and skip hidden frames.
2. **Close-fitting garments with bounded motion.** Three-pixel fixed-neighbor dilation retained all 14,803 tunic pixels and every truncated-edge pixel, exposing 155.3 body and 224.4 background pixels per frame. At two pixels it missed 15 item pixels and at one pixel it missed 89. The three-pixel setting is a candidate for a separate paid comparison on this walk geometry. Check raised arms, bent knees, loose hems, and color-key collisions before promoting it. Where support is uncertain, preserve the broad repair band and the standing garment extent.
3. **Loose cloaks and animated capes.** Keep the band for complete loss and truncated regions where the shape can leave its neighboring envelope. Even four-pixel fixed dilation covered only 511 of 559 pixels on the worst cloak frame and 177 of 225 on the worst cape frame. A narrow mask can serve as a review overlay to show expected regions. Treat learned local deformation, swing and depth as separate experiments with out-of-envelope cases and an exact immutable-body control.

A future generation comparison should hold grid layout, reference, seed, palette, and pose fixed. It should score outside-mask changes, inside-mask unowned body pixels, missing motif or edge pixels, body cuts, intentional overhang, and expected emptiness separately. Check the isolated item and composite at native coordinates. Existing grid extraction binds the submitted mask to both the item and its cuts, so an undersized stencil can cause data loss even when the provider draws the intended pixel. This offline comparison supports choosing a first live pilot and explicit fallbacks. [Submitted mask and grid extraction](../../app/src/lib/items/run.ts#L723)
