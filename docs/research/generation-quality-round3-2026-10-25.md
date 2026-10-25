# Generation quality, round 3 (2026-10-25)

Status: **done.** 247 generations spent (V 189, S 58), well inside the raised limit. Budget: the owner raised the campaign limit by 1,000 generations (round 2 spent 605.5 of its 1,000);
round-3 ledger `spikes/api/out/c25c/`. Same harness and rules as [round 2](generation-quality-round2-2026-10-25.md):
production request builders, shared seeds, no automatic re-rolls, decisions only on consistent effects, the
[benchmark](../testing/bench.md) for every pipeline change.

Goal: the three problems round 2 left open.

## Arms (rules written before the results)

| # | Question | Arms | Gens | Decision rule |
|---|---|---|---|---|
| V | Bows change size and swing between walk frames (round 2 arm B: G4/G5 north, G9 east/north) | The held dress wording "pointing down and slightly outward" was written for swords: PixelLab draws the bow diagonally across the legs, where the body hides parts of it. Control = production off-hand wording; **vert** = "held upright in the character's left hand at its side, the bow vertical with one end above the shoulder and the other near the knee, the string toward the body". Body A, 96 px canvas, dress at seeds 7, 11, 23, walk S/E/N on every seed (control seed 7 reused from round 2: same requests) | ≈ 75 | vert is adopted only if failing walk clips drop by ≥ 3 of 9, the asked hand holds in all 3 views on ≥ 2/3 seeds, and the sheets look no worse |
| S | Azure sits near blue-gray steel shading (azure scores 35–44 for (60–100, 75–130, 100–160)) | "a steel helmet with a green and purple plume" (head), "a green and purple tabard over steel plate armor" (torso); both pick azure. Dress seeds 7, 11, walk S/E/N seed 7, body A | ≈ 58 | Azure stays for green + purple + steel if every dress set and walk passes G3 and the sheets show no holes in the steel |
| O | Items cannot hide body pixels (ears beside a hood or great helm) | Offline design and validation first (see below); paid tests only if the offline check cannot decide | 0 | Ears hidden in every frame of the stored hood and helm cases, no body part hidden in any other benchmark case, no new benchmark miss |

## Findings so far

- **Not every erased body pixel is occlusion.** Over the benchmark corpus, erased base pixels (opaque in the base, transparent
  in the output, not item) that touch the item form components of median 2 px, p90 7, max 68. The 68 px one
  (n-cloak128 walk/east/3) is the far leg and the near hand: the posed mannequin's legs sit elsewhere than in the base walk
  frame (pose drift). The great helm on body B erases the same ear components (12 + 10 px) in all 8 back-view walk frames and
  in its dressed keyframe (22 px). Rest views (the dressed keyframes, not posed) showed no drift erasures in the cases
  checked. So a rule "hide whatever the model erased next to the item" would cut real legs; the keyframe is the reliable
  source of what the item hides.
- **The dark speck on the head top** in the bow back-view walk is in body A's own frames, not in the item layer.

## Results

| # | Result | Decision |
|---|---|---|
| V | First 9 clips: off hand 6 failing, upright 4 (2 fewer; the rule needed 3). Extended once, declared before running, with seeds 31, 47, 59 and the same proportional bar (≥ 6 fewer of 18): off hand 11/18, upright 8/18, 3 fewer. Upright bows look clearly better in the dressed views and keep the asked hand, but most failures of both wordings are side views: a left-hand bow is behind the body there, so its size and angle swing as the arm moves. Some of those clips are real defects (upright seed 59: the bow flips from vertical to horizontal), so excusing far-side views from G4/G5/G9 would hide real failures. | **Not adopted**; the gates stay. Long bows remain a known limit with the existing repair path |
| S | Raw outputs draw the steel gray, but the extracted plume helmet was **purple**: up to 84 of 147 near-gray px per view. Cause: despill snapped every tinted px to the clean color nearest in *luminance*, and the blue-gray steel's nearest was the plume's purple. The tabard's plates stayed silver (its clean colors include grays); its seed 7 walk fails G2 on 2 frames, a pose issue. | **Fixed** in production: despill removes the key excess first, then snaps only within 40 (Chebyshev RGB), and a near-gray px only to near-gray colors. Steel stays gray in every view; benchmark verdicts unchanged (a-helmet fails 3 → 1). Azure stays for green + purple + steel |
| O | The brainstorm (an independent planning subagent) compared per-frame masks, the keyframe translated per frame, engine masks, body regions with hides flags, export-time "atoms", re-prompting and a cut layer. Recommended hybrid: the keyframe decides where, each frame's exact erasure decides which, stored as `Item.baseCut` (indices, no images), baked as "<base>~<item>" for exports (every runtime already swaps to such variants). Offline on the corpus: cuts appear only in the three ear cases (elf cloak 11 px/frame, Studio great helm 22, chibi great helm), 0 px on the 128 px cape whose legs drift and on held weapons; all three now pass G2. The elf cloak's old "fail:G2" expectation was the ears; its fabric stays mottled, which G2 never measured. | **Adopted** (D22). Limit: two cutting items from different slots worn together: the Studio hides both, engines one (export warns) |

## Review (independent subagent, before commit)

Accepted and fixed: (1) replacing a body move kept the old move's `baseCut` (the item's cells were dropped, its hidden ear px
were not), so the new frames lost px with nothing over them and export refused a changed frame count; `dropCut` now serves
both the move replacement and `mergeClip`. (2) The first despill rewrite left a cape fold drawn in the key's darkest shade as an
off-palette black (0 → 1,355 px on a-cape, 846 on b-cloak): with no clean color within 40 the luminance rule decides again,
except for lightly tinted px de-spilled to near-gray, so steel stays gray (cape and cloak off-palette px back to 0; a-helmet
2,088 → 866). (3) A type error in the new test (`npm run check` exit code is now checked, not its output filtered). (4) Copied
designs and the fitted preview drop `baseCut` (their cells are remapped). (5) In-place edit cells no longer cut on their own
(no drift evidence for them). (6) The two-slot export warning ignores stale items.

Kept, documented: an item hidden by another item's `hides` still cuts, like every runtime (they swap by what is equipped).

Also found and fixed while reviewing the bow frames (the owner reported holes in the bow): **the grip hole**. PixelLab's stand-in
hand covers the middle of the bow and is removed with the key; the body's own hand comes from a separate drawing and sits
1–3 px elsewhere, so a hole shows. Aligning the item to the hand made it worse (1,022 → 1,208–1,934 hole px over 144 frames:
the window is dominated by the torso). A 2 px morphological closing that fills only px the stand-in covered where the body has
none, with the nearest item color, leaves 323 (radius 3: 290, more risk of blobs). Adopted as `closeGrip` for held items.
