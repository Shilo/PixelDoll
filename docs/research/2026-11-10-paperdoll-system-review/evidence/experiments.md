# third-party experiments review

Scope: `tools/*`, `docs/perfect_pipeline/tests/*`, `docs/pixminimax/tests/*`, `tests/*`, `tests/fixtures/real_art`, and the stored figures, charts and GIFs under `docs/paperdoll_system/`. Read-only; no code from the tree was executed. Only my own image-tiling script ran on the stored PNGs and GIFs.

**Important caveat on evidence.** The `data/` folder holding the paid frames and `report.json` files is **not in the tree**. Apart from `two_bodies.json`, every number below comes from the author's write-up `docs/paperdoll_system/PAPERDOLL_SYSTEM.md` or from `TWEAK` comments in the scripts. Only `two_bodies.json` and the images could be checked independently. The author is candid about this: almost everything is one body (68 px cell, about 19x51 px of art), one seed (1137), and one draw per call. Many thresholds were tuned on the same frames they score.

Endpoint names are PixelLab MCP/REST names: `transfer_outfit`, `edit_image`, `inpaint_image`, `animate_with_skeleton_v3`, `animate_character`, `animate_image_pixminimax`, `inpaint_image_pro_flash`, `create_image_pro_flash`, `estimate-skeleton` and `create_character` v3.

## 1. Experiments

### 1.1 "Pink body" test (tools/pink_test.py, pink_full.py, pink_tunic.py, pink_held.py, *_page.py)

**What "pink" is.** It is **not** natural skin used as a key. The bare body's own drawing is recolored into a 5-tone **hot magenta ramp**: outline (204,22,148), shadow (176,16,128), dark (232,28,164), main (255,60,188) and light (255,128,216). Pixels are mapped by OKLab lightness cuts (0.70/0.82/0.90), with anything below L 0.42 treated as outline. So the body is a magenta chroma key that keeps the limbs' light structure. The **round-2 outline is a pink just under the skin, not a dark line**. Round 1 used a dark outline, which then got absorbed into the gear.

**Classifier.** `is_pink` = alpha ≥ 128, OKLab a > 0.08 and b < -0.02. A red crest leans yellow, so it is excluded. Gear = everything not pink, **plus dark magenta (L < 0.50) touching gear**: that is gear outline which the AI tinted toward the key (`GEAR_LINE_LIGHT`). This is the same problem PixelDoll's latest chroma commit addresses.

**Hypothesis.** A bright key body makes gear easy to separate after you animate the dressed stand frame.

**Method.**
- `animate_with_skeleton_v3`, 3 gens per call, seed 1137, `view` set to "low top-down".
- The first frame is the bare stand recolored to pink with the approved helmet and boots (and later tunic, sword and cape) pasted on.
- Keypoints are the bare body's own walk/idle/slash skeletons.
- Prompt: "a person whose whole body is bright hot pink, hot pink skin and magenta shorts, wearing ...".
- Phases:
  - Round 2: S and E walk, 2x8 frames, against a normal-skin run.
  - Full: helmet and boots, 8 directions x walk 8, idle 4 and slash 6, which is 144 frames.
  - Tunic: adds the tunic, 144 frames.
  - Held: sword and cape, S and E only, walk and slash.

**Results (write-up).** Body pixels wrongly cut as gear, per frame:

| Body | Wrongly cut px per frame |
|---|---|
| Normal skin | 31 to 104 |
| Pink with dark outline | 0 to 22 |
| Pink with plain outline | 0 to 5 |

Other results:
- The key held on at least 96% of the visible body across 144 frames.
- Piece drift from its body part: helmet 0.93 px, tunic 1.45 px, boots 1.49 px at most.
- 1,941 stained pixels across the 3-piece outfit, all removed by a per-piece palette lock.
- Reviewed in motion as "the best option for now".

**Root fault.** The gear is cut from the model's redrawn body and laid on the user's real body, and the two bodies disagree (the "arm-shaped hole", Figure f07).

`two_bodies.json`, which I verified: 144 frames over 8 directions x 3 moves, comparing the helmet+boots run with the helmet+tunic+boots run (same seed and poses):

| Measure | Mean | Max |
|---|---|---|
| AI body against AI body | 2.6 px | 15 |
| AI body against our bare body | 19.5 px | 66 |
| Silhouette, AI against AI | 23.6 px | |
| Silhouette, AI against bare | 154 px | |

The E walk is worst at 31 px mean against bare. So the model is self-consistent but systematically departs from the real base.

**Does the conclusion follow?** Yes for the separation gain, though sample sizes are small: n = 2 directions x 8 frames for the A/B, one seed. The verified JSON supports the "two bodies" diagnosis.

The held-items phase is heavily hand-tuned per clip. Examples:
- `ANGLE_FILL` hand-sets sword angles on specific frames.
- `WHOLE_HELMET` replaces the helmet on E slash frames 0 to 2.
- `HELMET_NUDGE {(S,6):1}`, plus `TUNIC_HEAL` and `CAPE_SIDES`.

Those results do not generalize. The pinned sword with a code-drawn fist was **rejected three times in motion**.

### 1.2 AI redraw of code-placed gear (tools/ai_clean.py)

Code places a rough piece on each frame. `edit_image` or `transfer_outfit` redraws it, and code cuts it back and restores the body exactly. It crops a 64 px window so that 16 frames fit in one call.

**Head-to-head: south boots, 13 frames, 10 gens each.**

| Variant | Uncovered px per frame |
|---|---|
| `edit_image`, one-sheet | 0 to 6 (steadiest) |
| `edit_image`, separate frames | 10 to 23, and the body moved |
| `transfer_outfit` hybrid (rough frames plus design) | 12 to 29; the reviewer preferred it |
| Bare frames | 18 to 45 |

**Rollout to 8 directions** (boots +70 gens, helmet 90 gens) found three faults:
- **Color flicker.** No palette was passed. Boots SE: 5 colors were sent and 34 came back.
- **Faces closed by the helmet.** On S, 54 of 74 open face pixels were covered.
- **Per-direction darkening.** Up to 27% darker on N.

Conclusion: `transfer_outfit` is the best painter, and per-frame repainting of rigid gear is waste. That follows. Note that n = 1 piece.

### 1.3 Locked drawing for rigid gear (setforge/headmove.py, cover.py, tools/cover_test.py, head_report.py)

One approved helmet drawing per direction is moved with the head. The offset is measured from the dark lines of the upper head, within 4 px of the joint. A cover step then extends the drawing 1 px into empty air only.

Over 104 frames:

| Measure | Before | After |
|---|---|---|
| Frames off the head's real move | 28 | 0 |
| Loose bits | 48 | 0 |
| Frames with uncovered head | 74 | 0 |

Accepted in motion as decent. The author admits the metrics share logic with the fix. The route is parked by project policy ("every frame must be model-drawn").

A useful datum: on a frame where the body did not move, a repaint still changed **34 to 37% of the armor's pixels**.

### 1.4 Code-fitted boots (setforge/fitboots.py)

Boots built by recoloring the feet were rejected in motion ("recolored feet"). Boots carried along the bones left 0 to 11 px bare and looked lumpy. Conclusion: "code can place, not shape". That is sound.

### 1.5 Sheet inpaint (main program, setforge/flow.py; the unit tests mostly pin this route)

Many frames are packed on one sheet and painted with `inpaint_image` (10 gens per 256 px sheet). This route uses a **natural-skin body**. Each piece gets its own loud color family: green 145°, violet 305°, cyan 205°, magenta 345° or blue 265° (`setforge/color.py`, `SAFE_DISTANCE` 0.055 from body colors). Pieces are split by "unchanged = body, near a family = piece, near body = redrawn body (dropped), else unknown".

Results:
- 88 cells held one design.
- 15% of protected pixels changed (1,182 of 7,645), and 260 turned transparent.
- Failed the first review in motion.
- Holes appear where pieces overlap, so pieces do not mix.

### 1.6 Paint on real frames (perfect_pipeline: p3_outfits, p4_*, p5_*, p6_*, outline_measure, normal_vs_pink, two_bodies, t1 to t5)

**Method.**
- The user's real frames are recolored to a key ramp.
- `transfer_outfit` runs with up to 15 frames per call at 64 px or less (stand + walk 8 + slash 6). It takes an approved `edit_image` design as reference, plus a **palette = 5 body tones + outfit colors**, and seed 1137.
- Cut: the 5 body tones are body, everything else is gear. The body is always restored from the stored copy.

**Results** (write-up). Five outfits (knight, ranger, mage, nomad, raider), S and E only, 150 frames, about 160 gens:
- Outfit present on 150 of 150 frames.
- 0 stained pixels.
- Body outer outline off by 0 px on 39 of 42 frames, against 11.2 px for the animate-dressed route (`outline_measure.py`).
- Untouched body changed by 0 to 1 px on NE.

**Faults.**
- **E slash 6 on the mage and nomad: the model paints over the hand and invents a new hand at the hip.** Cause (`p4_blob`, `p5_limbline`): the key ramp's outline tone sits *between* the other tones, so an arm in front of the torso is flat on flat and invisible to the model. The proposed fix is a sixth, darker tone in the key hue on arm-over-body lines. It was built but its paid call (`mage_E_line`) was not reported, so it is **unproven**.
- Robe opening: fixed by wording (legs showing 8 to 25 px dropped to 0 to 4, one draw).
- Knight body showing 2 to 12 px past the gear: fixed with a hide mask.
- Bare back strip on NE, 12 of 42 frames: open.

**Mixing** (p4_mix, p5_alone, p6_*). Pieces cut from one outfit hold only what was visible. Pieces painted alone, with a piece-only palette and "nothing else is worn", cut the bare body in mixes from 126–155 px to 25–42 px. Only 2 pieces (jerkin and trousers) are proven with paid frames, front view only.

**Conclusion and whether it follows.** "Best overall, not yet reviewed in motion." The stills support it for S and E. Six directions are untested, and idle was not painted this way (knight idle is the only one, via a painted-frame reference).

### 1.7 Video-model route (docs/pixminimax/tests/pm_equip.py, pm_post.py, pm_set.py)

`animate_image_pixminimax`, side view (E) only.

**Phase 1** (22 gens, 5 clips x 40 frames). The start picture shows the body with the item floating in front, and the model draws the body taking it.
- The green body passed 5 of 7 rules. Real colors passed 4: dark shorts and dark iron were confused.
- The item was never lost or duplicated, and the sword stayed 20 to 22 px long.

**Phase 2** (25 gens).
- A chain of 16-frame clips puts on the pieces in order boots → legs → chest → helmet → weapon.
- Then a **twin picture**: the dressed man and the bare man on one 128 px canvas, animated together. The bare twin becomes the body layer.
- Twins stayed in step within 3 px on 16/16 walk, 8/8 idle and 24/24 slash frames.
- The rim misfit is about 1 px. Extra bare px per frame: idle 11 to 22, slash 12 to 43, walk 12 to 83.

**Faults.**
- Slash smear: up to 578 px.
- Boots smaller than the feet.
- Leg armor became greaves.
- The walk loop starts mid-step.
- Pixel sizes in words are ignored.

**Critical for PixelDoll.** The body layer here is the **model-drawn green twin, not the user's frozen base**. Layers fit only their own clip. The route also uses `inpaint_image_pro_flash` for the design and a **green key-colored body that remains the body layer**. This is incompatible with a frozen, user-colored base.

## 2. Key and chroma colors, and dark outlines

| Key | Where | Numbers |
|---|---|---|
| Natural skin (no key) | Normal run in the pink A/B; sheet-inpaint body | 31 to 104 body px wrongly cut per frame. With the video model, dark shorts and iron were confused (4/7 against 5/7 rules) |
| Hot pink / magenta ramp | Animate-dressed route; paint-on-frames tests 4/4b | 0 to 22 (dark outline) → 0 to 5 (plain outline). On the pilot outfit, 41 to 54 gear px per frame sat near the body hue. Pink leaves only 27° of hue room for the mage, versus 131° for a picked hue |
| Green (hue 160) | `pilot_green` (`transfer_outfit`, S, 15 frames); the whole video route | 0 gear px near the body hue (against 41 to 54 on pink). One draw: "shows green works, not that it is better". Video route: line color (5,86,55), L 0.40 |
| Picked per outfit (`p2_picker`) | Five outfits | Largest empty gap on the hue wheel among loud hues (chroma ≥ 0.11 on every tone, outfit colors with chroma ≥ 0.05 count). The f08 designs show violet, sky blue/cyan, purple and blue bodies chosen for ranger, mage, nomad and raider. The cut rule is a hue slice stopping halfway to the nearest outfit hue |
| Per-piece families (natural body) | Sheet inpaint | Green 145, violet 305, cyan 205, magenta 345, blue 265. Each piece is kept ≥ 0.055 OKLab from body colors, and touching pieces never share a family |
| Video set | pm_set | Pieces get distinct hues: legs 262, chest 25, helmet 90, weapon 315, boots grey. Owners stay ≥ 0.07 OKLab apart, chroma ≤ 0.14 |

**Dark outline handling. This is the most transferable lesson.**

1. On the key body, **remove the dark outline** (outline = a slightly darker key tone). With a dark outline, the dark line gets taken as gear: 0 to 22 against 0 to 5 px.
2. The AI **tints gear outlines toward the key** (dark magenta next to gear). They reclaim it with "key-hue AND L < 0.50 AND adjacent to gear → gear". In the sheet route, an outline joins the piece it touches but does not follow a long line (`test_an_outline_touching_its_piece_stays_with_it_but_does_not_run_away`). A family color far from its anchor counts as redrawn body, not gear.
3. **Trade-off.** With no dark line, limbs over the torso become invisible to the model, which then invents hands (E slash). The fix (a darker, same-hue line only on arm-over-body edges) is unproven. The video route deliberately keeps a dark same-hue line (L 0.40) "because a flat shape gives it no limbs to read".
4. Pink stains on gear (boots near the body edge, a crimson tint): fixed by snapping to the piece's approved palette. Approved drawings also pick up key tones, so they filter body-slice colors from chroma 0.02.
5. **The color lock is judged on fill, excluding the outline**, because the outline share changes with pose. Only materials more than 2% from their clip median are retoned, and edge-dark pixels are kept as lines. Across 53 materials, 42 were over 4% swing before the lock and 1 after.

## 3. Hands, held items, helmets, boots, capes, 8 directions, animation

- **Hands and held items.** "A body animated empty-handed cannot hold anything."
  - Every route that layers a sword over a swinging-arm body failed: it floats, or the model redraws the arm. `transfer_outfit` on walk was a fail; on slash, frames 2 to 5 were OK and frames 1 and 6 bad.
  - A sword pinned in code with a drawn fist was rejected three times. `hand_over_grip.py` (the body's own hand pixels drawn over the grip) is a free variant whose result is unreported.
  - What worked: `animate_character` skeleton-v3 with "right fist closed, hand held in front" (the arm stays bent, but the model draws a sword if the item is named), and the video route (side only).
  - `create_character` v3 with a sword gives consistent 8 views but keeps only 17 to 53% of body pixels.
  - Shield: centered halfway along the forearm. Good on S/SW/W, fair on N/NW, and behind the body on E/NE/SE.
  - Unit tests pin "upright items pinned by their middle, shield at forearm midpoint, both hands only when on the item, far-side sword must go behind (W)". Two-handed grips have never run on real art.
- **Hand occlusion with leg pieces.** Trousers drew over the hands (0 to 18 px). Rule: the body's forearms and hands are always drawn in front of leg pieces, giving 0.
- **Helmets.**
  - Repainting closes the face (nose and cheek guards), drifts darker by direction, and leaves skin or ears past the rim.
  - Fixes: the locked drawing, the cover rule (gaps ≥ 4 px are design openings such as the face, and the face side stays open on side views), `clear_chin` on S, and per-frame helmet nudges.
  - The earlier "helmet off the head's move" fault: 27 of 64 walk frames and 8 of 32 idle frames.
- **Boots.**
  - Joined at the knees on S (fixed by clearing the leg gap and seam on S/N).
  - Smaller than the feet (toes show). Fixed with `cover_feet`, which fills foot pixels from the neighboring boot using the boot's outline color, and with a hide mask.
  - The model leaves boot visible above the ankle under a closed robe: 5–21 px down to 0–11 px.
- **Capes and back items.**
  - The sheet route needed 55 gens with repairs. S walk frames 1 to 3 showed the cape's back from the front (a fixture plus a `view_flips` test pin this). SE frames 5 to 7 stay messy.
  - The recommendation is to draw the cape under the body. The draw order flips by direction (the arms are in front of the cape on S/E/SE/SW/W).
  - Paint-on-frames and video routes are untested for capes.
- **8 directions.** E against mirrored W is only 19% identical (NE/NW 32%, SE/SW 22%), so mirroring is rejected and all 8 must be paid for.
  - The pink animate route covered all 8 directions; paint-on-frames only S, E and NE; video only E.
  - Joints: left/right swaps near side views (6 on NE walk, 4 on NW) are fixed by smoothing.
  - The first N design faced the camera and had to be redrawn.
- **Animation consistency.**
  - Template moves produce stray colors on side views; skeleton-v3 bodies give 0 to 2 stray px.
  - The base body itself is unstable: the head matches the stand only 31 to 67% per frame, and the chest has 11 to 17 looks in 19 frames.
  - Idle barely moves on N/NE/NW.
  - Merged 14-frame calls differ from separate calls by 9.1 px per frame, which is like changing the seed.
  - Loop seam: video loop closure is idle 19, walk 23 and slash 40 px.
  - The slash produces smears and dark blobs at the hip on its last side frame.

## 4. What the unit tests reveal

All tests use made-up pictures or a stand-in server and spend 0 gens. They mostly pin the **sheet-inpaint program**, the cover and headmove code, and spending safety, **not** the research routes.

- **Separation.**
  - Position beats color: an unchanged body pixel is body even if it is a family color.
  - AI-redrawn skin is dropped, not kept.
  - Unknown colors are reported.
  - A shared family is split by anchor.
  - An outline goes to the piece it touches, with bounded growth.
  - A family color far from its piece counts as redrawn body.
  - Pieces that touch never share a family.
  - Recoloring keeps shade order, makes no new colors, and dark outlines stay dark (L < 0.28).
- **Cover.**
  - +1 px into air only and never onto another part.
  - A big gap is the face and stays open, and the face can be two openings. From behind, nothing may show.
  - New edge pixels take the outline color. A filled gap does not copy dark shading.
  - Thin dark lines stay, nubs go, and a solid dark block takes the piece's darkest shade.
  - The foot is fully covered by the boot.
- **Headmove.**
  - The move comes from the head's pixels when the joint is wrong, and the stand never moves.
  - A redrawn head is distrusted and takes the nearest good frame. A taller redrawn head is set by its top.
  - The checker reads neither joints nor colors. One pixel sideways is allowed, two are not.
- **Real-art fixtures, faults found by eye.** These checks must fire on the bad art and stay quiet on the good art:
  - A cape flipped on frames 1 to 3.
  - Stray lines on a locked sword (`stray_share` > 0.3 against < 0.05 for a hood).
  - A sword pasted twice.
  - A bow on the shoulder not reaching the hand.
  - A W sword in front of the body that must go behind.
  - A tinted body (counted, never in the piece; fixture says 328 tinted and 417 redrawn).
  - Redrawn outlines dropped so the real body shows.
  - Raw joints with hand swaps, which `steady_frames` removes.
- **Verdict.** A note about something already repaired stays green, and a seam jump is found. Boxing-glove-sized gloves are flagged, as is a mirrored view that lost most of the piece.
- **Body map.** Every body pixel is owned by exactly one of 16 parts. The near arm shows in every side frame, no anchor is in the air, and a drawn line stops a limb leaking (but a wide dark area counts as cloth).
- **Safety and ops** (the bulk of the tests): the ledger is written before sending, a call with no answer is never resent, two windows send once, the token stays only in the settings file, and an export holds nothing experimental unless asked. These match PixelDoll's "never auto-resend" rule.

## 5. Visual quality verdict (stored images)

- **Paint on real frames** (knight and mage GIFs, f08, f09): the best-looking work in the tree.
  - The knight is clean and consistent across walk frames, with outlines intact and no flicker visible in the tiled frames.
  - The mage robe is solid, but the side walk shows a pinkish stray blob by the hand on 2 frames (the invented-hand fault).
  - The f08 designs are coherent across 8 directions, with the key-colored skin clearly separate.
  - Quality is typical PixelLab with readable silhouettes.
- **Animate dressed stand** (NE walk GIF, f07): an acceptable sprite, but f07 clearly shows the arm-shaped hole and the mismatched shoulder when the cut gear is laid on the real body.
- **Redraw against locked helmet** (f03): the redrawn row varies in shape and tone per direction and closes the face; the locked row is cleaner. That supports their conclusion.
- **Mixes and pieces alone** (f10, jerkin GIF): the cut-piece versions show bare chests and holes. The painted-alone versions read as whole garments; the jerkin over slash frames is fine.
- **Held sword** (f12): the sword visibly floats upright beside a swinging arm and reads as overlaid. Fail, as stated.
- **Sheet inpaint** (f02): readable but low-fidelity. The helmet is a brown blob on side views, the tunic shapes vary per frame, and the boots are tiny yellow nubs. Mediocre.
- **Video twins** (f16, GIFs): chunky and noisy, with a gold helmet, a violet crystal sword and a green body.
  - The twins' arm poses visibly differ on some frames.
  - The overlay shows the 1 px rim plus larger misfits at the feet and sword.
  - It is a green-skinned body, unusable as a user base without recoloring.
  - Promising for motion coherence, weak as final art.
- **Fixtures** (real_art): small, honest pathological cases: a green bow, a doubled sword, stray line debris on the NW sword, and a cape mask. They are useful as regression inputs.

## Bottom line for PixelDoll

1. Their strongest verified insight: gear fits only when painted on the exact frames it is worn on. Cutting gear from the model's redrawn body costs about 20 px per frame of mismatch (verified: 19.5 mean, 66 max), against about 2.6 between two model runs. PixelDoll dresses a chroma copy of the base with edit-animation-v2 and then animate-with-skeleton-v3 per move, so it should measure the same "AI body against frozen base" number.
2. Key color: use a per-outfit picked hue rather than a fixed pink. Strip dark outlines from the key body, but keep or add a darker same-hue line where limbs overlap the torso (unproven). Reclaim key-tinted dark pixels adjacent to gear as outline. Pass a palette at generation and lock tone on the fill only.
3. Held weapons in 8 directions are unsolved everywhere. Any layer over an empty-handed swinging arm fails; animate a carrier pose first.
4. Evidence is thin: one body, one seed, mostly S and E, many hand-tuned per-frame constants, and the raw data is absent from the tree.
