# Chroma default key: adversarial review (2026-11-09)

Reviewer: independent, read-only. Evidence: arm Y sheets and raw frames in `spikes/api/out/chroma-2026-11-09/Y`, `spikes/api/c25/arm_y.mts`, `eval_y.mts`, `y_env.mts`, `hue.mts`, `app/src/lib/image/chroma.ts`, then RESULTS.md, eval.md, the offline census and PLAN D3/D19/D21/D23.

## Sheet layout (confirmed from eval_y.mts)

Body A sheets: 7 rows = seed 7 green, cyan, azure, blue, then seed 11 green, cyan, azure (blue has no seed 11 row). 12 columns = 4 groups of S/E/N: input mannequin, raw dressed output, layer recomposed on the real body, key heatmap (orange = item px with any weak key score in the key's frame). Body B: seed 7 green, cyan, azure. Walk sheets: rows S/E/N, 8 frames, layer on the real body. Note: in this harness "azure" (hue 210) is the mid blue closest to the third-party #40aae6 (hue 200) mannequin; "blue" is the deep indigo production key.

## Step 1: my own visual findings (before reading conclusions)

| item | green | cyan | azure | blue (s7 only) |
|---|---|---|---|---|
| steel helm | crisp both seeds | fine | s11: blue-gray steel despilled to flat warm gray, highlight lost, lower-right dark outline gone, skin px under helm in N | fine |
| silver plate | fine; s11 back dark (design variance) | fine, slightly bluish | s7 dull dark gray (not "polished silver") | front loses side outlines, reads as a gray shirt |
| red cloak | dark green fold/outline px in N view; recomposed back has small gray holes; walk N has a gray hole every frame | s7: cloak muddy desaturated rose-brown in N, in dress and all 8 walk N frames | clean, best of the four | cloak turned purple/maroon |
| blonde braids | braid outlines lost on chest (dress) and broken/dashed in every walk S frame | braid outlines kept but drawn dark olive; N view braids omitted (s7, s11) | N view braids collapsed (s11), long blob (s7) | outlines kept, darker brown |
| tan jerkin | s11: side outlines missing (flat edge) | fine | fine | fine |
| boots, crown, khaki hood | clean | clean | clean | clean |
| navy tunic (control) | clean | survives, tinted | mostly eaten silently | empty layer |
| turquoise amulet (control) | kept | gem not drawn | kept | kept |

Summary: green has one recurring defect (dark item outlines tinted toward the darkest green get keyed out: braids, cloak folds, some edges). The blue-family keys have a different and more varied set: hue contamination of saturated colors (cyan cloak muddy, blue cloak purple, olive braid outlines on cyan), despill damage on cool steel (azure), and blue-family outline loss (blue plate, azure helm). Design variance between seeds (braids in N, pauldrons, dark vs light plate back) is larger than most key effects; body B green hair N lost its braids while cyan/azure kept them, the reverse of body A.

## Does the evaluation measure what it claims?

1. **"Lost px" is structurally biased toward cyan and azure.** It counts dropped key px only if more than 40 per channel from the key ramp. Green's lost outlines are near-black green (4,19,0), 41 from the green ramp floor (0,60,0), so they count. Azure's ramp floor is about (0,30,60) and cyan's (0,60,60): dark navy or teal outlines lost on those keys sit within 40 and are not counted. I saw azure s11 helm outline loss and blue s7 plate outline loss that the metric reports as 0 and 11. The headline "lost px 18 vs 80" is therefore not a fair comparison. It also counts any off-ramp key px over the body, which can be mannequin redraw rather than item loss (here the braid case is real; I checked).
2. **Steel "key-leaning" is not the model drifting toward the mannequin.** Mean near-gray helm color on the raw outputs: green s7 113,127,138 (B minus R 24), azure 20 to 24, blue 25 to 27, cyan 17 to 35. PixelLab steel is natively cool on every key, including green. The metric measures that steel's native hue overlaps the blue family. That makes the finding stronger, not weaker: blue-family defaults collide with the most common fantasy material on every run, and production despill then rewrites it (azure helm 817 px despilled, visibly flattened).
3. **Drift is not comparable across keys.** It is measured after rotating into the key's frame, so a brown (hue 30) maps to very different excesses in each frame; the large negative values on cyan/azure for leather items are a frame artifact, not a quality signal.
4. **No metric for hue fidelity of saturated colors.** The cyan cloak desaturation and the purple blue cloak are absent from the tables and the RESULTS prose ("warm materials are clean on every key" is wrong for the cloak).
5. **Stage 2 dropping blue** was ranked on lost px 11 vs 0 and 1: noise-level numbers on a biased metric. The drop is still defensible on visible grounds (purple cloak, darkest ramp, navy collision), but not for the stated reason.
6. **G3 sum as the cyan blocker** (body B 0.046 vs 0.020, every view under the per-view gate) is hair-splitting; I would not rest the decision on it.
7. **Confounds:** n = 2 seeds on body A, 1 on body B, 10 items, 1 seed for walks with 2 missing directions; calls went to the owner's local API server (`y_env.mts`), not necessarily production; cyan is a harness rotation (equivalent math, but OUTLINE and despill rules were tuned on green only, so a shipped cyan would need retuning); the key name is in the prompt for every arm equally, so that is not a bias between arms.

## Step 2: agreement with the prior verdict

I agree with "keep green", but for partly different reasons and with higher confidence than "moderate". The RESULTS rule-based case for cyan is weaker than it reads (biased lost metric), and its case against cyan undercounts cyan's visible problems (cloak, olive outlines, omitted gem, omitted braids). The census independently shows ordinary requested gear is about 89 % warm hues (reds, browns, golds) plus cool steel, and that the model tints darks toward whatever key it sees (key-following outlines), so on a blue-family mannequin dark outlines become navy/teal, exactly the zone the blue family keys out. I disagree with the census only in that its sample is green-generated and prompt-skewed; neither source knows real user color demand (PixelDoll has no telemetry).

## Strongest argument for switching

Green's one defect is systematic and visible in motion: dark outlines of items laid over the body are keyed out (broken braid outlines in every walk frame, cloak holes). A complementary-ish mid blue (hue 200 to 210) produced the cleanest red cloak and kept braid outlines, practitioners use it, and the census shows warm/key edge blends are lost far less on cyan (5 of 57) than green (19 of 57).

## Strongest argument against

Blue-family keys collide with materials users ask for constantly: steel and silver (natively blue-gray, despill-damaged on azure), navy, denim, royal blue, sky, ice, turquoise. They also cause hue contamination of saturated colors that no gate catches (cyan cloak, blue cloak), and the model tints outlines toward them where they score as key. Green collides mainly with green, which the prompt router already sends away. Switching cost is also real: about 50 `'green'` literals in `app/src`, green-only OUTLINE redraw guard and despill rules, around 30 unit test files, e2e specs, the demo fixture, plus a new production key (cyan does not exist in `KEYS`).

## Recommendation

1. Keep green as the default and keep the order. Confidence: about 80 %.
2. Fix green's outline defect in extraction (offline, no generations): in `absorbOutline` (or a sibling pass), a key-scored px darker than the cell's ramp floor (keyLum well below the toChroma minimum) that touches item px and continues an item edge is item, not mannequin. The current n >= 5 neighbor rule misses 1 px outlines on an item's border. Prove it on the stored `Y/A/hair/green_walk_*` and `Y/A/{plate,jerkin,cloak}/green_dress_*` frames, and check for false positives on the census sets (olive redraw px) and the LPC fairness set. Do not reuse the 40-per-channel threshold, which only barely catches (4,19,0).
3. Fix the evaluation before any further A/B: count all dropped dark px adjacent to item px regardless of ramp distance, add a hue-fidelity metric for saturated item px (requested hue vs output), and score steel against its native hue on a neutral reference.
4. Optional, cheap: test offline whether azure should precede magenta as the first fallback for green-only items (census color-test loss azure 1.8 % vs magenta 11.3 %, but that set is biased against magenta by construction). No new hair or steel-specific fallback is warranted: hair failed on green only through the outline defect that item 2 fixes, and steel is exactly where blue-family keys are worst.
