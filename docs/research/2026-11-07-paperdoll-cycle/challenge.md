# Independent challenge of the 2026-11-07 spikes

November 7, 2026. Fresh reviewer for section 8 of the [improvement cycle](../../handoff/paperdoll-improvement-cycle.md). I did not author any spike. Scope: candidates A to E from [motion.md](motion.md) and [extraction.md](extraction.md), checked against production code, plus weaknesses the spikes missed. Offline only: no PixelLab call, no `app/` edit, no board change, no `.env` read.

Labels: **[repro]** I reran the researchers' script and got the same numbers; **[new]** measured by my scripts; **[source]** read in production code; **[inference]**; **[untested]**.

Scripts (repo root, `node <path>`; Node 25.0.0 was active, not the pinned 24.22.1; all integer image operations, deterministic):

| Script | Measures |
| --- | --- |
| [scripts/challenge/held-challenge.ts](scripts/challenge/held-challenge.ts) | A (rule variants, rotation sweep, grip-centered poles, small blades, occlusion excuse), B (G8 on the unmirrored bench), C (keyframe reach versus posed reach) |
| [scripts/challenge/rim-despill-challenge.ts](scripts/challenge/rim-despill-challenge.ts) | D across light, medium and deep skin on bench bodies A (64 px) and N (160 px) with modeled provider redraws; real-corpus additions scored against the bench `keep`/`drop` labels; E on constructed layers and the corpus |
| [scripts/challenge/cf2c-synthetic.ts](scripts/challenge/cf2c-synthetic.ts) | E variant CF2c on the extraction spike's synthetic ground truth |

Outputs: `C:/Programming_Files/Shilocity/PixelLab/checkouts/cycle-2026-11-07/challenge/` (machine-local).

Reproduction: `held-geometry-probe.ts`, `grip-mirror-check.ts` and `counterfactuals.ts` give exactly the tallies, separations and counts printed in the spikes **[repro]**.

## Verdicts

| | Candidate | Verdict |
| --- | --- | --- |
| A | Signed held-item orientation in G9 | **Accept with changes** |
| B | Pixel-center grip distances in G8 | **Accept with changes** (consistency fix, no verdict change on the bench) |
| C | Held repair disc from measured reach | **Accept with changes** |
| D | Rim guard restore (CF1b) | **Reject as specified**; a color-vetoed variant is a candidate after visual review |
| E | Despill keeps raw color (CF2b) | **Reject as specified; accept CF2c** (CF2b minus near-gray results) |

## A. Signed G9

**Reproduced.** Unsigned reversal blind spot 28/30 silent; oriented axis on blade locomotion real max 16.1, reversed min 163.9; blade actions real max 101.5, reversed min 78.5, 72/84 caught at 120 **[repro]**. Production skips G9 on every action (`checkShape`, items.ts ~973) **[source]**.

**New evidence** (held-challenge.ts):

- Rotation sweep of frame 3 about the wrist (6 blade locomotion clips; counts are production / spike rule / reviewer rule): 45 to 90 degrees 6/6/6; 150 degrees 5/6/6; 165 and 180 degrees **0**/6/6. On actions production catches 0 at every angle.
- Production's occlusion excuse (`heldVisibility`, which runs before a transition counts) excused **0 of 67** reversal transitions the signed rule flags. The excuse does not swallow the new check.
- Grip-centered poles (2 px staff along the real blade direction, grip at 15 to 50 % of the length, with and without hiding behind the body): 0 false fails in 546 transitions; the 25 % abstention covers grips from 35 % in full view.
- Small blades (the real blade kept within 6 or 8 px of the wrist, a dagger proxy): production already false-fails **7 of 42** valid locomotion transitions; the signed rule raises that to 10 (6 px) and 9 (8 px). At 10 px and above: 0.
- Forearm projection is never shorter than 3.6 px on the bench (9 of 120 frames under 5 px), so the foreshortening failure mode (forearm angle from a near-zero vector) is untested here, not disproved.

**Counterexamples.**

1. The spec "fail above 90 degrees on locomotion" is ambiguous. If it replaces the current unsigned 30-degree test, every 45 to 90 degree turn (caught 6/6 today) becomes silent. Use the signed difference with the existing `GATES.heldTurn` 30 when both frames are confident, the unsigned difference otherwise. Real blade locomotion peaks at 16.1, so one threshold suffices.
2. The bow's walk/east 0 to 1 transition is a confident 125.1 degree real pair (centroid at 46 to 48 % of the reach, well past the 25 % abstention). The spike's "0 new fails" holds only because that clip already fails G5+G9. The abstention does not make grip-centered items with asymmetric strings safe.
3. The 120-degree action warning rests on 42 transitions from two items and one move (slash), with an 18.5 degree margin over one axe frame. Keep it a warning.
4. Tiny held masks are noisy before and after the change (finding F3).

**Regression tests.** Unit on `evaluateQa`: a blade clip with one frame rotated 180 degrees about the wrist fails G9 on walk and warns on slash; the same clip rotated 45 degrees still fails on walk; a symmetric staff gripped at the center abstains; a mirrored direction gives the same verdict. Bench: `npm run bench` verdicts unchanged.

**Acceptance.** 0 new fails or warnings on the 20 bench cases; 78/78 blade locomotion reversals fail; the 45 to 150 degree sweep is still caught; small-blade false fails do not increase (needs F3 first or a minimum reach).

## B. Pixel-center G8

**Reproduced.** 11/120 decisions change under exact mirroring with index distances, 0/120 with centers **[repro]**.

**Challenge.** Mirror invariance of the centered version is a tautology: any self-consistent convention is invariant. The real argument is a convention mismatch: keypoints are pixel-edge coordinates (`flipSkeleton` uses `w - x`, `anchorsOf` floors), and `attachHeld` already measures from centers **[source]**. On the unmirrored bench the change alters per-frame decisions in 4 clips (for example a-sword96 walk/east `?RR??RR?` to `RRR??RR?`) but **0 of 15 clip hand decisions** **[new]**.

**Change.** Convert once at `handTrack`: anchor tracks (integer indices from `flipX(x) = w - 1 - x`) get +0.5, keypoint tracks stay continuous, and `nearest` always measures from centers. One convention instead of two branches. `rawKeyOutside.nearestWristPx` uses `nearest` too and moves by up to 0.7 px. The absolute 6 px contact and 2 px side margins remain unscaled (motion candidate 4).

**Tests and acceptance.** Unit: a one-column item 2.5 px from each wrist decides the same in a frame and its exact mirror, for both track sources. Bench verdicts unchanged.

## C. Held repair disc

**Evidence.** The default new character is a 64 px body (`newCharacterDraft`, characterConfig.ts), whose scaled blade reach is 39 px, already beyond the fixed 34 px disc (run.ts ~172). The clip by `clipToStencil` is silent **[source + repro]**. Keyframe reach predicts posed reach **[new]**: on passing clips the posed maximum exceeds the largest keyframe reach over all dressed directions by at most 0.9 px. The same direction's keyframe underestimates by up to 1.8 px (sword slash/south), and the failing a-axe96 slash/east exceeds it by 4.3 px.

**Downstream.** Safe for stored work: re-extraction decodes the submitted mask bytes (`inpaintStencils` with the job record), so existing repairs and their stencil hashes do not change **[source]**. A larger disc exposes more frozen body to the inpaint. G2 still checks the body. Provider inpaint pricing is per canvas, not mask area (provider.md, MCP contract), but that is **[untested]** for v3 REST.

**Change.** Radius = largest dressed-keyframe reach over all dressed directions + max(4 px, 10 %), capped by the canvas. **Tests:** unit on `gridRepairRequest` that the mask covers every dressed-keyframe pixel translated to each frame's wrist for 48, 64 and 128 px rigs. **Paid evidence** is optional: one held repair at 64 px with a G2 comparison.

## D. Rim guard (CF1b)

**Model.** Skin tones remap only the warm skin pixels of real bench bodies A and N by luminance rank (medium 196,136,98 to 112,68,48; deep 124,80,56 to 48,28,22). Outlines and clothes stay the same. This matches the Studio skin trait ("Deep brown", characterConfig.ts). Unlike the spike's RGB x0.42 copy, which `toChroma` normalizes back to the same mannequin, this changes the keyed mannequin. Body pixels under the dark clause (mean RGB < 60) rise from 39.0 to 56.4 % on A and from 27.1 to 41.7 % on N. Body pixels eligible for `absorbOutline` (keyed lum <= 0.3) rise from 42 to 62 % on A. Provider redraws use documented colors: olive 48,46,11 (S2) on the rim or on internal outlines, and 27,40,4 (T3) on dark key shades. Each skin and redraw case has 9 item cases: belt on the waist line, belt with buckle, belt off the line, black strap, necklace, baldric, mesh, 1 px holes and a no-item control.

**Results** (kept item px / false item px, summed over items; ownership by construction):

| Body, skin, redraw | prod | CF1b | CF1b + own-color veto | attached interior + veto |
| --- | --- | --- | --- | --- |
| A light, none | 362/390, 11 | 378, 11 | 378, 11 | 376, 11 |
| A deep, none | 355/390, 11 | 375, 11 | 373, 11 | 375, 11 |
| A deep, internal outlines olive | 365, 133 | 381, **221** | 381, 133 | 377, 133 |
| N light, none | 1728/1830, 71 | 1802, 71 | 1802, 71 | 1819, 71 |
| N deep, none | 1696/1830, 82 | 1785, 82 | 1785, 82 | 1812, 82 |
| N light, internal outlines olive | 1775, 485 | 1809, **1202** | 1809, 494 | 1821, 498 |
| N light, outlines olive 50 % | 1769, 165 | 1807, 204 | 1807, 168 | 1823, 176 |
| N deep, dark key to 27,40,4 50 % | 1755, 196 | 1800, 237 | 1800, 201 | 1815, 208 |

With no redraw, the false pixels are the 1 px holes panel's holes filled by `absorbOutline` (F5), identical under every variant.

**Counterexamples to CF1b.**

1. **Redrawn internal outlines come back as gear.** The chain rule (>= 6 px with an interior px) restores provider-redrawn mannequin lines. On the 160 px body false items rise from 485 to 1,202 px, and from 165 to 204 when only half the outline is redrawn; on the 64 px body from 133 to 221. The threshold 6 is the corpus maximum (5) plus one, so it has no margin, and lines lengthen with body size.
2. **A belt with a buckle**, the most common belt, stays at 11/19 on the 64 px body under CF1b (and under the chain-only and bridge-only variants): the removed halves touch only the buckle and are under 6 px. The same belt recovers on the 160 px body only because its halves are longer, so the rule is scale-dependent.
3. **Real labeled losses are untouched.** Production removes 9 px that the bench `keep` labels mark as item (a-sword96 walk/north/7, 5 px; a-axe96 walk/south/5, 4 px, haft pixels over the feet outline). CF1b restores none of them. Its 9 real additions are unlabeled.
4. **Skin tone matters, but modestly.** Production keeps 355 versus 362 (A) and 1,696 versus 1,728 (N) item px on deep versus light skin. CF1b narrows that gap; its added false items depend on outline redraws, not on skin tone.

**Alternatives tested.**

- **Palette witness:** restore when the color reappears in the kept item. It is perfect on synthetic cases but adds **342 real px**, including 45 on a-helmet and 79 on b-greathelm. These are the gray rim specks the spike visually confirmed as mannequin, and they match steel. **Rejected.**
- **CF1b + own-color veto:** do not restore a component that is mostly outline-dark (lum < 0.22). It keeps CF1b's gains with false items within +9 px of production (494 versus 485 on N), adds 6 real px, and frees the bow and stripe pixels while dropping b-cloak's 3 dark edge px.
- **Attached interior + veto:** restore a removed component with an interior px that touches kept item and is not mostly dark. Ring-only removals stay as production. It fixes the buckle belt (19/19), closes the skin gap best (N deep 1,812 versus light 1,819), adds 18 real px (0 on `drop` labels), and costs +9 to +13 false px under heavy redraw.

**Verdict.** Reject CF1b. Qualify one veto variant: visual review of its real additions (6 or 18 px), every bench verdict and `keep`/`drop` score unchanged, and the synthetic skin-by-size matrix above as a unit regression. Production's skin gap on the false-item side is small. Dark thin items on dark lines (the black strap) remain ambiguous by color and should be documented, not guessed.

**Independent truth wanted.** The ecosystem spike's rank 4 (composite LPC items on a keyed LPC body) can supply human-drawn bodies in several real skin tones at no cost. Use it before trusting any model of provider redraws, including mine.

## E. Despill (CF2b)

**Counterexample.** CF2b restores the raw color whenever nothing snaps, including where production deliberately neutralizes steel and outlines (the near-gray branch, chroma.ts ~182). The red item below has no gray core within 40:

| Raw px (green key) | prod | CF2b | CF2c |
| --- | --- | --- | --- |
| tinted outline 40,52,40 (score 23) | 40,40,40 | **40,52,40** (green tint returns) | 40,40,40 |
| tinted steel 120,136,120 (score 12) | 120,120,120 | **120,136,120** | 120,120,120 |
| dark fold 52,68,50 (score 24) | 52,52,50 | **52,68,50** | 52,52,50 |
| olive-drab gear 85,107,47, no sibling | 85,85,47 | 85,107,47 | 85,107,47 |
| 50 % red/key blend 85,108,31 | 85,85,31 | 85,108,31 | 85,108,31 |

**CF2c** keeps the raw color only when production's despilled color is not near-gray (chroma >= 16). It keeps every synthetic win (fern 78, jade 166, turquoise 254 exact) and changes **0 real px**. CF2b changes 41, all of them near-gray in production: n-cloak128 77,89,62 x31 and 100,130,103 x5, a-stripes-azure 44,46,71 x5. CF2c therefore needs no visual review of those 41. Neither variant fixes the olive-ramp collapse, which happens in the snap step (Chebyshev 40), nor spill blends. **Tests:** the table above as a unit on `despill`; bench keep-exact unchanged; G6 unchanged on all cases.

## F. Weaknesses the spikes missed

1. **Re-extraction reaches accepted work.** `chromaLayer` reruns on stored dressed outputs in `dressedKeys` (repair keys feed `repairDropped` pastes and `sizeFloor`), `gridReq` designs, `standingViews`, `designRestReferences` (equipment qualification and fitting) and `equipment/fit.ts`. Fit.ts uses the extracted mask to decide which raw dressed pixels it rewrites. Stored layers do not change. After any D or E change, a repaired clip, a fitted copy or a qualification can therefore disagree with the item's own approved layers. `evaluateItem` also re-extracts every landed draft output, so open drafts can change verdict after deploy **[source]**. Required: a before/after re-extraction diff of every bench keyframe and of the demo fixture `app/public/fixtures/s2`, listed per item.
2. **A false fail discards a paid repair.** `regridClip` saves only when `failCalls` is empty (run.ts ~749), so any new false G9 or G8 fail is wasted spend, not just review noise **[source]**.
3. **Small held items already false-fail G9** (7 of 42 dagger-proxy transitions). The 6 px mask floor and the round-mask abstention do not cover short, blobby blades near the fist. This proxy is not a real dagger. A real small held fixture should precede A. A minimum reach (for example 10 px at 64 px) for any axis test is the likely fix **[new, synthetic]**.
4. **The rim guard cannot see a contiguous redraw.** A candidate needs at least 2 key 4-neighbors, so a fully redrawn olive silhouette ships as item. That is 166 false px on a 64 px cell **[new]**, and G2/G3 cannot object because they exclude item pixels **[source]**. No variant fixes it. How often the provider does this is **[untested]**. My corpus probe for surviving olive ring pixels was confounded by legitimate dark olive gear (n-cloak128's designed shadow), so no claim either way.
5. **Holes in garments fill on every skin tone.** One-px holes over the body become item: 11 px on A, 71 (light) to 82 (deep) on N. The spike treats this as an inherent `absorbOutline` ambiguity. It is mildly skin-dependent and should be documented as a limit.
6. **The spikes' metric choices.** CF1b's threshold equals observed max plus one. The motion acceptance "0 new fails" passed partly because the only confident grip-centered real pair sits in an already failing clip. Both repeat the section 8 lessons: the evaluation cannot use the same cases that set the threshold. The `keep`/`drop` labels in `cases.json` are the independent truth the extraction spike did not use.

## Re-review of implementation

November 7, 2026, uncommitted working tree. I reran the scripts against the implementation and added: [signed-shapes.ts](scripts/challenge/signed-shapes.ts), [qa-reasons-repro.ts](scripts/challenge/qa-reasons-repro.ts) and [held-radius-check.ts](scripts/challenge/held-radius-check.ts). I did not run `npm run check`, `npm test` or e2e. Those results are the coordinator's.

**Confirmed**

- **Bench:** `node scripts/bench.ts` passes all 20 cases, with keep, exact and fail counts identical to `docs/testing/bench.md`.
- **Motion probe:**
  - Reversal about the wrist: 6/15 fail (every sword and axe walk), 1 warn, 8 silent (actions and the bow).
  - Controls: 45/45 silent. Baseline verdicts are unchanged.
  - Mirror with labels kept: now identical to the baseline (a-sword96 walk/east no longer warns G8).
- **Alignment condition (`|along| >= off/sqrt 2`):** it does not hide reversals of hooked, curved or off-axis shapes. Decisive in 24/24 rotations at 1x and 2x scale: axes with one-sided heads up to 10x26 px, crescent axe, hammer, war pick, mace, sickle with a 4 px shaft, khopesh, scimitar, spear gripped at a third, torch. A bow gripped at the middle abstains 24/24 (offset rule). A synthetic kite shield strapped near its edge is also decisive, so the condition covers the stored shield clip, not shields in general.

**Defects**

1. **A test assertion was silently deleted.** In `app/test/unit/held-raw-key-review.test.ts:57` the new trailing `//` comment swallows `expect(raw.space).toBe('raw-output-cell');`, which now sits inside the comment ("...corner distanceexpect(raw.space)..."). Fix: move the comment or start a new line.
2. **`qaReasons` uses the wrong G3 limit for skeleton items' standing views.**
   - Production gates every cell of a `method: 'skel'` draft at `keyOutsidePosed` (run.ts `kOut`). `poseItemClip`, `regridClip` and `equipment/generate.ts` always do the same.
   - A skeleton item's dressed standing cells carry route `ea2`, so `qaReasons` judges them at 0.02.
   - Repro (`qa-reasons-repro.ts`): a standing view with key outside 0.04 that warned only for G7 lists "Some body pixels were changed by the model".
   - The new unit test "key outside is judged against the limit of the route" encodes that assumption.
   - Fix: derive the limit from `Item.route` (`skeleton-pose` means posed limit for all cells), with the cell route as fallback only for legacy items.
   - The same pattern names G2 from `minKeyKept < 0.97` alone, while the gate also needs more than 8 lost px; the summary does not store lost px. This mislabel exists only on parts that warn for another reason.
3. **Docs still contradict the code.** In `docs/architecture.md`:
   - ~line 182 still says held masks use a 34 px radius.
   - The round 3 *Despill* bullet (~225) omits the new own-color rule.
   - The Shape (held) row (~264) still describes only the unsigned axis.
4. **A displaced doc comment.** The new `HELD_SIGNED_REACH` sits between `isAction`'s JSDoc and `isAction`, so `isAction` lost its comment and the constant carries two.

**Non-blocking**

- **Contact warnings:** pixel centers shift them slightly. A 3 px detachment is now silent in 15/15 clips (was 14/15). A 4 px detachment warns in 2/15 (was 1/15).
- **Small held items:** the existing unsigned false fails on items within 6 to 8 px of the fist (7/42 in the dagger proxy) remain. The 10 px reach floor is absolute, so at large bodies small blades become signed. That is safe by the earlier r >= 10 measurements, but not scale-aware.
- **Repair radius:**
  - It is computed on the raw `chromaLayer` mask, without `attachHeld`, so a detached 2 px off-body fleck in a dressed view widens the disc toward the canvas diagonal.
  - On the bench every held radius stays at the 34 px floor (48 px bodies), even with a 2 px speck on the farthest body pixel. Body specks are bounded by body extent, which is comparable to blade reach.
  - The disc already covered most of the body before this change; G2 remains the body guard.
  - Measuring only the largest component plus its attached parts would be more robust.
  - The new grid-repair unit test is the only check that the radius grows; no fixture exercises a 64 px or larger body.
- **Despill:**
  - Idempotent, since own-color px keep tint above 10 and are recomputed to themselves.
  - The changed blue-key expectation (95,130,40) is the intended CF2c behavior, not a weakened test.
  - Bench keep-exact is unchanged.
- **Docs that are right:** the Add idle + walk, grid fallback and key-switch corrections now match the code and tests.
