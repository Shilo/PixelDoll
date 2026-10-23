# Character creator implementation — 2026-10-22

Implements the approved compact workspace in the actual Svelte Studio. Earlier design/prototype evidence is in
`create-character-review-2026-10-22.md` and the two character-creator research documents.

## Implemented behavior

- Name in the title bar; Appearance / Prompt tabs with conservative, lossless canonical trait-line syncing.
  Kind, Build, Proportions and Skin default to Not set. Arbitrary prose is retained without guessing its meaning.
- Exact prompt preview, Copy, V3 Enhance / Undo. Sends `description`, `image_size` and `view` to
  `/enhance-character-v3-prompt`. A single foreground submission, no automatic retry. Stale results and errors preserve text.
  Canceling Connect discards its pending action. Creation sends the displayed exact prompt unchanged.
- Body presets 48 / 64 / 96 / 128 and a permanently visible custom field (32–256 whole pixels).
  Manual typing clears preset selection. Frame Auto computes padding, capped at the API's 256 px ceiling; manual entry
  turns it off. Both fields have an internal px suffix. Auto has the same width as a body preset.
- Fixed size-guide geometry; Camera below it. Five direction presets arranged 2 + 3, all individual directions selectable,
  and attached left/right mirror toggles. Either horizontal partner may be the source. No cycles or dangling sources.
  Removing a source promotes its remaining partner to an original view. Seed is last and blank means fresh variation.
- New creation always generates and registers all eight original V3 views, including south when it is not selected.
  It animates only selected unique sources and derives mirrors in frozen cells, skeletons and anchors.
  Existing in-flight legacy specs retain their original registration payload for ledger reuse.
- Flexible rig cells propagate through normalization, pose generation, added moves, item frame limits, held-item padding,
  completion/import previews, thumbnails and export. Skeleton estimation pads to a supported square and maps joints back;
  it never resizes the input art. Cropping visible pixels is rejected.
- Whole-title help supports hover, focus and tap; Escape dismisses help without closing the creator.
  Existing PixelLab API peeks remain immediately before actions, with current settings and scoped call history.

## Validation

| Check | Result |
|---|---|
| TypeScript and Svelte | 0 errors, 0 warnings |
| Vitest | 205 tests passed |
| Production build and credential guard | Passed; existing bundle-size advisory remains |
| Complete Playwright regression suite | All 46 cases passed; Windows runner teardown is being checked separately |
| Responsive checks | 320×568, 390×844, 844×390, 768×1024, 1440×900 |
| Offline end-to-end generation | Side-scroller with E mirrored from W, custom 81 px frame; diagonal 160 px frame; Unique 8 at 256 px |
| Persistence / export | Reloaded projects, checked exact PNG mirror pixels and sheet dimensions; custom ZIP round trips included |
| Enhancement failure paths | Error, malformed output, stale response, closed sheet and canceled connection; no automatic paid retry |
| Live V3 enhancement | One request, HTTP 200, 96×96 body canvas, side view; reported 0.05 gens; Undo restored the original |

Codex browser manually exercised the real app at localhost:5199 and an offline fixture on a dedicated normal dev origin.
Desktop and phone checks cover linked controls, arbitrary sizes, camera help, presets, reverse mirrors, enhancement,
failure recovery and a complete mobile creation into the Studio. The offline fixture intercepts every PixelLab request;
it does not assess AI artwork quality. No live character or animation generation was purchased during this implementation.

The fixture is dev-only at `/dev-fixtures/creator/index.html`, requires a normal server rather than agent mode and refuses
a saved key. Use a dedicated empty test origin. It is not included in production builds. Parallel test runs can set
`DEV_PORT` and `TEST_OUTPUT_DIR` to avoid shared ports and trace directories.

## Bugs caught during implementation

- Hover followed by click hid help, and scroll events could dismiss it immediately. Help now stays readable and repositions.
- Completion and import previews still assumed 64 px, clipping larger frames. Previews use image dimensions and fit limits.
- Authored added-move frame counts assumed a south reference. They now use an available unique rest view.
- A connection-cancellation flag could retain a future paid enhancement. The flag is now set only by the successful connection callback.
- Larger held frames could exceed 256 px with the old fixed padding. Padding is capped symmetrically at the endpoint limit.

## Practical limits

Body size is V3's source canvas, not a guaranteed measured opaque body height. Camera and appearance are model guidance.
The mannequin rig remains humanoid. Mirroring reverses asymmetric details. Full live AI quality across all sizes and
cameras remains unmeasured here; deterministic fixtures validate orchestration, pixels, storage and UI behavior.
The separately qualified paid shared-equipment fitting experiment still supports its documented 64 px low top-down rigs.

## Independent review

The requested post-commit challenge review and its accepted/rejected findings will be recorded after the implementation commit.
