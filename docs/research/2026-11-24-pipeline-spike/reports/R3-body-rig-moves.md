# R3: Body, rig and moves audit

Date: 2026-11-24. Branch: `t3/pixellab-pipeline-research`. Read-only: no paid calls, tests, builds or app edits.

## 1. Scope and method

Read in full: `app/src/studio/characterConfig.ts`, `app/src/lib/rig/clips.ts`, `app/src/studio/movePricing.ts`. Targeted reads: `app/src/studio/create.ts` (1590-1839, 2300-2499), `app/src/lib/pixellab/routes.ts` (95-204), `app/src/lib/rig/rig.ts` (types/pads), first 100 lines of `docs/research/2026-11-24-template-study/README.md`, `docs/research/2026-11-19-animation-model-audit.md`, `docs/research/2026-11-18-pixeldoll-states/README.md`. Not read: `lib/items/items.ts` (item pricing detail), `moveAnimationOptions.ts`, estimate-skeleton implementation. Cost figures are the app's own estimates unless marked measured.

Labels: **V** verified in code/contract, **D** derived arithmetic, **H** hypothesis for a paid test.

## 2. Creation flow: models, limits, costs

**Flow (V).** One `create-character-v3` registration call sends the south view as `reference_image` plus the other originals as `direction_images`, `n_directions: 8`, `template_id: 'mannequin'`, one seed (`create.ts:1613-1633`). The returned `character_id` is then fetched and read for `skeletons['2d_references']` rest joints per direction (`create.ts:1642-1666`). Any absent or unusable managed joints fall back to one `estimate-skeleton` check per direction at 0.1 gen each (`create.ts:1667-1680`, `movePricing.ts:24`). Only after that are the standing views frozen into the rig, and the Default move is built as **one standing cell per direction with no animation request** (`create.ts:1682-1688`). Idle, walk and every other move are later purchases.

**Limits (V).** Body, frame 32-256 px (`characterConfig.ts:466`), body in 4 px steps (`:170`, `:446`). Per-model body ranges and reference caps: v3 32-256 (ref 256), Pro 32-168 (ref 1024), Pro Flash 32-256 (ref 256), Standard 32-128 (ref 128) (`characterConfig.ts:131-136`, `:173-198`). Prompt max 2,000 chars, seed safe int (`:495-515`). The four `BODY_SIZES` chips are 48/64/96/128 (`:12`) while v3 accepts up to 256 in 4 px steps: the preset list, not the API range, is the practical cap users see.

**Automatic frame (V).** `autoFrame = min(256, 16*ceil((body + 2*clamp(ceil(body/8),8,16))/16))` (`characterConfig.ts:237-238`). So pad is 8 px at body <=64, 16 px at body >=128, and **the 256 clamp eats the pad at body 256** (256+32=288 -> 256). A frame below `autoFrame` is a preflight warning, not a refusal (`:476-486`).

**Costs (V, from `movePricing.ts:42-64`), per registration:**

- v3: `1 + 0.25 + ceil(body²*8/65536)` gens: body 64 -> 2.25, 96 -> 3.25, 128 -> 3.25, 256 -> 9.25.
- Standard: flat 1.25. Pro Flash: first image 5 (<=96 px), 6 (<=208), 9, plus 0.25 plus area term. Pro: 10 gens at 48 and 25 at 128, linear between (`:27-30`), plus 0.25.
- **D:** the area term uses `body²`, not the frame (`movePricing.ts:56-59`). At body 128 the default frame is 160, so the real canvas is 25,600 px and `ceil(25600*8/65536)=4`, not 2. Our estimate applies the documented `ceil(area*8/65536)` term to `body²` while the submitted canvas is `frame²`; if the documented formula is meant to use the submitted canvas, our quote is up to 2 gen low at body >= 96. Settle it by comparing one creation quote with its usage record (`maxGens` `:63` may then need raising).

## 3. Move flow per mode: frames, caps, 0.1-gen units

**Routes (V).** Skeleton V3 is the item renderer in every case; the motion inside a Skeleton move is one of: a `MOVE_TEMPLATES` template, PixelDoll's authored keypoints, imported joints, or PixMiniMax text (`movePricing.ts:92-128`).

**Templates (V).** `MOVE_TEMPLATES` is walk 8, run 8, jump 7, getting-up 5, scary-walk 8, running-jump 8 (`routes.ts:137-173`). A template is used only on a registered character, Skeleton V3, unedited chip text, no start frame, and frames <= the template's own count (`movePricing.ts:92-105`; `docs/research/2026-11-24-template-study/README.md:22-30`). Template motion is `POST /characters/animations` with `template_animation_id`, no `frame_count` (`routes.ts:181-189`). Measured: 3 gens per view for 8-frame templates, 2 for 3-frame `lead-jab` (`template-study:99-100`), matching `poseCallGens`.

**Frame caps and batching (V).** `poseCallGens = 2 (<=3 frames), 3 (<=12), 4 (<=15)` (`clips.ts:232-233`); batches are balanced under 15 (`clips.ts:219-231`). One/two-frame clips repeat their last pose up to 3 (`clips.ts:237-240`). So a 12-frame clip costs the same motion/render price as 8 up to a point, and 16+ frames jump to 4 gens per batch plus a second batch at >15. The audit records a 40-frame native request clamped to 16 on V3 (`animation-audit:68`). `defaultMoveFrameCount` chooses per model and cell width (`movePricing.ts:141-144`; not read).

**Extra frames (V).** Native routes return one extra leading frame (PixMiniMax 9 for 8, `animation-audit:56`, `:77`); `normalizeMotionFrames` trims the echo, `trimStandingSeam` trims a frozen seam, and a `short` note is recorded when fewer frames arrive (`create.ts:2376-2417`). Requested keypoints are resampled to the final count with `sampleMovePoses` (`create.ts:2427-2431`). Skeleton V3 returned exactly 8/8 in the audit (`animation-audit:76`).

**Measured 0.1-gen unit.** One `estimate-skeleton` call costs 0.1 gen and every Skeleton move pays `frames * 0.1` per direction for joint measurement, plus `frames * 0.1` for motion re-measurement (`movePricing.ts:213-226`). At 8 frames that is 1.6 gens of pure measurement per direction, 21% of the 7.6 gens/direction body total (D: 0.8+3+3+0.8). Eight separately returned directions therefore cost **60.8 gens of body alone** for one 8-frame move, before any item.

**Retries (V).** Skeleton V3 renders retry up to `CLIP_ATTEMPTS` times with `seed + attempt*7919` (`create.ts:2432-2448`), each a full paid body render. Non-Skeleton models get one attempt. Retries are not in `moveEstimate`, so a failed QA pass can double a move's quoted price.

## 4. Keypoint reuse and error sources

- Items are posed with **exactly** the body's stored source keypoints (`rig.ts:47`). Body pose error is inherited 1:1 by every item; there is no independent item-space correction after the fact.
- Joints come from three places, in order: managed `2d_references`, `estimate-skeleton` fallback, imported joints (`create.ts:1667-1678`, `:2356-2364`). Each carries its own error and none is validated against the body silhouette beyond `hasAll`.
- Per-frame measured joints feed QA only; a gap is bridged and recorded (`create.ts:2411-2417`) but never re-posed. A missing joint set is a hard `MISSING_JOINTS` fail (`clips.ts:156`, `:188`).
- Review thresholds: 2 px arm-joint adherence, 1 px silhouette bottom, 0.97 palette fit, 0 border px, shoulder ratio >= 0.5 (`clips.ts:122`, `:151-154`). On a 64 px body, 2 px is 3.1% of the sprite (D); at 128 px it is 1.6%. **The same absolute joint error is a smaller visual defect on a larger canvas**, which is why size is a consistency lever.
- Palette fit separates routes: Skeleton V3 100% median with 0/9 clips below 97%; PixMiniMax 2/9 and Text V3 3/9 below (`animation-audit:15-17`, `:30-32`).

## 5. Body-side choices that most affect item consistency

Ranked by effect on the item layers:

1. **A single standing frame per direction.** Items are dressed once on the rest pose and then re-posed onto every move frame, so every non-rest frame of every item is inferred. Multiplying body frames multiplies inferred item frames.
2. **Joint estimation noise** (section 4). It is the alignment ceiling for gear and is cheapest to improve at larger cell sizes.
3. **Pad/headroom.** Pad is only 8-16 px and vanishes at body 256 (`characterConfig.ts:237-238`). Tall hair, hats and capes need it; 6/9 Skeleton V3 archived clips touched the raw border at 64 px (`animation-audit:21`).
4. **Mirrored directions.** 3 of the 8 default views are flips (`characterConfig.ts:70`). A mirrored view flips asymmetric gear (single pauldron, hip sword) with it; that is a correctness choice, not a cost one.
5. **Body palette stability.** The 0.97 `paletteFit` gate exists because body color drift also breaks chroma extraction; Text V3 failed it on Walk/Death (`animation-audit:20`).
6. **Direction count.** Cost is linear in separately requested directions (`movePricing.ts:209-226`); mirrors already halve 8 to 5 separately requested views.

## 6. Candidate changes

| #   | Change                                                                                         | Mechanism / evidence                                             | Cost delta                                                                                                                                                                           | Risk                                                 | Test                                                       | Confidence                  |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------- | --------------------------- |
| C1  | Price creation on the canvas (`frame²`) instead of `body²`                                     | `movePricing.ts:56-59` vs `autoFrame`                            | 0 spend; fixes up to +2 gen under-quote at body 128 (H)                                                                                                                              | quote only; may reveal true prices                   | compare one creation usage record to quote at body 96-128  | High that code is wrong (V) |
| C2  | Keep the auto pad at >=16 px and lift the 256 cap to the documented maximum                    | `characterConfig.ts:237-238`; border touch `animation-audit:21`  | **Zero on Skeleton V3**: pose price is per frame, not area (`clips.ts:233`). Native v3 moves pay `ceil(w*h*frames/65536)` (`movePricing.ts:169`): 8 frames 128²->3, 144²->3, 160²->4 | export still caps 256 (brief)                        | one item-heavy move at 144 vs 128, same seeds              | High (V+D)                  |
| C3  | Raise the default frame count 8 -> 12 on Skeleton V3                                           | `poseCallGens` still 3 at 12 (`clips.ts:233`)                    | +0.4 gen/view of checks (0.1x4); 8 dirs +3.2 gens, +10.5% on 60.8, for +50% frames (D)                                                                                               | more inferred item frames; loop seams                | Walk 8 vs 12 frames, same template, count item QA warnings | High (V+D)                  |
| C4  | Prefer the template route for Walk/Run/Jump explicitly                                         | 100% palette, no seam stall; `template-study:16-18`, `:80`       | +2 gens/view over described motion                                                                                                                                                   | only 3 templates qualify                             | priced A/B already exists; extend to equipped runs         | Medium                      |
| C5  | Cap retries out of the estimate, or surface retry spend                                        | `create.ts:2432-2448` vs `movePricing.ts:187-267`                | honest quote, no spend change                                                                                                                                                        | none                                                 | compare quoted vs settled on a forced-fail move            | High (V)                    |
| C6  | Drop `frames * 0.1` motion re-measurement for template moves whose frames are already measured | `movePricing.ts:220-226` double-charges EST for fixed poses only | -0.8 gen/direction at 8 frames (D), up to -6.4 per move                                                                                                                              | may remove the only measured gate on template frames | run move QA with checks skipped on templates               | Medium (H: contract)        |
| C7  | Store a second standing pose (3/4) as an item dressing reference                               | `create.ts:1682-1688` dresses items on one pose                  | one extra body render set per character                                                                                                                                              | breaks the "single rest" invariant across items      | dress one item from two rest poses, compare alignment      | Low-medium                  |
| C8  | Let a per-item `mirror-safe` flag choose flip vs generate per direction                        | `characterConfig.ts:70`, item mirror field `create.ts:1758`      | mirror-safe items halve direction count; asymmetric ones stay                                                                                                                        | user-visible behavior change                         | sword + hat on Unique 8                                    | Medium                      |

Largest expected win per generation: **C2 and C3 together**. Both ride the fact that Skeleton V3 body and item posing is priced by frame count, not by pixels, so canvas and motion density are cheap levers that the current defaults leave on the table.

## 7. Where the current pipeline loses (ranked)

1. **One-frame standing source.** Every item frame beyond rest is inferred; nothing in the body pipeline constrains it. This is the dominant item-drift mechanism.
2. **0.1-gen joint checks are 21% of body cost** yet are the only guard on the pose the items copy exactly (`movePricing.ts:213-226`, `rig.ts:47`).
3. **Pad disappears at 256 body** while the form still allows 256 (`characterConfig.ts:177`, `:237-238`).
4. **Quote drift**: `body²` creation term (C1) and unbounded retries (C5) both under-quote.
5. **Direction count**: 8 unique views cost 8x, and mirrored gear breaks asymmetry.
6. **Non-template native motion** loses palette and stalls frames (`animation-audit:77`: PixMiniMax 9/8/4 distinct).

## 8. What must not change

- `poseCallGens` bands (2/3/4) and `EST = 0.1` are measured (round 4, usage records); do not "round" them (V).
- The template allowlist is the output of a 751.3-gen blind study (`template-study:4-5`, `:38-53`); do not widen it without a new study.
- Authored idle/death beat their templates and must stay authored (`template-study:20`).
- Mirrored directions must keep emitting `mirrorOf`, never a second paid call (`characterConfig.ts:394-399`, `:416`).

## 9. Open questions

1. Does one creation at body 128 / frame 160 charge 3.25 gen (our estimate) or more? One usage record settles which side of the documented formula to apply.
2. Is the 15-frame skeleton-v3 batch limit the public contract's or PixelDoll's padding choice? (`clips.ts:219-233`).
3. Does `estimate-skeleton` accuracy change with cell size? That decides whether C2 buys alignment, or only headroom.
4. Item cost per frame (not read here): whether C3's +50% frames costs 50% on items or less via the sheet route (`movePricing.ts:251-259`).
