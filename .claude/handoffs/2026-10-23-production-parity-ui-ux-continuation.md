# Handoff: Claude takes over PixelDoll's UI/UX redesign

> **Status (2026-10-23):** completed by Claude. Results, fixes and remaining follow-up: [final review](../../docs/testing/production-parity-final-review.md). The design contract below remains current; the step list is historical.

## Session Metadata

- Date: 2026-10-23. User explicitly requested an immediate stopping point, commit, and detailed handoff. This is a checkpoint, not a completed design review.
- Workspace: `C:/Programming_Files/Shilocity/PixelLab/PixelDoll`.
- Branch: `feat/game-experience-rework`. Stay on this branch; do not merge main as part of resuming this task.
- Initial production integration: `172eedc` (`feat(studio): integrate immersive Bronze game experience`). HEAD before this checkpoint was `9dfbcd2` (separate authentication documentation change; preserve it).
- This handoff and parity corrections are committed together. Obtain the checkpoint hash with `git log -1`; do not assume the first integration is the latest source.
- User correction: **Claude Browser**, not Cloud Browser; **prime Claude**, not clod. Use Claude Browser for interactive visual/DOM inspection instead of Codex Browser. Do not depend on Codex-specific tab handles or tools.

## Current State Summary

Claude is now the lead professional UI/UX game designer, specializing in character creators, paperdolling and customization. Continue the same design and implementation responsibility, not merely a code review. The approved immersive prototype already exists. Its production integration exists but the user correctly identified fidelity regressions. This session compared matching screens, corrected substantial composition and interaction problems, and added stronger tests. The current production build passes 23 focused browser tests, but **the final 40-pair visual comparison, supplemental dialog review and standard production browser suite have not been completed against these corrections**. Do not claim otherwise.

The immediate work is to finish the strict prototype-versus-production audit, investigate one confirmed creator focus issue, fix only demonstrated regressions, verify all workflows, provide direct matching-size screenshots, document the decisions and commit the verified result. The user asked Codex to retire temporarily; Claude should carry this work forward autonomously.

## Important Context

The user wants a full-screen, minimal, professional, immersive character-creator game experience. The character and world dominate. Controls are subtle but legible and discoverable. They reject a flat generic software dashboard, excessive panels, slogans, tiny text, poorly bounded controls and untested claims. Preserve functionality and the approved visual direction; do not restart design exploration or generate new mockups as a substitute for matching the existing approved prototype.

The user deliberately aligned the open production browser at port 5208 with the prototype to simplify comparison. Preserve their saved outfit and data. Their tab showed a pink helmet/gray body after their own edits; that is legitimate user state, not a visual regression. Use isolated browser storage or the comparison harness when consistent fixture outfits are needed. Changing UI tabs/screens for comparison is authorized; silently resetting their equipment, colors or library is not appropriate.

User expects you to challenge both their ideas and reviewers. Fix confirmed problems, not every suggestion. Do not treat an intentional production expansion as a regression merely because a prototype omitted it. Conversely, passing internal tests is not evidence that the design matches the prototype. Review the actual images at identical resolutions and exercise the controls.

No paid PixelLab generation is needed for this task. Never print/read/expose credentials or commit environment files. Use normal local servers, isolated contexts and blocked/mocked external API traffic. Existing queue, storage, generation, safety and export code must remain intact.

## Read This Documentation First

All paths in this document are relative to the workspace unless absolute.

1. `AGENTS.md` and `CLAUDE.md`: repository/runtime rules and Bronze ownership. User instructions override older design proposals.
2. `docs/design/production-prototype-parity.md`: this session's screen-by-screen decision matrix, baseline and evidence rules.
3. `docs/design/production-experience.md`: current production architecture and ownership boundaries, updated for painted-bound fitting.
4. `docs/testing/production-parity-review-checkpoint.md`: independent GPT-6.1 Sol High visual review, confirmed issues, accepted deviations and unfinished final-review boundary.
5. `docs/testing/production-parity-input-verification.md`: six focused input cases, two-finger comparison proof and 770-unit-test result.
6. `docs/design/2026-10-22-redesign/round-4-discussion/current-design.md`: approved overall direction, superseding incompatible earlier concepts.
7. `docs/design/2026-10-22-redesign/round-4-discussion/animation-resolver.md`: dynamic direction/movement fallback contract.
8. `docs/design/2026-10-22-redesign/round-6-prototype/README.md` and its actual source: approved playable reference, current Bronze refinements.
9. `docs/design/immersive-design-system.md`: shared styling and interaction contract. `docs/README.md` indexes historical evidence and design rounds.
10. Bronze source and guide: `C:/Programming_Files/Shilocity/bronze-ui/README.md` and `C:/Programming_Files/Shilocity/bronze-ui/docs/STYLE-GUIDE.md`.

The original `docs/testing/production-experience-2026-10-23.md` describes earlier integration checks. It is historical evidence, **not** proof that this checkpoint's final visuals or standard browser suite passed. Older handoffs and early Moonlight Camp/Quiet Stage images explain the evolution, but current approved prototype and decisions are authoritative.

## Design Contract to Preserve

- Obsidian / Porcelain Bronze, dark by default with one standard Light/Dark destination action. Theme changes UI/background colors, never sprite pixels. No lighting, shading, tint or filters on the actual character. Intentional equipment recoloring remains real.
- Cohesive HD simulation/holodeck environment, prototype-like grid ground, no unrelated pillars, props or unnecessary grid/bounds toggles. Selection and Preview share the world by default; backgrounds are modular by screen and cached by URL. Live views project the appropriate angle of the same world material.
- Optional reflection is code-configured only. A separate reflected copy may fade; the original character remains unfiltered. Use actual demo or user sprites, never embellished/generated hero artwork.
- Characters is the entry screen: bundled demo plus actual saved/imported characters, south thumbnails, selected actor in the world. Selecting a different character selects it; activating the selected character opens customization. WASD/arrows, wheel and keyboard activation work without taking over editable fields.
- Desktop information left, equipment and panel tabs right, view tabs at top center. Mobile has compact left-aligned view tabs and a lower equipment region. Actor, caption and playback center within available world space, excluding the desktop rail.
- One customization shell: Preview / Top-down / Side-scroller. Preview has selected animation, playback, declared directions and Inspect. Live views preserve equipment customization but hide animation-editing controls. No redundant Customize/Play buttons inside this shell.
- Continuous gameplay movement/camera following and dynamic touch joystick. Sparse direction sets are normal; use nearest available directional presentation, previous horizontal facing for ambiguous two-direction movement, and fallback body/idle/rest frames. Missing movement art must not stop movement. Missing equipment coverage may hide the affected layer for that presentation. Avoid spamming normal mappings with toasts.
- Purposeful text only: screen purpose, character name, recoverable prompt, essential state. No invented classes, slogans or flowery descriptions. Prompt truncates to one line and expands on activation, with copy available.
- Wardrobe / Colors / Outfits / Moves ordering. Head/Hair/Body plus “More”; its popup is “Additional equipment,” containing extra categories only. Switching panels closes popovers.
- Preserve every actual creator field and workflow: Name, linked Appearance/Prompt, help/API/copy, Enhance/Undo, traits, body and frame sizing, camera, directional presets and attached mirror controls, seed, validation, cost, recovery and saving.
- Native dark/light support, consistent semantic colors, minimal transparent-track scrollbars, adequate focus/contrast/target size. No GlassKit. Shared theme changes belong in Bronze UI upstream, then release/dependency update; workflow geometry stays here.

## Architecture Overview

Svelte 5 with Vite and strict TypeScript, client-only. `app/src/studio/experience/Experience.svelte` composes the immersive shell using existing Studio components and state. `WorldStage.svelte` connects input/canvas presentation; `movement.ts`, `presentation.ts`, `ground.ts` and `bounds.ts` keep resolution/rendering math separate. Production compositor/pivots/export remain authoritative. `PhonePanel.svelte` is shared by desktop rail and phone sheet despite its historical name.

Bronze UI is pinned to **0.2.1** in app package/lockfile. `experience/theme.css` imports shared tokens/components without reset and aliases legacy workflow variables. `experience/layout.css` owns geometry, responsive constraints, text/control sizes and reading-gradient placement. No Bronze repository changes or release were needed for the confirmed issues in this session. Do not patch node_modules or copy shared colors into local CSS.

## Critical Files / Files Modified

| File | Changes and continuation relevance |
|---|---|
| `app/src/studio/experience/layout.css` | Main parent-owned visual changes: type/hierarchy, top-center desktop tabs, responsive scene/rail/playback, mobile Search/New/Import, creator layout, large equipment cards, compact mobile third None card, focus outline around viewport. |
| `app/src/studio/experience/Experience.svelte` | Responsive cast scale, prompt copy, panel/popover handling, focused screen entry and guarded selection wheel. Real project/library behavior remains. |
| `app/src/studio/experience/WorldStage.svelte` | Stable painted fit, cached sky/horizon projection, separate reflection mask, preview chord release, side entry facing, safe resize continuity, guarded two-finger button activation and overlay-first Back behavior. |
| `app/src/studio/experience/bounds.ts` | New cached alpha-bound union across visible outfit poses and rests, preserving pivots and conservative mirrored coverage. Used only for fitting; exported/composited full frames unchanged. |
| `app/src/studio/experience/ground.ts` | Fitting accepts preferred scale and anchor ratio; supporting projection unchanged in purpose. |
| `app/src/studio/PhonePanel.svelte` | Category heading/count, bigger art/check marks, None in shared grid, contextual creation/design actions, equipped-item palette/details fallback. Removed unreachable Outfits branch inside Wardrobe. |
| `app/src/studio/CharacterForm.svelte` | Size guide separated from geometry so desktop can place it left; all real fields retained. |
| `app/src/studio/CreateSheet.svelte` | Visible Name label in heading. |
| `app/src/studio/Toolbar.svelte` | Brand/icon and responsive selection Import/New action hooks. |
| `app/src/studio/Moves.svelte` | Selecting a move preserves paused state. |
| `app/test/unit/experience-bounds.test.ts` | 12 bounds cases including malformed/missing/oversize/mirrored/rest/hidden coverage. |
| `app/test/e2e/experience.spec.ts` | 17 production experience cases, stronger geometry/focus/palette/creator assertions. |
| `app/test/e2e/experience-parity.spec.ts` | Six new dedicated input parity cases. |
| `app/playwright.experience.config.ts` | Runs those 23 cases against an already-served normal app, one worker. |
| `app/scripts/compare-experience.mjs` | Preserved-reference 40-pair capture/gallery tool; optional 36 supplemental real-dialog captures. See execution status below. |

## Work Completed and Decisions Made

Confirmed regressions fixed: small/flat desktop hierarchy; misplaced view tabs; undersized or oversized hero depending on viewport; absent mobile search; creator composition; legacy mobile Name max-width; overlapping Appearance/Prompt labels; insufficient equipment grouping; missing contextual creation actions; palette/details following the wrong category's selected item; Side-scroller sky treatment; tiny portrait actor caused by transparent full-frame padding; a focus outline cutting through the world; mobile None taking an unnecessary full row; category label overflowing its inherited fixed height.

Input corrections: Preview key release recomputes the remaining vector; stale repeats do not restart input; screen transitions focus the relevant world; native field editing stays native; wheel filters modifiers/horizontal gestures and expires old bursts; Moves preserves pause; Side-scroller initially chooses declared horizontal facing; resize stops input without resetting position/camera; Escape/Backspace dismisses an open prompt/menu before leaving the studio.

The second-finger handler was explicitly challenged as potentially unnecessary complexity. A corrected real CDP test against the same code with its four added listeners removed proved native second-finger equipment activation failed while the first finger kept moving. With fallback it succeeds; dragged/canceled touches do not activate, and movement ownership remains first finger. Keep this proven behavior unless stronger evidence disproves it. Do not resurrect the initial incorrect CDP touchEnd sequence (the ended finger, not remaining finger, must be specified).

Accepted differences: actual projects instead of three fake demo characters; real palette ramps instead of five decorative swatches; full category coverage, validation, generation, recovery, shared designs, export, account/API/Activity, precision Inspect and outfit CRUD. These may require scrolling. Moves remains hidden in live views by explicit user direction. Production preserves valid facing and clock phase across relevant transitions rather than resetting everything like the prototype. Reduced-motion pause is respected.

The reviewer proposed a full-width mobile Create button. Parent challenged this: the compact footer keeps real cost/API inspection alongside a clear roughly 239×44 primary and saves scarce form height. Reviewer accepted this intentional production adaptation. Do not change geometry merely to imitate the stub. Title is purpose-based “New character”; it is now left-aligned. No decorative slogan is warranted.

## Verification Completed at Stop

| Check | Actual result / scope |
|---|---|
| Pinned runtime | Node 24.22.1, npm 11.19.1. System default is Node 25; explicitly prepend pinned directory. |
| Type check | Latest source check: zero errors and warnings. |
| Build | Latest build successful; dist guard clean. Existing large-chunk and classic appearance.js bundling notices remain non-blocking. |
| Unit suite | 79 files, **770 passed / one existing skip**, 50.74s. Includes 12 new bounds cases. Subsequent changes were CSS/markup-only; no rendering math change after this run. |
| Focused production browser suite | **23/23 passed**, 54.5s, against latest built port 5208. Build JS `bootstrap-DNqv5yzi.js`, CSS `bootstrap-1aqQx-Rl.css`. |
| Focused evidence | `app/test-results/experience-results.json`; 26 fresh screenshots under `app/test-results/experience/`. |
| Dedicated behavior source challenge | No additional blocking rendering/input defect found. See input report; this is not visual approval. |
| Main existing browser suite | Earlier integration had 98 passing workflows. **Not rerun against this checkpoint**. Do not report the old count as current verification. |
| Final independent visual review | **Unfinished.** Reviewer examined before/iteration1 and source, not final 40 corrected pairs. |

All test traffic used offline fixtures/mocks/blocks. No real paid requests were made.

## Screenshot Evidence: Exact Provenance

Folder: `app/test-results/experience-comparison/` (ignored; preserved locally, not committed).

- `prototype.json`, `prototype/`: 40 approved-reference PNGs preserved at 1440×900 desktop or 390×844 phone, DPR1, both themes.
- `before.json`, `app-before/`, `gallery-before.html`: first integration comparison.
- `iteration1.json`, `app-iteration1/`, `gallery-iteration1.html`: an intermediate correction, **still visibly wrong in some areas**. Its creator phone screenshot has now-fixed tab overlap/name width; its phone character fit predates final bounds correction. Do not present it as final.
- `index.html` still points to iteration1 at stop.
- **No `app-after/` / final after gallery was captured.** Those are output destinations to create, not completed evidence.
- `--dialogs` was added and syntax-checked, **not executed**. It requests nine real-production dialog states × four viewport/theme variants: demo and editable-copy New item, saved design, item details, Inspect, Export, account, Activity and Import. Debug this harness if needed; do not mistake authored automation for verified screens.
- Baseline's initial process used Node25 (recorded honestly); iteration1 and current tests used pinned24. Every matched image dimension was verified. Generated screenshots are intentionally ignored; do not force-add them.

## Immediate Next Steps

1. Read this handoff and the five current design/testing documents above, inspect Git status/log and ensure no work from another session is overwritten. Reuse the feature checkout. Read the approved prototype source and actual screenshots before visual edits.
2. Use **Claude Browser** to inspect prototype5202 and production5208 side by side with equal dimensions and identical UI view/panel/theme. Also inspect dev5207 for live edits. Do not rely on Codex tab IDs. Preserve user's stored state; use fresh isolated contexts for fixture comparisons.
3. Resolve the one confirmed outstanding issue: `app/src/studio/Sheet.svelte` fine-pointer initial-focus query only searches `.sheet-body`, so it focuses Details and skips Name in `.sheet-heading`. Consider selecting the first editable heading field before the generic body field, while retaining mobile no-forced-keyboard policy and focus restoration. This fix **was discussed but NOT applied**, and no Name-focus assertion was added. Add a focused desktop regression check if fixed.
4. Review source changes and verify current screenshots yourself. Rebuild after any change, then run the 23-case focused suite against the served build. Keep final build stable while capturing; don't rebuild between pair images.
5. Run comparison tool `--phase after --dialogs` against5208. It retains the approved baseline. Inspect every pair and every supplemental dialog visually and in the DOM: both themes, desktop/phone. Check readability, clipping, overlap, useful hierarchy, popover top layer, scroll reachability, focus, form labels, safe targets, attached mirror edges, swatch rings, actual character centering and unfiltered rendering.
6. Include tablet768×1024, small320×568 and landscape844×390 checks. Automated focused tests cover portions; use Claude Browser to challenge appearance, not just rect assertions. Check default and expanded phone panel states, long content/names/prompts, actual extra categories, paused/missing animation states, and keyboard/touch movement.
7. Run standard production browser suite without erasing comparison evidence (see commands). All paid workflows must stay mocked. Verify creator and shared equipment functionality especially because real forms differ from simplified prototype.
8. Have an independent reviewer challenge final visual and behavior evidence, ideally GPT-6.1 Sol High if available and authorized, then challenge their findings. Fix confirmed issues only. Record accepted differences and remaining limits honestly.
9. Update parity/verification docs with final artifact paths, build hashes, counts and disposition. Show the user **direct back-to-back prototype versus corrected actual app images** at matching resolution, plus a gallery of all pairs. Do not compare Bronze showcase against itself or substitute intermediate screenshots.
10. Commit verified changes on feature branch with Conventional Commits; push if continuing the existing authorized publishing workflow. Do not merge main without a new instruction. Report concise concrete changes, tests, justified differences and any remaining limitations.

## Environment State and Commands

Active local services at stop (verify before starting duplicates):

- `http://127.0.0.1:5202/`: approved round-six prototype, its `run.mjs` server.
- `http://127.0.0.1:5207/`: normal production app Vite dev, HMR.
- `http://127.0.0.1:5208/`: normal production build preview, serves latest app/dist. Existing open tabs may cache an older bundle; use a new review tab or deliberate reload without changing saved state.

From workspace/app in PowerShell:

```powershell
$env:PATH="$PWD/../.runtime.tmp/node-v24.22.1-win-x64;$env:PATH"
node --version
npm --version
npm run check
npm test
npm run build
$env:BASE='http://127.0.0.1:5208'
npx playwright test --config playwright.experience.config.ts
node scripts/compare-experience.mjs --phase after --dialogs
# Full existing suite, using the built app. Isolate output so it cannot delete comparison files.
$env:TEST_OUTPUT_DIR='test-results-standard-parity'
npx playwright test --config playwright.config.ts
```

The main Playwright config starts a separate normal dev server at5298; verify port availability. It uses BASE for preview if supplied. Do not run `npm run e2e` concurrently with captures, because it rebuilds. Comparison harness empties `@vite/client`, so run it against built5208, not dev5207. Its `PROTOTYPE_URL`, `APP_URL` and `--out` override locations if required. Avoid concurrent heavyweight browser runs; one worker is intentional.

Node location: `C:/Programming_Files/Shilocity/PixelLab/PixelDoll/.runtime.tmp/node-v24.22.1-win-x64/node.exe`. If sandbox temp renames fail EPERM, use a workspace temporary directory or authorized offline test escalation; don't misclassify it as a product failure. Never expose an agent server or token. Normal5207/5208 and fixtures suffice for this work.

## Potential Gotchas

- `layout.css` is global but Svelte's scoped component CSS can have higher specificity. The creator rules deliberately use `.studio-app .character-sheet ...`. Old `studio.css` had a160px mobile max-width on Name and fixed44px category heights. Inspect computed styles before adding more overrides.
- `flex:0` shrank tab hitboxes while text overflowed; use intrinsic basis (`0 0 auto`) when keeping labels natural width. Tests now check real glyph ranges, not only element bounds.
- Parent moved None into the existing grid with one handler: desktop full-width row; phone third equal card. Do not reintroduce duplicate responsive DOM actions.
- Actor fitting unions painted bounds across poses/outfit once on changes. Never scan every pixel every animation frame or fit each current frame, which would cause breathing scale. Full rendered frames/pivots remain intact.
- Preserve native keyboard/input behavior: focus scope and editable fields matter. Don't globally capture all arrows/Backspace/Tab.
- The two-finger test's correct pointerEnd semantics matter; see report before simplifying the handler.
- User wants useful screen space, not literal screenshot pixel cloning. Retain real functionality and evidence-backed intentional differences, but don't use that as an excuse for weaker typography or hierarchy.
- New auth-related documentation commit `9dfbcd2` appeared during this session. It is outside this task; preserve it.
- Python launcher aliases were inaccessible on this machine. Handoff was written using the skill's structure with manual/Node validation; no Python environment was installed just to generate this checkpoint.

## Assumptions Made / Open Questions

The approved prototype remains the visual baseline, and the actual app's existing business workflows remain authoritative. No new design preference question blocks progress. Outstanding work is verification and confirmed corrections, not waiting for permission. Browser services and ignored evidence may need restarting/regenerating in a later environment. No final visual sign-off is implied by this handoff or commit.

## Stop Boundary

All subagents stopped on the user's request. No final capture, full98-suite rerun, pending focus fix, new theme release or further redesign was started after the stop request. Claude should continue from the first unfinished step above and own the final UI/UX judgment.
