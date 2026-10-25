# Generation quality campaign (2026-10-25)

Status: **complete.** Plan agreed after two challenge rounds; results below. Budget ≈ 1,000 generations
(owner-approved); balance at start 7,287 gens (Tier 3, $20.34 credit).
Goal: improve the **output** of the item pipeline at each step, meaning the PixelLab calls (route, prompt, parameters), the
pre-processing we send (key mannequin) and the post-processing that cleans generations (extraction, cleanup).

## How items and key colors work (plain version)

PixelLab cannot draw an item on its own layer. So PixelDoll repaints the character as a flat, single-color stand-in (the
**key color**, like a green screen), asks PixelLab to draw the item on that stand-in, then keeps every pixel that is *not* the
key color: that is the item layer. It is drawn over the real character later.

This only works if the item contains none of the key color. Before 2026-10-25 there were two key colors: **green** (default)
and **magenta** (for items with green in them). An item with both green and pink, like a jester hat, had no safe choice: it got
magenta, and its pink parts were cut away with the background. The campaign added **blue** as a third key, used only for that
case, and it fixed the jester hat on both test bodies.

Blue does not help an item with green **and purple**: purple is close enough to blue (and to magenta) that both would cut it,
so such items keep magenta and can still lose purple parts. That is an open issue, not a contradiction: blue is used for green +
pink/red; green + purple has no safe key yet.

## Rules (pre-registered before any paid result)

- **Production code paths.** Requests come from `itemRoute.edit` / `itemRoute.pose` / `chromaPrompt` (or a variant that differs
  only in the tested field). Outputs go through `extractCell`, `postProcess`, `itemQa` and the H4 `dirGate`. Calls use the agent
  key from a Node harness; every call is logged with base64 stripped (`spikes/api/out/c25/`, local-only), and the cost comes
  from the balance delta.
- **No automatic re-rolls.** Every arm uses the same fixed seed list (7, 11). Re-roll and best-of-N policies are simulated
  offline from the stored seeds. A refusal or missing frames stops that arm, and the failure is reported. A paid request is
  never resent automatically.
- **One primary metric and two guardrails per arm**, paired by item × seed, and decided by a sign test across items.
- **Blind judging.** Layers are judged over the real base at 5× nearest-neighbor, per item-direction-clip, as a forced choice
  with defect tags. Files are hashed and the key is sealed by a script. About 20% of pairs are control-vs-control placebos,
  plus flipped repeats. Judges are two fresh agents that cannot read the logs.
  - A judge's votes count only if it agrees with ≥ 80% of S4's known verdicts (calibration) and its placebo side bias is
    ≤ 65/35.
  - Disagreement counts as a tie, and ties are never broken after unblinding.
  - The owner gets an optional blind page as sign-off before any default changes.
- **Adoption** needs both: the guardrails not worse, and the blind win (or the primary metric decided by the sign test where
  the arm states it).

## R0 offline results (0 gens, stored v0.1.0 evidence)

| Lever | Finding | Action |
|---|---|---|
| Held cleanup order (P2) | `majorComponents` ran per cell before the wrist rule and deleted pommels and axe-haft ends. In the 240 S5 frames it removed 1,198 px over 115 frames; 126 of 141 rescued pieces sit within 8 px of the gripping wrist, and the visual check shows gold pommels and brown haft ends. A 6 px wrist-zone exemption rescues them with **0** far fragments; clip area CV goes 0.157 → 0.161 because the hand legitimately hides the pommel in some frames. | **Shipped**: held cells get the size floor inside `attachHeld`, exempt within 6 px of the wrist (`items.ts`; `test/unit/held-pommel.test.ts`). |
| Key threshold KT (P1) | Green key scores are bimodal: 0.7% of opaque px fall in 20–49 (S4 576 frames, S5 336). Magenta has 5.4% in 10–49, but the visual check puts all of it on a **red cape** (a red item on the magenta key) and on sword edges. Production routes red items to green. | Not a lever; no paid arm. |
| Palette drift (P3) | Posed frames reuse the keyframe's exact colors: off-palette ≤ 0.5% in most S4 clips, 1.8–5.2% at worst (boots walk E, chest walk E, cape slash N). | Low value; no snap step. |
| Production baseline (S4 Q3e, 6 items) | The dress keyframes are clean (key kept ≥ 0.98). Every failure comes from the **pose call**: the helmet deforms in slash E (H4, 3 frames), and the cape turns into a thin ring in slash N (G3/G4). Boots/sword border warnings are artifacts of the old unpadded 64 px rig. | Pose description arm P. |
| `max_colors` on the dress (old E2) | The cap applies to every pixel, key included: a 64 px dress has 20–38 colors, 11–29 of them key colors. | Cut. |
| Flat key ramp (old E3) | `toChroma` is a continuous luminance ramp. Items already get 8–13 non-key colors at 64 px and 23–29 at 96 px. | Cut. |
| State as a dress step (old E5) | No 8-direction body in scope; the S5 96 px dress was already clean. | Cut. |
| Key collision (code audit) | `pickKey` has no route when a prompt names both a green and a red/pink/purple hue ("green-and-pink jester" gets magenta, and its pink parts are keyed out); the Studio never chooses the diff route. | Arm K. |

## Paid arms

| # | Arm | Body | n | Gens | Primary metric / decision rule | Guardrails |
|---|---|---|---|---|---|---|
| B | Studio-default body: 64 px in an 80 px frame, Top-down 8 (5 drawn views), idle + walk + slash; slim build, near-bald | — | 1 | ≈ 70 (read the creator estimate first) | — | — |
| D | dress prompt: current `chromaPrompt` vs view-aware wording (front/side/back per frame, no pseudo-clip "rest" note, "the same item seen from each angle") | A | 6 items × 2 seeds × 2 | ≈ 240 | blind wins ≥ 9/12 non-tied pairs | hard fails (G2/G3/D1) not higher; layer present in every view |
| P | pose description: current generic phrase vs keyframe-anchored looks ("{item} exactly as drawn in the first frame: same shape, size and colors") on stored S4 keyframes; clips slash E, slash N, walk E | A | 6 items × 2 seeds × 2 | ≈ 216 | hard-fail frames (G3/G4/H4/G8) by sign test over item × seed; blind wins ≥ 70% | palette distance to the keyframe; area presence |
| K | key collision: magenta (current) vs blue third key vs diff route, dress only | A | 2 items × 2 seeds × 3 | ≈ 120 | blind wins; G2 ≥ 0.97 for keyed arms | item px keyed out (pink/red parts) |
| C | confirm control vs combined winners, full pipeline (dress + walk in 5 drawn views) | B (+ 128-padded copy for 2 items) | 4 items × 1 seed × 2 | ≈ 240 | same as D | same as D; skipped and banked if D, P and K all fail |
| E4 | concept image: anchored `edit-animation-v2` vs `transfer-outfit-v2` with a paste-up reference | A | 2 concepts × 2 seeds × 2 | ≈ 80 | kill rule from the 2026-10-24 review | — |
| — | reserve, for structural failures only | | | ≈ 30 | | |

Items for D and K. D: steel great helm (gray, head); red hooded cloak (back, hood overflow); emerald tunic with gold trim (green
item → magenta key); black leather boots; gold crown with white fur (bright, small); long white robe (full body over the
legs). K: "green-and-pink jester hat" and "red and green holly-trimmed tunic".
The first call at each canvas size is a price probe (S5 measured 10 gens for a 3-frame 96 px dress).

## Results

Spend: **909 of 1,000 gens** (balance delta): P 216, D 240, K 120, C 150, E4 126 (incl. one Pro Flash concept image),
body B 57 (Studio creator). No refusals, errors or lost requests. Prices measured: dress `edit-animation-v2` 10 gens for 3
frames at 64 px **and for 5 frames at 80 px** (the plan assumed 15); pose 3 gens per 8 frames; `transfer-outfit-v2` 10 gens
at 64 px; `create-image-pro-flash` 128 px 6 gens. Evidence: `spikes/api/out/c25/` (local); harness: `spikes/api/c25/`.

### Blind judging, as run

| Round | Pairs | Judges counted | Note |
|---|---|---|---|
| r1 (D, K) | 24 test, 6 placebo, 12 calib | 0 of 2 | Both judges "missed" calibration exactly on clips S4 documents as weak for its own good route (helmet/vest/sword east): **our labels were wrong**. Calibration set fixed to 8 clip-specific pairs; no r1 vote used. |
| r2 (P, D, K) | 60 test, 12 placebo, 8 calib | 2 of 2 | Both 7/8 calibration, placebo bias ≤ 56 %. |
| r3 (E4, C) | 7 test, 2 placebo | 0 of 2 | Both 8/8 calibration but 2/2 same-side placebo calls = "100 % bias": too few placebos (kit flaw). Rebuilt, not rescued. |
| r3b (E4, C) | 7 test, 8 placebo, 8 calib | 1 of 2 | Second judge missed the bias gate by a hair (4/6 = 0.67 > 0.65). |

Judges agreed with each other on every decided calibration pair; disagreement counts as a tie.

Deviations from the pre-registered protocol (found in the final review):

- **Placebos were not identical images.** They are the same arm at seeds 7 and 11, so the side-bias gate partly measures seed
  preference; it excluded r3b's second judge although it matched the counted judge on 5 of 6 decided placebos and all 7 tests.
- **No flipped repeats** were included (none of r2's pair ids repeat).
- **The r1 relabel removed exactly the four pairs both judges disputed** (sword, vest and helmet ea2 > pixen east, helmet
  ea2 > pixen south). The east three are documented S4 weaknesses of ea2; helmet south (the subtle pixen face) was a judgment
  call. A calibration set the judges already agree with cannot catch a bias they share.
- Next campaign: identical-image placebos, real flipped repeats, calibration fixed before any judging.

### Per arm

| Arm | Result | Decision |
|---|---|---|
| **K: third key** | Adopted on the **deterministic** failure, not on the blind statistics. Magenta on the green-and-pink jester fails G3 on 5 of 6 dress views on body A (2 seeds) and on all 5 dress views of body B's single dress call (key outside 0.17–0.22; its 56 posed frames inherit that keyframe, so this is one observation, not 56). Visually the pink half turns tan or gray; the extraction is reproduced on the real body B outputs in `test/unit/blue-key.test.ts`. Blue passes every gate on both bodies. Blind data agree but are small: r2 blue 3–0–1 over 2 items (a sign test over 2 items cannot decide), r3b 1 pair by 1 counted judge. Red-and-green holly passes on both keys (blind 1–0–1 for blue); the code routes it to blue too. Blue vs the diff route: jester tie/tie, holly 1–0 for blue. | **Adopted and implemented** (below). |
| D: view-aware dress prompt | Blind 4 view, 2 control, 6 ties (needed ≥ 75 % of decided pairs); view has one extra hard failure (cloak back view G3) and adds unrequested details (a hood on the robe). | Not adopted: no reliable effect. |
| P: keyframe-anchored pose description | Hard-fail frames worse in 4 item-seeds, better in 0, tied 8 (one-sided sign test p = 0.06); blind 5–4 with 27 ties; the sword got 1–3 extra failures. | Not adopted: no benefit (not proven harmful). |
| C: confirmation on body B (Studio default: slender elf, 80 px frame, 5 drawn views) | Tunic passes everything. Great helm: G2 in the back view just under the gate (0.967, 22 px). Hooded cloak: back view keeps only 79–84 % of the key; the model draws a dark rim around the hood (the elf's pointed ears) and a mottled texture, both visible. The gate is right, not a false alarm. | Back views of full-coverage items and protruding ears are the weak spot of 8-direction Studio bodies; follow-up. |
| E4: concept-image items | Seed 7 (blind r3b, 1 counted judge; the 3 other judges' calls agree): `transfer-outfit-v2` beats today's anchored `edit-animation-v2` dress 2–0 and the raw concept beats the local paste-up as the reference 2–0 (it keeps the face guard and cheek guards). Seed 11 was **not** blind-judged; my reading: the control again worst (an unrequested brim, a vaguer viking), raw ≈ paste-up. Colors: layer→concept 5–16, concept coverage 0.75–1.0; no hard failures. n = 2 headwear concepts (A is a same-style S1 helmet, B a 128 px Pro Flash test sprite made for this test, not a product path). Dropped from the plan: the paste-up + `target_palette` arm (`target_palette` constrains every pixel, key included) and the human fidelity score. | **Provisional**: build concept items on `transfer-outfit-v2` with the raw concept; skip the paste-up (it added stray pixels and lost features). Re-test with a held item and a full-body outfit, blind, before release. |

### Generation observations (not arms)

- **Pose calls invent props.** In slash clips the model draws a sword and motion streaks for non-held items despite "empty hands,
  no weapon, no effects" in both the description and the action. Production cleanup removes them from shipped layers (head-band
  trim, component filters; checked visually on helmet, cape, hair), but the streaks across the face are what fails H4 on the
  helmet's east slash.
- **Blind judges' recurring defect tags** (all arms): ghost body outlines extracted as item (boots, edit-images-era S4 calibration
  only), a cape reduced to slivers, sword switching hands, helmets floating above the head (S4 `eiv2`), and the magenta jester
  colors. Small persistent ones: the base mouth pixel showing through great-helm breathing holes (faithful layering), the gray shirt
  under open necklines (faithful).

## Shipped from the campaign

| Change | Evidence | Code and tests |
|---|---|---|
| Held cleanup order: size floor after the wrist rule | R0 P2 above (reproducible: `spikes/api/c25/r0/p2_pommel.mts 6`) | `items.ts` `attachHeld`, `extractCell({ held })`; the cell's gate metrics keep the size-floored mask so G2/G3 are as strict as before; `test/unit/held-pommel.test.ts` (the 6 px radius test fails at 3 px) |
| Third chroma key: blue, only when green and magenta both collide (pink or red with green); green + purple still gets magenta as before | Arm K, confirmed on body B | `chroma.ts` (`KEYS`, `KEY_NAME`, ramp, score, despill and dark-outline luminance in the key's frame, hue words incl. purples for blue and indigo for magenta, `pickKey`), `items.ts`/`equipment/generate.ts` name the key from `KEY_NAME`, head-occlusion review uses the cell's own key (`CellOut.chroma`), `manifest.ts` and `manifest-spec.md` key type; `test/unit/blue-key.test.ts` (real body B jester outputs as a fixture; blue extraction equals the measured green-on-swapped-channels extraction pixel for pixel, posed and unposed) |

Blue was measured on the dress and walk poses only; the grid fallback, the anchored edit route, action and idle poses and shared
fitting are untested with it. For the prompts that now get blue, the previous behavior was a deterministic loss of the pink or
purple parts on every route, so the untested routes cannot be worse than before.

## Follow-ups

Outcome in [round 2](generation-quality-round2-2026-10-25.md): 1 → the anchored edit-animation-v2 route won instead; 2 → the
model erases the ears under the hood, which layers cannot hide (needs an occlusion feature); 3 → solved with a fourth key,
azure; 4 → no reliable effect.

1. **Concept-image items**: implement with `transfer-outfit-v2`, the user's image as `reference_image`, chroma rest views as frames,
   the `equipment/generate.ts` instruction template, the same G2/G3 gates, then the normal posing. Test more concepts (full-body
   outfits, held items) before release; n here is 2 headwear concepts; only seed 7 was judged blind (seed 11 unjudged).
2. **Back views of full-coverage items on Studio bodies** (hooded cloak north on body B): dark rim and mottled texture.
3. **Green + purple items have no safe key** (purples score as blue key, indigo as magenta): they keep the old magenta key,
   which keys out the purple. The diff route keeps the colors but cannot be posed or get later moves, and was never measured on a
   Studio body. Measure it there (≈ 80 gens) or find a fourth key before changing anything.
4. **Action poses invent props**: try action wording without the word "slash" for non-held items (cheap: ≈ 36 gens).


## Running the next campaign

Harness: `spikes/api/c25/` (Node, `.mts` because `spikes/api` is CommonJS). Evidence: `spikes/api/out/c25/` (git-ignored).

- **Setup.** Run from `spikes/api` with `node --env-file=../../.env c25/<script>.mts`; the agent key is read there and never
  printed. `lib.mts` imports the production modules from `app/src/lib`, keeps a spend ledger (`out/c25/ledger.jsonl`) with a
  per-arm and a total cap (`TOTAL_CAP`), never resends a call whose `.sent` marker exists, and `readOnly()` makes evaluation
  scripts unable to spend.
- **Bodies.** `s4rig.mts` (body A, stored v0.1.0 rig, free). `bodyB.mts` reads a Studio character exported from the agent dev
  server's IndexedDB: run `node c25/receive.mjs <name>` (WebSocket on 127.0.0.1:5297, allowed by the dev CSP) and send the
  project from the page with `c25/export-body.js` (paste into the agent dev server page).
- **Arms.** `arm_p.mts` (pose description), `arm_dk.mts` (dress prompt, key collision), `arm_c.mts` (body B full pipeline),
  `arm_e4.mts` (concept images; `E4_SEED` for replicates). Each has a `dry` mode that prints the exact request. Probe one call
  first; prices differ from the 10/15/25 assumption.
- **Evaluation.** `evaluate.mts` runs production extraction, cleanup, QA and H4 plus palette metrics; `eval_*.mts` per arm.
  `r0/` holds the free offline checks on stored frames (`p2_pommel.mts 6` reproduces the pommel numbers).
- **Blind judging.** `judge_kit*.mts` writes hashed pair images and a sealed key; `calib.mts` holds the calibration pairs;
  `unblind.mts <round> <judge files>` applies the gates. Launch two fresh judge agents that may open only the round folder.
- **Lessons.** Synthetic drift benchmarks can reverse on real data; use stored real outputs. Fix the calibration set before
  judging, use identical-image placebos and real flipped repeats (this campaign had neither), give each arm two seeds, and
  write the decision rule before seeing results. One primary metric per arm; the gates alone rarely separate prompt variants.
