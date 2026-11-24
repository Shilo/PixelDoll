# Review: moving attack on real data

Date: 2026-11-24
Reviewer: Flash High (independent sub-agent)
Subject: HEAD `5f491383`, moving-attack implementation, real Library backup at `C:/Users/shilo/AppData/Local/Temp/opencode/backup-final`
Mandate: break the accepted feature with real data, the gate, the four controllers, the app and the tests.

## Verdict

**Ship with fixes.**

The plumbing is sound and the shipped body-only composites are good. One real-data defect is a precondition for the default-on claim: the gear rule refuses layering for the only real dressed outfit I could assemble from the backup's items, while the full-body attack already hides the same items. A second real-data issue is that the tracked hip anchors are not silhouette-accurate on one East walk cell, which disables the whole East/West set. Neither corrupts data or breaks the fallback, but together they mean the feature is a no-op for the real character as soon as it is dressed, and it covers only two of four directions.

If the gear rule is not fixed, do not ship the switch as "on by default" for real dressed characters. Ship it as a safe, silent fallback at best.

## What I ran

| Check | Result |
| --- | --- |
| `npm run check` | Passed, including types and Prettier |
| `npx vitest run live-layering runtime export-phaser gdevelop-export godot-export unity-export experience-presentation experience-movement` | 10 files, 124 passed, 2 skipped (Godot opt-ins; no `GODOT_BIN`) |
| `npm run e2e -- experience-parity -g "Walk while attacking layers"` | 1 passed (6.8 s), including default switch, Waist, downgrade and 0.8 speed |
| `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` | Matches the documented verdicts; Phaser ZIP 116,959 to 131,147 bytes (+14,188) |
| Real-data scripts calling the canonical runtime and `renderPresentation` | Results below |
| Mirror probe (bodyA plus a synthetic `west: mirrorOf east`) | West composite byte-identical to flipped East; export pair and anchors present |
| Renders at 4x, 6x and 8x | Evidence in [review-flash-high/](review-flash-high/) |

Not run: full E2E, native Godot (no binary), native Unity (no editor wired here), native GDevelop editor, PixelLab calls.

## Real data reconstruction

The backup holds two characters. Only one is usable for this feature:

- **Bonequin**: 92x92 cells, pivot 46/86, four directions (west mirrors east), walk 6 cells, slash 8 cells, complete tracked hip anchors for both clips in all four directions, 40 items.
- **Bonequin errado**: 128x128, Default only. It cannot exercise layering.

I rebuilt each `Project` as the manifest plus a `Map` keyed by `sha256:<blob name>` from the 569 PNG blobs; no referenced hash is missing. I then called the canonical `actionHip`, `splitLower`, `splitUpper`, `layerOffset`, `actionSetScore`, `composeLayeredAction` and the app path `renderPresentation` directly. I did not import the backup through the Studio's Restore flow: the extracted `backup.json` stores `characters` as an object keyed `"0"`, `"1"`, while `readArchiveFiles` requires an array. That may be an extraction artifact, but it means the UI restore path was not exercised.

The items are the interesting part. **Every item except the knife has only a Default cell.** The jeans, shoes, shirt, plate carrier and braided hair all have `coverage` of four `default/*/0` cells and no walk or slash cells. The knife has Default plus slash art, and its layers are padded: 124x124 with pivot 62/102, against the body's 92x92 at 46/86. So the real data can test the body and a padded held weapon, but it cannot test animated trousers, shoes, outerwear or hair, because that art does not exist in the backup.

## Set verdict on Bonequin

Default outfit (body only) and the knife outfit produce identical geometry:

| Facing | Worst / median seam (px) | Max shared shift (px) | No-join pairs | Max hip departure X / Y (px) | Canonical verdict |
| --- | ---: | ---: | ---: | ---: | --- |
| South | 3 / 1 | 1 | 0 | 1 / 1 | Layered |
| East | 18 / 4 | 3 | 8 | 1 / 1 | Seam fallback |
| North | 2 / 1 | 0 | 0 | 1 / 1 | Layered |
| West | 18 / 4 | 3 | 8 | 1 / 1 | Seam fallback (mirror of East) |

With a realistic outfit (hair, torn shirt, jeans, old sneakers, plate carrier, kitchen knife), the geometry is unchanged but the engine verdict is **`gear-loss` on all 48 pairs in every direction**. `renderPresentation` reports layered true and zero hidden items for the same character undressed; dressed, it reports layered false, `gear-loss`, and the full-body attack result itself lists the same five worn items as hidden with a `hidden-items` notice.

The Waist control from -4 to +4 does not change any verdict: South and North stay 3/1 and 2/1; East/West stay at Infinity/4.

## Findings

### 1. Blocker for the default-on claim: the gear rule blocks items that the full-body attack already hides

**Evidence.** With the five clothing items worn, `renderPresentation` for South returns:

```
layered: false, fallback: "gear-loss",
hiddenItems: ["long_braided_hair", "camiseta_rasgada", "tenis_velho", "plate_carrier", "cal_a_jeans"],
notice: { kind: "hidden-items", count: 5, move: "slash", direction: "south" }
```

The same five items are already absent from the full-body slash, because the items have no slash cells. Refusing to layer preserves no gear at all. The only worn item with slash art is the knife, and the default/knife outfit layers correctly. The eligible pair is body plus knife; the rule discards it.

**Why the tests do not catch it.** The E2E's downgrade sample equips the demo's `hat_wizard`. That item has walk sheets and walk coverage but no cross-punch art: it is visible while walking and already hidden in the full-body attack. The Godot test deletes the cape's slash cells, so the full-body slash cannot draw the cape either. Both tests call the resulting `gear-loss` correct. They prove the latch and the single downgrade, but they prove the wrong loss semantics for the attack.

**Coupled defect.** `renderPresentation` clears `hiddenItems`, `loadingItems` and `loading` whenever a layered image exists (`presentation.ts:769-773`). If the gear rule is relaxed to ignore items the full-body attack hides, the user would lose the "5 equipped items hidden" notice that the full-body path shows. The notice must survive a layered render.

**Must change.** Compare what the full-body action actually draws with what the layered stack draws, and fail only on a real difference. In practice:

- Upper: an item is required only if it has art for the attack pose; otherwise it is invisible in full mode too.
- Lower: an item is a real loss only if it has art for the full-body attack but not for the walk pose, because the lower stack comes from the walk.
- Do not clear the hidden-items or loading notice just because the image is layered.

Add one fixture with a lower item that has attack art but no walk art (a genuine loss) and one upper item with walk art but no attack art (not a loss), and assert the two outcomes. Keep the current latch tests.

### 2. Major: real tracked hips are not silhouette-accurate, and the gate has no way to say so

**Evidence.** Bonequin East walk cell 4 has a tracked hip of y = 47.5. The waist row becomes 47, but the first opaque body row in that cell is 48. The lower fragment has zero pixels at the waist row, so every pair with that walk cell is a no-join and the whole East and West set falls back. Walk cell 3 has only 2 pixels at its waist row. South and North walk cells have 13 to 17 pixels at the waist row. This is not a threshold opinion; the anchor is 2 px above the drawn pelvis in a real tracked track.

I also injected a 2 px and 3 px vertical error into one Slash cell on South. The set still passed: the +2 case scored 3/1, the +3 case 4/1, and the -2 case 3/1, because the cut row and the torso offset move together. At 8x the 2 px down case shows a small but visible step at the waist ([base](review-flash-high/bonequin-hip-error-base-w0-a3-8x.png), [up 2](review-flash-high/bonequin-hip-error-up2-w0-a3-8x.png), [down 2](review-flash-high/bonequin-hip-error-down2-w0-a3-8x.png)). The prior review's 4 px horizontal error was caught by the shared-shift guard; the guard only measures horizontal common mode, so a vertical hip error of the same size is not caught.

**Why it matters.** The hip lock is only as good as the anchor. On this character it is exact on South and North, 2 px high on one East cell, and that one cell removes two directions. On another generated character a 2 px error could produce a 2 px waist step that still passes.

**Must change or verify.** Validate the anchor against the cell silhouette (at least that the waist row intersects the body near the hip) and fall back to measured hips or the nearest visible row when it does not, or record a hip confidence and refuse with a reason. Add the 2 px vertical-error case to the set tests so the behavior is explicit, and state in the docs that tracked anchors are not guaranteed to be silhouette-accurate.

### 3. Major: the 8 / 4 / 2 gate is absolute, not scale-aware, and the fit does not select for the shared-shift rule

The app's supported frame sizes run from 32 to 256 px (the size presets are 48, 64, 96 and 128). The gate limits are 8 px worst, 4 px median and 2 px shared shift at every size. On a 48 px character, 8 px is 17% of the cell and a real gap passes; on a 256 px character, 8 px is 3% and a normal clothing overlap can fail. The real 92 px data passes with a worst of 3, so the fixture is not the issue here, but there is no evidence at 48, 96, 128 or 256. This is a coverage bug for large characters and a leniency bug for small ones.

Separately, `layerOffset` minimizes the seam only. It can pick a neighboring offset with a 1 px better seam and a worse shared shift, then the set fails on the shared-shift guard even though the initial offset would have passed. The search should score the gate's actual rule, or at least prefer an offset that keeps shared shift under the limit when the seam does not improve.

**Must change.** Scale the limits by cell width, or calibrate them per size with rendered evidence. Add one 128 px and one 48 px set to the gate. Include shared shift in the fit selection.

### 4. Major: the tests prove the wiring, not the real behavior

- The only real-clip test is the E2E with bodyA art injected into the demo. It asserts attributes and the speed factor, not pixels over time.
- No real outfit with per-move item art exists in this backup, so trousers, outerwear, hair and their waistbands are untested in any mode.
- East and West on a real four-direction character are untested; both fail.
- The padded knife layer (124x124) is tested only in the canonical runtime by my render. The controller tests use 64 px fixtures.
- No test covers a vertical hip error, a large cell, or the "item missing on both clips" case.
- The gear-loss tests use items that the full-body attack already hides, and therefore assert the wrong behavior.

The suite would still pass if the composite drew a 2 px waist step, if East/West never layered, or if the real outfit never layered. It would fail if the latch, the channels, or the export fragments broke, which is what it was written to prove.

### 5. Moderate: the fallback is silent and the help text does not name the common cause

`data-attack-fallback` is only a test attribute. The settings help says capes and long coats may look odd, but not that a missing item clip or a seam mismatch turns the feature off. With the switch on by default and a real dressed character, a user sees a normal full-body attack and no explanation, even though the same render already shows a hidden-items notice. Surface the reason (at least "this outfit's move art does not support layering yet") or make the hidden-items notice cover it.

### 6. Minor: documentation and size drift

- The report's ZIP sizes are 116,783 to 130,971. The current gate prints 116,959 to 131,147; the +14,188 delta is unchanged, so this is source drift, not a new regression.
- On the real 92 px character the Phaser ZIP grows from 1,105,110 to 1,192,742 bytes, **+87,632 bytes (+7.9%)**, about six times the documented synthetic delta. The report discloses that its number is synthetic, but the only real number now available should replace it.
- The docs say "the recorded gear-pixel counts are input counts, not loss measurements". Correct, but the Phase A plan asked for gear-loss verification; the real outfit result shows the gear rule is doing the wrong comparison.
- The docs treat tracked hips as the truth. The East walk 4 evidence shows they are not always accurate enough, and the docs do not warn about it.
- The docs list "eight-direction attacks" and "diagonals" as unverified, but East/West are cardinal facings and fail on the only real four-direction character. This is stronger than "unverified".

### 7. Positive evidence (what holds)

- **South and North layer correctly on real data.** The full 6x8 grids at 4x ([South](review-flash-high/bonequin-south-grid-4x.png), [North](review-flash-high/bonequin-north-grid-4x.png)) keep the walk legs under the attack torso for every pair. No third hand, no missing arm, no detached component.
- **The limb ownership works on real 92 px art.** The walk has 7 to 71 arm-owned pixels below the hip in every cell, and the lower stack keeps **zero** of them. The slash has 0 to 16 arm-owned pixels below the hip in some cells, and the upper keeps all of them. Every attack pixel is either in the upper or is leg-owned and intentionally replaced by the walk's legs; no arm-owned pixel is missing and no walk arm pixel reaches the lower. This is the strongest positive result, and it covers the third-hand defect on real data.
- **The knife stays whole.** The padded 124x124 weapon draws once in the upper stack at the body offset; no clipping and no duplication ([worst](review-flash-high/bonequin-knife-south-worst-w1-a0-8x.png), [cycle](review-flash-high/bonequin-knife-south-action-cycle-6x.png)). The real draw order is `knife/bg z5`, `base/main (lower) z10`, `base/main (upper) z10`, `knife/fg z150`, so the weapon's background layer stays behind both body stacks.
- **The worst and median frames read correctly at 8x.** South worst Walk 1 / Slash 0 scores 3 px and shows normal shirt and shorts overlap, not a torso slide ([8x](review-flash-high/bonequin-default-south-worst-w1-a0-8x.png)). North worst Walk 0 / Slash 2's wide horizontal shape is present in the original Slash 2 source, so it is source art, not a composite defect ([8x](review-flash-high/bonequin-default-north-worst-w0-a2-8x.png)).
- **The mirror path is correct.** With bodyA plus a synthetic `west: mirrorOf east`, the West set scores identically and the West composite is byte-identical to the flipped East composite, and the export contains a West pair with anchors. The real Bonequin West still falls back for the East geometry reason, not for a mirror bug.
- **Exports and z order hold.** The real export contains only the two body fragment PNGs, no duplicate sheets, and the z-sorted stack keeps the knife's background layer behind the body. `canExportLayerAction` is true for default and knife South/North.
- **Performance.** The first layered paint for the real 92 px South set measured 17.4 ms cold (including first-call warmup), 6 to 7 ms for a repeat cold set, and 0.11 ms warm on this machine. That is a one-frame hitch at attack start at 60 Hz, worse than the 6.3 ms Node figure in the notes but not a sustained cost.
- **Checks and the E2E pass**, including the default-on switch, the Waist control, the 0.8 travel factor in full mode, and the single downgrade.

## Agreement with the accepted state

I agree with the Opus final acceptance on the plumbing: the latch, the shaped ownership, the whole lower clothing, the z merge, the explicit export choice, the no-duplicate sheets, the invalid sentinel, the mirror convention, the four operations and the slowdown sampling. The body-only composites on bodyA and Bonequin South/North are good, and the real-cadence E2E proves the latch wiring.

I disagree with treating the feature as accepted for real characters:

- The only real dressed outfit I could assemble from the backup never layers, and the full-body attack shows the same items hidden. The accepted gear-loss rule is over-strict in exactly the real case.
- East and West on the only real four-direction character fail, one because a tracked hip is 2 px above the drawn body. This is no longer only an "unverified environment".
- The 8/4 gate has no size scaling and no vertical hip-error guard. A 2 px vertical error passes, and the 4 px horizontal error was the class the previous review tried to catch.
- The tests that assert `gear-loss` use items that the full-body attack already hides, so they would prevent the correct fix.

This does not overturn the "mergeable" code review. It narrows it: mergeable as plumbing, not yet a real-character feature.

## What must change before calling the default-on switch useful

1. Fix the gear eligibility rule and keep the hidden-items notice; update the two tests that encode the over-strict rule; add a genuine loss fixture.
2. Validate the hip anchor against the silhouette or expose a reason, and make the East fallback explicit in the docs. At minimum, add the 2 px vertical-error test and decide whether it should pass.
3. Make the 8/4/2 limits size-aware or add 48/96/128/256 evidence, and include shared shift in the offset search.
4. Add one real or real-like clothed set with walk and slash item art, and one padded-weapon native controller run, before claiming clothing parity.
5. Surface the fallback reason, or make the hidden-items notice carry it.
6. Refresh the real archive size, hip-accuracy warning and East/West status in the docs.

## What remains unverified

- Real animated trousers, shoes, outerwear and hair over the seam; waistband alignment on real art.
- A real layered attack with a full outfit (the provided outfit cannot layer at all).
- A real East or West layered set; the mirror was proven only on bodyA with a synthetic west.
- Native Unity and Godot on this exact commit (I have no local binaries); native GDevelop editor.
- Browser frame timing and the first-frame hitch on real hardware; my numbers are Node.
- Foot sliding and the feel of 0.8 at native cadence; reduced motion; diagonals; eight-direction attacks.
- The Studio Restore path for this backup (the extracted index is an object, not the array the app expects).
- Cells at 48, 96, 128 and 256 px.
