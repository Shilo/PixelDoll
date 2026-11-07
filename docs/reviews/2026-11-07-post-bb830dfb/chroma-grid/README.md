# Independent chroma and repair-grid review

Reviewed application deltas after `bb830dfb` through `8ea08c28`, with the coordinator's later copy-only tail `2611cc34`. Chroma, item-grid and plan sources were asserted unchanged from the functional pin before execution. The excluded execution handoff was not read. No application edits, installs, account access, provider requests, commits or board mutations were performed.

## Finding CG1: zero-width repair input now hangs instead of failing

**Severity: P3, introduced invalid-input robustness regression.** Commit `f7c771fa` changes `repairGridLayout` so a nonfitting qualified grid skips `gridEstimate` and enters the column search. At [items.ts:92](../../../../app/src/lib/items/items.ts#L92), `Math.floor(512 / cell.w)` becomes `Infinity` for zero width; decrementing `Infinity` does not terminate the loop.

Reproducer: `repairGridLayout({ w: 0, h: 64 }, 8, 1)`.

The isolated historical-module check uses actual source from each revision, with only relative imports redirected to the existing application dependencies. Modules are stripped by Node's TypeScript API. The child receives its code through stdin and has a 2.5-second timeout.

| Revision and control | Result |
| --- | --- |
| `bb830dfb`, 64×64 | Returns 256×192, 10 generations, four columns; approximately 102 ms. |
| `bb830dfb`, 0×64 | Throws the intended invalid-grid-arguments error; approximately 116 ms. |
| `8ea08c28`, 64×64 | Returns the identical valid layout; approximately 102 ms. |
| `8ea08c28`, 0×64 | Does not return; subprocess terminated after approximately 2,520 ms with `ETIMEDOUT`/`SIGTERM`. |

**Reachability is bounded.** ZIP imports reject nonpositive layer sizes in `store/import.ts` and invalid rig sizes through `validateRig`. I did not demonstrate an ordinary validated-import or normal creation path to a zero-width layer. `loadProject` trusts persisted manifest values, and the move estimate/API preview callers pass a first layer's cell or the rig cell into the helper. A malformed persisted record can therefore encounter the synchronous estimate before execution's dimension checks. This is not evidence of a valid-project hang or a paid malformed request.

**Suggested correction for counter-review:** validate dimensions and counts before deriving a loop bound. Share argument validation with `gridEstimate` if useful, but do not simply invoke its default four-column bounds check first: a 160×160 nine-cell job intentionally needs the newly supported three-column layout because four columns exceed 512. Add a bounded zero-width rejection test plus that valid alternative-layout control. No correction was made in this review.

## Grid pricing and layout: substantial negative checks passed

An independent layout oracle enumerated **14,288 feasible configurations** across square and rectangular cells, sizes including 32, 64, 80, 86, 96, 112, 120, 128, 144, 160 and 256, one through 40 target frames, and zero/one/two/four protected references. It implements the declared preference independently: retain the qualified grid unless another is cheaper or same-price/lower-tier, then compare generation estimate, plan tier, area, aspect difference and column count.

- Zero selected-layout mismatches.
- Zero estimated prices below the previous area formula across the evaluated candidate layouts.
- Native canvas dimensions and stated plan-side policy agree on valid cases.

This checks implementation consistency under the adopted price model. It does not prove the provider computes rectangular prices using arithmetic mean side length.

The raw `spikes/api/out/x28/calls.jsonl` audit independently matches seven submitted 480×240 inpaint requests to completed polls. All seven report 25 subscription generations, and the current helper predicts 25. Request hashes, IDs, usage and the source ledger hash are retained in [results.json](results.json). No new provider call was needed. The checked receipts support the correction to the former 15-generation area estimate for this shape.

**Pricing wording note:** the source's `never low` statement is conditional on the mean-side model, monotone tier interpretation and inferred edges. A finite receipt set cannot establish a universal pricing guarantee for unobserved aspect ratios or future provider rules. This review independently recovers one of the reported eleven unique shapes, not all eleven. The existing user-facing `Est.` labels and dollar-billing disclosure are appropriate; I did not find a hidden exact-price promise in the inspected Move and Item controls. Keep the inference wording and avoid representing the optimizer as proven cheapest in provider billing.

## Chroma: real stored outputs show the documented bounded delta

The independent probe loads actual historical `chroma.ts` at `bb830dfb`, `77b863e9`, `d8030391` and `8ea08c28`. Only its PNG import location is redirected; source hashes are retained. Current registered raw/base pairs from the frozen benchmark are supplied identically to old and current `chromaLayer`. The comparison isolates chroma extraction before subsequent clip postprocessing.

Across **17 applicable stored chroma cases and 627 cells**, the combined changes add 11 mask pixels, drop none and recolor no shared pixels:

| Case | Added pixels |
| --- | ---: |
| `a-bow96` | 7 |
| `a-stripes-azure` | 2 |
| `a-axe96` | 1 |
| `n-cloak128` | 1 |

This agrees with the [light-item fairness report's](../../../research/2026-11-07-paperdoll-cycle/fairness.md) ten-pixel change plus the [dark-item follow-up's](../../../research/2026-11-07-paperdoll-cycle/lpc-fairness.md) additional cloak pixel. No otherwise unreported real-corpus regression was observed. These stored outputs lack independent per-pixel semantic labels; an addition is not automatically corrected gear, and the olive cloak pixel remains an acknowledged ownership concern rather than a newly proved defect.

## Independent adversarial controls and remaining coverage limits

The probe runs **960 independently authored cases**: four keys, four base-tone levels, three native sizes, five shapes and four ink colors. Ownership is declared by fixture construction before extraction. Inputs are checked for immutability. The darkest base case represents a near-black shadow, not a claim that every such shade is a skin midtone.

Representative results at 64 pixels:

| Fixture | Light base | Deep base, green | Deep base, magenta/blue/azure |
| --- | ---: | ---: | ---: |
| Ten-pixel black horizontal strap | 10/10 | 10/10, formerly 0/10 | 0/10 |
| Ten-pixel black zigzag | 10/10 | 0/10 | 0/10 |
| Eight-pixel black ring around a hole | 8/8 | 0/8 | 0/8 |
| Ten-pixel silver horizontal strap | 10/10 | 10/10 | 10/10 |
| Ten-pixel dark bronze horizontal strap | 10/10 | 0/10 | 0/10 |
| Ten-pixel dark teal horizontal strap | 10/10 | 0/10 | 0/10 |

The straight green-key black-strap recovery is reproduced. Its scope is narrow: a four-pixel straight dark stroke is not equivalent to general thin-feature preservation. Bent jewelry, compact rings and other keys still exhibit the tone-dependent loss. Other-key and bronze/teal limitations are already documented; the zigzag/ring fixtures make the shape restriction concrete. These are qualification boundaries and future research targets, not evidence that the commits claimed universal fairness or introduced these preexisting false negatives.

Opposite-label controls use the exact same painted observations as a legitimate black/silver line but label those pixels as hypothetical mannequin redraw. Over deep skin the baseline removes all ten while the current green-key extractor ships ten. This demonstrates the recovery/false-positive ambiguity; it does not establish that a provider actually emitted such redraws. The same artifact over light skin already shipped under the baseline. The retained olive-family evidence therefore cannot prove safety for all dark or bright redraw colors, but the probe supplies no new real-provider counterexample.

The gray cross-view classifier still cannot distinguish intended front-only neutral emblems from view-specific gray artifacts purely by palette share, and consistent contamination in every view is explicitly a known limitation. Those constraints should not be confused with a regression. The inspected source and current tests maintain a review warning rather than evidence of semantic ownership.

## Execution, artifacts and caveats

Executed with Node `v24.22.1`, npm `11.19.1`, Vitest `4.1.12`, using workspace-local `TEMP`/`TMP` under ignored `app/test-results-post-bb-review-chroma-tmp/`.

From the repository root with pinned Node selected:

```text
node docs/reviews/2026-11-07-post-bb830dfb/chroma-grid/probe.mts
```

From `app/`:

```text
npm test -- rim-guard-skin-tones grid-estimate design-gray measured-key --maxWorkers=2 --reporter=json --outputFile=../docs/reviews/2026-11-07-post-bb830dfb/chroma-grid/unit-results.json
```

The focused suite passed **27/27** tests. [probe.mts](probe.mts) and [results.json](results.json) contain the independent controls; [unit-results.json](unit-results.json) records the authored regression checks. This reviewer did not rerun the full application or browser suite; the coordinator owns those checks.

Two harness setup failures were corrected without changing application code: an initial exact-HEAD assertion rejected the copy-only tail, so it was replaced with equality checks on the pinned functional sources; passing a large historical module in a Windows command argument exceeded the command limit, so historical children receive code through stdin. Only the successful bounded subprocess run supports CG1. Node emits its documented experimental warning for `stripTypeScriptTypes`; execution completes normally.
