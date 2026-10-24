# Rotation-origin audit and alignment withdrawal — 2026-10-23

## Conclusion

The bottom-based alignment feature introduced in `53b02f1` and refined in `5faef61` was geometrically unjustified and is removed. Matching the lowest opaque row across directions does not establish a common rotation origin. In these bare-footed top-down sprites, front-facing toes extend lower than back-facing heels. Equalizing those extents introduces a direction-dependent translation even where head placement and the estimated ankle midpoint already agree closely.

Earlier tests established lossless transformation, coherent rig coordinates and safe publication. They did **not** establish that the chosen transformation improves the character. The earlier reports calling the offsets corrections should not be read as validating that premise.

## Evidence, with no new generations

Reused saved L01–L06 exports. Measured each original standing rotation's top opaque row and the midpoint of its saved LEFT LEG / RIGHT LEG keypoints. Those keypoints represent estimated ankles, not measured sole contacts or a guaranteed physical ground origin. Checked the existing L04 aligned export directly, including actual stored rest images and transformed keypoints. L02/L03 after-values below are mathematical predictions of the former tool's suggested rigid shifts; no aligned copies or paid requests were needed for them.

| Saved set | Camera | Head-top range, original → aligned | Ankle-midpoint Y range, original → aligned |
|---|---|---|---|
| L02 | High top-down | 0 → 2 px | 1.552 → 3.552 px |
| L03 | Low top-down | 0 → 1 px | 1.488 → 2.488 px |
| L04, actual saved copy | High top-down | 1 → 5 px | 3.088 → 8.088 px |

The other three sets received no suggested vertical change and remain unchanged under that rule. The sample demonstrates counterexamples, not a universal guarantee about PixelLab's origin placement.

L04 South/North gives the clearest independent check:

| Measurement | Original South | Original North | Aligned North |
|---|---:|---:|---:|
| Head top Y | 32 | 32 | 37 |
| Estimated ankle-midpoint Y | 139.456 | 139.896 | 144.896 |

The north/south head difference increases from **0 to 5 px**, and estimated ankle-midpoint difference from **0.440 to 5.440 px**. Raster inspection corroborates the projection explanation. Head tops are useful here because the bodies are bald and similarly posed; hats, hair, tilt or asymmetric silhouettes would make that test less reliable. No new automatic ankle- or head-based alignment is introduced.

## Rollback scope

- Removed Align directions action, sheet, transform/save-copy pipeline, associated fixture/browser/core transformation tests and feature guide.
- Retained `character.motionOffsets` round-tripping plus managed/text future-pose conversion and four orchestration tests for existing aligned copies. Otherwise those already-created copies would receive incorrectly positioned future moves. Authored poses and setup reset behavior remain intact.
- Removed the static cross-direction “ground line above/below shared pivot” warning because it makes the same invalid silhouette-to-origin inference. Kept within-direction motion, stride, headroom and pose checks. Reproduced the diagnostic regression before removing that warning.
- No saved character, original, aligned copy, library item or historical QA record was rewritten or deleted. Returned the live Studio to the untouched original. Earlier aligned copies remain separately identifiable.
- Unrelated creator design, V3, prompt enhancement, sizes and mirror controls remain unchanged. Unrelated design work and all generated evidence stay outside this commit.

## Verification

`live-creator-2026-10-23/verify-rotation-origins.mjs <external-evidence-directory>` reproduces the head/ankle measurements, verifies the actual saved L04 aligned copy, and asserts that all three affected sets worsen on both independent measurements. The script never writes project data or calls PixelLab.

Full unit suite: **274/274 passed**. TypeScript/Svelte check: **0 errors, 0 warnings**. Production build and secret guard passed (existing Vite chunk-size advisory only). Codex browser confirmed that Align directions is absent, both saved characters remain, and the unmodified original opens with all eight idle rotations. The marked comparison was visually checked in Codex browser. Credits spent: **zero**.

Annotated comparison and audit JSON are outside Git under `C:/Users/shilo/.codex/visualizations/2026/10/22/01a163bf-8348-7e41-a13c-418a806554d2/alignment-comparison/`.
