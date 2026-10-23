# Owned theme showcase: final production coverage review

Date: 2026-10-23. Final source recheck at `http://127.0.0.1:5203`, against `control-inventory.md` and current production Studio. This supersedes the first-pass findings. Only this review file was edited; no production code, paid API or project data was changed.

## Verdict

**Pass as a representative, lightweight component-family proof for PixelDoll.** The showcase now contains Scene + five catalog pages: Controls, Creator, Library, Feedback and Overlays. The main missing families now have examples. It establishes an owned-theme foundation without duplicating the application or paid business logic.

This is **not** approval of a complete production migration or every component × state × context combination. The remaining limitations below should travel with the handoff. Exact workflow behavior, exhaustive account/job states, physical-device comfort, assistive-technology behavior and visual parity require integration checks.

A small native Dialog is justified here: production `Sheet` imports Studio state/queue. Importing that dependency graph merely to show a modal would undermine the disconnected proof. Conversely, the props-only real production `RequestFields` is reused appropriately with a narrow scoped bridge. No framework or general overlay manager is needed.

## Coverage now present

| Production need | Current showcase evidence | Assessment |
| --- | --- | --- |
| Type, links, icons, semantic colors, material, geometry | `theme.css` tokens; `components.css` recipes; display/UI/mono/tabular examples; moving scene; work surfaces and restrained floating controls | Covered as foundation examples, without claiming production-wide token migration. |
| Actions and interaction states | Primary/secondary/quiet/destructive/icon/disabled/busy/pressed; shared focus/hover/active recipes; toast and local dialogs | Covered. |
| Fields, validation and choices | Text/search/password/read-only textarea/file/select/number-unit; associated hint/error; checkbox/switch; creator tabs; keyboard `ChoiceGroup` radios | Covered. Read-only and field-associated invalid treatment are new contracts, not claims about old Studio. |
| Creator domain controls | Local prompt tabs, unit fields, Auto, camera/seed, presets, compass/attached mirrors, size illustration | Representative geometry covered. Rig validity and prompt parsing deliberately remain in production. |
| Equipment and palette | Stored artwork, selection separate from Wear selected, scene equip action, authored swatches/custom color/reset | Covered at primitive-family level. |
| Outfits and secondary actions | Library saved row, Wear state/delete action, inline name/save/cancel, local deletion | Covered without persisted outfit writes. |
| Shared design | Thumbnail, identity, compatibility badge/reason, free-review + API inspect, unavailable fit, compatibility disclosure | Representative card composition covered. |
| Sprite/frame and ramps | Keyboard-scrollable stored Walk strip; local Original/Warm steel choice and exact ramp pixels | Covered with real artwork. |
| Loading/jobs/quality/recovery | Spinner, pending/current/done steps, native determinate progress, local pause/resume/cancel/retry, static queue/result states, quality reasons/blocked Keep, account/offline/follower/unknown-request notices | Representative states covered, preserving failure versus uncertain paid execution. |
| Dense structured data | Real `RequestFields` in Library/API: object/array/long text/image metadata/null; ledger and long identifier | Appropriate production reuse with scoped semantic bridge. |
| Modal/sheet/popover/tooltip | Native Dialog label/opener restoration/busy dismissal, center/bottom/side, long review; native API/action popovers; hoverable Help; sanitized clipboard sample | Covered as owned primitives rather than blindly inheriting production concerns. |
| Import/export controls | Native file selection, warning/preview shell; five keyboard radio choices, checkbox, files disclosure, busy/ready export sample | Covered as combinations; no archive/export implementation is duplicated. |

## First-pass findings resolved in source

- Library adds switch, spinner/steps, action popover, outfit edit/delete, compatibility, ramps/frame strip, recovery and ledger.
- Production `RequestFields` replaces JSON-only proof; `.request-example` bridges text/divider/border tokens and provides practical summary targets.
- `.pd-unit:has([aria-invalid=true])` paints the visible unit boundary.
- Reset restores local palette. Character search uses stable actor identity.
- Equipment selection and wearing use separate state and Wear selected; the badge follows worn state.
- API-details dialog contains structured sample data; Copy copies sanitized JSON and reports clipboard failure.
- Below 380 px compass pieces stack with 44 px minimum targets; phone playback uses 44 px buttons and narrow wrapping.
- Tab panels remain mounted with `hidden`, Help sits outside the tablist, and radio choices implement arrow/Home/End and roving focus.
- Dialog resolves the popover trigger as opener when entering from its action list.

README/style guide are being written by the primary agent. Do not carry forward the first-pass missing-guide response as an unresolved defect without rechecking after those files exist.

## Remaining scope limitations

These are evidence limits and useful integration checks, not requests to clone workflows.

1. **Some geometries use simpler representatives.** Export radios use buttons/checks rather than title/subtitle/radio-dot cards. Size preview uses an icon rather than the production body/frame canvas. Playback lacks move selection, disabled direction and all-directions layout. No 96 px oversize item or all-direction/multi-move review is demonstrated. Their primitives exist; exact composite parity is unproved.
2. **Modal variants are sampled.** Wide/character-wide, inline heading name, no-footer, leading Cancel/Hide versus trailing Close/Done, and dense action+cost footer are not all shown. A wide form and long numeric-cost/footer action are useful next geometry checks.
3. **Costs/jobs are representative.** Free/unavailable cost+inspect exists. Numeric gens+USD/pending/unknown/partial totals, queue position/elapsed+Stop, auth/credit recovery and retained history are not implemented as a duplicate queue. Preserve meanings in production; use static specimens when changing those geometries.
4. **Design compatibility is sampled.** One card plus status disclosure does not exercise every multi-card loading, unavailable, import error, partial-copy count or inline card-delete combination. Existing recipes cover the families; actual data and authorization belong in production.
5. **Several form dialogs remain intentionally generic.** Import preview, New equipment, Connect account and Design details can show a common Name + visual-sample notice. Treat these as illustrative field-dialog shells, not functioning workflow previews. Keep their sample labels explicit.
6. **State examples do not replace platform validation.** Native file/color/select popups remain OS UI. Single checkbox/switch examples do not enumerate every disabled+checked state. Verify actual focus/selection/invalid/disabled composites in both appearances, zoom, forced colors and reduced transparency during migration.

Do not add range, mixed checkbox, drag/drop, calendar, rich text, interactive data grid, window manager or fake AI requests. These are absent from production or outside this app's needs. The simple activity table and native progress are appropriate.

## Modularity

Keep the current ownership: semantic values in `theme.css`, portable recipes in `components.css`, catalog composition in `showcase.css`, and narrow `Field`, `Notice`, `Help`, `Dialog`, `ChoiceGroup`, `Scene` components. Production RequestFields is props-only; no app store/client/queue was imported for styling.

The large catalog `App.svelte` can later split into page components if maintenance warrants it. A small popover owner becomes useful if placement/label/focus behavior is reused again. Neither an overlay manager nor a wrapper for every recipe is justified. Consolidate the RequestFields token vocabulary during production migration rather than keeping two permanent systems.

## Evidence and limits

The final recheck is source-based; current runtime testing is owned by the primary agent. Earlier independent headless checks covered Controls, Creator, Feedback and Overlays at 1280 × 800, 375 × 812 and 844 × 390 without page errors/document horizontal overflow. At 320 × 568, long-review footer stayed visible and Escape restored its opener. Those historical checks do not prove the later Library additions or corrected target geometry.

No screenshots, browser artifacts, dependencies, production files or project data were written by this reviewer. Contrast, screen-reader operation, physical-device comfort, every preference mode and visual parity are outside this coverage verdict.
