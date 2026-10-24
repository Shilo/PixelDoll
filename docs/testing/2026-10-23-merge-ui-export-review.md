# Merge UI and export challenge — 2026-10-23

Reviewed merge `a6e27de9ac17dbfd93f6f6d2feabd63d27b21c1a` against main `0eb169e04415c61798e8bd6346756ede88980997` and redesign `c641929861f5db15c54101ff8ef2c435b0ab1230`. Scope: export integration, equipment/item changes, Studio integration and request previews. This is a bounded review, not a certification of every engine or UI path. No PixelLab API requests or token/environment-file reads were performed.

## Confirmed regression: Unity ignores clipped canonical body variants

**P2.** In the reviewed commit, `app/src/lib/export/unity.ts:167` selects `data.baseItem` directly for the body node; only other slots use `Shown`. When a covering slot has `clips: ['body']`, the merge exports a valid `base~hat` body variant but Unity renders the unclipped `base`. This affects both Play Mode and the initial imported prefab: the importer calls `Sync` after setting its hidden clock and before saving the prefab.

The merge introduces the failing combination by combining two changes:

- Main previously ran `withColorVariants` before `withTuckVariants`. For body clipping it created a visible `body_colour` layer and hid the canonical body; that normal equipment layer passed through `Shown`.
- Redesign removed color-copy baking, but its validator counted both the canonical body and the derived body variant as bodies and rejected such exports. Merge `generic.ts:41–44` newly permits valid derived body variants, exposing the retained Unity bypass.

Offline reproduction: a valid 64×64 body has red pixels at `(10,5)` and `(10,30)`; an equipped hat has a blue brim pixel at `(10,10)` and its slot clips `body`. `exportFiles(..., {engines:['unity'], baked:true})` returns no errors and ships both `base` and `base~hat`. At `(10,5)`, Studio, baked output and `base~hat` are transparent, while Unity's selected `base` sheet is opaque red. The lower body pixel remains opaque, proving the clip is selective.

The generated Phaser and GDevelop JavaScript was executed with minimal offline host harnesses on the same exported manifest: Phaser selects `base~hat` as its body texture; GDevelop selects the `base~hat/main` node. Godot's `_layer_of` and `_refresh` resolve `_shown` for all slots, including body; this was inspected in generated code, not executed in Godot. No equivalent bypass was found in those runtimes.

The repair is to apply the existing `Shown` resolver to the body ID as well as equipment IDs. Body material ownership remains valid because the derived variant retains `variantOf: 'base'`; the existing color routine accepts that owner. Visibility derives from the original equipped item, whose hiding rules the derived variant copies. The independent hidden clock remains unchanged.

## Regression coverage and limits

Added `Unity resolves a clipped canonical body for both the prefab preview and runtime` to `app/test/unit/unity-export.test.ts`, preserving all existing tests. It verifies exported clipped-body pixels above and below the brim, exported composition against Studio and baked output, derived item metadata, the generated Unity resolver integration, and the importer initialization/save order.

Before the source correction, four existing Unity export tests pass and the new test fails specifically on the generated C# body-selection assertion. Pixel and manifest assertions pass. Vitest does not execute C#; an actual Unity import/render is not claimed.

After the source correction, the focused Unity export suite passes all five tests. Verification uses the repository's Node 24.22.1 runtime and Vitest 4.1.12, with `TEMP`/`TMP` redirected to the ignored workspace scratch directory to avoid a sandbox temporary-file rename error.

The merged `export-colors.test.ts` changes appropriately adapt from baked color copies to runtime palettes. However, its body-clipping case exports only `generic` and reconstructs output with PixelDoll's own compositor. That does not validate the Unity runtime selection and therefore missed the regression. Existing Unity tests inspect serialization and generated source but previously had no clipped-body case.

## Challenged and excluded

- Unity editor preview uses canonical default colors while Play Mode applies selected outfit palettes. This is reproducible but explicitly documented in the exported Unity README; classify it as an inherited intentional limitation, not a merge regression.
- Border-touching item/headwear quality checks changed from failures to review warnings. The merge decision explicitly calls this a policy change. The altered tests do not establish an accidental dropped safeguard by themselves.
- No further confirmed merge-specific defect was identified in the bounded Studio, request-preview, or item/equipment review. This does not imply exhaustive browser accessibility or native engine verification.
