# Review: measured chroma key (K1 note and Try again key)

November 7, 2026. Target: the staged diff (`chroma.ts` `NEAR_KEY`, `nearKeyShare`, `keyFor`; `run.ts` `measuredKeyCollision`,
`ItemResult.retryKey`; `GenCard`, `state.svelte.ts` `retryGen`, `itemRoute`, `apiPlans`, `model.ts` `plainReason`; `fitKey`).
Offline only: no PixelLab calls, no `app/` edits. `npm run check` passes; `measured-key`, `azure-key` and `studio-flow-state`
unit tests pass (129).

Scripts (run from the repo root with `node <file>`), all under `scripts/review/`:

- `measured-key-bench.ts`: every frozen benchmark keyframe through the production extractor (bench `runPipe`), emulated
  keyframe G3/G4, then the production `measuredKeyCollision` with a reconstructed prompt per case.
- `measured-key-synthetic.ts`: painted keyframes on body A with known truth (false notes, true collisions, drift, dilution,
  empty second attempt) and ramp distance of off-body key px on real keyframes.
- `measured-key-variants.ts`: candidate refinement of the near-key share (ignore dark px).
- `fitkey-equivalence.ts`: old versus new `fitKey` property check.
- `app/test-results-review/ncloak-lost.ts` (on-body key px that differ from the mannequin input, finding 3) and
  `app/test-results-review/plain-k1.ts` (GenCard and ItemPane reason text, finding 2): scratch, gitignored.
- Repro of finding 1: `app/test-results-review/key-retry/repro.test.ts` (a copy of `studio-flow-state.test.ts` with one added
  test; run `npx vitest run --config test-results-review/key-retry/vitest.config.ts -t REVIEW` from `app/`).

## Findings

### 1. Try again with a measured key never starts (regression, high)

`retryGen` now builds `input = { ...g.input, key }`, but `startItemDraft` still refuses a replacement whose input differs from
the reviewed draft's input: `stableStringify(replaced.input) !== stableStringify(input)` (`state.svelte.ts:804`). Whenever
`res.retryKey` is set, the click shows "This character or item changed. Reopen it and review the attempt before generating."
and nothing runs. Repro: the review test calls `retryGen(original, 10, 'magenta')`; run is called once, not twice, and the
toast is that message. So the feature never reaches its goal, and every collided draft loses its working Try again (the user
can only Discard and re-create, which uses `pickKey` again).

Smallest fix: carry the key in the consent and compare against it, for example in `startItemDraft`:
`stableStringify({ ...replaced.input, ...(input.key ? { key: input.key } : {}) }) !== stableStringify(input)` (or
`consent.key`). Add the repro as a unit test next to "an explicitly priced retry creates exactly one fresh attempt".

### 2. GenCard shows raw K1 text, or hides K1 (regression, medium)

GenCard maps each call's joined g1 string through `plainReason` without splitting (`GenCard.svelte:29`, `failsOf`). A dress
call packs every standing view (south, east, north in one call), and both recorded collisions flag all three views. The joined
string then matches the K1 regex greedily and prints raw text:
"... Try again uses a bright blue); K1 keyframe rest/east/0: 31 % of the item's colors lean toward ... background instead".
Without the retry suffix the regex fails and the whole raw string is shown. When G3 precedes K1 in the same call (n-cloak128
north, a-jester-magenta), only "Some body pixels were changed by the model" is shown and the color hint is lost. `ItemPane` and
`acceptItem` already split on `;` and are fine.

Smallest fix: `failsOf(res, i).flatMap((s) => s.split(/;\s*/)).map(plainReason)` in GenCard (also fixes the same, older
hiding of a second gate per call).

### 3. False K1 notes on clean items (tradeoff, medium)

Bench (17 non-reference cases, 54 dressed views): one false note, n-cloak128 north at 53 %. Its near color is #24310c
(36, 49, 12): a key excess of 13 on a brightest channel of 49 scores 26 because the score is a ratio. No cloak px is lost: the
169 on-body key px that differ from the mannequin input are all green ramp shades (51,194,56; 32,161,37), that is a redrawn
mannequin. The note blocks auto-save and tells the user Try again uses bright blue. Recorded collisions read 25 to 31 %
(a-jester-magenta, a-stripes-magenta); b-jester reads 2 to 6 % and is caught only by G3. No single threshold separates them:
at 0.6 nothing is flagged, at 0.2 to 0.5 the cloak is flagged. So 0.2 is not "too low" relative to the positives (the margin is
thin: 25 % is the lowest), but the share needs a second condition.

Synthetic palettes with nothing lost also trip at 0.2: one dark green-tinted shadow on black leather (25 %), an olive-black
shade on a brown cloak (25 %), bronze with verdigris (25 %), olive drab (100 %), dusty rose on a magenta key (25 %). Brown
leather with olive edge spill, khaki, yellow with olive shadow, gold and steel do not trip.

Candidate (measured, not adopted): count a near-key px only when its brightest channel is at least 64. Bench: n-cloak128 53 %
to 0 %, collisions 31/31 % to 29/27 %, a-sword96 6 % to 1 %, nothing else changes. Synthetic: removes the dark-shade false
notes, keeps the olive drab, verdigris and dusty rose notes (those are real near-key colors), keeps goblin armor and drops the
unnamed dark forest hood from 100 % to 50 %. Only three positive views exist, so confirm on more collisions before adopting.

### 4. G3 alone switches the Try again key (tradeoff, medium)

`collided` is true on any keyframe G3, and the off-body key px join the measured colors. G3 also fires when the mannequin
drifts, with no color collision. Then the current key always fails `keyFor` (its own ramp px count) and Try again silently
moves to another key, with no K1 note telling the user why. Synthetic: a brown vest and a steel helmet with a 1 px drift switch
green to magenta (before: green again). Real: n-cloak128 north's G3 comes from 54 off-body key px, all within 16 of the green
ramp, and the retry goes to blue. Collision G3s look different: a-jester-magenta has 43 to 48 of 45 to 49 off-body key px far
from the ramp, b-jester 157 of 215.

Smallest fix: treat off-body key px as collision evidence and as measured colors only when they are farther than 16
(Chebyshev) from the key's `toChroma` ramp. On the bench this keeps both jester switches and drops the cloak switch.

### 5. An empty second attempt sends Try again back to the collided key (minor regression)

With no measured colors (every view empty, nothing off the body), `keyFor` returns the first allowed key. A draft already on a
measured key then gets `retryKey` = the prompt's key, which is the key that collided first (synthetic: magenta, goblin armor,
empty view: retry green). Without the change it would also be green, but the new design otherwise keeps `input.key`.
Smallest fix: `if (!measured.length) return undefined;` in `measuredKeyCollision`.

### 6. Saved items keep a stale "Try again uses" hint (tradeoff, low)

`acceptItem` stores the K1 note with its "(Try again uses bright blue)" suffix in `designWarnings`; ItemPane shows "Try again
uses a bright blue background instead" next to its own Try again, which opens New item with the prompt only and so uses
`pickKey(prompt)`. Likewise an item made on a measured key reverts to the prompt key from ItemPane. Acceptable as a limit, but
the copy is wrong. Smallest fix: keep the suffix out of the g1 note and show the hint in GenCard from `res.retryKey`; carrying
`item.key` through `openNewItem` is the larger option.

### 7. Is `retryKey` ever worse than `pickKey(prompt)`? (mostly fine)

- A retry key is only proposed after a collision signal on the current key, so in true collisions the prompt key is already
  known bad. The worse cases are the false signals in findings 3 and 4 (a clean item moved to a less used key) and finding 5.
- Lost colors are missing from the measurement. On the green key the lost colors are greens, which score 0 on magenta, blue and
  azure, so they cannot make the new key collide. On magenta, a lost violet also scores as blue, so a blue retry can repeat the
  loss; `pickKey` would repeat it on magenta too, so not worse.
- Dilution: off-body key px enlarge the denominator for the other keys. It needs off-body px about 7 times the item px to hide a
  5 to 10 % trim; the synthetic hood with a pink trim and a 1 to 2 px drift still chose blue (correct). Theoretical only.
- Held padded canvases: base and output are both padded, so off-body is measured on the same canvas. No held case flags.
- Order: prompt-allowed keys first, then the rest; a disallowed key is used only as the least affected key when every allowed
  key exceeds 1 %. Fine.

### 8. Parsing of g1 and the K1 text (fine)

`structuralReason` matches only `G1`, so K1 never blocks Keep it and is never read as a failed call by `runItem`.
`designWarnings` splits on `/;\s*/`; the K1 note contains no semicolon. Export validation accepts it (under 2000 chars).
`isClean` is false with any g1 entry, so K1 blocks auto-save, as intended. `poseEarly` treats K1 like D1: poses start after
the dress chunks instead of early (slower, no extra spend; posing still runs and is paid, as before). M3 (dev page) shows raw
text, as for every gate. `plainReason` for a single K1 entry reads well.

### 9. Persistence and recovery (fine, apart from finding 1)

`input.key` is saved with the Gen in `studio-drafts`; drafts without it fall back to `pickKey`; `spec.key` was always saved,
so a resumed run keeps its key. `retryKey` is not stored but recomputed by `evalGen` after a reload. The consent "reviewed"
hash still compares `g.input` on both sides (consistent); only the separate input equality in finding 1 breaks. The plan price
does not depend on the key, so the reviewed price matches.

### 10. `fitKey` equivalence (fine)

200,000 random colorways (0 to 12 colors, a third near key ramps), random preferred key: 0 differences between the HEAD and
staged bodies (62,065 throw in both, 66,378 pick a later candidate in both). Empty colorways pick the first candidate in both.

### 11. Coverage gap (not a regression)

Only dress calls (skeleton method) produce keyframes, so anchor-method items (rigs without joints) get no K1 note and no
measured retry key.

## Bench numbers (max near-key share per view, K1 at 20 %)

| Case | Key | Views | K1 views | Retry key |
|---|---|---|---|---|
| a-jester-magenta (recorded collision) | magenta | 25 / 31 / 27 % | 3 | blue (team's choice) |
| a-stripes-magenta (recorded collision) | magenta | 29 / 31 / 26 % | 3 | azure (team's choice) |
| b-jester (recorded collision) | magenta | 2 to 6 % | 0 | blue, via G3 |
| n-cloak128 (clean) | green | 1 / 0 / 53 % | 1 | blue (false) |
| a-sword96, a-plume-azure, a-stripes-azure | | 1 to 7 % | 0 | none |
| 13 other cases | | 0 % | 0 | none |
