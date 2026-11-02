# Claude challenge review: PixelDoll motion and paper doll quality (response to the 2026-11-02 handoff)

Reviewed: branch `codex/motion-lab`, product head `0acd88ab` (the reviewed checkout's HEAD `592e3dfe` adds only the
handoff document; the branch has since moved to `6631fb1c`, which this review did not inspect). Reviewer: the Claude
paper doll optimization session, using three read-only sub-reviews plus its own checks. Nothing in the application was
changed and no generations were spent. Review evidence (scripts, contact sheets, probe tests, prototype diff) is kept
locally in the ignored folder `spikes/api/out/claude-review-2026-11-02/` of the main checkout
(`C:\Programming_Files\Shilocity\PixelLab\PixelDoll`).

## Plain-language verdict

- **Definitely improves the app: keep the mask-containment patch.** No containment, provenance or cache defect was found.
  Two small fixes belong before merge (copy two arrays in the extraction cache; document and test one changed failure
  mode). A separate, older problem it exposes (valid weapon pixels dropped inside the allowed edit area) has a tested
  prototype fix that should land after one more weapon family is available as a fixture.
- **Reject:** the 737 axis repair (agreed with Codex, and its target was itself questionable); treating the "full-eight"
  736 hatchet family as a preset candidate (it is a splice of two jobs on two slightly different bodies, and the handle
  visibly changes thickness and length at every seam); and two of my own earlier claims (armed/split "recomposes into the
  armed animation" and the "0 body pixels differ" page), which were overstated or wrong.
- **Is the research route worth continuing?** Only for one bounded discriminator, then stop. One body, one view, one
  weapon and eight frames cost about six calls, about 110 units and a few hundred expert pixel decisions, and the result is
  still a research control. That does not scale to casual users or to many weapons.
- **Highest-value next action:** merge the patch with the two small fixes, then run the offline seam and palette checks in
  the plan below before deciding whether the single paid discriminator is worth 25 units.

## 1. Inspection record

**Fresh work in this review (reproduced, not taken from reports):**
- Production patch: `git show` of `d7b95556`, `edfe7735`, `4f050598` and the diff `d4c5785f..0acd88ab` for `app/src/lib`
  and `app/src/studio`. Code read: `extractCell`, `clipToStencil`, `postProcess`, `attachHeld`, `inpaintStencils`,
  `evaluateItem`, `gridItemClip`, `extractOnce`, `app/src/lib/image/hard-mask.ts`, `chroma.ts` (`dropKeyOutline`,
  `absorbOutline`).
- Tests in an isolated `git archive` copy of `app/` with `npm ci`: `npm run check` clean (344 files); targeted
  `item-stencil`, `automatic-recovery`, `grid-repair`, `held-raw-key-review`, `fixed-inpaint` 89 passed; full `npm test`
  126 files, 1,403 passed, 1 skipped (after adding two non-app files the archive omitted: `docs/testing/bench.md`,
  `.github/workflows/pages.yml`). Node was v25.0.0, not the pinned 24.22.1. Ten new probe tests and a prototype (see 4).
- Evidence re-measured from native PNGs with independent scripts: 736/733/737/734 protected-pixel exactness, the 734
  frame 5 region, 737 head components and axes, 736 new key pixels, 733 areas, the f4 to f5 reach change, managed B foot
  landmarks, and all eight 736-family composites rebuilt from layer plus frozen body (0 pixels different from Codex's).
- My own earlier workflow re-audited from `spikes/api/out/x28/` (all 16 armed/split pairs, 25 real-frame dressing
  calls, the skin content of every weapon layer).
- Contact sheets at 4x to 10x of composites, green outputs, item layers alone, 737 versus 736, and managed B versus raw
  A/C, inspected by eye.

**Documents read in full:** the handoff; `2026-11-02-weapon-aware-grip.md`; `2026-11-01-workflow-reconciliation.md`.
Skimmed or used through the newer reports: `2026-11-01-custom-skeleton-v3.md`, `2026-10-28-motion-targeted-authoring.md`.
Not read: the two `-results.json` files in full (sampled), the October 27 to 28 motion documents beyond their summaries.

**Not accessed or not possible:** continuous playback (all motion judgments are from ordered stills; provider frame timing
is unknown and the 100 ms GIFs are illustrative); production wrist keypoints for the 736 family; real production
held-grid inpaint outputs (none are stored); end-to-end and browser selftests (not run); request payload images for the
older x28 rounds (the call log stores only base64 lengths; inputs were confirmed by re-encoding and matching all 27
lengths, which is strong but not byte-level proof); the motion-custom-v3 and motion-targeted image directories.

## 2. Claims audit

| Claim | Verdict | Evidence | Confidence | Consequence |
|---|---|---|---|---|
| 736: 107,254 protected pixels exact | Agree | Re-measured, full RGBA including hidden RGB | High | Verifies the inpaint contract ("black = preserve"), not quality |
| 733 / 737 / 734 protected pixels exact | Agree | 65,310 / 82,267 / 106,413 all exact | High | Same: plumbing, not quality |
| 734 frame 5 invented a 114-px rear-leg region | Agree | Independently defined as the new connected opaque component, x58-72 / y85-103; Codex's correction mask equals it | High | Disarm and completion edits invent posterior anatomy; frozen bodies must not inherit it |
| 737 head components 24 / 54 versus 85; axis 82.93 to 1.74, 51.48 to 2.19 degrees | Agree | Re-measured | High | 737 rejected |
| 737 head distal extent 31.12 / 28.37 px | Roughly agree | 29.71 / 27.01 head only; 31.36 / 27.88 all pixels | Medium | Definition-dependent, conclusion unchanged |
| "Full-eight 736 hatchet family" | Disagree with how it is presented | `weapon-aware-full8-inspection.json`: frames 0/2/5/7 from job 736 on B-star V2, frames 1/3/4/6 from job 733 on the earlier disarm body (differs from V2 by 0/0/1/18 px in f1/3/4/6) | High | Per-job gates do not certify the clip; seam popping is unmeasured (finding F1) |
| Visible grips read in 0/1/3/4/5/7 | Partly disagree | Clear fist and handle on both sides only in f3/f4; f1 and f5 partial (f5 holds the butt end, rear extent +2.2 px); f0/f7 show no fingers; f2/f6 hidden | Medium (art judgment from stills) | Grip quality is weaker than reported |
| f4 to f5 front reach +45.3% | Agree on the number, add cause | Rear handle extent goes from -8.75 to +2.24 px: the handle slides about 9 px through the fist | Medium-high | A popping defect, not perspective |
| Conservative extraction removed the white specks | Partly disagree | A pure-white pixel at (82,78) in the f4 (733) conservative layer survives into the deliverable composite | High | Unreported stray pixel in a "research family" frame |
| Managed B east toe (61,89), heel (52,89) / (53,89) in f4/5; south drawn-left toe 44 to 45 | Agree | Re-measured on all 8 frames | High | Accurate within scope; mostly the provider obeying zero foot offsets |
| Pivot "two pixels below the near sole at 105" | Minor | Row 105 is the last skin row and row 106 outline; the pivot is 1 px below the lowest opaque pixel | Low impact | Edge versus center convention; state it in the contract |
| Managed B is the best body candidate; A/C fail | Agree | Contact sheets: A/C east swings the arm backward horizontally, south raises it like a wave with torso twist; C east f1 has a detached streak | Medium | B is still weak: windup reaches only the top of the head, south reads as a salute, deep bowed crouch, mitten hands |
| Production patch contains equipment pixels and cuts on every path | Agree | Code read plus probe tests; no bypass found (section 4) | High | Keep |
| Raw-body observation should stay informational | Agree | It never changes status and survives merge, persistence and consent; Codex's warning benchmark (3 to 9, 1 to 7, 2 to 5) is a sound rejection reason | High | Keep informational |
| Codex: armed/split differs from the 16 originals at 737-1,064 (S) / 532-706 (E) px | Agree | Reproduced exactly, all six ranges | High | My earlier "recomposes into the armed animation" was overstated (section 7) |
| Codex: older real-frame edits did not use identical frozen-body references | Partly disagree | For x28/D each request used the same body frames the composite is laid over (200 of 200 frames); Codex stores no measurement for this point | Medium | Conclusion still right for a different reason: the edits do change the body (section 7) |
| Codex: skin inside a weapon layer is not an accepted shortcut | Agree | My split layers carry 3-21 skin-colored px per frame, up to 15 attached to the blade | High | Section 7 |
| My claim: "every AI editor paints over the face (kept 0.79)" | Retract | A bug in `spikes/api/x28/dress.mts register()` scored item pixels instead of key pixels and snapped to the -2,-2 search limit; unshifted hair keeps 0.93-1.00 of the key | High | The hair finding in research 16.4 is an artifact |
| My claim: real-frame route "0 body pixels differ / exact" | Retract | The metric counted every non-green output pixel as item and skipped it; actual output has 1-11 body pixels changed outside the item per frame (cloak walk) | High | Section 7 |

## 3. Prioritized findings

**F1. High, proven. The "full-eight" hatchet family is a two-job, two-body splice with visible seam popping.**
- Trigger: `weapon-aware-full8-inspection.json` composes 736 completion frames 0/2/5/7 with 733 frames 1/3/4/6. 733 was
  generated against the original disarm body, which differs from B-star V2 by 18 px in f6.
- Observed: six of eight transitions cross a job seam. Handle thickness is 2.11-2.74 px in 736 frames versus 1.85-1.97 in
  733 frames; non-neutral handle pixels 69-100 versus 53-57; whole-weapon length 25.2-37.7 px. f6 to f7 are nearly the
  same pose (axes -29.6 versus -25.1 degrees) yet length jumps about 15%. Head size is stable (80-90 px), so the head
  references worked and the handle did not.
- Expected: a clip candidate is judged as one clip.
- Fix: add a seam-continuity check (handle thickness, length along axis, head area, rear grip extent; within 15% between
  adjacent frames) and require it for any spliced clip, or qualify only single-job clips. Label the family "spliced".
- Disproved if: a single-job eight-frame result shows the same thickness and length variation.

**F2. Medium, proven on real 736 data, older than the patch. Valid weapon pixels inside the allowed edit area are lost.**
- Stage 1: `dropKeyOutline` (`chroma.ts:90-112`, anchor test 103-109) removes (67,79) and (67,80) in frame 7. This holds
  on the real skin base, not only the green base.
- Stage 2, larger and previously unreported: grid cells run with `posed:true`, so `attachHeld` (`items.ts:496-516`, line
  510) removes whole detached rear-handle parts that are below the 15% size floor and more than 3-6 px from the wrist:
  18 px in frames 0 and 2, 16 px in frame 7. The research probe used `posed:false`, which skips this rule.
- Reproduction: frame 0 has 183 non-key pixels inside the mask, 170 after post-processing; frame 2 159 to 142; frame 7
  164 to 162 after extraction and 147 after post-processing. Frame 5 loses only its three isolated white samples.
- Affected callers: every stencil-bounded held-item extraction (draft inpaint evaluation and grid repair).
- Fix: see section 4, stencil-only rules. Caveat: the authored grip was used as the wrist keypoint.
- Disproved if: real rig wrist keypoints sit within 3-6 px of these parts.

**F3. Medium, proven. A stray pure-white pixel ships in the f4 deliverable.** (82,78) in the 733 conservative layer, in a
transparent armpit notch, visible in the composite at 8x. The component floor removed four other white specks, so this
one survives through some rule difference worth a regression test.

**F4. Low to medium, proven on synthetic data, a behavior change of the patch. Exact coordinates turn a 1 px provider
redraw into a hard G10 failure.** With a stencil, `bestShift` is skipped (`items.ts:662`), but `shifted` is still computed
on the raw output (`items.ts:694`) and G10 (`items.ts:821`) is a hard fail; `regridClip` then refuses to save. Most exposed:
held grids, whose mask is a 34 px circle covering most of the body. No effect on the stored real frames (legacy offset 0
on all four completion frames). Fix: keep the hard fail (a body redrawn off by 1 px inside a protected area is a real
failure) but document it and add a unit test; measure on the first real held-grid outputs before release.

**F5. Low, aliasing proven, harm hypothetical.** `extractOnce` (`run.ts:360`) copies `layer` and `mask` but shares `stencil`
and `cut` between the cache and every returned cell. Fix: copy them.

**F6. Low, consistency.** `gridItemClip` (`run.ts:637`) builds stencils from the rebuilt `req.body` rather than the settled
record. It is correct today because the request hash covers the mask blob hash, but the `inpaintStencils` docstring says
"never a mask rebuilt from today's design". Fix: re-derive stencils from the settled record, or correct the docstring.

**F7. Info.** `stray` and `strayPx` now also count pixels removed by the stencil, which skews that diagnostic. Count stencil
removals separately.

**F8. Art judgment. Held-item hands: the frozen-body rule discards the hand the provider drew.** In 736 f0/f7 the provider
repainted 31 body pixels inside the editable area (16 still green) and added 3 green pixels by the handle; f0 also gained
9 posterior green pixels. The frozen body throws this away, so the composite shows a handle starting over the thigh with
no fingers. This is the November 1 grip failure in milder form, and it is the structural reason a weapon-aware body has
to be authored once per grip family. It also means that family will never come for free per item.

**F9. Experimental design. 737 aimed at a questionable target.** The reach target (21.93 px) is the median of the same eight
projections including the f3/f4 frames being repaired, and the "axis error" treats the source sword as ground truth. Yet
the sword's arc locks pointing down from f3 to f5 (rotation 2 to 3 about 171 degrees, then 11 and 0.5), while the
hatchet's own arc is a progressive chop (-113, -20, -50 degrees). The hatchet's arc is arguably the better motion.

## 4. Production patch review

| Area | Verdict | Notes |
|---|---|---|
| Mask ownership and validation | Keep; copy `stencil`/`cut` in `extractOnce` (F5) | Binary, canvas, identity, input, missing, hash, declared size, gray, alpha and canvas checks all produce clear G1 failures; an inline base64 mask in a record also fails clearly |
| Post-processing containment | Keep | Holds for the cut, `closeGrip`, `repairDropped` and both `clipToStencil` passes; no repair path bypasses the bound; `inpaint-v3` is built only in `gridReq` |
| Cache identity | Keep | A changed mask re-extracts; a mask corrupted after caching is still rejected |
| Restored jobs | Keep; F6 is a consistency fix | Drafts are validated from the saved record; accepted-item grids rely on request-hash identity |
| Raw coordinates and registration | Keep; document and test G10 (F4) | Raw output and base are never modified; held 96/112 canvases stay contained with zero offsets; 144 is refused before enqueue |
| Reference and unused-tail cells | Correct | A white reference plus a gray tail yields no G1 and no extra cells |
| Mirrored views | Correct | Cannot be grid-repaired; drawn by runtime flip |
| Raw-body observation | Keep informational | Codex's benchmark is a valid reason not to warn |

**Thin-fragment fix (prototype, isolated copy; diff at `spikes/api/out/claude-review-2026-11-02/patch-review/thin-prototype.diff`).**
Both rules apply only to cells with a stencil, so output without a stencil is deep-equal to current code.
- Rule A (extraction): restore a pixel `dropKeyOutline` removed only if it is inside the stencil, its luminance differs
  from the key-mannequin input pixel by at least 0.1, and it is within 2 px of a kept same-color item pixel (RGB 24).
- Rule B (`attachHeld`): keep a detached part only if it lies wholly inside the stencil, its centroid is within 3.5 px of
  the main part's axis through the wrist, it is on the opposite side of the wrist, and within 16 px of it.
- Results: frame 7 keeps (67,79) and (67,80) and ends at 165 px instead of 147; frames 0 and 2 keep their 18 px rear
  handles; frame 5's three white samples are still removed; 0 pixels outside the mask or on protected K/U; olive rim
  cases, a perpendicular smear and a speck past the blade tip are still dropped; all 1,403 existing tests and the check
  pass. Known weakness, documented by a test: an off-key brown outline pixel far from the base luminance is restored.
- Recommendation: adopt only after fixtures from a second weapon family confirm the thresholds, which come from one
  family of four frames. Rule B matters more than Rule A (16-18 px per frame versus 2).

## 5. Visual and motion review (stills, deliverable composites)

- **Grips:** good only in f3/f4; partial in f1 (fist on the skull, handle behind) and f5 (butt-end grip); implied in f0/f7
  with no fingers; hidden in f2 (pommel over the forehead) and f6 (handle appears to pierce the thigh, rear stub behind the
  buttock).
- **Design continuity:** head stable; handle pops at job seams (F1); about 9 px of handle slides through the fist f4 to f5.
- **Occlusion:** f0/f6/f7 handle passes "through" the hip; tolerable at sprite scale but ambiguous. No extra or missing
  limbs in the deliverable, because the frozen body discards the provider's posterior additions.
- **Action:** windup f1-f2 hold is fine; f2 to f3 is the fast downstroke (about 113 degrees); f3 to f5 is a progressive arc
  ending at the impact crouch. Weak: f0 to f1 jumps from rest to full overhead (a 180-degree flip, no anticipation frame);
  f5 to f6 jumps from deep crouch to upright. Durations could hide these; provider timing is unknown.
- **Body:** managed B is the best body but weak (hand only reaches the top of the head in the east windup, south reads as a
  salute, deep bowed crouch, mitten hands). B-star's hand-envelope skin differs from managed B by a median 40-50 per
  channel in 89/45/110 pixels (f0/f3/f6): it is an authored new asset, as Codex states.
- **Feet and root:** the near-foot silhouette stays within 1 px across the 8 sampled frames and the bottom row is identical
  in all eight. For an in-place flipbook that is the whole contact story. Nothing supports continuous or world ground
  contact, far-foot or south-heel contact, heel-toe roll, weight transfer or root motion. Needed before any locomotion
  claim: declared frame durations, an explicit root contract (zero for in-place attacks; root velocity matched to stance
  intervals for locomotion), engine pivot verification on a fixed ground line, and far-foot visibility or an explicit
  "unknown".

**Usability:** the 736 family is a research control, not a preset (splice popping, grip slide, stray pixel, hidden or
implied grips, single-frame pops, one view, one take, unknown timing, authored palette). An artist could hand-fix it in a
few dozen pixels, but that labor is the product question. 737 is rejected. Managed B is a research control and the best
available body candidate, not a preset.

## 6. Experimental-design critique

1. **Headline exactness counts verify the endpoint contract.** The repository OpenAPI snapshot documents inpaint-v3 as
   "white = generate, black = preserve". Exact black pixels prove plumbing and request construction, not body quality.
   "Frozen body unchanged" in composites is true by construction.
2. **Zero protected leaks in the conservative layer is by construction**, because the stencil excludes K/U.
3. **737 used targets derived from the outputs under test** (F9), with a ±15% band around that median.
4. **Grip landmarks are source-aligned estimates** with ±2-3 px uncertainty; "nearest candidate to grip 0.71-3.81 px" is
   within that uncertainty and shows proximity, not a grip.
5. **Hindsight curation:** B-star hand envelopes, the V1 to V2 removal of 18 px, 144 hand-recorded restorations in 734,
   2 C-prime specks, 50 B-star changes and 22 U labels were decided after seeing outputs. 736 used two 733 outputs as
   design references, so head continuity was partly engineered.
6. **Splice confound** (F1): per-job gates do not certify the composed clip.
7. **B versus A/C is not a renderer ablation:** motion authoring, seeding and canvas (112 versus 80 + 16) all differ, and
   B's feet are stable partly because zero foot offsets were requested. Codex states most of this; it should also be
   stated wherever B's foot stability is cited.

**What survives:** the patch's containment property; the 734 posterior-anatomy finding; the 737 failure; managed B as the
best of the tested bodies; the decision not to release an equipped attack preset; and Codex's correction of my armed/split
claim.

## 7. Reconciling my earlier workflow

- **Armed/split exactness (my research 16.3).** Codex is right; its numbers reproduce exactly. About 90-97% of changed
  pixels are common opaque pixels off by 32 or less: the disarm edit re-quantized the whole body (south bare frames have
  12 colors against 43-61 armed; 776-1,042 bare pixels per frame use a color absent from the armed frame; mean distance to
  the rest palette about 12 versus 0.1-1.6). Anatomy changes more than 3 px from the weapon are 9-35 (south) and 0-11
  (east) per frame; silhouette loss 0-35 / 7-27, mostly where the fist was redrawn; 0-11 hilt pixels lost. My statement
  that "bare + weapon recomposes into the armed animation" holds visually, not exactly, and the "0-3 non-body-colored px"
  side claim used a tolerance that hid the re-quantization. Consequence: a disarmed body is a new asset, never a drop-in
  for the armed frames, which is the same conclusion Codex reached with B-star.
- **Real-frame body-reference control (my 16.4, 18.2 and the "how items are drawn" page).** Codex's conclusion is right
  but its stated reason is not supported for x28/D: each request used the same body frames the composite is laid over
  (200 of 200). The real problem is that the edits change the body. Cloaks were nearly clean (0 erased, 0-5 new key pixels
  outside the body; one attack frame 39 erased / 69 new). Swords redraw the hand around the hilt every frame (14-23 new
  outside the body in south walk; attack frames up to 48 erased / 88 new). Hair changes 10-56 pixels with large shading
  shifts. No frame kept an exact green pixel. My "0 body pixels differ" figure was tautological and my hair "paints over
  the face" figure came from a registration bug. Corrected position: real-frame editing is the strongest evidence for worn
  cloth items; it is not exact, and it is weak for hands holding props.
- **Skin inside the weapon layer.** Codex is right: my split's weapon layers carry 3-21 skin-colored pixels per frame,
  up to 15 attached to the blade, which survive speck cleanup. I never flagged this.
- **User labor.** Both routes fail the casual-user test for held weapons. Mine relied on an inexact split with skin in the
  layer. Codex's needs hundreds of expert pixel decisions per family. For worn items, real-frame editing and the current
  pose route need no per-item labor.

## 8. Options comparison

| Option | Expected quality | Hidden surfaces | Art labor | Client-only fit | Licensing | Cost | Repeatability | Product disruption |
|---|---|---|---|---|---|---|---|---|
| Current skeleton pose route (keep) | Body fit inside the silhouette 0.961-0.984; stiff motion; weapons acceptable in idle/walk | None | None per item | Yes | Fine | 19-25 gens per worn item | Good | None |
| Managed custom body + frozen-mask equipment | Better action read for the body (B), still weak; grip fails without an authored hand | None | High per family | Works from the browser over MCP, but MCP is not a declared REST contract | Fine | About 110 units per family per view | Unknown, single take | High |
| Deliberate prop-aware family (B-star) | Best grips so far (f3/f4) but seam popping and slides | Partly authored | Hundreds of pixel decisions per family | Yes (curated offline) | Fine | Similar, plus authoring | Unknown | Curated presets only |
| Prepared cutout or mesh (DragonBones, Godot Skeleton2D) | Deterministic alignment; rotated pixel art steps unless parts are redrawn per angle | Authorable layers | Very high: PixelLab does not output parts | Yes (MIT runtimes) | Fine | Low per motion once authored | Excellent | A different product |
| Fitted 3D proxy | Deterministic motion and occlusion; output is not PixelLab-drawn pixel art unless only used as a motion source | Yes | Very high: 3D models per body and item | Offline only (Blender is GPL) | Per asset | Low once built | Excellent | A different product |
| Hybrid (recommended scope) | Worn items via the current route or real-frame edits; hair/helmets by tracked paste; held weapons only in curated idle/walk, no equipped attacks | None | Low | Yes | Fine | Current costs | Good | Small |

## 9. Minimal next plan (at most three actions)

1. **Merge the patch with F5 and F4 (no generations).** Copy `stencil`/`cut` in `extractOnce`; document and unit-test the
   G10 hard fail with exact coordinates; add a regression test for the f4 white pixel (F3); count stencil removals apart
   from `stray` (F7); fix the docstring or derive stencils from the settled record (F6). Pass: all existing tests and the
   check pass with no assertion changed; no-stencil output deep-equal.
2. **Offline checks that decide whether a paid test is worth it (no generations).** (a) The seam-continuity metric from F1
   on the 736 family, recorded as a failing baseline. (b) Rules A and B from section 4 validated on a second family built
   offline from stored frames (the x28 sword layers or the 733 conservative layers), then landed if they hold. (c) A
   palette snap of the x28 disarmed bare frames back to the rest palette, to measure whether re-quantization is the main
   split error (if snapping removes most of the 737-1,064 differing pixels, a disarm-based family becomes cheaper to keep
   consistent). Stop rule: if (b) needs threshold changes to pass the second family, do not land Rules A/B.
3. **One discriminating paid test, maximum hold 25 units, only if 1 and 2 pass.** B-star V2 bare-hand frames 3 and 4 with
   an independent prop guide and the actual 736 head references, no old-sword footprint, and an axis target taken from the
   hatchet's own progressive arc, not the sword. Pass, all required: largest head component at least 85% of the reference;
   at most 10 off-guide pixels; a visible grip in the composite; handle thickness and length within 15% of the adjacent
   736 frames; no new anatomy outside the frozen body after extraction. Fail any: stop paid equipment research, keep the
   hybrid scope in section 8, and record that equipped attack presets need prepared art. What would change the decision:
   a pass followed by one replication on another weapon (at most 25 units) before any new direction or body.

## 10. Implementation recommendations

- `app/src/lib/items/run.ts`: copy `stencil` and `cut` in `extractOnce`; derive stencils in `gridItemClip` from the
  settled record (or correct the `inpaintStencils` docstring).
- `app/src/lib/items/items.ts`: document the G10 consequence of exact coordinates next to the `bestShift` skip; count
  stencil removals separately from `stray`; later, Rule B in `attachHeld` behind "cell has a stencil".
- `app/src/lib/image/chroma.ts`: later, Rule A for `dropKeyOutline` behind "cell has a stencil".
- Tests: G10-with-stencil, aliasing, the f4 white pixel, and thin-fragment fixtures from the 736 frames plus a second
  family under `app/test/unit/` (not `test/fixtures/`, which widens the required end-to-end scope).
- Preserve: K/U protection, all global thresholds, no-stencil behavior byte-for-byte, the informational raw-body
  observation, Default-first creation and scope/cost-bound retry consent.
- Risk: low for the merge items; medium for Rules A/B until a second family confirms them.

## 11. Decisions that need the owner

1. Whether equipped attack presets are a product goal at all, given the measured labor per family.
2. Whether casual users get held weapons only in idle/walk (the hybrid scope) until a prepared-art route exists.
3. Whether a production dependency on PixelLab MCP from the browser is acceptable while it is not a declared REST
   contract.
4. Whether weapon-aware body variants (a new frozen body per grip family) are acceptable as separate assets.
5. Whether a prepared cutout or 3D proxy route is worth evaluating as a separate product line.

Engineering choices an agent can resolve: F2-F7 fixes, the seam metric, threshold confirmation, and test placement.

**Falsifiers.** F1 falls if a single-job clip pops the same way. F2's `attachHeld` loss falls if the production wrist
keypoints are within 3-6 px of the rear-handle parts. F9 falls if an animator judges the sword's locked arc correct. The
"stop after one discriminator" advice falls if action 3 passes and one replication also passes.

## 12. Final recommendation to Codex

- **Application patch (`d7b95556`, `edfe7735`, `4f050598`): accept and keep.** Fix before merge: F5 (copy `stencil`/`cut`)
  and F4 (document and test G10). Follow-ups: F3, F6, F7. Thin-fragment Rules A/B: defer until a second family confirms
  them. Readiness: ready to merge once those two fixes and the required checks pass.
- **Experimental presets: defer.** The 736 family is a spliced research control, 737 is rejected, managed B is a research
  control. None is ready for Studio. Do not release an equipped attack preset from this evidence.
- **Corrections to my own earlier work** (section 7) should be recorded in `docs/research/generation-pipeline-review-2026-10-25.md`
  16.3, 16.4 and 18.2, and in `docs/research/visuals/how-items-are-drawn.html`.
