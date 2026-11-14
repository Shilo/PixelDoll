# Button sizing

## Decision

Use contextual sizes rather than forcing every Studio control into a 48 by 48 CSS-pixel box. PixelDoll owns geometry; Bronze UI owns appearance and states.

- Ordinary desktop controls use `--ctl-h: 40px`; touch, small-width and short-height layouts use 44px. Existing primary scene actions, panel tabs and playback controls retain their own larger dimensions.
- Compact help labels, segmented choices, text actions and palette ramps retain their component geometry. A shared high-specificity minimum must not override them.
- Standalone Bronze actions receive low-specificity alignment and padding. Update-dialog actions have a scoped control-size minimum, so Update now remains usable without enlarging unrelated buttons.
- Creator one-line fields and Auto align at 44px. Mirror strips are 29px on desktop and 44px on touch or compact layouts, leaving room for the direction arrow beside them.
- Playback reserves 54px for one row and measures wrapped rows. Facing cycles through one button below a 300px stage width. Short-screen panels retain the original 200px usable minimum, or hide when it cannot fit.
- The item-menu target follows its 28 by 25px visible button, extending only 3px above and to the right across the border gaps. Browser hit testing protects these bounds so the menu cannot intercept equipping presses.
- New character fits a 1920 by 1080 desktop without scrolling. Narrower layouts reflow and scroll inside the form, with the action footer kept accessible.

## Regression review, November 13, 2026

`7c139f51` (also landed as `610e573e`) changed the shared token from 40/44px to 48px and added a `:root .studio-app` minimum over all buttons and swatches. That specificity overrode compact component dimensions, including the help labels repeated above creator fields. `afbbec85` adjusted fields, mirror strips and scene reservations around the larger minimum. Restoring contextual geometry removes the cause of the desktop overflow while preserving the Nude switch, model controls, measured caption clearance and Inspector content measurement.

The regression check measures the creator body for actual overflow in dark and light themes. Existing creator tests cover compact layouts, touch targets, Frame/Auto alignment, direction arrows, toolbars and footer reachability. Scene geometry and the full end-to-end suite cover the shared sizing correction. No paid generations are needed.

## Guidance

[Apple buttons guidance](https://developer.apple.com/design/human-interface-guidelines/buttons) recommends 44 by 44 point hit regions; [Android accessibility guidance](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) recommends 48 by 48 dp. These native logical units are useful guidance, not a requirement to give every visible web control the same dimensions. Preserve clear keyboard focus, usable touch targets and the room needed to complete the task.
