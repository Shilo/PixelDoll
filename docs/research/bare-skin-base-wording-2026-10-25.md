# Bare-skin base bodies: prompt wording research (2026-10-25)

Status: **shipped.** New characters are drawn fully bare. The clothes clause in `BASE_CLOTHES`
(`app/src/studio/model.ts`) is "with plain bare skin everywhere, nothing worn". Part of
[round 5](lexingel-paperdoll-findings-round5-2026-10-25.md). Harness arm W in `spikes/api/c25/arm_r5.mts` (modes `W`,
`W2` to `W7`), with frames and the ledger in `spikes/api/out/c25e/W/` (git-ignored). Spend: 140 gens of drawings plus five
Studio bodies at about 35 gens each, with no refusals.

## Why a bare base

PixelDoll draws one base body per character and adds every item as a separate layer over it. The base used to wear a light gray
t-shirt and dark gray shorts. That shirt showed through every torso item measured:

- **Tunics:** 2–6 px of collar showed in the V-neck.
- **Robes:** 8–12 px showed through.
- **Leather vest:** 6–13 px showed per view.
- **Open cloaks:** 106–136 px of shirt showed under the open front.

Lexingel's research reported the same problem with a base in shorts ("grey shows through the armour gaps"), and paper-doll
systems (UO, LPC) draw their bases unclothed. The owner asked for a **fully bare** base: no underwear and no shorts. The prompt
must not trip PixelLab's content filter.

Constraints: **every pixel must come from PixelLab**. The base must be bald and barefoot, in a neutral standing pose with the
arms slightly away from the torso so items can be layered. It must not be explicit; mannequin-like is fine. The wording must work
for any user description, male or female, because the app appends the same line to every prompt.

## What was known before testing

| Source | Finding |
|---|---|
| Earlier PixelDoll evidence ([SHARED_NOTES](SHARED_NOTES.md) R1, S1) | `transfer-outfit-v2` onto a **nude** south-facing base was refused 4 of 4 times (`code 5000`, $0); a shirtless base was refused 1 of 8 on `inpaint-image-pro-flash`. Those refusals were on edit and transfer calls, not on character creation |
| pixellab-pip project (`C:\Programming_Files\Shilocity\PixelLab\pixellab-pip`, read by a subagent) | No refusal anywhere in its logs. "nude bare skin, no clothing, no accessories, bald hairless" passed 54 of 54 calls on `/create-image-pixen`. The real failure was clothes drawn anyway: "bald unisex chibi base character without clothing" on v3 gave a top, an outfit and blue briefs; "Unclothed, nonsexual base anatomy" gave trousers. "no underwear" stopped drawn briefs in one seeded v3 run. "hairless" alone still drew hair, while "bald hairless" did not. Words like "mannequin" and "doll-like" hurt quality but caused no refusals. `template_id: mannequin` is PixelLab's default humanoid template |
| Web research (subagent) | PixelLab publishes nothing on nudity or error 5000. Image generators filter both the prompt text and the finished image. Midjourney-style banned lists include nude, naked, unclothed, topless, shirtless, underwear, briefs, bra and body-part words. Naming a part to exclude it ("no nipples") tends to plant it. The recommended framing is an object (mannequin, doll) in one flat skin tone, with one gender-neutral clause and the sex left to the user's own words. Sources: The Fabricant mannequin prompts (thefabricant.com/post/ai-model-pose-prompts), itch.io and OpenGameArt "paperdoll" and "mannequin" bases, aiarty and aifire banned-word lists, and the glama.ai copy of the create_character_v3 schema |
| Round 5 arm U (this session) | "wearing only plain dark gray underwear" passed every call, but drew the woman **topless in briefs** and the man in briefs |

## Method

- **Call:** `POST /create-character-v3` with `image_size` 64×64, `view` low top-down, `template_id` mannequin and
  `no_background` true. It returns the 8 standing rotations and costs about 2 gens.
- **Description:** `<who>, plain bald paperdoll base body, <CLAUSE>, barefoot, no hair, no accessories, neutral standing pose with
  arms slightly away from the torso`, with `<who>` either `a human man` or `a human woman`. This is the production base body line
  (`bodyWith` in `model.ts`) with only the clothes clause swapped.
- **Seeds:** 26 at first, then 26–29. The same seed per sex across clauses gives a paired comparison. PixelLab isn't
  deterministic (round 4 measured 6–10 % different pixels for a byte-identical request), so the conclusions rest on counts over
  seeds, not on single pairs.
- **Judging:** by eye on the back, front and three-quarter views at 3–5× zoom. A sample **fails** if it has any garment (briefs,
  loincloth, shorts, top), hair, or explicit detail. Seed artifacts that aren't garments are recorded separately: tattoo-like
  blotches, gray skin (no Skin trait was set), a drawn background.
- **Rule** (fixed before the run): a clause ships only if no sex is refused and no view draws a garment, hair or explicit detail.
  Ties go to the shortest clause.

## Results

No call was refused in any round (70 drawings, 140 gens).

### Round W1 (seed 26)

| Clause | Man | Woman |
|---|---|---|
| with bare skin, no clothes, no underwear | **brown briefs**, bluish tattoo-like marks | bare, clean |
| with a smooth unclothed body like a featureless store mannequin, one even skin tone, no underwear | **dark briefs** | bare, band-like joints on the legs |
| with bare skin, no clothes, no underwear, smooth featureless non-explicit anatomy | **faint briefs**, marks | **red hair** in the back view |

### Round W2 (seeds 26 and 27)

| Clause | Men | Women |
|---|---|---|
| with bare skin, no clothes, no underwear, no tattoos | **briefs** (26), **tan briefs** (27) | **red spot on the head** (26), bare (27, gray skin) |
| with a smooth unclothed doll body, plain skin, no underwear, no tattoos | **brown briefs** (26), bare (27, gray) | bare (26), bare (27, gray, jointed) |
| with plain bare skin everywhere, nothing worn, no underwear, no tattoos or markings | bare with blotches (26), bare and clean (27) | bare (26), bare (27, gray) |

### Round W3: the W2 winner on seeds 28 and 29

| Clause | Men | Women |
|---|---|---|
| with plain bare skin everywhere, nothing worn, no underwear, no tattoos or markings | bare (28); bare, but a **background scene** and white strap-like marks (29) | bare, chunky and blotchy (28); bare (29) |

### Ablation W4–W7 (seeds 26–29, so 4 men and 4 women per clause)

| Clause | Men with a garment | Women with a garment or hair | Notes |
|---|---|---|---|
| with plain bare skin everywhere, nothing worn, no underwear, no tattoos or markings | 0 / 4 | 0 / 4 | W2 + W3 winner |
| with plain bare skin everywhere, nothing worn, no underwear | 0 / 4 | 0 / 4 | blotches no worse without the tattoo clause |
| **with plain bare skin everywhere, nothing worn** | **0 / 4** | **0 / 4** | **shipped**; no background on seed 29 this time |
| with plain bare skin everywhere | 2 / 4 (briefs 26, loincloth or shorts 27) | 0 / 4 | seed-29 background |
| with plain bare skin, nothing worn, no underwear | 2 / 4 (briefs 26, gold loincloth 27) | 0 / 4 | seed-29 background |
| with plain bare skin, nothing worn | 1 / 4 (dark briefs 26) | 0 / 4 | seed-29 background |
| nothing worn | 1 / 4 (gold loincloth 27) | 0 / 4 | seed-29 background |

What the ablation shows:

- **Men are the hard case.** Women never drew a garment once "no clothes" or "nothing worn" was present. Men drew briefs or a
  loincloth with most clauses.
- **"everywhere" and "nothing worn" are both needed.** Dropping either one brings garments back on 2 of 4 men.
- **"no underwear" and "no tattoos or markings" add nothing measurable.** Without them, the clause drew no garment on all 8
  samples, and the tattoo-like blotches appeared as often with the clause as without it.
- **Seed effects are not wording effects.** Every clause shares them:
  - seed 26 men draw tattoo-like blotches;
  - seed 27 often turns the skin stone gray when no Skin trait is set;
  - seed 29 men drew a background scene with six of the seven clauses tried on that seed;
  - seed 28 women came out chunky and blotchy.

### Full bodies and items

Studio creation runs the whole body pipeline: drawing, standing-view import, skeleton, idle and walk animations on
`animate-with-skeleton-v3`, and joint checks.

| Body | Clause | Outcome |
|---|---|---|
| C27 bare man, C27 bare woman (Light tan, seed 27, Top-down 4) | W2 winner (with "no underwear, no tattoos or markings") | bare and bald in every view and every idle and walk frame; routine silhouette-bottom notes only |
| C28 bare man (Light tan, seed 26, the seed whose men drew briefs with most clauses) | shipped clause | bare in every view and frame. Idle east kept 37 detached px of smoke beside the head (a known skeleton-v3 effect, reported and skipped by G2). One idle frame drew a small hair tuft |

A tunic, a sleeveless leather vest and an open cloak went through the full item pipeline (dress with `edit-animation-v2`, then
one idle+walk pose call per view) on both C27 bodies. All six passed every gate, with key kept 0.992–1.000 and key outside
≤ 0.004. Necklines, armholes and the open front show skin, not a garment. Sheets: `spikes/api/out/c25e/U/c27*.sheet.png`.

## The shipped prompt

The Studio adds this line under the user's own text (the "exact prompt" shown in the character form):

> plain bald paperdoll base body, with plain bare skin everywhere, nothing worn, barefoot, no hair, no accessories, neutral
> standing pose with arms slightly away from the torso

For example, the drawing request for C28 was:

> a human man
> Skin: Light tan
> plain bald paperdoll base body, with plain bare skin everywhere, nothing worn, barefoot, no hair, no accessories, neutral
> standing pose with arms slightly away from the torso

The body's own animation requests describe it as (`looksOf`, which since round 5 follows the base body line in the prompt):

> a human man, Skin: Light tan, bald, with plain bare skin everywhere, nothing worn, barefoot, empty hands, no weapon

The item calls never see the skin: they dress and pose a one-color chroma stand-in of the body ("solid bright green mannequin
(chroma key color) wearing …"), so the bare base adds no filter risk there.

Older projects whose prompt contains the t-shirt line, spelled "gray" or "grey", keep parsing as a base body line and keep their
t-shirt in their animation requests.

## Is it the most minimal prompt?

- **The clothes clause, yes, by test.** Each of its two remaining parts is needed (dropping either drew garments on men), and
  the two other parts tried had no effect.
- **The rest of the base body line, not tested.** It predates this round:
  - "bald" and "no hair" overlap, but pixellab-pip found "hairless" alone still drew hair. Keep both unless a test says otherwise.
  - "barefoot" probably adds nothing next to "nothing worn".
  - "no accessories" and the pose words may matter. The arms-away pose keeps the arms clear of the torso for layering.
  - "paperdoll base body" was never tried without.

  Each removal is about 16 gens (4 seeds × 2 sexes × 2 gens) under the same rule.
- **Words avoided on purpose:** nude, naked, unclothed, topless, underwear, briefs, any body-part word, and negated anatomy
  ("no nipples"). The shipped clause needs none of them.

## Open questions

- Larger bodies (96 and 128 px) and the chibi proportions preset were not drawn with the bare clause. pixellab-pip found that
  "bald" plus chibi proportions can read as an infant.
- Kinds other than human (elf, dwarf, orc, undead) were not drawn bare.
- The filter may change. Re-check the wording when PixelLab updates its models; a refusal returns `code 5000` and costs nothing.
- A Skin trait avoids the stone-gray seeds. Making one the default is a product choice that wasn't made here.
