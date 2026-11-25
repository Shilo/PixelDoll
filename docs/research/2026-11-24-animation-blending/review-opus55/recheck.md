# Recheck after the fix round

Date: 2026-11-24
Reviewer: Opus 5.5 (independent sub-agent)
Subject: commit `23281e1af` `fix: latch layered actions and correct the split`, against [FIX-PLAN.md](../FIX-PLAN.md) and my [challenge](challenge.md)

## Verdict

**Mergeable: no, but close.** The latch, the vertical constraint, limb ownership, whole lower clothing, the z merge and the export checkbox all hold. One visible quality defect remains on the only facing that ships with a raised arm (bodyA South): the bounded fit now slides the torso sideways against the legs by up to 6 px. Along real action timelines, it jumps by up to 10 px between consecutive 100 ms frames. The live screenshots show it. This is the horizontal version of my earlier Major 1. It is a blocker for the quality bar, not for the plumbing.

## What I ran

| Command (from `app/`) | Result |
| --- | --- |
| `npm run check` | exit 0, Prettier clean |
| `GODOT_BIN=…/Godot_v4.7.2-stable_win64_console.exe npx vitest run live-layering runtime export-phaser gdevelop-export godot unity experience-presentation` | 9 files, 101 passed, 0 skipped (native Godot included) |
| `node --experimental-transform-types ../docs/research/2026-11-24-animation-blending/offline-gate.mjs` | Matches implementation-notes: South layered 4/3, North layered 3/2, East `seam` 6/3 |
| Scratch probes (not committed) calling canonical `actionHip`, `splitLower`, `splitUpper`, `layerOffset` and `compositeAction` on bodyA, all 64 pairs per facing | Outputs in [recheck/](recheck/) |

Not run: E2E `experience-parity` (the coordinator ran it, and I changed nothing), the Unity verifier.

## Findings, by severity

### Blocker: the torso slides horizontally against the legs

The vertical fit is fixed: `layerOffset` keeps dy within `hipY ± 1` (`app/src/lib/runtime/paperdoll.js:769`). dx still searches −5..+5 in absolute terms, with no cost for moving away from the hips (`paperdoll.js:767-777`). `hipDeparture` reports only dy (`paperdoll.js:779`). The gate's `maxHipDeparture: 1` therefore looks clean while x is not.

On bodyA, horizontal departure from hip registration (`x - hipX`), with rows as walk cells and columns as slash cells:

```
South                       North
 0  0  0  0  0 -3  3  3     -2 -1 -1 -1  3 -1 -4 -5
 1 -4 -4 -4 -4 -2  4  4     -3 -1 -1 -1 -1 -1 -4 -5
 1 -4 -4 -5 -4 -4  4  4     -1  0  0  0  0  0 -3 -4
 1 -4 -4 -4 -4 -3 -5 -5     -3 -1 -1 -1 -1 -1 -4 -5
 1  1  1  1  1 -2  4  4     -1  0  0  0  4  0 -3 -4
 1  1  1  1  1  1  4  4     -1  0  0  0  0  0 -3 -4
-6 -4 -4 -4 -4 -3 -6 -6     -3 -1 -1 -1 -1 -1 -4 -5
-6 -4 -4 -4 -4 -3 -6 -6     -3 -1 -1 -1 -1 -1 -4 -5
```

- South: median |departure| is 4 px, the maximum is 6 px, and 43 of 64 pairs are at 3 px or more. North has a median of 1 px and a maximum of 5 px.
- Along real timelines (both clips at 100 ms, every start phase), the departure changes by up to **10 px between consecutive frames** on South and 5 px on North. Example: walk 2 → 3 with slash 5 → 6 goes from −4 to −5 to +4.
- [recheck/zoom-south.png](recheck/zoom-south.png) shows the result (lower-sourced pixels tinted blue in column 5). At walk 1 / slash 1 (dx −4) and walk 6 / slash 7 (dx −5), the shirt sits about 4 to 5 px to one side of the shorts. At walk 1 / slash 6 (dx +4), it sits to the other side.
- The coordinator's own capture shows it: in [16-layered-action-0](../evidence/live/16-layered-action-0.png) and [-2](../evidence/live/16-layered-action-2.png), the shorts stick out to the right of the shirt hem. In [-4](../evidence/live/16-layered-action-4.png), the torso sits right of the legs. A still frame reads as a slight lean. In motion, it is a sideways wobble of the whole upper body.

Likely cause: the seam compares the upper's row just above the waist with the lower's waist row, within ±`cellWidth/8` of the hip. Since the limb fix, arm-owned pixels at the waist stay in the upper and are excluded from the lower. A hanging hand therefore widens one side of the upper's extent, and the fit chases it sideways. Fix in the shared code:

- Apply the dy rule to dx as well (hip ±1), or add a distance penalty to the score.
- Exclude arm-owned pixels from the seam extents.
- Report the horizontal departure in the gate.
- Re-run the gate. This may turn South off at 4 px. If so, that is the honest result.

### Major: the test FIX-PLAN item 3 asked for is missing

"Add a test that the torso height does not move by more than 1 px between layered frames" became a single-pair `|hipDeparture| ≤ 1` assertion (`app/test/unit/live-layering.test.ts:50`). No test covers frame-to-frame placement, and none covers x. A placement-jitter test across the bodyA South set would have caught the blocker above.

### Minor

- **Whole-action tests: partly real.** The Phaser, GDevelop, Godot and Unity tests toggle `setActionLayering(false)` mid-action and advance the gait. They would fail with the old `layered && layerActions` code, so they are real for the toggle and gait-advance cases. No fixture contains a set with one failing pair, so no test proves that such a set is full throughout. That holds by construction: `prepareActionSet` returns early on any failing pair (`paperdoll.js:910-917`), and `actionSheets` exports a pair only when every used cell qualifies (`app/src/lib/export/sheets.ts`, the `every` guard). One unit test per side would pin it down.
- **Downgrade coverage.** Phaser and Godot assert the single downgrade and no re-upgrade. GDevelop, Unity and Live do not. The Live latch (`WorldStage.svelte:1379-1422`) is covered only by the E2E `attackLayered` set assertion, which never exercises the downgrade.
- **Cold set preparation runs on the first action frame in Live.** The notes measured 6.5 ms at 64 px and 17.5 ms at 128 px in Node. That is a one-frame hitch at attack start, and browser and mobile timing is unmeasured.
- **Stale docs.** `gate-results.md` was not updated in this commit. It still states the 1 px seam rule and per-pair qualifying tables, which contradicts implementation-notes.md and the code. `evidence/live/README.md` does not describe screenshots 16 and 17 or the method that produced them.
- **Size claim.** +14,110 bytes (12.1%) is measured on the bodyA atlas with synthetic gear, not on a real dressed character as FIX-PLAN item 7 asked. The direction of the claim is plausible because non-body upper layers now point at existing sheets (`sheets.ts`, `paths[clip] = layer.sourceSheets?.[clip] ?? layer.sheets![clip]`).

### Nits

- Exported `planes.anchors` are `Math.round(hip + 0.5)`, so authored anchor `[32,32]` exports as `[33,33]` (test expects this). Controllers use only differences, so playback is unaffected. `manifest-spec.md` calls them "hip registration coordinates", but a reader could take them as pixel indices. Say they are pixel-center-rounded.
- The Godot native test does not assert that the cape draws first. The z merge is asserted in JS (`draws[0].item.id === 'cape'`) and in the Live compositor.

## Item-by-item

| FIX-PLAN item | Status | Evidence |
| --- | --- | --- |
| 1 Latch | **Holds.** Live decides once per `actions.attack` identity, freezes the gait cell on stop or turn, and drops to full once on a failing re-prepare. All four controllers drop `&& layerActions` from rendering and re-check only on equip or preset. `play` cancels in exports, so a facing change cannot flip an action. | `WorldStage.svelte:1379-1422`; phaser/gdevelop `checkActionOutfit`; Godot `_refresh`; Unity `CheckActionOutfit` |
| 2 Set verdict | **Holds.** One verdict per (walk, action, direction, outfit, waist), cached, with stable padding from the max offset. Gear loss now means "no art", not "clipped by the frame". | `prepareActionSet`; gate prints `verdict` |
| 3 Vertical fit | **Holds for y** (departure −1..0 on South and North, frame-to-frame ≤1). **Fails for x** (blocker). | probe output above |
| 4 Limb ownership | **Holds.** On South walk 1 / slash 1, the walk hand (23,48) is absent from the lower and the slash hand (38,46) stays in the upper. No pair in South, North or East has a detached component in the composite, and the montage shows no third or missing hand. | [montage-south.png](recheck/montage-south.png), `stats-*.json` (`parts` = 1 for all 192 pairs) |
| 5 Lower clothing whole | **Holds, synthetic only.** The 5×18 trousers strip spans 2 rows above the waist and draws at Waist 0. No real trousers item has been tested. With the x slide, a walk waistband will misalign with the shifted shirt. | `live-layering.test.ts` `red(first, 24, 30) === 120` |
| 6 z merge | **Real.** At (30,40), below the waist, the lower body (70) draws over the z-1 bg cape. The old whole-stack order would have shown the cape (150). Export draws sort the cape first. | `live-layering.test.ts` |
| 7 Export choice | **Holds.** Checkbox, default off, not persisted, independent of Live, limited to the four engines. Non-body upper sheets are not duplicated. Size measured only on synthetic gear. | `ExportSheet.svelte`, test asserts exactly two `action/` files |
| 8 Small corrections | **Hold.** The anchor `+0.5` and the `floor` waist row are consistent with each other. The `""` sentinel is documented in `javascript-runtime.md` and tested in all four (Unity in the verifier only). The tooltip mentions capes and long coats and 80%. implementation-notes.md is current. The cache exists (WeakMap per project, 8 sets). | as cited |
| 9 Real-cadence visual check | **Partial.** See below. | |

## The coordinator's real-cadence pass

The 18-of-18 result proves only the latch wiring in Live, for one set. With a set verdict, every frame of a passing set is layered by construction, so 18 of 18 was guaranteed once the set passed.

It does not prove:

- motion quality: the stills show the horizontal slide, and the check did not mention it;
- foot sliding at the 0.8 travel factor;
- the downgrade path in Live;
- stop or turn freezing;
- the full-body fallback visual (the capture hit a missing-direction notice instead, as the coordinator noted);
- any facing other than South;
- reduced motion, or a real generated character.

The temporary spec is deleted, so the method cannot be re-run.

## Agreement with the round-3 acceptance

I agree on the latch, the limb fix, the z merge, the export choice and the small corrections. I disagree that the remaining gaps are "test coverage and unverified environments, not known behavior defects": the horizontal slide is a known, measurable, visible defect, and it is present in the round-3 screenshots. I agree that the missing downgrade tests in Live, GDevelop and Unity are non-blocking.

## Still unverified by me

- The Unity verifier on this commit.
- E2E on this commit (I relied on the coordinator's run).
- Browser frame timing of cold set preparation at 128 px.
- Real trousers, coats and capes.
- Diagonals and 8-direction rigs.
- Real generated characters with tracked hips.
- Foot sliding at native cadence.
