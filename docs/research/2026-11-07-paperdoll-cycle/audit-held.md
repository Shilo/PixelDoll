# Held-item assumption audit (2026-11-07)

Question from the owner: do held-item (main_hand, off_hand) checks and cleanup steps secretly assume one kind of object (a rigid, straight, downward sword in one connected piece)? Scope: `app/src/lib/items/items.ts` and `app/src/lib/items/run.ts` on the uncommitted working tree of 2026-11-07, plus what they call. No app edits, no PixelLab calls.

Evidence script: [scripts/audit/held-audit.ts](scripts/audit/held-audit.ts) (run from the repo root with `node docs/research/2026-11-07-paperdoll-cycle/scripts/audit/held-audit.ts`). It draws synthetic item shapes on real bench keypoints (`app/test/fixtures/bench/body{A,B,C,N}.json`, 64 to 160 px cells) and runs production `postProcess` and `itemQa`. Synthetic shapes are proxies for real PixelLab output; every number below is from that script unless marked **[source]** (read from code) or **[untested]**.

## What a failure costs

- **Warning or gate fail in the main flow:** both block the automatic save (`isClean`, run.ts:272; `autoSave`, studio/state.svelte.ts:858). The draft stays reviewable and the user can choose Keep it (GenCard.svelte:105-107) unless a G1 structural failure exists **[source]**.
- **Gate fail in a paid repair:** `regridClip` saves only when `failCalls` is empty (run.ts:766), so a false G4/G5/G8/G9 fail throws away a paid inpaint-v3 repair **[source]**.
- **Cleanup (attachHeld, closeGrip, repairDropped, stencil clipping):** changes pixels before any gate runs. Pixels removed by `attachHeld` are only counted in the `strayPx` metric; no warning is raised **[source]**.

## Confirmed problems, ranked

### 1. attachHeld silently deletes valid parts that are not connected to the largest piece (high)

items.ts:549-554 keeps the largest component plus pieces within 3 px (Chebyshev) of it or of the gripping wrist; everything else is deleted. Assumption: a held item is one connected piece, and any gap larger than the fist is a smear.

Breaks for:
- Long items that pass behind the body or the other hand, so the stand-in body (key color) splits them: spear, staff, bow, banner, polearm, greatsword, fishing rod, a two-handed grip.
- Items with designed detached parts: nunchaku or flail drawn with separate chain links, a crossbow bolt in flight, sparkles, a magic effect, a pet.

Evidence:

| Case | Item px deleted | QA result |
|---|---|---|
| Spear behind the torso, tip visible past the far side (8-frame walk, 64 px) | 240 of 640 (38 %) | **pass, no warning: auto-saves** |
| Two-handed staff, far hand covers 3 / 5 / 8 / 12 px (64 to 256 px cells) | 22 to 23 % at every scale | not gated |
| Nunchaku, chain links 2 px apart | 52 % (the whole second stick) | not gated |
| Orb above the palm with four 3x3 sparkles | 30 % (all sparkles) | not gated |
| Crossbow with a bolt 6 px ahead | 20 % (the bolt) | not gated |

When the split is the same in every frame, G4 and G5 see constant areas and stay silent. The dressed keyframe (not posed) keeps the full item, so the thumbnail and the animation differ.

The same assumption appears in `heldRepairRadius` (run.ts:158). It measures reach on the largest dressed component only, so a spear split by the torso in a dressed view gives a disc that can miss its tip. The stencil then clips the tip silently (items.ts:398-402) **[source]**.

Smallest general fix:
- Keep a detached component when it connects to the kept item through the dilated body silhouette (base or stand-in pixels between them), or when the direction's dressed keyframe also has a detached part of that size (the `partFloor` idea, items.ts:614).
- Raise a review warning whenever cleanup removes more than max(8 px, 5 %) of a frame's item pixels, instead of only counting `strayPx`.
- Apply the same body-bridging rule to the reach in `heldRepairRadius`.

Must not change: dropping detached smears in open air (the original S3/S5 evidence), and the pommel and haft-end exemption near the wrist (held-pommel.test.ts).

### 2. The held prompts describe a downward weapon for every held item (high, unverified effect)

- items.ts:154 `heldPhrase` (dress, both hands): "held in the character's right hand, pointing down and slightly outward".
- items.ts:152 `oneHeld` for main_hand: "exactly one weapon, no other weapons, no scabbard, no shield". It is reused in the pose description (items.ts:52) and the grid prompt (items.ts:126).
- items.ts:126 grid instruction: "gripped in the fist ... no effects".

Script output: "a round wooden shield, held in the character's right hand, pointing down and slightly outward; exactly one weapon, ... no shield". A torch, bouquet, banner, umbrella, cup or potion is asked to point down. Any non-weapon is called a weapon. A floating orb is asked to be gripped. A magic orb with sparkles or a flaming sword is told "no effects" in a repair.

Consequence: a different paid drawing than the user asked for. This affects every non-sword main-hand item. Off-hand items get only the "pointing down" clause. The effect on PixelLab output is **[untested]**. Round 3 already measured that this wording draws bows diagonally across the legs (generation-quality-round3-2026-10-25.md, arm V).

Smallest fix:
- Use the item-neutral off-hand structure for both hands: "exactly one held object, nothing in the other hand", keeping "no scabbard" only as "nothing else added".
- In repairs, say "no effects that are not part of the item".
- Replace the orientation clause with an arm-preserving neutral one ("carried naturally at the side, continuing the forearm"). This needs a small paid A/B on sword, torch, shield and bouquet dresses.

Must not change: "the arms stay exactly as they are" (S5: "upright" bent the forearm, key outside 0.04 to 0.07), the hand side, and byte-identical non-held requests. The sword dress must keep key outside at or below 0.006.

### 3. G5 and G9 assume a rigid, constant-area object (medium)

Locomotion G9 (items.ts:1001-1048) fails turns over 30 degrees relative to the forearm; G5 (items.ts:952-959) fails area CV over 0.15.

Breaks for:
- Items that legitimately hang or move: a lantern or censer that hangs plumb while the arm swings, a flag waving, a flickering flame.
- Chains, whips and ropes are the same pattern **[inference]**.

Evidence:
- A hanging lantern in the off hand fails G9 on walk/east for bodies B, C and N ("turns 48, 35, 50 degrees"). That equals the far forearm's per-frame step (bench maximum 49.3 degrees; 4 of 28 bench walk arm tracks exceed 30).
- A banner with waving cloth fails G5 in 6 of 6 clips.
- A torch whose flame flickers between 2 and 7 px fails G5 in 4 of 6 clips.
- The rigid sword control passes all clips.

Consequence: a false fail that blocks the automatic save and discards paid repairs.

Smallest fix:
- Measure before failing. If the absolute item angle is steadier than the forearm-relative angle (both from the same pixels), the item hangs: warn, do not fail.
- Make G5 on held items a warning unless G4 also shows loss.

Must not change: a 180-degree reversal or a 90-degree flip changes the absolute angle too, so the signed check keeps catching them (challenge.md A).

### 4. G4 has no occlusion excuse (medium)

items.ts:950 fails a held clip whose smallest frame is under 50 % of the median. The only exemption is by name: north views of action clips. G5 and G9 already ask `heldVisibility` whether the body hid the pixels.

Evidence: an off-hand buckler that slides partly behind the torso (areas 121 down to 44) gets "Occlusion walk/south" for G5 but still fails "G4 walk/south: min area 36 % of median".

This affects off-hand items in side views and anything that swings behind the body (round 3 recorded it as a known limit for bows). Fix: run the same `heldVisibility` test for G4 and downgrade to the Occlusion warning when hidden pixels explain the drop. An area of 0 stays a fail.

### 5. Locomotion is decided by the move's name (medium)

`isAction` (items.ts:775) is `!/idle|walk|run/` on the move id, and imported move ids come from user names (`slug(move.name)`, store/import.ts:350).

- "jog", "sprint", "sneak", "march" and "strafe" count as actions, so G5 and G9 are off: a flipped sword passes silently.
- "run-slash", "idle-spin-staff", "rune-cast" and "walkie-talkie" count as locomotion, so the rigid checks run on legitimate spins.
- The G4 north excuse uses the same test.

Fix: classify from the stored keypoints (for example forearm angular range per step) or store the move kind with the clip. A token match is only an interim step.

### 6. Absolute pixel thresholds do not scale with the body (medium-low)

- G8 contact limit of 6 px (items.ts:974). The bench's real p95 grip gap of 2.7 px, scaled to 160 and 256 px cells (6.8 and 10.8 px), warns "more than 6 px from both hands" on clean grips. At 160 px, a floating orb triggers the same warning (acceptable, since it is a warning).
- attachHeld 3 px and 6 px. The held-pommel.test.ts geometry scaled 1.5x to 4x deletes the whole 6 px pommel. At 1x nothing is deleted.
- Also absolute: `closeGrip` R = 2 (items.ts:573), `HELD_SIGNED_REACH` = 10 (items.ts:773; small items stay unsigned, challenge.md F3) and `HELD_PAD` = 16 (motion.md).

Fix: scale by body size like `posedTol`, never below today's values.

### 7. repairDropped replaces a legitimately small frame (low)

items.ts:606 pastes the static keyframe whenever a near-rest frame has under 50 % of the clip's median area. A pulsing orb (areas 129, 129, 18, 129) became 129 in every frame. The R1 warning reports it, so this is not silent.

Fix (optional): paste only when the small frame does not overlap the wrist-aligned keyframe silhouette, meaning the item is gone rather than smaller.

## Checked, not a problem

- **`f0Last` / `unrotate` (items.ts:161, run.ts:425):** a pure reorder of a free request, undone after the call; no shape assumption.
- **`padOf` pivot round trip:** zero-byte composite difference (motion.md). Long items cropped by the fixed pad raise a G7 warning, not a silent pass.
- **G7 border check:** warning only.
- **Loop-seam G9:** warning only.
- **`heldVisibility`:** it can only downgrade a fail to an Occlusion warning, never pass silently. It excused 0 of 67 reversals (challenge.md).
- **G8 hand decision:** abstains ('?') unless half of the frames decide. Two-handed grips land on '?' and warn. The rigid sword control passes everywhere.
- **Signed G9:** abstains for center grips (bow, staff at 25 % of reach). Hooked and curved heads are decisive (signed-shapes.ts).
- **`closeGrip`:** fills only stand-in pixels outside the body, within 2 px. At most it fills a small hoop or window an item shows the stand-in through **[source; minor]**.
