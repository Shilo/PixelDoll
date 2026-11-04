# Share review and acceptance handoff, November 3, 2026

Share and the character stage consume the same `view.project` and `view.items`. The project applies the selected palette and worn draft previews; the outfit map lets a worn draft override the saved item in its slot. Both use `buildPresentation`, `renderPresentation`, and `composeCell`. Review status does not select a separate compositor. Preview, PNG, GIF, clipboard output, and the native-share payload derive from the same Share media.

## Reproduced defects and fixes

- Share previously used `doc.items`, excluding worn drafts. Commit `722c2e28` changes all Share selection and rendering checks to `view.items`. Pending artwork raises the existing loading message instead of silently producing a bare character.
- The original browser regression simulated the final accepted state atomically. Independent review identified the real `acceptGen` gap: it removed the draft before awaiting draft-ledger persistence and the accepted-project reload. A fresh PNG lost its marker pixels while the ledger completion was held. The failed reproduction is retained under `app/test-results-share-handoff-before/`.
- Simply waiting for `openProject` before dropping the draft is insufficient: a concurrent acceptance can supersede that reload without publishing anything. The controller regressions cover two worn items in different slots and both manual and automatic acceptance.
- Accepted drafts now remain available to the shared view until `openProject` actually publishes their saved items. Publication transfers worn IDs into the current outfit and retires their drafts synchronously. Background accepted drafts can be retired after navigation. Draft persistence excludes the existing `acceptedAt` marker, which the item runner sets only after its atomic item save succeeds.

## Coverage

`app/test/e2e/export-picker.spec.ts` calls real `acceptGen` against a small saved character and synthetic completed job/artwork data. It independently holds the draft-ledger completion and the accepted-project read. It checks marker pixels during both boundaries, durable draft removal, both GIF frames, clipboard PNG, native-share bytes, and live wear/take-off. The manual loading state disables copying; quiet automatic reload preserves the worn pixels. No PixelLab API request or credits are used.

`app/test/unit/studio-flow-state.test.ts` keeps the real acceptance and publication controllers while replacing the item-save boundary with a durable-record fixture. It checks superseded concurrent reads, both worn slots reaching the saved outfit, failed draft-ledger writes, subsequent snapshots excluding accepted drafts, and same-ID retry. Its save mock sets the same acceptance marker as production.

Both real-browser acceptance cases passed with CI settings, one worker, retries disabled, and unchanged time limits. The complete combined browser suite passed 211 cases before the added handoff coverage. Final release checks and deployment are recorded on the publication card.

The expanded 212-case run initially passed 211 cases and exposed an existing Export keyboard-test race. Its trace shows the Godot radio still had `disabled` when `focus()` and ArrowRight were called, before preference loading completed. The test now explicitly awaits an enabled radio and confirms focus before pressing the key. No keyboard assertion or application behavior was relaxed.

Final local checks passed type checking and 1,692 unit tests, with one existing skip. The final focused CI-shaped run passed all three cases: manual acceptance, automatic acceptance, and the corrected keyboard flow, with one worker and zero retries. The full run's 211 other cases are retained in `.runtime.tmp/share-release-final-e2e.log`; the focused result is in `.runtime.tmp/share-release-focused.log`.

## Original local stress limitation

The original eight-worker Windows stress was not clean. The [November 4 follow-up](windows-cold-start-2026-11-04.md) qualified 90/90 cases in three fresh isolated cohorts with the original browser and tracing settings. It records the diagnostic failures and demonstrated interference from a concurrent suite, without relabeling those earlier failures as passes.

Initial cohorts stalled during fixture setup/import/save-copy before acceptance; one later cohort completed 12 of 20 cases after eight initial timeouts. A trace attributed about 98 seconds to the fixture's initial evaluation. Leaner two-frame fixtures and a compact viewport did not establish a clean eight-worker result. These failures are not represented as passing reruns or evidence of a diagnosed native cause.

Evidence remains in `app/test-results-share-handoff-stress/`, `app/test-results-share-handoff-stress-lean/`, and `app/test-results-share-handoff-compact-stress/`. No test timeout, recovery bound, or assertion was relaxed. The failed cohorts were stopped; ordinary four-worker suite and CI single-worker results are reported separately. This stress limit is not proof of a production acceptance defect, and no zero-edge-case guarantee is claimed.

A separate eight-worker keyboard-test cohort passed 9/10 cases. Its remaining failure had no Export dialog after the click, before reaching the corrected enabled/focus check. This differs from the disabled-radio trace and is not claimed fixed by that readiness assertion. Its artifacts are under `app/test-results-share-release-keyboard/`.

Refs: publication card https://github.com/users/Shilo/projects/7?pane=issue&itemId=293203424; Share card https://github.com/users/Shilo/projects/7?pane=issue&itemId=293038897.
