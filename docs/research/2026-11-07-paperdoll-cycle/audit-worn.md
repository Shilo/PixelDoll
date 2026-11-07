# Audit: hidden assumptions in worn-item checks and cleanup (2026-11-07)

Scope: every non-held check and cleanup in `app/src/lib/items/items.ts` and what it imports (garment-coverage, footwear-review,
design-consistency, torso-consistency, chroma helpers), `run.ts` wiring, and `app/src/lib/rig/clips.ts` rig QA. Question: does
a check or cleanup quietly assume the generation is one kind of thing (one dominant part, hidden only from behind, a move named
walk, a hue-shaded outline, a body-hugging garment)? No code changed, no PixelLab calls. Line numbers refer to commit
ee29e0ad; another agent's uncommitted held-item edits (attachHeld, evaluateQa) were in the tree when the scripts ran and do not
touch the non-held paths measured here.

Consequence vocabulary. Any failure OR warning blocks auto-save (`isClean`, run.ts:272; state.svelte.ts:858). No automatic retry
exists, so a false failure costs a user decision and, if they press Try again, real generations; a deterministic false failure
fails again. A silent pass auto-saves bad output. A cleanup deletion is saved into the item and cannot be recovered later.

Scripts (run from the repo root, offline, production functions only):

- `scripts/audit/worn-bench.ts [outDir]`: real benchmark outputs (`app/test/fixtures/bench`) through extraction and
  postProcess stage by stage; keyframe gray share; clip CV against G5. With `outDir` it writes sheets with removed px in cyan.
- `scripts/audit/worn-floor-parts.ts`: for every part sizeFloor and dropOffBody delete from real posed frames, how much lies on
  the direction's dressed keyframe.
- `scripts/audit/worn-d1-jester.ts [outDir]`: D1 on the benchmark's passing "green-and-pink jester hat" keyframes.
- `scripts/audit/worn-synthetic.ts`: synthetic cases with known truth (names, G5, G4, hidden views, head clip, head trim,
  dropOffBody, G11 against real knee motion, baseCut cap).

## Confirmed problems, ranked

### 1. sizeFloor deletes real design parts when the body splits an item into pieces (high, real data)

`items.ts:642`: posed non-held layers drop every component under `max(partFloor, 0.15 * largest)`. Assumption: an item is one
dominant part plus motion specks. A cape or cloak seen from the front is several pieces by construction (two side panels,
shoulder clasps, the back panel showing between the legs); a tunic in a side walk shows its rear hem as a separate flap.

Evidence (`worn-floor-parts.ts`, parts lying at least 50 % on the dilated keyframe item mask):

| case | design px deleted | largest deleted part | where |
| --- | --- | --- | --- |
| a-cape | 565 | 22 | walk/south 217, slash/south 314 |
| b-cloak | 412 | 69 | walk/south 153, walk/south-east 255 |
| n-cloak128 | 584 | 84 | walk/south 554 |
| b-tunic | 85 | 34 | walk/south-east, east, north-east |

The cyan sheets show the a-cape shoulder clasps and between-the-legs lining vanishing in 5 of 8 walk south frames (they
flicker) and the b-cloak far panel removed in south-east. No gate fails for these clips (the bench expects pass), so the item
auto-saves with the pieces missing. Smallest general fix: keep a component when most of it lies on the direction's dressed
keyframe, aligned and dilated as `trimToKeyframe` already does (`items.ts:493-510`); apply the size floor only to parts with
no design counterpart. Must not change: removal of detached motion specks that the keyframe lacks (S3), the earring floor.

### 2. D1 counts a black outline as gray smudges (high, real data)

`items.ts:1098-1111`: share of px with HSV saturation < 0.25 in a colorful layer; fires above 5 % unless the prompt names a
gray word. Assumption: outlines are hue-shaded (the T3 Ranger style). Pure black line art has saturation 0.

Evidence (`worn-d1-jester.ts`): the benchmark-passing "green-and-pink jester hat" on body A (a-jester-blue) scores 0.307 /
0.300 / 0.230 and fires D1 in every view; the gray px are all the outline color (4,5,5). The body B jester sits at 0.027 to
0.046, just under the limit. D1 is stored as a keyframe failure (`run.ts:456`), so a clean design is marked failed, skips
early posing and never auto-saves, and every retry in the same style fails again. Smallest fix: leave near-black px (max
channel < 48) out of both counts. Measured: the jester drops to 0.018 / 0 / 0 while the T3-style smudge in the self test
(90,85,80) is still counted. The prompt word list (English only) is a separate concern covered by the color/prompt audit
(`scripts/audit/color-words.ts`).

### 3. Move classification by name (medium-high, synthetic plus code)

`items.ts:775` `isAction = !/idle|walk|run/.test(id)`: an unanchored, case-sensitive substring test. Users name custom moves
(MoveSheet slugs the first two words of the description). `worn-synthetic.ts` section 1:

- Locomotion under another name counts as an action: jog, stroll, sprint, march, trot, breathe, caminar, laufen. Effect: G5 is
  skipped (`items.ts:952`; same area series fails under walk and passes under jog, section 2), G11 to G14 are skipped
  (`dirGate`, `items.ts:1164`), and held G9 is skipped. Silent pass of an unstable or vanishing garment.
- Actions containing the letters count as locomotion: walk-and-slash, drunk-walk, running-jump, rune-blast, brunch, sidle.
  Effect: G5 and G11 run on moves that legitimately change area (false failure).
- `actionOf` (`clips.ts:29`) sends the same substring guess as pose prompt words: rune-blast and brunch are posed as
  "running", sidle as "breathing idle", walk-and-slash as "walking"; other described moves send their 2-word id slug ("jog-in")
  instead of the stored description (`RigAnimation.source.action_description`, `ClipSource.motion`).
- Three different name tests disagree: `isAction`, `fixedFacingLocomotion` (anchored list, `pose-review.ts:6`) and `actionOf`
  (walk_cycle is locomotion for G5 but not for G14). Side note, not verified further: a non-Latin description slugs to an
  empty move id (`MoveSheet.svelte:31`).

Smallest general fix: one classifier that measures the clip, not its name: from the stored or measured keypoints, the largest
wrist and elbow travel from the rest pose relative to the cell, plus `facingRatios` (already used by rig QA); unknown means
abstain (warn, not pass). `actionOf` should send the stored move description. Must not change: the authored action exemption
for slash-like clips, which the measurement keeps.

### 4. Only back views may hide an item (medium-high, synthetic)

`hiddenViews` (`items.ts:627-631`) excuses an empty keyframe only for north views and only when the item covers < 5 % of the
body. Assumption: the body hides things only from behind (glasses). Backpacks, quivers, back bows, sheaths on the back and short
tails are hidden from the FRONT. Section 4: a backpack (10 % share) and a small back bow (3 %) both get no hidden view, so the
south keyframe fails "G4 item missing" (`run.ts:455`) on every attempt. Smallest fix: decide by measurement, symmetric in
direction: an empty view may be hidden when the item shows in at least half the views and the opposite view's item lies
mostly on the body silhouette (it sits flat against the side facing away). Must not change: posed frames of a hidden view must
stay empty (G4), and an empty view whose opposite shows the item off-body still fails.

### 5. Non-held items have no occlusion excuse in G4 and G5 (medium, synthetic)

`items.ts:948-960`: a frame under 50 % of the clip median fails G4; the occlusion review path exists only for held items.
Assumption: worn items stay visible. A ring, bracelet or single glove on the far hand disappears behind the torso in a side or
front walk. Section 3: a 4 px ring visible in 3 of 4 frames fails G4 deterministically. Smallest fix: reuse the held
visibility idea for worn items: if the missing frame's anchor keypoint (`slot.anchor`) lies inside the torso silhouette, report
an occlusion review warning instead of failing. Must not change: a lost item with a visible anchor still fails.

### 6. dropOffBody assumes body-hugging pieces lie on the frozen body (medium, real plus synthetic)

`items.ts:663-672`: in torso, legs, feet, waist, shoulders and arms slots, a detached part with < 50 % of its px on the base
silhouette is deleted. Broken by pauldrons or spikes wider than the shoulders, pouches hanging beside the hip, skirts flaring off
the legs, and gloves: the pose redraws a hand 1 to 3 px from the frozen hand (documented at `closeGrip`, `items.ts:562`).
Section 7: both 24 px pauldrons and a glove drawn 2 px off a 3x3 hand are deleted (57 of 165 px). Real data: one 38 px part of
b-tunic walk/east lying on the keyframe design was deleted. Smallest fix: same as problem 1, keep a part the aligned keyframe
has. Must not change: deletion of off-body slash smears that the keyframe lacks (T3).

### 7. baseCut only in head rows and at most 4 % of the body (medium-low, synthetic)

`items.ts:432-439, 470`: hidden body px may only be cut above neck + 3 and only up to 4 % of the base. Assumption: an item hides
at most ear tips. A hood over an imported base with baked big hair (section 9: 64 of 512 px erased) gets no cut, 64 lost px
and a deterministic G2 failure; the same holds for a slim full-body suit over chunky imported armor. Smallest fix: when the
erased components pass the existing shape test (touch the item and the body edge) but exceed the cap or the rows, report a
review warning instead of failing G2. Must not change: G2 for erasures inside the body.

### 8. Head-item cleanup removes detached or swaying parts (low-medium, mechanism only)

`items.ts:725-731` deletes posed components wholly below neck + 3 before the keyframe is consulted; `trimToKeyframe`
(`items.ts:482-526`) keeps only a 2 px support around the head-aligned keyframe. Section 5: a 9 px tassel below the band is
deleted from a frame identical to the keyframe; section 6: a hat point swaying 3 px loses 3 px per swayed frame. H4 passes in
both, so the loss is silent. On the bench this did not happen: the band clip removed only body smears (b-greathelm,
b-jester-blue sheets) and the jester points did not sway. Smallest fix: let the dressed keyframe decide detached below-band
parts as it already does for joined ones (`clipY`), and widen the support with distance from the head center (rotation).

## Checked and not a problem (or review-only)

- G11 against real knee motion: knee-to-hip distance moves at most 1.7 px over all bench walks (64 to 160 px cells); a skirt
  hem 2 to 5 px under the knee never trips G11. Knee-length items are safe on walk.
- G3 divides by all key px of the mannequin, not the item, so tiny or mostly transparent items are not penalized.
- G2 needs both kept < 0.97 and > 8 lost px; a nearly covered body (robe, mascot suit) passes. G10 abstains when under 10 % of
  the mannequin is visible.
- `bandOf` for non-band slots only feeds `outBand` (info) and grid repair masks, which `garmentBand` widens to the design extent,
  so wings above the shoulders, thigh boots and long hair are not clipped. The diff route ('none') is dev-only.
- G5 margins on real worn clips: capes, cloaks, hair and tunics walk CV 0.004 to 0.145 against limits 0.15 to 0.31.
- G6 palette, G7 border, G12 footwear, G13 waist band, G14 torso facing, H4 for hair and soft worn items: review warnings only.
  G13 and D2 abstain unless a light, low-chroma band is seen (dark or gold belts are never judged).
- H4 for band items skips keyframes under 12 px and has a scale-relative forearm excuse (`3 * cell / 64`).
- Rig QA (`clips.ts:97-120`) fails only empty frames, missing joints and count mismatches; everything else is a warning.
- Key choice from English color words (`pickKey`) also assumes the prompt names the item's hue; covered by
  `scripts/audit/key-collision.ts` and `color-words.ts`, not repeated here.
