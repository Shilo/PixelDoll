# Final recheck: hip-locked placement and the 8/4 seam rule

Date: 2026-11-24
Reviewer: Opus 5.5 (independent sub-agent)
Subject: commit `92630302c` `fix: bound layering to the hips and ship the passing sets`, diff from `c005566d`

## Verdict

**Mergeable: yes.** The torso slide from my [recheck](recheck.md) is fixed by construction, and every shipped set renders correctly at 8×. The 8/4 rule is acceptable for the recorded fixtures, but it is calibrated just above them (worst 7, median 3) and the seam scalar cannot tell garment overlap from a real torso shift of about 3 px. I found no blocker in shipped data. I list one follow-up below, the gate's blindness to bad hip keypoints, which is the thing to watch after merge.

## What I ran

| Command (from `app/`) | Result |
| --- | --- |
| `npm run check` | exit 0, Prettier clean |
| `GODOT_BIN=…/Godot_v4.7.2-stable_win64_console.exe npx vitest run live-layering runtime export-phaser gdevelop-export godot unity experience-presentation` | 9 files, 109 passed, 0 skipped (native Godot included) |
| `node --experimental-transform-types …/offline-gate.mjs` | Matches gate-results.md: South 7/0, East 6/3, North 7/0, max hip departure 1/1 on every set. Regenerated evidence was byte-identical (`git status` clean). |
| `node --experimental-transform-types scripts/verify-unity-export.mjs --editor …/6000.4.0f1/Editor/Unity.exe` | passed; see "Unity and E2E" |
| `npm run e2e -- experience-parity -g "Walk while attacking layers"` | passed; see "Unity and E2E" |
| Scratch probes (not committed) on bodyA South, East and North: signed waist-edge decomposition of every seam, and a single injected hip error on Slash 3 | outputs quoted below; [recheck2-injected-hip-error-south.png](recheck2-injected-hip-error-south.png) |

## Item by item

| Claim | Status | Evidence |
| --- | --- | --- |
| dx and dy hard-limited to hips ±1 | **True.** The only search is `dx ∈ hipX±1`, `dy ∈ hipY±1` (`paperdoll.js:772-773`). The old ±5 clamp on `hipX` and the absolute −5..+5 dx loop are gone. `hipDepartureX` is reported. No other offset search exists (`layerOffset` is the only producer; `sheets.ts` and `prepareActionSet` call it). | code; gate prints `maxHipDepartureX: 1` on all sets |
| Seam excludes arm-owned pixels | **True** when both limb chains are complete: `seamMask` keeps only upper pixels nearer a leg segment than an arm segment, and `extent` reads the mask instead of alpha. The test pins the slash hand out of the mask. Without complete chains the mask is undefined and alpha is used, as documented. | `paperdoll.js:716-720, 741-750`; `live-layering.test.ts` `seamMask?.has(...) === false` |
| No slide or jitter | **True for bodyA.** Placement departure is ≤1 px per axis on all 192 pairs; adjacent-frame change is ≤2 px per axis (the new jitter test checks every walk, action and simultaneous step on South, including the walk loop). | gate output; jitter test |
| 8/4 justified by visuals | **Partly.** See the next section. | |
| Source-art hand | **True.** In [27](../evidence/27-south-slash-source-vs-composite-8x.png) the light-gray detached shape beside the right elbow is present in the original Slash 5 cell and appears identically, translated, in the composite. The composite does not introduce it. The gray block at the left hip in the same composite (and in [live/19](../evidence/live/19-bodyA-south-full-slash-8x.png) Slash 5 / Walk 4) is walk-sourced: the lower layer copies only leg-owned source pixels verbatim, so it is the walk cell's own shorts, not a seam artifact. | images; `splitActionBody` copies source bytes |
| Full action capture | **True and acceptable.** live/19 shows all eight Slash cells in order, including the 7 px Walk 4 / Slash 5 pair. Torso and shorts stay registered in every tile; no third hand, no gap, no sideways jump. | image |
| Boundary tests | **Real.** `actionSetScore` table covers 8/4 pass, 9 worst fail, 5 median fail, and Infinity. | `live-layering.test.ts` |
| Single failing pair, Live and export | **Real.** One pair over 8 px, one unusable limb split, or missing hips each give `fallback` on every pair in Live and zero exported `pairs`, with draws falling back to the full action. | `live-layering.test.ts` `test.each` |
| Downgrades | **Real** in GDevelop (unit), Unity (NativePlayback, run through the verifier) and Live (E2E MutationObserver: layered, then `gear-loss` full, then no re-upgrade after unequipping). Phaser and Godot were already covered. | diffs |
| Docs and stale fixes | **Fixed.** gate-results.md now states the 8/4 rule, the ±1 bound on both axes, placement change, and the worst pairs. live/README describes 16 to 19 and their method. `actionPairFallback` is removed everywhere, including `compose.ts`. | docs |

## The 8/4 rule

What the probe shows about the shipped worst pairs (signed edge differences top minus bottom at the chosen placement):

- South Slash 5 with every walk cell: left edge +5 to +6, right edge −1 to −2. North Slash 4/5: one edge 5 to 6, the other 0 to 1. East: −5 to −6 width differences, or a small −3/−2 pair.
- Each one is one-sided: one edge differs, the other is nearly zero. That is a silhouette or garment difference (the shirt is narrower at the waist on one side in that pose), not a translation. The 8× images agree. Max common-mode shift (the part both edges share) is 0 on South and North and 2 on East.

So the coordinator's reading is correct: with placement locked to the hips, the seam no longer measures alignment. It measures waist-silhouette difference, and a robust worst/median rule is a reasonable response to that.

But the numbers sit right above the fixtures (worst 7 → limit 8, median 3 → limit 4), and the scalar is blind to a real shift of the size my recheck flagged:

```
Inject a hip error on Slash 3 only (worst / median -> verdict)
South: +4 px -> 7/1 layered, +5 px -> 8/1 layered, +6 -> 9/1 seam
North: +5 px -> 7/1 layered, +6 px -> 8/1 layered
East:  +2 px -> 8/3 layered, +3 px -> 10/3 seam
```

A 4 px keypoint error on South gives a 3 px torso slide in that cell (Walk 0 / Slash 3 seam 6, offset −2 instead of +1). It stays layered, and it is visible: [recheck2-injected-hip-error-south.png](recheck2-injected-hip-error-south.png), right column. Under the old 4 px rule, that pair would have failed. That is the class of set that "should fail now passes". It does not occur in any recorded data, because bodyA's hips are accurate, so it is not a merge blocker. It matters for generated characters whose skeleton-v3 keypoints drift on one frame.

A better criterion is cheap and fits the current data: split each seam into its common-mode part (`sign·min(|dL|, |dR|)` when both edges move the same way, else 0) and its one-sided part. Hard-fail a pair whose common-mode part exceeds 2 px, and keep the 8/4 rule for the rest. On the recorded sets the common-mode maximum is 0 / 2 / 0 (South / East / North), so nothing that ships today changes. A 4 px injected hip error reaches 3 on South, 5 on East and 3 on North, so it would be caught. A 3 px error is caught on East and North but not always on South. This is a follow-up, not a blocker.

## Regressions from the threshold change

- Gear and limb hard failures: **not weakened.** Missing hips (`hip`), an infinite seam (no join, which includes an unusable limb split), and undrawable required layers still force full-body before or independent of the score (`prepareActionSet`, `actionSetScore` Infinity check, `sheets.ts` `blocked` and count guard).
- Hidden bad frame: **only via bad hips**, as above. With accurate hips, the worst admissible pair is a ≤8 px one-sided silhouette difference, which reads as clothing overlap at 8×.
- Export parity: `actionSheets` now requires `seams.length === walk.used.size * attack.used.size` and the same `actionSetScore`, so Live and export cannot disagree on a set. An empty `used` set yields worst Infinity and falls back.

## Unity and E2E

- Unity verifier (Editor 6000.4.0f1): exit 0. Play Mode 4540 checks passed, including the new downgrade and no re-upgrade checks. GPU render 648/648, Linear 648/648.
- `npm run e2e -- experience-parity -g "Walk while attacking layers"`: 1 passed, including the Live downgrade sample `3/false/gear-loss/false`.

## Still unverified

- Real generated characters with skeleton-v3 hips, especially one-frame keypoint drift (the watch item).
- Real trousers, long coats and capes over the seam mask.
- Diagonals and 8-direction attack sets; only bodyB Walk/Walk diagnostics exercise diagonals.
- Browser frame timing of cold set preparation at 128 px (Node: 6.3 ms cold).
- Foot sliding at native cadence; reduced motion; touch devices.
