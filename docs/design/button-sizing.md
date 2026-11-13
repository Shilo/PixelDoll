# Button sizing

## Decision

Use `--ctl-h: 48px` as the minimum button height and width in the production Studio, for mouse and touch alike. Larger actions and content tiles may remain larger. Bronze UI owns appearance; PixelDoll owns this geometry.

Apple recommends a 44 by 44 point button hit region. Android recommends at least 48 by 48 dp. These are native logical units, not device pixels or a guarantee of physical size in a browser. A 48 by 48 CSS-pixel target is PixelDoll's cross-platform web default, rather than separate platform-specific sizes.

- [Apple buttons guidance](https://developer.apple.com/design/human-interface-guidelines/buttons)
- [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)

## Source audit, November 13, 2026

- Shared legacy `.btn` controls used 40px on desktop and 44px on touch or small screens. Small buttons and segmented controls subtracted another 4px, chips subtracted 2px, and text buttons could shrink to their text height.
- Bronze `.bu-action` deliberately supplies appearance without dimensions. Most experience controls supplied their own 44px minimum, but the PWA dialog's Update now, installation, updated-app link, and Close actions did not. Their height could collapse to one line of text.
- Headers, view tabs, playback, zoom, character navigation, panel tabs, menus, dialogs, import/export controls, share actions, and color swatches used a mixture of intrinsic height, 24px, 28px, 32px, 36px, 40px, 44px, and larger action heights.
- The shared Studio rule now floors buttons and button-styled links/labels at 48px in both dimensions, including small, text, icon, swatch, and segmented variants. Existing larger controls retain their dimensions. The appearance-only action recipe also receives default local alignment and padding.
- The item tile options glyph retains its 28 by 25px visible box, with a 48 by 48px pointer target extending inward from the corner. This intentionally gives the menu more of the tile's upper-right area without enlarging its artwork or overlapping neighboring tiles.
- Header, floating view-tab, panel-row, and playback reservations account for the larger controls. The minimum playback reservation is 58px, including padding and its border. The existing measured-height path still handles wrapped controls.
- At 320 by 400px, the existing minimum-sheet safeguard now hides the panel instead of squeezing controls into insufficient space. A 320 by 404px viewport still fits the minimum 200px panel. Existing geometry expectations reflect this intentional boundary change.
- Native input internals, decorative icons, artwork, and developer-only diagnostic pages are not production buttons and are outside this sizing change.

## Verification limits

Source review only. At the user's request, no tests, builds, or browser checks were run. Dark/light appearance is unchanged, but narrow/short layouts, wrapping, and the larger item-menu target remain visually unverified.
