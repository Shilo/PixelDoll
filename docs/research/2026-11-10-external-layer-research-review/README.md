# External layer-extraction research review (2026-11-10)

Review of an outside research note ("Can AI keep clothing layers consistent? A small test with PixelLab", 2026-11-07) and its companion tool page ("PixTools": `pix_snap` grid recovery, `pix_layer` base subtraction). Starting revision `f4a0b0fa`. Offline review by five agents (claim mapping, diff replication, gate mutation tests, import audit, an independent challenge that replayed the real `evaluateItem`), then a live qualification of the proposed fix (below).

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

## Live qualification (2026-11-10)

25 production `edit-animation-v2` dress calls (Studio's `itemRoute.draft`/`run`, dress only) in Agent mode on bench bodies C (3 drawn views) and B (5 drawn views): 250 subscription generations, $0 cash, none lost or resent. 79 views were labeled by eye before any metric ([live/results.md](live/results.md), [live/labels.json](live/labels.json), [live/ledger.jsonl](live/ledger.jsonl), driver in `scripts/live/`).

- 14 legitimate view-dependent designs (hair, quiver, capelet, backpack, front-crest tabard, hood-down cloak, fox tail): all 42 views correct.
- 3 natural defects: the red cape's north view recolored on 2 of 3 seeds (dusty rose, then maroon; [live/zoom-redcape.png](live/zoom-redcape.png)) and a robe drawn open in one view. All 3 items passed every gate and would auto-save.
- Current D1 false-flagged 3 legitimate items (quiver fletching 11 %, backpack straps 7 %, white fox-tail tip 39 %), which then lose auto-save.

| Candidate check | Result | Decision |
| --- | --- | --- |
| Leave-one-out palette distance | 0 false flags, 0 of 3 defects: one dress call shares one palette, and the recolor only reweights shared colors | Rejected |
| Extent outlier (0.10 body heights) | 7 legitimate views flagged (fox tails up to 0.26, backpack), 0 defects | Rejected |
| Area ratio | Does not separate; the cape "catch" is a cape back's natural size | Rejected |
| Pixel-weighted foreign-color share | Catches both cape recolors, but the margin over a legitimate front crest is 0.056 and flips with small parameter changes; 11 of 41 mild desaturations | Rejected (one prompt, overfit); recorded in known-issues |
| D1 counts only gray px whose color is not drawn (within 16 per channel) in at least two other views | Clears quiver and fox tail, backpack still flags; 0 new flags on 79 live and 41 bench views; single-view smudge recall unchanged (20/41); smudges in 2 of 3 and 2 of 5 views unchanged (18/42, 44/80). A union variant let paired smudges excuse each other (2/42, 0/80) | **Implemented** (`sharedDesignColors`, `smudgedViews`) |

The final review found that outline colors, present in every view, excused dark patches and dark-gray smudges (a front-only charcoal patch on an outlined tunic was no longer reported). Only lit grays (max channel ≥ 64) are now shared or excused: T = 48 and 64 keep every production catch above and clear the same two flags, 64 also keeps the 48-63 band where most outline px sit (18 % of bench item px), and T ≥ 80 brings the quiver flag back ([live/d1-lit-results.json](live/d1-lit-results.json)). Accepted cost: a smudge within 16 of a lit gray part drawn in two other views is excused (all 8 synthetic cases the old rule caught).

The challenge picked 16 over 24 per channel: 24 also clears the backpack but loses 4 of 20 caught single-view smudges. The paired-smudge rule came from the coordinator; the data agent confirmed it before implementation. Offline scripts: `scripts/live/foreign.ts`, `scripts/live/d1two.ts`; results in [live/d1-twoview-results.json](live/d1-twoview-results.json).

## Smaller findings

- **Upscaled or JPEG imports are accepted silently.** A 4× upscaled sprite in a PixelLab ZIP becomes a 256 px rig (higher item prices, mixed pixel sizes); blur, noise or JPEG adds 3,000-13,000 colors, which harms recolor and keying. A small integer-scale detector found scale and phase in every synthetic case with 0 false positives on 184 native cells. Recommendation: an import warning only, no automatic snap (no user reports; the rig never rescales art). Reconsider when single-image or concept-image uploads ship.
- **Exact-prompt bases may be clothed.** The exact prompt can omit the bare-body line without notice; layers only add pixels, so base clothing shows around items. Recommendation: a one-line hint in the exact-prompt editor. Untested on real art.

## Scripts

`scripts/` holds the experiment scripts as run. Paths are replaced with `<REPO>`, `<MAIN_CHECKOUT>` (untracked S1/S2 spike output under `spikes/api/out/`, also at commit 1f95029) and `<SCRATCH>` (output folder); set them before running. `gates/`, `challenge/` and `live/*.ts` run with `node --experimental-transform-types --import ./register.mjs <script>`; `imports/` runs with vitest using `vitest.scratch.config.mjs`; `diff/diffrep.ts` runs with `node`; `live/drive.mjs` drives the agent dev server with Playwright (paid unless `dry`). Inputs: `app/test/fixtures/bench/` (17 live cases, 627 cells) and the S1/S2 spike frames.
