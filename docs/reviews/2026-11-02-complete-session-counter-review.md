# Complete animation review validation and fixes

November 2, 2026. Baseline `05274fe0`, whose app code equals Claude's reviewed `3bbc61ee`. Work is isolated on
`codex/claude-review-fixes`. The main checkout's unrelated token-handling edits are excluded. The owner requested that
Claude's findings be challenged, reproduced and fixed only when valid. This pass uses no paid generations, balance calls,
new library, backend, default switch or artwork repaint.

**Result:** the six principal findings are valid within the scopes below. The additional looping-contact measurement bug
also reproduces and is fixed. The review's uncertainty about the earlier palm targets is contradicted by committed data
and a fresh historical reproduction. Experimental art stays unqualified and importable for review.

## Preserved evidence

The [original Claude response](2026-11-02-complete-session-claude-response.md) is preserved unmodified. Its temporary test
files, Python scripts, outputs, contact sheets and timed APNG/GIF files are copied into the durable
[evidence archive](../research/artifacts/2026-11-02-complete-session-claude-evidence.zip). The archive contains 77 entries,
including a per-file SHA-256 manifest. Archive SHA-256:
`3b96de6dd0acfa436681c9ea27ab93bd639c6a8fb0b3e9d74ae9bec948b48c19`.

The isolated working copies are under `spikes/api/out/claude-complete-review-2026-11-02/`. Installed dependencies, browser
profiles, credentials, environment files and private transcripts are excluded. Original review scripts are evidence,
not automatically maintained application tests. Relevant counterexamples have been adapted into maintained regressions.

## Findings and dispositions

| Finding | Challenge and verified disposition |
| --- | --- |
| C1: Studio can run/delete Lab jobs and strand native frames | **Accept and fix.** Reproduced Studio posting a Lab request and the inverse opening order starving Studio. Queue ownership now filters both full ledger reads and single-record notifications, not just the Lab's list. Enqueue and atomic measurement claims respect ownership. Lab uses its own lock, channel and record tag. Studio cleanup cannot see Lab records, so their referenced blobs remain reachable. |
| A1: possibly charged requests displayed Free | **Accept and fix.** Unread 429/503 and parsed 423/503/529 reproduced Free despite unknown paid outcomes. Accepted job evidence with 402 also reproduced it. Activity and queue now share the clear-refusal/job-evidence helpers. Unread bodies cannot prove a free rejection, while their received HTTP status remains visible. Explicit reported usage keeps precedence. |
| A2: generic error after invocation becomes failed | **Accept, latent, and fix.** An injected post-send bookkeeping failure reproduced one POST, `requestStarted:true`, `state:failed`. A non-ApiError after a paid invocation is now lost/possibly charged, never automatically resent. Pre-send errors and ordinary parsed terminal errors keep their separate semantics. |
| B1: held repair probe bypasses opaque-body grip check | **Accept and fix.** The original test dispatched a mask with 3,423 editable pixels around a transparent target. The paid probe now uses the shared image-aware body-contact check on each exact padded frozen frame before building its masks or enqueueing. Tests include missing grip, transparent grip, second-frame-only failure and a valid opaque control. This is geometry, not palm recognition. |
| F2: stale tab buys another tab's selected source | **Accept and fix.** The supplied counterexample selects source B while tab A still displays A. Submission now receives the displayed project ID and plan binding and checks both inside the starter lock, before source reads, free API verification, reservation or enqueue. The regression asserts zero enqueue/API calls on mismatch. |
| F3: known unsent attempt blocks forever | **Accept with a stricter recovery boundary.** A durable failed/canceled record with `requestStarted:false`, no submitted timestamp, no remote jobs/response/usage, correct Lab identity and exact request params can now be explicitly resolved as unsent. Its call and record remain evidence; its hold is released. A later priced click, never resolution itself, can enqueue a replacement. Unknown/lost/active/billed/mismatched/missing records cannot be released. |
| F3: no record after an enqueue exception proves never sent | **Reject that inference.** Storage loss, partial enqueue bookkeeping or a crash can hide a request. The report's broader sentence includes enqueue failures with no record, but only its positive durable unsent record establishes the safety prerequisite. Those missing-record holds remain blocked with a clear error; no generic reset, silent release or replay was added. |
| B2: looping stance across 7-to-0 uses wrong times | **Accept and fix.** Supplied control measures 17.75 px rather than 0.5. A contiguous named stance spanning the seam now unwraps early samples into the next cycle. Multiple disjoint gaps produce an explicit unmeasured reason rather than guessed timing. Nonlooping timing remains unchanged; physical qualification remains false. |
| D: thin-fragment limit missing from known issues | **Accept and document.** The known outline/held cleanup loss and deferred Rules A/B are now explicit. No global cleanup thresholds changed. |
| D: old OpenAPI file is not the new REST contract | **Accept the navigation gap; no silent schema replacement.** The capabilities document already had a dated correction. Added a folder README and known-issues link naming the November 2 override for this endpoint. Historical contract bytes remain untouched. No new API research was needed. |
| D: pipeline text hardcodes obsolete sizes/padding | **Accept factual correction.** The repository text now points to the actual size validator and dynamic `padOf` implementation. This does not reinstate the instructions the owner revoked for this chat. |
| D: starter cap does not enforce separate allowance ledgers | **Accept and clarify.** Runtime enforces the local 150-unit motion cap; cross-campaign allowance accounting is manual. Comments and known issues now say so. No new cross-ledger abstraction or additional spending was added. |
| D: duplicate experimental name, cosmetic spacing/internal README filename | **Nonblocking cosmetic observations.** Kept out of the source fix. Existing immutable artifact hashes are preserved. Use the actual committed ZIP filenames linked below; embedded historical names are not a new import/export defect. |
| D: Studio/engine axe projects lack a standalone qualified:false property | **Not a demonstrated schema defect.** Imported projects use the existing warning/unmeasured QA and label contracts. The native authoring/evidence explicitly says unqualified. Adding an unsupported property would not establish quality; no schema churn was justified. |
| H1: B15 recoloring may flicker | **Plausible hypothesis, not proven here.** Different frame tags and low-bit differences do not independently prove a recoloring defect. Existing material-mask limits remain. No palette or frame pixels changed to manufacture visual consistency. |

## What changed in code

### Queue ownership and frame durability

`queue.ts` provides the shared Motion Lab tag and separate configurable lock/record ownership. Default Studio queues
exclude Lab records. Lab passes its own tag, lock and channel. Ownership filtering applies to both `all()` and `get()`;
foreign record notifications cannot bypass it. Submission rejects a tag belonging to the other workflow. Atomic joint
measurement reuse filters foreign candidates too.

This is stronger than only changing the lock name or filtering the default full list: those leave individual record
adoption or injected/full-list implementations able to cross ownership. It does not reconstruct records already deleted
by an older build. Preserve their receipts/raw media or use retained review artifacts; never regenerate to conceal loss.
Old tabs running old code should be reloaded before any later paid development run.

Regression coverage includes both opening orders with name-aware mock locks, both opening orders with actual browser
Web Locks across two tabs, startup-age cleanup, Clear finished, real IndexedDB blob GC, all three action frame readers,
and a subsequent complete pack export/import. These browser cases block real PixelLab traffic.

### Billing evidence and uncertain post-send failures

`client.ts` now owns shared accepted-job and strict known-no-animation refusal checks. `paidRequestRejected` requires
a read response and no job evidence, including wrapped evidence. Ordinary documented rate-limit rejection and the
narrow route-specific no-job response remain distinct from transient server errors. Parsed no-job auth/credits refusals
may be labeled free; unread headers with those same statuses cannot prove that.

`activity.ts` uses that same predicate instead of its broad status list. The unread-body client path explicitly records
that the response was not read. `queue.ts` retains paid generic post-invocation failures as unknown/lost. No automatic
quality retry was introduced; free GET recovery and accepted-job precedence remain intact.

### Native authoring and recovery

The repair probe validates the actual frozen frame under the authored padded coordinate. It does not classify a palm
or use a green redraw as the original body. The check precedes paid enqueueing even if failure occurs in only the second
target frame.

Starter submission requires a caller-provided source/binding. Resolution is a separate **Free** button for eligible
unsent attempts, verified again under the same cross-tab starter lock. The journal retains a resolution timestamp and
the old job record. History/held units ignore only explicitly resolved rows. Request params are reconstructed and
matched before release. The next user-reviewed paid click can bypass the terminal unsent cache entry; resolution itself
never calls generation. Lost/accepted/unknown attempts remain resume-safe and blocked.

The native foot tool unwraps one contiguous named support interval across a loop. Disjoint marks need separate labels;
the tool does not infer a support window from pixels or select the most favorable residual. Held-frame displacement
and annotation coverage retain their separate meanings and `qualified:false`.

## Counterarguments and corrected claims

### Earlier targets and the 0/1 to 27/21 comparison reproduce

Claude says the earlier palms were not retained and obtained 10/9 hidden pixels with the old source anchor and current
palms. That substitutes the wrong targets. Committed `2026-11-02-palm-grip-results.json` retains both old and new targets:

| Pose | Old target | New target | Old hidden pixels | New hidden pixels |
| --- | --- | --- | ---: | ---: |
| 3 | (93,73) | (90.5,75.5) | 0 | 27 |
| 4 | (90,82) | (88.5,84.5) | 1 | 21 |

The new offline script `spikes/api/mocap/review-palm-baseline.mts` reproduces all four counts using committed body/source
art and these stored targets. It reads the original renderer at `a09e31fc` for the old end anchor, because the later
opaque-source guard intentionally rejects that historical transparent anchor. Current rendering reproduces the new
counts. No source/body pixels are modified. Run from root with pinned Node 24:

```text
node --experimental-transform-types spikes/api/mocap/review-palm-baseline.mts
```

This restores the narrow numeric comparison, not a claim of natural fingers or quality. First audit attempts exposed
the archive reader's Map return type, the intentional new source-anchor guard and Node's explicit module-extension
requirement; those were reproduction setup errors, not product regressions. The final script asserts exact counts.

### Native constant design does not isolate every earlier cause

The new axe uses one fixed asset, so its constant shape is expected by construction. It supports using native artwork
to avoid per-frame redraw variation. It does not prove per-frame generation is the sole cause of all previous drift,
nor reverse the earlier agreement that mixed-job seam causation was unisolated. Projection, occlusion, motion selection
and authoring still vary in those historical comparisons. The earlier common-body and input-provenance corrections,
candidate-specific continuity criteria and deferral of cleanup Rules A/B stay unchanged.

### Not every supplied test was a failing regression assertion

On pinned Node 24, the initial unchanged review probes produced 11 relevant expected-behavior failures: two queue,
seven billing/uncertainty, one probe and one seam case. The F2/F3 and cleanup audit examples instead assert the bad
baseline behavior and therefore pass while demonstrating the issue. Two B15 tests failed because their external ART
directory argument was not configured, not because they demonstrated recoloring flicker. These distinctions matter;
we did not count all failures as product bugs or weaken tests to turn the review green.

Maintained regressions assert desired corrected behavior. Baseline copies and their original assertions remain in the
evidence archive. One existing queue test mock needed the new shared tag export. New probe test captures needed a
TypeScript narrowing correction; strict checking now passes without an `any` cast or a weakened assertion.

## Visual disposition and product questions

Codex inspected the preserved axe composites, starter attack keyposes and standing/idle comparison sheets. They support
the reported raised-hand/skull ambiguity, weak chop/read and belly-inflation concerns. Continuous timed playback was not
independently watched in this pass; the preserved APNG/GIFs are available for that judgment. No body/frame was repainted,
deleted, recolored or re-timed from these stills.

- **East axe:** complete source design and geometric contact are improvements, but merged hands/hip contours, body
  transitions, lighting under rigid rotation and hidden fingers remain unqualified. "Never floats" is bounded to the
  checked geometry, not proof of anatomical gripping.
- **Walk:** remains an experimental body candidate. Face and torso variation should be visually reviewed before any
  promotion. No extra generation or arbitrary seam threshold is justified here.
- **Attack:** retain as body-only research, not a qualified chop or weapon base. The owner's one-attack goal does not
  make this particular gesture professionally acceptable. Per-view prop/hand art would require explicit art work.
- **Still idle:** keep the explicitly labeled frozen standing hold, already selected in the bounded implementation.
  It does not pretend to be breathing animation.
- **Importability:** keep free experimental import for inspection and reproduction, with warnings. Do not promote it
  to Studio defaults or remove evidence because the art is not release quality.
- **Breathing idle:** keep rejected, adding belly/mouth artifacts to the documented visual limitations. No cleanup or
  paid reroll is scheduled.

The static project and engine ZIPs remain byte-identical. Reviewers reproduced their declared pixels/placement/holds;
that does not close the original professional-any-humanoid ambition. The actual artifacts are
`2026-11-02-east-axe-studio.zip`, `2026-11-02-east-axe-engine.zip` and
`2026-11-02-eight-direction-starter.pixeldoll.zip` under `docs/research/artifacts/`.

## Verification and completion

Pinned Node 24.22.1/npm 11.19.1; locked dependencies installed only in the isolated checkout. No package/lockfile upgrade.

- Final strict Svelte/TypeScript checks: zero errors and warnings, including both test projects.
- Complete unit suite: **1,537 passed, one existing skip, 134 files**. A final focused probe fixture rerun passes all four
  controls after the type-only capture correction.
- Full keyless browser suite on the final application code: **171 passed in 2.9 minutes**, including both real lock
  orders and actual cleanup/GC/free export.
- After adding explicit recovery-button coverage to the existing starter case, that final keyless case passed again in
  10.9 seconds, total run 14.8 seconds. It proves zero-generation recovery, retained failed evidence, released hold and
  subsequent full-pack export/import. Application code did not change between those browser runs.
- Production build and distribution guard passed for both browser runs.
- Historical palm audit reproduced 0/1 and 27/21 without network or artwork changes.
- Evidence archive entries and manifests are hashed; original art artifacts are unchanged. Docs/reference/diff checks
  are recorded with final commit preparation. No remote CI or deployment result is implied by local checks.

The full suite emitted existing fixture-thumbnail fetch warnings and a ResizeObserver notification, without test
failures. They are not claimed fixed. No PixelLab token or agent server was used, no provider request was needed and
**zero additional generation units were spent**. Browser test API interactions were mocked or blocked.

No broad research, second external-review loop, automatic paid retry, artwork promotion or deployed main change is part
of this pass. The implemented fixes and documented art limits complete this bounded review response; missing unknown
receipts remain explicitly unresolved rather than being converted into free retries.
