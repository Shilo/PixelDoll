# External ecosystem and transferable mechanisms (2026-11-07 cycle)

External-ecosystem pass for this cycle. The [search log](search-log.md) records queries, duplicates against earlier surveys, and new vocabulary. **No PixelLab call, paid service, account, install script or downloaded binary was used.** Evidence labels: **description read** (page, abstract or README), **source read** (pinned code inspected), **replayed** (my own script reimplements the inspected algorithm on local data), **ran** (the original program executed). Nothing in this pass reached **ran**.

## What is new since the November 6 surveys

- The commercial picture is unchanged. Three 2026 comparisons and the vendor pages of FrameSprite, Spriteflow, Sprixen, SpriteCook, MagicPixel, Pixie.haus and Mage describe whole-sheet consistency (style lock, identity anchor, palette lock) and composite output. None documents per-item equipment layers aligned to a frozen body. God Mode AI claims a layered Spine export with separated body parts, which is a skeletal-part split, not frame-based equipment. FrameSprite's page names its image and animation models and accepts 1 to 4 equipment references, but outputs a dressed composite. [Ludo comparison](https://ludo.ai/compare/best-ai-pixel-art-generators) · [Cinevva guide](https://app.cinevva.com/guides/ai-pixel-art-generators) · [FrameSprite](https://www.framesprite.com/)
- Learned image-to-layer decomposition matured in 2025-2026: Qwen-Image-Layered (December 2025), LayerD (ICCV 2025), See-through (SIGGRAPH 2026, anime body parts with occlusion completion and drawing order) and PixelART (September 2026, no code link). These are GPU models outside the allowed routes. Their mechanisms are the transferable part.
- A pixel-art-specific deterministic decomposer appeared: spritesplit (September 2026) splits a sprite into outline, flats, shading and highlights from palette structure alone.

## Acquired projects

All clones are shallow, made 2026-11-07 with Git hooks disabled and LFS smudging skipped, under `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/ecosystem/<project>/` (machine-local, outside the repository). All trees have clean status. No dependency was installed and no project code was executed. Replay scripts live in the sibling folder `_replay/`, never inside a download.

| Project | Pinned commit (commit date) | License | What was inspected | Evidence |
| --- | --- | --- | --- | --- |
| [spritesplit](https://github.com/kotebibo/spritesplit/tree/f8ef9a6e37f7bc51a7883d0f97e5912598d296d9) | `f8ef9a6e37f7bc51a7883d0f97e5912598d296d9` (2026-09-29) | MIT | All of `src/spritesplit` (1,039 lines): `ramps.py`, `outline.py`, `palette.py`, `regions.py`, `decompose.py`. Dependencies are numpy and Pillow only; no network or subprocess calls. | Source read, replayed |
| [See-through](https://github.com/shitagaki-lab/see-through/tree/df019de5129d6c4b406587a14c3501669441a783) | `df019de5129d6c4b406587a14c3501669441a783` (2026-10-06) | Apache-2.0 | `common/utils/inference_utils.py` (Marigold depth per part, left/right split, PSD ordering), `common/utils/torchcv.py` `cluster_inpaint_part`, part tag lists | Source read |
| [Fast Sprite Decomposition](https://github.com/CyberAgentAILab/sprite-decompose/tree/b5185bb0663f95e62e10b4dfb533c523458d29b9) | `b5185bb0663f95e62e10b4dfb533c523458d29b9` (2024-08-26) | MIT | `fsd/fsd/models/sprites.py`: static texture per sprite, per-frame 3 × 3 affine and opacity, differentiable compositing | Source read, replayed (discrete) |
| [LayerD](https://github.com/CyberAgentAILab/LayerD/tree/21aef937a0371614adb4d961f52d02409cb8ecc7) | `21aef937a0371614adb4d961f52d02409cb8ecc7` (2026-01-19) | Apache-2.0 | `models/helpers.py` (`find_flat_color_region`, `refine_background`, alpha unblending), `evaluation/edits.py` and `dtw` (merge-tolerant metric) | Source read |
| [APES](https://github.com/zhan-xu/APES/tree/3c582c4ce450342aabf96d48a0737e6598049766) | `3c582c4ce450342aabf96d48a0737e6598049766` (2025-08-07) | **No license file** | README and layout only: Python 3.7, PyTorch3D, weights and data on Google Drive | Description read |
| [Qwen-Image-Layered](https://github.com/QwenLM/Qwen-Image-Layered/tree/54c4fe47e76d745775e03fc66ee38457280ed9ea) | `54c4fe47e76d745775e03fc66ee38457280ed9ea` (2025-12-31) | Apache-2.0 | README and Gradio tools (`app.py`, `combine_layers.py`); resolution 640 or 1024 | Description read |
| [Top Down Sprite Maker](https://github.com/jbunke/tdsm/tree/5c93a99dd4a17c05aa1f16884d38229a91889cd5) | `5c93a99dd4a17c05aa1f16884d38229a91889cd5` (2026-09-25) | Proprietary EULA (source-available) | `MaskLayer.java` concept only; nothing reused | Source read (concept) |

Ground-truth corpus for the replays: the existing shared LPC generator checkout at `C:/Programming_Files/Shilocity/PixelLab/checkouts/lpc-generator`, verified at commit `9bf06be193b053db256b2536824af426de046aa2` (2026-10-14). Its art is CC-BY-SA, OGA-BY and GPL; only aggregate counts appear here and no LPC pixel is committed.

| Replay artifact (in `_replay/`) | SHA-256 |
| --- | --- |
| `ramps-replay.ts` | `b6667796a0eb72656ed30920366106840860bd83d5bc084340ef07c93f09ac59` |
| `ramps-replay.json` | `ced5df63aee650b603537714a7a594913a7e562a3c1c7856688e7e707dcbb1cd` |
| `rigid-bench.ts` | `21f41629169d25b34af85850bea9459a1dcda39c8a01c292a2113c9c915f326a` |
| `rigid-bench.json` | `902ba11e43adb8947f7e25cd46994ecf7090213dc163f9c1ea90db4f1a896d8a` |
| `rigid-replay.ts` / `.json` (demo fixture) | `7700a8a0…8209` / `8d2d7f43…c04f` |
| `fixture-ramps.ts` | `8953bdcd742b499734d7ed3b5e8324c9242ac3f18dccdb8ff6d5daaf115fb6e8` |

Scripts ran on Node 25.0.0 (the project pins 24.22.1; the scripts use only built-in TypeScript stripping and `node:zlib`) and import production `autoRamps`, `lab` and `decodePngBytes` plus this cycle's `runPipe` read-only.

## Replay 1: material ramps against LPC recolor ground truth

**Question.** PixelDoll's default dye materials come from `autoRamps` ([palette.ts](../../../app/src/lib/dress/palette.ts)): a weighted k-means over a color histogram in a hue-dominant OKLab feature space, k up to 4, with neutral darks (L < 0.25, chroma < 0.035) excluded as shared outlines. It ignores where colors sit. spritesplit instead links each color to its best lighter and darker neighbor by OKLab step cost, only between colors that actually touch, and keeps a link only when both sides choose each other. It removes the outline topologically first.

**Ground truth.** LPC sheet definitions name a recolor material per item, and some name up to three (`color_1`, `color_2`, with explicit `source` colors). The palette variant covering the most pixels of the item's `walk.png` (or the explicit source) defines which colors the item's own recolor system changes together. That is an artist-maintained material partition, independent of both detectors. Items whose best variant covers less than half the opaque pixels, or whose ground-truth ramp has fewer than three colors present, were skipped (61 and 20). Indexed PNGs were decoded by a small decoder in the script, since the production decoder accepts RGB/RGBA only. Result: 331 ground-truth materials on 317 items, 19 of them multi-material.

Score: the detected ramp with the best Jaccard overlap to the ground-truth color set. "Policy-neutral" drops the neutral darks that production deliberately leaves unrecolorable, so policy is not counted as error. "Hybrid" keeps production's hue groups and merges two groups when spritesplit's mutual-best adjacency chain links a color of one to a color of the other.

| Detector | Exact ramp | Mean Jaccard | Mean precision | Policy-neutral exact | Policy-neutral Jaccard |
| --- | ---: | ---: | ---: | ---: | ---: |
| Production `autoRamps` | 74 / 331 | 0.678 | 0.971 | 99 / 331 | 0.730 |
| spritesplit replay | 98 / 331 | 0.782 | 0.983 | 150 / 331 | 0.820 |
| Hybrid | 100 / 331 | 0.809 | 0.950 | 199 / 331 | 0.879 |

| Material | n | Production exact / Jaccard | spritesplit exact / Jaccard | Hybrid exact / Jaccard |
| --- | ---: | --- | --- | --- |
| Cloth (106 of 125 use the white source variant) | 125 | 6 / 0.441 | 61 / 0.804 | 18 / 0.752 |
| Hair | 121 | 50 / 0.892 | 28 / 0.794 | 64 / 0.915 |
| Body | 71 | 10 / 0.703 | 8 / 0.744 | 10 / 0.743 |
| Eye (3 colors) | 8 | 8 / 1.000 | 0 / 0.667 | 8 / 1.000 |
| Wood | 6 | 0 / 0.555 | 1 / 0.667 | 0 / 0.350 |

Findings:

1. **Production over-splits wide achromatic ramps.** LPC cloth sources are white ramps spanning most of the lightness range. In `feat`, lightness carries weight 0.3 and achromatic hue collapses, so lightness alone separates clusters once the span exceeds about 0.5 L, and `autoRamps` accepts up to four such groups (mean 3.3 groups per cloth item against 1.4 for the replay). A user who picks "dye the cloth" would recolor only one band of shades. PixelDoll's demo steel helmet spans L 0.45 to 0.81 and stays one ramp (`fixture-ramps.ts`), so this affects white, silver or full-range gray gear, not every metal item.
2. **Adjacency chaining fails where colors barely touch.** Three-color eyes and tiny hair ties get no mutual-best links (0 of 8 eyes exact). Topological outline removal also strips the darkest hair shade that LPC includes in its hair ramp (148 hair ground-truth colors were classified outline).
3. **The hybrid keeps production's strengths and fixes most over-splits** (better on 133 materials, worse on 10) but costs precision (0.971 to 0.950) and merged two materials in 1 of 19 multi-material items. That merge would recolor two materials together, which is the unsafe direction for dye.
4. This measures human-drawn LPC art. PixelLab output has more near-duplicate shades and noisier adjacency, so the ranking must be rechecked on PixelDoll's own items before any change.

## Replay 2: rigid canonical-texture residual

**Mechanism.** Fast Sprite Decomposition models an animation as a static texture per sprite rendered by a per-frame affine transform and opacity, optimized by gradient descent with bilinear warping. Bilinear warps blur pixel art, so the replay keeps only integer translations: per clip and direction, fit each frame's shift (search ±8 px, score exact color matches minus mismatches), vote a per-pixel canonical texture, refit once, and report the share of each frame's opaque pixels that disagree with the shifted canonical. Low residual means the item moved rigidly; high residual means it was redrawn, rotated, occluded or deformed.

**Benchmark result.** Run after the production extractor via this cycle's `runPipe` on the frozen benchmark (real PixelLab outputs). Among 19 headwear clips (a-helmet, b-greathelm, c-greathelm, b-jester-blue), the single clip labeled bad, a-helmet `slash/east` (`fail:H4`, "streaks across the face in frames 2-3"), has median residual **0.366** and max **0.747**. The highest median among the other 18 is 0.054 and the highest single frame 0.272 (one recolored pixel plus occlusion). Its frames 2 to 5 carry 10 to 37 same-position recolors each, where clean rigid frames carry 0 to 9. The demo fixture shows the same pattern: zoomed crops of the steel helmet's south walk frame 0 and north frames 5 and 6 show a redrawn highlight band and shifted ridge that the residual flagged (0.26, 0.24, 0.26).

**Limits.** One labeled positive is not a detection rate, and production H4 already fails that clip, so the added value is frame localization and a free consolidation candidate, not a new catch. Non-rigid items do not separate: cape clips labeled pass reach a median of 0.853 against 0.396 for the labeled cape failure. Swinging held items need rotation (the sword's east walk reaches 0.865 with no defect claim). Arms passing in front of a helmet produce legitimate missing pixels.

## Ranked transferable mechanisms

| Rank | Mechanism | Primary source | Evidence | Application to PixelDoll's allowed routes, client-only | Cost | Discriminating test |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **Adjacency-linked ramp merge for default dye materials**: keep hue k-means, then merge groups joined by a mutual-best OKLab lightness step between touching colors | spritesplit `ramps.py` | Replayed on 331 LPC ground-truth materials | Pure post-processing of stored item pixels in `autoRamps`; no generation, no new route. Adjacency must be counted on the standing design views, which PixelDoll already stores. | Low: O(pixels + k²) per item, one function | Hand-label materials on 20 to 30 retained PixelDoll items (two-material garments, white or silver gear, black hair); require higher exact-ramp rate than production with no added cross-material merge. Keep LPC multi-material items as a regression for merges. |
| 2 | **Rigid canonical residual as a per-frame diagnostic** for rigid slots (helmets, hats, rigid headwear) | Fast Sprite Decomposition `sprites.py` | Replayed on the benchmark and demo fixture | Offline check on stored posed frames before review; points the existing single-item review at the exact frames. A later option renders the canonical at the fitted shift as a free, explicitly approved repair for translation-only frames. | Low: a bounded integer shift search per frame (17 × 17 shifts over one cell); runtime not benchmarked | Insert known one-frame redraws, recolors and occlusions into clean benchmark headwear; measure frame-level recall against current H4 and G-gates. Then check retained real failures. Abstain for held and flexible slots. |
| 3 | **Depth-cluster front/back split ordered by median depth**: split one item into two planes by per-pixel depth, then order planes by median depth, with fixed slot-relative overrides | See-through `cluster_inpaint_part`, `dump_parts_psd`, `further_extr` | Source read | PixelDoll already exports foreground/background layers, but splits by body alpha. A depth proxy can come from Skeleton v3's stored per-joint `depth`/`z_index` hints rasterized along limbs, with no new model. | Medium: depth proxy rasterizer plus split rule | LPC items with separate behind and front sheets (different `zPos`) give ground-truth splits; composite, split with the candidate, compare pixel ownership and count remaining order cycles against the current alpha split. |
| 4 | **Bootstrapped ground truth from layered sprite corpora** | See-through's Live2D label engine | Replayed (Replay 1 is an instance) | Offline evaluation only. Composite LPC items on a chroma-keyed LPC body with production `toChroma`, run `extractCell`, and compare with the exact LPC item layer: paired truth for extraction, despill, outline and rim-guard behavior, at no cost. | Low to medium: adapter script; assets stay outside Git | Does the corpus reproduce failures already seen on real PixelLab output (rim guard, despill on green gear)? If not, it is too clean to qualify changes. |
| 5 | **Ownership snapping to exact-color components**: accept or reject whole same-color connected components by their overlap with the per-pixel item mask | LayerD `find_flat_color_region` | Source read | Optional step after chroma extraction. Unlike the rejected island recolor, it changes ownership, not color. | Low | Use this cycle's labeled synthetic mutations: count strays removed against legitimate one- and two-pixel details lost. Reject if any protected-body pixel becomes item. |
| 6 | **Merge-tolerant layer metric** (DTW alignment plus greedy merge of adjacent layers) | LayerD `evaluation/edits.py` | Source read | Scoring of front/back or multi-layer splits whose granularity differs from the truth (Ranks 3 and 4) | Low | Score current and candidate splits on the same LPC truth and confirm the metric ranks known-bad splits lower. |

## Rejected leads

| Lead | Reason |
| --- | --- |
| Qwen-Image-Layered, PixelART, LayerDiffuse | Not allowed PixelLab models; GPU inference; trained on designs or photos at 640 px or more; PixelART publishes no code. Qwen's README also requires a prompt describing occluded content. |
| See-through as a runtime | SDXL plus Marigold, 8 to 16 GB VRAM, anime at 1280 px. Only its ordering and split rules transfer (Rank 3). |
| Fast Sprite Decomposition as an optimizer | Bilinear affine warps and opacity blending are not pixel-exact; textures are static. Only the discrete residual transfers (Rank 2). |
| APES | No license file; 2022 stack (Python 3.7, PyTorch3D); extracts rigid body parts from several poses, not equipment from a fixed body. |
| DeepInterframes (arXiv 2610.27253) | No stated code license, unreleased data, frames generated independently, and occlusion named as a failure case. Its FLIP evaluation choice is noted in the log. |
| Top Down Sprite Maker | Proprietary EULA. Its per-choice mask layer is the same family as Spine clipping and PixelDoll's hides and cuts. |
| custom-sprite-2d, paperdoll-25d, godot-paper-doll, Selodev equipment, PipeDoll, SpriteBat, HashLips | Grayscale tint, runtime layer stacking, spring physics or trait stacking already covered by existing tint, compose and engine exports. custom-sprite-2d is GPL-3.0. PipeDoll has no published source. |
| FrameSprite, Spriteflow, Sprixen, SpriteCook, MagicPixel, Pixie.haus, Mage, SEELE guide, PromptBase prompt | Composite outputs or unverifiable prompt recipes; paid trials would test vendor quality, not a transferable mechanism. |
| God Mode AI layered Spine export | Vendor claim only; skeletal body-part split. Inspecting an export needs paid credits. |
| StdGEN, LayerAvatar, HumanLiff, LayerGS, amodal completion papers | 3D or photographic scale; no transfer to native-pixel frame layers beyond ideas already in the vision survey. |

## Top remaining gaps

1. Ranks 1 and 2 are measured on human-drawn LPC art and on 19 headwear clips with one labeled positive. Neither is qualified on PixelLab output.
2. No learned decomposer was run; Rank 3's depth proxy from Skeleton v3 joint hints is untested and the hints' effect on output is unverified by the provider audit.
3. The LPC paired-extraction adapter (Rank 4) was designed, not built.
4. Paid-only vendor flows (God Mode Spine export, FrameSprite equipment references) remain unverified.
5. Video transcripts, app marketplaces and non-English communities were not searched this cycle.
