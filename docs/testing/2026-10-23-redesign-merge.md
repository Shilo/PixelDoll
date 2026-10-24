# Redesign merge into main — 2026-10-23

## Inputs and decisions

Merge parents: main `0eb169e04415c61798e8bd6346756ede88980997` and redesign `c641929861f5db15c54101ff8ef2c435b0ab1230`. Main had 12 unique commits; redesign had 57. There were 31 conflicted files. Resolutions were reviewed per behavior, not selected wholesale by branch.

| Conflict area | Preserved from main | Preserved from redesign | Superseded behavior |
| --- | --- | --- | --- |
| Request queue and client | No automatic resend of uncertain paid requests; accepted-job evidence wins over error status; scoped cancellation; durable request claims; private credentials; same-key reconnect guards; bounded deadlines | Plan-derived capacity, remote-job accounting, shared cooldown, Retry-After, workflow tier checks, request inspection | Manual parallel-call input; treating generic 423/529 or loosely matching error text as proof that a paid job never started |
| Character creation | Stable creation identity, insert-only publication, independent directions, complete standing-joint checks, cancellation of unsent sibling work | Linked Appearance/Prompt form, explicit direction/mirror plans, variable body/frame sizes, camera, original rotations, padded skeleton estimates, quality notes | Fixed-size-only form; automatically erasing detached body pixels or redrawing artwork because of uncertain quality observations |
| Moves and repairs | Selected-view replacement, optimistic save guards, equipment invalidation, exact reviewed measurement recovery, bounded palette correction, recovery receipts | Activity scope, variable-size motion, existing managed-motion offsets, current nested warning summaries | Automatically rerolling body artwork after incomplete measurements. Targeted repairs still refuse to replace existing artwork when their required checks fail |
| Equipment | Keep the best complete candidate and its matching provenance; validate repair-grid geometry; preserve previous artwork if repair fails | Plan restrictions, activity context and large-frame padding limits | Replacing a better candidate with the most recent candidate. Border contact is retained as a review note, not proof of clipping |
| Exports | Validation of accepted warnings and palette-repair history; frozen base checks; safe paths; actual outfit colors and clipping | Native Aseprite, GDevelop, expanded Godot/Phaser/Unity runtimes, exact source/default/linked palette support | Pre-baking a separate item for every outfit color combination. Runtime palette support now preserves the same colors without duplicate color items |
| Studio and docs | Main's save/retry guards, repaired-item feedback, compact categories and accessible tab behavior | New creator, grouped exports, request peeks, account-capacity display, prototype and Bronze UI dependency | Old tests tied to removed controls or older quality wording; their behavioral checks were adapted rather than discarded |

The playable prototype and all tracked redesign assets/scripts are unchanged from the redesign parent. Bronze UI remains a dependency; production Studio retains its custom CSS. No production redesign migration was added by this merge.

## Cross-file integration fixes

- Combined queue scheduling retains the first-ledger-write barrier and rechecks cancellation, connection, credential revision and plan eligibility before transport. Each submission invokes transport once.
- Activity metadata is excluded from creation/recovery fingerprints: adding inspection must not turn an existing attempt into a different character or invalidate a recovery receipt.
- New skeleton padding is used consistently by setup, generation and measurement-recovery request hashes.
- Legacy detached-pixel processing remains available only for reconstructing historical offline audit evidence. New generated body art retains detached pixels.
- Request previews now honor selected repair directions, unarmed pose descriptions and equipment-only packed-grid repairs.
- Character retry retains main's visible cost estimate and returns to the creation sheet after connection, alongside the redesign's request inspector and plan check. Move retries retain request inspection without dropping main's recovery actions.
- Saved independent-direction specifications map to independently generated views in the new explicit-direction planner. Both the request-object estimate and the browser retry estimate are checked; old mirrored specifications keep their original plan.
- Export validation accepts correctly derived clipped-body variants while retaining one canonical base body. Export/reimport tests compare runtime-applied palettes, mirrored directions and clipping, not obsolete pre-baked color item IDs.
- Test fixtures distinguish free account lookups from paid generation submissions. Retry tests retain main's conservative ambiguous-outcome policy and the redesign's plan/cooldown checks.

## Verification

All verification is offline: mocked or blocked PixelLab transport, local fixtures, and local browser servers. No PixelLab credits are used.

- Type check: passed, zero Svelte errors/warnings and TypeScript errors.
- Unit suite: 73 files passed; 711 tests passed, one existing skip.
- Production build and distribution secret guard: passed.
- Isolated playable prototype: 18 browser checks passed, including exact fixture RGB, mobile touch, movement, camera following and code-only reflection.
- Prototype visual/control regression suite: 26 cases passed, including responsive layout, pop-up layering, contrast and native pickers; mouse-wheel navigation: four viewport/theme cases passed.
- Final targeted recovery/request-preview tests: 32 passed after the activity-fingerprint reconciliation.
- Browser coverage: all 90 cases verified across the full run and focused reruns. The full run passed 85; its five failures exposed obsolete form selectors, an obsolete memory-only draft fixture, one test launched from the wrong working directory, and the real retry-return regression. The corrected Studio/request-inspection run passed 35 of 36 and exposed the independent-direction mapping regression; both affected retry/direction cases then passed after its fix. No failing case was skipped or removed.
- Final direction-planning/creation/request-preview unit checks: 35 passed after the independent-direction fix. Final type check, production build and distribution guard also passed.
- Repository checks: no remaining conflict markers or unmerged index entries; staged whitespace checks pass. The fetched remote main remains an ancestor of the original main parent. Publication is a normal merge/push, without rewriting either branch's history.

## Publication and branch cleanup

After this merge commit is pushed, verify local main, the fetched remote main and the server's main reference agree, and verify both input commits remain ancestors. Only then delete the old local redesign branch and create `feat/game-experience-rework`. There is no auxiliary worktree for the old branch; the primary checkout must remain in place.

## Independent follow-up challenge

Two GPT-6.1 Sol High reviewers independently compared both parents and reproduced issues offline. The coordinating reviewer reproduced the failures before fixing them and challenged the proposed changes:

- Fixed a merge-specific credential race: restoring Activity input data could pair an old key with a new credential revision. Polls now recheck the key, revision and connection after storage reads.
- Fixed a merge-specific Unity clipping regression: the canonical body now uses the same clipped-variant resolver as equipment. Exported pixels are checked against the compositor; native Unity execution is not claimed.
- Fixed an inherited queue deadlock: missing stored input images now fail locally before account lookup rather than waiting indefinitely for plan verification. Cancellation and disconnect during the check remain respected.
- Rejected the Unity editor color-preview concern as an intentional, documented limitation: chosen runtime palettes apply in Play Mode, while persistent editor sprites use default colors.
- GitHub exposed the old five-minute browser-step limit after the suite expanded. The limit is now fifteen minutes with individual test results; per-test limits and checks remain unchanged. CI results are evaluated separately from local verification.
- The completed diagnostic CI run passed 89/90 browser cases and exposed creator-tab text overflow at 320 px with Linux fonts. The production creator's existing narrow container rule now places tabs and actions on separate rows, preserving text size and all controls. An independent reviewer challenged this layout change; ten local browser cases passed, including additional breakpoint widths, narrow desktop columns, wider fallback fonts and touch targets. Original text-fit assertions remain intact; the touch test now accepts either horizontal or vertical non-overlap.
- The expanded Linux run passed 93/94 browser cases and exposed action/tab overlap at 360 px, just outside that fixed breakpoint. The final correction replaces the breakpoint with intrinsic sizing: tabs retain their natural text width and the action group wraps when necessary. The reviewer challenged and accepted this smaller rule; all ten focused browser cases pass locally, with real tab clicks now tested using wider fonts at 320, 350, 360, 390 and 900 px. CI unit checks passed 721 tests with two platform-dependent/existing skips; Linux browser verification is tracked separately.

Bronze UI remote main `4883351` is two commits beyond `v0.2.1`, but only release documentation, showcase spelling, and its test labels differ. Published styles, Svelte components and package configuration are unchanged. No new theme release or dependency change is warranted.

Review evidence: [queue/creation audit](2026-10-23-independent-merge-review.md), [UI/export audit](2026-10-23-merge-ui-export-review.md).

Local raw logs are ignored under `.runtime.tmp/merge-recovery/`; generated browser evidence remains local. The earlier interrupted-merge patch is historical recovery material, not a finished merge to apply.
