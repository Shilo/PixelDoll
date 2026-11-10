# Challenge: the reviewed paper-doll workflow against PixelDoll

Date: 2026-11-09. Reviewer stance: skeptical. Inputs: the transcript of the demo video (phase 2c report, panels 01 to 09), the "Make gear" screenshot (dragon shield), and PixelDoll's code and research at `main` (`f4a0b0fa`). No PixelLab call was made. Two offline probes were run on PixelDoll's frozen benchmark (scripts next to this file: `hand-probe.ts`, `edge-probe.mts`; they import production helpers read-only).

Evidence labels: **[video]** stated in the other tool's report, **[seen]** visible in frames or screenshot, **[inferred]** my reconstruction, **[code]** PixelDoll source, **[research]** PixelDoll research doc, **[probe]** measured here offline.

---

## 1. Reconstructed pipeline of the other tool

### 1.1 Steps (screenshot) and what they most likely do

| Step | Their label | Likely mechanism |
| --- | --- | --- |
| 1 Body | "Upload or load a sheet" | A finished body sheet (stand, walk, slash; front and side views shown) is the frozen base, like PixelDoll's rig. [seen] |
| 1b Skeleton | "See and fix joints and masks" | Joints, probably from `estimate-skeleton`, plus a per-frame **body part map** (they mention "a mask from the body's part map" for hands, and "body parts the front piece owns"). [video, inferred] |
| 2 Anchors | "Mark the body parts" | Part labels (head, torso, arms, thighs, shins, feet, hands) used by their metrics ("most bare px per body part"), by the hide mask, and by the oval masks for the shield. [video, inferred] |
| 3-4 Describe | "Words, colours, price" | Prompt per piece plus a **fixed hue per piece** (shield: six greens, `#052108` to `#a0eea2`). [seen] |
| 5 Paint | "Design, then all frames" | (a) Worn pieces: one `edit-animation-v2` call per piece and view, 1 reference + 15 target frames on a keyed body, 10 gens. (b) Rigid pieces: one `inpaint-v3` 256 px 4x4 design sheet on the natural body with per-cell oval masks, about 10 gens, then "no frame sheets". [inferred from "15 frames, 10 generations", the 16-frame cap of `edit-animation-v2` at 64 px, and the screenshot] |
| 6-7 Check and fix | "Problems and your yes or no" | Pre-written pass rules per call (panel 06) plus user verdicts. [video] |
| 8 Review and colour | "All moves, all pieces" | Recolor by replacing the piece's fixed hue ramp. [inferred from "The colours are changed later"] |

### 1.2 Worn pieces (jerkin, trousers)

1. **Keyed body ("five tones of one loud colour").** The body sent to PixelLab is recolored to one loud hue (blue `#40aae6`..`#25709b` for the mage, purple about `#927EF6`/`#7041EF` in the reference forge) **quantized to five flat tones**. Body lines become a tone "between the others". [video, seen]
2. **Code-made reference ("reference forge").** No picture of the piece alone exists, so code takes part 1's painted standing frame of the whole outfit, removes the other pieces, fills the hidden area by carrying cloth along the limb from the nearest painted pixel, and draws dark lines at collar, cuff and ankle. This becomes frame 1 of the edit. [video]
3. **Palette lock.** "The palette holds only the body's five tones and the piece's own colours." Most likely `target_palette.colors` of `edit-animation-v2` (the only allowed-route parameter that does this; see `docs/research/pixellab/pixellab-openapi-v2.json`), possibly plus a post-hoc snap ("Through part 2's colour lock ... leather moved 4.7% between frames before and 2.5% after"). [inferred]
4. **One piece per call.** The words "name one piece and say nothing else is worn". One call per piece and view, 15 frames (stand, walk 8, slash 6), 10 gens. [video]
5. **Extraction.** Remove the five body tones (and the sixth limb-line tone) by exact color; what remains is the piece. "The cut removes it like the other five tones." [video]
6. **Hide mask between pieces (mixing).** When pieces from different outfits are worn together, pixels of a back piece that stick out **beside** a front piece, within 3 px of it, on body parts the front piece owns, are switched off. Pixels that cover body the front piece leaves bare are kept. [video]
7. **Limb line (built, not sent).** A sixth, much darker tone in the body's hue (`#004262`) drawn on the body's own line between an arm and the body behind it (12 to 43 px per side frame), and on border pixels of a forearm or hand with no drawn line (0 to 7 px). [video]

### 1.3 Rigid pieces (dragon shield)

- Design sheet: 16 cells, 256 px (4x4 of 64 px), on the **natural, skin-colored body**, with a black/white mask where white ovals (one per cell, around the forearm) "may be painted". This is `inpaint-v3` on a packed masked grid, which PixelDoll also uses (`inpaint-grid`). [seen]
- Prompt forces a single hue: "colour it ONLY in green shades (6 hexes) ... No skin tones, no brown, no red, no yellow on gear. The colours are changed later." So the **gear is the key**, not the body: on a pink body, "green = shield" is a clean classifier. [seen, inferred]
- "Pieces of this kind need no frame sheets, so nothing more is paid." and "80 of 104 frames are painted; the rest are design cells or exact copies." With zero further gens, the other 80 frames can only be produced locally, i.e. code places the design-cell shield on each frame by the forearm anchors (translate/rotate) or copies. That **contradicts** the phase 2c claims "0 frames animated by code" and "Nothing is moved by code", and the still-open owner question "a helm held to one drawing: allowed, or code animation?". Either the screenshot is a later build that adopted code placement, or the counter is mislabeled. [inferred; flagged]

### 1.4 Endpoints (inferred)

`edit-animation-v2` (worn pieces, 16-frame cap at 64 px, 10 gens, `target_palette`), `inpaint-v3` (design sheet, 256 px grid, about 10 gens), `estimate-skeleton` (joints). No sign of `animate-with-skeleton-v3`: every frame of a worn piece is dressed directly on the existing body frames (PixelDoll's "anchored" route), not posed from a keyframe.

---

## 2. Do their claims hold up on their own numbers?

| Claim | Verdict | Why |
| --- | --- | --- |
| "A piece painted alone comes back whole" | **Plausible, weakly supported.** | n = 2 pieces, 1 view (front), 1 seed, 15 frames each, judged in stills only ("I have not judged anything in motion"). The trousers failed **two** of their own pre-written rules (coverage 9/15 frames over; painted on hands 10/15 frames over) and the author overrode one by reinterpretation ("By the letter of my rule that reads killed. I do not read it so"). |
| "The whole pieces mix" | **Mixed.** | The pre-registered mix rule failed: 0/15 and 3/15 frames at ≤ 20 px bare. The two passing "new mixes" (14/15, 15/15) were chosen after the pieces came back. That is post hoc selection. |
| Bare-body metric | **Biased toward over-painting.** | "Bare body px" falls when anything covers skin, including trousers painted over hands (0 to 18 px), so the headline metric rewards an error. Skin that should show (raider's bare chest, throat) counts as a fault too; the author has to explain both away. |
| "The mask between pieces works, and it is small" | **Holds, and is negligible.** | 121 px switched off over 240 frames (0.5 px per frame); "bare body" unchanged on every frame. Their own audit showed the earlier 662 px "fault" was overstated about 5x. Also, panel 04's grid uses part 2's **cut** pieces (the "ranger jerkin" there is a strappy harness with 2,040 bare px), not the whole pieces of this phase, so the mask was not tested on the new lane. |
| "Darker limb line" | **Untested.** | Never sent. The outbound frames show the line as broken dashes and 3 to 5 isolated dots on slash 6 (the very frame it is for). Whether the model sees a few dots as an arm is doubtful. |
| "Every frame is PixelLab's. Nothing is moved by code." | **True for pixels, not for decisions.** | The reference is code-made, the hide mask removes pixels, the color lock snaps pixels. And the shield screen implies 80 code-placed frames (section 1.3). |
| Palette lock lowers drift (4.7% to 2.5%, 11.1% to 2.8%) | **Unclear metric.** | "Moved between frames" is undefined (pixel share? palette distance?). PixelDoll's own target-palette pilot shows exact palette membership is cheap to get and is not quality: it also collapsed 6,257 gear-color edges and failed 2 of 8 clips (see 3.1). |
| Cost "20 generations by the tools' receipts" | **Self-admittedly unreconciled.** | The balance went 34 to 0 with 14 attributed to another session, and credits fell $8.30 to $8.04 at the same time; the author read the balance only once. PixelDoll's ledger has the same class of unexplained balance moves (cycle README, line 61), so neither tool can prove cash cost from the balance; receipts are the only evidence. |
| "About 40 generations per outfit and view" | **Arithmetic holds, scale does not favor it.** | 4 pieces x 10 gens for 15 frames. At 4 views that is 160 per outfit, at 8 views 320, and every further 15 frames of moves adds 10 per piece and view (see section 7). |

General: one seed per call and PixelLab's own nondeterminism (PixelDoll measured 6 to 10% differing pixels on byte-identical requests, `docs/architecture.md` §4.1) mean a single pass "says it can work, not that it always does", as the author concedes.

---

## 3. Topic by topic against PixelDoll

### 3.1 Single-hue gear with later recolor vs PixelDoll's measured key and exact palette-ramp recolor

**Theirs.** Every piece is painted in one forced hue (six fixed tones); the user's color choice is applied afterwards by swapping that ramp. Benefits: extraction is trivial and certain (gear tones are known in advance and far from skin), recolor is an exact index swap, and in a whole-set call each piece could be separated by its hue.

**PixelDoll.** The item is drawn "in its own colors (no <key> on the item)" (`app/src/lib/image/chroma.ts:569-579`). The body is the key, chosen from the prompt (`pickKey`, `chroma.ts:70-71`) and after a collision from measured colors (`keyFor`, `chroma.ts:168-183`; used in `app/src/lib/items/run.ts:1196`). Materials are derived from the item's actual colors (`autoRamps`/`deriveRamps`, `app/src/lib/dress/palette.ts:80,130`), recolored by exact swap (`variantRamp` `palette.ts:155`, `indexImg`/`applyIndex` `palette.ts:179-188`). Posed frames are snapped back to owned standing shades with a boundary veto (`standingDyeMatcher`, `app/src/lib/dress/item-palette.ts:10`, called at `run.ts:1492`).

**Comparison.** PixelDoll is better on design quality and equal on recolor for single-material items; theirs is better only on extraction certainty.

- Design cost of one hue: the dye study labeled 45 materials on 27 real items; **14 items are multi-material** (cloth and trim, steel and gold, steel and wood, plumed helmets) (`docs/research/2026-11-07-paperdoll-cycle/dye-ramps.md` §2). A single-hue rule turns all of them into one material: the gold guard and steel blade, the shield's gold rim and green face become one ramp, and "no brown, no red, no yellow" bans leather, wood and gold outright. Hue contrast is also how small pixel-art details read; a 6-tone monochrome dragon shield loses that.
- Recolor: for a one-material item both tools do the same exact ramp swap. PixelDoll's `variantRamp` keeps the source's lightness steps, which is what their "colours are changed later" can do at best.
- Extraction: PixelDoll's key is the body, so a free item palette is possible; the residual risk is key collision, handled by the four keys plus the measured key. Their gear-hue key moves the collision risk to **dark outlines**: their "dark outline in the piece's own darkest shade" (`#052108`, near-black green) versus the body's near-black maroon outline differ in hue only at very low luminance. PixelDoll's hardest extraction work was exactly this class (rim guard, `dropKeyOutline` `chroma.ts:197`, and the LPC skin-tone fairness study).
- Palette lock: PixelDoll tested `target_palette` on the anchored edit route: exact membership on 64/64 frames, but 2 of 8 clips failed key gates and **6,257 previously distinct gear-color edges collapsed**; a free RGB-nearest baseline reached the same membership for $0 (`docs/research/deep-paperdoll-target-palette-2026-11-06.md`). Their 6-color lock is a smaller palette than PixelDoll's 53 to 65-color test, so edge collapse should be worse, not better.

**Verdict:** do not adopt single-hue authoring as a default. It trades the user's design for an extraction shortcut PixelDoll does not need.

### 3.2 Five flat tones vs the continuous luminance ramp, and the "limb line"

**PixelDoll.** `toChroma` (`chroma.ts:74-89`) maps every opaque pixel to the key ramp by luminance normalized over the cell's own opaque range, continuously (`RAMP`, `chroma.ts:45-50`: green G = 60 + 195t). A dark drawn line between arm and torso has low luminance and therefore maps to the darkest key shades, so it **is** preserved, as is any shading step between a forearm and the torso.

Measured here [probe, `edge-probe.mts`], over every local luminance edge (≥ 3/255) of the four frozen bench bodies:

| Body | Edges | Green step p10 / p25 / median | Steps < 10 levels | Edges merged by five flat tones |
| --- | ---: | --- | ---: | ---: |
| A | 28,155 | 12 / 28 / 50 | 6.3% | 20.9% |
| B | 47,330 | 12 / 19 / 37 | 3.0% | 28.7% |
| C | 37,847 | 11 / 19 / 34 | 7.1% | 29.7% |
| N | 94,681 | 10 / 16 / 30 | 9.9% | 33.6% |

This reproduces the earlier conditioning study ("five shades merged 22.2 to 38.4% of local edges that the continuous ramp preserves", `docs/research/deep-paperdoll-conditioning-2026-11-06.md` line 20).

**Verdict:** the limb line is a patch for damage their own five-tone quantization causes. PixelDoll already keeps the drawn line. The open question for PixelDoll is narrower: are the 3 to 10% of low-contrast edges concentrated at arm-over-body boundaries in side views (where "the model invents an arm")? That is a free measurement (candidate R2). A darker accent would also collide with `absorbOutline`'s dark-key rule (`chroma.ts:424-436`, key px with lum ≤ 0.3 are judged item or key by position), so any accent tone must stay inside the ramp.

### 3.3 Hand protection

**Theirs.** Not built. Trousers were painted over 0 to 18 px of hands per frame; the proposed cure is "our own hands stay in front of a leg piece (a mask from the body's part map)".

**PixelDoll.** No hand or face protection for worn items. Hands are protected only indirectly: an item px exists only where PixelLab drew a non-key color, and the G2 key-retention gate allows ≥ 0.97 or ≤ 8 body px lost (`docs/architecture.md` §4.5). Related protection exists only for heads (`headOcclusion`, `app/src/lib/items/items.ts:2705`, forearm over helmet) and held grips. Layer order puts every worn slot above the body (`SLOTS`, `items.ts:483-510`), and `splitFgBg` (`app/src/lib/compose/split.ts:17`) sends any item px on body alpha to the front layer, so a garment px drawn over a hand **hides the hand** in every composite and export.

Measured here [probe, `hand-probe.ts`]: extracted bench item px on body skin within a wrist-keypoint radius (3 px at 64 px, scaled), posed frames only:

| Case | Slot | Hand-zone skin px covered | Worst per frame | By view |
| --- | --- | ---: | ---: | --- |
| a-chest | torso_outer | 0 of 888 | 0 | none |
| a-boots | feet | 0 of 888 | 0 | none |
| b-tunic | torso_outer | 28 of 1,251 | 8 | S 6, SE 10, E 2, NE 10 |
| a-cape | back | 244 of 888 | 21 | N 243 |
| b-cloak | back | 324 of 1,251 | 34 | NE 62, N 247, E 10 |
| n-cloak128 | back | 1,037 of 3,400 | 134 | S 39, E 25, N 973 |

North (back view) cape coverage is correct occlusion. The rest (tunic 28 px, front/side cape px) is the same order of magnitude as their 0 to 18 px; some of it is legitimate sleeve cuffs inside the radius. The bench has **no trousers fixture**, so the case they found is not covered. **Verdict:** PixelDoll has the same gap, unmeasured where it matters most (legs, waist). Candidate R1.

### 3.4 Pieces painted alone vs cut from an outfit

**PixelDoll already paints one item per call on a bare keyed body:** the dress prompt says "Add only <item>" (`chroma.ts:569-579`); the skeleton route's description is "solid <key> mannequin ... wearing <item>, empty hands" (`items.ts:112`); the grid prompt "Draw the identical <item> on every animation frame" (`items.ts:296-297`); the input is the bare rest view keyed (`app/src/lib/equipment/generate.ts:264`, `app/src/lib/equipment/design.ts:219`, `items.ts:720`). New bases are fully bare (PLAN D25). PixelDoll never cuts pieces out of a painted outfit, so their whole part 2 problem ("a piece cut from a painted outfit only holds what was seen") does not exist here. Their phase 2c converges on PixelDoll's D3 design. **Same, PixelDoll got there first.** What they add is the honest observation that pieces painted alone can still leave **coverage gaps between slots** when mixed (jerkin hem to knee plates, furs without belt); PixelDoll has the same exposure and only checks within an item (`garmentBand`, `missingLowerGarment`, `app/src/lib/items/garment-coverage.ts`; waist band consistency, `design-consistency.ts`).

### 3.5 Hide mask between pieces vs compose, tuck and baseCut

**PixelDoll.** Fixed slot ladder with z per slot and per layer (`items.ts:483-510`); tuck-under only for declared pairs (`slot.clips`, hair under a helmet, `app/src/lib/compose/compose.ts:75-115`, `tuck` `:193`); `Item.baseCut` hides body px an item covers (ear tips under a hood, `compose.ts:138-160`, PLAN D22); `item.hides` hides whole slots; exports bake variants. Note `feet` z 20 is **below** `legs` z 30, so trousers always lie over boots.

**Theirs.** A 3 px "beside the front piece" mask, part-owned, evaluated on cut pieces, worth 0.5 px per frame.

**Verdict:** different, and not worth adopting now. Their own data (534 of 662 "past" px were correct layering) argues that most overlap is legitimate. PixelDoll's research found a visibility-only recomposition loses real garment pixels (304 px when an occluder was removed, `deep-paperdoll-review-2026-11-06.md`), and PLAN D25 rejected per-frame z-order. The only transferable idea is "tall boots over trousers", which is a slot-order choice (a feet item marked as covering the trouser cuff), not a mask; no evidence yet that users need it.

### 3.6 Design sheet on the natural body with oval masks (rigid items) vs PixelDoll's held route

**PixelDoll.** Held items: rest views padded by 16 px around the shared pivot (`padOf`, `HELD_PAD`), a red dot on the intended wrist (`items.ts:353-389`), dressed by `edit-animation-v2`, posed per clip by `animate-with-skeleton-v3`, then grip, signed direction and hand gates (G8, G9). Fallback and repair: `inpaint-v3` 4x4 packed grid with **whole-cell** masks for held items (`docs/architecture.md` §4.2, `items.ts:125`, `run.ts:515`). Every frame is generated; nothing is placed by code except the documented free paste of the keyframe on a frame that lost the item (R1 warning).

**Theirs.** Natural body (real anatomy as context, no "flat patch" problem), oval masks per cell around the forearm, single-hue gear as the extraction key, then frames 17 to 104 from local placement.

**Comparison.**
- The **tight per-cell mask** is a real idea: it forces the hand/side (PixelDoll's known side-view failure puts an off-hand item in the near hand, `docs/known-issues.md` lines 76-78) and stops stray painting. But PixelDoll's stencil study found tight masks lose real pixels (two-pixel support missed body cuts; four pixels missed over 20% of one valid cape frame), and a shield or blade that swings beyond the oval is clipped (`deep-paperdoll-conditioning-2026-11-06.md`, "Conservative spatial repair").
- **Natural body + gear-hue key** avoids key collisions but requires single-hue design (3.1) and is close to the diff route on a natural body, which measured clearly worse in PixelDoll (11 to 38 pinholes, skin slivers, a redrawn face baked into a helmet; `docs/architecture.md` §4.4, S2 X1).
- **Code placement of the remaining 80 frames** is the rigid-attachment approach PixelDoll already tried in the dev Motion Lab (rotate one source PNG about a grip); the owner rejected the hand connection as unconvincing, and the palm-grip follow-up did not promote it (`docs/research/2026-11-02-native-frame-authoring.md` line 5 and line 11; `2026-11-02-palm-grip-correction.md`). A rigid strapped shield is the most favorable case for it, but it still needs per-frame occlusion (forearm in front of or behind the strap) that one design cell cannot supply.

**Verdict:** PixelDoll's route is better on quality evidence and worse on cost for held items. Candidate R3 tests the one idea (forearm-local mask) cheaply.

### 3.7 Cost per item

| | Theirs | PixelDoll |
| --- | --- | --- |
| Worn piece, one view, about 15 frames | 10 gens (`edit-animation-v2`, 1 ref + 15 frames) | about 2 (share of one dress call over 5 views) + 3 (idle + walk pose, 12 frames) + 3 (one more move) = about 8 |
| Worn piece, Top-down 8 (5 drawn views), idle + walk | not stated; at 10 per view and 15 frames, at least 50 | about 25 (`docs/architecture.md` §4.1: dress 10 + 5 pose calls x 3) |
| Each further move, per piece and view | +10 per 15 frames (frame-bound) | +about 3 per pose call (call-bound; 12 frames cost 3 like 8) |
| Whole outfit (4 pieces), one view | about 40 | about 4 x 5 = 20 for idle + walk |
| Rigid/held item | about 10 total for 104 frames (16 painted, 80 placed by code) | about 50 (2 dress calls + 10 pose calls) on the default rig |

For worn items PixelDoll is about 2x cheaper per frame because skeleton posing is billed per call, not per 16 frames. For held items theirs is about 5x cheaper, but only because 80% of frames are not generated; that is a quality decision PixelDoll has evidence against, not an efficiency PixelDoll is missing. Their design sheet itself (16 cells, about 10 gens) is the same price as PixelDoll's grid call.

---

## 4. Candidate improvements for PixelDoll, ranked by expected quality gain per cost

### R1. Hands stay in front of lower-body garments (body part mask) **(rank 1; free; offline-provable)**

- **Hypothesis.** For worn slots that sit under the arms (legs, waist, feet, torso_inner, and back in non-north views), an item px on a base pixel that is visible hand skin is a paint-over error; dropping it (so the frozen hand shows) fixes it without generations.
- **Why it might help.** The base render is the source of truth for occlusion among body parts: if the base shows hand skin at a pixel, the hand is the frontmost body part there, so a garment worn on the hips cannot be in front of it. Same error their trousers made (0 to 18 px per frame); PixelDoll's bench shows comparable counts on a tunic and on front/side cape frames.
- **Evidence it would not.** Sleeves, cuffs and gloves legitimately cover hands (exclude `arms`, `torso_outer` sleeves near the wrist, held items). Back-view capes correctly cover hands (exclude north and back 3/4 views for `back`). The wrist keypoint can sit off the hand (`items.ts:359` notes estimated wrists 1 to 3 px off), and PixelDoll's "Surface errors" rule requires the removal to be counted and visible in review, not silent. The body has no hand part map today; the region split (`app/src/lib/dress/regions.ts`) only separates skin, shirt and shorts.
- **Cheap offline test.** Extend `hand-probe.ts`: hand = base skin px that are distal of the wrist (half-plane beyond the elbow-to-wrist segment) and connected to the wrist keypoint. On every bench and demo-fixture (`app/public/fixtures/s2`) worn item, list candidate px per slot and view, render 4x crops, and label each as paint-over or legitimate. Pass if, for legs/waist/feet/torso_inner and south/east `back`, at least 90% of candidates are paint-over and no labeled sleeve, glove or cape-in-front px is removed. Kill if legitimate coverage exceeds 10%. Because there is no trousers fixture, also check stored Studio projects with trousers if any exist.
- **Paid test?** Not to qualify the rule. A trousers bench fixture would need about 10 to 25 gens once (only with owner approval).

### R2. Measure arm-over-body contrast in the keyed input (does PixelDoll need a limb accent?) **(rank 2; free; likely to kill)**

- **Hypothesis.** PixelDoll's continuous ramp already preserves arm/torso boundaries; if a minority of side-view frames have near-zero contrast there, a mild in-ramp accent (darken the body's own boundary px toward the darkest key shade, never outside the ramp) could stop invented arms.
- **Why it might help.** Their mage failure mode (hand invented on the shorts) can occur on any body whose arm shading equals torso shading.
- **Evidence it would not.** The probe above: median green step 30 to 50 levels per edge and only 3 to 10% of edges under 10 levels, against 21 to 34% merged by five tones. The conditioning study already showed rebuilt conditioning bitmaps change extraction (11 added foreground px on re-extraction). `absorbOutline` treats dark key px specially, so an accent darker than the ramp would break extraction.
- **Cheap offline test.** For each posed bench frame, rasterize the elbow-to-wrist segment, take arm pixels whose 4-neighbor is torso/hip (by keypoint distance), and record the keyed green step. Then cross-check against stored PixelDoll outputs that failed G2/G3 with lost body px near a hand (bench labels, `cases.json` drop runs). Kill if low-contrast arm boundaries are not over-represented among those failures.
- **Paid test?** Only if the offline test finds a correlation: about 10 dress calls A/B on low-contrast side views (two seeds).

### R3. Forearm-local inpaint mask for held and strapped items on the grid route **(rank 3; free offline sizing, then paid)**

- **Hypothesis.** On `inpaint-v3` grid repair and fallback, a mask limited to a dilated region around the correct hand/forearm (instead of the whole cell) forces the correct hand in side views and removes stray painting.
- **Why it might help.** PixelDoll's documented side-view wrong-hand failure (`known-issues.md` lines 76-78) is decided by the provider; a mask makes the wrong hand impossible to paint.
- **Evidence it would not.** Tight stencils lose real pixels (conditioning study); swinging blades and bows extend far beyond the hand (the repair disc had to grow to the measured reach, cycle README line 28); the grid route is a fallback, so the user-visible gain is limited to repairs; masks hide but do not create a correct grip.
- **Cheap offline test.** On `shield-occlusion.json`, `a-sword96`, `a-axe96`, `a-bow96`: compute, per frame, the share of accepted item px inside a capsule around the gripping forearm and hand for radii 4 to 16 px (scaled to the cell); find the smallest radius that keeps ≥ 99.5% of item px on every frame, and check that this capsule excludes the other hand in side views. Kill if the required radius overlaps the other hand in more than 10% of side-view frames.
- **Paid test?** Yes, if it survives: a matched A/B on known wrong-hand cases (lantern, shield, east view), about 4 grid calls x 2 seeds x 10 gens.

### R4. Outfit gap note when mixing items **(rank 4; free; low value)**

- **Hypothesis.** A review note in Outfits when a combination leaves a band of body between two items' coverage (hem above a knee-starting leg piece) helps users notice gaps their own mix creates.
- **Evidence it would not.** Bare skin is often intended (their raider; PixelDoll's bare bases); their own metric needed explanations for every "fault". This is a UX nicety, not a generation quality gain, and usability principles warn against noisy warnings.
- **Offline test.** On the demo fixture outfits, compute the gap between consecutive slot extents per frame; check whether any flagged gap is one a person would call an error. Adopt only if precision is high.
- **Paid?** No.

### R5. Pre-registered pass rules per paid experiment **(process; free)**

Their panel 06 (rules written before the call, results against them, overrides marked) is good practice. PixelDoll's research already pre-registers ("What would disprove it", fixed plans with hashes), so this is confirmation, not a change. Worth copying only the explicit "FAILS AS WRITTEN" label when an author overrides their own rule.

---

## 5. Rejected ideas and why

| Idea | Rejected because |
| --- | --- |
| Single-hue gear for all items, recolor later | Destroys multi-material designs (14 of 27 labeled items); bans leather, wood, gold; PixelDoll's exact ramp recolor already gives the same recolor on one-material items. |
| `target_palette` lock with body tones + piece colors | Already tested: exact membership but 2/8 clips failed key gates and 6,257 color edges collapsed; free RGB-nearest gets the same membership (`deep-paperdoll-target-palette-2026-11-06.md`). |
| Five flat mannequin tones | Merges 21 to 34% of body edges (probe) and 22 to 38% (conditioning study); it causes the problem the limb line tries to fix. |
| Code-made reference frame for an unseen piece | PixelDoll never needs it: items are dressed alone from the start and the anchored route uses the real dressed standing view; the conditioning study warns that rebuilt references change extraction. |
| Hide mask "beside the front piece" | 0.5 px per frame benefit, most overlap is legitimate, visibility-only recomposition loses real px, per-frame z-order rejected in D25. |
| Whole set in one call, pieces split by hue | Their own part 2 found cut pieces broken; PixelDoll's one-item-per-call design (D3) is what they converged on. |
| Code-placed rigid frames from 16 design cells | Tried in Motion Lab (rigid source rotated about a grip); owner rejected the hand connection; needs per-frame occlusion a single cell lacks; also contradicts the other tool's own "nothing moved by code" claim. |
| Natural-body extraction for worn items | The diff route on natural bodies measured clearly worse (pinholes, skin slivers, baked face) and cannot be posed. |

---

## 6. What was verified and what was not

- Verified offline: the edge-contrast table (four bench bodies, production `toChroma`) and the hand-coverage table (seven worn cases, production `runCase` extraction). Both scripts are in this folder and import production code read-only.
- Not verified: the other tool's numbers (taken from the video transcript; video compression and a CRT overlay limit pixel judgments), its exact endpoints and whether its palette lock is `target_palette` or a post snap (inferred), and the meaning of "80 of 104 frames are painted" (inferred to be local placement).
- The hand probe's radius includes some forearm px, so the tunic's 28 px may include legitimate cuffs; the probe has no trousers case. Candidate R1's test addresses both.
