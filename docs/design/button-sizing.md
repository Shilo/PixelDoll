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
- The item tile options button is an exception to the 48px minimum: its target follows its 28 by 25px visible box, extending only 3px above and to the right to cover the tile's border gaps. Expanding inward would intercept presses intended to equip the item.
- Header, floating view-tab, panel-row, and playback reservations account for the larger controls. The minimum playback reservation is 58px, including padding and its border. The existing measured-height path still handles wrapped controls.
- Below a 360px stage width, facing cycles through one 48px button instead of wrapping four buttons into a second playback row.
- Short screens retain a compact scrolling panel with a 144px minimum instead of the normal 200px minimum, while reserving another 48px of stage space for the hero. At 320 by 400px the panel is 150px tall, all tabs remain reachable, and the character remains visible. Panels still hide when even that compact layout cannot fit or a measured wrapped playback bar needs the space.
- One-line creator fields, mirror strips, and inline outfit forms use the same control token so adjacent fields and buttons align. Textareas and native switches retain their own geometry.
- At phone widths up to 430px, the header uses 8px horizontal insets and the Demo qualifier sits below the character name. This preserves the name, full-screen action, and 48px targets without clipping.
- Native input internals, decorative icons, artwork, and developer-only diagnostic pages are not production buttons and are outside this sizing change.

## Verification limits

The initial delivery used source review only, as requested. CI subsequently exposed layout regressions, so the corrective work uses existing unit and end-to-end coverage for creator alignment, short-screen geometry, outfit forms, header names, and tile targets. The item-menu regression test checks the inset geometry and actual browser hit targets at the top, right, bottom, and left boundaries. Collaborating sessions also updated obsolete exact-label expectations after the Demo qualifier was added. No paid generations or manual browser checks were performed.
