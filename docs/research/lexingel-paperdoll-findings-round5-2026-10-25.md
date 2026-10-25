# Lexingel's paper-doll research vs PixelDoll, with round 5 tests (2026-10-25)

Status: **done**, except one owner decision (the bare base default, below). About 245 generations of the approved 1,000:
two bare Studio bodies (about 35 each) plus 172.8 in the harness (T 38, F 20.8, U 114), ledger `spikes/api/out/c25e/`;
harness `spikes/api/c25/arm_r5.mts`, `eval_r5.mts`. Rules were fixed before each paid run (header of `arm_r5.mts`).

## Inputs and method

Lexingel ([github.com/lexingel](https://github.com/lexingel)) shared five PDFs (UO-style paper-doll research, a north-slash pipeline, an 8-direction attack pipeline, a
one-page PixelLab paper-doll pipeline, a Godot helper brief), `paperdoll.py`, `clean_frames.py` and a handover zip: a Godot 4
route that renders CC0 3D parts into 14 layer sets with a measured per-frame z-order, a hue shader and a stack-test project.
`paperdoll.py` is byte-identical to the file reviewed in [the 2026-10-24 review](paperdoll-py-asset-review-2026-10-24.md),
whose conclusions still hold.

Process: own review plus an independent reviewer subagent, reconciled row by row; each fix was tested before shipping (offline
first, paid when only a generation could answer); a second fresh reviewer then attacked the commits, its valid findings were
fixed and tested, and a third reviewer checked those fixes. Lexingel's scripts were read, never run; the material was treated as data.

## Lexingel's findings, checked

| Claim (source) | Verdict | Evidence |
|---|---|---|
| "Grey shows through the armour gaps" of a base in shorts (north slash §4) | **Confirmed for us**: our base's gray t-shirt shows through torso items | Stored D tunic: the shirt collar in the V-neck (6 px south); D robe 8–12, S4 vest 6–13 px per view, open cloaks 106–136 px. Bare bodies: none (below) |
| Per-frame measured z-order beats one order per direction (handover `lessons.md`) | **Not worth it for us** | Lexingel's own walk manifest: per-frame 94.2–97.4 % vs per-direction 93.4–97.3 % correct, a 0.1–0.9 point gain; the handover lessons say 2.6–2.9 % wrong for slash but the shipped manifest implies 3.7–4.6 %. Our layers are pre-occluded against the real body and split fg/bg per pixel, so body vs item order is exact per pixel; item vs item uses the slot ladder plus per-direction overrides, as UO's per-facing tables do |
| Billing is ceil(W × H × frames / 65,536) on the generated canvas (8-direction §3) | **True for create and managed text modes, not for our pose calls** | Matches `create-character-v3` (already used in `apiPlans.ts`) and every stored managed pixminimax/v3 call; raw skeleton-v3 billed 3 gens for 8 frames on a 160 px canvas where the formula gives 4, and 3 on 64–96 px where it gives 1–2 |
| "Never write forward"; text-only attacks turn the body (8-direction §3, north slash §4) | **Confirmed for text moves**, immune for authored moves | Stored S4 pixminimax slash: south body turns side-on on frames 3–5 (shoulders 0.06 of the standing width), north flips; authored moves follow stored keypoints. New review note (below) |
| Mirror only "mirror-safe" items, per item (UO §4.4) | **Wrong granularity** | A layer must match its body frames: on a mirrored character every item is flipped with the body, on an independent one a flipped item would not fit. PixelDoll decides per character. Real gap: one-sided items (eyepatch, single pauldron, quiver) swap sides; now in known issues. A flip also moves the light source, contrary to "lighting stays consistent" |
| Same frame count for every direction (UO §3.3, 8-direction §5) | Already true | Clips are one keypoint sequence per move; export refuses mismatches |
| Grey-first art + hue ramps (UO §7) | Ours is more general | The handover shader rotates an HSV hue band (not palette-exact); PixelDoll swaps exact per-material ramps, which works on colored sources too |
| Hide/cover tables (UO §6) | Equal | Pre-occluded layers + `item.hides` + tuck-under cover the cases UO's tables handle |
| Ground-row shift, hold-bad-frame copy (`clean_frames.py`) | Not adopted | Shifting breaks jumps, deaths and layer alignment; PixelDoll's held repair pastes the keyframe at the wrist instead of freezing motion |
| Specks kept within 2 px of a big component (`clean_frames.py`) | Pointed at a real gap of ours | Tiny items lose all their parts (below) |
| Render route (Godot, Quaternius parts) | Off-policy | Every pixel must come from PixelLab; by merit it gives exact layers but another art style and 3–5 % wrong-layer pixels |
| Cost: ~220 gens for one direction of one slash, ~340 per layered armour | Ours is 50–100× cheaper | Dress 10 + 3 gens per item-direction pose (idle + walk share one call) |

Reviewer 1 also proposed a signed weapon-flip check (G9 compares blade axes modulo 180°). Tested offline and dropped: real
slashes rotate the grip up to 165° between frames (stored c25 P sword), and on walks the only stored flips (bow, 145–158°)
already fail G9; clean walks stay at 38° or less.

## Paid tests (round 5)

| Arm | Question | Result | Decision |
|---|---|---|---|
| T | Do small accessories survive? Small gold hoop earrings and round wire glasses (`face_acc`), body A, seed 7 | Real parts of 2–3 px: the glasses' side lens is 2 px, the earrings seen from behind two 3 px hoops. The old 4 px posed floor dropped them all (16 and 12 px). The glasses' back view is legitimately empty. H4 scored the steady earrings 0.00 (despeck) then 0.47–0.58 (a 1 px drift halves a 3 px part); G5 read a 1–2 px wobble as CV 0.19. The earrings' front view was a real dress miss, popping in on 2 of 8 frames | Fixed (below); after the fixes the glasses pass with one review note and the earrings fail only on their real defects |
| F | Does a shoulder-width test catch turned text moves? `estimate-skeleton` on all 208 stored south/north S4 text-move frames | Walk, idle, run and hurt (16 clips): ≥ 0.85 of the standing width. Turned slashes: 0.06–0.44, a north one flips sign. Death falls (0.01) | Review note below 0.5, authored presets skipped |
| U | Does a bare-chested base work? Two Studio bodies, "a human man" / "a human woman" + "wearing only plain dark gray underwear" (64 px, Top-down 4, seed 26); tunic, sleeveless vest and open cloak on both | No refusal on any call. All 6 items pass every gate; necklines, armholes and open fronts show skin. The woman came out topless in briefs (stylized, no explicit detail). Both bodies drew 10–18 px of smoke beside the head on idle east 1–3, and **every item failed G2 there** until the G2 fix | Default **not switched**: needs the owner (below). The G2 fix ships |

Sheets: `spikes/api/out/c25e/T/*.sheet.png`, `out/c25e/U/*.sheet.png` (git-ignored).

## Changes

- **Body animation text follows the prompt's clothes** (`studio/model.ts`, `create.ts`): every body animation said "t-shirt
  and shorts" even when the prompt dressed the base otherwise. One `BASE_CLOTHES` constant; prompts without a base body line
  get no clothes appended; older saved texts keep theirs.
- **One pose price** (`poseCallGens`, `poseGensFor` in `rig/clips.ts`): the move, fitted-equipment, body render and preview
  estimates still charged 4 gens above 8 frames (or a flat 3 for body renders).
- **Small accessories** (`items.ts`): the posed size floor moved to `postProcess` and drops to the largest part of the
  direction's dressed keyframe (`sizeFloor`, `partFloor`); H4 uses the same floor and skips a keyframe view under 12 px while
  the frame stays under max(12 px, 1.5 × the keyframe); G5 needs a 2 px standard deviation; an empty **back** view (north,
  north-east, north-west) of a small accessory (largest view under 5 % of the body; every benchmark item covers ≥ 14 %) is a
  review warning when the item shows in at least half of all dressed views and every posed frame of that view is empty
  (`hiddenViews`); an empty front or side view, a fragment in one view, or an item popping in still fails. Benchmark unchanged.
- **G2 ignores detached body px** (`detachedOf`): smoke or smear the body render kept is never on the stand-in.
- **Facing review note** (`clipQa`): a south/north frame of a non-authored move whose shoulders narrow below half the standing
  width, or swap sides.
- Docs: the mirroring default (Top-down 8 mirrors west; architecture said otherwise), one-sided items in known issues, body
  frames keep every component.

## Needs the owner: bare base by default

Evidence for: the t-shirt shows through every torso item measured; bare bodies passed every call and every gate, and items
read as intended. Against: "underwear" draws a topless woman, and the default applies to every new character. Options: (1)
"wearing only plain dark gray underwear" for everyone; (2) a cover for both, e.g. underwear plus a plain dark gray bandeau,
which needs a short paid test on both bodies (~70 gens) because a top garment can show through openings again; (3) keep the
t-shirt. The switch is one line (`BASE_CLOTHES`) since the animation text now follows it.

## Accepted limits

- G2 also skips a detached body part that really is erased (a hand drawn 2 px from its arm). None of the 34 idle and walk clips
  of the five stored bodies had one; smoke was in both new bodies (idle east).
- A creation in flight across this update, with an exact prompt that has no base body line or uses the older "grey" text,
  re-pays its body renders on resume (the request text changed).
- A hidden view still pays its pose call (empty frames).
- A small item worn only at the back (a hair clip) has no hidden front view: an empty front view fails and re-rolls.
- 9–12-frame pose calls were measured at 3 gens only on 64–96 px canvases; at 160 px only 8 frames (3 gens).

## Reviews

| Review | Valid findings | Outcome |
|---|---|---|
| Reviewer 1 (independent, then reconciled) | stale price tables, text-move turns, mirroring docs, G4 on hidden views, the corrected floor formula | fixed or tested; G9 sign check dropped by its kill rule |
| Reviewer 2 (fresh, on the commits) | a missing small item passed as hidden (stored earrings), H4 skipped on keyframe size alone, the death preset tripped the facing note, the move preview price | fixed and tested (`ba1ff599`, `a1f6672f`, `5ca7ef9e`); detached limbs and the resume hash accepted above |
| Reviewer 3 (fresh, on those fixes) | a failed front dress still passed once a pose re-roll came back empty; move redos judged hidden views on a subset; 2 px of noise re-enabled H4 on tiny items; mixed side-on/reversed wording | fixed and tested (`43bb6fa2`, `a35b071d`): hidden views are back views only, judged over every dressed view |
