# Follow-up polish review

2026-10-23. Scope: the user's selection, stage composition, navigation, attached-control and creator-readability requests. This supplements the regression audit; it does not replace its original before/after attribution.

## Initial causes

- Actor, selection caption and playback use different approximations. `World.layout()` estimates the rail as `min(470, width × .29)` and applies a `.55` multiplier. Large-screen caption/playback use 40.5% and 42% of the whole viewport; landscape uses 33% and 34%. The actual sidebar comes from separate CSS widths and insets. These formulas cannot share an exact center and do not account for the real narrow-landscape sidebar.
- Character row and canvas selection currently always call `changeCharacter()`, including when clicking the current character. They have no selected-character activation path.
- The generic click handler returns as soon as it handles any `data-action`. Panel changes therefore bypass its later outside-click dismissal; the panel action must dismiss transient menus itself.
- All parts repeats Head/Hair/Body despite their dedicated category controls. Its menu should contain only the additional Back/Held item choices. The panel order currently places Moves before Outfits.
- Phone view navigation uses `justify-content:space-between`, distributing surplus width across the row. Each label should keep its intrinsic width and the group should start at the left content edge.
- Facing and mirror buttons already share a flex row without a gap, but both keep all four rounded corners. Their internal corners need to be square and their outer corners rounded, with a flush shared seam.
- Creator fields have opaque fills; several preset/Auto/facing/mirror buttons retain transparent backgrounds or accent mixed with transparency. A bright or patterned world can show through and weaken their boundaries. Text contrast must be assessed after compositing the effective control backing over possible scene colors, rather than against token colors alone.

At the previously measured 1469 px viewport, the actual rail began at x1109.4, making the free-stage center x554.7. The separate formulas placed the actor near x573.6, caption at x594.9 and playback at x617.0. Correcting their shared center also requires checking that a wide playback bar still fits the smaller free space in narrow landscape. Overlapping carousel hit targets must resolve in reverse paint order so a neighbour behind the selected actor cannot steal its activation.

## Verification contract

The new `verify-polish.mjs` checks user-observable outcomes: selected-row and canvas activation behavior; painted actor-cell, caption and playback centering relative to the actual visible rail; additional-parts menu contents and dismissal through all four panels; panel order; left-aligned intrinsic phone tabs; GitHub icon/text order and external-arrow alignment to the row's right content edge; joined mirror/facing geometry; and effective creator-control backing/contrast in both appearances. Row coverage includes an actual `dblclick()` on an unselected row, rather than substituting two independently relocated clicks. The resize checks go desktop → landscape → portrait → desktop in both selection and Studio. Browser requests remain restricted to the isolated local prototype, with Vite HMR disabled during interactions.

The strengthened WebKit double-click check found that rerendering reset the short-landscape library scroll position after the first click. The second click consequently landed somewhere else. Preserving the library and nested list scroll positions across selection changes keeps the target under the pointer.

Filtering the parts menu also exposed a positioning regression: the old fixed `31dvh` position left the shorter menu detached from its More trigger. The popup now follows the actual trigger with an 8 px gap and viewport clamping. The first above-trigger placement at 320 × 500 covered every panel tab; the correction keeps navigation clear and uses a scrollable below-trigger menu when space is constrained. Both Back and Held item were selected through that clipped menu in each engine.

A final real scroll probe found that a trigger scrolled above the viewport could pull the menu to y−76 in 568 × 320 and y−76.6 in 844 × 390. The helper now clamps its origin within the viewport and retains at least 64 px of available menu height. Tests scroll the wardrobe to its maximum while the menu is open and resize the scrolled layout, rather than only checking its initial rectangle.

## Creator label contrast and world visibility

Opaque controls alone did not fix the open labels. Actual screenshot-background probes found, for example, dark 1469 px Build/Proportions labels at approximately 4.13:1/4.04:1, light 1469 px Skin at 3.13:1, and light 1920 px Proportions at 3.31:1. The initial stronger 92–96% global creator backing solved readability but made the world too faint in the lead's full-size visual review.

The final compromise retains the existing muted hierarchy and uses a creator-only gradient: the form region has 85–88% surface backing in dark mode and 90–92% in light mode. Wide layouts keep more world behind the size guide, whose labels use the primary text role. The gradient reaches its form minimum by 19% of viewport width, before the leftmost two-column form position at the 1350 px breakpoint. Full-width form layouts, including wide windows at short landscape heights, use a vertical gradient with the same minimum. Other screens' immersive navigation and materials are unaffected.

These values follow the actual tokens rather than an arbitrary opacity target. Against either extreme scene backdrop, muted text needs at least 83.344% backing in dark mode and 88.832% in light mode for 4.5:1. The chosen rounded minima produce at least **4.765:1 dark / 4.626:1 light**. Using primary labels could support substantially lower global backing, but would require further local decisions for muted helper text; the selected treatment keeps the existing hierarchy and exposes roughly two to three times as much dark-world contribution as the 92–96% trial.

The automated scene-text check captures the actual rendered background with text temporarily transparent, samples the visible text ranges after clipping them to every scroll ancestor, and checks 4.5:1 for normal text / 3:1 for large headings at top, middle and bottom scroll positions. It includes field labels, section headings, exact-prompt excerpts, mirror summaries, footer notes, size-guide labels and editor labels. It adds no opacity requirement to immersive navigation rows. Its temporary page styles are removed immediately; no runtime files or capture artifacts are written.

## Creator boundary audit

The `POLISH_CREATOR_BOUNDARIES=1` mode crosses 1350/1351, 1000/1001 and 760/761 px widths with 540/541 px heights, plus 540/541 px widths at 390 px height. This exercises every creator width regime, the short-height override, its minimum width, and their ordering. All cases use coarse input to challenge the wider mirror targets. Geometry checks cover title/Name separation, control-row fit, every control's scroll reachability, form/footer bounds, attached corners and target size; actual scene-text samples run at three scroll positions.

| Creator boundary result | Cases | Minimum sampled normal text | Minimum sampled large heading |
| --- | --- | --- | --- |
| Chromium | 28 passed | 4.98:1 | 12.13:1 |
| WebKit | 28 passed | 4.90:1 | 12.13:1 |

Both runs reported no page errors or external requests. The additional 1350 × 500 wide-short layout is included in the full polish matrix.

## Final verification

| Run | Chromium | WebKit |
| --- | --- | --- |
| Full polish matrix, including 1350 × 500 | 24 passed | 24 passed |
| Creator geometry boundary matrix | 28 passed | 28 passed |
| Final popup-scroll/resize correction: 320 × 500, 568 × 320, 844 × 390, both appearances | 6 passed | 6 passed |

The full 24-case runs completed before the last popup-origin clamp. The final six-case runs tested that clamp directly, including maximum wardrobe scroll, resizing an open menu, selecting both additional parts through popup scrolling, and switching through every panel. Creator geometry/materials were unaffected by the final popup-only change, so the 28-case boundary runs were not repeated. All runs reported **zero page errors and zero external requests**.

The full matrix's minimum sampled normal/large text contrasts were **5.00:1 / 12.13:1 in Chromium** and **4.98:1 / 12.21:1 in WebKit**. Across the creator boundary matrix, the lowest normal-text sample was **4.90:1**. These checks sample foreground/background colors over the actual fixture scenes.

Run the default script for the full matrix. Set `BROWSER=webkit` for the second engine, `POLISH_CREATOR_BOUNDARIES=1` for the systematic creator branch audit, or `POLISH_WIDTHS=320,568,844` to select the final popup-scroll cases. Use the documented Node 24 runtime, managed browser cache and keyless server on port 5202. No remaining implementation issue was identified in this review.
