# Paper-doll implementation challenge

Reviewed commit: **e76b3c606714f4fba5b04807159dae13e5c2a882**, detached in `C:/Programming_Files/Shilocity/PixelLab/PixelDoll-codex-review`. Review date: October 25, 2026.

No PixelLab requests, including balance requests, were made. No live generations, agent server, credential files, or `.env` were used. No tracked implementation, test, configuration, or benchmark files were changed. This report is the only deliverable added to the repository. Scratch programs and their JSON results are in `C:/Users/shilo/AppData/Local/Temp/`; they import the review worktree, not the working main checkout. All source references below are at the reviewed commit.

The architecture remains defensible: frozen body frames, a keyed stand-in, one dressed reference per direction, and stored skeleton poses address real limitations of composite-only generation. The strongest remaining problems are false-clean QA, loss of occlusion metadata during reuse, and mirrored export parity. Passing the current benchmark does not establish correctness in those areas.

## 1. Findings

### F1. Normal item QA measures palette identity against the first pose call, not the dressed design

**Severity: high.** Sources: `app/src/lib/items/items.ts:694`, `app/src/lib/items/items.ts:710`, `app/src/lib/items/run.ts:362`, `app/src/lib/items/run.ts:483`. Related existing solution: `app/src/lib/equipment/generate.ts:181`.

**Failure:** dress red boots, then let every posed frame redraw them blue. The ordinary runner passes only animation cells to `itemQa`; `designColors(cells)` selects the lowest-numbered *pose* call. That call measures itself at zero distance, and subsequent calls with the same wrong blue also score zero. H4 explicitly excludes feet and legs. The same weakness applies when an accepted item gets a uniformly recolored new move.

**Evidence:** `pixeldoll-challenge-palette.mjs` constructs a red dressed boot reference and eight identical blue boot frames, then runs extraction, post-processing, `itemQa`, and `dirGate`. Result:

```json
{"status":"pass","reportedPaletteDistance":0,"actualDistanceToDressedKeyframe":160,"fails":[],"warnings":[]}
```

This is a synthetic counterexample, not a measured generation failure rate. It does prove that the claimed design lock cannot catch a whole-clip palette replacement. Fitting already performs the missing comparison against approved per-direction rest palettes, with a comment describing exactly this problem.

**Suggested fix:** share the approved-reference palette comparison already used by fitting with ordinary item generation, move additions, and grid repairs. Preserve per-direction comparisons and the existing policy distinction between retryable failures and review warnings. Avoid another parallel implementation. Add the red-reference/blue-clip regression and a real stored uniformly drifting clip when available.

**Confidence: high** in the failure and root cause; frequency on live output is unmeasured.

### F2. Large-item baseline estimates ignore the measured dress-price tiers

**Severity: medium.** Sources: `app/src/lib/items/items.ts:183`, especially `:185`; `app/src/studio/itemRoute.ts:36`; `app/src/studio/apiPlans.ts:65`. Price evidence: `docs/research/generation-quality-round2-2026-10-25.md:54` and the stored arm-N records.

**Failure:** `planGens` returns 10 for every edit/dress call regardless of canvas size. The campaign measured 15 gens for a 160 px dress and 25 for a 192 px held dress. These are missing baseline costs, before any optional retry or dollar billing.

**Evidence:** `pixeldoll-challenge-plan.mjs` calls the actual Studio `chromaEdit.plan` on the frozen body-N rig, with three drawn directions and one eight-frame walk:

| Case | Displayed baseline | Baseline using stored dress charges | Missing |
|---|---:|---:|---:|
| Worn item, 160 px | 19 | 24 | 5 gens |
| Held item, 192 px | 19 | 34 | 15 gens |

The held baseline is understated by 44% of the observed-price baseline. Exact future billing remains a provider decision.

**Suggested fix:** use one maintained edit-price estimator with canvas dimensions, shared by the Make button, API explanation, and retry estimates. Keep the explicit notice that estimates are not caps. Cover the measured 160/192 px cases in a pure planner test.

**Confidence: high.** An earlier scratch comparison omitted `slot` and falsely suggested a missing dress call. That claim was rejected: the real Studio caller includes `slot` through `s`. Body B correctly plans seven calls and 35 gens for its five-view, 112 px held case.

### F3. An exact free copy loses the source item's body cuts

**Severity: medium.** Sources: `app/src/lib/equipment/copy.ts:39`, `app/src/lib/equipment/compatibility.ts:42`, `app/src/lib/equipment/compatibility.ts:70`.

**Failure:** save a hood design whose `baseCut` hides an ear, then copy it onto the exact same frozen body frame. `prepareCopy` deletes the entire cut map before remapping layer cells. The copied artwork is identical, but the ear returns. This affects newly made round-3 items too; it is broader than the documented limitation for old items made before `baseCut` existed.

**Evidence:** `pixeldoll-challenge-copy.mjs` uses `createDesign`, `prepareCopy`, and `composeCell` on an in-memory valid 64 px project. It reports an exact `idle/south/0` → `idle/south/0` match, source ear alpha **0**, copied ear alpha **255**, and copied cut **null**. Assessment warnings discuss missing standing references/camera/setup, not the lost body occlusion.

**Suggested fix:** remap cuts through the same proven source/target frame matches as the artwork, using mirrored source cuts when appropriate. Include the cut in compatibility signatures: two equal layer rasters with different body cuts are not equivalent paper-doll assets. When a cut cannot be proved, disclose that specific loss rather than silently claiming an exact appearance copy.

**Confidence: high.** Clearing a cut is correct for an arbitrary new fit; it is unnecessarily destructive for a proved identical raster/geometry copy.

### F4. Tucking does not commute with mirroring; exported west pixels can differ from Studio

**Severity: medium.** Sources: `app/src/lib/compose/compose.ts:89`, `:90`, and the baked-variant loop in `withTuckVariants` beginning at `:104`. Contract: `docs/manifest-spec.md:270`.

**Failure:** a cover has separated occupied columns with different brim heights. The left-to-right fill assigns every interior empty column the left brim. The backward pass only fills still-empty columns, so this is not the documented nearest-covered-column rule. Mirroring first chooses the opposite brim. Studio dynamically tucks mirrored cells; exports bake the source tuck and mirror that result.

**Evidence:** the small direct test in `pixeldoll-challenge-repro.mjs` finds six differing alpha pixels. `pixeldoll-challenge-tuck-export.mjs` scales the geometry into a valid 64 px project, equips hair and a two-part cover, and calls **all six export builders**. Export returns no errors or warnings. Comparing the original Studio compositor with `baked/default/idle.png` gives **east: 0 differences; west: 6 differences**. This is an output discrepancy, not merely a disagreement about preferred hair styling.

**Suggested fix:** compute distances to the original occupied cover columns in both directions, with a reflection-symmetric tie rule. Alternatively bake each direction using exactly the preview rule, but fix the nearest-column contract as well. Test disjoint covers, unequal brim heights, internal gaps, and equidistant columns through preview and export.

**Confidence: high.** A solid contiguous brim does not exercise this failure, which explains why existing tuck cases pass.

### F5. An explicitly named, ordinary hue can be completely removed with a clean QA result

**Severity: medium.** Sources: `app/src/lib/image/chroma.ts:36`, `:51`; `app/src/lib/items/items.ts:606`, `:764`.

**Failure:** the prompt is `a chartreuse tunic with gold trim`. `pickKey` chooses green because its vocabulary omits chartreuse. RGB `(127,255,0)` scores **50**, above KT 35. A gold-trimmed chartreuse tunic can therefore become gold trim alone. The remaining item has stable nonzero area; body-key preservation is excellent because the deleted fabric is interpreted as mannequin.

**Evidence:** `pixeldoll-challenge-repro.mjs` sends a synthetic composite with **240 chartreuse fabric pixels** and **32 gold pixels** through the production extractor and QA. All 240 chartreuse pixels disappear; the 32 gold pixels survive; status is `pass`, with no failures or warnings. This is a deterministic extraction counterexample, not proof of how the model would obey that exact prompt.

The documented all-keys collision description is also too narrow: `a teal and purple tunic` blocks **all four** keys using the current word lists and falls back to magenta. Four separately named color families are not required. Renaming a color does not inherently make its generated RGB safe.

**Suggested fix:** add clear missing collision words such as chartreuse, with measured RGB/ramp tests. Treat vocabulary as a heuristic, not a guarantee. Known reference-image colors can use the existing palette-based `fitKey` approach. When every candidate is blocked, expose that fact before generation instead of silently presenting a normal safe-key path. Unknown or unnamed colors still require visual review; do not claim a general automatic collision detector from this example.

**Confidence: high** for the counterexamples; medium for the benefit of any particular vocabulary expansion on live outputs.

### F6. Total-silhouette registration can move an already aligned item and then report perfect registration

**Severity: medium.** Sources: `app/src/lib/items/items.ts:532`, `:562`, `:563`, `:590`.

**Failure:** registration scores the alpha of the *whole dressed composite*, including item geometry and erased mannequin pixels. It can interpret an asymmetric erasure plus an item extension as a global body translation. Every item pixel then moves, although its original location was correct.

**Evidence:** the `registration` case in `pixeldoll-challenge-repro.mjs` starts with a body rectangle at x=20–31, y=12–51. The returned mannequin loses only its leftmost column; an aligned item occupies x=32–35. Extraction changes the item's minimum x from **32 to 31**, reports offset `[-1,0]`, `shifted:false`, and `keyKept:1`. The posed tolerance conceals the remaining body discrepancy. There is no global translation in the constructed input.

This is an adversarial synthetic result. I have not established that an existing corpus frame was harmed by this rule. It challenges the unconditional claim that this registration score avoids item-silhouette bias; it does not justify replacing the algorithm from one toy image.

**Suggested fix:** compare candidate shifts using reliable surviving key/mannequin support, exclude confident item/cut regions, prefer zero on weak evidence, and report ambiguity. Test against stored raw outputs before changing production. Preserve the demonstrated real systematic-offset repairs.

**Confidence: high** in the numerical counterexample; medium in practical priority.

### F7. The campaign evaluator's overall status is not the production pipeline's verdict

**Severity: medium.** Sources: `spikes/api/c25/evaluate.mts:35`, `:52`, `:66`; compare `app/src/lib/items/run.ts:347`. Reproducibility issue: `spikes/api/c25/lib.mts:7`, `spikes/api/c25/evaluate.mts:3`.

**Failure:** `evaluate` extracts dressed keyframes and prints their key metrics, but its aggregate `fails`/`status` come only from posed-cell QA and H4. It does not incorporate the production dress checks for G2, G3, presence, or D1. It also does not supply the new keyframe-derived cut options. A campaign status of `pass` is not sufficient evidence that the same result clears production.

**Evidence:** `pixeldoll-challenge-harness.mjs` makes a TEMP-only copy of the evaluator with imports pinned to the review worktree and output writes disabled. A dressed reference erases **80 body pixels**, giving `keyKept:0.892`; production `g2Fails` is true. Its eight pose frames are clean. The campaign evaluator reports **`status:pass`, `fails:[]`** while displaying the bad keyframe metric separately.

Additionally, the harness imports production modules through an absolute URL into the live main checkout. Running an evaluator from a detached worktree does not pin those imports. That is why this review used a safe adapter and direct pinned-module replays rather than executing the stock evaluators.

**Suggested fix:** share the production offline evaluation contract, including dress checks and cut handling; retain phase-specific metrics separately. Resolve app imports relative to the harness's checkout and record the production commit/hash with results. This does not invalidate manually checked keyframe metrics or the reproduced bow totals.

**Confidence: high.** Scope is evidence interpretation and reproducibility, not an assertion that every campaign conclusion is wrong.

### F8. The frozen benchmark does not protect the main round-3 bow and steel improvements

**Severity: low.** Sources: `app/scripts/bench-freeze.ts:85`, `app/test/unit/bench.test.ts:18`, `:25`, `:30`; corpus `app/test/fixtures/bench/cases.json`.

**Failure:** the corpus includes swords and axes but no bow. Its azure case is the striped tunic, not the steel/plume example that motivated the despill fix. Held clip verdict expectations are `any`. The round-3 cut checks establish some positive/zero cut totals, not exact approved ear masks. Thus the benchmark can remain green while bow grip repair, azure steel fidelity, or cut location regresses.

**Evidence:** inspected all 18 case definitions and ran all 648 extracted cells. The reported 99.9% keep rate is sparse-label retention, not whole-image precision/recall: **7,992 of 8,495 eligible keep labels (94.1%) belong to one body-B jester case**. Sword/axe retention remains 43/48 and 44/48. Existing synthetic self-tests do check a grip gap, a steel sample, and cut rules; this finding is about missing real-output regression coverage, not absence of all tests.

**Suggested fix:** freeze representative raw bow gaps and narrow negative spaces, the plume steel views, exact positive/negative cut masks, and the mirrored/export/reuse cases above. Report per-defect/per-item results alongside pixel-weighted totals. Keep labels on raw output and independent of the current extractor; existing rule-based raw labels are a good foundation.

**Confidence: high.** This is a coverage limitation, not a claim that current bow or steel pixels are all defective.

### F9. Round-1 spend attribution differs from the stored ledger by 25 gens

**Severity: low.** Source: `docs/research/generation-quality-campaign-2026-10-25.md:75`.

**Failure:** the document attributes 150 gens to arm C. Its stored ledger contains five dress calls charged 10 each and 25 pose calls charged 3 each: **125**, not 150. The difference exactly matches using the old 15-gen dress estimate instead of the observed 10-gen charge.

**Evidence:** `pixeldoll-challenge-audit.mjs` reads only local schemas, ledger records, and judging records. Round-1 ledger arm totals are P=216, K=120, D=240, C=125, E4=126: **827**, or **884** after the documented 57-gen body. The document says 909. Round 2 sums to 605.5 and round 3 to 247, matching their documents.

**Suggested fix:** reconcile the 25-gen attribution; distinguish recorded call usage from account balance deltas and any unattributed difference. I did not query the account, so I cannot establish whether the historical 909 balance delta was wrong or included other activity.

**Confidence: high** in the document/ledger discrepancy; medium in the inferred old-estimate explanation. No overspend or billing error is alleged.

## 2. Improvements brainstormed

These are proposals, not implemented fixes or proven live-quality gains. Generation counts below are planning estimates based on the stored campaign charges and local API documentation. No proposed paid test was run.

### Generation strategy and cost

| Proposal | Why / expected effect | Risk | Verification |
|---|---|---|---|
| Correct price tiers before tuning generation | Removes the deterministic 5/15-gen baseline omissions in F2. | Prices and USD billing can change. | Pure planner matrix against the stored 64/80/160/192 px examples; zero gens. |
| Simulate retry policies on stored candidate seeds | Compare first acceptable, one retry, two retries, and best-of-N using both hard failures and visual defects. One avoided pose retry saves 3 gens per eight-frame direction; avoiding a full key reset can save an entire dress-plus-pose plan. | Stored seeds are few and correlated through dressed references; selecting only by gate count rewards gate blind spots. | Replay candidates offline first. For a paid follow-up, freeze one policy comparison, e.g. 3 items × 3 directions × 2 extra pose seeds = about 54 gens, reusing existing references. |
| Diagnose G2 before switching the whole item key | `retry` can reset every direction after one exhausted G2 call. Erased body, drift, and color collision are different causes. Preventing an irrelevant reset saves the current complete item plan, not merely one pose call. | The rejected M detector had false positives; there is no validated universal automatic classifier. | Record erased versus off-key counts, retained color families, and visual cause on stored failures. Start with explanation/review rather than another automatic paid decision. |
| Try deterministic rigid-head reuse on narrowly qualified clips | A translated dressed head layer could remove 3 gens per qualifying clip-direction and eliminate a second AI redraw. | Head rotation, occluding arms, compression, and perspective make unrestricted pasting wrong. | Offline compare joint-aligned keyframe reuse with real head clips, masking only independently observed occlusion. Require full visual parity before an optional 2-body × 2-item × 3-direction paid canary, about 36 pose gens if new comparison outputs are necessary. |
| Consider packing compatible short pose sequences up to 15 frames | Four idle frames plus eight walk frames currently cost 3+3; a supported 12-frame skeleton request is estimated at 4, potentially saving 2 gens per direction. | One action description spans two motions; cross-sequence contamination and temporal continuity could reduce quality. This is an inference from API capacity, not a tested product route. | Offline request/ordering tests first. A paired 3-direction × 2-seed canary is about 60 gens (separate 36 + packed 24), reusing dressed views. Do not batch unrelated views or unrelated item designs. |
| Keep dress chunks at real endpoint caps; avoid shrinking padded art automatically | The 16/9/4 frame caps are real; padding can force additional dress chunks, but protects long items and pivot alignment. | Rescaling or reducing headroom to save a dress call destroys pixel geometry. | Current held chunk planner checks held up. Only compare explicitly chosen canvas policies with clipping and pivot proof. |
| Keep concept images as an anchored edit experiment | Round 2 reverses round 1's provisional transfer conclusion. The raw concept as an anchor has evidence; another paste-up/transfer abstraction currently has little justification. | Three concept classes, two seeds, and subjective fidelity do not prove general success. | Include the concept and item brief in blind comparisons. A targeted 3-concept × 2-seed × 2-route dress comparison at 64/96 px is approximately 120 gens; do not spend it merely to repeat the already rejected comparison without a new hypothesis. |

For an 80 px five-view body with idle and walk, a non-held baseline is one 10-gen dress plus ten 3-gen pose calls = **40 gens**; held padding creates two dress calls = **50**. With an added eight-frame attack these become **55/65**. Retries, key resets, and grids are extra. These examples use five drawn views; independent eight-view rigs cost more. The Make UI should explain the actual selected plan, not reuse a historical three-direction example.

### Keys, extraction, cleanup, and QA

| Proposal | Why / expected effect | Risk | Verification |
|---|---|---|---|
| Keep one known key for an item's lifecycle | It keeps saved references, future moves, repair, and shared fitting interpretable. Per-call key changes need equivalent re-keyed inputs and consistent provenance. | More keys or per-call keys add state without resolving semantic color ambiguity. | Retain existing key-equivalence tests; verify all downstream routes before adding a key. Zero gens for algebraic checks. |
| Use measured reference palettes when they exist | Fitting already chooses a safe key from real colors. Extend that evidence to concept assets and explicit recolored designs instead of relying only on words. | A single reference omits hidden/back colors; color names and steel shading are not fixed RGB values. | Local ramp collision matrix including KT/despill tint boundaries; paired dress canary only for new behavior. |
| Do not lower KT globally from one difficult item | Raising/lowering KT trades missing item pixels against mannequin leaks. Existing green evidence is bimodal, but azure/blue need their own distributions. | An apparent fix can silently remove saturated shading elsewhere. | Replay every raw corpus key and report per-item keep/drop/color metrics. Add chartreuse and other named-color ramps. No paid call needed for threshold experiments. |
| Gate palette drift against the actual design | Fixes F1's 160-distance false-clean clip. | Forcing all pixels to the standing palette could destroy legitimate shading. | Reuse fitting's bounded comparison as a diagnostic/gate; do not add an unconditional global palette snap. |
| Limit registration to evidence of mannequin displacement | Addresses F6 and may avoid a second full nine-shift search when zero is strongly supported. | Key coverage can be small or occluded; joint positions are requested coordinates, not observed pixel truth. | Stored-frame registration ablation plus synthetic erasures and translations; measure both improvements and harmed frames. |
| Audit grip filling as an occlusion repair, not hidden-geometry recovery | `closeGrip` has no wrist input and acts anywhere its morphological/key conditions hold. A direct scratch case adds 30 pixels between two separated rails far from any specified wrist. | That addition is not by itself a proved defect: non-hand occlusion drift can also need repair. Restricting it blindly could undo legitimate fixes. | Label positive grip holes and negative bowstring/fork/shield apertures on raw real frames. Compare filled-pixel precision, total added area, and design fidelity. Keep the 2 px limit until evidence supports a change. |
| Preserve small disconnected parts with design support, where demonstrated | The 15% component floor and 50%-on-body rule can remove legitimate separated shoe tips, ornaments, and forked weapons. | Relaxing filters globally restores invented slash props and specks. | Add real positive detached-part labels and negative prop labels first; test keyframe support and observed contact, not component size alone. |
| Keep bounded head cuts; improve their exact mask tests | Keyframe-constrained cuts avoid deleting a drifting leg. `minPx=3` and `maxShare=4%` are empirical safeguards, not a semantic occlusion detector. | Larger ears/horns and unusual head proportions can exceed limits; widening allowed regions can cut real anatomy. | Freeze exact ear masks across current three positive cases and negative head/neck/leg cases, with 1/2 px head movement and near-threshold sizes. |
| Treat false-clean results and false retries separately | Wrong hand/turns can require review, while a tiny low-area denominator or ordinary occlusion can cause costly retries. | Relaxing all far-side bow failures would conceal the real horizontal flips seen in seed 59. | Report defect-level precision/recall and gens spent per accepted item, grouped by body/item/direction and dressed seed. Keep current bow gates until new evidence separates real flips from occlusion. |

### Layering, export, and reuse

- **Two simultaneous cutting items:** this is an acknowledged engine/Studio mismatch, not a newly discovered defect. Prefer a union-mask body variant for combinations actually used by exported presets, with an explicit policy for runtime combinations. Baking every possible outfit can grow combinatorially. Body-region “atoms” or runtime masking are larger alternatives only if real combination counts justify them. Validate two disjoint cuts, overlapping cuts, hides chains, mirrors, palettes, and all runtime selectors offline; zero gens.
- **Old items without cuts:** offer a local, explicitly reviewed migration only when raw dressed references and exact matching frozen frames survive. The existing stored data can support an offline proposal; do not regenerate merely to recover ear masking. If references are missing, do not invent a cut from final transparent artwork alone.
- **Exact copies:** apply F3's cut remapping before pursuing arbitrary retargeting. A free copy should preserve all proven appearance metadata, not just the equipment raster.
- **Long side-view bows:** keep the failing cases visible. A local wrist-relative rigid transform of a sufficiently observed bow is worth an offline experiment; it could preserve length and angle without another model drawing. It cannot reconstruct a bow that is mostly hidden or infer its anatomical hand. Approve/reject against the existing 36 clips before proposing paid work.
- **Recolor:** exact owner-local ramp swaps and source sheets are the right contract. Avoid a catch-all color snap that hides bad extraction. Exercise cuts and tucked variants under body/item recolors and engine-only ZIP import, not just plain layers.
- **Simplicity:** `app/src/lib/export/colors.ts` has no production caller at this commit, only tests. Confirm whether this former palette-copy route should be removed. `docs/manifest-spec.md`'s “Outfit-color export normalization” appendix describes that older `body_color` route, while its opening paragraphs and current exporters describe source-sheet/runtime palettes. Align the documentation before extending either path. This is a cleanup proposal, not a claim that the unused helper currently breaks ordinary exports.

### CPU, memory, and test efficiency

Measured with Node **24.22.1**, npm **11.19.1**, the frozen 18-case corpus, and five timed repetitions after warmup. `pixeldoll-challenge-perf.mjs` and its JSON retain the raw timings. The host is shared; full benchmark runs ranged **3.83–7.22 s**, so these are approximate wall times, not isolated CPU benchmarks.

| Measurement | Median | Scope / limitation |
|---|---:|---|
| Full `runBench` | 6,367 ms | Raw decode, extraction, cleanup, QA; 648 cells including reference cases/keyframes |
| `chromaLayer` replay | 730 ms | All cells' stored composites |
| `extractCell` replay | 3,290 ms | Broad bands; phase timing, not an exact second production run |
| `itemQa` replay | 1,814 ms | Posed subsets; normal repeated clip-summary work retained |
| `postProcess` replay | 919 ms | Includes cloning cell inputs to keep repetitions independent |
| Despill on reconstructed raw retained masks | 126 ms | All 648 cells |
| Scratch palette-memoized despill | 45 ms | Same retained masks; **0 differing cells**, all output bytes compared |

The scratch optimization calls the original despill decision once per distinct color, preserving first-seen palette order, then remaps pixels. It saved approximately **81 ms over 648 cells** in these samples, or 0.13 ms/cell; it did not improve generation time. Validate interleaved repetitions under quieter load before claiming a stable speedup. It is a small possible improvement, not a reason for a large image-processing rewrite.

Other targeted opportunities:

- `extractCell` searches nine shifts before extraction for posed cells and again afterward for `shifted`. `trimToKeyframe` builds shifted masks for 25 candidate alignments per cell. Measure a scalar overlap loop or reusable scratch buffers before adding caches or a new abstraction. Require byte-identical results and the registration tests above.
- `itemQa` evaluates the entire item and each clip again to retain replaceable summaries; `minIoU` is computed even for non-held slots. Share scalar reductions where possible without weakening clip-local warnings or palette summaries. The measured QA cost makes this a more interesting target than shaving a few allocations from `padImg`.
- The module-level `decoded` Map in `items/run.ts:298` has no eviction/clear path. One unique 192 px RGBA image is 147,456 bytes; 5,000 retained decoded results are about **703 MiB**, before layers, composites, or JS overhead. This is an arithmetic exposure, not a measured 703 MiB session. Bound it by active project/evaluation or use a byte-budget cache, preserving durable blobs. The profiler's 106 MiB of array buffers is a different workload and is not evidence of a leak in this Map.
- Keep component/dilation simplifications local. Pixel masks are small, and paid redraw latency dominates. A worker/pooling framework or a dependency is not justified by these measurements.
- The unit suite took **5.83 s**. Preserve isolation. Four-worker e2e had four failures; every one passed with a single worker. On a busy shared workstation, use fewer workers for reliable diagnosis instead of lengthening timeouts or weakening assertions.

### Experiment method

The strongest campaign conclusions are deterministic pixel failures reproduced on raw outputs: magenta destroys the jester/stripes, azure/blue retain them, old despill changes steel, and an uncapped erasure rule would hide real legs. The weaker conclusions are endpoint/prompt superiority generalized from a few designs and bodies.

- Round 1 candidly documents post-judging calibration changes, nonidentical placebos, and missing flipped repeats. Do not retrospectively treat those votes as an unbiased statistical experiment. The blue-key adoption has a separate deterministic justification.
- The frozen round-4 judging records contain **14 tests, 10 calibration pairs, and 6 flipped repeats**. Both judges answered all 30 and got 9/10 calibration, matching the reported result. The round-2 written protocol promised 12 calibration pairs (four new); the actual `calib.mts` has ten (two new). Record that deviation explicitly; the 9/10 result is not 10/12.
- Concept comparisons reverse the provisional round-1 conclusion. That is evidence for keeping the implementation small and the conclusion provisional, not for selecting a different endpoint after each small sample. Judges need the concept and prompt when judging fidelity or missing requested colors.
- Round-3 bow seed extension was declared after the first nine clips. It is transparent exploratory follow-up, not an untouched fixed-sample test. The final result still misses the adoption rule, so retaining the old wording is conservative. Treat **six dress seeds for one item/body** as the relevant limited sample, not 288 independent rendered frames.
- I replayed both bow wordings at seeds 7,11,23,31,47,59 using pinned production extraction/cleanup/QA: **11/18 control clips fail; 8/18 upright clips fail**. I specifically tested a suspected missing output unrotation: `f0Last` is false for all three body-A walk directions, and applying production ordering changes neither count. That suspicion was rejected.
- Gates are not independent labels of visual quality. A campaign optimized only for fewer failed checks can favor an output that loses desired color, motion detail, or negative space. Freeze raw outputs and human/independent defect labels; cluster statistics by item/body/dressed seed. Include held-out bodies and native 80/160 px cases before widening heuristics.
- Fix F7's evaluation parity and F9's cost reconciliation before using the harness to choose a cheaper retry policy. No larger paid study is justified merely to compensate for an offline evaluator discrepancy.

## 3. Checked and fine

“Fine” here means the stated offline checks held up. It is not a native-engine or live-generation guarantee.

- `npm run check` exited **0**, including the TypeScript stages after Svelte's clean diagnostic output. The output was not filtered to decide success.
- `npm test` exited **0**: **87 files; 805 passed, 1 skipped**. `GODOT_BIN` is absent, so the existing optional native Godot test is skipped. Existing pure/runtime-stub exporter, Aseprite, palette, QA-summary, provenance, and storage checks passed.
- `npm run bench` exited **0**. All 18 cases met their frozen verdict expectations; eligible keep and keep-exact totals are **8,486/8,495**, drop **0/39**. This protects specific existing fixes, subject to F8's scope limits.
- Real blue-key/channel-swap and azure-key tests pass. No evidence supports globally changing KT, undoing the steel despill guard, or returning to pixel diff. The external paperdoll review correctly records that real-drift data reversed the earlier synthetic palette-filter improvement.
- The current component-order fix preserves sword pommels/axe ends better than the old pre-wrist floor. The existing wrist-radius positive/negative tests pass. I did not find evidence to replace that filter wholesale.
- Keyframe-constrained head cuts work on the benchmark's three ear cases and remain zero on its drifting-leg and held-item negatives. Move replacement and `mergeClip` call `dropCut`, preventing the already fixed stale-cut problem. Held items do not acquire body cuts.
- A single valid synthetic project passed all six export builders in the new parity reproducer. Existing tests also cover malformed cuts, untrimmed sheet geometry, centered oversize pivots, body/item owner-local recolors, source sheets, and editable/engine-only ZIP round trips. The exception found is F4's disjoint-cover mirrored parity; simultaneous cutting items remain an accepted documented limit.
- Runtime `_shown` / `shown` / `Shown` selectors all use the baked variant relation for a single cover. Body-variant material ownership is retained. No additional single-cut selector defect was found by source review or existing tests.
- Body joint validation retains all 18 required finite positions. Power-of-two estimator padding preserves pixel scale and unpads coordinates. Stored motion poses, held padding, frame batching, and output unrotation remain explicit contracts. A requested skeleton is not proof of observed pixel alignment; F6 preserves that distinction.
- The queue distinguishes uncertain paid outcomes from proven refusals and retains accepted job identities. Existing offline queue/recovery tests passed. No request was sent while reviewing those contracts.
- The requested e2e selection ran **40 tests**. First run: **36 passed, 4 failed**. Re-running exactly the four failures with one worker: **4 passed**. There was no single clean 40-test run, and I do not claim one. All requested cases have a passing execution across those runs.

## 4. Commands run

All app commands below ran from the detached worktree's `app/`. `npm exec --yes --package=node@24.22.1 --package=npm@11.19.1 --` was the prefix, so the host's Node 25/npm 11.16 did not run the checks.

| Command / action | Result |
|---|---|
| Read handoff, root `AGENTS.md`, inspect initial status/worktrees, resolve `e76b3c60` | Main initially clean; target commit verified. |
| `git worktree add ../PixelDoll-codex-review e76b3c60` | Created detached review worktree at the exact handoff path. |
| Pinned `node --version`, `npm --version` | v24.22.1 / 11.19.1. Runtime packages provisioned in npm cache. |
| `npm ci` | 82 packages added; audit reported zero vulnerabilities. No dependency or lockfile edits. |
| `npm run check` | Exit 0; zero Svelte errors/warnings; subsequent TypeScript stages succeeded. |
| `npm test` | Exit 0; 805 passed / 1 skipped, 87 files, 5.83 s. |
| `npm run bench` | Exit 0; no verdict misses. No `--write`, `--sheet`, or corpus freezing. |
| `npm run e2e -- studio selftests export-picker shared-equipment` | Build/dist guard passed; 36 passed, 4 failed, 3.4 min. Existing build warnings: non-module appearance script, large chunk, color environment warnings. |
| Same e2e selection with `--last-failed --workers=1` | Build/dist guard passed; all four previously failed tests passed, 1.1 min. No source/config/assertion changes. |
| Scratch `pixeldoll-challenge-repro.mjs` | Counterexamples for key choice, registration, and mirror commutation; grip-fill behavior and one non-failing despill probe. The incomplete-slot planner comparison is explicitly rejected as a production finding. |
| Scratch `pixeldoll-challenge-plan.mjs` | Actual Studio planner verified; 19 vs 24/34 large-canvas baseline costs; correct seven-call body-B held plan. |
| Scratch `pixeldoll-challenge-palette.mjs` | Uniform wrong-color clip passes at reported distance 0; actual design distance 160. First scratch invocation had a syntax typo, corrected outside the repo before the successful run. |
| Scratch `pixeldoll-challenge-copy.mjs` | Exact copied frame loses cut; ear alpha 0 → 255. In-memory source/target; no database writes. |
| Scratch `pixeldoll-challenge-tuck-export.mjs` | All six builders return no errors/warnings; west baked output differs by six pixels. First plain-Node invocation hit existing TypeScript parameter-property syntax; rerun with `--experimental-transform-types` succeeded. |
| Scratch `pixeldoll-challenge-harness.mjs` | Pinned, write-disabled evaluator adapter: bad dress reports pass despite 80 lost body pixels. |
| Scratch `pixeldoll-challenge-bow.mjs` | All 36 stored bow clips replayed; 11/18 vs 8/18 failures; unrotation suspicion rejected. |
| Scratch `pixeldoll-challenge-perf.mjs` | Five repeated corpus/phase timings; scratch despill memoization byte-identical across 648 cells. |
| Scratch `pixeldoll-challenge-audit.mjs` | Parsed relevant local OpenAPI request schemas, all three campaign spend ledgers, and r1/r2/r3/r3b/r4 judging inventories/coverage. Confirmed 25-gen round-1 attribution discrepancy. |
| `rg`, targeted `Get-Content`, and local image viewer | Read the listed architecture/limits/plan/manifest/campaign/external-review/benchmark/harness materials, relevant pipeline/rig/fitting/compose/export/queue/Studio code and tests. Reviewed Z jester/stripes/hood sheets, all five N evaluation sheets, cut/erasure/grip/steel evidence, all twelve round-3 bow seed sheets, and E concept/comparison sheets from the main tree's ignored evidence directory. Read round-4 votes and programmatically inspected every round's sealed/vote records. Did not re-judge every historical blind pair. |
| Worktree `git rev-parse HEAD` and `git status --short` | Still at the requested commit; no tracked or non-ignored source changes before writing the report in main. |

E2E isolation: `E2E_PREVIEW_PORT=5497`, `E2E_DEV_PORT=5498`, `TEST_OUTPUT_DIR=C:/Users/shilo/AppData/Local/Temp/pixeldoll-codex-challenge-e2e`. The serial rerun used the same output directory for `--last-failed`. Initial failures were the Studio demo timeout, Inspector timeout, joint-recovery consent-message assertion, and body-color-repair action visibility; all passed serially. These tests already abort/mock PixelLab hosts, and Vite has `envDir:false`; neither an agent server nor a credential source was used.

**Skipped deliberately:** all PixelLab endpoints and paid/live harness arms; `.env`; stock evaluator execution because its absolute imports target the live checkout and its sheet outputs mutate evidence; `bench-freeze`; benchmark rewrite; full e2e suite outside the requested selection; screenshot-only `experience.spec.ts`; additional native Godot/Unity/Phaser/GDevelop installations or live editor sessions. Existing native-engine coverage is limited to what the passing unit suite actually executes. No source fixes, commits, pushes, merges, board edits, or new task cards were made.

Scratch scripts/results are local review evidence, not committed deliverables. To rerun them later, recreate the same detached worktree path and install its pinned app dependencies. Treat synthetic failures as regression seeds and real-output hypotheses; do not use them alone to tune cleanup thresholds or authorize paid work.

Cleanup: after confirming the detached commit and an empty worktree status/diff, the throwaway `PixelDoll-codex-review` worktree was removed. Final main-tree status showed only this new report. TEMP reproducers/results were retained.
