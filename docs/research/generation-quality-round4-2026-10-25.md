# Generation quality, round 4 (2026-10-25)

Status: **done.** 136 generations (G 100, I 36), ledger `spikes/api/out/c25d/`; harness `spikes/api/c25/arm_r4.mts`,
`eval_r4.mts`. Owner decisions after the [external reviews](generation-quality-round3-2026-10-25.md#external-reviews-codex-and-an-independent-subagent-each-challenged-by-a-skeptic-subagent):
delete the unused baked-color export, no hard-coded bow exception, and test the two paid ideas.

## Rules (fixed before the run)

| # | Question | Arms | Rule |
|---|---|---|---|
| G | Prompt grammar: "1 cells rest facing south", the held color clause attached to "the arms stay exactly as they are", the grid's "the identical a red cape" and "a 8-frame" | Production vs fixed wording, same seed 7, body A: dress of the S4 helmet, cape, chest and an off-hand longbow (96 px), and one cape grid repair (walk east) | The new wording ships only if no pair gets a new hard-gate failure and the sheets look no worse |
| I | One pose call for idle + walk | Chibi body (idle 4 + walk 8), the round 2 chibi helm and jester keyframes, per direction: idle alone vs one 12-frame idle + walk call (action "walk"); walk alone from round 2 | Adopted only if neither part has more failing clips than the separate calls, the idle part still stands, and the price holds |

## Results

| # | Result | Decision |
|---|---|---|
| G | New wording: the cape's back view came out as thin strings (G3 0.147), and the bow went diagonal with G2/G3 fails in two views; helmet, chest and the grid passed with both wordings. **PixelLab is not deterministic:** the old-wording bow request is byte-identical to round 2's (same body, seed 7), yet 6–10 % of pixels differ and the bow is upright this time. One same-seed pair therefore cannot separate wording from noise. | **Not adopted** by the rule; the wording stays (cosmetic, and every stored request stays comparable) |
| I | 12-frame calls cost **3 gens**, like 8 (docs: 15 frames 4). Separate calls: helm passes, jester fails one H4 frame (walk east 5). One call: both pass every clip in all 3 views; the idle frames stand still. | **Adopted** for idle + walk of a direction, non-held items: 3 gens instead of 6 per direction (a 3-direction item: 28 → 19 gens; 5 directions: 40 → 25) |

## Changes

- `planItem` packs idle and walk of a direction into one pose call when they fit 15 frames (`posePlan`); the call's action is its
  longest move (`callAnim`), and each cell is posed through its own move's keypoints (`cellKeypoints`). Held items and other
  moves keep one move per call (not measured). Adding a move later still poses that move alone.
- A failing packed call re-rolls both moves for the same 3 gens. Its grid fallback names both moves in the prompt (single-move
  grids keep their wording) and is skipped when the packed grid would not fit 512 px (12 frames + 5 views on a 128 px cell).
- Pose price estimate: 12 frames 3 gens (was 4).
- `export/colors.ts` (bake a recolored item copy per outfit) is deleted: nothing called it, and every runtime already swaps
  exact palette ramps live, which also lets a game change colors. The spec appendix and the export README described it as
  shipped; both now describe what exports do.
- Not changed: re-rolls for bows in side views (a hard-coded exception for one item class; a re-roll recovers about 1 in 6).
