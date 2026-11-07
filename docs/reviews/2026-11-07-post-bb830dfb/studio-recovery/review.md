# Studio, queue, recovery and lifecycle challenge

November 7, 2026. Independent read-only review of `bb830dfb..8ea08c28`, pinned HEAD `8ea08c28d92d9a8d41524dcd78f379c38699ea63`. The expressly excluded process document was not opened. No application source, saved user project, credentials, account, board, installed package or paid provider was changed by this reviewer. The coordinator subsequently added copy-only tail `2611cc34` to the overall review; its CharacterForm hand/mirror wording and documentation are owned by the coordinator's static review. They do not change the core code exercised by these probes.

## Findings

### P2: A partial provider failure hides free saved-frame recovery when publication also conflicts

**Locations:** [run.ts:707](../../../../app/src/lib/items/run.ts:707), [MoveSheet.svelte:55](../../../../app/src/studio/MoveSheet.svelte:55). Introduced through the interaction of partial-direction publication in `e951da85` and skeleton saved-frame recovery in `666f489a`.

`poseItemClip` retains completed direction results with `Promise.allSettled`, then attempts to publish the fulfilled subset. If a different direction fails and `mergeClip` raises `ITEM_MOVE_SAVE_CONFLICT`, the catch wraps it as `firstDirectionError + saveConflict`. The MoveSheet exposes **Use saved frames** only when the error starts with the save-conflict string. That prefix condition is false for the combined error.

The completed direction has not been published because its atomic merge conflicted, so the ordinary retry still sees it as missing. The visible retry chooses a fresh seed and can buy that completed view again. The hidden free action could instead reattach and publish the completed subset, then leave only the failed direction for an explicit new generation.

**Independent reproduction:** [prepare-race-tests.mjs](prepare-race-tests.mjs) generates an ignored test module using the repository's existing offline queue fixture. Two directions run: south completes with three images; north returns malformed cardinality. A concurrent unrelated rig-metadata addition produces the save conflict without changing the walking request inputs. The test establishes the combined error contains the conflict but fails the exact prefix condition used by the component. A second control reattaches the same completed requests in `savedOnly` mode, publishes south, reports the remaining north failure, and creates no additional enqueue.

[mixed-recovery-results.json](mixed-recovery-results.json): one deliberately failing expectation and one passing recovery control. Fifty-one unrelated existing cases were filtered for that run, not executed or weakened. This is an incomplete path in the newly added recovery feature, not a claim that the pre-range skeleton UI already handled this case. The source branch and component condition are reproduced; no real browser, actual concurrent user edit, or provider charge is claimed by this injected fixture.

**Suggested correction:** retain the save-conflict discriminator when combining errors, or expose a durable recovery capability independently of incidental message ordering. A small local prefix-preserving change can be sufficient; a new generic error framework is unnecessary. Add a combined partial failure plus publication conflict regression, assert the free action remains discoverable after reload, then assert that using it sends zero requests and the next explicit retry quotes only missing views. Preserve conflict rejection and never auto-resubmit.

### P3: Article-plus-pair descriptions lose their equipment noun

**Location:** [model.ts:143](../../../../app/src/studio/model.ts:143), commit `82b0f424`.

The new preposition delimiter correctly fixes lantern names, but the prefix regex removes only one leading phrase. With `a pair of leather boots`, it removes `a`, then splits at `of`, producing **Pair**. The same happens to `a pair of boots` and `the pair of leather gloves`. The previous helper retained informative names such as **Pair of leather boots**; distinct equipment can now share an uninformative wardrobe label.

[naming-probe.mts](naming-probe.mts) executes the pinned baseline helper and current production helper, with [naming-results.json](naming-results.json) retaining all outputs and the current source hash. The existing `pair of leather boots` and corrected lantern controls pass. This is a user-facing naming regression, not an artwork or billing defect.

**Suggested correction:** normalize the article and count phrase together before applying noun-head delimiters. Include both bare `pair of` and article-plus-`pair of` examples, retaining the lantern and ordinary singular-item controls.

## Chronological coverage and retained strengths

| Change | Source and cross-call review | Result |
| --- | --- | --- |
| `abcecf0e` measured retry keys | `NewItemInput.key`, `itemRoute.spec`, `apiPlans.itemPlan`, GenCard retry quote and `retryGen` consent | Quote and execution use the same measured override. Existing attempt replacement still binds the prior draft and reviewed input. No new automatic retry was found. Pixel/color detection itself is the image-review lane. |
| `41411fca` first-open lifecycle | `moveRigVersion`, body publication re-read/update and post-publication `splitBase` normalization | An initial suspicion of persistent normalization loss was not supported by the full-path race control described below. Ignoring `baseHash` remains broader than the unit test's explanation, so other mutation paths deserve continued care rather than a universal safety claim. |
| `82b0f424` naming and hand copy | `itemNameFrom`, ItemPane labels and existing naming cases | Lantern example improves; article-plus-pair regression is P3 above. No new cost or credential exposure found. |
| `2dbbbf80` concurrent review results | `evalGen` and existing two-draft reload fixture | Spreading results after the await preserves independently completed review results. The existing regression passed in this review. No confirmed stale-result application to another item was established. |
| `0baa1ac3`, `f7c771fa` repair pricing/layout | `planGens`, `itemPoseGens`, `moveEstimate`, `movePlan`, `gridRepairRequest`/`gridItemClip`, saved stencil decoding | Repair quoting and actual request construction both use `repairGridLayout`; initial grid items retain their own planned grid estimator. Persisted request-text revision advances to stop changed-payload automatic resumes. Numerical layout/pricing analysis belongs to the image/gates reviewer. |
| `e951da85` partial item directions | `poseItemClip`, `PartialMoveError`, `addMove`, complete-direction selection and MoveSheet retry re-read | Completed views survive an ordinary sibling failure, and explicit retry plans exclude completed directions. Combined publication conflict is the P2 gap above. Partial batches within one failed direction are not newly claimed as recoverable directions. |
| `b1175564`, `2fbe38eb`, `236876cc` review metadata | Manifest fields, `withH4`, `mergeQa`, `qaReasons`, ItemPane use of the current rig | Detail and hanging-item review counts are retained through QA merge and user-facing reasons. Gate mathematics and false positives remain the peer review's responsibility. |
| `666f489a` cached skeleton recovery | `submitOrSaved`, `poseItemClip`, grid recovery, `addMove` restrictions and `startMove` follower handling | Completed exact request hashes are required; saved mode bypasses enqueue and rejects missing matches. Existing tests cover same-seed recovery and wrong-seed refusal. Body regeneration, replace and explicit grid repair do not acquire this free-recovery path. |

Other commits in the range are documentation or image/gate changes covered by the coordinator or peer. This lane read the relevant call-chain deltas; it does not claim independent review of every source acquisition, measurement or visual threshold in the entire range.

## First-open race hypothesis and negative result

`moveRigVersion` now excludes `baseHash`. Body publication re-reads a record, writes cell blobs, then assigns its prepared base-cell map inside a transaction. This initially suggested a concurrent first-open region split could be overwritten.

[prepare-first-open-test.mjs](prepare-first-open-test.mjs) uses the tracked mocked body-render fixture with gray garment pixels, making actual region encoding change cell hashes. During the body blob-publication interval it calls the real `splitBase`, `deriveMaterials` and `saveSplit`, then lets the complete `addMove` operation continue. The later normalization preserves the split unselected south cells, region marker and derived materials.

[first-open-results.json](first-open-results.json): the focused race passes; 67 unrelated cases were filtered. This rejects the persistent-overwrite hypothesis for this completed path. It does not test browser shutdown between transactions, every possible base mutation, or every concurrent palette choice. No finding is asserted merely because a hash is excluded.

The coordinator requested a further interruption challenge. There is no external cancellation signal on `addMove` after body publication, and the running MoveSheet action is **Hide**, so normal sheet dismissal does not bypass the normalization. The body publication transaction at `create.ts:870` completes before `addMove`'s next `loadProject` and normalization at `create.ts:738`. An injected failure of that first post-publication read does prevent healing during this invocation.

The additional test in [prepare-first-open-test.mjs](prepare-first-open-test.mjs) stores both the fixture and split PNG blobs, executes the real concurrent `splitBase` / `deriveMaterials` / `saveSplit`, injects that one read failure, then calls the actual unmocked project loader against the saved record and blob map. The failed operation leaves the unselected south cell at its original hash with **308 shorts-region pixels restored from odd to even blue-channel values**, although `regions: 'shirt-shorts'` and the split material metadata remain. The asserted decoded RGBA difference establishes a semantic region mismatch rather than merely changed PNG encoding. Running the real reopen normalization repairs the south cell back to the prior split hash without regeneration.

[first-open-interrupted-results.json](first-open-interrupted-results.json): one passing interruption/control test, 68 unrelated cases filtered. [first-open-interrupted-measurements.json](first-open-interrupted-measurements.json) retains the two hashes and measured pixel count. This qualifies a temporary persisted inconsistency under a storage-read failure or interruption between transactions. It does not establish that normal cancellation causes it, that it survives a successful Studio reopen, or that recolor data is permanently lost. Keep it as a narrowly demonstrated durability caveat for the counter-review, not a new P1 or an ordinary completed-path corruption finding. A stronger fix proposal must first show a meaningful user-visible path that reopen normalization does not already repair, or justify an atomic publication invariant independently.

## Commands and independently executed checks

Pinned Node `v24.22.1`; workspace-local ignored `TEMP`/`TMP`; one worker to avoid the coordinator's broader test load. No production test configuration was modified. The owned config only discovers generated review tests, which reuse current tracked fixture code with explicit additional cases.

From the repository root:

```text
node docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/prepare-race-tests.mjs
node docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/prepare-first-open-test.mjs
node docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/naming-probe.mts
```

Run Vitest with this directory's `vitest.config.mjs`, selecting `independent review:` for the mixed-recovery cases, `independent first-open:` for the completed normalization race, or `independent interrupted first-open:` for the storage-failure/reopen control. Set `TEMP` and `TMP` to the ignored `temp.local` directory. The expected mixed-recovery failure is retained as evidence, not converted into a passing assertion against incorrect behavior.

Existing app tests independently run from `app/`:

```text
node node_modules/vitest/vitest.mjs run automatic-recovery.test.ts targeted-move.test.ts item-move-readiness.test.ts move-rig-version.test.ts item-name.test.ts studio-flow-state.test.ts grid-estimate.test.ts --maxWorkers=1 --reporter=json --outputFile=../docs/reviews/2026-11-07-post-bb830dfb/studio-recovery/existing-regressions.json
```

Result: **210 passed, zero failed, zero skipped** across seven files. The existing suites miss the mixed failure/conflict and article-plus-pair cases. No full application check, full end-to-end suite, live provider request or host-browser race was run by this reviewer; the coordinator owns the wider verification.

## Disposition

Carry P2 and P3 into the independent counter-review with their reproducers. Do not weaken the new conflict guards, reissue unknown paid work, or treat passing existing tests as evidence these two cases are covered. No application fix was made in this review.
