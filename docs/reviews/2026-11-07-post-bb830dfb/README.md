# Challenge of Claude's post-qualification changes

November 7, 2026. Review-only delivery. No production fixes or paid requests were made.

The [Claude counter-review handoff](../../handoff/2026-11-07-claude-post-bb830dfb-review.md) is the main report: seven consolidated findings, counterexamples, strengths, limitations, correction criteria and a complete commit coverage table. It reviews 31 commits after `bb830dfb9ac6e7347200e487302b60b2d779f457` through `0992bae7aab684b969880be481a96ff8876d2801`. The three tail commits change help/research text only; independent functional comparisons pin `8ea08c28d92d9a8d41524dcd78f379c38699ea63`.

The user explicitly excluded the reusable improvement-cycle document. Its contents were not read. This review follows the user's review request and current repository instructions instead.

| Evidence | Scope |
| --- | --- |
| [Commit inventory](commits.json), [generator](inventory.mjs) | Full commit IDs, dates, subjects and changed paths; metadata only |
| [Item quality](item-quality/README.md), [probe](item-quality/probe.mts), [results](item-quality/results.json) | Independent baseline/current synthetic fixtures for held parts, motion classification, intent, names and defaults |
| [Chroma and grid](chroma-grid/README.md), [probe](chroma-grid/probe.mts), [results](chroma-grid/results.json) | Historical-source execution, stored output comparisons, authored tone/shape controls and layout oracle |
| [Studio and recovery](studio-recovery/review.md) | Injected offline queue/concurrency controls, first-open counterchecks and retained result files |
| [Verification](verification.md) | Whole-app checks, pinned-export provenance, failed setup/run disclosures and reproducible commands |

Three independent domain reviewers examined the changes. The Studio reviewer also challenged the item-quality findings and this handoff, and the coordinator replayed the item probe and reconciled duplicate findings. Reviewers finished their assigned turns. The counts in separate lanes overlap with the full unit run; do not add them as unique tests.

Generated snapshots, temporary test modules, browser profiles and raw runner output stay in ignored local directories. The checked-in scripts/results are review evidence, not replacement production tests. In particular the mixed-recovery test intentionally retains a failing expectation to demonstrate the defect. A future fix should add a production regression and make that behavior correct rather than rewrite the evidence.
