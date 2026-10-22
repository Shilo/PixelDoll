# Replaceable item QA summaries — 2026-10-22

## Scope and result

Fix aggregate item QA after adding or replacing moves, then pin both CI jobs to `ubuntu-24.04`.
No paid requests, token access, artwork changes, physical-phone tests or PWA work.

New evaluations store scalar checks per animation/direction, including H4 status and decided hand. A move edit
replaces those parts and recomputes extrema, border/shift/stray/grip totals and status. Frame provenance continues to
resolve the selected source by produced frame key. Partial, duplicate or mismatched replacement checks are refused
before persistence. Accepting an exception does not mark clean parts accepted; replacing the final exception can
restore a clean result. Recorded retry history is retained when frames are replaced.

Palette reporting uses the worst current clip/call segment against that evaluation's original design-call palette.
A test demonstrates why: equal clean/drifting segments can average 0/30 to 15 in a packed call. Reporting now retains
the drifting clip's 30 and its review explanation. Existing per-call retry maps and budgets remain unchanged. This
does not compare a new generation against an old item's original design palette.

Historical QA has no exact replaceable parts. A move edit retains the old scalar baseline and remaining layer
coverage, marks checks incomplete and prevents a clean status. Old totals can omit previously appended moves or
include replaced frames. The baseline drops only when its remaining coverage is replaced. No reconstruction or
paid recheck is attempted. Records with no QA retain unknown older coverage instead.

## Offline verification

- Pinned Node 24.22.1 / npm 11.19.1: `npm run check` — zero errors/warnings; `npm run selftest` — 89 tests passed.
- Focused regressions cover additions, directional replacements, repeated replacement idempotence, JSON persistence,
  extrema and all count families, real hand-anchor failures, accepted exceptions, missing hand tracking, palette
  dilution, incomplete old data, original provenance ordering and complete-frame guards.
- Saved helmet fixture confirms H4 forearm review and real hard failures survive into replaceable summaries.
- A committed dev-only browser fixture calls actual `buildItem`, `mergeClip`, `saveItem` and `loadProject`, and
  compares full QA through editable ZIP reimport and engine-manifest export. It is outside the production entry/public tree.
- Initial sandbox Vitest collection failed on temporary-directory renames, before any tests ran. Using an ignored
  workspace directory under `app/node_modules/.tmp/qa-summary` for `TEMP`/`TMP` resolved it; no project config changed.
- The focused new browser regression passed independently in 2.4 s. The full combined `npm run e2e` run passed all
  17 tests in 48.2 s with build/dist guard clean. An earlier full run had only a trace-file ENOENT during teardown
  (16 pass, no application assertion failure); a unique artifact directory resolved that collision.
- A concurrent contributor's stylesheet changed after that full build. The final compatibility run rebuilds those
  changes before testing; source/test hashes were compared during that run rather than claiming the old build covered
  the new stylesheet. The dev-only QA fixture is absent from the production output.
- Final `npm run build` and dist guard passed with the committed updated UI. The required
  `node scripts/e2e-studio.mjs` passed all 15 tests in 44.9 s (exit 0). Its first sandbox run completed all 15 cases
  but hung shutting down servers; that owned run was interrupted and the exact entry rerun outside the Windows
  sandbox to obtain a clean exit. No application change was needed. Final combined type checks also passed 0/0.

## Codex browser

Used a separate normal/keyless localhost Vite server on port 5497, without the agent bootstrap or API key.
The fixture uses deterministic check data on the saved demo body, not newly generated artwork:

1. Create a clean item: 24 walk frames, pass.
2. Append action: 42 total frames; two shifted frames, 10 stray pixels, key kept 0.8, key outside 0.2, area ratio 0.01,
   area CV 0.442, fail. Reload the page and load actual IndexedDB data: the same result.
3. Replace south: one shifted frame / five stray pixels remain; east still fails.
4. Editable ZIP and engine-manifest comparisons preserve every QA field.
5. Replace east: zero shifts/strays, key kept 1, outside/CV 0, area ratio 1, pass.
6. Open the actual Studio: inspector displays Clean and the corrected metrics.
7. Simulate an older record without parts, then edit one direction: warn. Studio shows Needs a look and
   “Older move checks are incomplete; totals may include replaced frames.”

Local ignored screenshots: `spikes/api/out/shields/codex-browser-qa-summary-clean.png` and
`codex-browser-qa-summary-legacy.png`. No token or real-key screen was captured.

## Adversarial review and independent challenge

A read-only sub-agent reviewed the implementation and later the browser fixture. It independently ran 19 focused
tests successfully and found no remaining blockers. Findings were checked against the existing gate behavior:

| Finding | Independent assessment and resolution |
|---|---|
| A majority-vote aggregate can reopen an accepted wrong-hand exception when an unrelated clean clip is added. | Valid. The existing per-clip slot gate already flags a newly wrong-side clip. Aggregate status now uses those current part statuses; handedness differences remain visible without revoking accepted exceptions. Tested with real anchor geometry. |
| Marking all clean parts accepted prevents returning to Clean after replacing the only accepted defect. | Valid. `acceptQa` overrides only non-clean parts and leaves its input unchanged; a regression replaces the sole accepted defect and returns pass. |
| A per-clip review can elevate status without a warning explanation when only some views have hand tracks. | Valid. Reproduced mixed tracked/untracked views; distinct clip warnings now accompany the status. |
| Palette distance changes when a packed call spans clips. | Intentional, tested and documented: initial reporting and later merges use the same per-clip segment semantics, with explanation and unchanged paid retry maps. |
| A fabricated pair of opposite all-pass hands should fail solely in the reducer. | Rejected as a gate counterexample: the real evaluator fails the wrong slot side already. Replaced the fabricated test with actual anchor-based evaluations; no redundant majority gate added. |

The final fixture review verified real IndexedDB/ZIP paths, meaningful assertions, no API calls and no production
fixture inclusion. The reviewer and primary agent agree on the resolved findings and remaining limitations.

## Runner pin and remaining work

Both build and deploy jobs use `ubuntu-24.04`; Node/npm/dependencies and job permissions are unchanged.
GitHub's [official runner image documentation](https://github.com/actions/runner-images) recommends a versioned OS
label to avoid the gradual migration of `*-latest` labels. The pin does not freeze every tool preinstalled on the runner.

The two shield east-walk drafts remain unaccepted, cape grey smudges and actual helmet deformations remain open for
targeted artwork correction, and mirrored handedness remains deferred. Older metadata is deliberately incomplete;
future new/replaced checks are accurate at the stored clip granularity.
