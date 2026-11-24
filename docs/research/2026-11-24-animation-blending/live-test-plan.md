# Live browser and visual test plan

Date: 2026-11-24
Owner: coordinator, using the T3 preview browser against a local dev server
Purpose: prove the layered attack in the real app, not only in unit tests and contact sheets.

## Setup

- Run `npm run dev` from `app/` (Vite, port 5173) in the background. No PixelLab mode and no paid calls; use the bundled demo character.
- Open the Live view at desktop size and at 390 px width. Capture console errors and failed requests.
- Save screenshots under `docs/research/2026-11-24-animation-blending/evidence/live/`.

## Cases

1. **Layered walk plus attack.** Walk east continuously, attack south, and confirm: the legs keep stepping east, the upper body attacks south, the character does not slide with planted feet, and the walk phase does not restart after the attack. Capture at 1x and zoomed.
2. **Fallback when the facing differs.** Walk east and attack east while the attack has no matching data, or use a character/move without hip geometry, and confirm the whole-body attack plays with the old behavior and an honest reason.
3. **Switch off.** Turn "Walk while attacking" off and confirm the old slide returns, with no layout shift and no leaked state.
4. **Waist control.** Confirm it appears only when the switch is on, changes the cut in the expected direction, shows "Automatic" at 0, and has a readable tooltip on hover, focus and touch.
5. **Tooltips.** Read both tooltips in the settings page; confirm the text explains the technique in plain language, is localized, is keyboard reachable, and closes on Escape.
6. **Slowdown on foot.** Measure or observe travel with and without an attack: about 80 percent while a grounded attack plays, back to 100 percent after. Attack animation speed unchanged.
7. **Mounted attack.** Attack while mounted and confirm: the mount keeps its travel facing and gait, only the rider turns to the aim, the rider stays on the saddle, and travel speed is not reduced.
8. **Side-scroller and diagonals.** Repeat the layered case in Side-scroller mode and in a diagonal facing if the character has one. Note fallbacks rather than assuming.
9. **Small screen and reduced motion.** Repeat the core case at 390 px width and with reduced motion enabled. No clipping, no console errors, controls remain reachable.
10. **Reopen the character.** Leave and re-enter the Live view; the switch and Waist value persist per character, and the API default remains off outside the app.

## Evidence

Per case: a screenshot with the visible result and, where relevant, the host data attributes (layered or not, fallback reason, mount facing, travel speed). Record pass, fail or unverified, and any artifact by name. A failing case is reported, not cropped out.
