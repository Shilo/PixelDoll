# Audit: prompt-text and item-color assumptions

November 7, 2026, paperdoll improvement cycle. Offline only: no PixelLab calls, no `app/` edits. Question from the owner: do any steps assume a generation is one specific thing, or depend on fragile prompt wording? Users type anything (other languages, misspellings, rare color names, hex codes, themes like "goblin armor" with no color word), and items may legitimately contain the key color.

Labels: **source** (read in code), **offline** (reproduced with a script on production functions), **inference**, **untested**.

Scripts (run from the repo root with `node <path>`):

| Script | Measures |
| --- | --- |
| [scripts/audit/color-words.ts](scripts/audit/color-words.ts) | 169 English color words and 52 phrases through `pickKey`; which collide with the picked key; `GRAYISH`, `heldSlotFor`, `expectsWaistBand` misses |
| [scripts/audit/key-collision.ts](scripts/audit/key-collision.ts) | Synthetic key-colored items on the real body A keyframe through production `extractCell` and gates; three measured collision detectors calibrated on the 20 frozen benchmark keyframe sets, including the recorded real collisions |
| [scripts/audit/dark-base.ts](scripts/audit/dark-base.ts) | Share of body px the rim guard treats as "dark base" as skin darkens |

## 1. Every place that reads prompt text

| Where | What it decides | Kind |
| --- | --- | --- |
| `chroma.ts:36-43` `HUES`, `:45` `keyAllowed`, `:51` `pickKey` | The chroma key for the whole item | Color-word regex |
| `itemRoute.ts:43`, `apiPlans.ts:66`, `design.ts:89` (default arg), `ui/M3.svelte:55`, `ui/motion-lab/equipment.ts:28` | Callers of `pickKey(prompt)` | Same regex |
| `chroma.ts:12` `switchTo` | Key after a collision | Regex, **dead in production** (test-only caller) |
| `chroma.ts:294-301` `chromaPrompt` | "drawn in its own natural colors (no bright green on the item)" | Prompt wording sent to PixelLab |
| `items.ts:123-133` `gridPrompt`, `:152-154` `oneHeld`, `heldPhrase` | "empty hands, no weapon, no effects"; "exactly one weapon ... no shield"; "pointing down and slightly outward" | Prompt wording, slot-based |
| `items.ts:1105` `GRAYISH`, `:1108-1112` `designGraySmudges` (D1) | Whether gray px in a colorful keyframe fail the design | Material-word regex |
| `design-consistency.ts:15-20` `expectsWaistBand` | Whether G13/D2 waist-band checks run and whether early posing waits (`run.ts:301`) | Word regex |
| `studio/model.ts:31-32` `heldSlotFor` | Default hand for a held item | Word regex (user can override) |
| `items.ts:775` `isAction` | Locomotion vs action gates (move ID, not prompt) | Name regex |

No other `.test(` over prompt or description text exists in `app/src` (searched every `.test(` and `.match(`; the rest validate IDs, hex codes, paths and error text). Color code that never reads text: `toChroma`, `keyScore`, `despill`, `absorbOutline`, `fillHoles`, `autoRamps`/`deriveRamps`/`hueName` (`palette.ts`), `standingDyeMatcher` and its boundary veto, `itemPaletteMatcher` (`item-palette.ts`). `fitKey` (`equipment/generate.ts:70-75`) already picks a key from **measured** design colors, which is the pattern proposed below.

## 2. Confirmed problems, ranked

### P1. The key is chosen from words, so a key-colored item the words do not name is deleted silently or fails with the wrong reason (high)

**Assumption** (`chroma.ts:36-51`): an item contains a key's hue only if the prompt contains one of the listed English substrings.

**Breaks (offline, `color-words.ts`):**

- Of 169 common English color words, 25 have at least one shade (shadow, mid, base, highlight) scoring as the green key (keyScore >= KT 35). `HUES.green` misses 16 of them, 15 with the base color itself: kelly, hunter, fern, basil, spring, lawn, sea, kiwi, pea, leaf, grass, clover, neon, toxic, frog, avocado.
- Other keys have the same gap when another word forces them: magenta misses raspberry, aubergine, heliotrope, byzantium; blue misses denim, ultramarine, cornflower, midnight; azure misses pine, cornflower, midnight.
- Every non-English green tested picks green: verde, verte, grün, groen, zielony, зелёный, 緑, 绿色, 초록, yeşil, hijau. So do misspellings (gren, grean, emrald, chartruse, forrest), hex (`#00ff00`, `#2e8b57`), `rgb(0,200,0)`, "the color of grass", "rainbow", "iridescent", "camo", and themes the model colors freely: goblin armor, elven cloak, poison dagger, druid robe, orc helmet, Link's tunic, St. Patrick's day hat.
- "toxic slime gauntlets" picks magenta only because "s**lime**" matches; "sublime silk robe", "limestone shield", "mint condition coin" and "forest ranger hood" also leave green by accident. False positives are harmless alone but show the regex is matching letters, not meaning.
- When all four keys are named ("jester outfit in green, purple and blue"), `pickKey` falls back to magenta (`:51`) and the purple is keyed out.

**Consequence (offline, `key-collision.ts`, body A south rest, production `extractCell` and keyframe gates `run.ts:452-456`):**

| Item (no color word that bans green) | Item px | Lost | Gates |
| --- | ---: | ---: | --- |
| Goblin armor, yellow-green shades | 308 | 77 (every shadow shade) | **pass** |
| Rainbow scarf (green stripe) | 308 | 40 | **pass** |
| Green tunic in ramp-like greens (R = B) | 308 | 308 | G4 "item missing" |
| Elven cloak, forest greens | 732 | 732 | G3 "key outside 0.313", G4 |
| Poison dagger, neon blade | 63 | 63 | G3 "key outside 0.090", G4 |
| "capa verde" cap | 112 | 112 | G3 "key outside 0.122", G4 |
| Controls: red cap, brown vest, steel sword, camo | | 0 | pass |

Partial collisions pass every gate and ship with holes (shadows of a green garment become bare body). Total collisions fail, but G3 reads as "the mannequin moved" and G4 as "item missing", not "the item uses the key color". **Retry cannot recover:** "Try again" opens a new item with the same prompt (`ItemPane.svelte:130-131`) and `itemRoute.ts:43` recomputes `pickKey(prompt)`, so it pays for the same key again. Studio has no key override (only the dev page M3). Keyframe failures that are not G1 also do not stop posing: `poseEarly` only skips the early start (`run.ts:305`), then `run.ts:333` runs every remaining pose call, so the collided design is posed and paid in full (**source**).

**Can a measured check on the dressed keyframe replace the regex? Partly, and it can back it up (offline).** Three signals were measured on synthetic items and on the 20 frozen benchmark cases (real PixelLab keyframes, including the recorded collisions a-jester-magenta, b-jester: pink keyed out on magenta, and a-stripes-magenta: purple stripes keyed out):

| Signal | Synthetic collisions | Real clean keyframes (max) | Real recorded collisions | Verdict |
| --- | --- | --- | --- | --- |
| Existing G3/G4 on the keyframe | catch all total collisions | (G3 is a ratio; clean `off` counts up to 56 px) | not caught | keep, but say why |
| Largest component of body-kept px that score as key yet differ from the exact key input px (`toChroma(base)`) by > 32 | tunic 217, cloak 442, cap 20; goblin 1, rainbow 5 | 29 at 64 px, 82 at 128 px | 35, 5, 3 | **rejected**: misses real and partial collisions |
| **Near-key palette share**: kept item px with 20 <= keyScore < KT, as % of item px | goblin **100**, camo 25, others 0 | **<= 7** on every clean case except n-cloak128 53 | a-jester-magenta **31**, a-stripes-magenta **31**, b-jester 6 | **useful**: flags both 64 px recorded collisions and the silent partial one |

n-cloak128 (53 %) is the green cape whose shadow was drawn in a dark key-leaning olive (round 2 arm N chose to recolor it to maroon): a real ambiguity, so this signal should warn and explain, not block. Picking the **alternative key from measured item colors** (kept item px plus off-body key px; first other key on which <= 1 % score as key, i.e. `fitKey` over measured colors) gives blue for a-jester-magenta and b-jester, which is exactly the fix the team made by hand (b-jester-blue), and magenta for every synthetic green case. It finds no fit for a-stripes-magenta (green and purple) and the rainbow scarf; there the key with the fewest scoring px must be chosen instead (**untested**).

**Smallest general fix:**

1. Keep `pickKey` as a first guess only (it is free and right for named colors).
2. After the dress keyframe, add one measured keyframe check: total collision (G4 missing, or G3 with key-scoring px off the body) or near-key share >= about 20 % in any view raises "the item appears to use the <key> color" with the measured alternative key. It reuses `fitKey`'s rule (`generate.ts:70-75`) on measured colors instead of design colors; extract that rule once (DRY).
3. Make this check stop the planned pose calls (like G1) so a collided design is not posed and paid, and let Try again carry the measured key into the new spec instead of recomputing `pickKey(prompt)`. Never auto-resend: the user approves the new dress price.
4. Delete `switchTo` or route the measured key through it; today it is dead code with a misleading comment (`chroma.ts:11`).

Calibrate the threshold on more real items before it blocks (only 20 cases, two clean-but-ambiguous). Rainbow-type small stripes in a ramp-like key shade remain undetectable per keyframe; only a second key (two-backing) would separate them (paid, **untested**).

### P2. The dress prompt can contradict the user (medium-high, inference)

`chromaPrompt` (`chroma.ts:299`) always says "drawn in its own natural colors (no bright green on the item)". When the regex misses a green request ("capa verde", "kelly hood", "#00ff00 cape", "a hood the color of grass"), PixelLab is told not to use the color the user asked for. Either it obeys (wrong color, silent, no check compares against intent) or it disobeys (P1 deletion). With P1's measured check, the disobey case becomes recoverable; the obey case stays invisible. The clause itself is probably useful for free-color prompts (goblin armor), but no data shows that (**untested**). Do not change the wording without a paired paid test; the measured check is the safer lever.

Related wording assumptions (low): `oneHeld` (`items.ts:153`) tells every main-hand item "exactly one weapon ... no shield", wrong for a lantern, tome or torch, and wrong for shields that `heldSlotFor` misses (below). `gridPrompt` (`:126`) says "no effects" for every non-held item, which conflicts with "glowing", "flaming" or "aura" prompts. `heldPhrase` "pointing down and slightly outward" assumes a long rigid item.

### P3. D1 gray-smudge check false-fails colorful designs with unnamed neutral parts (medium)

`GRAYISH` (`items.ts:1105`) exempts only prompts naming gray, silver, steel, iron, metal, chain, white, black, fur, stone or ash. It misses 46 of 56 neutral words tested: armor, plate, knight, mail, skull, bone, pearl, ivory, cream, chrome, titanium, mithril, obsidian, onyx, charcoal, slate, pewter, platinum, snow, lace, granite, marble, and every non-English word (gris, blanco, negro, noir, blanc, schwarz, weiß, silber, plata, acero). Offline: "red pirate hat with a skull emblem" (9 of 112 px off-white) fails D1 at 0.08; adding the word "white" passes the identical pixels. Consequence: a false keyframe failure shown to the user (poses still run, see P1), inviting a paid retry.

**Smallest fix:** decide from pixels across views, not words: an intended neutral part (clasp, skull, trim) appears in every dressed view, while a smudge is view-specific. Fail only a view whose gray share exceeds the item's minimum gray share over its other dressed views by more than `DESIGN.gray`; with a single view, warn instead of fail (**untested**; the T3 smudge was north-only, which this keeps).

### P4. Rim guard's absolute "dark base" rule removes more of thin items on darker skin (medium, fairness)

`dropKeyOutline` treats a base px as an outline candidate when its mean RGB < 60 (`chroma.ts:96`), an absolute threshold, while `toChroma` normalizes luminance per cell. Offline (`dark-base.ts`): on body A the "dark" share of body px grows 39.0 % to 42.0 % to 50.0 % to 71.7 % as skin is scaled x1, x0.8, x0.6, x0.42; a rule relative to the cell's own luminance range stays constant (35.7 % at 20 % of range). Earlier evidence ([extraction.md](extraction.md) 2.1): a 1 px belt keeps 22/22 px on the light body and 13/22 on the x0.42 body. This is not prompt parsing but it is an assumption about the body's colors. **Fix:** make "dark" relative to the cell's luminance range (as `toChroma` does), plus the already proposed CF1b topology restore; calibrate the fraction on the four benchmark bodies (**untested**). **Outcome (2026-11-07):** a relative threshold added a mannequin speck on a real frame; the adopted rule tests local contrast for light generated px only. See [fairness.md](fairness.md).

### P5. Small regex defaults (low)

- `heldSlotFor` (`model.ts:31`): targe, pavise, aegis, escudo, bouclier, Holzschild, arco, arc, Langbogen all default to the main hand, whose wording then says "no shield". The user can still pick the slot; the default should come from the slot picker, or the main-hand wording should not forbid what the prompt names.
- `expectsWaistBand` (`design-consistency.ts:15-20`): misses girdle, cummerbund, obi (alone), cinturón, ceinture, Gürtel; "a tunic with no sleeves and a leather belt" and "trousers without pockets, with a belt" read as negated (the 35-character window). Consequence: a skipped review warning only.
- `isAction` (`items.ts:775`): substring match on move IDs ("running-slash" counts as locomotion and gets G5/G9; "jog", "sprint", "march" count as actions and skip them). Not prompt text, same fragility.

## 3. Checked, not problems

- **KT threshold and `keyScore`**: a fixed ratio is correct for the key itself; collisions are an input problem (P1), not a threshold problem. Lowering KT would delete more real item colors.
- **Despill "own color" rule** (`chroma.ts:185-189`): keeps a px with 0 < keyScore < KT and no clean sibling. It assumes nothing about words and is what keeps the goblin midtones; real-corpus impact 41 px ([extraction.md](extraction.md) CF2b). Keep.
- **`absorbOutline`, `fillHoles`**: pixel topology only; the ambiguity with key-shade folds is inherent and already documented.
- **`toChroma`, `KEY_NAME`, KEYS order**: no item-color assumption beyond P1.
- **Palette and dye code**: `autoRamps`, `deriveRamps`, `hueName`, `standingDyeMatcher` (12 per channel, owned colors only, clip-wide boundary veto) and `itemPaletteMatcher` (cool neutrals only, `item-palette.ts:57-61`) read only pixels. The neutral matcher deliberately excludes warm and green-tinted grays; that is a stated scope, not a hidden assumption.
- **`fitKey`** (`generate.ts:70`): already measured; the model for P1.

## 4. What must NOT change

- The key ramps, `toChroma`, KT 35 and the rim guard defaults without a benchmark replay (`bench-replay.ts` verdicts unchanged).
- No automatic paid retry or automatic key switch that spends credits; the user approves every re-dress.
- `pickKey` as the free first guess for named colors (it is correct for those; the measured check backs it up).
- The despill own-color rule and the steel-stays-gray rule.
- The `chromaPrompt` wording until a paired paid test shows the "no <key> on the item" clause is neutral or harmful.
