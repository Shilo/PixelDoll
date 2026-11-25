# Auto-batch detector: can the app know which items are safe to batch before paying?

2026-11-24. Offline research for [the brief](../BRIEF.md). No paid calls, no credentials, no app code changed.
Measurements come from `app/public/fixtures/s2` accepted layers. Scripts and outputs are in the parent folder:
[`pair_truth.py`](../pair_truth.py), [`pair_truth.json`](../pair_truth.json), [`evaluate_rules.py`](../evaluate_rules.py),
[`evaluate_rules_output.txt`](../evaluate_rules_output.txt), [`rules_result.json`](../rules_result.json),
[`report_tables.py`](../report_tables.py).

## Answer

**Yes for material overlap, no for guaranteed zero contact.** Slots plus the standing silhouette with a 2 px margin
(rule C) predicted 6 of the 7 material-safe item pairs with **0 false safes at a 4 px bar** on this fixture. At the
stricter any-pixel bar it has **1 false safe of 6 (17%)**: vest plus sword touch for at most 3 px in 2 of 30 cells
(3.3% of the lower item), which is a boundary contact during motion, not a hidden layer.

The slot check alone is not enough. Rule A calls 14 of 15 pairs safe and hides 7 material overlaps, up to 163 px and
100% of the lower item. Requiring disjoint standing silhouettes (rule B) still hides 2 material overlaps, up to 22 px.
The unsafe head and torso pairs sit 0 to 1 px apart while standing; the safe ones start at 3 px, so a clearance
margin is required.

Recommendation: **rule C** (different slots, no standing overlap, at least 2 px standing mask distance in every
direction) as the auto-batch gate, with the brief's preview and per-group notice kept. Treat its 1 to 3 px residual
contacts as visible but non-material, and never use union-find for grouping: safety is not transitive, and on this
fixture union-find merges all 6 items into one group under every rule, including pairs that overlap by 135 px.

## Data and method

- 64 px cells, 3 stored directions (south, east, north), walk 8 frames, cross-punch 6 frames. Cross-punch art exists
  only for south. The wizard hat has no cross-punch sheet and its walk north row is fully transparent, so hat pairs
  are measured on south and east only.
- 6 items plus the body. Masks are alpha > 0 in each accepted cell. Draw order is the manifest z (cape and sword also
  have `bgZ`, not used here because only the fg layer is stored).
- **Ground truth**: for every pair, direction and frame, count the pixels both accepted masks claim. `strict` unsafe
  means at least 1 shared pixel in any cell; `material` unsafe means at least 4 shared pixels in any cell. The 4 px
  bar is a reporting choice, not an app threshold: it separates a 1 to 3 px boundary contact, which is at or near the
  2 px component floor the app keeps (`chromaLayer` drops components under 2 px), from a region that could carry a
  usable layer.
- **No standing cell exists in the fixture, and `fixture.json` has no keypoints or skeleton.** Walk frame 0 of each
  direction is the stated standing proxy. The union of all frames per direction is the oracle upper bound, used only
  to show what the standing proxy misses.

| item         | slot        |   z | standing y span (S/E/N, walk frame 0) | directions with art       |
| ------------ | ----------- | --: | ------------------------------------- | ------------------------- |
| vest_leather | torso_inner |  40 | 30-45 / 31-45 / 29-43                 | walk 3, cross-punch south |
| cape_red     | back        |  90 | 29-61 / 31-58 / 29-58                 | walk 3, cross-punch south |
| hair_brown   | hair        | 110 | 15-28 / 18-32 / 15-27                 | walk 3, cross-punch south |
| helmet_steel | head        | 130 | 14-28 / 17-30 / 15-27                 | walk 3, cross-punch south |
| hat_wizard   | head        | 130 | 6-24 / 10-29 / empty                  | walk south, east only     |
| sword_steel  | main_hand   | 150 | 46-62 / 46-62 / 45-61                 | walk 3, cross-punch south |

### Slot bands without keypoints

`bandOf` in [`items.ts:1241`](../../../../app/src/lib/items/items.ts) needs a skeleton. The fixture has none, so the
substitute derives three bands from the body mask width profile: neck is the narrowest body row in the upper-middle
band, hip the narrowest in the lower-middle band, as fractions of the body bounding box. Measured rows:

| direction | body top | neck | hip | bottom |
| --------- | -------: | ---: | --: | -----: |
| south     |       19 |   30 |  52 |     63 |
| east      |       20 |   31 |  53 |     63 |
| north     |       18 |   29 |  52 |     63 |

Slot to band: hair, head, face_acc and neck to head; torso_inner, torso_outer, shoulders, back, waist, arms,
main_hand, off_hand and underwear to torso; legs and feet to legs. This reproduces the accepted limitation: it
separates head from torso, but hair and hat share the head band and vest and cape share the torso band. It is better
than the slot check alone but worse than the silhouette check, so it is reported and not used in the recommendation.

## Ground truth per pair

Truth bar: `strict` is any shared pixel, `material` is 4 or more. `union oracle max` is the largest overlap of the
per-direction union masks, an upper bound that can count pixels from different frames; it is not ground truth.

| pair           | slots                 | cells | overlap cells (material) | max px | mean px | max share of lower | union oracle max |
| -------------- | --------------------- | ----: | -----------------------: | -----: | ------: | -----------------: | ---------------: |
| vest + cape    | torso_inner/back      |    30 |                  30 (30) |    163 |    60.7 |             100.0% |              182 |
| vest + hair    | torso_inner/hair      |    30 |                    4 (0) |      3 |     2.2 |               3.9% |                8 |
| vest + helmet  | torso_inner/head      |    30 |                    5 (4) |      5 |     4.0 |               6.5% |               21 |
| vest + hat     | torso_inner/head      |    16 |                    0 (0) |      0 |     0.0 |               0.0% |                0 |
| vest + sword   | torso_inner/main_hand |    30 |                    2 (0) |      3 |     2.0 |               3.3% |                5 |
| cape + hair    | back/hair             |    30 |                   13 (3) |     15 |     5.0 |               4.2% |               57 |
| cape + helmet  | back/head             |    30 |                   10 (8) |     22 |     8.4 |               5.6% |               74 |
| cape + hat     | back/head             |    16 |                    0 (0) |      0 |     0.0 |               0.0% |               24 |
| cape + sword   | back/main_hand        |    30 |                  26 (24) |     84 |    37.8 |              30.8% |              218 |
| hair + helmet  | hair/head             |    30 |                  30 (30) |    135 |   102.9 |              98.8% |              237 |
| hair + hat     | hair/head             |    16 |                  16 (16) |    102 |    95.9 |              89.5% |              165 |
| hair + sword   | hair/main_hand        |    30 |                    0 (0) |      0 |     0.0 |               0.0% |                0 |
| helmet + hat   | head/head             |    16 |                  16 (16) |    108 |   100.6 |              81.7% |              154 |
| helmet + sword | head/main_hand        |    30 |                    0 (0) |      0 |     0.0 |               0.0% |                0 |
| hat + sword    | head/main_hand        |    16 |                    0 (0) |      0 |     0.0 |               0.0% |                0 |

8 pairs are material-unsafe, 2 more are strict-only (vest + hair, vest + sword, both 3 px max), 7 are clean under
the material bar and 5 are clean under any-pixel truth. Every same-slot pair (hair + helmet, hair + hat,
helmet + hat) is material-unsafe, so the slot gate is necessary.

### What the standing proxy misses

The union oracle is larger than the standing overlap for 11 of 15 pairs, by 5 to 174 px. The important cases are
pairs that look clear while standing but overlap during motion:

| pair          | standing max overlap | union oracle max (direction) | meaning                                                       |
| ------------- | -------------------: | ---------------------------: | ------------------------------------------------------------- |
| cape + hair   |             3 (east) |                   57 (south) | 0 in south standing, 15 px in a south move frame              |
| cape + helmet |                    0 |                   74 (south) | 0 standing, 22 px in a south move frame                       |
| vest + helmet |                    0 |                   21 (south) | 0 standing, 5 px in an east move frame                        |
| vest + sword  |                    0 |                    5 (south) | 0 standing, 3 px in a south move frame                        |
| cape + hat    |                    0 |                   24 (south) | union-only: no single cell overlaps, so the oracle over-flags |

The silhouette check removes cape + hair; the 2 px margin removes cape + helmet and vest + helmet. vest + sword
passes the margin and is the residual 3 px contact. The oracle is an upper bound, not a gate: it would also refuse
cape + hat, which never overlaps in one cell.

## Signals, each alone

The truth column is the bar; `pred` is how many pairs the signal calls safe; `FS` is false safes.

| signal alone (no slot gate)        | truth    | pred |  FS |  FN | false-safe |
| ---------------------------------- | -------- | ---: | --: | --: | ---------: |
| slot: different slot               | material |   14 |   7 |   0 |        50% |
| slot: different slot               | strict   |   14 |   9 |   0 |        64% |
| band: body-derived bands differ    | material |    9 |   3 |   1 |        33% |
| band: body-derived bands differ    | strict   |    9 |   4 |   0 |        44% |
| silhouette: no standing overlap    | material |    9 |   2 |   0 |        22% |
| silhouette: no standing overlap    | strict   |    9 |   4 |   0 |        44% |
| distance: min standing gap >= 2 px | material |    6 |   0 |   1 |         0% |
| distance: min standing gap >= 2 px | strict   |    6 |   1 |   0 |        17% |
| bbox: min bbox gap >= 1 px         | material |    2 |   0 |   5 |         0% |
| bbox: min bbox gap >= 1 px         | strict   |    2 |   0 |   3 |         0% |
| score: distance + bbox gap >= 4    | material |    5 |   0 |   2 |         0% |
| score: distance + bbox gap >= 4    | strict   |    5 |   0 |   0 |         0% |

Reading: the slot check has high recall and no value as a safety test; the band check is weak because head and torso
items share bands; the silhouette check removes the enormous same-slot and vest/cape/cape/sword collisions but still
leaves vest + helmet (5 px), cape + helmet (22 px) and the two 3 px contacts; distance is the first signal with zero
material false safes.

## Rules

- **A**: different slots only.
- **B**: A and no standing silhouette overlap in any direction.
- **C**: B and minimum standing mask distance at least 2 px in every direction with art. If an item has no art in a
  direction, that direction contributes nothing to the pair, as it would in a shared generation.
- **D**: B and an interpretable score, `min over directions of (mask distance + bbox gap) >= 4`. This adds bounding
  box separation to the distance, so a diagonal near miss and a long thin item are not read as clear.

| rule                              | truth bar | predicted safe |  TP |  FP |  FN | precision | recall | false-safe | false-unsafe |
| --------------------------------- | --------- | -------------: | --: | --: | --: | --------: | -----: | ---------: | -----------: |
| A: different slot                 | material  |             14 |   7 |   7 |   0 |       50% |   100% |        50% |           0% |
| A: different slot                 | strict    |             14 |   5 |   9 |   0 |       36% |   100% |        64% |           0% |
| B: A + no standing overlap        | material  |              9 |   7 |   2 |   0 |       78% |   100% |        22% |           0% |
| B: A + no standing overlap        | strict    |              9 |   5 |   4 |   0 |       56% |   100% |        44% |           0% |
| C: B + standing gap >= 2 px       | material  |              6 |   6 |   0 |   1 |      100% |    86% |         0% |          14% |
| C: B + standing gap >= 2 px       | strict    |              6 |   5 |   1 |   0 |       83% |   100% |        17% |           0% |
| D: B + (distance + bbox gap) >= 4 | material  |              5 |   5 |   0 |   2 |      100% |    71% |         0% |          29% |
| D: B + (distance + bbox gap) >= 4 | strict    |              5 |   5 |   0 |   0 |      100% |   100% |         0% |           0% |

### Which pairs pass and fail

`Y` means the rule calls the pair safe. Each pair's truth is from the table above.

| pair           | truth       | A   | B   | C   | D   |
| -------------- | ----------- | --- | --- | --- | --- |
| vest + cape    | material    | Y   | .   | .   | .   |
| vest + hair    | strict-only | Y   | Y   | .   | .   |
| vest + helmet  | material    | Y   | Y   | .   | .   |
| vest + hat     | clean       | Y   | Y   | Y   | Y   |
| vest + sword   | strict-only | Y   | Y   | Y   | .   |
| cape + hair    | material    | Y   | .   | .   | .   |
| cape + helmet  | material    | Y   | Y   | .   | .   |
| cape + hat     | clean       | Y   | Y   | Y   | Y   |
| cape + sword   | material    | Y   | .   | .   | .   |
| hair + helmet  | material    | Y   | .   | .   | .   |
| hair + hat     | material    | Y   | .   | .   | .   |
| hair + sword   | clean       | Y   | Y   | Y   | Y   |
| helmet + hat   | material    | .   | .   | .   | .   |
| helmet + sword | clean       | Y   | Y   | Y   | Y   |
| hat + sword    | clean       | Y   | Y   | Y   | Y   |

### What each false safe hides

- **A, material bar, 7 false safes**: vest + cape 163 px max (100% of the vest), hair + helmet 135 px (98.8%),
  hair + hat 102 px (89.5%), cape + sword 84 px (30.8%), cape + helmet 22 px (5.6%), cape + hair 15 px (4.2%),
  vest + helmet 5 px (6.5%). At the strict bar add vest + hair and vest + sword, 3 px each.
- **B, material bar, 2 false safes**: cape + helmet 22 px max, 8 of 30 cells, 5.6% of the cape; vest + helmet
  5 px max, 4 of 30 cells, 6.5% of the vest. At the strict bar add vest + hair and vest + sword, 3 px each.
- **C, strict bar, 1 false safe**: vest + sword, 3 px max, 2 px mean, 2 of 30 cells, 3.3% of the vest, all in
  south. No material false safe.
- **D, both bars, 0 false safes.** It rejects vest + hair and vest + sword (the two strict-only pairs).

The cliff is visible in the margin sweep. Below 2 px the rule is not safe; at 2 px the material false-safe count is
zero; above 3 px safe pairs are lost.

| margin m (B + min gap >= m) | predicted safe | FS strict | FS material | false-unsafe strict | false-unsafe material |
| --------------------------: | -------------: | --------: | ----------: | ------------------: | --------------------: |
|                           0 |              9 |         4 |           2 |                   0 |                     0 |
|                           1 |              9 |         4 |           2 |                   0 |                     0 |
|                           2 |              6 |         1 |           0 |                   0 |                     1 |
|                           3 |              5 |         0 |           0 |                   0 |                     2 |
|                           4 |              3 |         0 |           0 |                   2 |                     4 |
|                           5 |              3 |         0 |           0 |                   2 |                     4 |
|                           6 |              3 |         0 |           0 |                   2 |                     4 |

### Proxy stability

Using each of the 8 walk frames as the standing cell instead of frame 0:

| frame | C predicted | C FS strict | C FS material | D predicted | D FS strict | D FS material |
| ----: | ----------: | ----------: | ------------: | ----------: | ----------: | ------------: |
|     0 |           6 |           1 |             0 |           5 |           0 |             0 |
|     1 |           6 |           1 |             0 |           6 |           1 |             0 |
|     2 |           6 |           1 |             0 |           6 |           1 |             0 |
|     3 |           6 |           1 |             0 |           5 |           0 |             0 |
|     4 |           5 |           0 |             0 |           5 |           0 |             0 |
|     5 |           6 |           1 |             0 |           5 |           0 |             0 |
|     6 |           6 |           1 |             0 |           5 |           0 |             0 |
|     7 |           5 |           0 |             0 |           5 |           0 |             0 |

C's material false-safe count is 0 under every walk frame. Its one strict contact (vest + sword) appears in 6 of 8
frames. D's frame-0 zero is not stable: frames 1 and 2 predict vest + sword safe, because that frame shows more
clearance while the move frames still touch for 3 px. A single-frame margin cannot guarantee zero contact; the
material bar can.

### Per-direction check

Grouping is per pair, so the pair must pass in every direction. Scoring one direction at a time shows why:

| rule | truth bar | predicted pair-directions |  FP |  FN | false-safe |
| ---- | --------- | ------------------------: | --: | --: | ---------: |
| C    | material  |                        22 |   2 |  16 |         9% |
| C    | strict    |                        22 |   4 |  18 |        18% |
| D    | material  |                        15 |   1 |  17 |         7% |
| D    | strict    |                        15 |   2 |  20 |        13% |

The two material direction false safes under C are cape + helmet north (5 px: standing gap 2 px) and cape + sword
east (8 px: standing gap 8 px). Both pairs fail C at pair level because another direction touches (cape + helmet
minimum 1 px, cape + sword 0 px). This is the strongest argument for taking the minimum distance across all
directions rather than checking each direction separately.

## Grouping algorithm and groups

Proposal: greedy clique grouping. Iterate items in wardrobe order (manifest order here: vest, cape, hair, helmet,
hat, sword). An item joins the first existing group only if the rule calls it safe against **every** member;
otherwise it opens a new group. This is O(n²) per group and trivial for outfit sizes. Union-find is unsafe because
pairwise safety is not transitive: under C the safe edges form a chain
`cape - hat - vest - sword - hair` and `sword - helmet`, so union-find merges all six items, including
hair + hat (102 px), helmet + hat (108 px) and cape + sword (84 px). That happens under every rule tested.

| rule | groups from the fixture                                       | what the grouping hides                                                 |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A    | batch {vest, cape, hair, helmet, sword}; separate hat         | 7 material pairs inside the batch group, up to 163 px (vest + cape)     |
| B    | batch {vest, hair, sword}; batch {cape, helmet}; separate hat | cape + helmet 22 px inside its group; vest + hair and vest + sword 3 px |
| C    | batch {vest, hat, sword}; separate cape, hair, helmet         | vest + sword 3 px (2 of 30 cells, material-safe)                        |
| D    | batch {vest, hat}; batch {hair, sword}; separate cape, helmet | none                                                                    |

Group reasons under each rule:

- **A**: batch {vest, cape, hair, helmet, sword} because every member has a different slot from every other; hat is
  separate only because it shares the head slot with helmet. This is the rule's whole check, and it hides the
  material pairs listed above.
- **B**: batch {vest, hair, sword} and {cape, helmet} because each group's members have different slots and their
  standing masks do not touch in any direction; hat is separate because it overlaps hair and helmet while standing.
- **C**: batch {vest, hat, sword} because every pair has different slots, no standing overlap and at least 2 px
  standing clearance; the three singles each touch or nearly touch a would-be group member.
- **D**: batch {vest, hat} and {hair, sword} because every pair has different slots, no standing overlap and
  clearance score of at least 4. Cape stays single because its only safe partner is hat, already in the first group;
  helmet stays single because its only safe partner is sword, already with hair. Greedy order decides this: D could
  equally return {cape, hat} and {helmet, sword}, with the same pair count.

Group reasons under C:

- **batch {vest, hat, sword}**: three different slots, no standing overlap, minimum standing gap 2.83 px
  (vest + sword east), every pair checked. The preview still has to show the 3 px vest + sword contact in south.
- **separate cape**: standing overlap with vest, hair and sword; 1 px standing gap with helmet.
- **separate hair**: 1 px standing gap with vest; standing overlap with cape and helmet; standing overlap with hat.
- **separate helmet**: 1 px standing gap with vest and cape; standing overlap with hair; same slot as hat.

The C groups batch 3 of 6 items in one group and leave 3 single. D batches 4 of 6 across two pairs, because it
rejects the 3 px vest + sword contact but accepts hair + sword, which C also accepts. D needs two batch calls instead
of one, so it is not obviously the cheaper option; it is the option whose groups contain no observed overlap.

## Recommendation

Use **rule C** as the auto-batch gate, evaluated per pair, with the minimum across every direction that has art:

1. same slot: never batch;
2. standing masks must not touch in any direction;
3. standing mask distance must be at least 2 px in every direction;
4. group only pairwise-safe cliques (greedy), never union-find or transitive closure;
5. keep the mandatory preview, the grouping notice and the "animation can introduce overlap later" warning.

False-safe rate on the fixture: **0 of 6 predicted-safe pairs at the 4 px material bar (0%)**, and **1 of 6 at the
any-pixel bar (17%)**, the vest + sword 3 px boundary contact. The material zero is stable across all 8 walk frames.
The any-pixel residual is not removable by standing-art margins: rule D moves it to a different frame rather than
eliminating it.

If the product needs a stricter default, rule D is the conservative alternative with 0 of 5 false safes at both bars.
It rejects vest + hair and vest + sword (at most 3 px each) and instead groups {vest, hat} and {hair, sword}, so it
batches 4 items in 2 calls rather than 3 items in 1 call. That is a different tradeoff, not a safer one overall.

The detector answers only one of the three batch blockers. It does not check chroma-key collisions (the hat loses
90.6% of its pixels on blue and azure), shared prompt or seed design bleed, cell bleed, or palette drift. Those
remain separate gates from
[the feasibility findings](../../2026-11-24-batch-item-generation/findings/batch-feasibility.md), and the preview
stays mandatory even when the geometry check passes.

## Limits

- One 64 px character, 6 items, 3 directions, 2 moves, 15 pairs. Each pair is 6.7% of the fixture's pair-level rate,
  so the percentages are descriptive, not an estimate with a useful confidence interval. The thresholds were chosen
  on these same pairs; the margin needs a second character before shipping.
- The fixture has no standing cell and no keypoints. Walk frame 0 is the proxy. The union oracle over-approximates
  because it unions masks across frames; it cannot replace ground truth, and it flags cape + hat (24 px union, 0 px
  in every cell).
- The wizard hat has no north art and no cross-punch art, so hat pairs are judged on 2 directions. An item with no
  art in a direction is trivially safe there, but that direction is unobserved for future art.
- Accepted palettes are disjoint and the art is warm or gray. A generated composite drifts in color and shape, so
  the geometric mask is the optimistic case, not a model output.
- The fixture's item set is exactly the case the slot ladder was designed for. A custom slot, a two-handed weapon, a
  cape with a large bg layer, or long hair that swings would need its own measurement.

## Reproduce

From the repo root, with Python 3.14, Pillow 13, numpy 2.4 and scipy 1.17:

```
python docs/research/2026-11-24-batch-extraction/pair_truth.py
python docs/research/2026-11-24-batch-extraction/evaluate_rules.py
python docs/research/2026-11-24-batch-extraction/report_tables.py
```

`pair_truth.py` writes `pair_truth.json`; `evaluate_rules.py` writes `rules_result.json` and prints the rule,
margin, stability, per-direction and grouping tables (saved here as `evaluate_rules_output.txt`);
`report_tables.py` reprints the markdown tables above from the JSON. No network, no paid calls, no writes under
`app/`.
