# Item quality and generality challenge

Review boundary: commits after `bb830dfb`, through pinned HEAD `8ea08c28`. This review examines item cleanup, move classification, hidden views, design/detail checks, lexical defaults and QA summaries. It does not edit app code. Grid layout/pricing, provider behavior, queue/storage and UI rendering have separate reviewers.

## Evidence method

[probe.mts](probe.mts) exports only `app/src` and `app/package.json` from both pinned revisions into an ignored `temp.local` directory. It executes the snapshots' actual pure exported functions with independently authored synthetic fixtures. [results.json](results.json) contains values and layer hashes. Snapshot source hashes identify each `items.ts`; utility dependencies come from the same revision, not the working tree. The small `heldSlotFor` and `itemNameFrom` functions are extracted verbatim from each snapshot's model source and executed without importing unrelated UI/runtime code.

There are no provider-generated counterexamples in this artifact. These are deliberately controlled valid/invalid cases outside the visual benchmark used to choose the new rules. Intended ownership, source pose and requested details are declared by the fixture author. The tests expose possible behavior and regressions; they do not estimate their frequency in PixelLab results.

The existing eight relevant unit files were also executed on the checkout at the pinned source revision: **50 tests pass**. Their success is compatible with the counterexamples below because those tests do not contain these fixtures. No generations, model installations, credentials, account access or browser actions were used.

## Confirmed findings

### IQ1. P2: one valid-schema measured outlier disables held-shape checks for a whole walk

Introduced by `edc604be`. Relevant pinned lines: `app/src/lib/items/items.ts:862`, `:875`, `:877`, and `:1140`.

`decisiveAction` trusts a measured sequence when all its poses satisfy `hasAll`, then permits any one joint in any one frame to exceed the displacement threshold. `isAction` consequently disables G5/G9 locomotion checks for the complete clip. Completeness and finite in-canvas coordinates do not establish that every estimated facial point is reliable.

The fixture has six identical requested poses and a wrist-centered, one-sided blade. A single frame reverses the blade by 180 degrees while the arm remains unchanged. The invalid variant changes only one measured `RIGHT EYE` coordinate in a different frame to `(0.95, 0.95)`. All 18 labels remain present and all measured coordinates remain within bounds. The body/item rasters and requested poses are identical between the defective controls; recorded layer hashes prove that only estimator metadata changed.

| Case | Baseline | HEAD |
| --- | --- | --- |
| Valid static blade | Pass | Pass |
| One reversed blade frame, normal measurements | G9 failure | G9 failure |
| Exact same reversal, one measured-eye outlier | G9 failure | **Pass, no warnings** |

This is a synthetic estimator-error counterexample, not an observed provider frame. It proves that an unrelated accepted-schema measurement can turn a demonstrable held-item failure into clean QA.

The probe also runs the snapshots' `clipQa` on identical synthetic frozen humanoid body frames with these requested/measured sequences. Its default arm adherence is zero and it returns no source-clip failures or warnings, including with the measured-eye outlier. Thus the default body-clip QA does not itself reject this facial measurement error. This is still a helper-level reproduction, not a claim of a complete paid Studio session.

**Minimum fix direction to challenge:** distinguish coherent action evidence from isolated estimation disagreement. Preserve action handling for real slashes, casts and falls, and preserve the earlier swapped-hand/jump controls. A single contradictory facial estimate should not silently authorize bypassing whole-clip shape checks. Robust multi-joint evidence, agreement checks against frozen/requested motion, or an explicit uncertain classification with review are candidates; no one numeric threshold adjustment has been qualified here.

### IQ2. P2: applying the held component floor before graph traversal deletes a legitimate terminal part

Introduced by `45d0b4e0`. Relevant pinned lines: `app/src/lib/items/items.ts:568` and `:580`, consumed by `attachHeld` and `postProcess`.

The valid fixture is a hand-authored stylized flail with a deliberately dotted chain. Its intended components are declared independently of any generator or classifier:

| Part | Inclusive coordinates on a 64-pixel canvas | Pixels | Intended owner |
| --- | --- | --- | --- |
| Main handle/body | x 8–17, y 20–29 | 100 | Held object |
| Dotted chain link | x 20, y 24–25 | 2 | Held object |
| Terminal weight/head | x 23–26, y 22–26 | 20 | Held object |
| Gripping wrist | (10, 24) | N/A | Reference/requested pose |

There are two blank columns between the main component and link, and two between the link and head. This is within the existing 3-pixel attachment-neighborhood mechanism, but the terminal head is not directly near the main component. An opaque body and bent arm reach the handle above the component gaps; no body pixels bridge those gaps, so invented torso occlusion does not supply the connection. The complete same standing design is passed through `postProcess`; the function has no component-level approved-design check to distinguish it from newly generated clutter.

The new size floor is 15 pixels. The 2-pixel link is below that floor and far from the 6-pixel wrist exception, so it can no longer provide graph connectivity to the 20-pixel terminal head. The head itself exceeds the size floor, yet is erased.

Each case runs six identical-pose candidate frames through `postProcess`, with the matching six-pose rig. Counts below are per frame, and every frame has the same result. This also exercises the clip-median dropped-item repair path; a constant loss is not repaired by that relative check.

| Case | Baseline result | HEAD result |
| --- | --- | --- |
| Intended dotted-link flail, 122 input pixels | 120 pixels; terminal head's 20 pixels retained | **100 pixels; terminal head entirely deleted** |
| Invalid detached head, with link absent | Head removed | Head removed |
| Invalid small fleck across torso pulling an unapproved buckle | Incorrectly retains the 20-pixel buckle | Correctly removes buckle |

The baseline already removes the 2-pixel chain link, so this is not a claim that the baseline perfectly preserves the design. The new regression is the additional loss of the independently labeled 20-pixel terminal part. No accompanying cleanup warning is produced for that deletion.

The later copy-only tail commit `2611cc34` does not change these item-code blobs. Its known-issues explanation of grip occlusion says “Nothing is cut from the item.” That explanation should be scoped to grip/layer composition, not read as a general guarantee about extraction and cleanup; this counterexample shows actual cleanup deletion. This is documentation impact of IQ2, not another code finding or an expansion of the probe's pinned source range.

The third control reproduces the reason for the original fix: reverting all component-floor behavior would reintroduce body repaint. **Minimum fix direction to challenge:** separate connectivity evidence from retained-pixel ownership, using trusted source/pose support or review when a discarded connector strands a substantial approved part. Do not indiscriminately preserve small flecks or all nearby body blobs. A replacement must retain the valid terminal head while still rejecting both invalid controls.

### IQ3. P2: the dark-blotch and cross-view rules false-flag an explicitly requested front-only charcoal motif

The dark-interior behavior changes in `45d0b4e0`; the later cross-view change `4bc9f3fb` does not resolve this case. Relevant pinned lines: `app/src/lib/items/items.ts:1263` through `:1286`.

The fixture is an otherwise blue tunic with a 9 by 9 `[20,20,20]` medallion on the front. Its instruction is “a blue tunic with a charcoal medallion on the front.” The other two views contain only the blue garment. The medallion is intentional and correctly limited to its requested view.

| Observation | Baseline | HEAD |
| --- | --- | --- |
| Front gray-share metric | 0 | 0.109375 |
| D1 flags over front/side/back | false / false / false | **true / false / false** |
| Same charcoal motif intentionally present in every view | N/A | All views pass |
| Same front patch under a plain-blue instruction | N/A | Correctly flags the unrequested patch |

`charcoal` does not match the neutral-word exemption. A 3 by 3 dark interior is treated as a blotch, and the lowest-gray alternative view makes the intentionally asymmetric motif suspicious. A neutral decorative part is not required to appear in every view.

The existing [word-list review](../../../research/2026-11-07-paperdoll-cycle/review-word-lists.md) already discloses the broader problem with asymmetric off-white emblems. That off-white case is not a new regression, and the probe records baseline/HEAD agreement for it separately. This new charcoal fixture isolates the additional dark-interior path.

**Impact boundary:** D1 marks the design for review/failure metadata and can invite a paid retry. It does not itself automatically buy a retry, and pose calls still continue. Do not describe it as necessarily preventing all generation or directly causing a charge.

**Minimum fix direction to challenge:** do not equate an asymmetrical neutral patch with corruption merely because it contains a dark interior. Preserve detection of the unrequested-blotch control. Treat ambiguous motif/outline evidence as review or incorporate actual intent/reference evidence. Adding only `charcoal` to another finite dictionary would not address the general issue.

### IQ4. P3: the new description-head parser names “a pair of leather boots” as “Pair”

Introduced by `82b0f424`, `app/src/studio/model.ts:143`. The determiner removal consumes only `a`; the subsequent new `of` delimiter then truncates `pair of leather boots` to `pair`. Baseline returned `Pair of leather boots`; HEAD returns `Pair`.

The intended lantern case improves from `From a short chain` to `Iron lantern`. Existing tests cover `pair of leather boots` without a preceding article, not the common compound determiner. This is a label regression, not lost artwork or billing damage. Normalize the complete determiner phrase before attachment splitting while preserving the lantern improvement. Do not replace the full description/prompt with the shortened label.

### IQ5. P3: new off-hand noun aliases can override the actual item noun in an attachment clause

Introduced by `4bc9f3fb`, `app/src/studio/model.ts:33`. `heldSlotFor('a steel sword with a scutum emblem')` changes from `main_hand` to `off_hand`, while `heldSlotFor('a scutum')` changes to the intended `off_hand`.

The classifier scans the entire description for dictionary nouns, not the described object's head. The comment excludes `aegis` because it can name a crest, but added aliases can also occur in decorations. The slot is an editable default, so this is not an unavoidable wrong-hand render; a casual user retaining it can receive a different hand/prompt/gate policy.

The `shield-breaker axe` control improves to main hand; the spaced `shield breaker axe` remains off hand in both versions and is not a new regression. Challenge head-versus-decoration handling rather than only adding more names. Preserve direct shield/bow defaults and the explicitly tested hyphenated cases.

## Bounded behavior, not new confirmed regressions

### Hidden flat back attachments

`hiddenViews` at `items.ts:681` accepts no prompt. Its new small, body-overlapping north pack plus behind-center side evidence can permit an empty south keyframe. In the synthetic pair, baseline G4 fails for an absent front; HEAD returns **warn**, with `no item in this view ... check that the view hides it`.

That is useful for a plain flat backpack. It cannot distinguish the same image output when the actual request requires visible front straps or a chest clasp. This is a semantic coverage limitation worth challenging, but it is not a clean pass and does not delete existing pixels. An item that later appears in a view classified hidden still triggers G4. Any tighter policy needs a valid flat-backpack control and an explicit required-front-detail control; a blanket restoration of the old missing-front failure would reject valid hidden equipment again.

The 12-pixel minimum, quarter-body-area cap and side/back ratios are hand-tuned eligibility bounds, not proof of all compatible backpacks or all body proportions. No claim of universal hidden-view inference is qualified by the synthetic tests.

### G15 motif presence and resolution limits

The new detail check is explicitly warning-only and color-presence based. The probe confirms:

- An intact 16-pixel gold motif at 64 pixels produces no lost-detail result.
- Removing all 16 pixels flags it.
- Removing 15 pixels while leaving one same-color pixel does not flag it.
- A four-pixel native motif at 128 pixels is below the 16-pixel threshold and is not judged; a 16-pixel motif there is judged.

These are important limits, not undisclosed new detector guarantees. Same-color material collisions, motif placement, occlusion and shape are not established by this check. Exact `slash` plus supported slot conditions narrow action coverage; they are not proof that every similarly named custom move has the same visible surfaces. Preserve the distinction between a measured review aid and universal design preservation.

### Move vocabulary and frame batching

The new whole-word matcher correctly avoids substring cases such as `rune-blast`, and existing unknown-name-as-action behavior remains a bounded fallback. A finite gait dictionary cannot establish the true semantic class of all imported names. IQ1 is the stronger confirmed regression because it removes an existing failure on identical pixels.

For requested counts 1, 2, 3, 14, 15, 16, 29, 30 and 31, the current balanced batches cover every cell and stay at or below 15 submitted poses. One/two-pose batches repeat the final pose to meet the three-pose minimum. This probe found no frame-count regression; it does not qualify provider billing or every unsupported input.

### QA summary aggregation

The newly introduced detail and hanging counters are included in `summaryOf`/`mergeQa`; per-clip directional checks are attached in `run.ts`, and the aggregate replacement tests pass. No additional summary-aggregation defect was confirmed in this review. Queue publication and concurrent-save behavior are owned by another reviewer; this is not an end-to-end storage approval.

## Chronological coverage within this ownership

| Commit | Quality-related scope and disposition |
| --- | --- |
| `45d0b4e0` | Held floor graph traversal and dark interiors: IQ2/IQ3; valid and invalid controls both retained in evidence |
| `edc604be` | Move words and decisive motion: IQ1; preserve existing substring, swapped-hand and jump improvements when fixing |
| `236876cc` | Hanging, waving and body-hidden held-item review: source and existing tests examined; sensible uncertainty warnings, no new independently confirmed regression |
| `82b0f424` | Description-head naming and hand-summary tag: IQ4; tag preserves existing human-readable reason path |
| `15e6d993` | Hidden flat back views: direct G4 fail-to-warning probe, prompt/geometry limits documented above |
| `4bc9f3fb` | Gray comparisons and waist/off-hand words: IQ3/IQ5; existing asymmetric-neutral limitation distinguished from new charcoal path |
| `b1175564` | Detail-color warning and summary propagation: measured narrow presence/resolution limits, no claim of semantic ownership |
| `2fbe38eb` | Extension to literal slash on over-body slots: source limits examined; not universal action visibility qualification |
| `abcecf0e`, `0baa1ac3`, `f7c771fa`, `2dbbbf80` | Chroma retry/UI state or grid pricing/layout intersects these files but is covered by the respective other reviewers; this report does not approve those domains |

Waist negation now avoids the prior `no sleeves and a belt` false negative, but remains a finite grammatical approximation. No further new chronology-specific regression was confirmed here; examples such as `no pockets on the belt` can still be ambiguous under both old and new rules. Do not turn such inherited boundaries into claims of a newly introduced bug.

## Reproduction and requirements for a counter-review

From the repository root, use the repository-pinned Node 24 executable:

```text
node docs/reviews/2026-11-07-post-bb830dfb/item-quality/probe.mts
```

The script reads only the two pinned application-source trees and its own synthetic fixtures. It writes ignored snapshots and its result JSON. It does not load a reusable instruction document, call a provider, or modify application source. Node may print the experimental TypeScript-stripping warning for the isolated lexical functions.

The focused unit command, run from `app/` with `TEMP`/`TMP` pointing to the owned ignored `temp.local` directory, was:

```text
npm test -- move-classification.test.ts held-detached-parts.test.ts held-hang-wave.test.ts hidden-back-views.test.ts design-detail.test.ts design-gray.test.ts item-name.test.ts qa-summary.test.ts
```

A fresh reviewer should independently check the range, source hashes, fixture ownership declarations, wrist/coordinate convention, and identical pixel hashes. Challenge whether the stylized dotted-chain example is in the product's supported domain; do not substitute a screenshot for that contract decision. Try alternate dimensions, materials and source names, and test the original invalid buckle, detached head and genuine action controls against any proposed fix. Reproduce the actual application entry path where relevant before claiming end-user impact. Treat synthetic coverage as a proof of possible behavior, not a measured provider failure rate.

No app fixes, paid tests, installations, commits or pushes were performed by this review subtask. Final integration, duplicate-finding reconciliation and the broader review handoff belong to the coordinator.
