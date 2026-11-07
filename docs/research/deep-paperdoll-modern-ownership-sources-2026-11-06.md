# Modern part ownership and mask scoring

November 6, 2026. This spike examines Pixor's current export contracts and the recent Paper-Doll Pipeline competition report. It compares their ownership assumptions with PixelDoll's frozen equipment frames. Published contracts, executed local controls and proposed changes are identified below. No browser session, paid generation, model installation, private image or application source change was used.

## Primary sources and what could be verified

| Source | Inspected evidence | Practical boundary |
| --- | --- | --- |
| [Pixor asset graph](https://pixor.art/docs/asset/) | Its manual describes fixed action, camera and part-set inputs, previews produced by the export writer, independent layer outputs, and frame identity retained when sheets are rearranged. Overlay rejects mismatched frame layouts. | These are documented contracts. The native renderer and browser demo were not executed for this spike. No public renderer source was linked from the inspected pages. |
| [Pixor engine export](https://pixor.art/docs/export/#paper-doll-layers) | The documented paper-doll export draws a base without equipment and exports each piece's visible pixels. It supplies a stacked preview and advises disabling cast shadows for exact stacking. Elsewhere on that page, the light kit assigns a ramp number to each pixel independently of RGB. | Visible pixels establish the current outfit. Reusable hidden surfaces and arbitrary equipment combinations require further evidence. A ramp label is more specific than a nearest-color match. |
| [Paper-Doll Pipeline report](https://devpost.com/software/paper-doll-pipeline-agentic-vision-for-2d-character-rigs) | The author reports MobileSAM proposals, geometric mask scoring, explicit human mapping and clip approval, and an FK rig for separated parts. Its reported dust threshold is 200 px. Its full-frame parent bug was corrected by removing such masks before containment analysis. | The listed source paths were not linked to a discoverable public repository. The scorer and reported cloud run could not be independently executed. Its stated scope excludes locomotion, grasping and recovery of undrawn occluded parts. |

Pixor also documents a sheet-wide depth scale with nearest/farthest values in metres, and a ramp lookup that can keep lighting on a material's palette. Neither fact establishes independent depth or complete material ownership for every exported equipment piece. PixelDoll receives composited PixelLab images, so it would need a trusted source for those extra labels. [Pixor depth and light-kit contract](https://pixor.art/docs/export/)

## Experiment 1. A mask threshold does not transfer across pixel scale

The published `<200 px` dust rule was replayed literally on PixelDoll's frozen corpus. This executes the reported area rule and PixelDoll's current mask extraction. It does not execute the unavailable author implementation or reproduce MobileSAM proposals.

The selection excludes reference-only cases, empty cells and standing views. It includes only animated cells whose corresponding clip currently reports `pass` in the frozen benchmark. That yields 440 visible cells across 13 cases. A passing pipeline verdict is a repeatable proxy for useful output, rather than an independent artist label. [Benchmark loader](../../app/scripts/bench.ts) · [Frozen corpus results](../testing/bench.md)

| Case | Passing visible cells | Equipment area range | Rejected below 200 px |
| --- | ---: | ---: | ---: |
| `a-helmet` | 40 | 101–142 | 40 |
| `a-cape` | 40 | 176–626 | 6 |
| `a-chest` | 48 | 58–198 | 48 |
| `a-hair` | 48 | 83–147 | 48 |
| `a-sword96` | 24 | 121–163 | 24 |
| `a-axe96` | 32 | 111–160 | 32 |
| `a-bow96` | 8 | 156–169 | 8 |
| `b-tunic` | 40 | 208–464 | 0 |
| `b-cloak` | 40 | 478–1,141 | 0 |
| `b-greathelm` | 40 | 279–353 | 0 |
| `b-jester-blue` | 40 | 410–510 | 0 |
| `n-cloak128` | 16 | 1,569–2,030 | 0 |
| `c-greathelm` | 24 | 456–545 | 0 |
| Total | 440 | 58–2,030 | 206 |

The fixed rule rejects 206/440 cells, or 46.8%. Each mask was then enlarged by exact 2 × 2 and 4 × 4 pixel replication. All 206 rejected masks crossed the area threshold at 2×. Downsampling the replicated masks at their original sample coordinates produced zero differences, and connected-component counts changed in zero cells. Thus the acceptance change came entirely from scale. Across the native masks, 300 of 521 connected components were also smaller than 200 px. Those counts are component geometry, not evidence that the smaller pieces are defects.

PixelDoll should retain native-scale witnesses such as the grip, head region and accepted item support, then measure size relative to the appropriate frame or approved equipment. Shape confidence, temporal support and semantic owner should remain separate observations. A score calibrated on separated vector limbs cannot be promoted directly to tiny helmets, sword glints or split clothing. This result argues against adopting that external threshold, while retaining its explicit reason strings and reproducible decision records as useful precedents.

The report's full-frame containment correction is also relevant. A rejected proposal can corrupt the evidence of an otherwise valid child if it remains in the parent graph. Filter invalid candidates before calculating ownership relationships, and preserve the rejected proposal separately for inspection. The original project's bug and fix are author-reported. This spike verified the scale problem on PixelDoll data.

## Experiment 2. Exact stacking does not establish reusable equipment

Pixor's visible-only piece description suggests a useful counterfactual control. The following authored 64 × 64 scene has independently known ownership and four RGBA colors. It uses an 864-pixel gray body, a 616-pixel red tunic and a blue shield in front. The shield occludes 304 tunic pixels. The tunic's visible export is its full mask with those 304 pixels removed. The body is retained without equipment, and the shield is exported intact.

The half-open rectangles are body `[20,44) × [20,56)`, tunic `[18,46) × [24,46)`, and shield `[30,50) × [27,49)`. Their RGB values are `(100,100,100)`, `(180,30,20)` and `(20,80,180)`, all at alpha 255. All other pixels are transparent black.

| Composite operation | Incorrect RGBA pixels |
| --- | ---: |
| Body + visible tunic + shield compared with the original full outfit | 0 |
| Remove the shield, retaining the exported visible tunic, compared with the independently known unshielded outfit | 304 |

The current outfit recomposes perfectly while the unequipped variant loses every concealed tunic pixel. This is an executed synthetic consequence of the documented representation. It is not a measured defect in Pixor's renderer. Pixor also documents part sets that rerender equipment states, which may supply complete selected combinations. The experiment identifies the additional acceptance check needed before calling visible-only layers arbitrarily swappable.

For PixelDoll, hidden surfaces inferred by PixelLab remain uncertain even when the visible composite is attractive. Validate removal of an outer cover as well as addition. Include an inner garment under a shield, a hand in front of a cape and rear hair beneath headgear. Trusted full item art plus depth labels can retain concealed information. A layer containing only the current outfit's visible pixels cannot recover that information after another item is removed. [Current front/back split](../../app/src/lib/compose/split.ts) · [Native overlapping-item evidence](deep-paperdoll-native-followup-2026-11-06.md)

## A focused PixelDoll pilot

Keep PixelLab as the synthesis provider and the frozen body as the coordinate authority. On one approved item in two same-facing poses, record three independent masks with exact native indices.

1. The submitted edit permission mask records where the provider was allowed to change pixels.
2. A reviewed equipment-owner mask records confirmed item, confirmed body and uncertain pixels. Preserve the uncertain state around one-pixel details and hidden surfaces.
3. A reviewed depth assignment records where accepted equipment belongs relative to the body and a second item. Keep the original accepted RGBA as a separate immutable artifact.

Only confirmed ownership should assign a material ramp or authorize a deterministic correction. Geometric containment and a similar RGB value supply candidate evidence. They do not establish that a pixel belongs to cloth, steel, skin or an emblem. Pixor's per-pixel ramp identifier is a concrete representation to compare with PixelDoll's existing owner-local materials. Its quality depends on obtaining the label accurately, which the PixelLab contract does not provide automatically. [PixelDoll material ramps](../../app/src/lib/dress/palette.ts) · [Measured dye ambiguity](deep-paperdoll-vision-2026-11-06.md#how-far-can-automatic-dye-matching-go)

Qualify the pilot with both the original outfit and a held-out combination. Check solo recomposition, outer-cover removal, a mirrored view, exact immutable-body RGBA and preservation of every approved item pixel. Present conflicting native pixels in review, using the same compositor and masks that export will consume. The existing combined body-cut correction already has independent metadata for its hidden pixels. Extend uncertainty-aware evidence before attempting a general automatic depth classifier. [Combined cuts and native regressions](deep-paperdoll-ownership-followup-2026-11-06.md)

## Reproduction and limits

The offline probe ran with Node 24.22.1 against the public frozen benchmark and authored rectangle controls. The ignored script is `app/node_modules/.cache/modern-ownership/probe.mjs`, with its exact measurements in the adjacent `probe.json`. Their SHA256 values are `E954F9A8EBA67BC944EBCC878C5F762155D2A5BC233D147DCBD3C655A2049547` and `9868C809F5631922064F0576C36A46448B1921ADF0CB114387A9B387E47F4CC3`.

The two external applications were examined through primary published material in this spike. Their native ownership exports, MobileSAM behavior and scorer source remain unverified here. The measured corpus replay and synthetic swap control establish specific representation and threshold limits. They do not measure provider success rates or prove a new learned segmentation method for native pixel art.
