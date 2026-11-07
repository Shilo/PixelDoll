# Matched live equipment trials

November 6, 2026. This follows the [generation quality review](deep-paperdoll-review-2026-11-06.md), its [conditioning controls](deep-paperdoll-conditioning-2026-11-06.md), and the independent modern-source challenges. The campaign completed all 60 fixed requests through the localhost Item Trials page in Agent mode. No request failed at the transport/job level, and no request was resent. Three results fail production quality gates and one has a palette warning. Completion and quality approval are separate facts.

## Inputs, receipts and reproducibility

The public frozen benchmark supplies two body silhouettes, 64 px and 80 px native cells, and five approved designs: green/gold tunic, red hooded cape, greathelm, brown leather vest and a second red cape. Every target is an eight-frame Walk clip. South and east views and seeds 110601/110602 are represented where specified in the matrix below. Seeds match within pairs; different models do not promise identical random noise for the same seed.

| Comparison | Requests | Matched dimensions |
| --- | ---: | --- |
| Raw anchored edit versus reference transfer | 32 | Four designs, two body types, south/east, two seeds, two routes |
| Canonical versus shared-ramp edit | 16 | The two 80 px cloth designs, south/east, two seeds, two conditioning modes |
| Raw versus canonical skeleton posing | 12 | Greathelm and both capes, east, two seeds, two conditioning modes |

The raw edits in the first group also serve as the raw-to-canonical edit controls. Raw means the retained standing dressed composite. Canonical means the frozen standing body keyed again, its approved cuts applied, and the approved extracted gear composited over it. Shared means that canonical source and the targets use one continuous luminance range pooled from standing/target bodies. The approved isolated layer remains separate from these conditioning bitmaps.

The plan ID is `matched-item-routes-2026-11-06-r1`, with SHA256 `4a97c90c419781e3df344a11725659a7699511a611b26c26725fc27c2601b774`. Its 60 receipts retain 512 returned images: 32 edit calls return nine images each, 16 transfers return eight each, and 12 skeleton calls return eight each. Edit's generated reference is excluded from target evaluation, yielding 480 target frames. Every subjob explicitly reports billing. Actual total is **$4.0886959180037215 and three subscription generations**, including the earlier $0.08 baseline. The newly submitted 59 calls cost $4.0086959180037215 plus those three generations. One skeleton call used subscription generations while the other skeleton calls reported USD; the experiment does not establish a billing-selection rule.

The [retained measurement ledger](evidence/item-trials-2026-11-06.json) contains every receipt ID, request and packet hash, output label/hash, charge, per-frame measurement and quality reason. Full raw evidence is preserved locally in `app/test-results-item-trials/final-evidence/plan.json` and the downloaded `item-trial-plan-matched-item-routes-2026-11-06-r1.json`. Its byte SHA256 is `f09bc6a5bb0216f234d2b67b0ce412459f23111119c1d418ef0c0fc8550dcdf2`. Those raw files and contact sheets are ignored test artifacts. No private chat, private media or credential enters the plan or ledger.

Regenerate packets with `node scripts/item-trial-packets.ts`, then evaluate a directory containing only the exported evidence bundle with `node scripts/item-trial-report.ts <directory>`, both from `app/` using the pinned Node runtime. Do not include the standalone baseline beside the bundle because it duplicates a request. Evaluation verifies packet/request hashes, exact input identities, expected output count, unique output labels, receipt membership and every PNG hash. A deliberately repeated-frame export was rejected. Unfinished receipts are refused rather than omitted.

The offline evaluator applies the shared production binary-alpha, band, relevant cut allowance, submitted grid stencil, post-processing and quality functions. It uses measured-pose bands where present: 40 bodyB trials have measured arrays, while the 20 bodyA trials use default bands. It deliberately supplies the same-facing approved standing palette to G6 across all arms; the `poseItemClip` runner at capture time omits that optional palette map and uses its default reference. No pose warning occurs here, so this difference does not change the reported pose verdict counts. The evaluator records raw alpha and palette distance before normalization and does not apply the later standing-dye matcher. Palette numbers therefore describe extracted candidate art before that correction. This matrix contains no grid calls.

## Measurements

Proxy-mask IoU compares a new result with the older retained accepted layer. That older layer is a repeatable reference, not independent semantic ground truth. Likewise, an off-key pixel inside a body region uncovered by that proxy can be valid newly drawn cloth. Neither metric alone proves a skin repaint, a missing motif, or a superior result.

| Matched cohort | Calls | Pass / warn / fail | Pooled proxy IoU | Mean frame palette distance | Proxy-protected off-key pixels |
| --- | ---: | --- | ---: | ---: | ---: |
| Raw edit, all four route designs | 16 | 15 / 1 / 0 | 0.8043 | 9.04 | 1,529 / 64,600 |
| Raw transfer, same designs | 16 | 14 / 0 / 2 | 0.8053 | 8.60 | 1,730 / 64,600 |
| Raw edit, 80 px conditioning subset | 8 | 8 / 0 / 0 | 0.8402 | 8.39 | 978 / 35,718 |
| Canonical edit, same subset | 8 | 8 / 0 / 0 | 0.8428 | 7.80 | 973 / 35,718 |
| Shared-ramp edit, same subset | 8 | 7 / 0 / 1 | 0.8389 | 7.88 | 984 / 35,718 |
| Raw skeleton pose | 6 | 6 / 0 / 0 | 0.8779 | 0.119 | 290 / 20,562 |
| Canonical skeleton pose | 6 | 6 / 0 / 0 | 0.8778 | 0.129 | 207 / 20,562 |

All 480 raw target images have binary alpha. Each edit/transfer call costs $0.08. Skeleton cohorts contain different designs from the route cohorts, so their higher IoU and lower palette distances cannot establish a universal route ranking. The two conditioning subset rows must be compared with their own eight raw edits, not the 16-call mixed-body aggregate.

The failures are retained in the ledger:

- `b-tunic-south-raw-110602`, transfer: G2 key retention 0.937 in frame 1 and G3 key expansion 0.100.
- `b-cloak-south-raw-110602`, transfer: G3 key expansion 0.040 in frame 6.
- `b-cloak-east-shared-110601`, edit: G3 key expansion 0.026 to 0.031 in frames 0, 1 and 3.
- `a-chest-east-raw-110602`, edit: palette warning in six frames, maximum distance 21.2 from its approved standing design.

## Independent visual challenge

Two fresh reviewers received only image panels and the viewing instructions. They did not read mappings, route names, receipts, metrics or sources. One reviewed the 16 route pairs, the other the 22 conditioning pairs. Candidate order alternates; route identity was withheld until their judgments were returned. Each candidate displays raw keyed output and frozen-body recomposition at integer 3x enlargement for frames **0, 3, 5 and 7**. The same approved standing composite and isolated layer appear beside both candidates. Criteria are garment identity, silhouette, motifs, color, exposed-body preservation, plausible overlap and consistency. These are model judgments, not independent human artist labels, and selected static frames do not establish motion quality.

| Comparison | First method preferred | Second method preferred | Ties |
| --- | ---: | ---: | ---: |
| Raw edit / transfer | 2 | 2 | 12 |
| Raw edit / canonical edit | 2 | 2 | 4 |
| Canonical edit / shared edit | 2 | 4 | 2 |
| Raw pose / canonical pose | 1 | 0 | 5 |

The individual choices below preserve the blinded panel IDs and their decoded result. All unlisted qualities remain uncertain.

| Pair | Trial | Preference and observed reason |
| --- | --- | --- |
| 01 | Tunic south 110601, edit/transfer | Tie; gold trim and exposed body comparable. |
| 04 | Tunic east 110601, edit/transfer | Tie; plausible differences in hem flare. |
| 07 | Hooded cape south 110601, edit/transfer | Tie; hood opening and hanging sides comparable. |
| 10 | Hooded cape east 110601, edit/transfer | Tie; different plausible cape flare. |
| 15 | Vest south 110601, edit/transfer | Edit, medium confidence; transfer adds diagonal chest decoration. |
| 16 | Vest east 110601, edit/transfer | Tie; profile, shoulder and waist comparable. |
| 17 | Cape south 110601, edit/transfer | Edit, high confidence; transfer changes separated shoulder accents to a continuous collar. |
| 18 | Cape east 110601, edit/transfer | Tie; different plausible drape. |
| 20 | Tunic south 110602, edit/transfer | Transfer, medium confidence; flatter hem and compact sleeves. Its failed frame 1 is absent from these selected views. |
| 23 | Tunic east 110602, edit/transfer | Transfer, medium confidence; cleaner cuff/hem silhouettes. |
| 26 | Hooded cape south 110602, edit/transfer | Tie; hood and sides comparable. Its transfer failure in frame 6 is absent from these views. |
| 29 | Hooded cape east 110602, edit/transfer | Tie; both vary hood and flare. |
| 34 | Vest south 110602, edit/transfer | Tie; plain vest and lower bands comparable. |
| 35 | Vest east 110602, edit/transfer | Tie; narrow profile and arm overlap comparable. |
| 36 | Cape south 110602, edit/transfer | Tie; shoulder accents comparable. |
| 37 | Cape east 110602, edit/transfer | Tie; different plausible backward/downward drape. |
| 02 | Tunic south 110601, raw/canonical edit | Tie; tunic and gold trim comparable. |
| 05 | Tunic east 110601, raw/canonical edit | Raw, medium confidence; straighter silhouette. |
| 08 | Hooded cape south 110601, raw/canonical edit | Tie; hood and panels comparable. |
| 11 | Hooded cape east 110601, raw/canonical edit | Raw, medium confidence; fuller, smoother cloth volume. |
| 21 | Tunic south 110602, raw/canonical edit | Tie; outline and trim comparable. |
| 24 | Tunic east 110602, raw/canonical edit | Canonical, low confidence; more restrained flare. |
| 27 | Hooded cape south 110602, raw/canonical edit | Tie; hood and sides comparable. |
| 30 | Hooded cape east 110602, raw/canonical edit | Canonical, medium confidence; closer hood contour. |
| 03 | Tunic south 110601, canonical/shared edit | Tie; small shading/collar changes. |
| 06 | Tunic east 110601, canonical/shared edit | Shared, medium confidence; closer sleeve trim/outline. |
| 09 | Hooded cape south 110601, canonical/shared edit | Canonical, medium confidence; shared panel becomes wide and asymmetric. |
| 12 | Hooded cape east 110601, canonical/shared edit | Shared, high confidence; canonical hood/cape proportions enlarge. Shared still has the recorded G3 failures. |
| 22 | Tunic south 110602, canonical/shared edit | Shared, medium confidence; closer neckline proportions. |
| 25 | Tunic east 110602, canonical/shared edit | Shared, low confidence; clearer lower trim. |
| 28 | Hooded cape south 110602, canonical/shared edit | Tie; width changes inconclusive. |
| 31 | Hooded cape east 110602, canonical/shared edit | Canonical, high confidence; shared hood/cape enlarges. |
| 13 | Greathelm east 110601, raw/canonical pose | Tie; visor and shape effectively equivalent. |
| 14 | Hooded cape east 110601, raw/canonical pose | Tie; minor trailing-edge differences. |
| 19 | Cape east 110601, raw/canonical pose | Raw, medium confidence; canonical edge has light flecks and raggedness. |
| 32 | Greathelm east 110602, raw/canonical pose | Tie; helmet and metal palette comparable. |
| 33 | Hooded cape east 110602, raw/canonical pose | Tie; small plausible edge differences. |
| 38 | Cape east 110602, raw/canonical pose | Tie; motion width closely matched. |

The coordinator separately inspected all eight frames of the three failing contacts and the palette-warning contact. A label-blind preference on selected frames cannot override a failed quality gate on another frame. Neither a clean solo composite nor a similar mask proves that the item will preserve hidden pixels under another equipped layer.

## Application validation

Final type checks report zero errors and warnings. All 1,879 unit tests pass, including native Godot 4.7.2 and Aseprite export regressions, with zero skips. The final affected Studio and browser-selftest suites pass all 68 tests after both cleanup and palette-review changes. The earlier stable full browser suite passed all 248 tests after the combined-cut export changes. The 20-case frozen benchmark retains all expected verdicts and existing report bytes. Re-evaluating all 60 trial receipts against the final production changes reproduces every retained measurement and verdict exactly.

An earlier full browser run while source edits were landing had 25 failures; the stable rerun passed. A later sandbox launch could not find the browser in its redirected installation directory. Pointing the test run to the already installed browser and running outside that sandbox passed. No assertion or browser configuration was weakened. The trial download was tested through the browser and the downloaded bundle verified independently.

## Decisions and remaining work

Keep existing generation defaults. Transfer has useful reference separation and wins some visual comparisons, but introduces two failed clips here at the same cash price. Canonical edit modestly improves the aggregate palette distance while losing some silhouette judgments and lowering mean worst-frame proxy IoU from 0.7366 to 0.7283. Shared ramps fix deterministic input color drift in the earlier offline control but do not consistently improve generated cloth; one clip fails. Canonical skeleton inputs reduce proxy-protected off-key pixels but do not improve the aggregate silhouette or visual preference. None establishes a general replacement.

Land separately qualified deterministic fixes: combined equipment body cuts, pivot-aware cut coordinates, mirrored cut imports and clip-local cleanup. Preserve raw outputs and claims, expose export failures, and reject stale/unsupported plans before spending. The development export now presents a persistent prepared-file link because the asynchronous synthetic download did not complete through the browser. This free download has no generation side effect.

The final audit exposed a related production gap: skeleton and repair callers still relied on a clip-average standing-design check in `dirGate`, unlike anchored editing's per-frame check. The shared gate now measures each nonempty posed frame against its own direction's standing reference and propagates the maximum to overall and clip QA summaries through `withH4`. An authored eight-frame control has seven exact matches and one frame at distance 20. Its former clip average is 2.5, below the unchanged threshold of 15. The new check identifies that frame and keeps the outcome a warning. Controls cover every slot class, direction-specific references, missing/empty/unposed evidence, unchanged RGBA and exact saved summary values. This is a deterministic detection improvement; it does not claim to reconstruct a missing design or change a provider result.

The next informative experiments differ from repeating this Walk matrix: high-occlusion actions with a hand crossing a motif, a held weapon with independently labeled grip and polarity, complete inner-garment art with an outer cover removed, a validated target palette including the reserved chroma ramp, and broad versus restricted repair masks with independently known protected pixels. PixelLab's documented target-palette input is a condition, not an ownership guarantee. No such additional paid call was made in this campaign. Existing approvals do not turn a failed or unknown receipt into an automatic retry.

The authenticated Civitai workflow graph remains unavailable; verified public metadata is not graph execution. Native external-tool and modern-source controls have their own documented limitations. This campaign tests these 60 fixed requests, not every possible paper-doll tool, prompt, model or motion.
