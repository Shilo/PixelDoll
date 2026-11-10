# R1 (hands in front of worn layers) and R2 (arm-over-torso contrast): offline results

Offline only: no PixelLab calls, no edits under app/. All numbers come from production extraction and cleanup (`extractCell`, `postProcess`, `bench.ts runCase`) on stored outputs.

- Probe: `scratchpad/challenge/hand-front.mts` (run from `spikes/api`: `node <path>/hand-front.mts`)
- Labels: `classify.mjs`
- R2 analysis: `r2.mjs`
- Outputs: `scratchpad/challenge/hand-front/`

Full folder: `C:\Users\shilo\AppData\Local\Temp\claude\3e36a31a6db31790\806aabfd-915a-4044-9476-eb6ba17928f5\scratchpad\challenge\`.

Caveat: another process was writing new `chroma-2026-11-09/Y` outputs while I worked, so the corpus grew between runs (1,438, then 1,486 cells). The tables below come from the last run. The only new candidates were back-view cloak pixels, which are legitimate.

## Corpus

| Source | Body | What | Cells |
| --- | --- | --- | ---: |
| `app/test/fixtures/bench` (20 cases, `runCase`) | A, B, C, N | rest plus walk/slash, every slot incl. held | 757 |
| `spikes/api/out/chroma-2026-11-09/Y/A` | A | dress keyframes S/E/N, 10 items, green/azure/blue | about 100 (growing) |
| `spikes/api/out/c25/P`, `c25b/A` | A | S4 boots, cape, chest, helmet, hair posed slash/walk E/N (ctrl/look/verb, seeds 7, 11, 13) | 416 |
| `spikes/api/out/c25c/S/tabard` | A | dress s7/s11 plus walk S/E/N | 30 |
| `spikes/api/out/c25b/E/robe` | A | ea and traw dress, rest S/E/N | 12 |
| `app/test/fixtures/helmet-occlusion.json` | b14 Ranger | 4 slash helmet cells | 4 |

Not usable:

- `app/public/fixtures/s2` (the demo project, with torso_inner vest and cape) stores no keypoints: its animations are template animations.
- There is still **no legs, waist or torso_inner fixture with keypoints**. The trousers case from the other workflow cannot be measured; the third-party ComfyUI "pants" sample has no rig.

## Hand definition (implemented)

A hand pixel is any base pixel that passes all four tests below, for either wrist:

- **Skin:** opaque, not a garment gray (`isGarment`), and luminance at least 0.25 (outline pixels excluded).
- **Near the wrist:** within R = max(3, round(4N/64)) px of the wrist keypoint (`LEFT ARM` or `RIGHT ARM`, normalized in `rig.rest[d].keypoints` or `rig.animations[].sources[d].keypoints[i]`). N is the cell size: R is 4 at 64 px, 5 at 80 px and 8 at 128 px.
- **Distal:** past the wrist along the elbow-to-wrist direction, with 1 px of slack.
- **Nearest bone:** closer to the hand bone than to the leg bones, the neck-to-nose bone or the other upper arm. Skin bones only: the torso is shirt gray.
- **Connected:** inside a 4-connected piece that reaches within R/2 of the wrist.

Result: every one of the 1,486 cells has hand pixels, about 4.7 px per hand at 64 px. The cyan column on each sheet shows the mask.

One known flaw: on the bald bodies, a fist raised over the head merges with scalp skin. The mask then includes scalp, which is why the head and hair rows are labeled ambiguous.

## R1 results

Candidate = hand pixel ∩ item layer alpha. Each sheet row has five columns: base, hand mask, item layer, composite, candidates in magenta. Row lists: `hand-front/cand-index.txt` (per-item sheets) and `hand-front/front-index.txt` (`front_0..3.png`: every non-back-view, non-held candidate at 6x). Per-cell labels are in `hand-front/labels.json`.

### Rule as stated (every slot, every view)

203 of 1,486 cells, 1,889 candidate px. **Precision 2.3 %** (43 paint-over, 1,758 legitimate, 88 ambiguous). **FAIL.**

| Label | Px | Cells | Items | Sheets |
| --- | ---: | ---: | --- | --- |
| legit: back-view cape covers the hands | 1,563 | 103 | a-cape, b-cloak, n-cloak128, Y cloak, c25/c25b cape | `bench__n-cloak128.png`, `bench__b-cloak.png`, `c25*__cape.*.png` |
| legit: held grip | 74 | 35 | a-sword96, a-axe96 | `bench__a-axe96.png`, `bench__a-sword96.png` |
| legit: gauntlet / plate sleeve | 64 | 18 | tabard "over steel plate armor" | `c25c__tabard.s7.png`, `front_2/3.png` |
| ambiguous: raised fist vs bald scalp under a helmet or hair | 62 | 10 | c25/c25b helmet, hair (slash/east/2) | `front_1/2.png` |
| legit: robe sleeve cuff | 50 | 8 | robe ea/traw | `c25b__robe.*.png`, `front_3.png` |
| **paint-over: cape edge over a hanging hand (S)** | 32 | 11 | a-cape, b-cloak, n-cloak128 | `front_0/1.png` |
| ambiguous: tunic in 3/4 view (far hand may be behind) | 15 | 6 | b-tunic SE/NE | `bench__b-tunic.png` |
| ambiguous: cloak in side/3/4 view, near or far hand unclear | 11 | 4 | b-cloak | `front_0/1.png` |
| legit: far hand behind cloak (E) | 7 | 1 | n-cloak128 walk/east/2 | `front_1.png` |
| **paint-over: tunic edge over a hanging hand (S)** | 5 | 2 | b-tunic | `front_0.png` |
| **paint-over: cloak over the near hand (E)** | 3 | 2 | n-cloak128 | `front_1.png` |
| **paint-over: vest over a hand (back view, arm across the back)** | 3 | 3 | c25 chest | `c25__chest.*.png` |

Precision per slot class:

| Slot | Paint-over | Legit | Ambiguous | Precision |
| --- | ---: | ---: | ---: | ---: |
| back | 35 | 1,570 | 11 | 2 % |
| torso_outer | 8 | 114 | 15 | 6 % |
| main_hand | 0 | 74 | 0 | 0 % |
| head / hair | 0 | 0 | 62 | n/a |
| feet (156 cells) | 0 candidates | | | n/a |
| neck | 0 candidates | | | n/a |

### Refinement (pre-registered, applied once)

| Variant | Px | Paint-over | Legit | Ambiguous | Precision | Legit px removed |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| 1+2: exclude held/arms slots, exclude back views (north, NE, NW) | 173 | 40 | 52 | 81 | 23 % | 23 gauntlet, 22 sleeve, 7 far hand |
| 1+2+3: also require the hand px to lie outside the item's dressed keyframe layer (posed cells only) | 48 | 29 | 13 | 6 | **60 %** | 12 gauntlet, 1 far hand |
| R1 slot list only (legs, waist, feet, torso_inner, back outside back views) | 53 | 35 | 7 | 11 | 66 % | 7 far hand behind cloak |

**Verdict R1: FAIL on the pre-registered rule.** No variant reaches 90 %, and every variant except the slot-restricted one removes gauntlet or sleeve pixels.

**Size of the real problem in this corpus:** 43 paint-over px over 1,486 cells, at most 8 px in one frame (n-cloak128 walk/south/5, 128 px cell). Almost all of it is 1 to 3 px of a cape or tunic edge on the inner side of a hanging hand in the south view. Boots never touched a hand (0 of 156 feet cells).

**Recall:** cannot be measured. There is no fixture where a lower-body garment is painted over a hand. Within the mask, recall is 100 % by construction; outside it, a misplaced wrist keypoint can miss the hand. Not quantified.

**What would be needed:** protection limited to back-slot items in front and side views (the only group with a real error, at 66 to 86 %), plus a near/far-hand test for side and 3/4 views. Nothing here justifies it before a legs, waist or torso_inner fixture exists. The trousers question is still open.

### Where the rule would live and what it costs

- **Not in compose alone.** `composeCell` (`app/src/lib/compose/compose.ts:451-472`) could re-draw base hand px after protected layers. The precedent is `cutBodyLayer` (`compose.ts:171-189`), applied at `compose.ts:467-468`. But exports ship per-layer sheets and "engines swap sheets, they never mask" (`compose.ts:81`). A compose-only rule would fix the preview and baked composites, not engine output.
- **The correct place is extraction cleanup:** `postProcess` (`app/src/lib/items/items.ts:1423-1446`), next to `trimToKeyframe` / `dropOffBody`. It has each cell's keypoints (`cellKeypoints`, `items.ts:425`) and the base frame. It should clear the pixels and report the count as a review warning, because the project's "surface errors" rule rules out silent removal. `splitFgBg` (`compose/split.ts:17`) then needs nothing new.
- **Cost:** O(R²) per hand plus a few segment distances, about 100 px tests per hand at 64 px. The whole probe (1,486 cells including production extraction, cleanup and sheet rendering) ran in about 6 s on one core. No generations, no storage beyond the warning.

## R2: arm-over-torso contrast in the keyed input

Method:

- Frames: posed east, south-east and north-east frames with keypoints. That is 56 unique body frames on bodies A, B, C and N, or 680 item-frames.
- Pixels: arm px lie within 1.6N/64 of the shoulder-elbow or elbow-wrist bones and inside the torso band (0.14N around neck to mid-hip). Torso px are the other px in that band.
- Contrast: green step of `toChroma(base, 'green')` across each 4-adjacent arm/torso pair, compared with a five-tone quantization of the same frame's luminance range.

| Body | Frames | Pairs | Median step p10 / p50 | Pairs with step < 10 | Merged by five tones | Bare forearm on shirt: step < 10 | Bare forearm on shirt: merged by five tones |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| A | 16 | 790 | 25 / 38 | 32.3 % | 39.4 % | 0.0 % (190 pairs) | 0.5 % |
| B | 24 | 1,729 | 31 / 43 | 20.5 % | 33.3 % | 0.0 % (242) | 1.7 % |
| C | 8 | 600 | 15 / 27 | 34.2 % | 51.3 % | 0.0 % (54) | 0.0 % |
| N | 8 | 1,087 | 16 / 22 | 32.1 % | 47.4 % | 1.7 % (119) | 13.4 % |

- The low-step pairs are sleeve-on-shirt: the same gray garment, the "arm invented on the torso" case.
- Where a **bare forearm** crosses the shirt, PixelDoll's continuous ramp keeps a step of at least 10 green levels on 100 % of the pairs for A, B and C, and on 98 % for N.
- Five flat tones would merge 0.5 to 13 % of those same boundaries.

**Failure correlation:**

- Per-cell production gates G2 (`g2Fails`) and G3 (`keyOutside > GATES.keyOutsidePosed`) fail on only 25 of 680 item-frames.
- 24 of the 25 are `b-jester`, a known key-collision case that fails on every frame regardless of contrast. The other one is `tabard.s7 walk/east/6`.
- Excluding b-jester leaves 1 failure in 656 item-frames, too few to correlate.
- Raw numbers: failure rate 0.3 % on low-contrast frames (at least 30 % of pairs under 10) and 7.1 % on the others. r(low-step share, fail) = -0.20, driven entirely by b-jester sitting on the higher-contrast body B. r(median step, fail) = 0.01. r(low-step share, key px lost) = -0.01.
- Recorded failures with frame ids in docs and out logs (for example "G3 walk/east/7" x13) do not name the body or item consistently, so I did not join them.

**Verdict R2: no correlation (kill).** The keyed input already separates a bare forearm from the torso, and the few gate failures in stored frames have known causes unrelated to contrast. A limb accent is not justified.
