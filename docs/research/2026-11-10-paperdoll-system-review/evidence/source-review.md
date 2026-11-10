# third-party source review

Read-only review. Nothing was executed. Paths are relative to `src/third-party/`. `sf/` = `tool/setforge/`.

## 0. Architecture in one paragraph

There are two pipelines. The **legacy pipeline** (`tool/pipeline.py`, `standin.py`, `cut.py`, `checks.py`, `compose.py`, `slots.py`) paints a one-color "screen" stand-in and cuts gear off it by color. Its only provider is the free code painter (`providers/__init__.py:5`, `_PROVIDERS = {"test": TestPainter}`), so it never reaches PixelLab. The **production pipeline is Set Forge** (`sf/flow.py`). The real body stays as it is. Many frames are packed on one canvas, an inpaint mask allows paint only in each piece's zone, and the prompt asks for gear in loud OKLCH "color families". Gear is then separated by changed pixels plus hue family plus zone, then locked, covered and fitted by code, then recolored. A third line of work, the "pink body" mannequin experiments, lives in `tools/pink_*.py` (out of scope for production, but it is where the hot-pink mannequin, tones and animate-with-skeleton-v3 flow are).

## 1. PixelLab endpoints and cost logic

| Endpoint | Where | Parameters | Cost logic |
|---|---|---|---|
| `GET /v2/balance` | `sf/send.py:55-64` | none | Free. Tests the token. `tiers.remember` reads `subscription.plan` (`sf/tiers.py:43-48`) |
| `POST /v2/inpaint-v3` | `sf/send.py:167-168, 180` | `description` (prompt.txt), `inpainting_image` {type base64, format png, `size` w/h}, `mask_image` (converted to greyscale `L`, white = paint, `send.py:77-81`), `crop_to_mask: False`, `no_background: True`. No seed, no palette, no color_image | Estimate from `CANVAS_PRICE = ((256,10),(341,15),(512,25))` gens (`sf/fitting.py:13`). Tier canvas cap 256/512/512 (`sf/tiers.py:11-15`), checked against the live account before sending (`send.py:163-165`). Real USD from `usage.usd` in the answer (`send.py:111-123`), else the account-wide balance difference (`send.py:214-217`) |
| `GET /v2/background-jobs/{id}` | `sf/send.py:126-142` | poll every 5 s, 600 s timeout | Free. `fetch_call` re-collects a known job for free (`send.py:234-242`) |
| `POST /v2/estimate-skeleton` | `sf/jointbuy.py:137-141` | `image` only, padded top-left onto a square canvas (`square`, 117-123) | `GENS_PER_FRAME = 0.1` (`:22`). Identical frames (SHA-256 of RGBA with transparent pixels zeroed, `:41-44`) and exact mirrors are free: answers are copied, or flipped with `x' = w/side - x` and LEFT/RIGHT labels swapped (`mirrored_answer`, `:158-161`). Moves the tool posed itself are free |
| `POST /v2/inpaint-v3` (experimental) | `experimental/unbake.py:115-116` | same shape, 256 px canvas, mask = color-guessed gear | once per body, marker file |
| `POST /v2/animate-with-skeleton-v3` (tools only) | `tools/pose_move.py:~125-138`, `tools/pink_test.py:151-159`, `pink_full.py:129`, `pink_tunic.py:137` | `description`, `action`, `direction` (north...north-west), `view: "low top-down"`, `first_frame` (base64 png), `first_frame_keypoints`, `keypoints[]` (labels with x/y as 0..1 fractions of the frame width, `pink_test.py:90-91`), `no_background: True`; pink runs add `seed: 1137` | 3 gens per direction |
| `POST /create-character-with-8-directions`, `/characters/animations` (`mode: "template"`), `GET /characters/{id}/zip` | `tools/new_body.py:101,132,144` | template animations | tool only, outside the allowed model list for a v3 pipeline |

Paid-call safety (shared pattern): the ledger writes the intent before sending (`flow.py:194-195`), an `O_CREAT|O_EXCL` claim file blocks double sends (`send.py:145-152`), `sent` is saved before the POST (`send.py:175-177`), an HTTP error un-claims the call (not charged), a network error marks it `lost` and it is never resent automatically (`send.py:189-190, 245-248`). `cost.report` compares against a measured single-frame price of $0.08 (`sf/cost.py:4`). `maker.py:41` holds `USD_OF_SHEET = {10: 0.08, 25: 0.15}`.

Prompt (`sf/fitting.py:210-227`): "SAME character...", per piece "color it ONLY in <family> shades (<6 hex>)", "Do not redraw the face, hands or skin", "No skin tones, no brown, no red, no yellow on gear", "a dark outline in the piece's own darkest shade", and when reference cells are present: "The first N cells ... already show the approved design. Copy that design exactly."

Sheet layout (`sf/fitting.py:180-207`): cells at pitch fit_box + `GAP = 2`. Approved design cells are pasted first, unmasked ("protected references"). Each target cell's mask is its zone. Planning: `plan_canvases` (`:81-93`) picks the cheapest canvas; `plan_sheets/_pack` (`:96-143`) packs whole direction cycles largest-first, each sheet paying one cell per direction for its design reference, and ranks (any split cycle, gens, sheet count). Design stage = stand in every facing plus frame 0 of each move, deduplicated by hash (`:58-68`). Identical frames are painted once and copied (`unique_frames`, `:41-55`). Rigid-only sets buy no frame sheets (`flow.py:145-146, 279-284`).

## 2. Stand-in / mannequin

**Legacy screen stand-in** (`standin.py`): four keys, `lime (70,255,40) #46FF28`, `pink (255,40,190) #FF28BE`, `azure (20,140,255) #148CFF`, `violet (135,40,255) #8728FF` (`:9-14`). The choice skips any key whose words appear in the description (regex lists `:17-22`), then takes the key the body's saturated pixels use least (`choose_screen`, `:38-52`). The tones are **not discrete**: color times `0.72 + 0.28*clip(lum/0.75)`, a continuous brightness from Rec.601 luminance (`make_stand_in`, `:55-64`). The key test is HSV hue ±16°, S ≥ 0.55, V ≥ 0.30 (`:23-25, 67-74`). No part map, no limb line, no protection.

**Pink mannequin (tools/pink_test.py)**: a 5-tone ramp, `RAMP = #CC1694 outline, #B01080 shadow, #E81CA4 dark, #FF3CBC main, #FF80D8 light` (`:33`). The tone comes from OKLab L via `np.digitize(L, CUTS=(0.70,0.82,0.90))`; L < `OUTLINE_LIGHT 0.42` takes the outline tone, a pink rather than a dark line (`to_pink`, `:60-69`). The cuts were measured on one body (`:36`). No limb line exists anywhere in the codebase (searched).

**Set Forge (production)** keys the *gear*, not the body. Families are OKLCH hues `green 145, violet 305, cyan 205, magenta 345, blue 265`; red, orange and yellow are excluded because they "sit on skin and leather" (`sf/color.py:7`). Each ramp is an outline (L 0.22, C 0.0585) plus 5 shades at L 0.32/0.46/0.60/0.74/0.88, C 0.13, with chroma clamped into gamut by bisection while lightness stays fixed (`:8-10, 49-69, 87-90`). `assign_families` (`:115-128`) ranks families by OKLab distance from the body palette (safe ≥ 0.055) and avoids sharing a family between pieces in the `TOUCHING` table (`:14-15`).

**Body part maps**:
- v1 `sf/bodymap.py:121-130`: every pixel goes to the nearest bone capsule (12 bones, half widths per 50 px body, `:18-23`).
- v2 `sf/skeleton.py`: 16 parts (`:19-25`). Extra points: WAIST at 0.68 neck→hips, CHIN, and a TOE inferred as the farthest body pixel at or below the ankle within 0.24·height (`_toe`, `:142-155`). `frame_parts` (`:220-245`) claims parts front to back (`_order`, `:203-217`, near limb first). Front limbs flood-fill from their bone seed through their capsule but stop at drawn outlines (`_grow`, `:120-139`). A shin's capsule end is capped at the ankle (`_capped`, `:181-193`). Leftover pixels go to the nearest capsule, with a +2 px penalty on walled limbs. `outlines()` (`:103-117`) marks pixels darker than 0.55 × median luminance, minus any 3×3 all-dark block (cloth). In E/W views `side_for` (`:266-292`) decides near/far by counting outline pixels along each limb's capsule edge (swap if the other side scores > 1.15×). `near_for` uses the lower foot in N/S views. Joint cleaning: L/R swap kept consistent frame to frame (`bodymap.steady_frames`, `:49-60`), then a cyclic [-1,0,0,+1] average (`:69-73`). Person edits are replayed through bone space (`to_bone/from_bone`, `:305-323`).
- Protection: only the inpaint mask. Outside the zone, `clean_result` restores every pixel from the input (`sf/cleaning.py:40-43`). The face and hands are protected only by prompt words. The helmet zone is head part + 4 px (`sf/profile.py:34`) and includes the face. `cover.py` keeps face openings ≥ 4 px open except in `NO_FACE = ("N",)` (`sf/cover.py:9,13,53-67`).

## 3. Extraction

`sf/cleaning.clean_result` (`:28-44`): if every pixel is opaque, pixels exactly equal to the [0,0] corner color are cleared. The sheet shift is then searched in ±20 px on ~1500 sampled protected pixels, skipped if ≥ 99% already match (`:8-25`). The sheet is rolled back, the changed protected pixels are counted as leaks, and everything outside the mask is restored.

`sf/separate.separate_frame` (`:71-151`), per cell:
1. `changed` = opaque and not **exactly** equal in RGB to the body (`:82-83`). Changes outside the zone are counted and dropped.
2. Tint rejection: a changed body pixel with |ΔL| < 0.07 and chroma < 0.07 is the body tinted, not gear (`:89-91`).
3. Family: chroma ≥ 0.04 and hue within 32° of the family, nearest family wins (`:93-100`).
4. Shared family: the pixel goes to the nearest anchor ellipse of `PIECES[m]["zone"]` (`:109-114`). These zones are *not* scaled by body height, unlike `zone_mask`.
5. Each piece keeps only its own zone grown by 2 px; out-of-zone family pixels become `astray` (`:116-120`).
6. Dark adoption: dark (L < 0.34, chroma < 0.07) or astray pixels touching an owner take that owner, by majority with deterministic tie-breaking, for up to 2 passes (6 without zones) (`:121-131`).
7. Leftovers within OKLab 0.06 of a body color count as redrawn body. Dark or grey (L < 0.45, C < 0.05) on the body counts as a redrawn outline. The rest is `unknown` (`:136-142`).

Anti-aliasing: nothing explicit; inpaint output is used as is (`harden_alpha` exists only in `cleaners.py`). Holes: `hidden_fill` (`:154-174`) closes each layer with radius 2, fills the gaps under *other* pieces with the nearest color into a separate `_fill` layer, and counts radius-5 gaps as `too_big`. Rigid pieces keep only `largest_shape` (`:211-222`): erode 1, dilate 2, keep the biggest blob, which drops 1-2 px "wire" outlines. Strays: blobs of 2 px or fewer (`specks_of`, `:177-186`), and blobs mostly outside the zone (`outside_own_zone`, `:343-349`), are fixed only after a person approves.

Key-colored gear: the legacy route forbids keys whose words appear in the description. Set Forge cannot make green gear directly. It always paints in family colors and recolors later. Dark gear outlines are recovered by adoption (step 6). A body outline redrawn in a family hue is removed by the zone (step 5).

Cleaners (`sf/cleaners.py`, ported from `mss_core`): `harden_alpha` 128; `lock_near` within weighted RGB 2r²+4g²+3b² ≤ 900; `stabilize` aligns frames on the upper-half centroid and lowest row; `remove_orphans` removes 8-isolated pixels; `remove_background` floods only corner colors (±16) connected to the border; `denoise` (`:164-236`) handles islands of ≤ 1/2/4 px with an adaptive similarity of median neighbour Δ²·3+300 clamped 500..2800, leaves colors used elsewhere alone, recolors or removes edge islands; `compare_mirrored`. In production only `remove_background` (upload) and `compare_mirrored`/`remove_orphans` (verdict, report-only) are used. `tools/ai_clean.py` prepares MCP edit/transfer jobs and cuts back with `DIFFERS = 30` summed RGB, alpha 128, specks ≤ 3, then snaps to the palette.

## 4. Fitting and layering

- Slots and order: `PIECES` (`sf/profile.py:20-31`): cape 10 (60 from N/NE/NW), boots 20, legs 30, armor 40, robe 45, gloves 50, helmet 70, weapon/shield 80. "Behind body" is only a manual per-direction flag (`flow.set_facing_fix`). `wrong_draw_order` only notes it (`separate.py:33-34, 331-336`). Export `draw_order` = behind pieces, body, the rest (`export.py:114-122`).
- Rigid pieces (helmet, weapon, shield): one approved stand drawing per facing, moved by integer translation onto each frame's grip point (`lock_to_anchor`, `separate.py:225-234`; `flow._lock_all`, `:670-700`). Weapons rotate with the elbow→hand angle only on `WILD_CLIPS` with posed limbs (`flow._place`, `:566-579`), using `turn_about` (Scale2x ×2 twice, then a nearest sample, `separate.py:258-276`).
- Holding (`sf/holding.py`): keywords pick one_hand / upright / two_hands / forearm. Forearm grips sit at the elbow-wrist midpoint (`:51-59`). For CENTRED kinds, the drawing's centroid goes on the grip (`flow.py:682-684`). Two-handed weapons turn with the line between the hands if the hands are ≤ 0.35·height apart (`:62-71`).
- Head movement (`sf/headmove.py`): template-match the stand frame's upper 60% head outline pixels (or all upper pixels if there are fewer than 8 line pixels) within ±4 px of the joint guess, with per-channel tolerance 30 (`:15-47, 80-107`). Frames scoring < 0.5 or tied are settled from looping neighbours (`_settled`, `:50-61`). An independent check compares the head silhouette's top row and middle with the piece's (`measure`, `:129-152`, off if |dy| ≥ 1 or |dx| > 1).
- Cover (`sf/cover.py`): fill the owned part plus 1 px into empty air, never onto other body parts; keep openings of 4 px or more; cover loose body bits of 3 px or fewer; fill outward from neighbour colors, skipping dark ones; new edge pixels take the outline color. `cover_direction` (`:141-157`) unions the needs of every frame into one drawing (only when the frames are exactly one moved drawing, `not_one_drawing`), then cleans up double lines, nubs and thick dark blocks.
- Fitboots (`sf/fitboots.py`): boot area = foot part plus the shin past `CUFF_SHARE 0.5` in bone space (`:29-42`). The body's own pixels are retoned by percentile banding (0.33/0.70) into hard-coded magenta `SHADES` (`:12`); lines (< 0.55·median) stay as line; a top-edge line, a light cuff and a shadow sole are added (`:45-100`).
- Color (`sf/color.recolor_table`, `:141-164`): per exact color, keep OKLab L, set hue, scale chroma, add lightness, outline chroma ×0.6, and lean highlights toward hue 70 / shadows toward 275 by up to 14°. `materials.py:13-28` holds presets; `ramp_table` maps L rank to a fixed ramp; `flames`/`glow` effects are seeded per cell.

## 5. Checks and verdicts

Per track (`sf/separate.check_track`, `:357-383`): gone (< 4 px, STOP), size (< 0.35×median, STOP), jump (`checks.jump_frames` reach 8, slide > 4 px with IoU gain > 0.25, STOP unless 85% stays on the body), flip (cover share differs from median by > 0.3, STOP, non-rigid), shimmer (rigid IoU distance > 0.45, LOOK), colors (> 10% beyond RGB 44 of the design palette, LOOK), off_zone, specks, unplaced (unknown > 4% of changed, STOP), redrawn, big_holes (> 6 px). Wild clips (`attack`, `slash`) skip jump, size and flip.
Whole piece (`flow.py:802-848`): leak > 0.2% of protected pixels, missing facing, stray share > 0.3, a second shape ≥ 30% and ≥ 12 px, a held piece farther than 0.24·height from the hand, draw order, thin facing (< 0.3 × the largest).
Verdict (`sf/verdict.py`): seam jump on the last→first frame (reach 8), off_head, bits_left, outside zone > 0.35, gloves > 1.5× the hand parts, mirror loss (shared < 0.3 and the body mirrors 0.2 better), a hidden held item showing < 0.2, sheet-to-sheet median cover gap > 0.2 or light gap > 30.
Legacy `checks.py:97-142`: all frames returned, zero body shift, erased < 2%, screen outside < 2%, slot cover caps, palette drift > 8% (STOP).

## 6. Export

`tool/export.py`, documented in `docs/EXPORT_FORMAT.md`: `manifest.json` (`format: tool-export`, v1; cell; feet_row; pixels_cut; directions; clips with fps; items with slot, rigid, anchor, colors, behind_body, per-clip `art` and optional `fill`; `draw_order` per direction; anchors), `body/<clip>.png` and `items/<set>.<piece>/<clip>[_fill].png` (rows = directions, columns = frames), and a sample HTML player. The cell can stay as made, `fit`, or a fixed size that centres sideways and puts the feet on the bottom row. Nothing is ever scaled. Cutting is refused unless `--cut`. `compose_frame` (`:212-242`) is the reference compositor. An experimental `.aseprite` writer exists.

## 7. Bugs and risks

1. **Scale2x is wrong** (`separate.py:248-253`): when `first == second` the code samples the *diagonal* pixel (y±1, x±1) instead of the edge neighbour B/D. Every rotated weapon is affected; this may be why the skill reports turns that "look chewed".
2. **Contradicting instructions**: HOW_TO.txt says "Leave no_background unset" (`flow.py:190-191`), while `send.py:168` sends `no_background: True`.
3. **np.roll wrap-around** in shift and jump searches (`checks.py:89`, `cut.py:35`, `cleaning.py:22,38`): pixels at one edge match the other edge, and a rolled sheet carries cells into their neighbours.
4. Shared-family ownership uses unscaled 48 px ellipses (`separate.py:110`), while zones are scaled by `body_height/48`. On large bodies the split is wrong.
5. `smooth_frames` treats every clip as a loop (`bodymap.py:69-73`; `profile.py:545-548`), which blends the first and last frames of attack/slash. `_swap` swaps arms and legs together (`bodymap.py:37-42`).
6. `hands_from_joints` requires an `idle` clip (`profile.py:525`).
7. Exact-RGB `same` test (`separate.py:82`): gear that matches the body pixel under it disappears; a slight requantise turns body pixels into "changed".
8. `_lock_all` indexes `_painted_cell(...)["layers"]` without a None check (`flow.py:677`).
9. Export: one set's `behind_body` moves the whole slot for every set (`export.py:119`).
10. Autofix snapshots are numbered by log length, so they are reused after undo (`autofix.py:32`), and undo does not restore `cover_boots`/`fit_boots`/`hand_edits` (`:35`).
11. When `usage` is missing, USD comes from the account-wide balance difference, which picks up concurrent spending (`send.py:214-217`).
12. Performance: `part_mask` reloads a PNG on every call inside nested loops (`skeleton.py:455`, `bodymap.py:186`); blob and fill loops are pure Python.
13. Tuned to one body: zones "for a 48 px body"; `FLIP_GAP`, `HOLD_REACH` and `NO_FACE` measured on a single set; fitboots' magenta shades; every `tools/pink_*` script hard-codes 68 px, `LEG_ROW 46`, `BOOTS_TOP {"S":51}`, and per-frame `HELMET_NUDGE`/`ANGLE_FILL`/`WHOLE_HELMET` (`pink_held.py:117-124`).
14. Untested paths: the legacy pipeline has no real provider; the experimental modules have no visual judgement.

## 8. Algorithms worth borrowing, and weak ones

Worth a look:
- `sf/fitting._pack/plan_sheets`: cost-ranked packing of whole direction cycles, with reference cells, onto inpaint canvases.
- `sf/cleaning.clean_result`: sheet-shift recovery from protected pixels, a leak metric, and a hard restore.
- `sf/separate.separate_frame`: zone, then hue family, then outline adoption, with tint and redrawn-body rejection, and every count reported.
- `sf/skeleton.frame_parts` + `outlines` + `side_for` + `_toe`: an outline-walled, front-to-back part map built from 15 estimated joints.
- `sf/jointbuy.plan/mirrored_answer`: free reuse of identical and mirrored frames for estimate-skeleton.
- `sf/headmove.clip_moves/measure`: following the head by its pixels, with neighbour settling and an independent check.
- `sf/cover.cover_direction` + `_no_double_line`/`_no_nubs`/`_soften_thick_dark`: completing coverage with a clean 1 px outline.
- `sf/fitboots.fit_frame`: boots built in code from the foot mask.
- `sf/separate.largest_shape`: erosion core that drops wire lines. `sf/separate.hidden_fill`: per-layer fill sheets.
- `sf/color.recolor_table`, `lch_to_rgb`: OKLCH recolor that keeps L. `sf/materials.ramp_table`.
- `sf/verdict.lost_in_mirror`, `sheet_differs`, `seam_jumps`: checks across frames and sheets.
- `sf/cleaners.denoise`: adaptive island cleanup.
- `tools/pink_tunic.split_pieces`: nearest palette plus a region penalty. `tools/pink_full.lock_gear`: neighbour-vote repaint.

Weak: legacy `standin`/`cut` (HSV threshold on continuous tones, and a shift that is only reported); brute-force `jump_frames` with wrap; buggy `_scale2x`; looping-only smoothing; the hand-tuned pink tools; keyword-based `holding.kind_for` and `maker.guess_piece`.
