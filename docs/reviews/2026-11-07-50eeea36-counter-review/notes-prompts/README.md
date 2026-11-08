# Independent F2 and F3 challenge

November 7, 2026. Reviewed `50eeea36446f146f6e499a6325843de8ffb77e96` against `6006a55c`. **Both corrections held in these offline checks. No new confirmed defect was found in this lane.** Application source/tests, board state, installed packages and credentials were untouched. No PixelLab request, including balance, was made. The reusable improvement-cycle document was not read.

## F2: accepted dark-note persistence held

Sources: `app/src/lib/items/run.ts:457`, `:574` and `:575`; saved-item readers in `app/src/studio/ItemPane.svelte:89` and `model.ts`; generic manifest export in `app/src/lib/export/generic.ts:119`.

The independent fixture runs actual `runItem`, `acceptItem`, `mergeClip`, `exportManifest`, export `validate` and `healthOf`, using the tracked automatic-recovery test's fully mocked queue/storage. It authors dark, gray and clean three-view garments separately. It performs two complete south-view replacements after Keep, then exports the retained item.

| Control | After Keep | Two replacements | Export | Final health |
| --- | --- | --- | --- | --- |
| Dark-only front patch | One uncertain dark note | One note, unchanged | Same note; validation passes | Accepted |
| Gray front smudge | One gray-smudge note | One note, unchanged | Same note; validation passes | Accepted |
| Clean colorful garment | No note | No note | No note; validation passes | Clean |

The dark text contains no semicolon delimiter, remains one ItemPane input reason, and translates to “A dark patch is not seen in the other views; check that it is part of the design.” It is not converted back to a gray smudge. Retaining a generic Accepted health state after later clean clip QA depends correctly on `designWarnings`, not on every underlying QA summary retaining an accepted status.

[notes-results.json](notes-results.json) records exact notes, merge counts and export results. This is actual manifest serialization through the export builder and export validation; it is not a fresh browser Keep/reopen session or an engine import. The current schema and filter only have this D1 warning path. A hypothetical future different `D1 ` warning matching the same prefix is not a new demonstrated bug.

## F3: shared route-based wording held

Sources: `heldSkel`, `padOf` and `dressItem` in `app/src/lib/items/items.ts:156`, `:158` and `:173`; actual dispatch in `run.ts:234`; preview builder in `apiPlans.ts:58`.

The independent test captures the real dress request in the mocked queue before output or transport. It compares descriptions with `draftPlan` for every case and with `itemPlan` for default skeleton-route cases. Native source PNG dimensions match each rig cell.

- **36 actual request/preview combinations:** sizes 64, 224, 240, 254, 255 and 256; main hand, off hand and worn back slot; skeleton and anchor methods.
- Both hands keep the intended hand and single-item clauses at every tested skeleton size, including zero-padding 255/256.
- Worn and anchor requests keep their plain descriptions. No global held wording is accidentally added to them.
- Draft previews match actual request descriptions in all 36 cases. Priced item previews match in the 18 default-skeleton cases. Anchor method is explicitly forced in the other cases, so those do not claim default `itemPlan` selects anchor on a skeleton-ready rig.
- **14,640 pure helper comparisons:** all 16 slots, three methods (`skel`, `anchor`, unspecified), and every integer size 16 through 320. There are 132 changed descriptions, all and only held skeleton cases at zero padding; the other 14,508 are unchanged. Sizes outside the valid app range test helper behavior only, not supported product sizes.

[prompt-results.json](prompt-results.json) records canvas dimensions, method, slot, lengths and parity. This establishes dispatch semantics and no unrelated wording change. It does not establish image quality on 255/256, model hand adherence or universal prompt effectiveness.

## Regression-test claim independently verified

The coordinator exported the exact old/new application sources into the parent review's ignored `temp.local/{before,after}/app/src`, with package metadata. [prepare-regressions.mjs](prepare-regressions.mjs) takes the current tracked production `automatic-recovery.test.ts` unchanged except redirecting source import/mock paths to those exports. Only the two newly added F2/F3 regression titles are selected.

- At **6006a55c**, F2 fails because the saved note is undefined; F3 fails because the 256-pixel main-hand description has no requested-hand clause.
- At **50eeea36**, both pass.
- Total: **two expected old-source failures, two new-source passes**; 104 unrelated cases filtered. [regression-results.json](regression-results.json) retains both sides rather than reporting the overall expected-failure command as a clean suite.

The additional independent extended checks above both pass on current source; 54 unrelated tracked fixture cases were filtered. [vitest-results.json](vitest-results.json) records that separate run. These counts overlap with production suites and must not be added as new unique application test coverage.

## What is worth doing about anchored wording

The unchanged anchor route lacks hand and one-item clauses. That is a worthwhile **controlled experiment**, not a correction proven by the skeleton-route evidence. The full S5 phrase includes downward orientation and an arm-freeze direction selected for a different route. Applying all of it to every packed anchor frame would add several unqualified constraints at once.

Propose a narrow anchor-only variant naming the selected hand and exactly one instance of the requested item in each frame. Keep the existing frame-local body/pose preservation and reference-lock instructions. Leave orientation and the full S5 arm phrase unchanged unless separately qualified. Do not add a mandate to erase existing opposite-hand/base pixels under the guise of “nothing in the other hand.” Compare both slots and ordinary weapon, shield and upright/nonweapon examples on exactly frozen inputs; qualify posed final layers, not only dressed standing art.

No proposal is executed here, and no budget or paid action is approved by this document. An explicit owner-approved plan is necessary before such a provider comparison. No new setting or general prompting abstraction is justified merely by identifying this hypothesis.

## Preexisting hidden-view note follow-up

The “no item in this view; check that the view hides it” G4 note remains transient. The current F2 change deliberately saves D1 design notes only; it does not introduce the G4 loss. The coordinator additionally observed that `plainReason` currently translates a generic `G4 ` message as an item-missing fault. Merely persisting the existing hidden-view string would therefore turn legitimate occlusion into misleading saved copy.

A future free correction should keep the view scope and uncertainty, distinguish hidden-view review from an actual missing-item failure in translation, and test Keep/reopen/export plus a truly missing item. This is an acknowledged preexisting follow-up, not a new defect attributed to `50eeea36`, and it needs no generation to test its persistence/translation mechanics.

## Independent challenge of the motion lane's new finding

Read `../motion/probe.mts` and the initial result JSON. A coherent 45-degree upper-body dodge about the hips with stationary knees can be a valid imported action even if its ID contains `run`. The existing action override is specifically intended to supersede gait words when the motion is demonstrably an action. A rename-only `dodge` control strengthens the evidence that identical artwork should not become defective merely because of a gait word.

The agent's upright torch is physically defensible as wrist articulation preserving world-up orientation during a lateral dodge. However, it does not demonstrate an observed provider output, and current standing S5 wording itself asks items to point downward. I asked the motion reviewer to keep the claim scoped to independently authored/imported valid artwork rather than a paid production success, and to verify `postProcess`, source `clipQa`, bone lengths, bounds and grip adjacency before finalizing P2. At this lane's completion that strengthened replay was pending; the coordinator and motion lane own its final result. Do not blindly roll back the knee guard or remove the single-hip negative control.

## Reproduction and setup caveats

Run with repository-pinned Node 24.22.1 and existing dependencies. From the repository root:

```text
node docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/prepare.mjs
node docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/prepare-regressions.mjs
```

From `app/`, set owned ignored TEMP/TMP and `NODE_OPTIONS=--require=<absolute path to docs/reviews/2026-11-07-session-counter-review/no-pixellab.cjs>`:

```text
node node_modules/vitest/vitest.mjs run --config ../docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/vitest.config.mjs -t '50ee ' --reporter=json --outputFile=../docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/vitest-results.json
node node_modules/vitest/vitest.mjs run --config ../docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/regression.config.mjs -t 'a kept item saves its dark-patch review note|a held dress keeps its hand wording' --reporter=json --outputFile=../docs/reviews/2026-11-07-50eeea36-counter-review/notes-prompts/regression-results.json
```

`prepare-regressions.mjs` requires the coordinator's pinned source exports; it does not create them or substitute current source silently. Test generators otherwise reuse the current tracked fixture, so inspect drift before interpreting a future run. They never alter that production fixture.

The first extended export check failed on fixture setup: its source mock intentionally lacks a production slot ladder and does not load newly saved PNG blobs into a live project-image map. The review generator now supplies the actual SLOTS ladder and loads the generated blobs before export validation. The assertions were retained; these two setup corrections were not application fixes or discovered product failures. Logs are ignored under `app/test-results-review-50ee-notes*`; portable measurements and reports are committed review evidence.

Not run by this lane: browser interaction, broad application suites, paid provider calls, all past corpus/image comparisons, or visual labeling of new model outputs. The coordinator owns wider validation. No commits, pushes or board changes were made by this subagent.
