# third-party vs PixelDoll: what should PixelDoll change?

Date: 2026-11-10. Reviewer stance: skeptical of both sides. Inputs: `../docs-summary.md`, `../source-review.md`,
`../experiments-review.md`, the earlier video review (`docs/research/2026-11-09-paperdoll-video-review/`), PixelDoll at
`28f83b5c`. No PixelLab call was made. All measurements are offline on stored paid output and import production code
read-only (scripts in this folder; run from `app/` with `node --experimental-transform-types <script>`).

Labels: **Measured** (here), **Reported** (their write-up), **Code** (PixelDoll source).

## 0. Where the new evidence overturns the earlier video review

| Earlier inference | New evidence |
| --- | --- |
| Worn pieces were `edit-animation-v2` with a `target_palette` lock | Wrong endpoint. The best route ("paint on real frames", 5.7) is `transfer_outfit` with `palette` = 5 body key tones + outfit colors, seed 1137, up to 15 frames at <= 64 px. The color lock is a separate post step (selective material retone). |
| "No sign of animate-with-skeleton-v3" | Wrong. Route 5.6 (pink mannequin, dressed stand animated with skeleton-v3 on the bare body's poses) was their accepted route in motion; they moved off it because of the "two bodies" misfit. |
| Code-placed rigid frames contradict "nothing moved by code" | Explained, not a contradiction: the locked helmet (one drawing per facing moved by head tracking) is code placement by design; it is now parked by their own new rule "every frame model-drawn". |
| Five flat tones | Five tones cut by OKLab lightness (0.70/0.82/0.90, outline < 0.42) with a key-hue outline, still quantized. The earlier edge-merge rejection stands. |
| Hide mask untested on whole pieces | Still true; their new numbers (knight 2-12 px cured, 121 of 128 px) are the same order (< 1 px per frame). |

The earlier review's verdicts on single-hue gear, five tones, limb line and hand protection are unchanged by the new
evidence. Its R1 (hands in front) failed its own test and is now the Later card "Measure garments painted over hands with
a trousers fixture".

## 1. Ranked verdicts

| Rank | Idea | Verdict |
| --- | --- | --- |
| 1 | Paint gear on real frames (transfer-outfit-v2 + palette) instead of re-posing | **Reject as default** (measured: PixelDoll has no two-bodies misfit beyond a 1 px rim; costs 3-7x more; worse design lock) |
| 2 | Selective material color lock | **Reject** (measured: PixelDoll posed frames are already ~100 % palette members; the swings are shading-share changes a lock would wrongly flatten) |
| 3 | Armed carrier clip for held items | **Test**, folded into the Ready card "Validate weapon actions" (paid, small) |
| 4 | Locked helmet moved by head tracking | **Reject as default; optional free offline test** only if the owner allows code placement as a Hurt repair (SE1) |
| 5 | Hands in front of trousers | **Keep the existing Later card**; no new evidence |
| 6 | Cover rule (1 px into air) | **Reject** (measured jut 1.8 px/frame; violates "every pixel from PixelLab") |
| 7 | Hidden-piece repaint, fill layers | **Reject** (not applicable: PixelDoll never cuts pieces from an outfit) |
| 8 | Whole-sheet shift detection + restore outside mask | **Reject** (already covered: `clipToStencil`, G10 shift fail) |
| 9 | Outline-walled part map | **Reject** (no consumer; the hand rule it would serve failed) |
| 10 | estimate-skeleton mirror/duplicate reuse | **Reject** (0.1 gen per frame; mirrored western views are flipped, not estimated) |
| 11 | pixminimax dressed/bare twins | **Reject** (body becomes a model-drawn twin; breaks the frozen base) |
| 12 | Per-outfit key hue from the widest gap | Note only; chroma agent's scope |
| 13 | Their bugs (Scale2x, np.roll) | No analog: PixelDoll never rotates or rescales sprites; `bestShift` uses translate, not wrap |

## 2. Idea 1: paint on real frames vs re-posing (the decisive question)

**Theirs (Reported).** Gear cut from route 5.6 (dressed stand re-animated) misfits the real body: `two_bodies.json` (verified
by the source reviewer) gives AI body vs bare body 19.5 px per frame mean, 66 max, against 2.6 between two AI runs; figure f07
shows an arm-shaped notch. Painting on the real keyed frames gave 0 stained px and outfit present on 150/150 frames (5 outfits,
S and E only, one seed, stills only, never judged in motion).

Their metric (`two_bodies.py`): `(model key body XOR real silhouette) & ~dilate(gear, 1)`, exact pixels. It counts a
silhouette that is drawn 1 px wider as a full rim of disagreement.

**PixelDoll (Code).** Default route `skeleton-pose` (`docs/architecture.md` §4.1): the dressed chroma keyframe is posed by raw
`animate-with-skeleton-v3` with the **same raw request shape and stored keypoints that rendered the base itself** (§3.1),
registered by `bestShift` (`app/src/lib/items/items.ts:1555`) and judged with `posedTol` (`items.ts:899`, 1 px up to a 149 px
cell). The anchored edit route (paint on real frames with `edit-animation-v2`) already exists for imports and item-only moves
(PLAN "Progressive equipment generation").

**Measured A: matched paid trials** (`trials-fit.mts`, the 2026-11-06 matched route trials on disk in
`app/test-results-item-trials/final-evidence/plan.json`: same frozen walk frames, same approved design, raw conditioning).

| Case, east walk, 2 seeds x 8 frames | Their metric (mean/max px) | Beyond 1 px | Base jutting past gear | Bare px enclosed by gear |
| --- | --- | --- | --- | --- |
| a-cape: edit on real frames | 0.1 / 1 | 0.0 | 0.1 | 0 |
| a-cape: transfer on real frames | 0.1 / 1 | 0.0 | 0.1 | 0 |
| a-cape: **re-posed** | 23.8 / 44 | 0.2 / 2 | 1.1 / 3 | 0 |
| b-cloak: edit | 0.1 / 1 | 0.0 | 0.0 | 0 |
| b-cloak: transfer | 0.1 / 1 | 0.0 | 0.0 | 0 |
| b-cloak: **re-posed** | 21.6 / 43 | 0.2 / 1 | 0.4 / 1 | 0 |
| b-greathelm: **re-posed** (no edit arm) | 36.0 / 71 | 0.6 / 5 | 0.1 / 1 | 0 |
| b-tunic south: transfer | 4.0 / 59 | 1.3 / 21 | 2.6 / 24 | 0 |

**Measured B: frozen benchmark** (`bench-fit.mts`, 568 posed frames, 9 worn and held cases, walk and slash; 59 dressed
standing keyframes painted on the real rest frame as control).

| | Their metric | Beyond 1 px | Jut | Model body bulge > 1 px |
| --- | --- | --- | --- | --- |
| Re-posed, all | 22.1 / 287 | 1.4 / 84 | 1.8 / 18 | 0.5 / 39 |
| Painted on real (rest) | 1.3 / 16 | 0.8 / 15 | 1.6 / 16 | 0.1 / 7 |
| Re-posed walk | 27.9 | 1.9 | 2.4 | 0.5 |
| Re-posed slash | 8.4 | 0.2 | 0.6 | 0.3 |

Outliers: n-cloak128 walk east frames 7 and 3 (84 and 55 px beyond 1 px; a 128 px body whose scaled tolerance is 2 px; the
bench already labels a real foot mismatch there) and greathelm jut 10-18 px, which is identical on the rest keyframe (ear tips
the helm erases, handled by `baseCut`), so not a posing effect.

**Visual check (Measured).** Contact sheets `sheets/b-tunic-walk-*.png`, `sheets/a-chest-*.png` (composite, model output,
mismatch overlay at 4x): no arm-shaped notch; the frozen arm reads in front of the tunic and vest on every east walk and
east slash frame; red/blue mismatch marks are isolated single pixels.

**Conclusion.** PixelDoll reproduces their headline number on their own metric (22 vs 19.5 px per frame), and the number is
almost entirely a 1 px rim: beyond 1 px the re-posed layers misfit by 0.2-0.6 px per frame on the matched trials and 1.4 on the
bench, the same order as gear painted on the real frame (0.0-0.8). So their 19.5 px does not by itself prove a visible misfit
in their pipeline either (unknown share of rim), and PixelDoll does not have the "arm-shaped hole" problem. The likely reason:
PixelDoll renders base and item with the identical raw v3 request (S3 measured IoU 0.988 S / 0.977 E); their route 5.6
animated a pasted stand against a base made by a different call (their t1 same-engine test still left 7.2 px, an untested
cause may be seed or tolerance).

**Cost and quality of switching.** Transfer holds 15 targets at <= 64 px, **8 at 65-80 px (PixelDoll's default 80 px cell),
3 above 80 px (held items, 112 px)**; about 10 gens per call. Re-posing costs 3 gens for up to 15 frames (idle + walk share a
call). Default rig, Top-down 8 (5 drawn views), idle + walk: about 110 gens (5 views x 2 calls x 10 + design) vs about 25
today; held items at 3 frames per call are about 7x. Design lock: on the matched east-cape pairs re-posing kept palette distance
0.12-0.18 vs 8.3-9.0 for painting on frames, and transfer failed 2 of 16 clips at the gates vs 0 for edit
(`docs/research/deep-paperdoll-live-trials-2026-11-06.md`). Their own data shows repaint noise (34-37 % of armour px change on a
still frame) and color flicker that they then had to lock.

**Verdict: reject as default.** Keep the anchored route where it already applies (imports without poses, item-only moves).
No paid test: the offline measurement decides it. Policy fit: allowed (`transfer-outfit-v2`, Pro editing), not the issue.

## 3. Idea 2: selective color lock vs `standingDyeMatcher`

**Theirs.** Group colors into materials, judge fill brightness only, retone materials > 2 % off their clip middle; 42 of 53
materials > 4 % before, 1 after. Needed because transfer and edit repaint every frame (n = 1 body).

**PixelDoll.** `standingDyeMatcher` (`app/src/lib/dress/item-palette.ts:10`) rebinds only colors not already in the standing
palette, within 12 per channel, with a 3-unit ambiguity margin; G6 per-frame palette warning (`dirGate`).

**Measured** (`fill-swing.mts`, bench posed clips, before the matcher): 65 clips, median fill-brightness swing 2.1 %, max 33.6 %,
23 clips over 4 %. But off-palette item px (exact color absent from the same-facing dressed keyframe) are 0.0 % on most clips and
at most 5.3 % (a-boots walk east). The large swings (axe slash east 33.6 %, sword slash east 28.2 %, chest slash east 23.0 %,
tunic walk east 20.8 %) have 0.0-0.4 % off-palette px: they are changes in which shades are visible (a blade turning, an arm
covering the lit side), not drift. A lock keyed on fill brightness would retone correct frames. Their metric conflates the two.

**Verdict: reject.** Re-posing already preserves the palette; the residual is what the dye matcher handles.

## 4. Idea 3: hidden-piece repaint and fill layers

Their problem exists because pieces were cut from a whole painted outfit and held only what was visible. PixelDoll dresses
each item alone on the bare keyed body ("Add only ..."; `app/src/lib/image/chroma.ts` `chromaPrompt`; D3, D25 bare bases), so
every layer is whole by construction. Fill layers patch holes under other pieces; PixelDoll layers have no such holes.
**Reject (not applicable).** Mixing gaps between slots (a hem above knee plates) remain a design/UX question, already covered
by the earlier review's low-value R4.

## 5. Idea 4: cover rule

Code extends a piece 1 px into empty air and re-outlines it. Measured base px jutting past gear: 1.8 per posed frame (bench),
1.6 on frames painted on the real body, so posing does not create the problem it fixes. It also violates architecture goal 2
("every pixel comes from PixelLab; PixelDoll never draws"). **Reject.**

## 6. Idea 5: locked helmet with head tracking

**Theirs.** One approved drawing per facing, translated by head motion measured from dark upper-head lines within 4 px of the
joint: frames off the head move 28 to 0, uncovered head 74 to 0 on 104 frames; author says the metrics share ideas with the
fix; rigid paste with no per-frame shading; residual 1 px jut (111 to 39); parked by their own rule.

**PixelDoll.** Posed helmets; H4 keyframe consistency and anchor spread gates; `baseCut` moved with the head (keypoints).
Bench helmets: fill swing 0.1-0.7 %, beyond-1 px misfit equal to the painted-on-real control (greathelm 3.8 vs 3.6 px,
c-greathelm 9.9 vs 9.3: the ear cut). Re-posed helmets already hold. The known failure is Hurt deformation (Ready card SE1).

**Verdict.** Reject as default (code placement, contradicts goal 2, rigid look). If the owner wants a free repair for the SE1
Hurt cells, a pre-registered offline test is possible: paste the same-facing dressed helmet at the head offset (joint plus
drawn-line refinement) on stored Hurt frames; pass if 0 frames off by > 1 px on an independent silhouette-top check, no new
uncovered head px, and an owner visual pass in motion. That is a Needs-decision change to the SE1 card, not a new card. The
held-item free paste (R1 warning) is the only precedent.

## 7. Idea 6: armed carrier clip for held items

**Theirs.** `animate_character` skeleton-v3 "right fist closed, hand held in front", never naming the item: pass, but n = 1 and
the model drew its own sword when the item was named. Every overlay on an empty-handed swing failed for them.

**PixelDoll.** Held items are dressed with a red wrist dot and posed per clip on the padded canvas; grip side (G8) and shape
(G9) gates; known side-view wrong-hand limit (`docs/known-issues.md`); risk table already says "author an armed variant".
The bench held clips pass on walk; actions in 8 directions are unvalidated (Ready card "Validate weapon actions", Paid).

**Verdict: test**, inside that card, not as a new one. Pre-registered paid test: one body, east and north-east slash, two seeds;
arm A = current bare-handed base + held item; arm B = a body move authored with a closed fist (body description only, no item
words) + the same held item. Pass for B if G8/G9 pass on every frame, the item never floats (> 1 px gap from the fist) on more
frames than A, and a blind visual pairing prefers B in at least 3 of 4 pairs. Estimate: body moves 2 dirs x 2 seeds x 3 gens =
12, item poses 2 x 2 x 2 x 3 = 24, total about 40 gens. Cost note: an armed base is per weapon class, which conflicts with one
frozen base per character; only worth it if B wins clearly.

## 8. Ideas 7-13 (short)

- **Per-outfit key hue (7).** PixelDoll picks from four keys by prompt words, then `keyFor` (`chroma.ts:168`) from measured
  colors after a collision. Their picker is continuous-hue; interaction to note for the chroma agent: their outline is a key
  tone (no dark line), PixelDoll's ramp keeps dark lines and now recovers dark item outlines in `absorbOutline` (c).
- **estimate-skeleton reuse (8).** 0.1 gen per frame; PixelDoll flips mirrored western views instead of estimating them.
  Savings are a few tenths of a gen per move. Reject (YAGNI).
- **Shift detection and restore outside the mask (9).** PixelDoll clips grid layers to the submitted stencil
  (`clipToStencil`, `items.ts`) and fails a shifted redraw (G10) instead of re-rolling the sheet back. Their ±20 px search with
  `np.roll` wrap-around is buggy. Restoring would hide a shifted design; failing is the safer contract. Reject.
- **Outline-walled part map (10).** Only consumer would be hand protection, which failed offline (2.3 % precision). Reject.
- **pixminimax twins (11).** Allowed model, but the body layer is the model-drawn twin, side view only, 1 px rims (12-83 extra
  bare px per frame on walk), and PixelDoll measured a dressed keyframe animated with pixminimax at IoU 0.65-0.84 against the
  base (`architecture.md` §4.3). Reject.
- **Hands in front of trousers (12).** Their result 0-18 px to 0 is on one piece, front view. Existing Later card stands; still
  no trousers fixture. No change.
- **Bugs (13).** Scale2x diagonal sampling, `np.roll` wrap, looping-only smoothing of attack clips: PixelDoll has no sprite
  rotation or scaling (goal 2) and `bestShift` translates with transparent fill. The looping assumption is worth a grep if a
  smoothing step is ever added.

## 9. What was measured, and limits

- `trials-fit.mts` -> `trials-fit.json`: 19 matched groups, 304 frames. Only capes and one helmet have a pose arm; no torso pose
  arm in the matched set (the bench covers torso).
- `bench-fit.mts` -> `bench-fit.json`, `sheets/bench-worst-*.png`; `bench-sheet.mts` -> `sheets/<case>-<clip>.png`.
- `fill-swing.mts`: printed table only.
- Limits: the bench has no trousers or two-handed weapons and only 3-5 views; my "beyond 1 px" uses 1 px on every cell (the
  production tolerance is 2 px at 160 px, so n-cloak128 is overstated); hole and notch detection was confirmed visually on six
  clips, not exhaustively; their numbers come from their write-up, one body and seed.

## 10. Proposed paid tests

Only one, because offline evidence decides the rest: the armed carrier A/B in section 7 (about 40 gens), inside the Ready card
"Validate weapon actions". Not recommended: any paint-on-frames trial (already run: 32 matched calls, 2026-11-06).
