# pixellab-pip re-review (2026-11-07)

Scope: every Python script under `pixellab-pip/skills/pixellab-pip/assets/` (including `finish/` and `fixlib/`), its tests, and its
paper-doll docs (`references/paperdolling.md`, `animation.md`, `animation-doctor.md`, `armor-clothing.md`, `finishing.md`,
`local-asset-assembly.md`, `aseprite-cli.md`, `image-input-roles.md`, `weapon-*.md`, `docs/pixellab/paperdoll-skeleton-v3-archive-review.md`,
the paperdolling research spike and system plan, the skeleton-v3, chibi-base, HD region and RPG Maker notes). Pip HEAD `a62c47d`.
Earlier reviews: [paperdoll-py-asset-review-2026-10-24.md](paperdoll-py-asset-review-2026-10-24.md) and
[tools/pixellab_pip/pixellab_pip_paperdolling_review.md](tools/pixellab_pip/pixellab_pip_paperdolling_review.md).

Method: the main agent and an independent reviewer subagent each read pip and PixelDoll without seeing the other's conclusions, then
the main agent challenged the reviewer's shortlist with offline replays. A same-day follow-up audited every open item of the
original reviews, with two live checks ($0.187). Scratch scripts lived outside the repository.

## Verdict

Nothing from pip should be ported. Pip's scripts are finishing helpers for an agent CLI working on `animate_image` and
`create-character-state` composites. PixelDoll's chroma mannequin, skeleton posing and gates already cover the same ground, usually
more strictly. One item from the original 2026-10-24 review was never resolved and is confirmed live: long hair is cut where worn
armor sticks out past the body (below). Three small leads remain, none of them a pip quality improvement.

## What changed in pip since the October reviews

`paperdoll.py` was rewritten in pip `6bf62b0` (2026-11-01). The filter-heavy diff extractor reviewed on 2026-10-24 is gone. The new
script copies every changed pixel into an overlay and refuses the edit unless base plus overlay reproduces it exactly. Run on real
`edit-animation-v2` outputs against their bases (`spikes/api/out/s4_items/sk_*_south`, 8 pairs): 0 body pixels stayed exact, 6 of 8
were refused (erasure), and the 2 that "passed" put every body pixel into the layer (helmet 619 of 619, boots 618 of 618). It only
suits edits that leave unmasked pixels exact, and pip's own doc says a full-body redraw can also recompose exactly. Rejected.

## Offline tests run in this review

**Pip's animation doctor (`fix.py --check-only`) on PixelDoll's frozen benchmark.** All 20 bench cases (`app/test/fixtures/bench`)
were replayed through production `runCase`; the 15 with posed clips (608 posed cells, 76 clips) were each checked twice, as the item
layer alone and composited over its base cell.

- It adds no discriminating signal. On composites, every east slash flags the same frame for `head_change` (the arm passes the
  face) and most slashes flag `prop_drift` (the swing itself), whether PixelDoll passed or failed the clip.
- It misses real failures: the jester (`fail:G3` in all 5 views) gets no finding.
- All 6 flags on clips PixelDoll passed were inspected at 3x and are false positives: c-greathelm walk south (`weapon_lost` frames 6
  and 8), n-cloak128 walk north (`weapon_lost` 4), a-chest and c-greathelm walk east (`broken_thin`), b-tunic walk north
  (`loop_seam`, `missing_inbetween`), a-sword96 walk south (`loop_seam`, `jump`).
- On real body slash frames (`docs/testing/img/.../body-source-inspection`), its only mid-severity flag on the clean east rows is
  the same arm-over-face frame.

Its thresholds were calibrated on 96 to 256 px `animate_image` heroes; PixelDoll's skeleton-posed cells are a different
distribution, and its body checks are keypoint based (`rig/clips.ts`, `rig/freeze.ts` feet drift, `items.ts` grip side).

**Pro Flash inpaint as a cheaper repair route.** Pip measured 43 of 43 calls exact outside the mask. PixelDoll already has the
quality comparison: S4 `pfinp` is pixel exact outside the mask but about 10 % cheaper while losing 2 to 8 points of key fidelity and
misregistering frames ([S4](../spikes/S4_model_routing.md)). Its "New layer with changes" output only crops the inpaint to the mask
([S1](../spikes/S1_api_feasibility.md), SHARED_NOTES). No change.

**Content-policy refusals on bare bodies.** Pip's 4 of 4 refusals for a nude south base are already the basis of PixelDoll's bare-skin
wording ([bare-skin-base-wording-2026-10-25.md](bare-skin-base-wording-2026-10-25.md)), and `pixellab/client.ts` classifies code 5000
as a policy refusal and never retries it.

## Script by script

| Pip item | Verdict |
|---|---|
| `paperdoll.py` extract and compose | Reject (measured above); compose duplicates `compose.ts` and `recompose` |
| `fix.py`, `fixlib/measure.py`, `thresholds.py`, `plan.py`, `report.py`, `frames.py`, `model.py` | Reject (measured above) |
| `fixlib/repair.py` | Reject: rescale and grid vote do not apply to native-scale output; gray-to-red smudge mapping was already rejected (`docs/testing/item-quality-follow-up-2026-10-22.md`) |
| `fixlib/timing.py` (drop a frame, hold the previous one) | Reject: a held layer frame desyncs from the body frames |
| `fixlib/colour.py` | Covered by `dress/palette.ts` (same OKLab math) |
| `finish/recolor_groups.py` | Covered and better here: exact index swap with `variantRamp`; pip clips out-of-gamut colors per channel (hue shift) and mutates its global `NAMED` table |
| `finish/colormatch.py`, `apply_palette.py` | Covered and better here: `normalizeItemPalette` and the palette repairs have a distance cap and refuse ties; pip snaps without a cap and scales brightness globally |
| `finish/recolor_like.py` | Reject: old-still to new-still retargeting is not a paper-doll need |
| `finish/despeckle.py` | Reject. Its median invents off-ramp colors (red and blue neighbors gave (100,0,100)), it treats every 1 px dither pixel as a speck (25 of 25 changed), and its stray rule would erase the 4 px fg grip piece of the audit sword. A palette-safe variant would change 0 to 6 px per fixture cell, mostly real details; PixelDoll's component floors already drop strays |
| `finish/scrub.py`, `recolor_trail.py`, `find_muzzle.py`, `dir8_finish.py`, `slash_layer.py`, `bake_fx.py`, `blade_trail.py`, `throw_prop.py` | Reject: they clean flashes and trails that `animate_image` paints; skeleton posing plus `dropOffBody`, `sizeFloor` and `trimToKeyframe` handle smears; effect layers are new scope |
| `finish/ground_snap.py` | Covered: `rig/planting.ts` and the feet-drift warning; items follow the body |
| `pad_sprite.py` | Covered: `padOf`, `padImg` |
| `make_sheet.py` | Covered by the exporters, except its `hit_frame` field (lead 1) |
| `preview_gif.py`, `showcase_gif.py`, `_gif.py` | Covered by `studio/shareMedia.ts`, except a decoded-fidelity check (lead 3) |
| `normal_map.py` | Reject for now: `create_normal_map` is outside the model list and per-layer normal maps are new scope |
| `analyze_style.py`, `project_style.py` | Reject: on fixture cells it called the outlined base "selective outline" and the helmet "lit from bottom-right" |
| `background_removal.py` | Reject: PixelLab returns transparency; key logic lives in `image/chroma.ts` |
| `manifest.py`, `history.py`, `fetch.py`, `panel.py`, `bark.py`, `inspect_images.py`, `contact_sheet.py`, `_assembly.py`, `_derive.py`, `tileset_preview.py` | Reject: agent ledgers, CLI plumbing or out of scope |
| `references/paperdolling.md` and the paperdolling spike and plan | Superseded by PixelDoll's pipeline, gates and manifest anchors |
| `animation.md`, `animation-doctor.md` | Covered: a cross-body swing changing screen side but not hand is why PixelDoll's grip side is keypoint based |
| `armor-clothing.md`, `weapon-*.md` | Prompt choreography for `animate_image` key poses; background only for the motion card in Progress |
| `paperdoll-skeleton-v3-archive-review.md` | Confirms the rewrite and pip's own rejection of its heuristic helpers |
| Pip tests | Cover pip's own contracts; nothing to port |

## Gaps left by the original reviews (follow-up, same day)

The owner's question: did the 2026-10-20 review (F1 to F17, Q1 to Q17, recommendations 1 to 12) or the 2026-10-24 review (open
weaknesses, spikes) leave anything unresolved? The main agent checked each item against later spikes and code; the reviewer
subagent challenged that table. Live spend: $0.187 ($0.027 base inpaint, 2 × $0.08 dress calls).

| Item | Status |
|---|---|
| Q1 changes-only output | Closed by S1: the inpaint cropped to the mask, body still redrawn inside it |
| Q2, Q4 Pro Flash sizes and cost; Q10 Pixen | Closed by S4 |
| Q3 per-frame inpaint consistency | Closed by S1: a different design per frame (palette Jaccard 0.23 to 0.36; inpaint-v3 deleted the head on 1 of 8 frames) |
| Q5 dress-call preservation, Q7 `quantized_images` | Closed by S1: 0 % exact, about 78 % within delta 18; output quantized to 16 colors |
| Q6 legacy `animate-with-skeleton` masks | Closed by S3: 3 frames only, palette fit 0.83 to 0.89, height drift 2.3 to 3.3 px |
| Q8 inpaint-v3 mask | Closed by S1: 0 px changed outside the mask |
| Q9 base `/inpaint` | **Tested live here** with S1 E3's exact base, masks, item text and seed 7: 0 px changed outside the mask in 3 of 3 calls at about $0.01 each, but the helmet closed over the face, the sword floated beside the body instead of in the hand, and the hair prompt redrew head and torso as a different character. Rejected (outputs in the ignored `spikes/api/out/q9_base_inpaint/`) |
| Q11, Q12 state alignment | Closed by the 2026-10-24 review (`e4_state`) |
| Q13 to Q17 | Closed: skeleton units (S3, B2), CORS (the app runs in the browser), bare-body policy (bare-skin wording, `client.ts` code 5000), concurrency doc, seeds not deterministic (S3) |
| Rec 1 honest output classes | Done: the manifest records `route`, `extractor`, QA `status` and provenance |
| Rec 6 tunable threshold, rec 7 `reduce-colors` / `target_palette` | Superseded by the chroma route; `target_palette` was tested live and rejected ([deep-paperdoll-target-palette-2026-11-06.md](deep-paperdoll-target-palette-2026-11-06.md)) |
| Rec 9 outfit-transfer body variants | Not needed: on a bare base the uncovered pixels are correct skin, a whole-frame swap breaks mix and match, and transfer lost on design consistency (palette distance 34 vs 10) |
| Rec 8 hardpoints and front/back split | Anchors are exported; the keypoint `z_index` front/back idea was never built, and stored keypoints carry no `z_index` |
| Other recs and F1 to F17 | Covered by the frozen rig, chroma route, queue and gates; F10 is only partly covered, by the issue below |
| 2026-10-24 weakness 1, held pommel dropped | Fixed in `788235ee` (`attachHeld` exempts pieces within 6 px of the wrist). Unverified remainder: the 6 px radius and the 3 px link rule do not scale with cell size, so a 128 px pommel could still drop |
| 2026-10-24 weakness 2, long hair under worn armor | **Confirmed live, unresolved** (below) |
| State as a dress step | Still cut: not an allowed model; the only gain was cost for 96 px held items |

### Hair cut by worn armor (weakness 2)

`splitFgBg` sends hair pixels on the bare body to fg (z 110) and pixels off it to bg (z 3, or 5 by override). Worn slots
(`torso_inner` 40 to `shoulders` 65) have no bg layer and keep pixels past the body outline (`dropOffBody` keeps the main component
whole). Where armor sticks out past the body, the same hair strand is drawn over the armor on the body and under it one pixel
outside.

Live, on the 80 px Live Test character: "long straight black hair falling in front of both shoulders down to the chest" and "steel
plate breastplate with large round steel pauldrons" (it landed in `torso_inner`). On the standing views, hair bg pixels under the
armor: south 25, east 34, north 22. Of those, 2, 12 and 14 touch on-body hair directly. The east view shows it most: the hair down
the back loses its outer 2 to 3 px columns over about 12 rows where the back plate flares. The south hidden pixels in the arm gaps
are back hair and are correctly hidden. The stored demo fixture shows the same order in a small way (6 hair px under the vest collar
in east walk cells 4 to 7, a 1 to 2 px flicker). Posed frames add flicker because the split follows each frame's moving outline.
Held blades have the same root cause against wide skirts or tassets.

Proposed fix (reviewer's design, checked against the live maps): in `buildItem`, for the hair slot only, per cell, group hair bg
pixels below that cell's NECK keypoint into connected pieces and move a piece to fg when it touches fg hair below the neck. On the
live maps this moves the cut strand edges (east back column, north and south shoulder edges) and leaves the south arm-gap back hair
hidden, because those pieces do not touch fg hair. Rejected alternatives: raising hair bg above the worn slots (puts back hair over
pauldrons and over held bg), a bg layer for worn slots (does not change the order between the two off-body groups), splitting
against the dressed outline (promotes back hair too). No generations needed; a unit test with a strand crossing the outline beside
a pauldron flare, plus the fixture's 6 px.

## Leads and decisions (owner review, 2026-11-07)

1. **Hit-frame marker in exports: not added.** A challenge subagent found no target engine that would use an exported value without
   game code (Godot SpriteFrames and Phaser frames carry no events; a Unity AnimationEvent needs a receiver method or logs errors;
   Aseprite has no per-frame data; GDevelop's export runs its own clock). PixelDoll cannot know the contact frame: bodies animate
   unarmed, contact depends on weapon reach and the game's hitbox, the peak differs per view, and bow, cast and multi-hit moves
   have none or several. Pip's own `--hit` is a hand-typed number. Developers tune active and recovery windows in their engines
   and can read frame indices from every export. Revisit on user requests or for motions whose contact is known by construction.
2. **RPG Maker export: implemented.** One "RPG Maker" card writes a baked walking sheet per outfit at native size; its Version
   row picks "MZ, MV, VX" (`$` 3 × 4) or "XP" (XP and Pokémon Essentials, 4 × 4). Pip's blueprint also asks for one
   version and writes one sheet; it pins template frame indices because pixel metrics misread steps, while PixelDoll reads
   the signed ankle lead from keypoints. Format and adoption research: [rpg-maker-export-2026-11-07.md](rpg-maker-export-2026-11-07.md);
   contract: manifest-spec §6.8. 2000/2003 (fixed 24 × 32 cells), Unite (manual registration, superseded) and console editions
   (no custom images) are out of scope. An independent review found two defects (duplicate warnings could crash the sheet,
   accents became underscores) and smaller issues; all were fixed before tests passed.
3. **Share GIF color limit: no change.** GIF allows 256 colors per frame and the encoder already reduces larger frames; real
   outfits sit far below the limit (the demo uses 102 colors in all), so a notice would almost never show and a future palette
   limit option would make it moot.
4. **Held pommel radius: no change.** The 2026-11-07 cycle checked every part `attachHeld` drops on the stored 96 px sword and axe:
   all were motion smears or redrawn body pixels. A wider radius would keep those, and no 128 px held data exists to show a loss.
5. **Hair cut by worn armor: fixed** (above).

## Not verified

The despeckle variant's precision on human-labeled pixels, whether `variantRamp` can collapse two shades, and any live behavior. The
bench is the frozen 2026-10 corpus; current-pipeline worn-item layers beyond it were not available offline.
