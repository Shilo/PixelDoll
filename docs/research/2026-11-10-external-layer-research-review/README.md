# External layer-extraction research review (2026-11-10)

Review of an outside research note ("Can AI keep clothing layers consistent? A small test with PixelLab", 2026-11-07) and its companion tool page ("PixTools": `pix_snap` grid recovery, `pix_layer` base subtraction). Starting revision `f4a0b0fa`. Offline only: 0 PixelLab calls, $0 spent. Five agents: claim mapping, diff replication, gate mutation tests, import audit, and an independent challenge that replayed the real `evaluateItem`.

## The outside method

One 64 px character, 8 directions. Outfits via PixelLab "create character state"; layer = dressed sprite minus plain base, drop pieces under 5 % of the largest, then keep only colors not in the base palette plus dark outline (R+G+B < 150).

## Verdicts

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Outfits stay consistent across 8 directions | True; already how PixelDoll dresses (one call for all drawn views) | §4.1 architecture. "Never vanished" does not cover partial loss, see the gap below |
| Same prompt twice gives a different outfit | True; already handled (everything is stored, nothing regenerated) | known-issues, S3 |
| Base subtraction works on a plain base | Partly. Only at a high tolerance (about 32 per channel), and never for posed frames, which have no "before" | Replay on 80 real S1/S2 cells: diff F1 0.48 / 0.59 / 0.76 / 0.94 at tolerance 0 / 8 / 18 / 32; production chroma 0.99 |
| Palette clean removes 97 % of hair leak at 12-23 % outfit cost | Does not transfer to PixelLab | Exact matching removed 0.04 % of false px and 0 % of gear (PixelLab never repeats exact base colors). A tolerant match deletes gray steel: greathelms lose 23-77 % on the 627-cell bench. Matches the 2026-10-24 palette-key rejection |
| Layers stack | True; already handled (z ladder, fg/bg, tuck-under) | §4.6, §5 |
| "Numbers missed the missing skirt" | True for PixelDoll too | Gap below |

The "≈ 74 % of the body recolored" figure (S1) and the note's 30-409 changed px do not conflict: S1 counts any change, the note used an unstated tolerance. No paid re-test: character states are not an allowed route and cannot be posed. Minor: one stored skin set measured 11.5 % exact body px, against §4.4's "0 %" (different data); no decision changes.

Nothing from the cleanup ports: keeping dark px adds about 30 false px per cell on chroma output; the 5 % component floor is equivalent to the current rule; the base-palette check repeats the 2026-11-07 rejection.

## Gap: one wrong dressed view saves as clean

Every gate compares a posed frame with its own direction's dressed keyframe. Cross-view checks exist only for gray smudges (D1), waist bands (D2), empty views (`hiddenViews`), opposite-view torso (G14) and held-item hand. G6's design palette includes every view, so a recolored view is part of its own reference.

- Mutations applied to one direction's keyframe and all its posed frames: 68 of 74 on clean bench items stayed clean (lower 40 % erased, hue shift, top half removed in back views, half area).
- Confirmed through the real `evaluateItem` and `isClean` (only the queue and blob store stubbed): 7 of 7 cases auto-save, including a tunic that lost 70 % of its pixels to the key.
- Garment parts colored as the key and lying on the body silhouette are a silent-loss path: G3 counts only key px outside the body and K1 skips px already keyed out.
- Real occurrences: T3 recorded a thin east chest and a smudged north cape hem from the dress keyframe; only the smudge got a check (D1). No measured rate.

Prototype (`scripts/gates/proto.ts`): per view against the nearest other view, flag an extent gap > 0.10 body heights or palette distance > 20. It caught every hem, top-half and recolor mutation with 0 false flags on 17 non-held items (61 views). The challenge rejected it as not ready: thresholds were tuned on the same small corpus with thin margins (worst real values 0.065 and 15.6), and likely false flags include quivers, capelets, tails, long hair, hood down and front-only crests.

Recommended fix, smallest first, both review notes only (no paid retry):

1. Make G6's design reference leave-one-out: compare each dressed view with the other views' colors.
2. Fold an extent outlier test into `smudgedViews`, which already compares each view with the others; only if the live test below passes.

Live qualification (dress calls only, about 25 calls): legitimate view-dependent designs (waist-length hair, quiver, short capelet, backpack, tabard with front crest, hooded cloak with hood down, fox tail; 2 seeds each), past failures (red cape, leather chest armor, long dress; 3 seeds each), and two 8-direction calls. Label every view by eye, then run the checks offline. Kill the extent rule if any legitimate design is flagged.

## Smaller findings

- **Upscaled or JPEG imports are accepted silently.** A 4× upscaled sprite in a PixelLab ZIP becomes a 256 px rig (higher item prices, mixed pixel sizes); blur, noise or JPEG adds 3,000-13,000 colors, which harms recolor and keying. A small integer-scale detector found scale and phase in every synthetic case with 0 false positives on 184 native cells. Recommendation: an import warning only, no automatic snap (no user reports; the rig never rescales art). Reconsider when single-image or concept-image uploads ship.
- **Exact-prompt bases may be clothed.** The exact prompt can omit the bare-body line without notice; layers only add pixels, so base clothing shows around items. Recommendation: a one-line hint in the exact-prompt editor. Untested on real art.

## Scripts

`scripts/` holds the experiment scripts as run. Paths are replaced with `<REPO>`, `<MAIN_CHECKOUT>` (untracked S1/S2 spike output under `spikes/api/out/`, also at commit 1f95029) and `<SCRATCH>` (output folder); set them before running. `gates/` and `challenge/` run with `node --experimental-transform-types --import ./register.mjs <script>`; `imports/` runs with vitest using `vitest.scratch.config.mjs`; `diff/diffrep.ts` runs with `node`. Inputs: `app/test/fixtures/bench/` (17 live cases, 627 cells) and the S1/S2 spike frames.
