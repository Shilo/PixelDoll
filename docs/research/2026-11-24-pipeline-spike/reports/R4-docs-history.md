# R4: Decision history ledger

Scope: PixelDoll's own decision record, read-only, no paid calls. Sources: `docs/known-issues.md` (all), `PLAN.md` (D-decisions + pipeline lines), `docs/research/2026-11-23-item-move-route-cost.md`, `docs/research/2026-11-10-paperdoll-system-review/README.md`, `docs/research/2026-11-09-paperdoll-video-review/chroma-key.md`, `docs/research/2026-11-24-template-study/README.md`, `docs/research/2026-11-16-generation-costs/README.md`, `docs/research/deep-paperdoll-target-palette-2026-11-06.md`, `docs/research/2026-11-23-state-palette-trial/README.md`, `docs/research/2026-11-22-cost-calculator/cost-model.md`. Not read: per-arm evidence folders, spike ledgers, app code. Confidence tags: V=verified in doc/code, D=derived arithmetic, H=hypothesis.

## 1. Tried and settled

| Decision             | Settled value                                                                                                                                                                      | Evidence                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Transport            | Browser calls REST v2 with the user's token, no backend                                                                                                                            | PLAN.md:92 (D1)                                     |
| Item route           | Dress the chroma-keyed rest view in Pro `edit-animation-v2` (chunked under the frame cap), pose with `animate-with-skeleton-v3`; `inpaint-v3` packed grid is the per-clip fallback | PLAN.md:26-28                                       |
| Chroma key           | Green default; order green→magenta→blue→azure, switched from measured item colors, not prompt words                                                                                | PLAN.md:170 (D27); chroma-key.md:32-34              |
| Key-spend evidence   | 808 + 425 + 420 generations across the three key campaigns; the A/B decision rule was written before spending                                                                      | chroma-key.md:77-92, 169, 207-223                   |
| Outline recovery     | `absorbOutline` rule (c) shipped 2026-11-10; recovers 318 of 380 lost dark outline px, no G2/G3 flips                                                                              | chroma-key.md:145-167                               |
| Despill narrowing    | Azure helm rewritten px 1,356→24, plate 472→53; steel saturation back within 0.03 of green                                                                                         | chroma-key.md:219                                   |
| Posed pairing        | Idle and walk of a direction share one pose call for non-held items, 3 gens instead of 6                                                                                           | PLAN.md:145 (D24)                                   |
| Palette at save      | Free local snap (`snapToBodyColors`) is the only default for States; reaches 94.5→100 % body-palette membership                                                                    | 2026-11-23-state-palette-trial/README.md:33-35, 50  |
| Moves                | Template only for `walking-8-frames`, `running-8-frames`, `two-footed-jump`; authored idle/death beat templates                                                                    | template-study/README.md:14-20; PLAN.md:197 (D32)   |
| Loop seams           | `trimStandingSeam` drops at most one exact standing frame per end of a described loop, then resamples                                                                              | template-study/README.md:119-134                    |
| Template price       | Template motion 3 gens/view (2 for a 3-frame template); described managed motion 1 gen/view                                                                                        | template-study/README.md:157-161                    |
| Item fit quality     | Posed gear already fits the frozen base: misfit beyond 1 px is 0.2-1.4 px/frame, no arm notches                                                                                    | 2026-11-10-paperdoll-system-review/README.md:14, 55 |
| Held grip            | Grip gap 0 px on all 129 stored held frames, item within 2.9 px of the wrist                                                                                                       | same:20, 60                                         |
| Sheet item route     | `/edit-images-v2` all-view sheet: 15 gens for 3 views × 6 frames at 92 px vs 60 anchored (4×) and 30 per-view; 18/18 sheets passed QA                                              | 2026-11-23-item-move-route-cost.md:9-14, 54         |
| Frame caps           | `editFrameCap` 16 (≤64 px), 9 (≤80 px), 4 otherwise; `editGens` 10 (≤128), 15 (≤170), 25 (≤256)                                                                                    | 2026-11-22-cost-calculator/cost-model.md:43         |
| Consistency at 92 px | Sheet vs anchored palette distance after snap 5.3 vs 5.2 (jeans), 3.2 vs 2.2 (braid)                                                                                               | 2026-11-23-item-move-route-cost.md:10               |

## 2. Rejected, and the evidence that rejected it

- **Cyan / azure / blue as the default key.** Rule fired: no hard-fail advantage, G3 0.046 (cyan) vs 0.020 (green); steel px leaning to key 0.65/0.77 vs 0.009; cyan silently dropped a turquoise gem, blue emptied a navy tunic. chroma-key.md:94-112.
- **Flat bright mannequin (no dark shades).** Bright green body produced olive-brown folds into a red cloak: 114/358/145/1,842 olive px vs 0-36 on the ramp. chroma-key.md:220.
- **Skin-only keying.** Broken outlines where item and body outlines share black; steel over gray underwear kept 48 of ~500 px; 10 of 15 views failed when the key was chosen from skin pixels alone; the 94 % key-kept figure was only reached with the green key on the tested items (chroma-key.md:191). chroma-key.md:191.
- **Painting gear directly on the real frames as the default.** Cost about 110 gens per worn item over 5 views instead of about 25; transfer failed 2 of 16 clips at the gates while posing failed 0 of 12. 2026-11-10-paperdoll-system-review/README.md:55.
- **Selective color lock.** At most 5.3 % of posed item px use a color absent from standing art, and the biggest swings are correct shading a lock would flatten. same:56.
- **Code-placed / tracked rigid head layers.** Re-posed helmets already match the painted-on control. same:59.
- **Armed-carrier body pose for held items.** Grip gap already 0 px on 129 frames; would break the one-frozen-base model. same:60.
- **Hiding the 1 px body outline beside posed gear.** Pre-registered test: feet 16→3 and capes 23→7 passed, torso 26→18 failed; also 63→293 base variants at export. same:85-91; known-issues.md:207-211.
- **Global palette reduction during generation (`target_palette`).** 6/8 clips passed vs 8/8 controls, 2 new body-key failures, 2,051 raw alpha values changed. deep-paperdoll-target-palette-2026-11-06.md:45-62.
- **Free RGB-nearest snap as a default.** Changes masks (removes 404 px, adds 1) and collapses 2,825 gear-color edges while QA passes. same:54-56, 62.
- **API palette options for States.** 6-7 of 15 managed calls were refused; local snap already reaches 95-100 % free. 2026-11-23-state-palette-trial/README.md:33-36, 50-52.
- **Pixen for item changes.** 0/5 sheets (figures absent from the reference, rotated views, targets left unchanged). 2026-11-23-item-move-route-cost.md:64.
- **`inpaint-v3` as the sheet route.** 2/4 (no hat pixels in the returned cells, braid misregistered with body pixels differing from the base). same:63.
- **Skeleton posing as the cheap item route.** 1/4 as scored; 3 of 4 items fail G2 in east (23-58 body px differ) because the animated body differs in shape. same:65, 82, 119.
- **Sheet route at 64 px.** 3 of 8 sheets returned a back-view design in 1-2 south cells (4/216 frames); QA caught 1 of 3. same:11, 149.
- **Lower bound 64 px for the pilot.** Rejected in favor of 80 px because 64 px is where the only silent failures occurred. same:142.
- **Per-view sheets below ~80 px.** A per-view sheet still costs 10, the same as anchored, so no saving. same:109, 128.
- **Routing torso outerwear to per-view sheets.** Plate carrier was clean on the all-view sheet in 3 and 4 views. same:144.
- **Extending `dirGate` to edit cells.** It missed braid and jeans swaps and false-failed all 18 frames of an unswapped hat; the prototype coverage-signature gate false-alarmed on 9-26 % of real frames. same:130.
- **Every kick and punch template.** Only east-readable, or torn/facing-flipped frames; `high-kick` failed seed 47, `roundhouse-kick`/`hurricane-kick` failed north. template-study/README.md:42-50.
- **`taking-punch` for Hurt.** South faces three-quarter in every frame on both seeds, no north head-to-head, roughly doubles Hurt's body price. same:19.
- **Breathing idle.** Reported belly inflation and mouth artifacts; the authored idle won. known-issues.md:78-80, 86.
- **Template frames as-is.** They sit 1-4 px off the standing art, so the template is submitted again before use; the returned output shows the same defects as the template reference (torn frames, facing turns, props). template-study/README.md:142, 180.
- **Item-specific prompt notes ("check the back view").** Rejected because they assume what the item is from its wording. known-issues.md:231-232.

## 3. Accepted product limits (do not re-litigate without new evidence)

- **Export caps:** layers ≤256 px, at most 256 body-cut variants; a larger wardrobe fails before generating sheets. known-issues.md:30, 157.
- **Generation is not bit-repeatable:** same request + seed ≠ same pixels; bases are frozen and never regenerated; `baseHash` staleness invalidates items. known-issues.md:106-107. Measured floor: the same input frame submitted twice in one image differs in shape by 2-20 % of the item and in exact color on ~70 % of px. 2026-11-23-item-move-route-cost.md:85.
- **Mirroring flips handedness and one-sided items;** 8 separately requested views avoid the flip but need review; an item-only toggle cannot repair old flipped actions. known-issues.md:108-113.
- **The hand covers the grip** (body stays frozen; two layers at the grip). known-issues.md:114-117.
- **Two-handed items are returned in one hand;** main hand is always the character's right; no left-handed characters. No check tells a fist on a handle from a blade near a wrist. known-issues.md:118-123.
- **Side views can put an off-hand item in the main hand** (east lantern test, 2026-11-07). known-issues.md:129-132.
- **A 1 px rim and a pale key fringe remain.** known-issues.md:207-215.
- **One wrong dressed view can save as clean:** 3 of 79 views over 25 dress calls; every candidate check was tested and rejected. known-issues.md:223-235.
- **Automatic dye correction trades coverage for detail:** the clip-wide veto cancels 3,430 of 16,500 former corrections (20.8 %); global palette snapping stays unqualified. known-issues.md:71; deep-paperdoll-target-palette-2026-11-06.md:78.
- **A few item colors have no safe key;** two words can ban all four keys; the collision measure misses low-shade cases (one jester at 2-6 %). known-issues.md:148-155.
- **Dark thin items over deep skin lose px on non-green keys** (94 % kept on the deepest skin tone on green, as low as 32 % on other keys). known-issues.md:194-198.
- **Bare bases vary by seed** (blotches, gray skin, scenes) and require re-rolls. known-issues.md:162-164.
- **Small accessories seen from the front only** end in review, not a re-roll. known-issues.md:165-167.
- **Held-item guards validate geometry, not anatomy or perspective.** known-issues.md:95-99.
- **Item QA is a floor, not proof:** the stored skeleton jeans pass while showing bare leg. 2026-11-23-item-move-route-cost.md:26.
- **No cross-view gate exists;** the sheet route requires human review before saving. same:130, 164.
- **Sharing:** exact copies only on byte-identical bodies; otherwise worn unfitted with a warning; head items and side-scrollers never re-fit; wrist-offset re-fit is whole-pixel, no rotation. known-issues.md:255-301.

## 4. Stale or inconsistent cost numbers

- **`2026-11-16-generation-costs` prices the skeleton route only.** Its `Pose = S*3*D*[(C+U)*M + Σk_w]` (README.md:128-133) assumes 3 gens per clip-direction; the anchored item route bills 10 per `edit-animation-v2` call regardless of frame count (2026-11-23-item-move-route-cost.md:38, 62 at 92 px = 60 for 2 calls/view). Its claim that item poses are 94.8 % of the bill (README.md:52) is route-specific, not a pipeline fact.
- **Its dress line "10 units across three, five or eight views" (README.md:139) holds only ≤128 px;** `editGens` rises to 15 above 128 px and 25 above 170 (cost-model.md:43). Held dressing 10/20/30 (README.md:139) also predates the sheet route.
- **Body move 5.6 described / 7.6 walk units (README.md:90-94) is now understated for template moves:** a template costs about 2 gens more per view (template-study/README.md:80), so an 8-frame walk is 3+2 = 5 gens/view before measurements.
- **The $0.005/unit basis (README.md:25) contradicts the app's own catalog ratios:** $0.0205/gen (64 px V3), $0.0171 (8-frame skeleton), $0.008 (edit-animation ≤128 px) (cost-model.md:108). No universal USD/gen rate exists; the Nov 16 dollar column is allowance-equivalent, not cash.
- **The Nov 23 sheet-route table supersedes every per-item anchored price** in both documents: 92 px, 3 views × 6 frames = 15 vs 60 (2026-11-23-item-move-route-cost.md:100). Any cost estimate still quoting 60 for that case is stale.
- **Its "not measured failure rates" caveat stands:** no accepted-asset yield has ever been measured for the anchored route; only per-arm pass counts exist.
- **Pricing bands are inferred from usage records** and cannot tell whether the mean-side or the sqrt(area) reading of the published band fits; quote with the 336 edge (same:39, 129).

## 5. Unanswered questions worth paid tests (greenfield)

1. **Does canvas size buy consistency above 92 px? [H]** No sheet frame above 92 px was ever tested (2026-11-23-item-move-route-cost.md:170). Palette distance falls sharply with size: 10.9-17.1 at 64 px vs 3.1-6.5 at 92 px (same:86). Test 128 and 192 px on the same 6-frame view: 15-25 gens/sheet, ~60-100 gens for 4 items × 2 sizes. Success = palette distance ≤92 px level and no new view swaps.
2. **Does the all-view sheet hold at 8 directions/diagonals? [H]** Only 4-view rigs were measured; diagonals were never available (same:22, 144, 172). 5 requested views at 92 px costs 25 (computed, same:102). A diagonal frame may be the least consistent row.
3. **Capes and back items at 92 px on one all-view sheet. [H]** Tested only at 64 px, where the cape had the lowest truth IoU 0.68 (same:144, 87). Cheap: 2 items × 2 seeds = 30-50 gens.
4. **Reliable cross-view gate. [H]** Three candidates failed (dirGate, coverage signature, palette/area/foreign-share metrics: same:130; known-issues.md:228-235). A paid corpus of deliberately swapped views plus real failures could qualify a gate; without it the sheet route cannot auto-save, which caps its cost advantage at the review cost.
5. **Cheapest route for held items.** None is qualified: sheet route unstable grip, skeleton fails G2, anchored 60/sheet-equivalent (same:12, 65, 82). `transfer-outfit-v2` at 32-256 px is unmeasured (same:43).
6. **Repeatability yield, not quality.** Seed-to-seed design variance often exceeded the key effect (chroma-key.md:140); no campaign measured gens per accepted asset. Needed before any total-cost claim (2026-11-16-generation-costs/README.md:41, 146-147).
7. **32-frame / longer clips.** `editFrameCap` 4 above 80 px forces multi-call anchoring (cost-model.md:43); no test of whether 2 sheets beat 4 calls at 16+ frames.
8. **A larger frozen base (128 px) as a quality lever. [H]** Base is generated at 48 px and padded to 64, never rescaled (PLAN.md:95, D4); 128 px characters exist only as imports. Whether a 128 px base improves item fit per generation is untested.
9. **Per-slot policy, not per-route.** Only worn non-held 4-direction at 80-128 px is supported (same:166); hat and braid failed the skeleton route, jeans passed QA while showing bare leg (same:26, 120).
10. **USD credit pricing.** The catalog labels USD estimates as variable with processing time (cost-model.md:108); any real dollar forecast needs usage records, not catalog ratios.

### Method lessons the history itself records (cheap to reuse)

- Write the decision rule before spending; keep review blind; budget a pre-run and a post-run adversarial challenge (template-study/README.md:188-200).
- Match canvas, reference art, rest joints, action text and render seed across arms; confirm the managed character's registered art equals the local reference (same:201-202).
- Save paid frames to disk as they arrive; background jobs expired for Oct 28 (same:176-178).
- Offline rescoring before spending changed two verdicts on stored data alone (chroma-key.md:218).
