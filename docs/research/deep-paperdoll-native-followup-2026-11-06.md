# Runtime follow-up on external sprite tools

November 6, 2026. This extends the [first external review](tool-review-2026-11-06.md), its [motion spike](tool-spikes-2026-11-06-motion.md), and its [layering spike](tool-spikes-2026-11-06-layering.md). It closes two execution gaps with actual exports. Measured results below come from the running applications and their emitted PNG and JSON files. Proposed changes are identified separately. No PixelLab generation or account credential was used.

## PixelSprite FX rendered and exported an original model

The inspected implementation was the public itch iframe at build path `html/20095899`, with `app.js?v=7.0`. A fresh, isolated Playwright Chromium context loaded that page. The original synthetic glTF contains a green rectangular body, a separate head and a red horizontal attachment animated around a joint. Its two-second clip has five rotation keys and returns to its initial rotation. All inputs were authored for this experiment. There are no textures, user assets or credentials. The fixture was attached through the application's normal file chooser. Requests other than GET, HEAD and OPTIONS were blocked. The only blocked request was an itch.io telemetry POST. This test uploaded no model to a service. [Publisher listing](https://pixelspritefx.itch.io/3d-to-pixel-art) · [Tested application](https://html-classic.itch.zone/html/20095899/index.html?v=1793178184)

The UI was set to 64 px, the isometric camera, eight directions, 4 fps, one row per direction, 1 px padding, and Sheet+JSON. The running application reported a two-second clip and eight frames per direction. The downloaded ZIP contained just the sheet and JSON. The sheet was 512 × 512, with 64 cells at fixed 64 × 64 rectangles. Names began `original-swing_S_01` through `_S_08`, then `_SE_01`, following S, SE, E, NE, N, NW, W, SW. All opaque pixels had alpha 255. The minimum margins over the whole sheet were 11 px left, 1 px top, 11 px right and 1 px bottom. The export took 603 ms on this machine, with no page errors. That timing excludes network load and model setup.

The atlas records each full frame rectangle, `rotated=false`, `trimmed=false`, source size and sheet dimensions. Its `meta` has app URL, version 1.0, RGBA8888 and scale. The downloaded JSON has no animation timing, loop declaration, equipment ownership, skeleton, feet origin or shared pivot. Its frame names preserve grouping, but a runtime still needs those other contracts. The tool exports the rendered model as a composite. This measured archive supplies no independent attachment layers.

A second run enabled flat shading, the PICO-8 palette, Bayer dithering and a 2 px black outline. Across the same 64 cells it produced six distinct visible RGB colors, all members of PICO-8, no fractional alpha and no border pixels. Each 64 × 64 cell was also enlarged to 128 × 128 through the application's own `frameCanvas` path. Comparing every channel against exact 2 × 2 replication found zero mismatches. These results qualify native palette membership, binary-alpha output and nearest-neighbor enlargement on this simple input. They do not measure temporal dither stability on textured surfaces.

### A one-frame extension can disappear without touching a border

The stress fixture retains the same static body and attachment geometry, but animates the attachment joint in translation. Its five keys are at 0, 4/128, 5/128, 6/128 and 2 seconds. The joint is at x=0.5 except at the middle key, where it moves to x=3. The application was set to 256 output frames and eight directions. Thus frame 5 is the brief extremum and frames 4 and 6 are ordinary poses.

The production fit samples 25 frames per direction at indices 0, 10, 20, 30, 40, 51, 61, 71, 81, 92, 102, 112, 122, 133, 143, 153, 163, 174, 184, 194, 204, 215, 225, 235 and 245. Its resulting frame excludes the brief extension. Red pixels were counted by red exceeding both green and blue by a factor of 1.5 under flat shading. This is an independently known color in the synthetic fixture. [Delivered fit and render implementation](https://html-classic.itch.zone/html/20095899/app.js?v=7.0)

| Direction index | Red px in frame 4 | Red px in frame 5 after automatic fit | Red px in frame 6 | Red px in frame 5 after manual 0.2× zoom |
| --- | ---: | ---: | ---: | ---: |
| 0 | 128 | 0 | 128 | 7 |
| 1 | 92 | 0 | 92 | 5 |
| 3 | 88 | 0 | 88 | 5 |
| 4 | 128 | 0 | 128 | 7 |
| 5 | 100 | 0 | 100 | 5 |
| 7 | 100 | 0 | 100 | 5 |

Every listed automatic-fit and widened frame had zero occupied border pixels. In index 2, the red part was occluded even in the ordinary pose and remains a negative control. Index 6 looked down the part's length and did not show the same complete loss. Manual zoom changes pixel scale, so its counts do not estimate a fraction of recovered area. They demonstrate that the part exists in the requested pose and becomes visible inside a wider view. The failure is already present in the application's native render frame before atlas packing.

This disproves an unconditional inference from zero border contact to complete artwork. An extreme can leave the frame entirely between auto-fit samples. A downstream extractor sees no surviving edge to identify the crop.

### PixelDoll comparison

The PixelDoll comparison started at revision `de3445e9`. Its `paintedFrame` scans every image referenced by every equipped visible layer, including later clips and cells. It scans every pixel in those images. `bakedFrame` unions declared layer canvases around their shared pivot, independent of alpha or animation sampling. The static wardrobe thumbnail deliberately chooses one landed cell, while animated item previews use `cropAll` across the clip. The existing tests for late oversize weapon extremes and all-clips bounds passed, 11 tests in `experience-bounds.test.ts`, using Node 24.22.1 and npm 11.19.1. No sampled auto-fit failure was found in these paths. [Preview bounds](../../app/src/studio/experience/bounds.ts) · [Composite frame union](../../app/src/lib/compose/compose.ts) · [Static and animated item cropping](../../app/src/studio/model.ts) · [Bounds controls](../../app/test/unit/experience-bounds.test.ts)

PixelDoll's G7 checks occupied item pixels on cell edges. That reports surviving border contact. It cannot establish that PixelLab drew all intended pixels. Presence, expected silhouette and temporal design checks are separate evidence. In particular, a fully absent extension may leave a plausible short item that passes area checks. A synthetic provider-output defect set should include both partial border truncation and total loss of an off-canvas part. Add a known one-frame extremum to motion-reference qualification. A source 3D renderer with known geometry should check every exported sample or prove a conservative envelope before offering the frames as references. [Equipment framing and area gates](../../app/src/lib/items/items.ts)

## Fantasy Character Generator private native exports

The official listing offers a free demo. Its normal public file endpoint supplied the 129,184,145-byte demo installer. The installer is an unsigned NSIS package, consistent with the publisher's statement about code signing. The demo license permits installation and private export testing. It prohibits publishing demo sprites, separately redistributing its files and unpacking or modifying the application. An initial archive inspection reached that license, then the extracted copy was removed. Subsequent tests used the unchanged installer and normally installed application. No restricted source was used or incorporated. No demo PNG, screenshot, installer or program file is committed. [Publisher and demo terms](https://toshaangel.itch.io/fantasy-character-generator)

The installer completed with exit code 0 into ignored workspace scratch. Playwright's Electron driver opened the installed application with a separate profile. The window was hidden, and normal save dialogs were directed to private ignored output. The interface was operated through its own category buttons, animation checkboxes and export actions. No internal rendering function was called and the installed program files were unchanged.

The selected outfit was human male with leather boots, wool trousers, wool tunic, leather belt, arming sword, cloak and short hair. All other slots were empty. Two moves were selected, Walk and OneHandWalk. Settings were 15 frames, eight directions, 128 px, no outline, no shadow and the rendered lighting. The application exported two character PNGs and then the body plus seven item layers as 16 more PNGs, taking 8.2 seconds including a fixed 3.5-second wait between export actions. There were no page errors. This is not a throughput benchmark.

The two composite sheets were each 1920 × 1024. The JSON explicitly records 128 px cells, direction rows E, SE, S, SW, W, NW, N, NE, 10 fps, feet origin (64, 85), and both selected looped moves. A separate `character.json` records body, selected slots and per-item tint choices. The sword is present in both moves. Its isolated sheet contains 3,184 occupied pixels in unarmed Walk and 4,877 in OneHandWalk over 120 cells each. This verifies a stored/held equipment state change, with the same fixed sheet coordinates. The demo did not include the full travel-pack and quiver library, so simultaneous cloak/pack/quiver behavior remains untested.

### The isolated item export loses the composite's depth contract

For each of 120 cells in both moves, the analysis compared the final RGBA at every coordinate with the eight independently exported item pixels at that coordinate. All exported item alpha was binary. Every occupied composite pixel matched at least one same-coordinate exported item pixel exactly. Therefore the comparison did not need palette approximation, rescaling or image registration.

When exactly one visible layer matched the composite color, it must draw above each other occupied layer at that coordinate. Recording these pairwise constraints yields a directed graph. A cycle proves that a single whole-layer ordering cannot reproduce that cell. Ambiguous matching colors contributed no constraint. Walk had cycles in 78 of 120 cells. OneHandWalk had cycles in 91 of 120. Both move-wide graphs were cyclic. The conflicts involved cloak against tunic, trousers, boots, belt and sword, and sword against body, trousers, tunic, belt, boots and, in OneHandWalk, hair.

The first east Walk cell provides a two-pixel proof. Values are RGBA in the native 128 px cell.

| Coordinate | Composite | Cloak | Trousers | Necessary ordering |
| --- | --- | --- | --- | --- |
| (62, 61) | (98, 86, 63, 255) | (98, 86, 63, 255) | (85, 63, 40, 255) | Cloak above trousers |
| (62, 68) | (84, 62, 40, 255) | (83, 73, 53, 255) | (84, 62, 40, 255) | Trousers above cloak |

The files from the item export contain one PNG per selected item and move, plus a JSON file whose only top-level properties are `generator`, `format` and `animations`. There are no front sheets, visibility masks, depth masks, layer-order records or item definitions in that output. The notes describe front/sheathed-front/mask fields and a `layer_order`, but the corresponding fields and images are absent. The character metadata gives chosen items and tint values, and cannot supply the missing per-pixel ordering. The problem survives per-frame ordering because the two constraints above occur within one cell. This measurement concerns the tested demo export. It does not establish whether a different full-version export supplies additional masks.

### A concrete depth experiment for PixelDoll

PixelDoll's manifest can already represent foreground/background layers, item-dependent body cuts and cell-specific z overrides. Its current default `splitFgBg` uses frozen body alpha as the division. This preserves solo recomposition but cannot identify which cloak pixel belongs in front of a sleeve, a second item or a hand. A different whole-item z order cannot solve a two-pixel cycle. Motion Lab already provides manually authored body occluders for held attachments, with native per-frame art for poses that integer rigid placement cannot represent. [Default split](../../app/src/lib/compose/split.ts) · [Composition and cuts](../../app/src/lib/compose/compose.ts) · [Authored attachment editing](../../app/src/ui/motion-lab/AttachmentEditor.svelte)

The first production-relevant experiment should keep one approved same-facing item layer and its source composite, then annotate only the conflicting visible regions as foreground, background or uncertain. Use trusted geometry, actual same-source render passes or explicit artist confirmation for those labels. Preserve the exact pixel partition so the two layers union to the approved artwork. Show the two native pixels around each conflict and use the existing single-item review. Validate the split against the frozen body and multiple independently selected outfits in preview and each runtime export. A current outfit's visible color does not reveal the hidden counterfactual pixels needed for every equipment combination, so compare held-out combinations before considering the inferred split reusable.

For an AI route, separate the permission to edit a pixel from the item's visibility and material ownership. A repair stencil controls provider changes. The accepted layer's front/back masks control composition. An artist-approved material mask controls which color family can change. None of those three facts follows solely from another. The native application's explicit color-zone interface and stowed state are useful authoring precedents, while its measured flattened-item export shows why those facts must travel with the sprites.

## Civitai workflow access remains explicit

The public model API returned HTTP 200 and four versions. The latest is v0.4, model-version 2363451, with an approximately 8.26 MiB archive. Its public notes describe OpenPose and Depth support. The public description says results depend greatly on the seed and work best with the model used for the reference. Four gallery entries advertise metadata, but this model endpoint supplies no embedded node graph or prompt metadata. [Public model API](https://civitai.com/api/v1/models/2047895) · [Workflow listing](https://civitai.com/models/2047895/sonsistency-characters-or-generate-characters-only-by-image-and-prompt-without-characters-lora-or-ilnoobai-edit)

The archive's official download URL returned a 10,148-byte HTML response during this follow-up, rather than the advertised ZIP. The earlier retained API response explicitly required login. No authenticated Civitai session was available to this test context. The advertised archive SHA256 is `B618E4CA4256450D3CA99B7810F067F3392CAD91BFEC729EF8D2D44090A906D2`. The node graph, exact models, dependencies and actual workflow runtime remain unverified. The response status alone cannot establish a successful workflow download.

## Artifact identity and limits

All runtime inputs, raw outputs, probes and the unchanged demo installation remain in ignored local scratch. The two original glTF fixtures and PixelSprite sheet are independent of the user's supplied reference media. Hashes use SHA256. ZIP bytes can vary when creation timestamps vary, so the decoded sheet and glTF hashes identify the substantive artifacts.

| Artifact | SHA256 |
| --- | --- |
| Original two-second swing glTF | `608ECFD3C23505569096DDC71F1432D05C71869646D485989BCE84213DABC096` |
| Original one-frame pulse glTF | `8BB11A8F3946EA21714E26606ED2006013A8C89B71336305E998A799FED1926C` |
| Exported 512 × 512 PixelSprite sheet | `8A8AA9917E65557D2F768219033CBFE2AE08A14E1F48287EE2611FBEE9380FEA` |
| PixelSprite atlas ZIP from the measured run | `AB58F87CC52B3CD93EF63A627E465541E763DE6BDD0D3526D1317E0849FBFF6D` |
| Official Fantasy demo installer | `CEAB013158322461C1C826E3ED249B336F054C8E3F662FEC89CA307CA3DD7AD1` |
| Private native Walk composite | `B047A870E587DBF278A728750752DA4FD54DB750A51CB7CDF2F1DD3A99A8A2FD` |
| Private native OneHandWalk composite | `5E621D2D9F88C7C456D3303DC532F61D591DAB1FE74B8789F6A95873BAB1ADF7` |

The native test covers one body and one controlled outfit in two motions. Color-zone independence, four-body parity, reduced-frame timing, NPC batches, Unity native import and the full commercial equipment library remain separate tests. The PixelSprite test covers simple untextured geometry and a deliberately adversarial single-frame extremum. It establishes an actual sampled-fit failure without estimating how often ordinary models encounter it. All browser contexts and the native test app were closed when their checks ended. The coordinator's localhost tab was untouched.
