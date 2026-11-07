# ComfyUI mechanisms for reliable PixelDoll equipment

Research spike, November 7, 2026. PixelDoll source inspected at `6a33fd37`. This is a source and contract comparison, not a claim that a ComfyUI workflow was installed or that its generated outputs passed PixelDoll's gates.

## Findings

ComfyUI is relevant, but it is not a new replacement for PixelDoll's renderer or PixelLab. Its useful lessons are explicit reference roles, stage-local recovery, dependency-complete caching, frame/mask identity, and protected compositing onto original frames. PixelDoll already implements much of that structure. The next useful work is targeted qualification, not adding a node editor or a GPU backend.

The external MiniMax H3 reference-to-video route is materially different from PixelLab's `animate-pixminimax`. A video conditioned on a pose reference is still a redrawn video, not an equipment layer registered to PixelDoll's frozen frames. A physically plausible dressed final frame establishes neither exact body preservation nor transferable animation.

No paid requests, model downloads, dependency installs, ComfyUI execution, custom-node execution, or production changes were performed for this spike. Selected source files and workflow JSON were downloaded into an ignored research workspace after checking its ignore status. The downloaded code was read, not imported or run. Application test commands below are proposed checks, not checks claimed to have run.

## Prior work and new scope

ComfyUI was already researched in the [October repository comparison](paperdoll-repos-review-2026-10-27.md) and [November generation spike](tool-spikes-2026-11-06-generation.md). Both inspected `mor-o/comfyui-2d-character-pipeline`; November also measured its tracked sprite samples and replayed mask and loop-seam ideas against retained PixelDoll frames.

The upstream pipeline remains at `9fee239216b8fb5a841401644a4ef629496e563c`, the same revision previously inspected. Re-reading it did not discover a newer implementation. Its original-frame second pass, separately extracted cosmetics, static rough masks, soft alpha, and loop limitations are established prior findings, not new wins from this review. Its full GPU inference pipeline remains unexecuted here.

New coverage in this spike is the current official MiniMax H3 implementation and templates, ComfyUI's data/execution semantics, VNCCS's costume and staged-regeneration implementation, and relevant conditioning/video-node mechanisms. The supplied examples were treated as technical leads. Private conversation, identities, media, and attachment references are not retained.

## Source acquisition and evidence level

| Source | Pinned revision | Material actually inspected |
| --- | --- | --- |
| [ComfyUI core](https://github.com/Comfy-Org/ComfyUI/tree/1332fabfcc507aa7c548cd5152071ed494c207e8) | `1332fabfcc507aa7c548cd5152071ed494c207e8` | Selected classes/functions in `nodes.py`, `nodes_mask.py`, API/local MiniMax H3 nodes, execution and cache code. Downloaded source; no execution. |
| [Official documentation](https://github.com/Comfy-Org/docs/tree/13d59353e9d5d1c4aa1757ba70425bb71ceb407a) | `13d59353e9d5d1c4aa1757ba70425bb71ceb407a` | Images/masks, list processing, node properties, and the H3 reference-node documentation. Documentation checked against source where consequential. |
| [Official workflow templates](https://github.com/Comfy-Org/workflow_templates/tree/21d7cc4fb9afd983957f2d2d6b1d583860ccb40b) | `21d7cc4fb9afd983957f2d2d6b1d583860ccb40b` | API H3 reference-to-video and local H3 reference-to-video JSON. Parsed node identities; no model execution. |
| [2D character pipeline](https://github.com/mor-o/comfyui-2d-character-pipeline/tree/9fee239216b8fb5a841401644a4ef629496e563c) | `9fee239216b8fb5a841401644a4ef629496e563c` | README, W4 guide, W4 driver and clean-pass graph; reconciled with the prior sample measurements. |
| [VNCCS](https://github.com/AHEKOT/ComfyUI_VNCCS/tree/156b014d7cb60a0d7f78940b1396556d42a0f109) | `156b014d7cb60a0d7f78940b1396556d42a0f109` | README, selected clothes-preview/cache and generator-recovery sections, screen-matte implementation and test cases, utilities and MIT license. Source analysis only. |
| [Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet/tree/27a67fee80cf46c198b10588a5651f23d67d1e95) | `27a67fee80cf46c198b10588a5651f23d67d1e95` | README's control scheduling, masks and per-latent weighting contracts. No inference. |
| [VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/tree/4d907bee61e92c2e65af3bd6383a4e4d356126d1) | `4d907bee61e92c2e65af3bd6383a4e4d356126d1` | README and selected video loader/frame-selection implementation. No video encoding or native runtime test. |
| [IPAdapter Plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus/tree/a0f451a5113cf9becb0847b92884cb10cbdec0ef) | `a0f451a5113cf9becb0847b92884cb10cbdec0ef` | Node documentation and README: reference-image preparation and spatial/temporal influence. No inference. |
| [WanVideoWrapper](https://github.com/kijai/ComfyUI-WanVideoWrapper/tree/088128b224242e110d3906c6750e9a3a348a659b) | `088128b224242e110d3906c6750e9a3a348a659b` | Repository README as context for VACE and video conditioning. It is not a tested PixelDoll route. |

Ignored local acquisition: `spikes/api/out/comfyui-review-2026-11-07/`. `pins.json`, `extra-pins.json`, and `source-hashes.json` record revisions and downloaded-file hashes. The workspace contains selected files, not complete runnable clones. Initial guesses for three source paths and one template path returned 404; valid paths were subsequently located through the pinned repository trees. No unavailable file is counted as inspected. Local acquisition files are not required to read this report because source links are pinned above.

VNCCS's inspected repository license is MIT. That does not establish the licenses of its model weights, upstream dependencies, or generated assets. ComfyUI and other components retain their own licenses. This report recommends transferable mechanisms; it does not authorize copying code or adopting another model stack.

## What the MiniMax H3 graph does and does not establish

The [official API node source](https://github.com/Comfy-Org/ComfyUI/blob/1332fabfcc507aa7c548cd5152071ed494c207e8/comfy_api_nodes/nodes_minimax.py) exposes ordered image, video and audio references. The `MinimaxHailuo03ReferenceNode` display name is MiniMax H3 Reference to Video. Its growable slots and prompt reference tokens let the caller distinguish a subject image, outfit image, and motion video rather than collapsing them into one informal picture description. The [node documentation](https://docs.comfy.org/built-in-nodes/MinimaxHailuo03ReferenceNode) describes minimum image dimensions and video-duration/FPS requirements. Exact constraints differ by selected model; inspect its branch rather than copying one global rule.

The [local H3 implementation](https://github.com/Comfy-Org/ComfyUI/blob/1332fabfcc507aa7c548cd5152071ed494c207e8/comfy_extras/nodes_minimax_h3.py) is a separate model execution path. The API template inspected here contains `LoadImage`, `MinimaxHailuo03ReferenceNode`, and `SaveVideo`; the existence of this template does not mean it includes a pose-reference video or an exact-preservation stage by default.

| Capability | Official external H3 graph | PixelLab routes inspected in the local OpenAPI |
| --- | --- | --- |
| Multiple role-specific references | Ordered image/video references are explicit inputs. | `transfer-outfit-v2` has an outfit reference and target frame list. A collage supplied to another route is still one image. |
| Motion control | A video can be supplied as a reference. This conditions generation; it does not return pixel ownership. | Raw `animate-pixminimax` has first/last frames and a text description, not a pose-video field. `animate-with-skeleton-v3` accepts a first pose and a sequence of keypoint poses. |
| Output | Generated video, requiring decode and frame/time selection. | Image frames stored by the relevant jobs. The app must preserve requested cell identities. |
| Frozen-body guarantee | Not established by the reference-node contract. | Skeleton control is also not a guarantee of unchanged body pixels. Extraction and QA remain necessary. |
| Price comparison | Comfy's node/provider/model billing applies. | PixelLab billing and plan limits apply. A node badge cannot establish PixelLab generations or cash cost. |

The PixelLab field comparison was parsed from [the vendored schema](pixellab/pixellab-openapi-v2.json). It is a local contract check, not a new paid experiment or independent verification that upstream PixelLab has not changed. Before a live experiment, repeat the current official API/MCP reconciliation described in the [provider review](deep-paperdoll-provider-2026-11-06.md).

Selecting the last frame of a garment-settling sequence is a possible dressing hypothesis. It must be tested against every returned frame and the original body, not treated as inherently best. Body drift, camera motion, changed neckline, different garment pixel scale and changed hands can accumulate near the end. Simulated cloth language can also conflict with an instruction to keep pose and pixels frozen. Physically plausible folds and registered swappable equipment are different acceptance questions.

## ComfyUI mechanisms worth learning from

### 1. Explicit mask meaning and cardinality

The [images and masks contract](https://docs.comfy.org/custom-nodes/backend/images_and_masks) separates image tensors from masks. Core `LoadImage` derives its mask by inverting normalized alpha; without alpha it produces a default mask rather than an image-sized semantic selection. Consequently, an alpha mask, editable-region mask, attention-influence mask and item-ownership mask cannot be interchanged by name alone.

The [list-processing contract](https://docs.comfy.org/custom-nodes/backend/lists) can repeat the last value of a shorter input list. The [masked-composite implementation](https://github.com/Comfy-Org/ComfyUI/blob/1332fabfcc507aa7c548cd5152071ed494c207e8/comfy_extras/nodes_mask.py) can repeat batches and interpolate masks. Those are useful generic conveniences but dangerous defaults for exact sprite frame/mask pairing. A mask accidentally reused for another gait phase can produce a plausible-looking but invalid equipment layer.

**PixelDoll comparison:** [gridReq and inpaintStencils](../../app/src/lib/items/run.ts) already build explicit target cells, protect the same-direction reference, load the exact submitted stencil, verify its stored hash and dimensions, and exclude reference/tail cells from equipment permissions. These are strengths to retain. Research bridges or future import formats should require explicit frame IDs, dimensions, mask polarity and role rather than importing ComfyUI's broadcasting behavior.

The pose branch deserves a separate geometry check: it supplies the generated dressed standing bitmap with the rig's stored rest joints. If dressing changes that bitmap's visible anatomy or registration, correct target joints cannot alone establish that the source image fits its assigned source joints. This is a hypothesis to measure on retained visible mannequin witnesses, not proof that automatic skeleton estimation or rerigging would improve it. The [existing conditioning experiments](deep-paperdoll-conditioning-2026-11-06.md) already test rebuilding a conditioning image from frozen body, approved gear and cuts; keep approved artwork separate and do not present that method as newly discovered.

The [completed matched live trials](deep-paperdoll-live-trials-2026-11-06.md) also compared raw, canonical and shared-ramp conditioning, with mixed results that did not qualify a new default. A source-geometry measurement or a new body-family/motif comparison must extend that evidence, not describe canonical conditioning as an untested idea.

### 2. Protected original-frame editing

The [mor-o clean-pass graph](https://github.com/mor-o/comfyui-2d-character-pipeline/blob/9fee239216b8fb5a841401644a4ef629496e563c/workflows/w4-cosmetic-inpaint/pass2_clean_api.json) returns to original base frames for the optional cleanup pass and explicitly composites the generated result through a mask. This is stronger than relying on an inpainting prompt to preserve the rest. It is not proof that its video transport, resizing and final soft-alpha extraction remain byte-exact.

**PixelDoll comparison:** frozen originals, protected repair references and submitted-mask enforcement already exist. The open research question is whether a qualified local defect mask plus trustworthy temporal support improves the result compared with the current broad garment mask. The [previous experiment](tool-spikes-2026-11-06-generation.md) already proves that growing a failed mask cannot recover an entirely missing item. Do not replace broad recovery masks globally or introduce an automatic second paid pass.

### 3. Complete dependency identities and stage-local recovery

VNCCS's [clothes-preview code](https://github.com/AHEKOT/ComfyUI_VNCCS/blob/156b014d7cb60a0d7f78940b1396556d42a0f109/nodes/clothes_designer.py) resolves the selected source sprite before computing its cache identity. The payload includes source pixels and shape, reference digest, model identity, sampler, seed, prompt and resolution. Missing model identity disables that cache reuse. Its [generator code](https://github.com/AHEKOT/ComfyUI_VNCCS/blob/156b014d7cb60a0d7f78940b1396556d42a0f109/nodes/character_generator.py) stores stage inputs/intermediates and exposes targeted regeneration controls. These are source observations, not validation of all recovery paths.

**PixelDoll comparison:** [requestIdentity](../../app/src/lib/pixellab/queue.ts) already hashes canonical method, endpoint, parameters and input blobs; unknown paid submissions are not resent. [Item extraction/publication](../../app/src/lib/items/run.ts) already separates raw results, extraction inputs, saved frames and accepted artwork. A Comfy-style graph cache should not replace this ledger. Any useful improvement must demonstrate a missing dependency or redundant work in the real callers, not merely add another generic cache.

### 4. Preview-first costume authoring without assuming modular layers

VNCCS's [clothes workflow](https://github.com/AHEKOT/ComfyUI_VNCCS/blob/156b014d7cb60a0d7f78940b1396556d42a0f109/README.md) previews an outfit before generating a pose set and supports reference clothing. This can reduce waste. Its generator stage produces complete transparent character/costume sprites; that alone does not demonstrate arbitrary combinations of separately owned tunic, hair, gloves and weapon layers.

**PixelDoll comparison:** approved standing designs before selected moves already provide the relevant product structure. Measure whether the preview reveals failures users otherwise discover only after paid posing. Keep existing concise controls rather than importing the suite's full model/settings interface.

### 5. Appearance, spatial influence and motion are separate controls

[Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet/tree/27a67fee80cf46c198b10588a5651f23d67d1e95) documents per-latent and timestep control weighting. [IPAdapter's node reference](https://github.com/cubiq/ComfyUI_IPAdapter_plus/blob/a0f451a5113cf9becb0847b92884cb10cbdec0ef/NODES.md) separates visual references from attention masks and describes preparation/cropping behavior. A timestep in these controls is a diffusion sampling step, not automatically an animation frame. An influence mask is not guaranteed protected-pixel compositing.

**Transferable hypothesis:** explicitly track which source supplies identity, garment appearance, palette, editable area and motion. Compare approved same-view references and PixelLab's supported routes under matched inputs. PixelLab does not expose these custom nodes' internal weights, so their numeric settings cannot be copied into its API. New local models, WAN/VACE, IPAdapter or ControlNet production dependencies remain outside the allowed pipeline.

### 6. Exact timing and intermediate transport

[VideoHelperSuite's loader](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/blob/4d907bee61e92c2e65af3bd6383a4e4d356126d1/videohelpersuite/load_video_nodes.py) has separate rate conversion, skipping, frame caps and sampling controls, and returns loaded timing metadata. A visually correct GIF or MP4 does not establish the selected logical frames, repeated-frame timing, original palette, alpha or shared pivot.

**PixelDoll comparison:** stored image cells and authored playback are already separate. Any future research video import should preserve timestamps and selected source indices, explicitly qualify decode and resampling, and keep lossless frame masters. Never independently trim or reorder each equipment layer to make its own loop look better.

### 7. Topology-aware matting is worth testing, not transplanting

VNCCS's [screen-matte implementation](https://github.com/AHEKOT/ComfyUI_VNCCS/blob/156b014d7cb60a0d7f78940b1396556d42a0f109/nodes/chroma_screen_matte.py) uses color-line samples, uncertainty, connected reconstruction and special handling for thin details. Its [tests](https://github.com/AHEKOT/ComfyUI_VNCCS/blob/156b014d7cb60a0d7f78940b1396556d42a0f109/tests/test_chroma_screen_matte.py) include enclosed holes, colored foreground near the screen hue, outlines and long one-pixel strands. These files were read, not executed here.

**PixelDoll comparison:** whole-character background removal is not gear-versus-body ownership. A connected green/cyan region may be valid equipment or skin; keeping its silhouette does not classify it. Use these cases to challenge [chroma extraction](../../app/src/lib/image/chroma.ts) with independent labels. Avoid copying soft matte smoothing, global component removal or illustrated-image scale thresholds into binary pixel-art equipment.

## Prioritized qualification plan

| Priority | Experiment and decision | Acceptance and rejection evidence |
| --- | --- | --- |
| 1, offline | Audit identity/cardinality at research input boundaries and saved-frame recovery. Reuse production request identities and existing stencil tests. | A one-pixel source/reference/mask change invalidates the appropriate identity; repeated/reordered/missing frame IDs cannot silently pair with another mask; approved source art remains immutable. Do not claim a production bug unless a real caller fails. |
| 2, offline | Measure the posed source bitmap against its assigned stored rest joints, using visible body witnesses and the existing canonical-conditioning controls. | Separate source geometry drift from provider pose error. Include nearly covered bodies where witness-based registration must abstain. A new skeleton estimate is not automatically a better source of truth, and no pose-route default changes without representative evidence. |
| 2, offline | Add source-inspired adversarial chroma cases to the owned-pixel corpus before changing thresholds. | Known thin straps, holes, outlines and same-hue different-owner pixels survive correctly. Measure false gear and lost gear separately. Reject a cleaner silhouette that erases material or skin ownership evidence. |
| 3, offline then paid if justified | Compare broad garment repair with a local defect stencil backed by trustworthy pose/neighbor evidence. | Preserve exact protected pixels and frame registration, recover the full expected garment, and retain a broad-mask missing-item control. A lower editable area alone is not a quality win. |
| 4, paid only after controls | Test a supported PixelLab reference-layout or garment-settling prompt against the existing standing dresser, then test the result on the same frozen poses. | Multiple views, bodies and seeds; report all frames and final-frame selection; score body identity, motif, palette, silhouette, occlusion, alignment, cash and time per accepted layer. No PixelLab/H3 parameter equivalence assumed. |
| 5, product observation | Assess whether existing standing review and selective-move/recovery controls communicate design versus fitting defects. | Measure avoidable paid work and correction effort, including failures. Agent-operated timing is a proxy, not a user study. Add UI only for demonstrated confusion. |

Useful existing offline entry points, from `app/`, are `npm test -- item-stencil`, `npm test -- grid-repair`, `npm test -- queue-resume`, and `npm test -- anchored-item-moves`. They are regression starting points, not substitutes for designing the new adversarial cases. If application code changes, run the current [agent-required checks](../../AGENTS.md) and affected browser coverage. No such checks were run for this document-only source review.

## Decision and limits

There is no evidence here that adding ComfyUI as a production dependency would improve PixelDoll's permitted client-side pipeline. There is useful new inspiration for targeted tests, especially explicit data contracts and thin-detail matting cases. Existing queue identity, frozen-frame repair, standing-first review and saved-frame recovery already embody several of the strongest ComfyUI workflow lessons.

Native inference quality, model memory requirements on this machine, total end-to-end cost, and exact low-resolution layer quality remain untested. The same applies to any claim that last-frame dressing, video pose references, or a complete costume suite solves modular paper dolling. Those require paired tests on owned equipment layers and arbitrary combinations, not only an attractive dressed animation.
