# Production experience verification — 2026-10-23

Scope: real PixelDoll Studio on `feat/game-experience-rework`, following the approved Obsidian / Porcelain Bronze prototype. [Implementation contract](../design/production-experience.md). [Direct screenshot gallery](production-experience-gallery.html).

## Verification

- TypeScript/Svelte checks: zero errors and warnings.
- Production build and credential distribution guard: pass. Vite reports the existing large application chunk and the intentionally non-module, early appearance script; the script ships unchanged as a public asset and executes before application modules.
- Unit suite: 78 files, 758 passed, one skipped. A sandbox attempt failed before collecting tests because Windows denied temporary-cache renames; the complete offline run outside that sandbox passed.
- Focused production browser suite: **17/17 passed**, 31.6 seconds, against the final built app on port 5208 (`bootstrap-D__NoZ9A.js`). Refreshed 26 screenshots, including all 20 screen/device/theme combinations. Zero uncaught errors or attempted PixelLab requests.
- Existing workflow cases adapted to the new navigation: **98/98 enabled cases passed** across serialized runs and targeted correction reruns, none skipped or outstanding. API peek 8; authentication 4; character creator 27; characters/import 12; creator request matrix 6; export picker 1; shared equipment 6; Studio 28; concurrency 3; selftests 3. Reruns are not double-counted. Latest correction evidence is under `app/test-results-migration/{final-targeted,final-auth-and-workflows,final-studio-verified}`. Payment, storage and credential assertions remain in place.
- Independent GPT-6.1 Sol High challenge: source, screenshots, DOM bounds and actions. Chromium and installed WebKit 2359 smoke checks verified native focus restoration, stored light mode before initialization, compact Inspect with four/eight directions, and landscape equipment menus. This is not a claim of exhaustive testing on every browser/device.
- Paid API requests: none. Browser tests use blocked or synthetic PixelLab responses, isolated storage and stored demo artwork. Mocked creation/repair checks verify orchestration and UI behavior, not fresh model output quality.

## Confirmed findings and corrections

1. **Import layout collision:** the new landing list reused an existing import-library class. Renamed the presentation class; library pagination and controls remain in their original layout.
2. **Short-phone space:** reserved actual painted-sprite space between identity/view controls and equipment; short phones start with a usable expanded equipment area. Tests cover collapsed and expanded states at 320×568 and 390×844.
3. **Inspect overlap:** moved the complete precise viewer into a native modal. Compact transport uses native direction selection, wraps and measures its own height, keeping All directions accessible.
4. **Offscreen equipment menu:** native top-layer popovers now anchor to their real trigger and clamp to the viewport, with internal scrolling. Tested Held item at 844×390.
5. **Focus and navigation:** explicit activation tracking fixes WebKit pointer dialog closure; Escape repeats cannot cascade through two screens. Popovers return focus without stealing it from an outside control. Editable fields and native Tab behavior retain their own keyboard interaction.
6. **Creator mirror styling:** both sides of attached mirror/direction controls use the same Bronze field/joined recipes. The diagram uses a theme token instead of a separate blue palette.
7. **Missing artwork and thumbnails:** Preview keeps requested facing and clip while reporting Still. Original/rest-only thumbnails receive the same raw-source/variant handling as the main renderer, so saved recolors remain consistent.
8. **Real touch movement:** trusted touch tests revealed a reactive reset accidentally subscribed to joystick state. Reset is now untracked; the full blank world has a touch-owned hit area beneath UI, while equipment scrolling remains native.
9. **Coverage-message placement:** live coverage details use viewport positioning, avoiding accidental overlap with the mobile character heading.
10. **Empty search and theme initialization:** no false 1/0 selection or enabled Customize action on an empty result; saved Light/Dark is restored before application startup.
11. **Built background URLs:** production CSS resolved relative scene URLs under the asset folder. Scene URLs now resolve against the page and Vite base, including GitHub Pages subpaths. Final captures use the built app, not only the development server.
12. **Sprite frame fitting:** fit the complete pivot-relative frame, including oversize equipment, inside available space. Keep integer physical-pixel scaling when it fits; very large imported sprites may minify with nearest-neighbor sampling on short phones.
13. **Original-rest equipment coverage:** a stored original west pose can differ from mirrored east animation artwork. Rest fallback now requires the matching authored equipment cell; explicit transparent cells remain valid.
14. **Mobile Redo and selection centering:** restored Redo through More on phones. Scoped navigation-button dimensions so the selected name centers with the actor instead of inheriting a 40px grid. Tests assert the name's center at both desktop and phone sizes.
15. **Inspect scroll bounds:** reserve the toolbar outside the art's scroll viewport, preventing automatic scrolling from bringing a direction cell underneath playback controls.
16. **Completion versus cancellation:** closing Import/Setup no longer implicitly changes screens. Only successful import or Start dressing up enters Studio. Ctrl+Alt+I now opens/closes the real Inspect modal instead of toggling an obsolete panel flag.

## Evidence and reproduction

The focused suite captures Characters, Create, Preview, Top-down and Side-scroller at 1440×900 and 390×844, in both appearances. Additional captures cover short-phone equipment/inspection and landscape menus. PNGs remain local under `app/test-results/experience/`; the gallery links directly to the unmodified files.

From `app/`, use the pinned runtime and run `npm run check`, `npm test`, `npm run build`, then the standard Playwright suite. Run the focused suite with `BASE=http://127.0.0.1:5208 npx playwright test --config playwright.experience.config.ts` against a normal `vite preview` server. Never use the agent-key server for these offline regressions.

Windows sandboxed browser runs intermittently canceled even a diagnostic 20-byte Blob download and stalled local asset requests. Verified reruns use the same blocked API routes outside the sandbox and/or workspace TEMP/TMP. Failures were diagnosed rather than bypassed with forced clicks, disabled tests or relaxed payment assertions.
