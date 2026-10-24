# Redesign merge into main — 2026-10-23

## Inputs and decisions

Merge parents: main `0eb169e04415c61798e8bd6346756ede88980997` and redesign `c641929861f5db15c54101ff8ef2c435b0ab1230`. Main had 12 unique commits; redesign had 57. There were 31 conflicted files. Resolutions were reviewed per behavior, not selected wholesale by branch.

| Conflict area | Preserved from main | Preserved from redesign | Superseded behavior |
| --- | --- | --- | --- |
| Request queue and client | No automatic resend of uncertain paid requests; accepted-job evidence wins over error status; scoped cancellation; durable request claims; private credentials; same-key reconnect guards; bounded deadlines | Plan-derived capacity, remote-job accounting, shared cooldown, Retry-After, workflow tier checks, request inspection | Manual parallel-call input; treating generic 423/529 or loosely matching error text as proof that a paid job never started |
| Character creation | Stable creation identity, insert-only publication, independent directions, complete standing-joint checks, cancellation of unsent sibling work | Linked Appearance/Prompt form, explicit direction/mirror plans, variable body/frame sizes, camera, original rotations, padded skeleton estimates, quality notes | Fixed-size-only form; automatically erasing detached body pixels or redrawing artwork because of uncertain quality observations |
| Moves and repairs | Selected-view replacement, optimistic save guards, equipment invalidation, exact reviewed measurement recovery, bounded palette correction, recovery receipts | Activity scope, variable-size motion, existing managed-motion offsets, current nested warning summaries | Automatically rerolling body artwork after incomplete measurements. Targeted repairs still refuse to replace existing artwork when their required checks fail |
| Equipment | Keep the best complete candidate and its matching provenance; validate repair-grid geometry; preserve previous artwork if repair fails | Plan restrictions, activity context and large-frame padding limits | Replacing a better candidate with the most recent candidate. Border contact is retained as a review note, not proof of clipping |
| Exports | Validation of accepted warnings and palette-repair history; frozen base checks; safe paths; actual outfit colours and clipping | Native Aseprite, GDevelop, expanded Godot/Phaser/Unity runtimes, exact source/default/linked palette support | Pre-baking a separate item for every outfit colour combination. Runtime palette support now preserves the same colours without duplicate colour items |
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
- Export validation accepts correctly derived clipped-body variants while retaining one canonical base body. Export/reimport tests compare runtime-applied palettes, mirrored directions and clipping, not obsolete pre-baked colour item IDs.
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

Local raw logs are ignored under `.runtime.tmp/merge-recovery/`; generated browser evidence remains local. The earlier interrupted-merge patch is historical recovery material, not a finished merge to apply.
