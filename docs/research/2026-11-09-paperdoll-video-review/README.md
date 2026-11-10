# Research spike: a third-party paper-doll workflow and the chroma key color

Date: 2026-11-09 to 2026-11-10. Inputs: a 131 s screen recording of another paper-doll tool's own research report (a scrolling
page of nine panels: verdicts, sprite comparisons, mask tables, rules and open faults) and one screenshot of its "make gear"
screen (a dragon shield design sheet). The video was split into 1 fps frames and 30 fps clips, transcribed in four segments
by separate agents, and the sprite panels were judged frame by frame. This spike describes the workflow and its results,
challenges them, and tests whether anything should change in PixelDoll. A separate question from the owner is answered in
the second half: most practitioners use a cyan or blue mannequin, PixelDoll uses green first; is green wrong?

Labels: **Measured** (run here, offline or live), **Reported** (the other workflow's own claim), **Inferred** (our
reconstruction).

## Short answer

- **Keep green as the default key and keep the order green, magenta, blue, azure.** A live A/B (94 calls, 808 generations)
  and an offline census of 86 stored dressed keyframes found no default that is better overall. Blue-family keys collide
  with the most common fantasy materials (steel, silver, navy, denim, turquoise) and silently tinted or dropped them; green
  collides only with green gear, which the existing key switch already handles.
- **The A/B found one real green defect, and it has a qualified extraction fix.** Near-black item outlines drawn over the
  body come back tinted toward the mannequin's darkest shade, score as key and are removed. Blonde braids lost their outline
  in every walk frame. A one-condition change in `absorbOutline` recovers 98 % of those pixels offline with no gate flips and
  no halos. Implemented 2026-11-10 after two adversarial review rounds (section 3.5).
- **The other workflow converged on what PixelDoll already does** (one item per call on a bare keyed body). Its distinctive
  ideas (five flat mannequin tones, a darker "limb line", single-hue gear recolored later, a hide mask between pieces,
  code-placed rigid frames) were each tested or checked against prior evidence and rejected. One candidate (keep hands in
  front of lower-body garments) failed its pre-registered offline test.

## 1. The reviewed workflow

### 1.1 Pipeline (reconstructed)

| Stage | What it does | Basis |
| --- | --- | --- |
| Body | A finished body sheet (stand, walk 8, slash 6; front and side views) is frozen. Steps: body, skeleton ("see and fix joints and masks"), anchors ("mark the body parts"). | Reported, seen |
| Keyed body | The body sent for dressing is recolored to **five flat tones of one loud hue**: mid-blue `#40aae6` to `#25709b` (hue about 200, close to PixelDoll's azure 210) for one body, purple about `#927EF6`/`#7041EF` for another. Drawn lines become an in-between tone. | Reported, sampled from frames |
| Worn pieces | Earlier phases dressed a whole outfit and cut it into pieces; pieces "only held what was seen" (floating clasps, missing sleeves). Phase 2c paints **each piece alone** on the bare keyed body: one call per piece and view, 1 code-made reference frame plus 15 frames, 10 generations. | Reported |
| Reference frame | Built by code from the earlier outfit's standing frame: other pieces removed, hidden cloth extended along the limb, dark lines added at collar, cuff and ankle. | Reported |
| Palette lock | "Only the body's five tones plus the piece's own colors", likely `target_palette`. Frame-to-frame color change fell 4.7 % to 2.5 % (jerkin) and 11.1 % to 2.8 % (trousers). | Reported; endpoint inferred |
| Extraction | Delete the five body tones by exact color. | Reported |
| Hide mask | When mixing pieces from different outfits, switch off back-piece pixels that stick out within 3 px beside a front piece on body parts the front piece owns. | Reported |
| Limb line | A sixth, much darker tone in the body hue (`#004262`) traced between an arm and the body behind it, so the model does not "invent an arm". Built, never sent. | Reported |
| Rigid items (screenshot) | A 16-cell, 256 px design sheet on the **natural skin body** with a black and white mask per cell (white ovals around the forearm). Prompt: "colour it ONLY in green shades (#052108 ... #a0eea2) ... No skin tones, no brown, no red, no yellow on gear. The colours are changed later." "Pieces of this kind need no frame sheets": 80 of 104 frames come from design cells or exact copies. | Seen |

The rigid-item route uses the **gear** as the key (one forced hue on a skin body) instead of the body. With no further
generations, the remaining 80 frames can only be placed by code, which contradicts the report's own "nothing is moved by
code" (Inferred).

### 1.2 Results as reported

| Claim | Their badge | Their numbers |
| --- | --- | --- |
| A piece painted alone comes back whole | works | 2 pieces, 15 frames each, 10 generations per call |
| Whole pieces mix | works | bare body per frame 126-155 to 25-42 px and 92-150 to 12-33 px |
| Their own coverage rules | fails | 0/15 and 3/15 frames within 20 bare px; trousers over the 8 px limit on 9/15 frames; trousers over the hands 0-18 px per frame |
| Hide mask | works, small | of 662 "past" px on 240 frames, 534 were legitimate layering, 128 stuck out, 121 removed (0.5 px per frame) |
| Limb line | not tested | 0 generations left |
| Two hand-picked new mixes | reads as one outfit | 2-22 and 0-10 bare px, 14/15 and 15/15 frames |

### 1.3 What the video shows (visual review)

- **Good:** pieces painted alone are coherent, outlined, consistently shaded and sit on the body without offset; the cut
  pieces they replace were clearly broken (ragged fragments, a floating clasp, bare shoulders).
- **Bad:** bare thighs under the jerkin with knee plates and a bare belly strip under the furs; the trouser waistband sits
  2-12 px low; trouser pixels over the hands; stray key-colored specks at wrists and ankles; muddy pink hands; a teal tunic and
  green trousers too close in value to separate; in the mask grid one mix still shows the old strappy cut jerkin (2,040 bare
  px). The "fault" panel shows the blue mannequin bleeding into a red robe at the hip (a blue blob in the layer). The limb
  line on its target frame is 3 to 5 scattered dark pixels, unlikely to read as an arm.

### 1.4 Challenge of the claims

- **Small and post hoc.** Two pieces, one view, one seed, stills only ("nothing judged in motion since phase 1"). Both
  pre-written mix rules failed; the two passing mixes were chosen afterwards. The author overrode a failed trousers rule by
  reinterpretation.
- **The headline metric rewards an error.** "Bare body px" falls when anything covers skin, including trousers painted over
  hands.
- **The hide mask was tested on the old cut pieces,** not on the new whole pieces, and changed bare body on no frame.
- **Cost accounting is unreconciled** by the author's own admission (paid credit fell while the receipts said no paid use).

Full analysis: [workflow challenge](evidence/workflow-challenge.md).

## 2. Each idea against PixelDoll

| Idea | PixelDoll today | Verdict and evidence |
| --- | --- | --- |
| Paint each piece alone on a bare keyed body | Already the design (D3): "Add only {item}" on the keyed bare rest view (`app/src/lib/image/chroma.ts` `chromaPrompt`, `app/src/lib/items/items.ts`). | Same; PixelDoll never cuts pieces from an outfit, so their phase 1-2 failure does not occur. |
| Five flat mannequin tones | Continuous luminance ramp (`toChroma`). | **Reject.** Measured: five flat tones merge 21-34 % of local body edges on four bench bodies that the ramp keeps (matches the earlier conditioning study's 22-38 %). |
| Limb line (darker accent) | The ramp already keeps drawn arm lines. | **Reject.** Measured: bare forearm over shirt has a key step under 10 levels on 0 % of pairs (bodies A, B, C) and 1.7 % (N). Gate failures do not cluster on low-contrast frames (1 non-collision failure in 656 item-frames). |
| Single-hue gear, recolor later | Free item colors, measured key choice, exact palette-ramp recolor per material (`app/src/lib/dress/palette.ts`). | **Reject.** 14 of 27 labeled items in the dye study are multi-material; one hue bans leather, wood and gold. `target_palette` was tested before: 2 of 8 clips failed key gates and 6,257 color edges collapsed ([target palette](../deep-paperdoll-target-palette-2026-11-06.md)). |
| Hide mask beside front pieces | Slot z order, `tuck`, `baseCut`, `hides` (`app/src/lib/compose/compose.ts`). | **Reject.** 0.5 px per frame by their own numbers; most overlap is legitimate layering. |
| Natural-body design sheet with oval masks, code-placed frames | Every frame generated: skeleton posing, grid inpaint fallback with whole-cell masks. | **Reject the placement** (rigid placement was tried in the motion lab and rejected over the hand connection). A forearm-local inpaint mask for the grid fallback remains an untested idea (needs offline sizing, then a paid A/B). |
| Keep hands in front of lower-body garments | No hand protection for worn items. | **Failed pre-registered test** (below). |
| Cost | About 25 generations for a worn item in 5 views, idle and walk. | PixelDoll is about 2x cheaper per frame for worn items (pose calls are billed per call, theirs per 16 frames). Theirs is cheaper for rigid items only because 80 % of frames are not generated. |

### Hand protection test (Measured, offline)

Rule: a base pixel that is hand skin (past the wrist keypoint along the elbow-to-wrist line) may not be covered by a
legs, waist, feet, inner-torso or front-view cape layer. Pre-registered pass: at least 90 % of flagged pixels are real
paint-over and no sleeve, glove, gauntlet, grip or back-view cape pixel is removed. On 1,486 stored cells the rule as stated
flagged 1,889 px, of which 2.3 % were paint-over (back-view capes 1,563, grips 74, gauntlets 64, sleeves 50). With all
refinements precision reached 60-66 %. The real problem is also small: 43 paint-over px across all cells, at most 8 in one
frame. No stored fixture has trousers, so the other workflow's exact case is unmeasured. [Hand-front results](evidence/hand-front.md).

## 3. Green, cyan or blue?

Summary below; the durable reference for future key tests is [chroma-key.md](chroma-key.md).

### 3.1 Why the question is fair

Green was inherited from the first chroma spike and never A/B-tested as the default; blue (D19) and azure (D21) were added
only as collision fallbacks. Cyan is near the complement of skin, leather, wood and gold, which is the usual argument for it.
The other workflow's mannequin is a mid-blue at hue about 200, which is close to PixelDoll's azure.

### 3.2 Offline census (Measured)

86 dressed keyframe sets from earlier campaigns, compared with the rest base they were dressed on (82,915 item px, 9 bodies);
plus synthetic material ramps. "Lost" means an item pixel scores as key (`keyScore` at least 35) and is removed silently.

| Key (hue) | Ordinary items, px lost | Color-test items, px lost | Materials it destroys |
| --- | ---: | ---: | --- |
| green (120) | upper bound 1.44 % (own items) | 37.8 % | emerald, forest, lime |
| cyan (180) | 0.21 % | 25.3 % | turquoise, sky, ice, most emerald shades, dark teal outlines |
| azure (210) | 0 % | 1.8 % | denim, royal blue, sky, ice, navy, dark navy outlines |
| blue (240) | 0.10 % | 1.7 % | navy, denim, royal blue, sky, blue-black, dark navy outlines |
| magenta (300) | 0 % | 11.3 % | purple |

Every warm material (skin, hair, leather, wood, gold, olive, khaki) scores 0 on green; olive and khaki do not bleed into the
green key. Cyan's one measured advantage: warm colors half-blended with the key are lost in 19 of 57 cases on green and 5 of
57 on cyan. Bias: the ordinary items were generated on green with "no bright green" wording and skew red, brown and steel.
[Key census](evidence/key-census.md).

### 3.3 Live A/B (Measured)

Production dress and pose builders; cyan is the green ramp hue-rotated +60 degrees, scored in the rotated frame (the same
method that qualified azure). Body A (64 px, 3 views) with seeds 7 and 11, body B (80 px elf, 5 views) for four items, and
walk poses for three items, green against cyan. Ten items: steel great helm, leather boots, red hooded cloak, gold crown with
fur, blonde braids, tan jerkin, silver plate, khaki hood, and two deliberate collisions (turquoise gem amulet, navy tunic).
94 calls, 92 charged, **808 generations**; 13 walk jobs outlived the client poll and were recovered by GET only, 2 were refused
with 429 and not resent. Decision rule written before spending: a key replaces green only if it is at least as good on hard
fails and the G2 and G3 gates on both bodies, better on at least one failure mode, and adds no defect on common materials.

| | green | cyan | azure | blue |
| --- | --- | --- | --- | --- |
| Hard fails (non-colliding items) | 0 | 0 | 0 | 0 |
| G2 key kept, mean | 0.994-0.998 | 0.994-0.998 | 0.994-0.998 | 0.994-0.998 |
| Lost dark outline (braids, plate, jerkin) | yes, every hair walk frame | no | no | plate |
| Steel and silver | clean | key-leaning (helm 0.65, plate 0.49 of px), one helm kept a teal tint | despill flattened blue-gray steel to warm gray (817 px rewritten) | key-leaning |
| Red cloak | clean | muddy, desaturated in dress and all 8 north walk frames | best | turned purple |
| Turquoise gem (collision control) | kept | **not drawn at all**, no gate fired | kept | kept |
| Navy tunic (collision control) | clean | survives, fully tinted | mostly lost, no hard fail | empty, hard fail |

Cyan failed the rule: no hard-fail advantage, a new defect on steel, and silent omissions no gate catches. An independent
reviewer, who judged the sheets before reading any conclusion, agreed (about 80 % confidence). The reviewer also found the
A/B's "lost px" metric biased toward cyan and azure (it ignored dark navy or teal outlines lost within 40 of their ramps) and
that steel is drawn blue-gray on every key, so blue-family keys collide with the most common fantasy material regardless of
the mannequin. [Live A/B](evidence/live-key-ab.md) · [independent review](evidence/key-independent-review.md).

### 3.4 Why practitioners pick cyan or blue, and why it does not transfer

Practitioners recolor the mannequin or the human body itself to cyan or blue, as PixelDoll does with green. The differences
that plausibly explain their preference: they flatten the body to a few bright tones (or key only the skin), they have no
measured key switch, so avoiding common green gear matters more, and their content is mostly warm. Cool keys still sit next to
steel, which the model draws blue-gray on every mannequin. The full reasoning, every number and the open questions are in the
[chroma key reference](chroma-key.md).

### 3.5 The green outline defect and its fix (Measured, offline)

Root cause: of 380 pixels lost in the A/B, 378 lie inside the base silhouette and 328 are darker than the key ramp's darkest
shade, e.g. (4,19,0). They score 72-94 (threshold 35), so they never enter the item mask. `absorbOutline` keeps dark key
pixels only off the body, or inside the item with at least 5 of 8 item neighbors; a one-pixel outline over the body has 2-4.
The model almost never darkens the bare mannequin by itself (6 such pixels in 356 cells, all at least 3 px from any item).

Proposed rule: also keep a key-scored pixel that touches the item, is more than 40 per channel from the key ramp and is darker
than the key's own darkest shade. Pre-registered pass: recover at least 80 % of the confirmed lost outline, wrongly keep at most
1 px per cell, no halo, no G2 or G3 flip.

| Check | Result |
| --- | --- |
| Braids and plate outline recovered | 315 of 321 (98.1 %): walk 248/248, dress braids 28/30, plate 27/27 (green) and 11/11 (blue) |
| Wrongly kept | at most 0.83 px per cell if every added px were wrong; about 0.05 judged on sheets |
| Halos | none on inspected sheets |
| Gates | no G2 or G3 flips; one bench metric moved (b-tunic area CV 0.122 to 0.110) |
| Stored corpus (693 cells) | pixels added only on one magenta tunic, all tunic outline gaps |

A looser variant (any color far from the key) also kept mid-tone green blends on an elf ear and was rejected. Production
needs the darkest shade per key (the prototype used green's for every key), unit tests for the kept, dropped and blend
cases, a regenerated bench report, and a rerun of the multi-tone skin set. [Outline recovery](evidence/outline-recovery.md).

## 4. Recommendations

1. **Keep green as the default and the current order.** No change to `KEYS`.
2. **Fix the dark outline loss in `absorbOutline`.** Done 2026-11-10 after two adversarial review rounds, which added a
   per-cell guard for keys whose mannequin outline uses the same shade (magenta); see the
   [chroma key reference](chroma-key.md#the-green-outline-defect).
3. **Fix the evaluation before any further key A/B:** count every dropped dark pixel next to the item regardless of ramp
   distance, and add a hue-accuracy check for saturated colors (the cyan and blue cloak defects escaped every metric).
4. **Do not adopt** five-tone mannequins, the limb line, single-hue gear, the hide mask, code-placed rigid frames or hand
   protection as tested.
5. **Open, low priority:** a trousers fixture (about 10-25 generations) would measure the hands-under-trousers case the hand
   rule could not; a forearm-local inpaint mask for held-item repairs needs offline sizing first.

## Spend and limits

- Live: 808 generations on the agent account through the owner's local API server (balance 18,931 before, 18,123.1 after).
  The local server may not match production behavior exactly.
- Samples are small: two seeds on body A, one on body B, ten items, partial walks. Seed-to-seed design variance (pauldrons,
  braids in north views) often exceeded the key effect.
- The other workflow's numbers come from its own report as recorded on video; compression and a scanline overlay limit pixel
  judgments; its endpoints and palette lock are inferred.

## Files

- [chroma-key.md](chroma-key.md): the chroma key reference (history, both tests, metric traps, open questions, how to rerun).
- [evidence/](evidence/): workflow challenge, key census, live A/B results, independent review, outline recovery, hand
  results.
- [scripts/](scripts/): offline probes (import production code read-only; set `OUT_DIR` for sheets). The live arm is
  `spikes/api/c25/arm_y.mts` with `eval_y.mts`, `y_env.mts` (resolves the agent key in memory and redirects only that
  process to the local API) and `y_recover.mts` (GET-only recovery); outputs stay local in `spikes/api/out/chroma-2026-11-09/`.
