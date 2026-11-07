# Provider contract and generation research

November 7, 2026. Provider-and-generation spike for this cycle. It diffs the current PixelLab REST v2 schema against the vendored October 20 snapshot, maps PixelDoll's request builders to that contract, records live MCP differences, and proposes provider-facing experiments. **No paid PixelLab request was made.** Free discovery only: the public OpenAPI, the public MCP guide, and the MCP `search_help` and `get_pro_flash_capabilities` lookups. No token or `.env` was read.

Claim labels: **[contract]** documented in the provider schema or tool description; **[source]** observed in PixelDoll code or committed evidence; **[inference]** reasoning from those; **[untested]** a hypothesis needing a paid or offline experiment.

## Provenance

| Item | Identity |
| --- | --- |
| Current schema | `https://api.pixellab.ai/v2/openapi.json`, fetched 2026-11-07 11:14 UTC, 502,650 bytes, SHA-256 `3f30f84487cd1ed8e6b548ac152b11a2aff535a6a6467b91e464dc74328a382b`. Saved outside the repo at `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/provider/openapi-2026-11-07.json` (machine-local, not a portable link). |
| Baseline | [`pixellab-openapi-v2.json`](../pixellab/pixellab-openapi-v2.json), SHA-256 `a459992f91f2fdf8e653f730e0a5436157de6a50b66d561fd35dd897d1c04eb6` (byte hash of the vendored file; the [November 2 capture](../pixellab/2026-11-02-managed-custom-v3-contract.json) records a different `priorSchemaSha256`, so that capture hashed a different serialization or revision). |
| MCP guide | `https://api.pixellab.ai/mcp/docs`, 199,718 bytes, SHA-256 `b990bcdb6bf9b56f89e10c0ca37d2f4dc27352c5f39956996524127436c38fd7`, same local folder. |
| Structured diff | [`provider-schema-drift.json`](provider-schema-drift.json): every changed pointer for relevant paths and schemas (provider text quoted verbatim), plus the 51 of 53 transitively referenced relevant schemas that are byte-identical. Irrelevant changes are listed by pointer only. |

## 1. Schema drift since October 20

Path and schema inventories are identical (102 paths, 275 schemas, none added or removed) **[contract]**. Fifteen schemas and seven path descriptions changed; only four touch PixelDoll's routes.

| Endpoint | Drift | Consequence |
| --- | --- | --- |
| `edit-animation-v2`, `transfer-outfit-v2`, `inpaint-v3` | **None.** Request, frame, size, palette, mask and response schemas are byte-identical. Still no strength, guidance, negative prompt, init-strength or mask field on edit/transfer; inpaint `context_image` and `bounding_box` remain deprecated, `crop_to_mask` defaults true **[contract]**. | Nothing to update. The levers remain prompt, seed, input pixels, `target_palette` and grid packing. |
| `animate-with-skeleton-v3` (raw) | Request schema unchanged: no palette, color image or mask field; `seed` 0 means random; optional per-joint `depth` (0-255) and `z_index`. Description now says `POST` (was `GET`) for estimate-skeleton and that its coordinates drop straight into `keypoints`. Cost text unchanged: 3 frames = 2, 8 = 3, 15 = 4 generations **[contract]**. | A doc fix, not a behavior change. `first_frame_keypoints` text still warns that a skeleton not matching the image "quietly costs" transparency and color accuracy, which motivates E1. |
| `estimate-skeleton` | Was "supported sizes 16/32/64/128/256". Now any size up to 256; padded internally, coordinates returned as fractions of the submitted image; 0.1 generations; fully transparent image refused with 422 before charging **[contract]**. | Matches what the [November 6 provider audit](../deep-paperdoll-provider-2026-11-06.md) already relied on. Non-power-of-two padded item canvases (for example 96 px) are now explicitly legal inputs. |
| `characters/animations` (managed) | `frame_count` minimum 4 to **3**; skeleton-v3 custom text motion 3-15 frames now in the field description; `directions` items now an enum; **`target_palette` now lists `skeleton-v3`** among the modes it applies to (October: pro, v3, pixminimax only) **[contract]**. | Palette locking is now documented for managed skeleton-v3 output. PixelDoll uses managed walk output only as a motion source and re-renders the body raw, so this mainly matters for starter-pack clips stored as body art **[inference]**. |
| `create-character-v3` | `template_id` description adds `custom` (skips the skeleton; such characters cannot use skeleton animation). Type remains free string **[contract]**. | PixelDoll always sends `mannequin`, and rig setup rejects any other template ([setup.ts:31](../../../app/src/lib/rig/setup.ts)) **[source]**. An imported `custom` character fails with a clear message, which satisfies the no-brick rule. |
| `create-character-pro-flash` | Unchanged; already accepts `target_palette`, `style_image`, `template_id` incl. `custom` **[contract]**. | Not used by production. |
| `balance`, `background-jobs/{id}` | Unchanged **[contract]**. | None. |

Other changed items (Pro image seed wording, Pro character, tiles, fonts, VFX, normal map, 4/8-direction legacy creators) are outside the allowed model list.

## 2. Request builders against the contract

| Builder | What is sent | Documented but not sent, or hardcoded |
| --- | --- | --- |
| Types: [routes.ts:8](../../../app/src/lib/pixellab/routes.ts) `TargetPalette` | `colors`, `max_colors` | `name`, `smart` (smart is single-image beta, so inapplicable) **[source]** |
| [routes.ts:64](../../../app/src/lib/pixellab/routes.ts) `InpaintV3`; caller [run.ts:177-180](../../../app/src/lib/items/run.ts) | description, image, mask, `no_background: true`, seed | `crop_to_mask` relies on the default true, which is the desired behavior **[source]**. Deprecated context fields correctly unused. |
| [items.ts:36-41](../../../app/src/lib/items/items.ts) anchored edit; caller [run.ts:217](../../../app/src/lib/items/run.ts) | frames, `image_size` (max side + padding, [items.ts:210](../../../app/src/lib/items/items.ts)), seed 1..2,000,000 ([run.ts:45](../../../app/src/lib/items/run.ts), [run.ts:596](../../../app/src/lib/items/run.ts)), `no_background: true` | **`target_palette` is never sent in production**; only the dev [item-trial harness](../../../app/src/ui/item-trial/trial.ts) (line 181) can add it, and only for edit/transfer arms (line 152) **[source]**. |
| [clips.ts:32-36](../../../app/src/lib/rig/clips.ts) `rawClip`, used by body renders and [items.ts:46-57](../../../app/src/lib/items/items.ts) item posing | description, action, direction, view, first frame, rest keypoints, target keypoints, seed, `no_background: true` | `template_id` omitted (default mannequin, matches setup). **`depth` and `z_index` are always dropped** by [poses.ts:15-16](../../../app/src/lib/rig/poses.ts) `toApi`, although [dev-fixtures/s4rig/keypoints.json](../../../app/dev-fixtures/s4rig/keypoints.json) keeps authored z. That is deliberate and paired: body and item must send identical joints to align **[source]**. `first_frame_keypoints` for a dressed keyframe are the bare body's `rig.rest` joints ([run.ts:204-206](../../../app/src/lib/items/run.ts)), never re-estimated on the dressed image **[source]**. |
| [clips.ts:129](../../../app/src/lib/rig/clips.ts) `poseCallGens` | quote: 2 at <=3, 3 at <=12, 4 above | REST documents only 3/8/15; MCP documents "4 to 14 = 3" **[contract]**. 13-14 frames are reserved at 4, one generation conservative per call **[inference]**. |
| [generate.ts:95-97](../../../app/src/lib/equipment/generate.ts) shared-fit transfer | 64 px reference + targets, seed, `no_background: true`, instructions, plan limit 10 | No `target_palette`. Instructions say "Use the reference colors", while the contract says an explicit palette, not the reference, sets final colors **[contract]**. Seed from [fit.ts:24](../../../app/src/lib/equipment/fit.ts) can be 0 (1 in 2^31); transfer treats 0 as an ordinary seed, but the raw pose calls derived from it use `seed + index`, so at most the first pose would be random **[inference]**. |
| [apiPlans.ts:85](../../../app/src/studio/apiPlans.ts) managed pixminimax custom move | `action_description` with unarmed suffix, `frame_count`, `keep_first_frame: false`, one direction, seed | `subject_description` and `initial_pose` omitted, so the provider auto-captions the mannequin, and MCP says the captioner "can decline some requests" and fail the job **[contract]**. |
| [starter-presets.ts:102-105](../../../app/src/lib/rig/starter-presets.ts) managed skeleton-v3 | action text, frames, directions, group, seed | `target_palette` (now documented for skeleton-v3) not sent **[source]**. |
| [create.ts:331](../../../app/src/studio/create.ts) base creation | description, size, view, `template_id: mannequin`, seed, `no_background: true` | `outline` and `detail` omitted, so the defaults "single color black outline" and "medium detail" apply **[contract]**. Equipment edits must match that outline; no change proposed. |

Nothing is sent wrongly against the current schema **[source]**. The header comment at [routes.ts:1](../../../app/src/lib/pixellab/routes.ts) still cites the October snapshot; for these routes that remains accurate.

Fidelity-relevant unused parameters, ranked: (1) dressed-image `first_frame_keypoints`, a semantic input rather than a new field; (2) `target_palette` on transfer (never measured; edit palette was measured with mixed results in [the palette pilot](../deep-paperdoll-target-palette-2026-11-06.md)); (3) pixminimax caption fields; (4) managed skeleton-v3 palette. `depth`/`z_index` on item poses is deprioritized: the [October 27 diagnosis](../2026-10-27-animation-diagnosis.md) found removing them did not change a slash, and an item pose must reuse the body's exact joints.

## 3. Live MCP versus REST

Tool schemas were loaded without calling paid tools. Differences that matter:

| Topic | MCP | REST / PixelDoll |
| --- | --- | --- |
| Outfit transfer | `transfer_outfit` takes URLs or base64, optional width/height that **pad transparent and centered, never scale**, `palette` + `palette_name`, `no_background` defaults to following the input. Cost "10-25 generations, billed by the whole grid" **[contract]**. | REST `no_background` defaults false; PixelDoll sends true. Observed transfer cost $0.08 per call ([live trials](../deep-paperdoll-live-trials-2026-11-06.md)). |
| `edit_image` | Maps to `edit-images-v2` (text or one reference), cap 4 frames at <=128 px, not `edit-animation-v2` **[contract]**. | `search_help` reports published edit-animation-v2 limits as "inaccurate", with "maximum 4 frames" or grid-layout errors, e.g. 8 frames at 64x128 **[contract, unverified]**. PixelDoll packs square cells by max side, so its caps are consistent with the published table **[source]**. |
| `inpaint_image` | Rectangle or mask; `crop_to_mask` exposed; does **not** validate mask purity; 10 generations for any square canvas <=256 **[contract]**. | Same semantics; PixelDoll masks are binary and checked locally. |
| Pro Flash inpaint/edit | Pure-binary mask enforced, "changes only" output mode, `use_color_palette_correction` on edit; 5 generations at 64x64 (free quote via `get_pro_flash_capabilities`) **[contract]**. | Outside the allowed edit models. A cheaper, stricter repair primitive is a policy lead only. |
| Raw skeleton v3 | Same fields; explains COCO-18 labels, mannequin side depth (right wrist 156, left 100), "4 to 14 = 3" pricing **[contract]**. `search_help`: no palette on raw; omitted depth comes from the template body per direction, not per frame; seed repeatability unspecified **[contract]**. | PixelDoll treats seeds as paired controls only, which matches. |
| Managed skeleton-v3 | Explicit `poses`, `move` (71 humanoid moves, `energy`, `side`, `facing`), `scale`, plus palette **[contract]**. | REST exposes only action text plus `animation_group_id`; MCP's structured moves have no REST field. No production reason to route through MCP. |
| Estimate | No MCP tool; MCP docs point to REST **[contract]**. | PixelDoll uses REST. |

## 4. Proposed experiments

None is authorized by this note; each needs owner approval before any paid call. Costs use the observed $0.08 per edit/transfer call and documented generation steps.

**E1. Re-estimated first-frame joints for dressed keyframes (highest value).**
Hypothesis: for gear that changes the silhouette (padded held weapon, hooded cape), estimating `first_frame_keypoints` on the dressed keyframe improves key retention and palette fidelity versus reusing bare `rig.rest`, while targets stay frozen. Challenges the assumption in [run.ts:204-206](../../../app/src/lib/items/run.ts). Inputs: the east hooded-cape and cape pose packets regenerated by `scripts/item-trial-packets.ts` (ledger [item-trials-2026-11-06.json](../evidence/item-trials-2026-11-06.json)); held case from [dev-fixtures/s5](../../../app/dev-fixtures/s5/) slash. Diff: `first_frame_keypoints: estimate(keyframe)` instead of `rig.rest`; everything else, including `keypoints`, byte-identical. Free gate first: if estimated joints differ from `rig.rest` by under 1 px median on a case, skip that case. Cost: 0.1 + 3 generations per arm; 3 cases x 2 seeds = about 19 generations. Accept: G2/G3 pass, palette distance not worse, proxy IoU not worse, lower proxy-protected off-key count in at least 4 of 6 pairs, no grip-side change. Disproved if estimates shift joints so outputs misalign with the frozen body (alignment is the point of shared joints) or gains are within seed noise.

**E2. Boundary receipt for 13-14-frame raw poses (quote default).**
Hypothesis: 13 and 14 frames bill 3, as MCP states, not 4. Inputs: any needed 13-14-frame clip; fold into real work rather than a dedicated spend. Diff: none to the request. Cost: 3-4 generations once. Accept: receipt shows 3 then change [clips.ts:129](../../../app/src/lib/rig/clips.ts) to `<= 14 ? 3`; a 4 keeps the reserve.

**E3. Transfer with explicit target palette.**
Hypothesis: transfer, whose palette contract explicitly overrides the reference, keeps zero palette distance with fewer key failures than palette edit (2 of 8 failed). Inputs: the eight pairs in [target-palette-plan-2026-11-06.json](../evidence/target-palette-plan-2026-11-06.json); harness already supports it ([trial.ts:152](../../../app/src/ui/item-trial/trial.ts)). Diff: transfer arm plus the identical `target_palette.colors`. Cost: 8 x $0.08 = $0.64. Accept: 8/8 pass, palette distance 0, alpha changes and collapsed color edges below the palette-edit arm. Disproved by any new G2/G3 failure pattern matching edit's or by blinded reviewers preferring unpaletted transfer.

**E4. Explicit pixminimax captions for custom moves.**
Hypothesis: sending `subject_description` ("bald solid-color humanoid mannequin, empty hands") and `initial_pose` ("standing upright, arms relaxed") reduces declined jobs and body/prop drift. Inputs: a frozen fixture character with an existing custom-move receipt as control. Diff: add the two fields at [apiPlans.ts:85](../../../app/src/studio/apiPlans.ts) path. Cost: 1 generation per 64 px direction; 2 directions x 2 seeds x 2 arms = 8. Accept: no declined jobs, fewer estimate-skeleton failures and no props in the paired frames. Disproved if outputs are indistinguishable.

**E5 (deferred). Managed skeleton-v3 palette for starter clips.** Only relevant where managed frames become stored body art; first confirm that use in [starter-project.ts](../../../app/src/ui/motion-lab/starter-project.ts). Not worth spending before that.

## Not done

No paid call, no `get_balance`, no Pro Flash quote beyond 64x64 inpaint. Provider statements from `search_help` are second-hand summaries, not contract text. The MCP tool list was taken from tool schemas loaded in this session, not re-enumerated over JSON-RPC.
