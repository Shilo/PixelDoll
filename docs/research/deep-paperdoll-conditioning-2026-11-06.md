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
