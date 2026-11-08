# Offline counter-review of Claude's paperdoll session

November 7, 2026. **Five corrections held; R2 and R3 partially held.** This review found one residual P2 quality-check bypass and one new P3 loss of review information. A separate P3 prompt applicability issue predates the reviewed session. No production source or production test was changed. No PixelLab transport, generation or balance request was made. No board card was created or moved.

## Scope and evidence

Read the full [session handoff](../../handoff/2026-11-07-claude-session-counter-review.md) and current `AGENTS.md` first. Reviewed `bb830dfb9ac6e7347200e487302b60b2d779f457..19646f097a44dff32e7c02563e4a744499a8ff0e`, excluding Codex review commit `9c9a2138`: **33 Claude commits**. Checkout was `304f27bd`, whose only additions are the session handoff and its docs-index entry. All 19 changed application-source paths were checked byte-for-byte against `19646f09` by [inventory.mjs](inventory.mjs); full commit/path membership and source hashes are in [inventory.json](inventory.json).

The second pass reviewed the net implementation changes and their callers, revisited the [previous findings and controls](../2026-11-07-post-bb830dfb/README.md), replayed original synthetic fixtures against pre-correction `0992bae7` and corrected `19646f09`, tested new counterexamples, checked stored rigs and ran the full existing browser suite. This is a commit-range review, not a proof of correctness of every unchanged subsystem. The reusable improvement-cycle document was not opened or executed.

No subagent was used in this pass. Claude's next review should use the independent challenger requested by the owner. The review scripts/results below are reproducible evidence, not production regression tests.

## R1 to R7 verdicts

“Held” means the requested correction survived these bounded checks. It does not remove the known limits in the handoff. “Partially held” means the original example is corrected but the relevant guarantee remains incomplete.

| Correction | Verdict | Verified result and boundary |
| --- | --- | --- |
| **R1: thin held connector** | **Held** | Original full six-frame postprocessing fixture changes from 100/122 retained pixels to **122/122**, including the 20-pixel terminal head. Detached head and body-repaint buckle controls still retain only the 100-pixel main part. A separate 64-pixel / 16-pixel-padding control keeps 122 on both 64 and 96 canvases. Multi-link loss, over-body heads, fixed distance and reachable open-air smears remain declared limits; no new provider counterexample was fabricated from them. |
| **R2: measured-joint action bypass** | **Partially held** | Original bad-eye case again fails G9 on the reversed blade, with identical pixels. Stored slash/subsample decisions are preserved. **F1** demonstrates a different single-neck error that still creates clean QA; it is not a claim that the original eye correction failed. |
| **R3: dark design detail** | **Partially held** | Charcoal front motif becomes `dark`, not `smudge`; all-view motif passes; unrequested dark blotch remains a review note. Mixed gray plus dark stays `smudge`. **F2** shows the dark note is lost on acceptance while gray notes survive. |
| **R4: combined failure recovery** | **Held** | Original mixed-failure node probe: **2 passed**. Dedicated real-browser control shows the free offer before and after reload, recovers eight east frames, leaves south absent, changes the displayed next quote **6 to 3 generations**, adds no jobs, opens no Connect dialog and records **zero external attempts / zero generation POSTs**. |
| **R5: lost name noun** | **Held** | Article-plus-pair yields Leather boots / Leather gloves; lantern remains Iron lantern. Cloak of shadows is retained. The changed old expectation is justified as a display-name correction, not weakening an artwork test. Finite count vocabulary and four-word display shortening remain bounds; full generation instructions remain unchanged. |
| **R6: decoration-based slot** | **Held** | Scutum stays off hand; sword with scutum emblem becomes main hand. Existing color-pair, adjective-list, plural and hyphen controls pass. The disclosed coat-of-arms-shield early-cut case remains editable and was not relabeled a newly found regression. No universal language-understanding claim is justified. |
| **R7: invalid grid hang** | **Held** | 108 dimension/count combinations, including zero, negative, fractional, NaN, infinity and enormous inputs, all terminate promptly. Valid 160-pixel cells use the 480 by 480 / three-column layout. A 384 by 288 canvas at mean side 336 still estimates 15 generations. No invalid-input infinite loop remains in these controls. This does not prove corrupt project loading always recovers gracefully. |

Original fixture comparison: [generator](replay-original.mjs), [results](original-results.json). Additional controls and exact hashes: [adversarial probe](adversarial.mts), [results](adversarial-results.json). Full browser recovery: [generator](prepare-browser.mjs), [results](r4-browser-results.json).

## Findings in the reviewed session

### F1. P2: a detached neck estimate still bypasses locomotion weapon checks

**Source:** [items.ts:898](../../../app/src/lib/items/items.ts#L898), plausibility and moved-joint selection through line 904; `isAction` around line 911; G9's locomotion scoping in the same module. **Introducing commit:** `edc604be` introduced measured decisive-motion overrides. `19646f09` adds the incomplete bone guard and leaves this residual path; it did not introduce the original category of bypass.

**Synthetic reproduction:** run `replay-original.mjs`, then `adversarial.mts`. The authored frozen 64-pixel humanoid has six identical requested poses and a blade reversed 180 degrees in frame 3. Change only measured frame 2's **NECK** to normalized **`(0.05, 0.5)`**. Every other point, requested pose and raster remains unchanged. The rig passes `validateRig`; all point coordinates are complete, finite and in bounds.

| Control | Classification / result at `19646f09` |
| --- | --- |
| Reversed blade, unchanged measurements | Locomotion; G9 failure |
| Exact same reversed blade pixels, one changed neck | Action; **pass, no failures or warnings** |
| Valid unflipped blade, same changed neck | Pass |
| Original eye-outlier counterexample | Locomotion; G9 failure, correctly fixed |

The result file records identical six-layer hashes between the first two rows. The source `clipQa` also reports no failures/warnings and zero arm-adherence error, so that path does not reject this neck error before item QA.

**Why the guard misses it:** the neck moves about 0.624 body heights. Its distance to the hips grows from 20 to about 29.7 pixels, less than the permitted 10-pixel growth at H = 50. `plausible('NECK')` therefore accepts it. Both neck-to-shoulder links stretch implausibly, but filtering those shoulders does not invalidate the neck's own motion evidence. The shoulder-consistent lean correction does not help because the `moved` branch alone returns true. This is a detached single trunk-joint estimate, rather than a coherently translated whole arm whose connected bones stay plausible.

**Reachability:** skeleton estimation produces `sources[dir].measured`; `decisiveAction` prefers a complete measured sequence and uses it for the entire clip. The accepted point schema and source body QA permit this example. Its clean item status could feed automatic clean-draft saving. This is a demonstrated pure-QA path with real production functions, not an observed provider error rate or a full paid Studio reproduction.

**Correction to challenge:** one point must not authorize whole-clip gate removal when its connected trunk evidence is contradictory. Evaluate local connected-joint agreement or retain review/locomotion checks when metadata is uncertain. Do not restore a universal two-joint/two-frame rule: it already loses valid short slashes. Preserve the original eye fix, unflipped control, actual slash results, jumps and swapped hands.

**Known-limit distinction:** the handoff already accepts plausible-length incorrect estimates. F1 supplies a narrower new single-joint counterexample with stretched adjacent bones and an unchanged-pixel **G9 failure to clean-pass consequence**. If Claude considers it part of the accepted limit, challenge that product decision explicitly; do not describe the current guard as generally keeping every bone plausible.

The probe also records a correlated two-hip relocation with the same clean-pass consequence. It is not counted separately: coherent but incorrect joint groups already fall within the declared estimator-ambiguity limit.

### F2. P3: the new dark-patch review note disappears from a saved item

**Source:** [run.ts:457](../../../app/src/lib/items/run.ts#L457), warning injection at line 475, and [acceptItem's design-note persistence at line 573](../../../app/src/lib/items/run.ts#L573). Saved UI readers are [ItemPane.svelte:89](../../../app/src/studio/ItemPane.svelte#L89) and `model.ts:214`. **Introducing commit:** `19646f09` moves dark-only D1 information from `g1` into transient `qa.warnings` without adding durable storage for it.

**Synthetic reproduction:** generate the warning probe and select `independent warning review:` with the owned Vitest config. The probe reuses the tracked offline queue fixture. Three standing views contain a blue garment; one contains a charcoal patch. It runs actual `runItem`, `acceptItem`, `buildItem`, `saveItem` and `qaReasons` against the fixture's mocked storage. No transport is used.

- Before Keep: the exact “dark patch not seen in the other views” note exists in `result.qa.warnings`; the draft is not clean.
- After Keep: saved `qa.status` is `accepted`, but `designWarnings` is empty, `qaReasons` is empty and the entire serialized saved item contains no dark-patch text or direction.
- Gray-patch control: the D1 note is retained in `designWarnings` and remains available to the saved-item UI.

Evidence: [generator](prepare-warning-probe.mjs), [measurements](warning-results.json), [retained failing durability assertion](warning-vitest.json). The last report also contains the passing independent prompt-boundary probe; 52 unrelated cases were filtered, not run in that focused invocation.

**Reachability and consequence:** this is the ordinary Keep path after reviewing the newly introduced warning. ItemPane and exported manifest data consume the saved item, so the specific reason and affected standing view cannot be reconstructed from it on reopen/export. A generic Accepted status is preserved. This is loss of diagnostic context, **not silent automatic acceptance, lost artwork, an automatic charge or proof that every Activity view loses all evidence**. The retained raw jobs may allow later manual re-evaluation, but the saved item does not retain the note.

**Correction to challenge:** preserve the acknowledged design warning with its scope and uncertain meaning in the existing durable design-note mechanism or an equally small appropriate field. Keep it a review note; do not turn a valid motif back into a hard smudge. Verify Keep/reopen/export, a subsequent move merge, and the gray control. Do not persist every transient progress message indiscriminately.

## Preexisting concern found during wording review

### F3. P3, outside this session: a 256-pixel held dress loses the hand and single-item clauses

**Source:** [padOf, items.ts:156](../../../app/src/lib/items/items.ts#L156), [run.ts:234](../../../app/src/lib/items/run.ts#L234), and preview parity at [apiPlans.ts:58](../../../app/src/studio/apiPlans.ts#L58). **Introducing interaction:** `fdf438d05` clamped padding to the provider's 256-pixel canvas cap while an existing truthy-`pad` condition also selected semantic held wording. Current line provenance includes `d9a80923`'s later standing-design work. Both precede `bb830dfb`; **do not attribute this to Claude's 33 commits or count it as an R1 to R7 regression**.

The independent prompt probe captures real `runItem` dress requests in the mocked queue with complete native-size source PNGs:

| Rig cell / slot | Submitted canvas | Requested-hand clause | Single-item clause |
| --- | --- | --- | --- |
| 64 / main hand | 96 by 96 | Present, right | Present |
| 64 / off hand | 96 by 96 | Present, left | Present |
| 256 / main hand | 256 by 256 | **Absent** | **Absent** |
| 256 / off hand | 256 by 256 | **Absent** | **Absent** |

Evidence: [request descriptions](prompt-boundary-results.json), generated by the second case in [prepare-warning-probe.mjs](prepare-warning-probe.mjs). The capture intentionally stops in the mock queue before generating or validating provider output.

**Reachability:** custom body sizes through 256 are allowed by `characterConfig.ts:114`; valid native imported rigs can also use that size. `padOf` correctly returns zero there. The request's hand instruction incorrectly depends on geometry being padded. Pose and held-grid builders still supply the hand clause. The unchanged API preview agrees with execution, so this is a semantic applicability gap, not a false preview quote.

**Controls and limits:** both slots at 64 preserve the clause; both at 256 omit it; matching input PNG dimensions were used. No wrong-hand provider output is claimed. Anchor routes also use zero padding and are outside the padded S5 wording experiment, but that broader route was not independently generated here. Separate slot semantics from pad size if correcting this, and preserve canvas bounds and preview parity. This preexisting gap limits how broadly the 80-pixel wording evidence can be applied.

## Challenge of the kept held wording

Read the full [hand-wording report](../../research/2026-11-07-paperdoll-cycle/hand-wording-ab.md), including minimal/negative, off-hand, full-pipeline, flip and padding follow-ups. No raw images were available in the repository for the latest experiment, and none were regenerated.

**Decision:** keep production wording unchanged pending better evidence. The reported failures justify rejecting the tested minimal/negative variants as replacements. They do **not** establish that the current wording is high quality across bodies, routes and equipment, or identify the unique causal value of each clause.

1. **Unequal samples:** A has one seed / 12 checkable front/back views; alternatives have two seeds / 24 views each, all on one body. Zero of 12 is not evidence of zero error. Views share an item, seed and body and are correlated. Treat condition-level results separately from individual frames/views.
2. **Bundled changes:** M removes orientation, arm freezing and the one-item clause; its pose and grid prompts also change. A versus M is a route package comparison, not an isolated test of naming the hand, negative prompting, one-object constraints or orientation. M2–M5 are dress-only; their results cannot establish posed consistency.
3. **Scoring scope:** bad standing views count wrong hand or duplicate object. They omit size, clipping, inversion, intended grip readability, body preservation, temporal consistency and retained design. The report does give some drift/full-pipeline failures; a future score sheet must separate them. The two successful-or-warning A items out of six scored items are a weak absolute quality result even if better than the alternative.
4. **Right-hand shield confound:** A expressly forbids a shield in the main hand while the item asks for one. That is a contradictory-prompt stress test. M's failures suggest a left-hand prior, but these trials do not prove a right-hand shield is impossible or fairly isolate provider preference from prompt conflict. Keep this case separate from ordinary supported-slot acceptance rates.
5. **Asymmetric full-pipeline denominators:** A's one provider pose failure leaves six scored results, while M has 14. The report does not provide sufficient item-by-item raw material to reconstruct a balanced paired analysis, determine which warnings A retained or independently verify visual labels. Do not silently classify a transport failure as a visual success/failure or drop it without reporting it.
6. **Limited attribution:** no blinded review, raw-frame hashes or independent hand labels are available for this last comparison. The stated 203 calls and $8.98 are historical report claims, not newly audited receipts here. “Its clauses are what keep the hand” is a hypothesis consistent with these experiments, not an isolated causal finding.

**Offline builder check:** 60 combinations of slot/key/frame count with a 300-character item description produce matching requested-hand and one-item clauses in the explicitly held dress/pose/grid builders. Maximum measured description lengths: dress 912, anchored dress 1,529, grid 1,561, skeleton pose 441. The local OpenAPI description limit is 2,000 for edit and inpaint; skeleton pose declares none. These are measured bounds for the tested inputs, not a proof for arbitrary internal/imported descriptions. F3 separately exercises actual dispatch rather than unconditionally wrapping the helper.

**Asymmetry to retain in the interpretation:** main hand says one weapon/no shield; off hand says one held item/nothing in the right hand. They share an intended hand and uniqueness rule but are not semantic mirror copies for non-weapons. The current wording can conflict with upright torch/bouquet intent, as the report already records. This review does not promote a wording change from static reasoning.

**Motion Lab:** `equipment.ts:29` applies `heldPhrase` only to `main_hand`. Its current `EQUIPMENT` catalog exposes helmet, tunic and sword, so no current off-hand experiment is automatically invalidated by that branch. Extending the catalog to shields/bows without changing the branch would make its dress evidence unrepresentative of production padded off-hand requests. The pose/grid functions use their slot-aware shared builders. Existing sword evidence cannot qualify off-hand behavior.

An [owner-only paid experiment proposal](paid-wording-proposal.md) isolates orientation while retaining all other clauses. It is **not executed or authorized by this report**. No new wording should be promoted without a qualified final-pipeline comparison.

## Second-pass interaction review

| Area | Current assessment |
| --- | --- |
| Classification with G5/G9/G15 and saved reasons | F1 remains. Same measured classification is used by QA and saved G5 reasons. Do not solve it only in ItemPane. Literal slash/slot and unique-color G15 limits remain; the gate does not prove motif placement or completeness. |
| Held connector, padding, attachment and hanging review | Original connector and negatives hold, including explicit padded-coordinate control. Loop admission only adds kept components, so it terminates for finite masks. Known one-link / off-body ownership assumptions remain. No performance bound for all pathological noise masks is claimed. |
| D1 cross-view / dark label / persistence | Mixed gray plus dark remains `smudge`; front charcoal is uncertain. F2 concerns durable transport of that uncertainty, not the pixel detector's label. Four-key extraction qualification is not inferred from a key-independent label helper. |
| Partial saves / prefix recovery / cache identity | Node and browser controls hold. Free recovery uses completed exact request identities; seed/body changes still refuse unmatched results. Message-prefix coupling remains structurally brittle, but no additional reachable prefix defect was established. No generic error rewrite is justified by that observation alone. |
| Naming with slot defaults and prompts | Count stripping and subject parsing fix the cited cases. Display shortening does not replace the generation prompt. Ambiguous grammar remains editable; do not replace one finite vocabulary with an unqualified larger dictionary. |
| Chroma retry, shared fitting and quotes | Measured key flows through consent, quote, request and replacement matching. Current full tests pass; no automatic quality reroll was found. Green-only dark-stroke qualification remains narrow; prior stored-corpus results do not become semantic pixel labels. |
| Rectangular prices and optimizer | Input validation and representative layout/edge controls hold; quote/request share the layout. Mean-side billing remains inferred. This review made no new billing call or receipt audit. |
| First-open hash exclusion / normalization / concurrent reviews | Existing regression suites pass. Prior full-path evidence rejects ordinary persistent split loss; interrupted-publication/reopen caveat remains. No new corruption finding was established by reading a missing hash alone. |
| Design, theme and disclosures | No theme implementation/dependency change in the guidance commits. Grip disclosure is now correctly scoped to layering; cleanup can still remove other parts. No fresh aesthetic or screen-reader audit was performed. |

### Complete chronological disposition

This table includes all 33 Claude commits. The previous report's evidence remains useful; this pass checked their current interactions rather than claiming 33 independent live experiments.

| Commit | Disposition in this pass |
| --- | --- |
| `45d0b4e0` | Held floor / dark patches: original buckle control retained; R1 replay corrected; R3/F2 follow-through checked. |
| `abcecf0e` | Measured retry key: consent/preview/dispatch and shared fit caller reviewed; no additional defect established. |
| `edc604be` | Whole-word/action classifier: F1 residual bypass; original eye case now corrected. |
| `236876cc` | Hanging/waving/occlusion warnings and summary paths reviewed; no additional confirmed defect. |
| `cd107b77` | Frame-count research checked against current batch controls; not a provider-capacity guarantee. |
| `38fc7f02` | Design research/guidance remains research, no implemented redesign. |
| `41411fca` | First-open version exclusion reviewed with normalization; previous bounded interruption caveat retained. |
| `a461988d` | Self-contained design guidance read as instructions, not proof of visual improvement. |
| `82b0f424` | Naming / hand summary: R5 fix replayed; full prompt remains separate. |
| `258afdb0` | Bronze-versus-product guidance boundary retained; no production theme delta. |
| `2dbbbf80` | Post-await concurrent result spread remains correct; existing browser/unit checks pass. |
| `a2313016` | Historical live evidence not re-run; offline counterexamples remain independent of its success cases. |
| `15e6d993` | Flat hidden back view allowance remains an explicit warning with prompt-visibility limits. |
| `4bc9f3fb` | Cross-view/word rules reviewed with new dark labels and subject parser; R3/R6 bounded verdicts above. |
| `77b863e9` | Thin light-item guard reviewed with deep-tone follow-up; no newly confirmed stored-output defect. |
| `0baa1ac3` | Mean-side price inference and 336 edge checked offline; no exact billing claim. |
| `e951da85` | Partial-direction retention participates in the passing combined browser recovery. |
| `e4cc1a69` | Early hand A/B evidence retained with dress-versus-full-pipeline distinction. |
| `e3a8834c` | Small-blade historical evidence remains narrowly qualified; not all thin features. |
| `b1175564` | G15 warning/scoping/summary fields rechecked; color-presence limitations remain. |
| `83231919` | Resumption note is historical state, not an instruction to spend in this review. |
| `f7c771fa` | Layout search's invalid-input hang is fixed; valid alternate layout survives. |
| `fa315b2a` | Rejected upright off-hand prototype remains rejected; no prototype promoted. |
| `666f489a` | Exact saved skeleton recovery verified in node and browser with no requests. |
| `4981d2cd` | Rejected blind flip remains rejected; valid natural torch is still a required negative control. |
| `2fbe38eb` | Slash detail scope retained; no claim of all-action design preservation. |
| `d8030391` | Green-key straight dark-stroke behavior remains qualified separately from bent/ring/other-key cases. |
| `8ea08c28` | Historical flip ledger entry read without treating it as another implementation test. |
| `2611cc34` | Grip/side-view/mirror disclosures checked against the subsequent scoped cleanup language. |
| `f26751bf` | Padding dress-only result does not prove all sizes have equivalent wording; F3 demonstrates a dispatch boundary. |
| `0992bae7` | Straight-down negative result informs the proposed controlled comparison; no production change. |
| `1a3534b9` | Minimal/negative wording report challenged above; retain current wording provisionally. |
| `19646f09` | R1–R7 correction matrix above: five held, two partially held; F2 introduced here, F1 incompletely repaired. |

## What ran, failed and was skipped

Repository-pinned Node **24.22.1**, npm **11.19.1**, existing dependencies/browser cache. Keyless servers only; ports 5497/5498 for the full suite, 5507/5508 for the first R4 run and 5517/5518 for the corrected R4 run. No agent server was started; the reviewer did not inspect `.env` or access a token. The review preload rejects real Node PixelLab HTTP/fetch transport; the owned browser config blocks unmocked external traffic through a dead proxy/DNS rule. Existing tests retain local route mocks. The dedicated R4 context additionally aborts and counts every nonlocal HTTP attempt and recorded none.

| Executed check | Result |
| --- | --- |
| `npm run check` | Pass; zero Svelte errors/warnings, TypeScript checks succeed. |
| `npm test` | **2,004 passed, one existing skipped**, 167 files, about 12 seconds. |
| Full E2E with owned offline wrapper | **248 passed**, about 6.7 minutes; includes Studio, selftests, concurrency and native crash recovery. |
| Dedicated combined R4 browser check | **1 passed**, about 10.4 seconds total. Offer survives reload, eight saved frames recover, quote 6 to 3, no new jobs/external attempts/Connect. |
| Original mixed-recovery node controls | **2 passed**, 68 unrelated generated cases filtered. Former failing prefix expectation now passes. |
| Original authored image/lexical replay | Before/after results retained; original R1/R2/R3/R5/R6 cases behave as stated in the matrix. Historical snapshots are exact source exports. |
| Adversarial probe | Residual F1 demonstrated; 12 rigs, 40 slash subsamples, four projected KayKit death directions, padded held control, 108 grid cases and 60 prompt combinations recorded. |
| Focused warning / request-capture cases | **One intentionally failing durability assertion (F2), one passing prompt-boundary control (F3)**; 52 unrelated fixture cases filtered. |
| `node scripts/bench.ts` without `--write` | Exit zero, all **20** registered rows report `ok`. This means expected report behavior, not that every image passes quality: e.g. the known green jester still has 40 failed frames. No fixture/report was rewritten. |

**Stored-rig claim audit:** 19/20 slash directions and 38/40 even/odd four-frame subsamples are reproduced. All 47 non-slash rows are nondecisive, but they comprise **41 walk/idle, four rest and two hurt** rows. The response's “47 walks and idles” wording is imprecise. Four newly projected c27man KayKit death directions remain decisive; this is projection/classification evidence, not new generated death pixels. Some of the 12 rigs are ignored local exports; their paths/hashes are retained and a different machine may not have them.

**Review-harness failures, corrected without production edits:** the first owned browser config used a `.ts` module outside the app package and failed to load `import.meta`; changing it to `.mts` fixed that. A second startup found the inherited server's working directory wrong; setting it explicitly to `app/` fixed it. Neither reached tests. The first R4 check expected the lower-level sentence “views were saved.”; the real UI correctly says “views were saved (East); Generate new frames requests only the missing ones.” Correcting that review assertion retained all behavioral assertions. That first run already showed successful recovery; its mismatch is not a product defect. The F2 failing assertion remains failing and is not hidden by these reruns.

Commands, from the repository root with pinned Node on PATH:

```text
node docs/reviews/2026-11-07-session-counter-review/replay-original.mjs
node docs/reviews/2026-11-07-session-counter-review/adversarial.mts
node docs/reviews/2026-11-07-session-counter-review/prepare-warning-probe.mjs
node docs/reviews/2026-11-07-session-counter-review/prepare-browser.mjs
node docs/reviews/2026-11-07-session-counter-review/inventory.mjs
```

From `app/`, set workspace-owned TEMP/TMP and preload `no-pixellab.cjs` through `NODE_OPTIONS=--require=<absolute path>`:

```text
npm run check
npm test
node scripts/bench.ts
node node_modules/vitest/vitest.mjs run --config ../docs/reviews/2026-11-07-session-counter-review/vitest.config.mjs -t 'independent (warning|prompt) review:' --reporter=json --outputFile=../docs/reviews/2026-11-07-session-counter-review/warning-vitest.json
npm run e2e -- --config ../docs/reviews/2026-11-07-session-counter-review/playwright.config.mts
```

For the dedicated browser run, first generate its fixture, then set `PD_REVIEW_R4=1`, unique `E2E_PREVIEW_PORT`, `E2E_DEV_PORT`, `TEST_OUTPUT_DIR`, the installed `PLAYWRIGHT_BROWSERS_PATH`, and use the same E2E command with `--workers=1`. PowerShell sets each variable using `$env:NAME='value'`. Review temporary modules live in ignored `temp.local/`. Full logs/traces remain in ignored `app/test-results-session-review-*` paths. Compact committed result JSON and generators are the portable evidence.

**Skipped or not established:** every PixelLab call, all fresh generations and balance; reinspection of unavailable raw latest-wording images; a new billing/receipt audit; a paid prompt replacement; a full pixel-ownership ground-truth corpus; an independent rerun of every newly added production test against the old revision (the original function controls were replayed instead); new manual hosted-browser/aesthetic/screen-reader checks; repeated full-suite load stress; every corrupt-project UI path; provider incidence rates and universal fairness claims. No unused user browser tab was opened or closed; existing localhost tabs were left alone.

## Claude's response requested

Have an independent subagent reproduce or refute F1 and F2, and assess F3 separately as preexisting. Preserve the controls that demonstrate the original repairs. For a rejected finding, identify which evidence or reachability assertion is wrong. For an accepted finding, fix the shared path with a production regression, explain the semantic tradeoff and report required checks. Do not convert synthetic evidence into a provider error-rate claim, remove useful guards, spend credits or promote the paid wording proposal without the owner's authorization.
