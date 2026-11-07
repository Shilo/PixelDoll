# Repository research inventory

November 7, 2026, starting commit `6a33fd37`. Owner: repository-inventory researcher of the [improvement cycle](../../handoff/paperdoll-improvement-cycle.md) (section 2). The machine-readable record is [inventory.json](inventory.json): one entry per tracked non-binary document, script, fixture and data file under `docs/`, `PLAN.md`, `AGENTS.md`, `app/scripts`, `app/test/fixtures` and `app/public/fixtures`, plus group entries for runnable `spikes/` families, binary directories and ignored local evidence. Every entry records path, date (name or content, else last Git commit, see `dateSource`), area tags, type, disposition, summary, and for documents read in full, labeled claims, corrections and unrun follow-ups.

## Method and honest limits

- Discovery used `git ls-files` over the scoped trees plus directory listings of ignored local evidence. Images and ZIPs are not individual entries; their directories are.
- The planned partition into parallel readers failed (concurrent sub-agent limit), so one reader produced the whole inventory. Full reads were prioritized by consequence for the current pipeline: every 2026-11-06 `deep-paperdoll-*` and `tool-*` document, all 2026-11-02 reviews and their result files, generation-quality rounds 1 to 4, Lexingel round 5 and `docs/known-issues.md`.
- `triaged-only` means title, opening and, for some, headings or JSON structure. It is the majority disposition and is not a review. Area tags on triaged entries come from titles, openings and headings and are approximate.
- Spot checks against current code (2026-11-07): `transportError` exists in `app/src/lib/pixellab/client.ts`; `poseCallGens` still reserves 4 gens above 12 frames; `app/src/lib/rig/clips.ts` has no loop-wrap or seam diagnostic; the item depth control still writes `slot.zOverrides`; exporters emit no anchor or keypoint tracks; no weapon polarity check exists; no frame editor exists in `app/src`.

## Completion pass (2026-11-07, second reader)

A second reader completed the full reads that the first pass deferred. Sub-agents were again unavailable (concurrency limit), so one reader worked in priority order: the generation pipeline review (all sections 1 to 18.5), spikes S1 to S5, `docs/architecture.md`, `docs/manifest-spec.md`, every 2026-10-27, 2026-10-28, 2026-11-01 and 2026-11-02 motion, grip, starter and closeout document, the shared-equipment plan and its test report, the frame-editor research agenda, the Codex challenge, the paperdoll repos and paperdoll.py reviews, and the item-quality reports B7, B9, B14, B16, T3, shields and the body-quality audit. Small result JSON files were read by flattening every text field. Large machine ledgers (over about 45 KB) stay `triaged-only` with a `readNote`. Every entry in [inventory.json](inventory.json) now has a `readNote` (how much was read, or why not) and a `codeContradictions` list (claims that current `app/src` no longer honors, with file:line). Entries changed by this pass carry `completionPass: true`.

## Counts

272 entries (55 updated by the completion pass).

| Disposition | First pass | After completion pass |
| --- | ---: | ---: |
| read-full | 34 | 78 |
| triaged-only | 179 | 134 |
| irrelevant (with reason) | 53 | 53 |
| superseded-by (named replacement) | 6 | 7 |
| blocked | 0 | 0; the Civitai workflow graph is recorded as a blocked external input inside entries |

The three 2026-11-02 token reviews and the agent environment review were read in full but are marked irrelevant to paper-doll output. The new `superseded-by` entry is the 2026-11-02 Claude quality-review handoff (sections 1 to 7 and 15 to 16 read; superseded by the response and the joint reassessment).

Of the 134 still `triaged-only`, 10 were opened by the completion pass but not read in full (9 large or partly read result JSON files whose companion reports are now read in full, and the planning-only frame-editor README); 46 are scripts, fixtures and other data entries; 78 are documents listed under "Still only triaged" below.

| Area (entries can carry several) | Total | Read in full | Triaged | Other |
| --- | ---: | ---: | ---: | ---: |
| testing | 101 | 8 | 70 | 23 irrelevant |
| ux | 85 | 24 | 26 | 34 irrelevant, 1 superseded |
| equipment-layers | 64 | 28 | 36 | |
| animation | 63 | 36 | 25 | 2 superseded |
| provider-contract | 62 | 33 | 28 | 1 superseded |
| held-items | 60 | 43 | 15 | 2 superseded |
| generation | 57 | 29 | 27 | 1 superseded |
| quality-gates | 54 | 37 | 16 | 1 superseded |
| export | 50 | 22 | 28 | |
| rigging-pose | 50 | 31 | 18 | 1 superseded |
| masks-chroma | 42 | 33 | 8 | 1 superseded |
| palette-dye | 29 | 20 | 9 | |
| tooling | 23 | 16 | 4 | 2 irrelevant, 1 superseded |
| ownership-occlusion | 21 | 16 | 5 | |
| failed-experiment | 16 | 15 | 1 | |
| games-engines | 10 | 6 | 3 | 1 superseded |

(Process, credentials and design-tag rows are omitted; they carry no paper-doll output claims.)

### Still only triaged

The completion pass read every document the first pass named as consequential. These documents remain `triaged-only` and should be read before conclusions depend on them, in this suggested order:

1. **Studio, import and export behavior:** `docs/testing/professional-audit-2026-10-22.md`, `professional-data-audit-2026-10-22.md`, `professional-studio-audit-2026-10-22.md`, the character-creator and character-import reports (2026-10-22 to 2026-11-04), `export-audit`, `export-challenge`, `gdevelop-export`, `phaser-playback`, `unity-playback`, `rotation-origin-audit`, `integration-and-crash-2026-10-28`, B8, B11, B13, B15, T2, R6, `item-quality-follow-up-2026-10-22`, `qa-summaries-2026-10-22`.
2. **Pipeline and repair research:** `docs/research/professional-pipeline-audit-2026-10-22.md`, `docs/reviews/2026-10-23-pipeline-audit.md`, `project-repair-workflow-review-2026-10-23.md`, `docs/reviews/2026-10-23-frame-repair-recommendation.md`, `handedness-implementation-scope-2026-10-22.md`, `bare-skin-base-wording-2026-10-25.md`, `character-creator-compact-mirroring-design-2026-10-22.md`, `export-targets-2026-10-23.md`, `native-export-expansion-2026-10-23.md`.
3. **Large handoffs and notes:** `docs/handoff/2026-11-02-complete-session-claude-review.md` (124 KB; its counter-review and reassessment were read by the first pass) and `docs/research/SHARED_NOTES.md` (70 KB).
4. **Surveys:** the tools, games and engines surveys, `pixellab-first_paperdolling_frame-based_2d_rpgs.md`, `pixellab_current_capabilities_2026-10.md` (provider capabilities were rechecked by the 2026-11-06 provider audit, read in full).
5. **Planning and index:** `PLAN.md`, `docs/README.md`, `docs/user-guide.md`, `docs/usability-principles.md`, the remaining frame-editor design documents (planning only; no editor exists in `app/src`), the milestone reports M1 to M5 and MVP (historical).

Reason for every remaining triage: one reader (sub-agent concurrency limit) and a priority-first budget. Each entry's `readNote` says so explicitly.

## Contradictions, corrections and supersessions

| # | Earlier claim | Later evidence | Status |
| --- | --- | --- | --- |
| 1 | Round 1: concept items should use `transfer-outfit-v2` (one blind-judged seed). | Round 2 reversed it (2-2-2 tie, kill rule, anchored edit). 2026-11-06 live trials: transfer 14/0/2 versus edit 15/1/0 at the same $0.08, visual ties. | Anchored edit stays. `docs/README.md` still summarizes round 1 as concept items via transfer (stale index text). |
| 2 | Round 1 cut `max_colors`/`target_palette` because it constrains key pixels. | 2026-11-06 target-palette pilot included key shades: exact palette membership, but 2 of 8 clips failed G2/G3. | Provider palette not a default; partly contradicts the round 1 rationale. |
| 3 | Deep review table: production dye correction restored 3,830 of 6,479 doublet pixels. | Measured before the clip-wide boundary veto (commit `3830a7a0`). The veto cancels about 20.8% of corrections; the vision replay shows the veto binds 2,493 pixels on that doublet. | Review table is historical, not current behavior. |
| 4 | Round 3 D22: two cutting items, Studio hides both, engines one (accepted limit). | Ownership follow-up reproduced it as an export defect (equip-order dependent in Phaser) and fixed it with combined variants up to 256. | Superseded; known issues updated. |
| 5 | Round 5 dropped a signed weapon-flip check (slashes rotate grips up to 165 degrees). | Vision and ownership studies: forearm-relative signed polarity detects a synthetic reversal; a real bow transition is ambiguous. | Different method; diagnostic only; not implemented. |
| 6 | Round 5: per-frame z-order is not worth it (0.1 to 0.9 point gain). | Geometry, native and ownership studies: item-versus-item depth cannot be represented by whole-layer order (Fantasy demo cycles in 78/120 and 91/120 cells; body-alpha split gets 2/4 owners). | Unresolved tension for item pairs; body-versus-item remains exact per pixel. |
| 7 | Generation pipeline review 16.3, 16.4, 18.2 and the visual page: armed/split recomposes exactly, real-frame dressing changes 0 body pixels, editors paint over faces. | Claude 2026-11-02 retracted all three (metric and registration bugs); Codex withdrew its blanket same-body input objection. | Corrections recorded in the pipeline review header and the HTML page. |
| 8 | Claude F1: the full-eight hatchet is a two-body splice whose seams cause popping. | All eight composites rebuild exactly on B-star V2; generation provenance is mixed; cause unproven. | Claude agreed in the final closure. |
| 9 | Claude: prototype thin-fragment Rules A/B can land after a second weapon family. | Rule A restores five body-rim false positives; Rule B's predicate is vacuous after pre-clipping. | Deferred; in known issues. |
| 10 | Claude complete-session: earlier 0/1 hidden palm pixels unverifiable. | Retained targets reproduce 0/1 versus 27/21 exactly. | Corrected. |
| 11 | 2026-11-01 custom skeleton: managed custom motion via MCP only. | 2026-11-02 REST contract capture supports `action_description` plus `animation_group_id`. The vendored OpenAPI snapshot is stale for `/characters/animations`. | Superseded; folder README and known issues note it. |
| 12 | Raw skeleton pricing: round 4 measured 12 frames at 3 gens; round 5 says 9 to 12 frames verified only on 64 to 96 px. MCP documents 3 gens for 4 to 14 frames. | PixelDoll reserves 4 gens at 13 to 14 frames. | Unverified boundary; no 13/14-frame receipt. |
| 13 | Compact 240x240 repair estimated 10 gens by area. | Published narrow-canvas prices and orientation-dependent inpaint prices contradict an area-only rule; one live run reported $0.08 cash, not gens. | Estimate unqualified in generations. |
| 14 | Tool review: live output on the 240x240 layout unverified. | Deep review ran one compact repair (prompt mislabeled the reference color). | Partly superseded; matched control still missing. |
| 15 | Motion spike inferred PixelSprite FX auto-fit can miss extrema (source). | Native follow-up executed it: one-frame extension lost in six directions with no border contact. | Confirmed natively. |
| 16 | Civitai archive: HTTP 401 (generation spike). | Native follow-up: 10,148-byte HTML. Local `spikes/api/out/review-20261106-civitai*.zip` files are 106-byte error bodies. | Same conclusion, still blocked by login. |
| 17 | Offline conditioning: shared luminance profile removes drift; rebuilt source is exact. | Live trials: no consistent generated-cloth gain; one shared-ramp clip failed G3; canonical skeleton source gave no visual gain. | Offline input wins did not transfer. |
| 18 | Claude proposed universal 15% adjacent-frame continuity limits. | Rejected by both reviewers and later by Claude. | Candidate-specific authoring hypothesis only. |
| 19 | Native frame authoring called the axe controls corrected. | Owner rejected the perched grip; palm-grip correction supersedes the interpretation. | Superseded. |
| 20 | `ultima_online_paperdolling.md` draw order and layer names. | Its own header and the verification document (ClassicUO source) correct them. | Superseded. |
| 21 | `known-issues.md` dates the OpenAPI snapshot to 2026-10-20. | The 2026-11-06 provider audit rechecked the live schema (same 102 paths, managed descriptions evolved). | Minor staleness; not contradictory. |
| 22 | Live-trials evaluator supplies the standing palette to G6. | Capture-time `poseItemClip` omitted it. | Documented methodological difference; no verdict change reported. |
| 23 | Chroma spike: G2 passes repainted skin classified as item. | No later fix; stencil only helps when a trusted mask exists. | Open gate limitation (not listed in known issues). |
| 24 | `manifest-spec.md` invariant 12: two `baseCut` items worn together cannot be represented, export only warns. | Code bakes combined body-cut variants (`underAll`) capped at 256 (`compose.ts:59`, `export.ts:21-22`). | Spec stale (the Item type also lacks `underAll`). Added by the completion pass. |
| 25 | `manifest-spec.md` 2.1 and the shared-equipment plan: held layers are 96 x 96 at `rig.pivot + 16`. | `padOf` pads 16 px per side of the current cell, capped at a 256 canvas (`items.ts:128-130`): 80 to 112 by default. The weapon-aware grip report says a universal 96 is wrong. | Spec text describes legacy 64 px rigs only. |
| 26 | B14: tucking commutes with the mirror flip, so mirrored rows stay flips. | Codex challenge F4: the nearest-column fill is not reflection-symmetric; Studio west differs from baked export west by 6 px for disjoint covers. | Doc versus doc; current tuck code not rechecked. |
| 27 | Architecture section 6: new bare bases have no garment grays, so B15 shirt/shorts tagging does not apply. | Studio axe import and the shared-equipment Ranger both show the blue-LSB tag changing dark low-chroma pixels on bare or imported bodies (8 to 45 values per frame). | Architecture claim too strong; harmless for export swaps but breaks byte identity with native source. |
| 28 | Architecture section 2 and S4: Pro Flash and Pixen editors allowed for drafts; managed text `v3` as a fallback. | AGENTS.md lists only edit-animation-v2, inpaint-v3 and transfer-outfit-v2 for edits. App code calls none of the Pro Flash or Pixen editors. | Documentation conflict, no code impact. |
| 29 | Architecture sections 5 and 6 and the shared-equipment plan section 8: old records are migrated on load; v1 to v2 migration. | AGENTS.md forbids migrations; no migration code found under `app/src/lib`. Readers accept `pixeldoll/1` instead. | Documentation stale. |
| 30 | S5 held gates: border px = 0 (re-roll) and key outside <= 0.10. | Body-quality audit made border contact a review observation; `GATES.keyOutsidePosed` is 0.05 (`items.ts:764`). | S5 gate table is historical. |
| 31 | Inpaint price by area band (`gridEstimate`, comment cites 384x288 = 15 and 480x384 = 25). | The 2026-10-28 frozen-frame grid probe (448x112, area under 256 squared) billed 15, estimated 10. The lab raised its reservation; production was not changed (`items.ts:72`). | Open estimator miss; extends row 13 with a second receipt. |
| 32 | Pipeline review sections 6, 17 and 18.3: idle item frames are posed with the "walking" caption, unchanged by decision. | True for packed idle+walk calls at item creation (`callAnim` picks the majority move, `items.ts:164`, `:54`), but per-move poses (`poseItemClip`) now send "breathing idle" (`clips.ts:29`). | Partly stale; one item can carry both captions depending on how idle was posed. |
| 33 | Repos review flaw 9 and the first-pass spot check: no loop-seam diagnostic in `app/src`. | Held items now record a review-only seam observation (`heldLoopReviewClips`, `items.ts:899`, `:988-1013`). Body clips still have none. | Narrow the claim to body clips. |
| 34 | 2026-11-01 custom skeleton: managed custom output is 96 x 96 for a 64 px source. | 2026-11-02 starter pack: per-direction canvases differ (north 96, others 112 for an 80 px source). | Canvas is per direction and per source size; no fixed managed canvas contract. |
| 35 | Codex challenge F2, F3, F5 (flat dress price, exact copy drops `baseCut`, `chartreuse` keyed out with a clean pass). | Fixed: `editGens` by canvas (`items.ts:254`), cut remapping in `equipment/copy.ts:47-62`, `chartreuse` in the green word list (`chroma.ts:37`). | Resolved. F1 only partly (see the code list below); F4 and F6 not rechecked. |

`proper_paperdolling_in_pixellab.md` describes the unrelated Android PixelLab text editor and is marked irrelevant.

## Experiments named by prior research and never run

Grouped by mechanism. "Partly run" names what was covered. Free means no generations.

### Occlusion, ownership and depth

1. Visibility benchmark with explicit owners (near/far hand, hair over shoulder, cape over far arm and behind near arm, shield, weapon, mirrored and asymmetric views, sitting, prone), exported through every engine. Geometry experiment 2. Free.
2. Three-mask pilot on one approved item (edit permission, reviewed owner with uncertain state, reviewed depth), qualified with a held-out combination and outer-cover removal. Modern ownership pilot, native follow-up depth experiment, deep review priority 5. Free, then paid.
3. Per-pixel depth labels from artists or trusted geometry for hand pixels, cape sides and mirrored offhand items. Ownership follow-up.
4. Per-item artist depth escape hatch on a flagged frame. Geometry experiment 5.
5. Item-level layer order across preview and engine exports, including mutual-hide precedence. Layering rank 2. Free.

### Repair masks and conditioning (paid)

6. Conservative spatial repair masks: neighbor union plus recorded cuts on rigid headwear, 3-pixel neighbors on close-fitting garments, broad band for capes. Deep review priority 4, conditioning, provider ranked 4, generation spike rank 2, motion spike rank 2. Offline selection done; no paid A/B.
7. Hybrid editable union mask versus broad mask, measured per billed generation. Geometry experiment 4.
8. Matched 320x240 versus 240x240 compact repair with a correct item description. Deep review.
9. Raw versus rebuilt skeleton source on a second wearer and a strongly occluded attack with three seeds. Provider ranked 1. Partly run: east Walk only.
10. Transfer versus anchored edit on crossed-arm or prone poses. Provider ranked 2, generation spike rank 4. Partly run: Walk only.
11. Pose-similar approved frame as a second reference. Vision experiment 4, provider.
12. Provider palette on a held-out body and a high-occlusion action, on grid repair and on padded weapons. Target-palette pilot, provider ranked 3. Partly run: Walk, two designs.
13. Chroma profile with headroom for low-span imported bodies, and restricted skin keying. Conditioning, chroma spike rank 3. Free offline first.

### Quality gates and review (free)

14. Body loop-wrap diagnostic in `clipQa` with absolute and relative terms. Generation spike rank 1, tool review, repos review flaw 9. Not implemented.
15. Defect set beside the frozen benchmark: protected eyes and hands, cropped weapons, rear and front hair, one-pixel details, fringes, mirrored views, total loss of an off-canvas part, and the G2 repaint blind spot. Vision experiment 2, native follow-up.
16. Batch-composition independence for temporal cleanup. Geometry experiment 1. Clip-local fix done; batch parity not.
17. Per-frame body review candidates (arm disagreement, wrist error, frame palette outlier) with visible-side contact. Deep review priority 6.
18. Weapon polarity as a qualified warning on one-ended blades. Vision, ownership follow-up.
19. Reference-to-failure side-by-side review and protected-pixel overlay. Generation spike rank 3, chroma spike rank 1, layering rank 1.
20. Rigid translation plus rotation projection as a free headwear preview or repair candidate. Geometry experiment 3, motion spike rank 3.
21. Runtime anchor tracks in exports, runtime dye on RGB material tables, and cape/pack/quiver slots. Layering ranks 3, 5 and 6.

### Weapons, motion and pricing

22. Held weapon with independently labeled grip and polarity in a matched trial. Live trials.
23. Inner garment with the outer cover removed. Live trials, modern ownership.
24. Offline authoring pass on the east axe (raised palm off the skull, f6/f7 reconciled with f0). Claude complete-session.
25. Palette snap of x28 disarmed frames to separate re-quantization from geometry. Claude 2026-11-02 response.
26. B15 recolor flicker check (H1). Complete-session counter-review. Free.
27. 13- and 14-frame raw skeleton receipt, inpaint orientation price study, and 12-frame pose price at 160 px. Provider, round 5.
28. Prompt grammar canary with enough seeds to separate wording from provider noise. Rounds 3 and 4.
29. Cross-reference stored measured keypoints for posing. Round 3, offline check first.
30. One-frame extremum added to motion-reference qualification. Native follow-up.
31. Concept-image items for a held item and a full outfit before release. Round 1 follow-up (planned Later on the board).

### Added by the completion pass

Free unless marked paid. Items that overlap an earlier number say so.

32. Inpaint-v3 price audit by canvas shape: reconcile the 448x112 = 15 receipt with the area-band `gridEstimate` and the 240x240 case (row 13). Free from retained receipts, then a bounded paid shape study only if receipts cannot decide. 2026-10-28 targeted authoring.
33. Design-palette gate against the dressed keyframe for ordinary item creation and Add a move (pass standing palettes instead of the first pose call). Codex challenge F1; this cycle's code map issue 8.
34. Reflection-symmetric tuck rule tested through preview and every exporter with disjoint covers, unequal brims and equidistant columns. Codex challenge F4.
35. Registration restricted to surviving mannequin support, ablated on stored raw outputs. Codex challenge F6.
36. Same-body head-track shift of the dressed standing helmet for idle and walk, offline A/B against posed frames (helmets shimmer at 0.88 to 0.97 IoU). Repos review flaw 10; overlaps item 20.
37. Shield east-walk grip and orientation transitions against saved keypoints before any more shield spend. Shields report.
38. Hair "sways with each step" caption and keeping hair strands within 2 px of the main shape (offline first). Pipeline review 10.2.
39. Head-to-head dress-once-then-pose versus real-frame dressing on the same body and moves; the review states it was never measured head to head. Pipeline review 18.2. Paid.
40. Managed custom skeleton-v3 (REST `action_description` plus `animation_group_id`) as a Studio Add a move source, with an authored pivot and canvas contract and one equipped clip. Starter pack, custom skeleton, workflow reconciliation. Paid.
41. Cross-body shared-equipment fitting beyond single-material headwear on 64 x 64 rigs; the default 80 px character cannot use the paid fit at all (`equipment/generate.ts:40`). Shared-equipment plan section 7.2. Paid.
42. Frame editor offline spikes S1 to S5 (task prototype with five casual users, coordinates and mirrors, draft recovery, body fitting, source color) and paid S6 candidate repair. Frame-editor research agenda.
43. Engine runtime execution of the Studio axe, shared-copy palettes and Unity `sortingOrder` ties (artifacts were only built and reimported). B14, shared-equipment, Studio axe reports.
44. Wrist `z_index` or depth to break side-view grip ambiguity (2 to 5 of 8 east frames ambiguous). S3; round 7 X1 tested depth on slash S only.
45. Three-step key ramp to free item palette slots (items get 6 to 8 colors). S2 and architecture O7.

## Coverage gaps

- **Item-versus-item occlusion on real provider output.** Every ownership probe is synthetic or uses external demos.
- **Temporal quality at playback speed.** All blind reviews used selected stills. No human artist labels exist; reviewers were model agents.
- **Cost per accepted clip.** No route comparison reports accepted clips per billed unit or wall time per accepted clip.
- **Body scope.** No research covers non-humanoid bodies, side-scroller cameras, or dressing above 128 px. The large-size dresser is a deferred decision.
- **Layered garments generated together.** Nothing tests dressing an outer item over an existing inner item with the provider.
- **Hair front/back on real output.** Only a three-pixel synthetic probe exists. Secondary motion of hair and cloth is untested beyond capes.
- **Shared equipment across bodies.** Paid fitting is qualified only for single-material headwear.
- **Provider drift.** Nondeterminism was measured once, on a single pair. Repeated-seed reliability per route is unmeasured.
- **Mirrored versus independent west equipment.** No matched quality comparison exists.
- **Accessibility and real-user testing.** The repair and review flows have neither.
- **Completion-pass notes on these gaps.** Nondeterminism was in fact measured more than once (S1, S3: 86 % identical raw and 49 to 60 % managed; round 4: 6 to 10 % different), but never per route across repeated seeds. The default 80 px character cannot use the paid shared fit at all (64 x 64 only). Equipped attacks remain unqualified on every route tried (skeleton posing collapses swords to 7 to 43 % of median area; frozen-frame inpaint preserves protected pixels but invents hands or drops axe heads).

## Claims the current code no longer honors

Checked against `app/src` on 2026-11-07. Each is also recorded in the entry's `codeContradictions`.

- `docs/manifest-spec.md` invariant 12 (export warns on two cutting items): code bakes combined body-cut variants up to 256 (`app/src/lib/compose/compose.ts:59`, `app/src/lib/export/export.ts:21-22`).
- `docs/manifest-spec.md` 2.1 (held layers 96 x 96, pivot + 16): `padOf` pads the current cell by 16 per side, 80 to 112 by default (`app/src/lib/items/items.ts:128-130`).
- `docs/architecture.md` section 5 slot classes and anchors (`head` class, `foot`/`hand` anchors, held bg z 5 in S/E/W only): code uses `rigid`, `foot_r`/`hand_r`, and adds SE/SW (`app/src/lib/items/items.ts:179`, `:183-197`).
- `docs/architecture.md` section 9 module table: misses `lib/equipment` and most of `lib/rig` and `lib/items` (`app/src/lib/equipment/index.ts`).
- `docs/spikes/S5_held_items.md` held gates (border = 0 re-roll, key outside <= 0.10): `GATES` has no border rule and posed key outside is 0.05 (`app/src/lib/items/items.ts:764`).
- Area-band inpaint price (implicit in `gridEstimate`): a 448x112 grid billed 15 but is estimated at 10 (`app/src/lib/items/items.ts:72`).
- Codex challenge F1 "fixed": ordinary creation and Add a move still take the palette reference from the first pose call (`app/src/lib/items/items.ts:864-866`, `app/src/studio/itemRoute.ts:53`); round 3 added only a warning against the dressed keyframe.
- Repos review flaw 9 ("no loop-seam check"): held items now have a review-only seam observation (`app/src/lib/items/items.ts:988-1013`); body clips still have none.
- Pipeline review "idle item poses use the walking caption" holds only for packed idle+walk calls (`app/src/lib/items/items.ts:164`, `:54`); later idle-only poses send "breathing idle" (`app/src/lib/rig/clips.ts:29`).

## Completion-pass spot checks (five most consequential claims)

| Claim | Source | Code | Verdict |
| --- | --- | --- | --- |
| Chroma extraction uses the S2 ramps and a ratio key score with threshold 35 | S2, architecture 4.4 | `app/src/lib/image/chroma.ts:29-31`, `:77` | Honored |
| Edit-animation-v2 frame caps 16/9/4 and canvas-tiered dress price 10/15/25 | S1, B16, Codex F2 | `app/src/lib/pixellab/routes.ts:66`, `app/src/lib/items/items.ts:254` | Honored (F2 fixed) |
| Held items pad 16 px around the shared pivot | S5, B9, manifest-spec 2.1 | `app/src/lib/items/items.ts:128-130` | Honored, but the spec's fixed 96 is stale |
| Two cutting items: export warns (manifest-spec invariant 12) | manifest-spec | `app/src/lib/compose/compose.ts:59`, `app/src/lib/export/export.ts:21-22` | Not honored: combined variants, cap 256 |
| Item design drift is gated against the dressed design | architecture 4.5, Codex F1 | `app/src/lib/items/items.ts:848`, `:864-866`; `app/src/studio/itemRoute.ts:53` | Partly: G6 still references the first pose call unless standing palettes are passed (anchored extensions only) |

Other confirmations: paid shared fitting is 64 x 64 only (`app/src/lib/equipment/generate.ts:40`); free copies now keep `baseCut` (`app/src/lib/equipment/copy.ts:47-62`); `chartreuse` keys away from green (`app/src/lib/image/chroma.ts:37`); move type is still inferred from the name (`app/src/lib/items/items.ts:763`); hidden items still hide other slots (`app/src/lib/compose/compose.ts:30-35`); the authored idle is still a 0 to 1 px bob (`app/src/lib/rig/poses.ts:68`); inpaint extraction is bounded by the submitted mask stencil (`app/src/lib/items/items.ts:343`, `:389-392`); the motion converter and starter presets are consumed only by the dev Motion Lab (`app/src/ui/motion-lab/`); no frame editor exists in `app/src`.
