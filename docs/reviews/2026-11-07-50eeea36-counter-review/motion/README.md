# Independent motion-classification challenge

November 7, 2026. Reviewed motion delta `6006a55c..50eeea36`. No production source/test changes, API requests, balance calls, installs, board mutations, commits or reusable-workflow reads. The review uses actual historical/current functions and independently authored synthetic controls. The current source is asserted byte-identical to the Git pin before execution; both module SHA-256 values appear in [results.json](results.json).

## M1. P2: the new knee-angle requirement rejects a coherent moderate action lean

**Introduced:** `50eeea36`. **Source:** `app/src/lib/items/items.ts:915` (new knee-relative component of the `Math.min` lean); `isAction` at line 922; held-shape gate activation at line 1179. Custom-name generation is in `app/src/studio/MoveSheet.svelte:32–34`.

The new requirement uses the same 40-degree threshold for torso lean about the hips and shoulder direction about the knees. Those are different lever arms. Bending the upper body 45 degrees around stationary hips/knees moves the shoulder-to-knee direction by much less than 40 degrees, even though the upper body moves coherently and no bone stretches. This activates locomotion-only QA on an otherwise supported gait-named action.

### Reproduction

From the repo root with pinned Node 24.22.1:

```text
node docs/reviews/2026-11-07-50eeea36-counter-review/motion/probe.mts
```

The script exports only the historical `app/src` and package metadata at `6006a55c` into ignored `temp.local/`, imports those exact functions and compares current `50eeea36` functions. No networking is needed. The existing review transport guard was preloaded through `NODE_OPTIONS` for execution.

The synthetic 64-pixel rig has a six-frame `run-dodge`. In frame 2, all upper-body joints rotate 45 degrees about the hip midpoint; hips and knees remain fixed. Requested and measured points agree exactly. The body raster is separately drawn from each actual pose. A torch is gripped at the right wrist and stays vertically upright in world coordinates while the torso/arm bends. This requires normal wrist articulation; it is intentional fixture behavior, not a claim of a newly generated provider output.

- `validateRig` returns no errors; every point is complete and in bounds.
- Maximum absolute change in the 15 explicitly checked limb/face bone lengths is floating-point noise, under `8e-15` pixels.
- Closest torch pixel stays within 0.71 pixels of the requested wrist.
- The source `clipQa` returns zero adherence error and no failures or warnings for the 45-degree case.
- Actual `postProcess` removes zero pixels and repairs no frames on both revisions.
- Postprocessed layer hashes are identical before/after the commit.

| Control | `6006a55c` | `50eeea36` |
| --- | --- | --- |
| `run-dodge`, 0-degree upper-body movement | Locomotion; QA pass | Locomotion; QA pass |
| **`run-dodge`, coherent 45-degree lean, upright torch** | Action; QA pass | **Locomotion; QA fail: G9 item turns 45 degrees against the hand** |
| Exact same 45-degree poses/body/layers, named `dodge` | Action; QA pass | Action; QA pass |
| `run-dodge`, coherent 70-degree lean | Action; QA pass | Action; QA pass |

The last control still has a separate source-body review warning at its more extreme pose, so it is a classification/QA contrast, not a claim of perfectly clean final source-body production art. The main 45-degree reproduction has no such source warning.

The classifier-only sweep also shows the regression at 40, 41, 45, 50 and 55 degrees for one-, four- and eight-frame sequences. No assertion is made that every possible dodge must bypass all item checks: this fixture's specific valid-art declaration and the named-action control establish the relevant false positive.

### Reachability, impact and limits

Studio derives custom move IDs from the first two words, so a description beginning “Run dodge” can become `run-dodge`. Imported rigs can also have gait-containing action names. The code expressly supports decisive motion overriding such names (`run-slash` is the documented example). Unknown/literal action names already remain actions, as the rename-only control shows.

This is a newly introduced **false failure/review**, not artwork deletion, automatic spending or a newly observed provider failure. It can send a valid complete item into review or invite a needless paid retry. The synthetic torch's upright intent is independent ground truth supplied by the fixture author. Current S5 dress wording points objects down/outward; therefore this does not demonstrate that a fresh current paid dress would generate this exact torch or that an actual stored corpus item regresses. A user can import this coherent source rig or describe a custom gait-named action; later posing gates classify its new equipment using this motion. The raster fixture models one valid candidate in that path, not a demonstrated fresh paid response. The valid coherent action should not change this case solely because its ID contains a gait word.

The notes/prompt reviewer independently read the fixture and challenged the wrist intent, source-body guard, cleanup, name dependence and bone-length assumptions. The final reproduction includes these checks. Keep the distinction between a supported synthetic action counterexample and the unchanged stored-corpus counts.

**Worth correcting:** preserve coherent moderate action motion without reopening the original detached-neck and detached-hip bypasses. The new knee reference is useful evidence, but comparing two differently pivoted angles to one identical threshold is over-restrictive. Require this positive control alongside the existing single-hip negative and short-slash controls. Do not remove all outlier filtering, globally disable G9 for walks, or promote new held wording from this result.

## Protections and claims that held

- Original F1 neck outlier `(0.05,0.5)` in one frame: before decisive/action true, after false. This correction is real.
- **12 available stored rig files / 67 clip-directions:** zero `decisiveAction` changes. **19/20** slash directions remain decisive.
- **40** even/odd four-frame slash subsamples: **38/40** decisive, zero before/after changes.
- **72** newly projected KayKit/Quaternius fixture/clip/direction combinations from the local motion library: zero `decisiveAction` changes. This is projection/classification evidence, not new rendered provider images. Literal action names can remain `isAction=true` even where `decisiveAction=false`; do not conflate the two outputs.
- The report's larger **23-rig / 293-row** corpus and **15.2-million-position** sweep were not independently reconstructed or repeated. Their uncommitted scratch probes are unavailable as portable evidence. The smaller pinned-source controls reproduced the pertinent claims without implying an exhaustive search proof.
- End-joint errors and coherent incorrect limb estimates remain declared ambiguity; they are not new findings here. The global thigh-growth veto could deserve future qualification for strongly foreshortened imported poses, but no separate concrete source-art regression is asserted from that concern.

## Checks and qualification

The pure script succeeds and retains all case values/hashes. A single focused existing production test run (`npm test -- move-classification --maxWorkers=1 --reporter=json ...`) yielded **8 passes / 1 failure**: the added exhaustive grid case spent about 44 seconds under simultaneous full-browser load and returned a Vitest `STACK_TRACE_ERROR`, not a position/assertion counterexample. [unit-results.json](unit-results.json) preserves the actual failure. After browser completion the coordinator reran both new F1 production cases with the same timeout and assertions: the corrected module passes both (the grid case takes about 5.9 seconds), while the pre-correction module fails their intended neck/hip assertions. See [coordinator regression results](../regression-results.json). This distinguishes a load-sensitive test run from a newly demonstrated classifier counterexample. This reviewer did not weaken, skip or edit the production test.

One review-script setup error used `flatMap` directly on a typed array; it was corrected to `Array.from(mask).flatMap` before the final successful run. Only the final recorded script execution supports the cleanup/contact measurements. No full end-to-end suite, paid comparison or exact 23-rig sweep was run by this lane; broader checks belong to the coordinator.
