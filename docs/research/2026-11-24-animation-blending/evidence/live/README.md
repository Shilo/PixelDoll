# Moving attack browser evidence

The test ran in an incognito T3 preview at 1440 × 900 and 390 × 844 against the local Vite server. The preview did not deliver continuous native animation frames while hidden. A test-only timer drove the real stage update, and each action screenshot paused that callback on the captured frame. No application files, generated art, or stored projects were changed through the browser.

The stock Adventurer demo has no hip geometry. It visibly played a full attack with `hip` as the fallback reason. For the positive case, the preview supplied the offline diagnostic's integer hip positions for South Walk and Cross punch in memory. The app then performed the split, equipment checks, registration, rendering and movement normally.

| Case | Observation | Screenshot |
| --- | --- | --- |
| Stock demo | Whole-body South attack, `hip` fallback, scale 0.8. | [01](01-stock-demo-hip-fallback.png) |
| Layered South | Walk and attack shared South. Fit camera scale 1 at desktop and mobile. One visible sword at zoom after the fix. | [06](06-mobile-layered-south.png), [07](07-desktop-layered-south.png), [08](08-desktop-zoomed-layered.png) |
| Mismatched facing | Walk East with a South attack selected full body, `direction`, scale 0.8. | [09](09-desktop-mismatched-facing.png) |
| Switch off | Waist control disappeared. The same grounded attack selected full body, `disabled`, scale 0.8. | [10](10-desktop-switch-off-settings.png), [11](11-desktop-disabled-full-action.png) |
| Controls and help | Switch started checked and Waist displayed Automatic at 0. The minus control reached -1 and plus returned to 0. Desktop mouse hover and mobile-width focus and activation showed the respective help. Escape closed the tooltip. Both rows fit the 343 px content area at 390 px viewport width. | [02](02-desktop-settings.png), [03](03-desktop-layering-tooltip.png), [04](04-mobile-settings.png), [05](05-mobile-waist-tooltip.png) |
| Slowdown and gait | The host reported 1 → 0.8 → 1. The action visited all six authored cells. Walk cells visited 1–5 while it played and reached 6 afterward. | [07](07-desktop-layered-south.png), [11](11-desktop-disabled-full-action.png) |
| Mounted action | The rider attacked South on the saddle while the mount faced East and visited all four gait cells. The fallback was `mounted`, and the travel scale stayed 1. | [12](12-desktop-mount-east-rider-south.png) |
| Side-scroller | East Walk continued. The demo reported `missing east` for Cross punch, so it had no action to show. The four-facing demo provides no diagonal art. | [13](13-side-scroller-unavailable-attack.png) |
| Reopen | Leaving the character and reopening it retained the enabled switch and Waist -1. | DOM observation |

The first zoomed capture showed the walk sword surviving below the cut alongside the attack sword. The lower stack now contains only the walking body and lower-body clothing. The sword and cape are taken whole from the attack. [Before](00-before-fix-duplicate-sword.png) and [after](08-desktop-zoomed-layered.png).

The preview reported zero console warnings, zero console errors and zero failed requests in the final run. Reduced-motion emulation and a native touch device were unavailable in this preview. The timer-driven observations cover gait continuity and the travel factor. Perceived foot sliding at the browser's native frame cadence remains unverified.
