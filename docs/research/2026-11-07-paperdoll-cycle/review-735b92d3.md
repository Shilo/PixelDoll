# Review of 735b92d3 (cleanup and D1 stop rejecting real item parts)

Skeptical review against the owner's bar: remove rigid assumptions without making output worse. Also re-checks eb55d9a0
(signed G9, pixel-center G8, held repair disc) and 50cca648 (despill keeps sub-key own colors). Offline only: no PixelLab
calls, no app/ edits. Method: the frozen bench (`app/test/fixtures/bench`) replayed through the parent `items.ts`
(735b92d3~1, copied to the gitignored `app/test-results-review/items-parent/`) and the current one; every cell whose kept px
changed was diffed per component and judged on zoomed images.

## Scripts (run from the repo root with `node <file>`)

All under `docs/research/2026-11-07-paperdoll-cycle/scripts/review/`. Images go to `app/test-results-review/735b/`
(gitignored, regenerable).

| Script | What it shows |
|---|---|
| `compare-735b.ts [case]` | Per-cell px kept only now / only before, per added component; QA fail and warning deltas; 4-panel diff sheets |
| `why-kept.ts [case]` | Each added component: size, share off the body, distance to parent-kept px; 12x crops |
| `strip.ts <case> <anim/dir> [zoom] [box]` | One clip as raw / parent / current rows (magenta = kept only now) |
| `held-reasons.ts` | Which rule admits each held component (near, grip, body bridge), parent vs current, and the proposed fix's effect |
| `held-radius.ts` | `heldRepairRadius` on the bench held keyframes, parent vs current |
| `bow-holes.ts` | The bench.test.ts grip-hole count per bow cell, parent vs current |
| `worn-consensus.ts` | Temporal consensus of every restored worn part |
| `d1-variants.ts` | D1 gray share: parent, current, and a near-black-blob variant, on real keyframes and synthetic blotches |
| `despill-blend.ts` | 50cca648: which key blends now keep their raw (greener) color |

## Totals (bench, parent vs current)

No case loses a single kept px; every change is an addition.

| Case | Cells changed | Px added | QA |
|---|---|---|---|
| a-bow96 | 10 | 557 | fails 5 -> 1 (G4/G5 gone, G9 east 125° -> 35°), keep 10/11 -> 11/11 |
| a-cape | 17 | 495 | G4 slash/north 21 -> 23 % (still fails, as labeled) |
| n-cloak128 | 11 | 582 | unchanged |
| b-cloak | 15 | 411 | unchanged |
| b-jester (reference) | 32 | 764 | H4 fails 56 -> 40 |
| b-tunic | 1 | 34 | unchanged |
| a-sword96 | 2 | 33 | unchanged |
| a-axe96 | 3 | 29 | G4 warn 33 -> 36 % |
| a-chest | 1 | 7 | unchanged |

The `npm test` files the commit touched pass (27 tests: held-detached-parts, worn-parts-and-outline, design-gray,
helmet-occlusion, bench).

## 1. Held bridge rule: regression in one frame (anchor leak); otherwise a clear win

**Win.** The side-view bow now keeps its far limb in 6 of 8 walk east frames (75 to 86 px each) and its string or lower limb
in 4 north frames (`strip-a-bow96-walk_east.png`, `strip-a-bow96-walk_north.png`): every added px is visibly bow. The axe keeps
its handle butt behind the fist in slash/east/4 (15 px, `strip-a-axe96-slash_east.png`).

**Regression: parts the floor drops still anchor other parts.** `heldParts` (`items.ts:552`) builds its keep set without the
size floor, and the fixpoint dilates every kept part, not only the largest. `attachHeld` (`items.ts:586`) applies the floor
afterwards, so a part that is later dropped has already pulled neighbors in. On a-sword96 walk/east/1 an 8 px body-bridged
fleck (gap 12 px, dropped by the floor) anchored a 15 px gold belt buckle painted on the hip, which then anchored a 4 px
sliver on the arm edge. Both are 100 % on the body (so not bridged themselves) and survive the floor through the 6 px wrist
exemption. Evidence: `held-reasons.ts` (`walk/east/1 ... "why":"near#2"` / `"near#1"`), crop
`crops/a-sword96-walk_east_1-46_60.png`. This is exactly the "redrawn body detail" class the old rule removed.

**Smallest fix.** Apply the floor inside the fixpoint: give `heldParts` an admission predicate (`comp.length >= floor ||
grip(comp, 6)` from `attachHeld`) so a part that fails it can never be kept or anchor. `held-reasons.ts` simulates it: across
all three held cases it changes exactly those two components (19 px) and keeps every other gain (bow, axe).

**Acceptable.** a-sword96 walk/east/6 keeps a 14 px gold blob behind the back (bridged, 86 % off body). The old rule already
kept the same blob in frames 3 to 5 via the wrist, so the clip is now more consistent, not newly polluted. a-axe96
slash/north/5 keeps a 3 px fleck at the requested wrist (the clip draws the axe in the other hand). slash/south/5 keeps an
11 px brown strip on the far hip edge; ambiguous (handle end or outline redraw), below review threshold.

**Untested risk.** Bridges are unbounded in length (bench bridged specks reach 30 px gaps); only the size floor stops a
larger far-side slash streak. No bench smear reaches the floor, so this is unmeasured. An axis-collinearity test does not
separate them (real bow limbs 17-26° off axis, dropped specks 3-76°), so no extra rule is recommended without data.

## 2. Held repair radius: fine on the bench, same leak in principle

`heldRepairRadius` (`run.ts:158`) uses `heldParts` with no floor, so a bridged 2 px speck counts toward reach. Bench: radius
stays at the 34 px minimum for sword, axe and bow; bow reach rises 22.3 -> 25.1 (south) and 22.0 -> 25.6 (east), from real
limbs (`held-radius.ts`). Fix with the same predicate (the size floor), so open-air or body-bridged flecks cannot widen the disc.

## 3. Worn size-floor exemption: fine on the bench; one cheap hardening

All 126 restored worn components were judged on strips: cape clasps (a-cape, in 5 of 8 walk south frames before), cape lining
between the legs and in arm gaps (a-cape, b-cloak, n-cloak128), the tunic hem behind the stepping leg (b-tunic SE/2), the
chest edge under the arm (a-chest), the orphaned jester bell matching its keyframe (b-jester). None is a smear; no bench
smear was revived (0 px removed anywhere, so nothing the old rule dropped as a speck that the bench labels as drop came back).

By construction (`items.ts:682`) any detached part lying mostly on the rest silhouette is exempt, and a cape's ghost trail
lies exactly where the cape was. `worn-consensus.ts`: every restored part also appears in at least 2 of the 7 other frames of
its clip (min share 0.29, median 1.0). Requiring that (as `trimToKeyframe` already uses consensus) would keep every gain and
reject one-frame ghosts. Optional; not a demonstrated regression.

## 4. D1 near-black exclusion: acceptable tradeoff with a better discriminator available

D1 exists for the T3 red cape's smudged north hem: its smudge color is (71,64,58), still counted (share 0.113 -> 0.133). The
jester fix is real (a-jester-blue 0.307/0.300/0.230 -> 0.018/0/0). The cost: a near-black or dark-gray blotch (max channel
< 48) inside a colorful design is now invisible (synthetic 6x6 blotch: parent 0.201, current 0.000). No real dark smudge is on
record, so this is a blind spot rather than an observed regression.

`d1-variants.ts` "blob" rule: count near-black px only when covered by a fully near-black 3x3 window (a morphological
opening). Outlines and lines up to 2 px thick never count; blotches do. It equals the current rule on every real keyframe
(T3 capes and all bench keyframes) and catches the synthetic black and dark-gray blotches (0.063 > 0.05), including with a 2 px
outline. Thick black design areas count as they did before 735b92d3, and black/gray prompts are still exempt.

## 5. Test expectation changes

- Bow grip holes 26 -> 29: justified. `bow-holes.ts`: no existing hole changed; the 3 new ones (walk/east/5: 1, walk/north/6:
  2) all sit within 2 px of newly kept limb px, so the "near the bow" region simply grew.
- design-gray glyph 35 -> 90: justified for that file (it tests the face_acc exemption, and its 1-row glyph would be line art
  under either rule), but no test now covers dark smudges; add a dark-blotch case if the blob rule is adopted.
- Cape hem 0.1128 -> 0.1333: justified; only the denominator shrank, and the `> DESIGN.gray` assertion is unchanged.

## 6. Interactions

G4/G5/G9: bow failures drop because its area is now whole; the remaining G9 east (35°) is a real turn. Signed G9 (eb55d9a0)
uses the kept mask's centroid; restored bow limbs move it toward the grip, which makes the signed test fall back to the
unsigned axis more often for bows, as designed. H4: b-jester fails drop because posed frames now match their keyframe. Dye and
export: restored px are design colors; the sword buckle in item 1 would be dyed with the sword. Repair grids: see item 2.

## 7. Earlier commits

- **eb55d9a0: fine.** Signed G9 only engages when reach >= 10 px, the centroid is off the wrist and along the axis; pixel
  centers for G8 are a pure bias fix; the disc never shrinks below 34 px. No bench verdict changed (bench.md untouched).
- **50cca648: acceptable tradeoff.** It changes 0 real bench px. `despill-blend.ts`: a green-dominant blend px that scores
  below the key and matches no clean color now keeps its raw, greener color (red item at 60 % key: 108,136,52 instead of
  108,108,52; blue: 52,148,116 instead of 52,116,116; gold at 30 %: 165,179,60 instead of 165,165,60). Pixel-art outputs rarely blend, so this is a fringe risk on
  anti-aliased rims. Hardening if it shows up: apply `own` only to colors that recur in the layer (design colors repeat, rim
  blends are sporadic) or that are not on the layer boundary.
