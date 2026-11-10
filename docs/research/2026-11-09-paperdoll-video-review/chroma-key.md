# Chroma key color: why green stays the default (reference for future tests)

Date: 2026-11-09 to 2026-11-10. Status: measured, decision recorded as PLAN D27. Read this before testing or changing the
mannequin key (`app/src/lib/image/chroma.ts`).

## The question

Paper-doll practitioners the owner has talked to recolor the **mannequin or the human body itself** (not a background) to
**cyan or blue** before asking the model to draw clothing on it, then remove that color. One third-party workflow reviewed in
this spike does the same with a mid-blue body (`#40aae6` to `#25709b`, five flat tones, hue about 200; a purple body for
another character). An earlier reported workflow mapped identified skin to a five-shade cyan ramp
([chroma and occlusion spike](../tool-spikes-2026-11-06-chroma-and-occlusion.md)). A community member told the owner cyan keys
better than green and that green is too common in gear. PixelDoll uses green first. Was that a mistake?

## Answer

No. On the same bodies, items, prompts and seeds, cyan, azure and blue mannequins were **not better overall** than green, and
each added failures on the most common armor and weapon materials that no quality gate catches. Green's only collision is green
gear, which the key switch already handles. Green had one real defect (dark outlines drawn over the body were keyed out), which
was fixed in extraction on 2026-11-10 without changing the key (see [the green outline defect](#the-green-outline-defect)).

What the practitioners' preference does get right: **green gear is common** (rangers, goblins, leaves, poison), so a green key
must switch more often than a cyan one. PixelDoll handles that by measuring each item's colors and switching keys, so the
frequency of green gear costs a fallback, not quality.

## How PixelDoll keys (what was compared)

- The whole frozen body (every opaque pixel) is mapped to a **continuous luminance ramp** in the key hue (`toChroma`), so
  shading and drawn lines survive as darker key shades. Green ramp: (0,60,0) dark to (110,255,110) light.
- After dressing, a pixel is the item unless it scores as key (`keyScore` ratio at least 35, `KT`). A rim guard,
  `absorbOutline`, `despill` and small-component cleanup follow.
- Key order: green, magenta (green items), blue (green plus pink or red, D19), azure (green plus purple, D21). The prompt words
  pick the first key; on a collision the retry picks a key from the measured item colors (`keyFor`, 2026-11-07).
- Blue is the green ramp with G and B swapped (hue 240). Azure is the green ramp rotated +90 degrees (hue 210). For this test,
  **cyan was the green ramp rotated +60 degrees (hue 180)**, named "bright cyan" in the prompt and extracted by rotating back and
  running the production green code. This is the method that qualified azure before it shipped (`spikes/api/c25/hue.mts`).

## History of the green choice

| When | What | Evidence |
| --- | --- | --- |
| 2026-10-21, S2, D3 | Green chosen in the first chroma spike; never A/B-tested as the default. | `docs/architecture.md` 4.4 |
| 2026-10-25, D19 | Blue added for green plus pink or red: magenta keyed out the pink on every frame. | [campaign arm K](../generation-quality-campaign-2026-10-25.md) |
| 2026-10-25, D21 | Azure added for green plus purple: magenta kept 1.3 % of the purple, azure 100 %. | [round 2 arm Z](../generation-quality-round2-2026-10-25.md) |
| 2026-11-07 | Key retried from measured colors, not prompt words. | [measured key review](../2026-11-07-paperdoll-cycle/review-measured-key.md) |
| 2026-11-09 | This test: green against cyan, azure and blue as the default. | below |

## Test 1: offline census (free)

86 dressed keyframe sets from earlier campaigns, each compared with the rest base it was dressed on (82,915 item px, 9 bodies),
plus hand-built ramps for common materials. "Lost" means an item pixel scores as key and is removed with no warning.

| Key (hue) | Ordinary items lost | Color-test items lost | Materials it destroys |
| --- | ---: | ---: | --- |
| green (120) | at most 1.44 % (own outputs, upper bound) | 37.8 % | emerald, forest, lime |
| cyan (180) | 0.21 % (one dark teal-gray outline) | 25.3 % | turquoise, sky, ice, most emerald shades, dark teal outlines; flags denim and royal blue |
| 195 variant | 0 % | 5.7 % | denim, royal blue, sky, ice |
| azure (210) | 0 % | 1.8 % | denim, royal blue, sky, ice, navy, dark navy outlines |
| blue (240) | 0.10 % (one navy outline) | 1.7 % | navy, denim, royal blue, sky, blue-black, dark navy outlines |
| magenta (300) | 0 % | 11.3 % | purple |

- Every warm material scores 0 on green: skin, hair, leather, wood, gold, olive, khaki. Losses start near hue 80 (lime). The
  assumption that olive or yellow bleeds into green is false.
- Real "emerald" gear was drawn at hue 150-163, so cyan loses it as often as green (7 of 9 sets).
- Cyan's one measured advantage: a warm color half-blended with the key is lost in 19 of 57 cases on green and 5 of 57 on cyan.
  Cool colors reverse it (green 24/42, cyan 36/42). Real green outputs rarely contain such blends (0.10 % near-key).
- **The model draws in the key's hue.** On the real base 94 % of dark item px are neutral; on a mannequin, outlines and shadows
  tint toward the key (green toward olive 25 %, blue and azure toward blue 46-47 %). This is why each key has its own outline
  problem.
- Ramp brightness: cyan 0.16-0.83 luminance, green 0.14-0.77, blue 0.03-0.50 (its dark third is near black, the weakest shading
  cue). Nearest outline collisions: dark teal 18 from cyan and azure, dark navy 20 from azure and 26 from blue, dark green 26 from
  green.

Bias: the ordinary items were generated on green with "no bright green" wording and skew red, brown and steel; green-on-green
losses can only be bounded. Details: [key census](evidence/key-census.md).

## Test 2: live A/B (808 generations)

Production dress (`edit-animation-v2`) and pose (`animate-with-skeleton-v3`) builders, identical prompts except the key name,
identical seeds and bodies, through the owner's local API server.

- Body A (64 px; south, east, north views): 10 items, seed 7 on all four keys; seed 11 on green, cyan and azure (blue dropped
  after stage 1 by the pre-registered ranking).
- Body B (the Studio default slender elf, 80 px, 5 views): helm, plate, hair, hood on green, cyan and azure.
- Walk south, east, north for helm, cloak and hair, green against cyan.
- Items: steel great helm, leather boots, red hooded cloak, gold crown with white fur, blonde braids, tan jerkin with brass
  buttons, silver plate, khaki ranger hood (green never named), and two deliberate collisions: turquoise gem amulet, navy tunic.
- 94 calls, 92 charged, 808 generations, nothing resent.

**Decision rule, written before spending:** a key replaces green only if it has no more hard fails, a G2 mean within 0.005, no
higher summed G3, is at least 25 % better on one failure mode visibly, adds no defect on steel, silver, gold, leather, jerkin or
hair, and has no more walk hard fails. A tie keeps green.

| Measure | green | cyan | azure | blue |
| --- | --- | --- | --- | --- |
| Hard fails, ordinary items, both bodies and walks | 0 | 0 | 0 | 0 |
| G2 key kept, mean | 0.994-0.997 | 0.994-0.996 | 0.994-0.998 | 0.998 |
| G3 summed, body B | 0.020 | 0.046 | 0.042 | not run |
| Dark outline lost (braids, plate, jerkin) | braids 30 dress and 248 walk px, plate 27, jerkin 8 | 9 px at seed 11 | 6 px at seed 11 | plate 11 |
| Steel helm px leaning to the key | 0.009 | 0.65 | 0.77 | 0.70 |
| Silver plate px leaning to the key | 0.008 | 0.49 | 0.34 | 0.00 |
| Helm px rewritten by despill | 21 | 306 | 817 | 271 |
| Red cloak (visual) | clean | muddy, desaturated in dress and all 8 north walk frames | best | turned purple |
| Turquoise gem | kept | not drawn at all; no gate fired | kept | kept |
| Navy tunic | clean | survives, fully tinted | 211 of about 700 px kept; no hard fail | empty layer, hard fail |
| Leather, gold, jerkin, khaki hood | clean | clean | clean | clean |

Per item, per view and per walk direction: [live A/B results](evidence/live-key-ab.md).

**Verdict:** cyan, the strongest challenger, failed the rule: no hard-fail advantage, a slightly higher G3, a new defect on
steel and silver, and silent omissions. Azure loses navy silently and rewrites steel. Blue shares green's outline defect and
empties navy gear. An independent reviewer judged the sheets before reading any conclusion and agreed (about 80 % confidence).

## Why the practitioners' experience does not carry over

These points are inferred from the measurements above; the practitioners' own setups were not available to test.

1. **Steel is blue-gray on every key.** The independent reviewer measured blue minus red on gray helm px: about 24 on the green
   mannequin and 17-35 on the others. The model draws steel cool regardless of the mannequin, so every blue-family key sits next
   to the most common armor and weapon material. Green does not.
2. **Flat tones vs a continuous ramp.** Five flat tones merge 21-34 % of the body's local edges that the continuous ramp keeps.
   With few, bright tones the key sits far from every outline; with a continuous ramp the dark end of any key approaches dark
   outlines (green (0,60,0), blue near black). The flat-tone setups were never tested here, so a five-tone cyan body may behave
   differently from the ramp tested.
3. **Skin-only keys.** A skin-only cyan key leaves hair, clothes and outlines in their own colors, so fewer item colors can
   collide. PixelDoll keys the whole body because its bases are bare and a reliable per-frame skin region is not available.
4. **No measured fallback.** Without a key switch, a cyan default avoids the common green-gear collision. PixelDoll switches
   keys from measured colors, so it pays that collision once with a retry instead of losing steel quality on every item.
5. **Small, warm-skewed content.** Hand-made sprites in these communities are mostly warm (skin, leather, wood); cyan is the
   natural complement there. PixelDoll's census shows warm materials are already clean on green.

## Known metric traps (fix before the next key A/B)

- The A/B's "lost px" counted only dropped px more than 40 from the key ramp. Green's lost outline color (4,19,0) is 41 away, so
  it counted, while navy or teal outlines lost on azure or cyan sit within 40 of those ramps and did not. Count every dropped dark
  px adjacent to the item.
- No metric checked the hue of saturated item colors, so the cyan and blue cloak defects escaped every number. Add a hue-accuracy
  check against the same item on another key.
- "Drift" is computed in each key's rotated frame and cannot be compared across keys.
- Seed-to-seed design variance (pauldrons, braids in north views) was often larger than the key effect: use at least two seeds
  per body and compare per item.

## The green outline defect

Of 380 px lost in the A/B, 378 lie inside the base silhouette and 328 are darker than the key ramp's darkest shade, e.g.
(4,19,0). They score 72-94, so they never enter the item mask. `absorbOutline` keeps dark key px only off the body or with at
least 5 of 8 item neighbors; a one-pixel outline over the body has 2-4. The model almost never darkens the bare mannequin by
itself (6 such px in 356 cells, all at least 3 px from any item).

The offline prototype kept a key-scored px that touches the item, is more than 40 per channel from the ramp and is darker than
the key's darkest shade. It recovered 315 of 321 confirmed outline px (98.1 %) with no gate flips. A looser variant kept green
blends on an elf ear and was rejected. [Outline recovery](evidence/outline-recovery.md).

**Implemented 2026-11-10 (`absorbOutline` rule (c), `app/src/lib/image/chroma.ts`), after two adversarial review rounds:**

| Round | Objection | Evidence | Outcome |
| --- | --- | --- | --- |
| 1 | The premise "the mannequin never uses that shade" is false on magenta | The bench tunic added 574 px; 483 were (35,14,28), the same shade the model used for the mannequin's own head, ear and foot outline; the tunic grew spikes up the neck | Accepted: a shade the cell's bare mannequin uses 3+ px from the item stays key (per cell, exact RGB, every key). Rejected the alternative "green and blue only": per-cell evidence beats a key list |
| 1 | Inside the old two-pass loop, the 5-of-8 rule counted the new px and absorbed real ramp shades (8,74,5) | 349 px added instead of 323 on the A/B; neck px on the tunic | Accepted: rule (c) runs as its own two passes after the old rules |
| 1 | FAR 40 is a cliff, not a margin | (4,19,0) is 41 from the ramp; FAR 48 recovered 0, FAR 32 added hood cast shadows | Kept 40: no criterion did strictly better (an absolute green cut has the same cliff); a lighter tint only falls back to the old behavior. Pinned in a test |
| 1 | Tests missed magenta, the cascade and the cliff | | Added: magenta kept or dropped, mannequin-used shade stays key on all keys, cascade, cliff |
| 2 | Known gaps of the color exclusion | A mannequin outline seen only next to the item is still kept (about 4 neck px per frame on one magenta walk view); one far px of the item's outline shade blocks that view (1 hair view) | Accepted as limits, documented in code and `docs/known-issues.md`. A call-wide exclusion set would fix the tunic but lose the braids in all 8 dress views of one call |

Final numbers: the A/B recovers 318 of 380 lost px (braids, plate, jerkin), the magenta bench tunic adds 71 px (mostly sleeve
and hem outline, about 25 neck px), no G2 or G3 flips anywhere, the LPC skin-tone set is unchanged (0 of 5,460 tallies; it
cannot trigger the rule, so it says nothing about skin tone either way), and the only bench line that moves is the tunic's area
CV, 0.122 to 0.123.

## Open questions (not tested)

- A five-flat-tone cyan or blue mannequin against the same in green (the practitioners' exact setup).
- A skin-only key on a body with clothes.
- Whether azure should come before magenta as the fallback for green-only items.
- What colors real users ask for: there is no telemetry, and every sample here is skewed by its prompt set.

## How to rerun

- Live arm: `spikes/api/c25/arm_y.mts` (stages, items, keys), `eval_y.mts` (metrics and sheets), `y_env.mts` (resolves the agent
  key from `.env` in memory and redirects only that process to the local API when the key references `PIXELLAB_SECRET_DEV`;
  import it before `lib.mts`), `y_recover.mts` (GET-only recovery of jobs that outlived the client poll). Outputs:
  `spikes/api/out/chroma-2026-11-09/` (local, git-ignored).
- The local API timed out 13 long walk jobs (recovered without resending) and refused 2 with 429 (Tier 2 allows 11 concurrent
  jobs). Keep pose concurrency at or below 6.
- Offline: [scripts/census](scripts/census/) (needs the stored campaign outputs in `spikes/api/out/`) and
  [scripts/outline](scripts/outline/) (wraps production extraction; set `OUT_DIR` for sheets).
