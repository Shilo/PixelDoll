# Chroma key strategy vs hue: practitioner setups against production green (arm S, 2026-11-10)

## Pre-registration (written before the first paid call)

Question: is the decisive variable the key hue (green vs cyan) or the keying strategy (whole-body continuous ramp vs whole-body
bright flat tones with no dark outline vs skin-only bright flat key with the rest of the body natural)?

Arms (body A 64 px S/E/N; body B 80 px S/E/N; production `edit-animation-v2` dress builder and `animate-with-skeleton-v3` pose
builder; identical items, prompts apart from the mannequin wording, and seeds):

| Arm | Mannequin | Prompt | Extraction | Source |
| --- | --- | --- | --- | --- |
| prod | production green continuous ramp (`toChroma`) | production | production `extractCell` incl. `absorbOutline` rule (c) | arm Y outputs, free |
| cr | cyan continuous ramp (green ramp rotated +60) | production, "bright cyan" | rotate back, production green code | arm Y outputs, free |
| fc | whole body, five flat bright cyan tones (hue 185, value >= 0.69); base outline px (OKLab L < 0.42) get a key tone just under the skin, so the mannequin has no dark line | production, "bright cyan" | key window below | new |
| fg | as fc in green (hue 120) | production, "bright green" | key window below | new |
| sc | skin only (warm px, OKLab L >= 0.25) in four flat cyan tones measured on a practitioner's sprites; outline, underwear and eyes stay natural | "skin is painted bright cyan ... do not use any cyan on the clothing" | key window, then a learned palette for the non-skin body | new |

Key window for fc, fg, sc (fixed now): key = opaque, |hue - key hue| <= 20, HSV saturation >= 0.25, value >= 0.30. A key px
darker than the mannequin's darkest tone minus 0.08 in value that touches the item is item (the dark-key-touching-gear rule of the
third-party cutter, analogous to rule (c)), two passes. Components under 2 px dropped. No despill (layers are raw colors).
sc body parts: a non-key px inside the base silhouette dilated by 1 whose color is within 24 (Chebyshev) of any non-skin base
color of that view or frame is body (Lexius-style learned palette, primary). Reported variants: none (remove cyan only, as the
practitioner describes) and pos (palette plus the base px within 1 px must be non-skin).

Metrics per view, all arms:
- hard fails: empty layer; body kept < 0.97 (share of base-opaque non-layer px, border skipped, still classified key, or body
  part on sc; production uses its own G2).
- band leak: layer px outside the slot band (`items.bandOf`, the production outBand), a proxy for body px cut as gear.
- dark dropped (corrected metric 1): every dropped opaque px with value < 0.35 that 8-touches the layer, regardless of ramp
  distance; and the novel subset, more than 16 from every color of the model's input frame (an outline the model drew, not a
  mannequin shade).
- hue accuracy (corrected metric 2): saturated layer px (S >= 0.35, V >= 0.25): circular mean hue, mean saturation, share within
  30 degrees of the key hue. Cloak target: red, 0 degrees.
- steel: near-gray layer px (S < 0.35, V >= 0.25) on helm and plate: mean hue, mean saturation, share leaning to the key (hue
  within 40 degrees of the key hue and S >= 0.08).
- controls: turquoise gem px (hue 160-200, S >= 0.3) on the amulet; emerald tunic area and green share.
- sc only: px the palette removed where the base is skin or transparent (item px lost to the palette).

Stages (cap 500 generations, ledger-enforced; nothing is resent):
1. Body A seed 7: helm, plate, hair, cloak, jerkin, amulet (cyan risk), emerald tunic (green risk) x fc, fg, sc (21 calls, about
   210), plus the emerald tunic on the production route (pickKey sends it to magenta; 1 call).
2. Walk S/E/N seed 7, hair and cloak, x fc, fg, sc (18 calls, about 54).
3. Body A seed 11, the five core items, the two best new arms (10 calls, about 100). Best: fewest hard fails, then lowest band
   leak, then fewest novel dark dropped px.
4. Body B seed 7, helm, plate, hair, the same two arms (6 calls, about 60).

Decision rule. A new strategy replaces production green only if, on the five core items over every stored body and seed:
1. its hard fails are no more than production's (dress and walk);
2. its band leak is at most 1.25 x production's + 10 px;
3. its novel dark dropped px are at least 25 % lower than production's after rule (c), with better outlines visible on sheets;
4. its cloak hue error is not more than 10 degrees worse and its cloak saturation not more than 0.08 lower than production's;
5. its steel key-leaning share is at most production's + 0.10;
6. collision controls are reported, not counted.
A tie keeps production. Attribution for Q1: hue effect = fc vs fg (same strategy); strategy effect = fg vs prod (same hue) and
fc vs cr (same hue).

## What ran

| Stage | Calls | Charged generations | Notes |
| --- | --- | --- | --- |
| 1 body A seed 7, 7 items x fc, fg, sc, plus the emerald tunic on the production route (magenta) | 22 | 220 | all completed |
| 2 walk S/E/N seed 7, braids and cloak x fc, fg, sc | 18 sent, 15 stored | 45 | 4 returned in time; 11 outlived the client's 15 min poll on the local API and were recovered by GET only (`c25/s_recover.mts`, `recovered.jsonl`); 3 were refused with 429 before any job existed (cloak fc north, cloak sc east and north) and were not resent. Cause: I let 18 pose jobs run at once against a 10-job tier limit, although the reference doc says to keep pose concurrency at or below 6 |
| 3 body A seed 11, 5 core items x fc, fg (ranking after stage 1: fc and fg 0 hard fails, sc 1) | 10 | 100 | all completed |
| 4 body B seed 7, helm, plate, braids x fc, fg | 6 | 60 | all completed |
| total | 56 sent, 53 stored | 425 | balance 18,123.1 before, 17,698.1 after (GET /balance); nothing resent |

The production green (prod) and cyan ramp (cr) rows reuse the 2026-11-09 arm Y outputs run through today's extraction, so prod
includes `absorbOutline` rule (c). The cr "tunic" row is excluded because arm Y's tunic was navy, not emerald.

## Free evidence first

### The practitioners' material, measured

- **Theik's sprites (skin-only cyan).** Sheet 1 (192 x 192, four poses, 1:1 pixels): 12 cyan colors on 944 px (10 % of opaque px),
  hue 180-191, saturation 0.33-1.0, value **0.34-1.0**. The returned skin is not a flat bright cyan: it is a six-tone ramp that
  includes dark teal (0,87,102) and (31,80,86). Sheet 2 (a resampled composite) has 412 px of (6,54,56), value 0.22. Hair, eyes,
  mouth and outline are natural. His silver: 15 colors on 1,849 px, hue 212-227, saturation 0.07-0.22. **Every silver px scores 0 on
  a cyan key** (PixelDoll's ratio score rotated to 180: excess under 12), so "no overlap" is true for his armor.
- **The third-party system document** (key section and stand-in code read, nothing run):
  - "Plain outline" means **no dark outline on the key body**: the stand-in's outline tone is "a pink just under the skin, not a dark
    line", and the rule is "Use no dark outline on it, or the outline gets absorbed into gear". It does not mean "a bright body with a
    natural, unkeyed outline", as the brief paraphrased it. Arms fc and fg reproduce the documented construction (five tones, value
    0.69 or more).
  - The chart measures the **opposite failure** from PixelDoll's: body px wrongly cut as gear (false item px, counted only in rows
    between helmet and boots, before cleanup), not item outline lost to the key. Its "normal skin" row (31-104 px) is a **pixel diff**
    against the bare body, not a skin key.
  - Its cutter already contains PixelDoll's rule (c) in another form: a dark key-hue px touching gear is gear outline.
  - Its own caveats: the hue is picked per outfit ("one draw each, so this shows green works, not that it is better"), and "use a dark
    line in the body's own hue when using a video model, because a flat shape gives it no limbs to read".

### PixelDoll's bodies and stored outputs

| Check | Result |
| --- | --- |
| What a skin-only key would cover (OKLab: warm skin, near-black outline, gray garment) | Body A: skin 30-37 %, outline 35-42 %, gray shirt and shorts 21-34 %. Body B: skin 35-44 %, outline 32-35 %, garment 20-30 %. The bases are not "mostly skin": two thirds of the body stays natural under a skin-only key |
| Do skeleton-v3 walks reshade the natural body? (raw `s3_k1` walk frames vs the rest palette) | No: south and north 0 px outside the rest palette at tolerance 0; east about 5 px per frame. Reshading comes from dressing (edit) calls, see Q3 |
| Lexius-style learned palette vs real item colors (arm Y green items vs the base's non-skin palette, Chebyshev 24) | steel helm 92 % (A) and 88 % (B), silver plate 91 % and 81 %, braids 28 %, jerkin 27 %: PixelDoll's gray underwear and outline share the colors of steel and of item outlines |
| The same against the base's skin palette, tolerance 24 | jerkin 37.5 %, body B hair 9 %, everything else 0 %; at tolerance 16, 0 to 1.3 % |
| Dark share of the continuous ramp in green outputs | 38.9 % of key px have value < 0.30 (162 px per view): a value floor cannot be used on PixelDoll's ramp; it needs a mannequin with no dark shades |
| Steel on every arm Y mannequin | near-gray helm and plate px have hue 202-216 on green, cyan and azure alike; 0 px reach the key threshold on cyan, but 50-100 % carry some cyan excess |

## Results (`c25/eval_s.mts`; full output in `spikes/api/out/chroma-strategies-2026-11-10/eval.md`)

Columns: hard = views with an empty layer or body kept < 0.97; leak = band leak px; dark = dropped dark px touching the layer (all);
novel = the subset whose color the model's input never had; steel gray S = mean saturation of near-gray helm and plate px; steel
lean = their share within 40 degrees of the key hue.

### Core items (helm, plate, braids, cloak, jerkin)

| Set | Arm | Hard | Item px | Leak | Dark | Novel dark | Steel gray S | Steel lean |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A seed 7 | prod | 0 | 3,673 | 56 | 447 | 100 | 0.13 | 0.00 |
| | cr | 0 | 3,570 | 32 | 408 | 81 | 0.14 | 0.85 |
| | fc | 0 | 3,701 | 132 | 0 | 0 | 0.19 | 0.78 |
| | fg | 0 | 3,775 | 149 | 0 | 0 | 0.13 | 0.01 |
| | sc | 1 (plate) | 1,928 | 32 | 875 | 34 | 0.10 | 0.42 |
| A seed 11 | prod | 0 | 3,332 | 24 | 436 | 69 | 0.18 | 0.01 |
| | fc | 0 | 3,367 | 41 | 0 | 0 | 0.15 | 0.83 |
| | fg | 0 | 3,452 | 70 | 0 | 0 | 0.16 | 0.01 |
| B seed 7 (helm, plate, braids) | prod | 0 | 2,554 | 63 | 239 | 103 | 0.18 | 0.00 |
| | fc | 0 | 3,005 | 211 | 0 | 0 | 0.18 | 0.92 |
| | fg | 0 | 2,773 | 125 | 0 | 0 | 0.16 | 0.00 |

### Per item, hue and controls (body A)

| Item | prod | cr | fc | fg | sc (seed 7 only) |
| --- | --- | --- | --- | --- | --- |
| Red cloak hue / saturation | 3 / 0.86 | 356 / 0.70 | 346 / 0.70 | 14 / 0.79 | 1 / 0.87 |
| Cloak on the sheets | clean red; gray holes in the N layer | muddy | raspberry, navy outline | clean red, dark olive outline | lining holes cut by the palette |
| Helm px | 1,053 | 1,029 | 934 | 993 | **48** (palette removed 283 steel px) |
| Plate px | 1,261 | 1,122 | 1,159 | 1,140 | **62**, hard fail |
| Key-tinted px left in the raw helm and plate layers | despilled | despilled | 359 | 307 | n/a |
| Helm px rewritten by production despill (post hoc for fc and fg) | 21 | 306 | **804 of 934**, steel hue 208 to 238 | 56 | n/a |
| Turquoise gem (cyan control) | kept | not drawn | small, dark, pale chain | kept | mostly lost |
| Emerald tunic (green control) | magenta route, clean | n/a | kept | **kept** (drawn at hue 160, outside the narrow window) | shredded |

### Walk S/E/N, body A seed 7 (per frame on the walk base)

| Item | Arm | Frames | Hard | Leak | Dark | Novel dark | On the layer sheets |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| braids | prod | 16 (S, N) | 0 | 332 | 771 | 210 | dashed braid edges in most frames despite rule (c) |
| | cr | 24 | 0 | 99 | 532 | 106 | |
| | fc | 24 | 0 | 574 | 0 | 0 | continuous braids, gold-brown outline, a few teal specks |
| | fg | 24 | 0 | 849 | 0 | 0 | continuous braids, green fringe px |
| | sc | 24 | 0 | 6 | 1,732 | 0 | braid outline broken wherever it crosses the body; the palette removed 912 px |
| cloak | prod | 24 | 0 | 12 | 969 | 59 | |
| | cr | 24 | 0 | 72 | 1,004 | 214 | muddy |
| | fc | 16 (S, E) | 0 | 74 | 0 | 0 | raspberry |
| | fg | 24 | 0 | 47 | 0 | 0 | clean red, olive outline; body kept 0.975 at worst |
| | sc | 8 (S) | 0 | 0 | 818 | 78 | the palette removed 517 px |

### Skin-only extraction variants (dress, core items, body A seed 7)

| Variant | Hard | Item px | Leak | Item px lost to the palette |
| --- | ---: | ---: | ---: | ---: |
| pal (pre-registered: learned non-skin palette, tolerance 24) | 1 | 1,928 | 32 | 440 |
| none (remove cyan only, as the practitioner describes) | 10 of 15 | 6,908 | 1,956 | 0 |
| pos (palette plus position) | 1 | 1,988 | 37 | 381 |
| diff (post hoc: same-position diff on non-skin parts) | 3 | 2,986 | 63 | 0 |

On sc dress outputs the model kept 1-3 % of the natural non-skin body px exact, 68-96 % within 8 and 99-100 % within 24 of the base
px; 97-99 % of skin px stayed inside the cyan window.

## Verdict against the pre-registered rule

| Criterion | fc (flat cyan) | fg (flat green) | sc (skin-only cyan) |
| --- | --- | --- | --- |
| 1 hard fails no more than prod's | pass (0) | pass (0) | **fail** (1; 10 without the palette) |
| 2 band leak at most 1.25 x 143 + 10 = 189 | **fail** (384) | **fail** (344) | pass (32) |
| 3 novel dark at least 25 % lower, visible | pass (0 vs 272) | pass (0 vs 272) | passes the numbers, **fails visibly** (broken outlines) |
| 4 cloak hue within 10 degrees, saturation within 0.08 | **fail** (11 degrees worse, 0.16 lower) | **fail by 1 degree** (11 degrees, 0.07) | pass |
| 5 steel lean at most prod + 0.10 | **fail** (0.78-0.92) | pass (0.00-0.01) | **fail** (0.42) |

No strategy clears the rule, so production stays. Two honest qualifiers:
- Criterion 2 is dominated by braid length (hair accounts for 333 of fc's and 312 of fg's leak px; the walk layer sheets show clean
  braids, not body px). Band leak was a poor proxy for body leaks; I did not drop hair after the fact.
- Criterion 5 is structural for any key near 180: steel's native hue (202-216) lies within 40 degrees whatever the model draws, and
  steel saturation did not rise on cyan (0.13-0.21 vs 0.13-0.18). The real cyan steel cost appears in cleanup: despill rewrote 804
  of 934 helm px.

## Answers

**Q1. Hue or strategy?** Both, and they control different defects. With the hue fixed and the strategy changed (fg vs prod, fc vs
cr), the dark-outline loss disappeared (0 dropped dark px on dress and walk, both hues, both bodies; prod still drops 272 novel px on
core dress views and 210 on the braid walk after rule (c)). With the strategy fixed and the hue changed (fc vs fg), outlines stayed
identical but every cyan defect from arm Y came back: raspberry cloak (346 degrees, saturation 0.70 vs 14 degrees, 0.79), steel inside
the key's hue band, despill wrecking steel, a pale amulet chain. The decisive variable for outlines is whether the mannequin contains
dark key shades (the continuous ramp puts 39 % of the body below value 0.30); for color fidelity it is the hue. Skin-only is not viable
on PixelDoll's bases (Q3). The owner's hypothesis is half right: the number of tones does not matter (the production score has no
per-tone tolerance), but the ramp's dark end does, because it forces a detector that also eats dark item px.

**Q2. Does skin-only or a plain outline beat rule (c)?** A no-dark-line mannequin (the third-party "plain outline") does: braids stay
continuous in all 48 fc and fg walk frames and in every dress view, where prod with rule (c) still shows dashed braid edges and about
13 novel dark px dropped per walk frame. The price: the model draws the item outline in a dark key-tinted color (olive on green, navy
or teal on cyan; 307-359 tinted px per helm and plate set), so despill is still needed; on green it is cheap (56 helm px), on cyan it is
destructive. Skin-only does not avoid the problem, it moves it: the body's natural black outline and the item's black outline share
colors, so the palette deletes item outlines over the body (braid walk), and not using the palette dumps the whole body outline into
the layer.

**Q3. Posed frames and bare bases.** Skeleton-v3 posing of the natural base does not reshade it; dressing does (1-3 % of natural px
exact, 99-100 % within 24). On posed key frames every strategy kept its dress behavior: flat arms 0 hard fails in 64 walk frames, no
outline redrawn into the mannequin, and limbs read correctly despite the flat body (the third-party caveat did not bite on body A). On
bare bases skin is only 30-44 % of px. A learned palette catches the unkeyed parts (99-100 % of them), but it cannot tell them from gear
in the same colors: steel and silver over gray underwear were deleted (helm 48 of about 500 px kept, plate hard fail), the cloak lining
got holes, braid outlines broke. That is the pixel-diff failure in another form. The practitioner avoids it only because his non-skin
parts (brown hair) share no colors with his silver; Lexius's learned skin tones would be safe on PixelDoll only at tolerance 16 or less
(a tan jerkin is 37.5 % within 24 of body A's skin).

**Q4. Brightness and "no overlap".** Brightness matters through the detector: a mannequin with no dark shades allows a value floor and a
narrow hue window, which is what kept the outlines and, unexpectedly, the emerald tunic on the flat green key. "No overlap" between steel
and cyan holds at the keying threshold (0 steel px reach the key, in his sprites and in ours) but not in cleanup: steel sits 20-35
degrees from cyan, so a despill that removes cyan-tinted outlines also rewrites steel. The practitioner's returned skin is itself a
six-tone ramp down to value 0.22, not a flat bright key.

## Should PixelDoll change its keying strategy?

Not now, and not to cyan or skin-only. The one candidate worth a follow-up is **fg: the same green hue, a flat bright mannequin with no
dark shades, and a hue-window plus value-floor detector**. It fixed the outline defect outright and kept emerald gear, but failed the
rule on band leak (mostly braid length) and by 1 degree on cloak hue, and it leaves olive-tinted outlines that need despill. Before it
could ship it would need:
1. a pre-registered rerun that counts body px leaked into the layer directly (not band leak) and runs despill in the pipeline, with at
   least 2 seeds on both bodies plus a 128 px body, and all walk directions;
2. new production code: a flat-tone `toChroma`, a window detector replacing the ratio `keyScore` and `KT` (the rim guard,
   `absorbOutline`, G2/G3, `keyFor` and `nearKeyShare` all assume the ratio score), despill tuned for dark tinted outlines, and flat
   variants of magenta, blue and azure for the key switch;
3. a regenerated bench, the LPC skin-tone fairness rerun, unit tests and the demo fixture.

Cheaper and already proven: keep production green with rule (c) and accept the remaining dashed braid edges as a known limit.

## Limits

One seed for sc and for body B; 2 seeds for fc and fg on body A; walks on one seed with 3 directions missing (cloak fc north, cloak sc
east and north); the local API at localhost:8000 may not match production; fc, fg and sc were extracted without despill by a detector
written for this test, while prod and cr use production code; design variance between seeds (pauldrons, braid length) is still larger
than some effects.

## Files

- Arm, evaluator, recovery and balance check: `spikes/api/c25/arm_s.mts`, `eval_s.mts`, `s_recover.mts`, `s_balance.mts`
- Outputs (local, git-ignored): `spikes/api/out/chroma-strategies-2026-11-10/` (`S/<body>/<item>/<arm>_dress_s<seed>.<i>.png`,
  `S/A/<item>/<arm>_walk_<dir>.<f>.png`, `ledger.jsonl`, `recovered.jsonl`, `stage1.log` to `stage4.log`, `eval.md`, `S/rows.json`)
- Sheets (4x): `S/<body>/<item>.sheet.png` (rows: seed 7 prod, cr, fc, fg, sc, then seed 11 prod, cr, fc, fg; columns: input S/E/N,
  raw output, layer over the real body, layer alone, raw output with dropped dark px marked magenta = novel, yellow = mannequin color),
  `S/A/<item>.<arm>.walk.sheet.png` and `.walk.layer.sheet.png` (rows S/E/N, 8 frames), `S/mannequins/mannequins.sheet.png`
- Key sheets: `S/A/hair.prod.walk.layer.sheet.png` vs `hair.fg.walk.layer.sheet.png` vs `hair.sc.walk.layer.sheet.png` (outlines),
  `S/A/cloak.sheet.png` (hue), `S/A/helm.sheet.png` (sc deletes the helm), `S/A/tunic.sheet.png` (controls)
