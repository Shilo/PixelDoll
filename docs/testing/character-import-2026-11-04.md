# Character ZIP import audit

Date: 2026-11-04. Scope: all eight owner-supplied PixelLab exports, drag-and-drop, multi-state animations, readable move names and responsive preview controls. ZIP filenames identify test inputs only; character behavior comes from metadata and PNGs.

## Findings and decisions

The missing moves were primarily a state-selection bug: the first archive stores seven animations in seven separate states, while the old importer selected only one. Other archives use states for outfits or standing variants. The importer now accepts explicit additional animated states. Device imports initially include all animated states and expose those choices before saving; PixelLab library/link imports retain the requested state's scope. The standing pose remains a separate choice, and a visible disclosure explains that moves retain their source appearance. Static states do not create invented animations.

The 64 px import canvas also rejected valid larger characters and padded animation renders. PixelLab frames now share a square canvas based on their actual referenced PNG dimensions, from 64 through 256 px. Shared centering preserves the source origin across differently padded frames. No scaling occurs, and any crop of visible pixels is refused. The existing binary-alpha normalization remains explicit for partially transparent edges.

The second archive's Walk has seven east frames and eight south frames. Its directions become separate sparse moves rather than losing frames, repeating a tail frame or rejecting the character. Source ZIP metadata has no playback rate; imported animated frames use the existing 100 ms default. The standing Default move remains one frame.

Drag acceptance stays in the visible device-import drop area, beside a keyboard-accessible Choose ZIP button. This places validation and preview feedback where the action occurs. File navigation is prevented while the import window is mounted, without making the whole app an import target. Picker and drop share file-count, extension, size and archive validation, including recovery after selecting the same file again. The implementation follows the browser's [file drag-and-drop contract](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API/File_drag_and_drop).

Move labels share one formatter that replaces underscores and hyphens with spaces and uses sentence case. Stored IDs are preserved. Equal readable labels retain an ID suffix so separate source animations remain distinguishable. Preview and Inspect contain both selected text and the opened menu on narrow screens. The latter needed its own regression because checking only the closed select's bounds missed an overflowing popup. Appearance remains owned by Bronze UI; the app changes geometry only.

## Actual archive census

Counts below use the first standing state and every animated state. Moves include Default. Every state was also imported individually, including all static variants.

| Input ZIP | States checked | Source PNG references checked | Canvas | Directions | Imported moves |
|---|---:|---:|---:|---:|---:|
| Muskoka_Valley_Male_Character | 7 | 480 | 68 px | 8 | 8 |
| walk | 3 | 33 | 92 px | 4 | 4 |
| A_slim_athletic_human_male_with_a_completely_bald | 2 | 16 | 64 px | 8 | 1 |
| Exact_Idle_Rotations | 8 | 64 | 128 px | 8 | 1 |
| Iso_Base_Pro_Flash | 4 | 211 | 96 px | 8 | 8 |
| Tall_Spartan._short_bright_blond | 13 | 120 | 160 px | 8 | 3 |
| Orange_Cat | 1 | 72 | 64 px | 8 | 2 |
| Create_a_single_full-body_humanoid_base_sprite_for | 1 | 8 | 64 px | 8 | 1 |

An independent root audit checked all 39 states and 1,004 referenced source PNGs. It compared every original direction/frame sequence and its multiplicity against imported clips, using visible-pixel fingerprints under the documented binary-alpha contract. Editable project and generic export/reimport round trips preserve every imported RGBA byte and manifest. Separate exact-pixel unit cases check shared origins and pivots for 48/68 and 64/96 px padding, so crop fingerprints are not the only alignment evidence.

Local audit scripts, archive SHA-256 values and JSON results are ignored under `spikes/api/out/import-review-2026-11-04/`. The owner's original downloads remain unchanged. Portable synthetic regression tests model the observed layouts; the owner's ZIPs are not committed as CI fixtures.

## Adversarial review

Three agents separately owned the drop/import UI, ZIP parser, and move display. They reviewed each other's changes, with root counter-review and independent archive verification. Accepted findings included selected-state IDs changing when earlier sibling states were added, a late library error overwriting a valid local preview, opened phone menus overflowing, direction names accidentally receiving animation disambiguation, and ambiguous names in export warnings. Each was fixed and retested.

One alleged busy-state race was withdrawn: the reviewer inspected a deliberate temporary mutation used to prove the regression test. The normal central guard was restored before the checkpoint. Both the busy-state and late-library-error tests failed against their deliberate mutations, then passed after restoration. Their final versions also passed ten repetitions each with eight workers and the focused import tests passed in CI mode with one worker.

The former 80 px rejection fixtures now use 272 px because 80 px is valid under the corrected size contract. Their assertions still require refusal of visible-pixel loss. No assertion was weakened to accept dropped animations or altered artwork.

The integrated suite also caught an unnecessary native title added to Share, which conflicts with its existing no-tooltip contract. That title was removed and the original assertion retained. The standing-first item test's three visible-label expectations were updated from `Custom_walk`/`Custom_cross_punch` to readable spaces, as explicitly requested; its raw `custom_walk` selection, captured IDs, cost checks and no-paid-request checks remain unchanged.

## Verification

Pinned runtime: Node.js 24.22.1, npm 11.19.1. `npm run check` completed with zero errors and warnings; all 146 unit files passed, totaling 1,717 passed tests and one existing skipped test. Production build, distribution guard and theme-ownership check passed.

Codex browser selected each original download through the real file chooser, reviewed the correct preview count and saved all eight characters with rig setup unchecked. The first archive changed from two moves before the fix to eight. The second showed four moves and its unequal-direction warning. The outfit-state archive exposed all seven source animations and its explicit choices; unchecking and rechecking its armor state changed the summary from eight to seven and back while preserving the typed character name. The large archives saved at their actual supported sizes. Reload showed nine characters, including the original demo. This verifies local import and persistence, not paid rig setup or equipment generation.

Supplemental offline QA screenshots are ignored under `app/test-results-import-proof/`: `drop-area.png`, `move-selection.png`, `mobile-long-name.png` and `mobile-open-moves.png`. They show the final dialog and the real first archive's long move name; the opened phone menu remains within the viewport.

Browser coverage is Chromium and the Codex browser. Automated drop tests use browser `DataTransfer` events; this is not native OS dragging in Safari or Firefox. The responsive regression checks closed controls and opened phone menus in both Preview and Inspect.

Initial full browser run: 210 passed and ten failed. Two failures exposed the Share title and stale snake-case expectations described above; the other eight were timeouts in fixture loading, downloads, restart, update or self-test waits. The ten-case rerun passed nine, with the remaining case stopping during initial fixture loading before its label assertions; a final isolated rerun passed that case in 3.8 seconds. No timeouts, retry counts or assertions were relaxed.

Final complete browser run: **220 passed in 6.3 minutes**, using the normal four-worker configuration and fresh servers on ports 5461/5462. Source was stable throughout. After final review added an opened Inspect-menu assertion, type checking passed again and the strengthened Preview/Inspect regression passed in 2.3 seconds. There are no unresolved failures from these final runs.

The concurrent Windows stress-testing chat confirmed that its eight-worker cohort overlapped the earlier four-worker run and stopped its heavy tests while this run finished. The chats agreed on separate testing windows and file ownership. This is a concrete confound for timing comparisons, not proof that every earlier timeout had the same cause.

One earlier complete unit run under concurrent browser/build load failed a draft-ledger mock rejection test. That test subsequently passed unchanged alone, with all 119 tests in its file, and in the final complete unit run. Review found a plausible outstanding autosave-timer/mock race, but did not prove it caused that occurrence; no unrelated persistence code or test was changed. The first sandboxed unit attempt could not collect tests because Windows refused renames in the isolated temporary directory. Setting `TEMP` and `TMP` to an ignored workspace scratch folder resolved that environment failure. Existing installed browser binaries were reused; no installation was needed.

All generation tests use offline fixtures. No PixelLab generations or rig setup requests were sent. Other contributors' stress configuration and testing documents are outside this change and remain under their ownership.
