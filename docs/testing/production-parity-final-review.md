# Production parity final review

2026-10-23, feature branch `feat/game-experience-rework`. Claude took over from the [continuation handoff](../../.claude/handoffs/2026-10-23-production-parity-ui-ux-continuation.md) as lead UI/UX designer and completed the unfinished visual review. This supersedes the [review checkpoint](production-parity-review-checkpoint.md) as the current verification record.

## Method

The approved round-six prototype (port 5202) was compared with the production build (port 5208) at identical viewports and appearances: the 40-pair matrix (desktop 1440×900, phone 390×844, dark/light, every screen and panel), 36 real production dialog captures, and supplemental tablet 768×1024, small 320×568, landscape 844×390 and short-phone 390×667 pairs. Claude Browser was used for live DOM, computed-style and typography inspection of both apps. Captures use isolated browser contexts with external traffic blocked; no saved user data was read or changed and no PixelLab request was made.

Each pair was reviewed as a direct side-by-side composite at 1:1 pixels, then confirmed by crops and computed styles before any change.

## Confirmed defects fixed

| Defect | Evidence | Fix |
|---|---|---|
| Menus and popovers were see-through in the production build: panel tabs and item names showed through the ⋯ menu and Additional equipment. | Built CSS kept only `-webkit-backdrop-filter`; Chromium computed `backdrop-filter: none`. Reproduced with lightningcss in isolation. | Shared recipe fixed upstream in **Bronze UI 0.2.2** (prefixed declaration first; minified-consumer assertion added) and the pin updated. |
| Host-sized selects showed their value top-aligned (playback move picker). | `appearance: base-select` lays out `inline-flex` with `align-items: normal`. | Bronze UI 0.2.2 centers the value. |
| Phone Characters world ended in a hard horizontal edge ~620px down. | Phone backdrop is sized `auto 70%` so Studio's equipment sheet hides its edge; Characters has no sheet. | Characters backdrop covers the screen on phones. |
| Phone Import showed its icon and crossed the right gutter. | `.studio-app svg.lucide` outranked the phone hide rule. | Rule specificity corrected. |
| Unlabeled `</>` row in the ⋯ menu. | Menu reused the icon-only API trigger. | Menu row shows "API calls" (accessible name unchanged). |
| Colors/Outfits/Moves headings were 12–14px labels; Random/Reset 12px; outfits were unbounded text rows. | Prototype headings 18px/500, secondary 14px, bordered rows. | Restored heading scale and bounded outfit/move rows using Bronze `outline`/`row` recipes. Colors heading reads "Character colors" so it fits beside its actions. |
| Selected facing had no chip. | Facing buttons used `quiet`; Bronze has a `direction` variant. | Uses the shared `direction` recipe. |
| Live views gave no movement discoverability. | Prototype shows a timed "WASD or arrow keys" / "Drag in the world to move" hint. | Same hint, dismissed by movement or after 6.5s. |
| Fallback notice read only "View details". | Summary text carried no meaning. | Summary shows the notice itself, truncated to one line. |
| Prompt disclosure used a text "⌄" glyph, low and misaligned. | Prototype uses a Lucide chevron. | Lucide chevron sized to the text. |
| Characters typography was smaller than the prototype at desktop. | Computed: subtitle 16 vs 20px, caption 30 vs 38px, caption meta 12 vs 14px, row name 20 vs 22px. | Desktop sizes restored. |
| Live views spread three panel tabs across the rail. | Prototype keeps their Preview positions. | Three-tab rows pack left with the prototype's spacing. |
| Inspect selects showed two picker arrows. | Legacy wrapper chevron plus Bronze's native picker icon. | Legacy chevron hidden only where `base-select` is supported. |
| GitHub menu row styled as an underlined accent link. | Anchor defaults inside a menu row. | Inherits row styling. |
| Tablet view tabs fell below the header at the left. | Prototype centers them in the header; measured no overlap 761–1100px. | Header-centered on tablet. |
| Desktop creator focused Details instead of Name (handoff P2). | Initial-focus query searched only `.sheet-body`. | Searches the heading first; phones still avoid forcing the keyboard. |
| Light phone sheet let the floor show through its controls; landscape rail had no backing. | Production used `--bu-sheet-soft` in portrait and nothing in landscape; prototype uses floating→sheet in portrait and sheet-soft in landscape. | Prototype materials restored. |
| Fallback notice repeated itself when opened. | Summary and body rendered the same text. | Plain one-line note (13px desktop), no disclosure. |
| Creator Cancel sat ~4px above the header row. | Positioned at 24px against a 28px/50px header. | Aligned to the header row. |
| Movement hint overlapped the actor on short phones. | Fixed top position could not clear the actor with the sheet expanded (short phones start expanded by design). | Phone hint sits just above the fallback note and follows the sheet state. |
| At 320px the side compass arrows were 40px wide. | Equal tiles minus the 44px touch mirror strip. | ≤360px widens the mirror columns so every arrow keeps 44px; equal tiles elsewhere, as in the prototype. |

## Intentional differences retained

The handoff's accepted differences stand (real library, real palette ramps, full category coverage, account/API/Activity, Inspect, export, outfit CRUD, compact phone creator footer). Additionally:

- **Landscape view tabs** stay inline under the character name. The prototype's icon-only header leaves room that production's labeled Undo/Redo/Export does not at common phone-landscape widths (~667px).
- **Phone More popover** opens upward over the world: production lists five extra categories, which do not fit below the button inside the lower sheet. It is now opaque.
- **Move rows** keep thumbnails, frame counts and direction coverage; **outfit rows** keep the delete affordance (it reserves its column on desktop and appears on hover/focus).
- **Short phones** start with the equipment sheet expanded and hide the prompt line, as recorded in the [integration record](production-experience-2026-10-23.md).
- **Phone movement hint** sits at the bottom of the world above the fallback note rather than under the view tabs, so it never collides with the actor in either sheet state.
- **Creator Cancel** keeps the accent color shared by every production sheet; there is no separate back link because Cancel performs it.

## Not changed / follow-up

- The native file picker in Import is unstyled; a shared `::file-selector-button` recipe belongs in Bronze UI.
- Popovers can extend a few pixels past the desktop rail edge.
- Intermittent queue self-test under full-suite load (see Verification).

Resolved after this review: a follow-up sweep converted British spellings to American across interface copy, source identifiers, tests and docs (for example "Colour hint" is now "Color hint"). PixelLab request text keeps its original wording because the job ledger reuses finished calls by exact text; quoted evidence, logs and the persisted `cancelled` queue state are also unchanged.

## Verification

Pinned Node 24.22.1 / npm 11.19.1. Final build `bootstrap-DAZ5bj3y.js` / `bootstrap-CVXdSGRM.css`; dist guard clean.

- `npm run check`: zero errors and warnings.
- `npm test`: 79 files, **770 passed / 1 existing skip**.
- Focused experience suite (`playwright.experience.config.ts`, BASE 5208): **23/23 passed**, now also asserting desktop creator Name focus, phone backdrop fill, centered playback picker, direction chip, live hint, standard menu blur and the labeled API row.
- Standard production suite (`playwright.config.ts`, BASE 5208, 98 workflows): **96 passed, 2 failed** on the final build. Neither failure is in code this review changed, and both pass on rerun:
  - `studio.spec.ts:989` (reload restores failed create/move/setup) timed out waiting for the studio to load; it passed 2/2 in isolation.
  - The browser self-test page's queue check "connected follower takes over and submits its queued work exactly once" failed intermittently: 2 of 9 runs under full-suite load, 6/6 in isolation. No `app/src/lib` file changed since `f7d8d72`. Recorded as a follow-up timing flake.
  - The first full run on an earlier build of this review had 14 failures. **The same 14 also fail on the pre-review build `f7d8d72`** (verified in a separate worktree): stale tests left by the previous checkpoint's intended UI changes. They are fixed in the tests: the creator size readout now sits under its guide; the new-item entry points are "New held item" and "Use a saved design" instead of a `.tile.new` tile; and `selectedItemDetails` now locates the selected tile, because each category's detail row follows its equipped item. The compass check accepts equal tiles or equal arrows and still requires 44px arrows, which exposed the real 320px target-size defect fixed above.
- Prototype `verify-theme-ownership.mjs`: passed after the Bronze upgrade.
- Bronze UI 0.2.2: see its [patch record](../../../../bronze-ui/docs/PATCH-0.2.2.md).
- Independent review (fresh reviewer given the code and images, not these conclusions): no P1 findings. Accepted and fixed: light/landscape sheet backing, short-phone hint overlap, duplicate notice text, creator Cancel alignment. Rejected: floor seams crossing the phone caption (world art; the desktop prototype shows the same), outfit delete column (real control), short-phone prompt/eyebrow (documented short-phone policy). Deferred: native file picker styling and a few pixels of popover overhang.

## Evidence (local, ignored by Git)

Under `app/test-results/experience-comparison/`:

- `final.json`, `app-final/`, `gallery-final.html`: 40 final pairs plus 36 dialog captures; zero page errors and zero external requests.
- `pairs-final/`: side-by-side prototype | production composites at 1:1; `dialogs-final/`: four-variant dialog sheets.
- `after.json` / `pairs-after/`: the pre-fix build Claude reviewed first; `fix1.json`: intermediate. Neither is final evidence.
- `viewports-final/`: supplemental tablet/small/landscape/short pairs on the final build (the 320×568 Characters frame captures the app mid-load; the harness waits for the button, not for loading). `viewports-fix2/` is an earlier build.
- `prototype/`: the preserved approved baseline.
