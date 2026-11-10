# third-party paper-doll system: documentation review

Source: `src/third-party/docs/paperdoll_system/PAPERDOLL_SYSTEM.md` (v1.0, Nov 2026, "research paused"), README, GETTING_STARTED, FOR_AI_AGENTS, SET_FORGE, EXPERIMENTAL, EXPORT_FORMAT, 14 charts, 16 figures, 11 GIFs (frames extracted to `work_docs/`). A few test scripts were read, not run, only to pull exact key-color constants (`tools/pink_test.py`, `docs/perfect_pipeline/tests/p2_picker.py`, `p3_outfits.py`, `docs/pixminimax/tests/pm_equip.py`, `pm_set.py`).

**PDF check.** The PDF the owner received is byte-identical (`cmp`) to the bundled `PAPERDOLL_SYSTEM.pdf` (40 pages). The Read tool could not render pages (no poppler renderer), so I extracted the text with `pdftotext` and compared vocabularies. The PDF prose matches the .md word for word. The only PDF-only text is chart labels: axis ticks, plus chart subtitles that the .md leaves out, such as "Same art, same seed" (c05), "One helmet on 104 frames (96 moving)" (c07), clip frame counts in c10 (idle 8, slash 24, walk 16), "The number of pieces each figure buys differs" (c03), and the c14/c15 step captions. The PDF has no extra findings.

**Overall framing.** One bare test body (68x68 cell, about 19x51 px of art, 8 directions, stand 1, walk 8, idle 4, slash 6, so 19 frames per direction and 152 in total). Unit price is about $0.008 to $0.01 per generation ("gen"). The author labels every result Motion, Measured, Stills or Tool text, and warns that almost everything is one body, one seed and one draw, with thresholds tuned on the same art they were scored on. The shipped program still runs the oldest route (sheet inpaint). The better routes exist only as test scripts.

---

## 1. Pipeline end to end

### 1.1 Body creation
- Generate one character (`create_character` v3, about 1 gen), store it and never regenerate it ("no two generations match").
- Moves: template animation costs 1 gen per direction, skeleton-v3 moves 3 gens per direction. Templates drew stray colors on side views (blue shorts on E walk, skin-colored shorts on W walk). Skeleton moves had 0 to 2 stray px per frame, so the recommendation is skeleton-driven moves only.
- The body is unstable even by itself: the head matches its stand drawing only 31 to 67% per frame, and the chest has 11 to 17 distinct looks over 19 frames.
- E vs mirrored W is only 19% identical (NE/NW 32%, SE/SW 22%), so all 8 directions are paid for and nothing is mirrored (except in the video route).
- The program also accepts an uploaded body sheet (rows are directions, columns are frames; 8 directions, NESW, or NES with W mirrored) with a clip table `name:first column:frames:speed`. `stand` is one frame and gear is designed on it.

### 1.2 Skeleton and part map
- `estimate-skeleton`: 18 COCO joints per frame for 0.1 gen per frame. Identical and mirrored frames are free. Fixes: L/R swaps near side views (6 jumps on NE walk, 4 on NW) are smoothed across the loop; face points on back views are ignored; far-side limbs are guesses. Joints are poor on clothed sprites (a cloak was labelled a leg, a bow a hand).
- Part map v2: every body pixel of every frame is assigned to one of 16 parts (head, neck, chest, pelvis, plus L/R upper arm, forearm, hand, thigh, shin and foot). Each part has an "owned pixels" mask and a capsule around its bone. Front limbs claim their capsule first, and thin dark outline pixels stop a claim.
  - v1 to v2 (walk, 64 frames): near-arm px per side-view frame, mean 30.4 to 98.1 and minimum 0 to 87. Frames with the foot point in empty air: 33/64 to 0/64 (c08).
  - Still mislabels single frames (NE walk f8 arm across the back; dark line pixels under a helmet labelled chest). There is no ground truth.
- `body-skeleton` CLI prints per-frame joints and masks as text for agents.

### 1.3 Anchors
- Seven named anchors: `head, torso, back, legs, feet, handR, handL`. In Set Forge the user confirms the stand pose per facing (21 points). The tool then follows them through all moves and the user clicks to correct drifts.
- Measured against a game's own rig on 4 class sheets: head within 1 px on walk/idle for 3 classes, up to 5 px on the priest walk, attacks drift up to 11 px. Hands were not measured. Nothing is painted on an unconfirmed anchor.
- Anchors are exported per clip, direction and frame in the manifest.

### 1.4 Stand-in / mannequin construction (key-color body)
- The body's frames are recolored into a bright 5-tone key ramp by OKLab lightness. Light stays light and dark stays dark, so limbs remain readable.
- The tone cuts for the test body are in `pink_test.py`: shadow/dark/main boundaries at L = 0.70 / 0.82 / 0.90 (skin 0.87, shaded skin 0.71 to 0.78, highlights 0.92). Anything below L 0.42 is "outline" (lines measure 0.34 to 0.40, shorts 0.44).
- **No dark outline** on the painted routes: the outline tone is a key color just under the skin tone, because a dark outline gets absorbed into gear. The exception is the video model, which needs a dark line in the body's own hue because a flat shape gives it no limbs to read.
- A second mannequin type, the "stand-in / rough piece", is code-placed temporary gear for the model to redraw (route 5.5).

### 1.5 Key color(s): every number
**Chart c05, "Why the body is painted one bright color".** Body pixels wrongly cut as gear, per frame, before any clean-up. Same art, same seed.

| Body | Wrongly cut px per frame |
|---|---|
| Normal skin colors | 31 to 104 |
| Bright key body, first try (dark outline) | 0 to 22 |
| Bright key body, plain outline (outline in key hue) | 0 to 5 |

Frame count is not stated on the chart. Context is route 5.6 (animate dressed stand, S and E facings), measured on paid clips.

**Other key-color numbers**
- The key holds on visible body: at least 96% across 144 frames (route 5.6).
- Pink ramp RGB (outline, shadow, dark, main, light): (204,22,148), (176,16,128), (232,28,164), (255,60,188), (255,128,216).
- Pink classifier: alpha ≥ 128 and OKLab a > 0.08 and b < -0.02 ("strongly magenta, whatever lightness". A red crest leans yellow and is excluded).
- **Per-outfit hue picker** (`p2_picker.py`):
  - It considers outfit colors with OKLab chroma ≥ 0.05 that fill ≥ 0.4% of the outfit's pixels.
  - It scans hues every 2° and needs a ramp whose weakest tone keeps chroma ≥ 0.11. It picks the middle of the widest empty stretch of the wheel.
  - The body's slice extends halfway to the nearest outfit color on each side, capped at 60°. A pixel counts as body only at chroma ≥ 0.08.
  - The ramp copies the pink ramp's lightness steps at the strongest displayable chroma, never stronger than pink.
- Room numbers: pink leaves 27° of hue room for the mage outfit, and the picked hue leaves 131°. On the pilot outfit a green body (hue 160) had 0 gear px within 25° of the body hue, against 41 to 54 per frame on pink. One draw each: the author says this shows green works, not that it is better.
- Figure f08 shows the picked hues in use: the mage and raider bodies are cyan/blue, the ranger and nomad bodies violet, and the knight is fully covered.
- **Video route key:** green hue 160 chosen by the picker for a bronze/red/steel set. Line color (5,86,55), OKLab L 0.40.
  - Design rules: every color at least 0.07 OKLab from every color of another owner, body included ("Phase 1 drift was 0.06 at most"). The body hue must be at least 50° from every strong color of the set.
  - Rim-cleanup rule: a rim pixel within 0.07 of the flat background color and touching it is treated as a blend.
- **Older sheet-inpaint route (Set Forge), loud color family per piece.** Measured OKLab distance from the nearest body color across all shades, on 4 game class sheets:

  | Family | OKLab distance |
  |---|---|
  | Green | 0.108 to 0.118 |
  | Violet | 0.068 to 0.087 |
  | Magenta | 0.060 to 0.087 |
  | Blue | 0.041 to 0.074 |
  | Cyan | 0.024 to 0.061 (unsafe on the mage) |
  | Red, yellow | 0.03 to 0.04 (never used) |

  Only green, violet and magenta are safe on all four, so only 3 families can be relied on. Pieces that never touch (helmet and boots) may share a family and are split by anchor. Touching pieces must not share.
- Stain filter: colors from the body's slice are removed from an approved drawing's palette from chroma 0.02 up.

**Why a key color:** gear separates by color, any uncovered body spot is obvious, and in the paint-on-frames route the palette is "5 body tones + outfit colors", so the cut is exact: the body is its 5 tones and everything else is gear.

### 1.6 Color lock
- Palette at generation: `transfer_outfit` takes `palette`. `inpaint_image` and `animate_with_skeleton_v3` do not.
- Selective lock afterwards, with these rules that survived testing:
  - Judge brightness on the fill only, never the outline (outline share changes with pose).
  - Group colors into materials by hue and strength.
  - Retone only a material more than 2% from its middle value.
  - Keep dark edge pixels as lines.
  - Leave frames that did not slip alone.
- Results across 53 materials: 42 moved more than 4% between frames before the lock, 1 after.
- c06, largest fill brightness swing between frames, before and after:

  | Material or clip | Before (%) | After (%) |
  |---|---|---|
  | Circlet gold (small piece) | 38.8 | 2.7 |
  | Fill, 42 painted frames | 16.6 | 2.1 |
  | Fill, 144 animated frames | 11.4 | 3.3 |
  | Trousers cloth | 11.1 | 2.8 |
  | Robe gold trim | 6.8 | 3.1 |
  | Jerkin leather | 4.7 | 2.5 |

- Route 5.6: 1,941 stained px on a 3-piece outfit, all removed by the lock. Off-palette after the lock is 0, forced by construction.

### 1.7 How pieces are painted (endpoints, frame counts, layouts, masks)

| Route | Endpoint | Layout / limits |
|---|---|---|
| Design | `edit_image` (10 gens) | 8 stand frames, up to 16 frames at ≤64 px. Moves the figure by up to 6 px, so it is used only as a reference and never pasted |
| Sheet inpaint (route 5.1, the shipped program) | `inpaint_image` 10/15/25 gens by canvas (>256 px needs Tier 2) | Many body frames packed on one sheet (88 cells on 512 px). Approved design cells pasted in and protected so the model copies them. Mask marks where gear may go. Each piece in its own loud color family. Duplicate frames packed once. Exports `input.png`, `mask.png`, `prompt.txt`, `HOW_TO.txt` per sheet so any AI can paint it. `crop_to_mask` must be false |
| AI redraw of placed gear (5.5) | `transfer_outfit` hybrid (rough code-placed frames plus approved design), or `edit_image` on a 4x4 sheet | 13 frames per test |
| Animate dressed stand (5.6) | `animate_with_skeleton_v3`, 3 gens per call (2 at 3 frames, 3 at 4 to 14, 4 at 15), fixed seed, bare body's own poses | One call per direction per move |
| **Paint on real frames (5.7, best)** | `transfer_outfit`, 10 gens per call | Up to 15 real key-colored frames at ≤64 px (8 at 65 to 80 px), approved reference, palette, fixed seed. One call per direction |
| Piece painted alone (5.8) | `transfer_outfit` with a piece-only palette | Reference showing the piece whole, palette of body tones plus that piece's colors, words naming one piece ending "nothing else is worn" |
| Video model (5.9) | `animate_image_pixminimax` | 4 to 40 frames in steps of 4, ≤256 px, ≤1000 characters of text, pins only the first and last frame. 40 frames cost 2 gens at 68 or 132 px, 4 at 96, 6 at 64/128/256. 96 px canvas for single figures, 128 px for twins, 16-frame chain links at 2 gens |
| Armed carrier body | `animate_character` skeleton-v3 (3 gens per direction, 71 named motions, no seed) | Prompt "right fist closed, hand held in front", never naming the item |

Prompt patterns: structured JSON (`keep` / `redraw` / per-piece `look`, `shading`, `outline`, `animation`). Closed-skirt wording for robes (legs showing went from 8 to 25 px to 0 to 4 px, same seed). Video locks: "Exactly one sword ... never duplicated, never dropped ... Fixed side camera. Transparent background". Scale in words is ignored, so the body must be in frame as a scale anchor. Send images by `upload:<id>`, never pasted base64.

### 1.8 Cutting and separation
- Sheet route, per-pixel order:
  1. Same as the input at that spot means body.
  2. Close to a piece's color family means that piece.
  3. Close to body colors means redrawn body, which is dropped.
  4. Anything else is "unknown" and reported.

  Position first, hex second, because the AI redraws body pixels in slightly different colors.
- Paint-on-frames route: exact palette cut. The body is its 5 key tones and the rest is gear. Loose bits are dropped.
- Video twin route: nearest-color cut. The bare twin is the body layer and the dressed twin gives the gear layers (one color set per piece).
- Split the outfit into pieces by part map plus material. Same-material neighbours cannot be split, so the design rule is "use different materials".
- **Always restore the body from our own copy after any call.** One inpaint frame sheet changed 1,182 of 7,645 protected px (15%), mostly within 3 px of the mask edge, and made 260 transparent.

### 1.9 Cleanup
- Drop loose bits and pixels outside a zone around the piece (fixes body outline redrawn in gear-family shades).
- Small holes (where one piece crossed another) are auto-filled from neighbouring colors and counted. Bigger ones are reported.
- **Cover rule:** a piece covers its body part and extends 1 px past it, into empty air only. Gaps of 4 px or more are design openings (the face). New edge pixels take the outline color, and a buried old outline takes the fill color so lines do not double.
- **Hide mask:** per-piece, per-frame mask of body pixels hidden under gear, for gear narrower than the body. Results: knight 2 to 12 px of body showing past gear, cured. Between pieces: 128 px sticking out on 240 frames, 121 switched off, no skin exposed. A mask must never switch off a pixel covering skin that would otherwise show. It needs engine support, or the piece drawn 1 px wider.
- Free fixes: keep hands in front of leg pieces (leg piece over hands 0 to 18 px per frame down to 0 on 60 frames). Boot above the ankle under a closed robe 5 to 21 down to 0 to 11 px. Dark share of hip pixels in a leg reference 77% to 22% (reference only, unproven on paid frames).

### 1.10 Fitting
- **Helmets (c07), locked drawing:** one approved drawing per direction moved with the head. Head motion is measured from the dark drawn lines of the upper head within 4 px of the joint estimate (joints alone were not accurate enough), then the cover step is applied. On 104 helmet frames (96 moving):

  | Measure | Before | After |
  |---|---|---|
  | Frames off the head's real move | 28 | 0 |
  | Loose body bits at the helmet | 48 | 0 |
  | Frames with uncovered head bits | 74 | 0 |
  | Body px jutting past the helmet's rows | 111 | 39 |

  The author admits the numbers "share ideas with the fix", so they are close to true by construction. Accepted in motion as "decent". Cost: 0 gens per extra frame (10 for the design). Now on hold because a new project rule says every frame must be model-drawn. The one-run set had the helmet off the head on 27/64 walk frames and 8/32 idle frames before this.
- **Boots:**
  - Code-built from the body's own foot (recolor by lightness) was rejected in motion ("recolored feet").
  - Carried along shin/foot bones: 0 to 11 px bare at worst, but lumpy.
  - Pose clustering by joint angle: 59 distinct boot poses at 25° tolerance, 78 at 15°, out of 304 boot-frames (8 directions x 4 moves). Drawing each pose once is untested.
  - Final answer: paint on real frames.
- **Held items:** a body animated empty-handed cannot hold anything. Attempts:
  - Locked to the tracked wrist (10 gens): stills good, not reviewed in motion.
  - Inpaint per frame (25): fail.
  - Rotated with the forearm in code (0): chewed at angles, crosses the face on E/NE.
  - Cut from a dressed animation: floats, missing on slash f4 and f6.
  - Pinned with a painted fist (0): rejected 3 times in motion as "overlaid".
  - `transfer_outfit` at 80 px (20 gens): walk fail because the model redrew the arm; slash f2 to f5 held, f1 and f6 bad.
  - Armed carrier clip (6): pass, but the model drew its own sword.
  - **Video model taking the item (2 to 6 gens per clip):** best, held on every walk frame, side view only.
  - `create_character` v3 8-rotation sword (1): consistent sword but redraws the body (17 to 53% of body pixels kept).
  - Shield: best centred halfway along the forearm. Good on S/SW/W, fair on N/NW, behind the body on E/NE/SE. Upright items pinned by their middle come out thin. Two-handed grips have never run.

### 1.11 Mixing and compose order
- Pieces painted on the same frames of the same body "line up with no fitting".
- Limit: a cut piece only holds what was visible. In 4 of 8 mixes the result read as one outfit.
- Fix: one call for the whole outfit, then one `transfer_outfit` call per hidden piece per view (about 10 gens). Ranger built from 2 cut pieces plus 2 painted alone shows 1 to 10 px bare per frame vs the whole outfit, at 30 gens per view instead of 50.
- c09, bare body px per frame, front view, 15 frames each:

  | Mix | Cut pieces | Pieces painted alone | Frames ≤ 20 px |
  |---|---|---|---|
  | Horned helmet + jerkin + leg plates | 126 to 155 | 25 to 42 | 0/15 |
  | Wrap + furs + trousers | 92 to 150 | 12 to 33 | 3/15 |
  | Wrap + jerkin + trousers + sandals | 135 to 173 | 2 to 22 | 14/15 |
  | Helm + tunic + trousers + shoes | 29 to 75 | 0 to 10 | 15/15 |

- Pieces painted alone: jerkin passed 15/15 (arms 0 px bare). Trousers left 10 to 23 px at the waistband on 9/15 frames and ran over the hands.
- Only 2 of the 19 pieces across the five outfits are proven with paid frames.
- Export compose: per direction, walk `draw_order[direction]` back to front (`body` plus slot names). For each worn item draw `fill` (patches holes left where another piece overlapped), then `art`. `behind_body` lists the directions where a person put an item behind the body.
- Combination tester over 43 real piece pairs: 3 fight for one place, 26 need an order, 14 are fine.
- Video route stacking order: legs, boots, cuirass, helmet, weapon. The chain order is the paper-doll stack.

### 1.12 Checks, gates and verdicts
- Code checks give each piece **GOOD** or **NEED FIX**: per-frame coverage, loose pixels, palette, flips (frame coverage far from its direction's median), drift, stacking order, loop seam, sheet-to-sheet consistency, `hidden` (added after a spear went invisible behind the body yet scored GOOD), wrong side, thin stray lines, second drawing, held piece missing its hand, tinted body.
- Agreement with human verdicts:
  - First version: 9/10 sets (rules tuned on them).
  - After extension: 6/8.
  - 5 of 6 reviewer-marked faults fired, but 48 of 144 passed frames were also flagged (false alarms).
  - Neither fault from the first review in motion was caught (helmet bob, a head pixel jutting at the rim).
- Rule: GOOD means "no check found a fault", not "looks right". A person must watch every direction loop.
- Gates (`doll.py next` / `go`): pay for design, approve design, pay for frame sheets (rigid pieces skip this), review, save. Exit codes: 0 fine, 1 refused, 2 checks say stop. Each fix waits for a yes/no.
- Spending safety: every paid call is written to a ledger before sending, a call with no answer is never auto-resent, paid art is never overwritten, and an all-black mask is refused before the ledger (15 gens were once wasted on one). `next` gives price, exact MCP or REST call and the import command. Review results were made deterministic after Python set order varied per run (tested across 8 seeds).

### 1.13 Video route (c15)
1. Design five items on one picture, with the body in frame for scale.
2. Lock 5 tones per piece, with the body hue far from all of them.
3. Dress in a chain: one clip per piece in stacking order, each starting from the last frame of the previous one. The body reaches out, takes the item and wears it.
4. Twin picture: dressed and bare figure side by side on one 128 px canvas.
5. Animate both with one prompt ("Both men do exactly the same movement in step"): walk, idle, slash.
6. Cut by nearest color.
7. Drop the taking frames (the model takes 5 to 20 frames regardless of the prompt) and pick a clean loop from the clip's middle.
8. Any subset of pieces on the bare twin. The side view is mirrored for the other side.

Numbers are listed in section 2.

### 1.14 Export format
- Folder: `manifest.json`, `body/<clip>.png`, `items/<set>.<piece>/<clip>.png` plus optional `<clip>_fill.png`, `sample/index.html` and `manifest.js` (player that works without a server), and optional `effects/<clip>.png` (e.g. swing arc, drawn over everything).
- Sheets: one row per direction in `directions` order and one column per frame. Hard alpha (0 or 255).
- Manifest fields: `format` "tool-export" v1, `cell`, `feet_row`, `pixels_cut`, `directions`, `clips` (frames, fps, body sheet), `items` (slot, rigid, anchor, test_art, clips, `colors` for engine palette swaps, behind_body), `draw_order` per direction, `anchors[name]["clip/dir"][frame] = [x, y]`.
- Cell: native by default. `fit` gives the smallest cell that holds everything. A fixed size centres the art and bottom-aligns it, refusing if the art does not fit unless `--cut` is passed. Never scaled.
- One body per export, saved sets only. An Aseprite export exists but has only been read back by the project's own parser.

### 1.15 Costs
c03, generations per finished frame:

| Route | Gens | Frames | Gens per frame | Bought |
|---|---|---|---|---|
| Locked drawing | 10 | 104 | 0.10 | 1 rigid piece, 8 dirs, any frame count |
| Sheet inpaint | 35 | 104 | 0.34 | 3-piece set, 8 dirs, walk + idle ($0.23 actual) |
| Video model | 25 | 48 | 0.52 | 5-piece set, side view, walk/idle/slash incl. design and dressing |
| One-run sheet | 60 | 104 | 0.58 | 4 pieces, 1 paid repair (estimate was 35) |
| Animate dressed stand | 92 | 144 | 0.64 | 3-piece outfit, 8 dirs, 3 moves (72 clips + 20 drawings) |
| Paint on real frames | 10 | 15 | 0.67 | whole outfit, per direction per call; +10 per outfit for design |
| Piece painted alone | 10 | 15 | 0.67 | 1 piece per view |
| AI redraw of placed gear | 90 | 104 | 0.87 | 1 piece, design + 8 calls |

- Recommended budget for one outfit, 8 directions, stand + walk + slash: design 10 + paint 80 + hidden pieces about 20 each on 2 views (or 80 for all 8 directions). Idle adds one call per direction. That is roughly 110 to 170+ gens, about $1 to $1.70.
- A single frame sent alone to inpaint costs the same as a 256 px sheet (10 gens). At 128 px bodies only 1 or 2 cells fit a sheet (about 208 sheets for a full set).
- Second body at a 96 px cell: 65 gens for the tunic vs 35 on the test body.
- Stress test by piece (sheet route): robe 35 (hem changes per frame); cape 55 incl. repair (back over chest on S walk f1 to f3, SE f5 to f7 messy); hood 10 (later off the head in motion); gloves 65 incl. 15 wasted (far too large); bow 20 (locked to one hand, lies across the legs in side views); shield 20 (weakest).
- Total project spend is not reported.

### 1.16 Drift measurements
- **c04**, uncovered body px changed per frame (lowest to highest frame):

  | Route and clip | px per frame |
  |---|---|
  | Animate dressed stand, NE | 4 to 16 |
  | Paint on real frames, E | 0 to 13 |
  | Paint on real frames, S | 0 to 10 |
  | Paint on real frames, NE | 0 to 1 |
  | Paint on real frames, green body | 0 to 1 |

  Outer outline alone: 0 px off on 39/42 frames and 1 px on 3, vs 11.2 px for the earlier route on the same frames.
- **c11**, AI-redrawn helmet stand frame, percent darker than the approved reference: N 27, SE 22, S 20, NW 20, W 11, SW 5, E 4, NE 2 (no palette passed).
  - Helmet S brightness ranged 74.5 to 84 across frames.
  - Boots SE: 5 colors sent, 34 returned, 4 present in every frame.
  - Faces closed: S 54/74 open-face px covered, SW 39/53, SE 22/32.
- Route 5.6 piece drift from its body part at most: helmet 0.93, tunic 1.45, boots 1.49 px.
- Body mismatch is the root cause: dressed clips agree with each other about 4x better than with the real body (3.2 vs 13.4 px per frame, walk). The same engine and seed for the body did not cure it (7.2 px).
- Repaint noise on a still pose: 34% (front) and 37% (side) of armour pixels change on a frame where the body did not move.
- Merged 14-frame calls differed from separate calls by 9.1 px per frame, about the same as a seed change.

### 1.17 Rim (c10, video route)
All five pieces worn on the bare twin. Extra bare px per frame vs the dressed twin:

| Move | Frames | Extra bare px per frame | Frames more than 1 px off |
|---|---|---|---|
| Idle | 8 | 11 to 22 | 0 |
| Slash | 24 | 12 to 43 | 2 |
| Walk | 16 | 12 to 83 | 11 |

The misfit is a rim about 1 px wide.

---

## 2. Quantitative claims with sample sizes, and works / failed / open

**Evidence strength caveat (author's own):** one body, mostly one seed and one draw, thresholds tuned on scored art.

### Works (best evidence)

| Claim | Number | Sample | Evidence |
|---|---|---|---|
| Paint on real frames: whole outfit present | 150/150 frames | 5 outfits x S + E x 15 frames, 160 gens | Measured + stills |
| Every pixel is a palette color | yes | same | Measured (by construction) |
| Stained pixels | 0 | same | Measured |
| Gear touching the frame edge | 0 | same | Measured |
| Uncovered body changing by more than 10 px | 12 frames | same | Measured, "not visible once our body sits under" |
| Designs passing on S and E | 5/5 | same | Stills |
| Outline px off | 0 on 39/42 frames, 1 on 3 | 42 frames | Measured |
| Key color reduces wrongly cut body px | 31–104 → 0–5 | route 5.6 clips, same art and seed | Measured |
| Color lock | 42 of 53 materials over 4% before → 1 after | 53 materials | Measured |
| Locked helmet | see the c07 table | 104 frames | Measured + Motion "decent" |
| Animate dressed stand | accepted "best option for now" | 3-piece, 8 dirs, 3 moves | Motion |
| Hidden-piece repaint | mix bare px down 3 to 10x (c09) | 4 mixes x 15 frames | Measured |
| Jerkin painted alone | 15/15 | 15 frames | Measured |
| Robe closed by words | 8–25 → 0–4 px legs | one outfit, same seed | Measured |
| Video route: item never lost or duplicated | 5/5 clips | 40 frames each, 22 gens | Measured + first look |
| Sword length on every walk frame | 20–22 px; 93–109 of its 100 px | ,  | Measured |
| Twins in step within 3 px | walk 16/16, idle 8/8, slash 24/24; largest 95th-percentile distance 0–1 px | one set | Measured |
| Chain drifted px | 0 | 96 chain frames | Measured |
| Video clip rules passed | 4/7, 5/7, 5/7, 4/7, 5/7 | 5 clips | Measured |
| Sheet inpaint: one design held | 88 cells on a 512 px sheet (also 16 cells) | 1 sheet | Stills |
| Second body (96 px): helmet + tunic fit every walk frame | pass | 1 body | Stills |
| Checks vs human | 9/10, then 6/8; 5/6 faults fired, 48/144 false flags | small | Measured |

### Failed

| Claim | Evidence |
|---|---|
| Sheet inpaint failed in motion: per-frame painting with no shared body logic, overlap holes, pieces do not mix | Motion |
| One-run whole set: all 4 pieces NEED FIX. Helmet off the head on 27/64 walk and 8/32 idle frames | Motion + Measured |
| Code-fitted boots rejected ("recolored feet"). Bone-carry lumpy | Motion |
| AI redraw per frame: color flicker, closed faces, drift up to 27% | Measured |
| Most held-item routes (see 1.10); pinned fist rejected 3 times | Motion |
| Unbake (separating baked gear): 1 to 7% of pixels exact, not usable | Measured |
| Colored marker pixels on joints: 3 to 7 of 18 survive an animation (rule needed 15) | Measured |
| Video route with real colors: dark shorts and dark iron confused (4/7 rules) | Measured |
| Video 64 px canvas: no gain at a higher price | Stills |

### Open / unproven
- Paint-on-real-frames has never been reviewed in motion, and is tested on S, E and NE only (6 directions remain).
- Held items in 8 directions. Sword attack is "unsolved".
- Free mixing of every piece: 2 of 19 pieces proven.
- A second body for the main routes.
- Repeatability across seeds.
- Capes in the new routes.
- The video route beyond side view (top priority; estimated 12 to 20 gens to test).
- The invented hand at the hip (E slash 6, mage and nomad). The darker limb-line idea is built but unproven.
- Bare-back strip on the NE tunic: 12/42 frames, 7 to 18 px.
- Repaint noise on still poses.
- Idle that almost freezes on N/NE/NW.
- Loop seam (partly fixed).
- Painted frame as reference (one outfit, stills).
- Untested: `create_character_state` (palette + seed), 71 named moves, per-joint `z_index`/`depth`, key body combined with loud per-piece families, drawing each limb pose once, `inpaint/edit_image_pro_flash` as a repair step (stated pixel-exact outside the mask).
- `next` loop agent automation was run only against a PixelLab stand-in.

---

## 3. Critical pixel-art review of figures and GIFs

**f01 part map.** The bare body is well drawn: consistent proportions across 8 directions and a clean dark-maroon outline. The v2 map is visibly better than v1: separate feet points, limbs colored per side, and the capsules follow the limbs in side views. The "dashed = behind" skeleton is helpful. Weaknesses: E and W v2 maps still show far-arm pieces mixed into the torso, and the foot regions bleed into the shins. This is a coarse map, as the author says.

**f02 / sheet_inpaint_whole_set.gif (sheet route).** Design consistency across cells is real: same helmet, tunic and boots every frame. As art it is weak:
- The helmet is an oversized brown dome that reads as a bowl haircut or mushroom cap. The crest sits on top as a thin vertical fin, the face is mostly hidden, and its silhouette barely changes with direction.
- The grey tunic is mottled noise with no clear fold shading.
- A dark-pink body outline peeks around the tunic and arm edges on many frames (a halo of body pixels past the gear).
- Boots are flat yellow blobs whose shape changes frame to frame.
- Legs show pink stubs between tunic and boots, with inconsistent coverage.
- It failed in motion, consistent with what I see.

**f03 / redraw_vs_locked_helmet.gif (16 rows, alternating redraw and locked).**
- Redrawn rows: obvious per-direction brightness differences (N and SE far darker and browner). The S face is closed by a dark visor and cheek guards, and flips between open and closed between frames.
- Locked rows: identical gold helmet with the face open. The cheek guards sit naturally, and it follows the head bob without shimmer.
- Remaining locked issues: it is a rigid paste with no per-frame shading. On E/NE frames a pink ear/cheek blob shows at the guard edge. On some 3/4 views a 1 px head edge peeks at the rim (the author's "jutting" count, 111 → 39, confirms this residual).
- The clearest win in the document.

**f04 / code_boots_walk.gif.**
- Left of each pair (painted boots extended by code): chunky olive-gold boots with thick dark outlines. They look pasted on, the toes jump between frames, and the shape breaks on side-view mid-stride frames.
- Right (built from the foot): small yellow recolored feet. They read as painted feet, as the reviewer said.
- Neither is shippable.

**f05 bone carry.** The boots become lumpy brown clumps with single-pixel speckle and broken outlines. They detach from the shins on several side frames, and the far-foot boot sometimes doubles. Clear fail.

**f06 face closure.** A good diagnostic: the repainted helmets add nose and cheek guards and darken the eyes, and the locked version keeps the approved open face. A small red stray pixel is visible at the left temple of frames 1 to 3 (crest-color contamination).

**f07 arm hole.**
- Panel 1, the model's own draw: the pink key body is clearly visible, which shows the key-color convention.
- Panel 3, gear laid on the real body: an arm-shaped notch in the tunic where the bare body's arm differs. This is a convincing illustration of the two-bodies problem.
- Panel 4, painted on the real frame: clean, with the arm readable and correctly in front.
- The panel 4 helmet looks a bit large relative to the head, but it is coherent.

**f08 five designs (`edit_image`, 8 directions).**
- Knight: strong, consistent plate armour with a blue plume, tabard and gold trim. Very good.
- Ranger: good hood and layering.
- Mage: good crimson robe with gold trim, consistent across directions.
- Nomad: wraps read well, with a teal sash.
- Raider: horned helmet and furs; the face and skin are blue key color.
- Directional consistency is high for a single edit call. The visible key-colored skin (cyan, violet, blue) shows the per-outfit hue picker in action.
- The plume and crest flip side plausibly. N views are a little simpler than S.

**f09 / paint_on_frames_knight.gif / paint_on_frames_mage.gif (best route).**
- Knight: the best motion art in the set. Armour shading, outline weight and the gold tabard trim stay stable across all 8 frames in S and E, the legs articulate cleanly in the side walk, and the plume is steady.
  - Flaws: 1 to 2 dark-red stray pixels near the helmet's upper left on several S frames, and the E-view plume drifts 1 px in shape between frames.
- Mage:
  - The robe's front walk still shows a dark slit between the legs on most frames. This looks like the pre-wording version; the "robe opens" fault is documented as "largely cured by words".
  - The circlet's green highlight flickers between frames.
  - Side views show a pink hand popping out of the sleeve on alternate frames (fine), and a lone green/teal speck appears near the hem on one front frame.
  - The hem shape changes per frame (typical for model repaints, and acceptable for cloth).
- Ranger, nomad and raider stills look clean. The raider's horned helmet closes the face to black.

**f10 / mix_helmet_jerkin_plates.gif.** The GIF alternates cut vs painted-alone versions.
- The cut jerkin is only a strappy harness over a bare chest (the "four of 8 read as one outfit" problem).
- The painted-alone jerkin is a full, coherent leather tunic. The sleeves follow the raised slash arm well, with a consistent belt and gold buckle.
- Problems:
  - The horned helmet covers the whole face in a black visor block, which is not attractive.
  - The leg plates start at the knee, leaving dark shorts showing (acknowledged).
  - On slash frames 7 and 8 a pink hand blob is painted inside the jerkin front, a hand-over-chest artifact.
  - The bottom-right mix (knight helm + nomad tunic) has a few loose dark pixels near the feet.

**f11 / piece_alone_jerkin.gif.** Same jerkin assessment: clean, consistent sleeves, waistband and buckle. The trousers row shows the documented waistband gap (pink shows above the trousers on several frames) and a cuff/hand overlap on the slash frame.

**f12 sword floats.** A clear fail illustration. The sword is drawn vertical beside the hip while the arm hangs empty, and the raw output has the pink key body visible on face and arm. As worn, the sword floats about 2 px from the hand.

**f13 chain.** A green mannequin with a dark green line reaches, grabs and dons a red cuirass. Charming and coherent, but the donned cuirass sits on the front-back edge and reads like a backpack or bib rather than wrapping the torso. The chain frames are low detail.

**f14 / f15 / f16 / video_twins_*.gif / video_all_pieces_idle.gif (video route).**
- Strengths:
  - The twins really are in step on walk.
  - The overlay panels (cyan = shared, salmon = dressed only, yellow = bare only) show mostly 1 px rims, matching c10.
  - The sword stays the same length and color, and the helmet holds its shape.
  - Colors are flat and steady.
- Weaknesses as pixel art:
  - Sprites are chunky and low detail, with near-flat fills and little shading. The loud lock colors (gold helmet, salmon cuirass, blue legs, grey boots, lilac sword) are placeholders; f15 shows each piece with a second tone set.
  - The cuirass covers only the front half of the torso in side view, so the green back stays bare.
  - The boots are smaller than the feet (toes and heel show), and the leg armour swallows one boot (one leg blue to the foot, the other grey).
  - The sword is carried low and angled at the hip; it reads as held but not gripped.
  - A 1 px green rim shows at the helmet chin and limb edges in idle.
- Slash:
  - Two frames carry a large lilac swoosh arc painted on the figure layer.
  - On some slash frames the dressed twin raises the sword overhead while the bare twin's raised arm is hard to see. The silhouette overlay would hide an arm desync inside the torso silhouette, so the "24/24 in step" metric (95th percentile, 3 px) may be generous on arms.
  - The walk loop starts mid-step and includes a standing frame (acknowledged).
- Side view only.

**animate_dressed_ne_walk.gif (route 5.6, NE walk).**
- Helmet stable.
- The tunic shows the arm-hole artifact on bottom-row frames 9 to 11 (pink sliver and dark gaps where the real arm differs).
- The shoulder edge is notched by 1 to 2 px on several frames.
- Boots are decent but change silhouette between frames.
- Accepted in motion at the time. The new route visibly improves on it.

**Charts.** c01, c02 and c14 are the author's qualitative grades, not measurements. The other charts duplicate the tables. In c02, "Good" for paint-on-real-frames fit while moving is graded without a motion review.

---

## 4. Ideas that look novel compared with a typical "chroma mannequin + per-item edit + skeleton posing" pipeline

1. **Per-outfit key hue picker.** It picks the hue in the widest empty gap of the outfit's strong colors (OKLab chroma ≥ 0.05, 2° scan, chroma ≥ 0.11 ramp), builds a 5-tone key ramp that keeps the body's lightness steps, and derives the matching cut rule (slice halfway to the nearest outfit hue, capped at 60°). It is not a fixed green/magenta.
2. **Key body without a dark outline.** The outline tone is a key color just under the skin, because dark outlines are absorbed into gear (0–22 → 0–5 wrongly cut px). The opposite applies for video models, which need a dark line in the body's own hue to read limbs.
3. **Palette passed to the dressing call, including the 5 key tones,** so the result is cut by exact palette membership and colors do not flicker.
4. **Paint gear directly onto the stored real frames** (`transfer_outfit`, up to 15 frames per call, one call per direction) instead of dressing a stand frame and re-animating a dressed copy. This removes body disagreement (3.2 vs 13.4 px) and keeps body change to 0–1 px on NE.
5. **Always restore the body from the stored copy** after any generation, with protected pixels distrusted (15% changed).
6. **Selective material color lock:** fill-only brightness, retone only materials more than 2% off their middle value, keep outline pixels, leave good frames alone.
7. **Hidden-piece recipe for mixing:** paint the whole outfit once, then repaint alone only pieces that another piece occluded (piece-only palette, "nothing else is worn"). Plus per-item **fill layers** that patch overlap holes, drawn before the art at export.
8. **Hide masks and the cover rule:** per-frame body-hide masks for gear narrower than the body, 1 px cover into empty air only, gaps ≥ 4 px kept as openings, and outline re-assignment so lines do not double.
9. **Head tracking from drawn pixels** (dark upper-head lines within 4 px of the joint) for locked rigid gear, instead of trusting skeleton keypoints.
10. **Video-model "taking" for held items:** a start frame with the item floating in front, where the model draws the body grabbing it, and the grab frames are cut off. **Chain dressing** in stacking order. **Twin canvas** (dressed + bare figure animated together in one call) to get body and gear layers from the same motion.
11. **Armed carrier body clip** ("right fist closed, hand held in front", never naming the item) so that a held item has a real grip pose.
12. **Loud color family per piece** on whole-set sheets (only green, violet and magenta measured safe), with position-first, hex-second separation (same as input = body; near a piece family = piece; near body = dropped; else reported).
13. **Design-first gate with the design as reference only** (never pasted, because the edit call shifts the figure up to 6 px). A painted frame is better as a second-pass reference.
14. **Pose clustering by joint angle** (59 boot poses at 25° of 304) as a basis for drawing each limb pose once (untested).
15. **Evidence-labelled research** (Motion / Measured / Stills / Tool text), with checks scored against human verdicts and false-alarm rates reported.
16. **Spend ledger written before every call,** no auto-resend, and refusal of degenerate masks (all-black) before paying.
17. **Prompt rules:** set scale with the canvas, not words. Name neighbouring pieces in different materials so they can be split by color. Closed-skirt wording for robes. Structured `keep` / `redraw` JSON.
18. **OKLCH recolor that keeps per-color lightness, with hue shifting** (warm lights, cool darks, low-chroma outlines). The export lists `colors` per item for engine-side swaps.
19. **Duplicate-frame dedupe on sheets,** and free joints for identical or mirrored frames.
20. **Side tools:** pair combination tester proposing draw order per direction, runtime material masks (tint, shine, pulse), damage states and material "upgrade ladder" from one design (all stills only).
