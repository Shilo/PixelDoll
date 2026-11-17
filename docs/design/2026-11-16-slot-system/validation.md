# Validation and council record

Status: production implementation on `feat/modular-equipment-slots`, authorized November 16, 2026, with the approved inline Wardrobe follow-up implemented November 17. Visible-browser review is complete for the follow-up; physical-device touch qualification remains pending. The workshop sections below are historical evidence, not current implementation status.

## Production review and validation

The requested Opus 5.5 medium, Sol 6.1 medium and DeepSeek V4.1 Flash low council reviewed the implementation independently. Their disagreements did not become extra controls: Studio keeps fixed built-ins, optional custom naming and one Works like setting, with no raw JSON editor or arbitrary bone picker.

Concrete review findings changed the delivery:

- Copied hand categories now retain side-specific drawing and two-handed replacement behavior, including deterministic default right-hand priority.
- Shared custom equipment can adopt a missing compatible category. A reused key with different behavior, or a conflicting display name, produces an actionable error rather than silently rebinding artwork.
- Wardrobe moves store whole non-negative positions. Moving a category no longer makes export validation fail. Known directional profile defaults remain legal when a character currently has fewer directions.
- Settings Save validates once and creates one undo step. Changing Works like or Hand follows that profile's depth unless the user actually changes Draws above.
- Category deletion with items is one database transaction. If validation or writing fails, none of the category, items, colors or outfit entries are removed. This destructive operation cannot be undone.
- Slot saves merge changes against the view's starting definitions. Routine stale saves do not delete newer empty categories or resurrect deleted ones. Undo preserves categories used by item attempts.
- Universal clothing extraction and repair masks are distinct. Body, Outerwear and Underwear accept full-height artwork; repair starts from a body-region band and follows the approved garment's hem so it does not automatically repaint the face.
- Shared-only categories appear in Wardrobe without being added to the target until an item is copied or fitted. Blank creation needs no setup and returns focus to the name field.
- A paid draft's frozen category definition can restore a category removed elsewhere during preparation, preview or acceptance. Incompatible reused keys and concurrent depth changes are refused before saving.
- Two-handed status works before the opposite hand category has any items. Deleting a custom category also clears references that could otherwise hide a later category reusing its key.
- Base has no Wardrobe metadata. Shared adoption rechecks display-name conflicts inside the write transaction, not just during its initial plan.
- Arrow navigation focuses the Slots action without opening its dialog. Category navigation still follows focus; opening a settings dialog requires explicit activation.

Completed checks so far:

- Final `npm run check` passed, with zero Svelte errors or warnings.
- Final `npm test` passed: 194 files, 2,653 tests passed and one skipped. The first full run exposed a controller test's no-op database mock; its save callback now exercises the real transaction contract, without changing the identity assertion.
- A later full unit recheck during another workstation run hit three 20-second timeouts and one timed state expectation. Each failed test passed on its single isolated rerun without changing code or timeouts. Treat these as suspected shared-resource flakes, not a clean repeat full-suite pass.
- Final snapshot recovery, sparse-hand classification, deletion cleanup, Base metadata and concurrent-copy regressions passed with the related targeted suite: 119 tests.
- Final `npm run e2e -- --all` passed all 363 browser tests. The seven focused regressions also passed before the full rerun, including custom-category adoption, two-handed interaction and rail keyboard navigation.
- Targeted profile, custom-hand, shared-copy, validation, import and Unity export tests: 191 passed.
- Targeted garment coverage, Studio flow-state and profile tests: 163 passed after correcting repair-mask behavior and updating tests to the new permanent category keys.
- Targeted Studio slot, dress persistence and export-validation tests after the review fixes: 44 passed.
- The new browser flow passed: blank and repeated naming, rename, showing/hiding Underwear, keyboard reorder with retained focus, save/reload, occupied-hide refusal and unchanged rendered pixels after browsing changes. The extended case also passed at 320 by 568 in light mode, retaining settings without horizontal overflow. Its first run missed the More options menu in the test; correcting that interaction required no production change.
- Native Godot editor import, execution and packaged PCK verification passed with copied held slots. Unity verification passed 4,412 Editor Play Mode checks and 648 GPU checks in each of Gamma and Linear. A standalone Unity player was not built.
- Manual live T3 DOM interaction confirmed blank-name Accessory creation, an Accessory 2 placeholder on the next creation and focus returning to the name field. The browser was not producing screenshot frames, and requested viewport changes did not reach the page while T3 was hidden. This is not visual approval or phone validation.

Remaining proof and limits:

- The first full end-to-end run passed 356 of 362 tests. It exposed the Slots keyboard-activation bug plus stale test-only category labels and an Off hand fixture incorrectly copying a right-hand profile. The fix preserves focus assertions, uses permanent category keys and constructs the real left-hand profile. Focused reruns and the final 363-test full run passed. Final council review and snapshot-recovery regressions are complete.
- No paid requests were made. New AI-generated underwear/accessory quality, different body proportions and all supported character sizes are not qualified by these checks. Offline synthetic frames prove mask and compositor behavior, not model output quality.
- At this earlier snapshot, physical-touch dragging and the final visual comparison were pending. The inline follow-up below records the subsequent browser review; automated touch checks are still not a substitute for physical hardware.

## Inline Wardrobe follow-up, November 17, 2026

The user approved replacing the organizer list with the header's flexible area as the menu trigger and drag source. Random, New item and the navigation rail remain. Add slot stays reachable under the rail. Not shown expands at the bottom, with explicit Show buttons and drag-out restoration. Built-in behavior stays fixed, and dragging into Not shown never hides a slot. This iteration used the established council for gesture implementation, UI implementation and independent risk review, plus a final accessibility review.

Concrete browser findings shaped the implementation:

- The header uses a real flexible-width Bronze action, not a fixed-width overlay that could overlap Random or New. At 320 px, its measured hit width was 113 px, with separate 44 px action buttons and no overlap or document overflow.
- Hold feedback keeps the original touched icon mounted. Replacing it detached the native touch target and prevented movement from reaching the drag handler.
- Drag attachments remain mounted when slot data changes. Reattaching at drop time had removed click suppression before the browser's release click.
- Escape consumes only an active slot gesture, so canceling a drag does not also leave Wardrobe. Subsequent ordinary Escape handling is unchanged.
- Slot counts remain available as accessible descriptions, including the separating space in “2 items.”
- Revealing a hidden slot at a chosen position is one undo step. A no-op, canceled or out-of-list drop adds none. Drawing order remains independent.

Verification:

- `npm run check`: zero Svelte errors or warnings, TypeScript and formatting passed.
- `npm test`: 195 files passed, 2,681 tests passed and one skipped. The gesture helper's 27 tests also passed after the final Escape fix.
- `npm run e2e -- --all`: 359 of 365 passed. The two slot-related failures exposed Escape propagation and count spacing, both fixed without weakening assertions. All three inline slot workflows and the affected shared-copy flow then passed together.
- The four other full-run failures were the fallback-font creator toolbar, Tier 3 setup, Tier 1 setup and tablet-portrait joystick. Each passed on its one isolated rerun without code or timeout changes. These are suspected shared-resource flakes, not a claim of a clean repeat full-suite run.
- The slot browser flows cover click tolerance, Escape cancellation, mouse reorder, dragging a hidden slot into position, one-step Undo, refusal of a drop over Not shown, native Chromium touch scrolling before a hold, and native touch reordering after arming. Add, rename, show, hide, keyboard menu movement, focus, reload and unchanged rendered pixels are covered too.
- T3 screenshots were inspected at 390 by 844 dark, 1280 by 800 light, 320 by 568 light and dark, and 844 by 390 dark. The contextual menu, pinned Add slot, hidden disclosure and Add sheet were exercised. Small-screen content scrolls within the existing sheet and Wardrobe; controls remain reachable. Some initial screenshot attempts failed while T3 was hidden; a fresh owned preview tab produced the reviewed frames.
- Theme ownership verification passed. Local changes contain layout and insertion-marker geometry; materials, hover and focus appearance use Bronze UI recipes.

Limits: no physical iOS or Android device was tested, and no paid generations were made. Chromium touch input establishes event wiring and scrolling behavior, not device-specific long-press sensitivity. The existing light desktop scene can reduce contrast behind transparent secondary headings; this iteration does not change shared theme materials.

## Historical workshop evidence

## Corrected Body and Legs revision

The user clarified and selected the clothing arrangement: Body and Legs remain separate shown slots; Body accepts upper-body or full-body artwork and draws above Legs. Outerwear and Underwear each have one hidden universal slot. Extra independently selected outer/under tops and bottoms are custom slots. The current prototype therefore starts with ten shown and six hidden, superseding the historical ten/five and Underwear comparisons below. Slot identity, built-in editing and populated hiding remain comparisons, not approved production changes.

- Browser interaction checks passed for 16 built-ins, ten shown/six hidden, Body label, no split Underwear built-ins, combined underwear examples, a custom Underwear top copied from Underwear, populated hide refusal, Reset and partial runtime descriptor depths.
- The new front-view layer diagram uses simple geometric masks, not generated clothes. A sampled overlap pixel changed from the Body color to the Legs color when Body was unequipped. Switching Body to Full outfit left Pants equipped. Reordering the Body manager row left preview pixels unchanged. These prove selection and illustrative depth only, not extraction, articulation or canonical rendering.
- Desktop browser DOM checks at 1402x876 and small-screen checks at 320x568 found no horizontal document overflow. The Underwear settings dialog fit the small viewport. The light-theme diagram and disabled directional selector were checked through the DOM. Physical touch remains untested.
- Embedded preview rendered at 390px in light mode with no console messages; that image was visually inspected. Desktop screenshot capture still reports that the browser is not producing screenshot frames. The original localhost 5198 server returned ERR_EMPTY_RESPONSE; the fallback browser host was unavailable. An owned localhost server on 5216 restored T3 browser interaction checks without touching other servers.
- JavaScript syntax and theme-ownership checks passed. Source formatting and both bundles were regenerated. No production app tests, builds, engine parity checks or paid calls were run for this isolated prototype.

The default layer sequence is Base, Underwear, Legs, Body, Outerwear. Wide pants may remain visible outside a dress; no selection is automatically cleared. Underwear remains usable on nude and clothed bases, but does not remove clothing baked into the Base. Full-body extraction and custom copied behaviors still require production validation.

## Accessory documentation follow-up

Following independent Sol and Opus reviews, the user approved optional naming with the Accessory fallback and numbered repeats. No required region picker. Default drawing position is above Body and Legs, below Outerwear, Hair and held items, with adjustable order. This supersedes the initial region-based creation proposal. It adds no built-in and preserves one selection per slot. The plan explains readable-key API and folder behavior and records the reviewers' disagreement about Hair accessory.

The blank-name fallback and revised default depth are not implemented or tested. Existing Add slot and Start with controls only approximate the proposal. No prototype or production files were changed for this documentation follow-up, and no new browser, generation or engine checks were run. Future acceptance checks include blank and repeated names, case-insensitive collisions, default depth independent of Wardrobe order, clear feedback when Outerwear covers the item, and actual accessory fitting. Production implementation remains separately unapproved.

## Council composition and dissent

The requested models were GPT-6.1 Sol at medium reasoning and Claude Opus 5.5 at medium effort. Independent delegated reviews examined architecture and workflows. Their findings were challenged against one another; agreement was not manufactured by treating one model's imagined internal voices as additional reviewers.

| Topic                  | Sol position                                                    | Opus position                                                             | Workshop treatment                                                                                                  |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Identity               | Permanent readable keys plus labels; keep current built-in keys | Permanent readable keys plus labels; suggested cleaner built-in keys      | Compare name references; retain existing keys to avoid unnecessary churn                                            |
| Built-in editing       | Resolved per-character customization with reset                 | Smaller inherited-profile surface; no advanced authoring editor initially | Fixed/copy and customize/reset modes; advanced settings clearly simulated                                           |
| Duplicate labels       | Prefer uniqueness including hidden slots                        | Consider allowing a custom replacement while hidden original unavailable  | Prototype permits hidden-label duplicates with different keys, exposing the ambiguity; production policy unresolved |
| Hiding populated slots | Favors one hidden group with equipped counts                    | Favors blocking until empty                                               | All three policies; empty-only initial mode follows user's current preference                                       |
| Underwear              | One experimental hidden combined slot, provisional z15          | Custom-only because standard body has baked underwear                     | None, combined and split; no generation claim                                                                       |
| Custom depth ties      | Independent deterministic render ordering                       | Suggested base+1 and list-order tie                                       | Reject list-order tie because browsing must not alter pixels                                                        |
| Metadata               | Existing runtime manifest plus project authoring concerns       | Reuse manifest; no depth suffix                                           | Three export comparisons; loose PNG explicitly not parity                                                           |

## Verification record

- JavaScript syntax checks passed for `prototype/workshop.js` and `prototype/bundle.mjs`. Prettier ran only on changed source/docs. Both generated HTML files were regenerated afterward from installed Bronze UI 0.3.6, fixture PNGs and the current source.
- The existing theme-ownership tripwire passed, including a targeted `checkOwnership` call on `prototype/workshop.css`. Shared component appearance stays in Bronze UI; prototype geometry stays local.
- Desktop browser initially loaded existing fixture artwork without reported console errors; the initial desktop screenshot was inspected. Later T3 screenshot capture could not obtain desktop frames, so final visual screenshot review is incomplete. This is not reported as full visual approval.
- Browser DOM/layout checks passed at 1440x900, 390x844, 320x568 and 844x390. Manager/export surfaces had no horizontal document overflow. Settings dialogs fit the checked small portrait and landscape viewports. Light and dark states were exercised, not a substitute for physical-device or final visual review.
- Embedded-frame previews at 728px dark, 390px dark and 320px light rendered without reported console messages. The frame follows host color preference and hides its standalone theme switch; `workshop.html` retains both themes. Fixed dialog bounds replace viewport-height units only in the embedded packaging.
- Browser interaction checks passed: ten shown/five hidden inventory; empty-only populated refusal and empty-after-delete path; collapsed and single-group hiding with unchanged equipped state; return to empty-only restores populated categories; Undo; combined/split Underwear; independent browsing order; stable-key rename; name-reference rename breaking an old key; suffix and loose-art warnings.
- Council blocker reproductions passed after fixes: atomic outfit remapping when a custom `chest` key overlaps a renamed built-in; restoring original keys on return to key mode; duplicate experimental Underwear keys rejected; copy form submits without extra typing; name-mode factory reset remaps keys; duplicate-label identity transition rejected; duplicate labels disambiguated in Wardrobe.
- Input checks passed: actual pointer drag of Head onto adjacent Hair changes their order correctly and restores handle focus; group-end Move controls are disabled; hiding retains manager focus; closing the editor restores its opener; arrow-key tab navigation works. Physical touch and continuous edge-autoscroll remain unverified.
- Foreground depth changes below body z10 changed sample pixels; Undo restored the original canvas. This proves the illustrative painter's depth control only, not canonical rendering parity.
- Both download controls completed. Downloaded JSON parsed successfully with `exampleOnly` markers and expected slot/hidden counts. No production loader was invoked.
- No production source files are part of this change. No PixelLab calls, paid generations, real character writes or credential reads are needed.
- App-wide check/unit/E2E suites are not required for docs plus an isolated static prototype. They are not claimed as run.

## Fresh artifact review and disposition

Independent artifact reviews: [Sol contract review](t3-thread://v2/4bd92ed5-5417-4d87-8dfb-d5737c6cb02d/thread:delegated-task:command%3Amcp%3Afa8dcd92-4bd1-4418-995e-d1efd3b21b18%3Adelegate-task%3A746275f3-705f-4e03-85ca-95d01c5b2da4), [Opus workflow review](t3-thread://v2/4bd92ed5-5417-4d87-8dfb-d5737c6cb02d/thread:delegated-task:command%3Amcp%3Afa8dcd92-4bd1-4418-995e-d1efd3b21b18%3Adelegate-task%3A38696e3e-e3df-4e08-86cb-e8046053cf92).

Both were static reviews. The coordinator fixed their blockers and reproduced the relevant flows in the browser; the reviewers did not independently reapprove the final revision.

| Finding                                                                                           | Disposition                                                                                                              |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sequential identity rewrite could overwrite saved outfit entries; key mode failed to restore keys | Atomic mapping from original references, creation keys retained, duplicate transition rejected; reproduced               |
| Underwear toggle could duplicate a custom key                                                     | Conflict check before mutation for combined and split presets; reproduced combined conflict                              |
| Name-mode Reset left an unrelated key; reused deleted keys overstated compatibility               | Reset validates/remaps; indicator now says only that the key exists; deletion/reuse contract documented                  |
| Copy opened with missing key and misleading inherited dropdown                                    | Unique key suggested immediately; copies retain source-profile provenance and hide the creation-only profile picker      |
| Move crossed hidden-group boundaries; adjacent drag was off by one                                | Group-scoped move and disabled boundary controls; drag target index captured before removal; actual adjacent drag passed |
| Focus, tabs and repeated accessible names                                                         | Retained action focus, close-event opener recovery, proper tab roles/keyboard behavior and category-specific labels      |
| Body ignored its z; advanced settings implied unsupported art                                     | Body sorted at z10; creation-ordinal tie order; explicit unqualified-generation and populated-item warnings              |
| Reset exposed for experimental/fixed slots; duplicate labels unclear in dressing                  | Reset only for editable qualified built-ins; duplicate keys shown in Wardrobe/equipped summaries                         |
| Underwear toggle silent; empty-only Hide looked broken                                            | Toggle disclosure, baked-base warning and empty-only button label; policy restoration feedback                           |
| Generated bundle drift                                                                            | Reproducible bundler; both committed outputs regenerated with every source revision                                      |

Remaining judgments: keep the compact Face label for comparison, with scope defined as accessories rather than anatomy; Undo intentionally includes experiment settings so a risky comparison can be reversed. These are not production decisions. Raw JSON override editing is retained only to inspect metadata needs and should not be mistaken for a finished casual-user control.

## Explicit limitations

- This is a foreground-only illustrative painter, not the canonical compositor. It does not validate custom extraction, anchors, masking, background splits, padded held sprites or native-engine parity.
- Export downloads are partial marked design examples, not usable engine archives. Do not replace existing manifest consumers with them.
- Physical touch scrolling, long-press interaction and continuous edge-autoscroll are not proven by desktop browser checks.
- Name/path validation is illustrative, not a production security boundary. Plain JSON advanced input is an expert comparison, not final simplicity-first UX.
- Settings are in memory and reset on reload. No persistence or shared-library compatibility is promised.
- The factory baseline ten/five layout is a recommendation. Existing grouped access to Outerwear and Waist means hiding them is a discoverability change, not free cleanup.

## Discussion after trying the workshop

We should settle the stable-key versus mutable-name tradeoff first, then decide whether built-ins can be customized in place. Those choices determine whether duplicate labels and copied categories are worth supporting at all. Next choose hiding, Underwear and the smallest advanced surface that is honest about supported art.

Do not start production implementation merely because the prototype feels interactive. Approval must specify policies and support boundaries, with offline test cases from the [plan](plan.md).
