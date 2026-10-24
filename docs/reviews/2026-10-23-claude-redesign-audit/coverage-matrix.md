# Coverage matrix

Companion to [README.md](README.md).

**Evidence types:**
- **A**: automated (script assertion or measurement).
- **M**: manually inspected screenshot or live page.
- **R**: read from source.
- **H**: helper-agent result, spot-checked.

**Status:** ✔ tested · ◐ partial · ✘ not tested · n/a.

There was no physical-device testing and no assistive-technology testing (screen reader, switch, voice) in this audit.

## 1. Screens × appearance × viewport (prototype)

**Viewports** (each run in both appearances, all five screens):
- 320×500, 390×844, 450×800
- 568×320, 844×390
- 768×1024, 1024×768
- 1280×720, 1366×768, 1469×889, 1920×1080, 2560×1440

Engine: Chromium (A + M). A WebKit pass covered the existing regression and polish suites and the keyboard probe ([suites](evidence/suites/)).

| Screen | Dark | Light | Phone portrait | Short landscape | Tablet | Desktop | 200% zoom | Forced colours | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Selection | ✔ M/A | ✔ M/A | ◐ overlap at 320×500 (F4) | ◐ heading overlaps actors | ✔ | ✔ | ◐ overlap | ✔ | **Keep desktop/tablet; improve small screens and keyboard (F2, F4)** |
| Creator | ✔ | ✔ | ✔ scrolls; cramped at 320×500 | ✔ | ✔ | ✔ | ✔ | ✔ | **Improve** (F10 select icon, F17, F18); representative only |
| Preview | ✔ | ✔ | ✘ actor hidden at 320×500 | ◐ prompt over actor | ✔ | ✔ | ◐ playback covers stage | ✔ | **Keep composition; improve playback and keyboard (F1, F3, F4, F10)** |
| Top-down | ✔ + motion | ✔ + motion | ◐ | ◐ | ✔ | ✔ | ✘ | ✘ | **Improve** (F5, F8, reflection) |
| Side-scroller | ✔ + motion | ◐ (still only) | ◐ | ◐ | ✔ | ✔ | ✘ | ✘ | **Improve** (F8 hint copy) |
| Wardrobe tab | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ◐ | ✔ | **Keep** (tiles, None, check mark) |
| Colors tab | ✔ (gallery) | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Replace** content (F16) |
| Outfits tab | ✔ (gallery) | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** naming (F16) |
| Moves tab | ✔ (gallery) | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** (F16) |
| More menu / theme toggle | ✔ | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** focus (F3) |
| Additional equipment popup | ✔ | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** focus (F3) |
| Character chooser | ✔ | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** focus (F3) |
| Prompt disclosure | ✔ | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** focus (F3); hover expansion absent (documented gap) |
| Dialogs (About, Export, Animation, Help) | ✔ | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** focus return (F3) |
| Toasts | ✔ | ✔ | ✔ | — | — | ✔ | ✘ | ✘ | **Improve** lifecycle (F8) |
| Native select popup | ◐ computed + gallery capture | ◐ | ✘ | ✘ | ✘ | ◐ | ✘ | ✘ | **Improve** (F10); OS pickers not certified |

"—" means the state was covered at the other sizes and not recaptured for this column.

## 2. Input and behaviour

| Behaviour | Result | Evidence |
| --- | --- | --- |
| Tab order, selection screen | ✔ logical, wraps through body | A, keyboard-probe case A |
| Tab in studio | ✘ **trapped**: switches views (F1) | A, case D |
| Enter on focused selection controls | ✘ hijacked (F2) | A, cases B, C, C3 |
| Focus after activation | ✘ lost to body (F3) | A, case E |
| Popover focus in/out | ✘ not moved (F3) | A, case F; R |
| Modal dialog containment and Escape | ✔ native; ◐ focus return | A, case H |
| Escape in editable field | ✘ leaves the creator (F18) | A, case G |
| Backspace on a focused button | ◐ leaves the studio (F18) | A, case K |
| Preview arrows/WASD facing | ✔ | A, case I; existing `verify.mjs` |
| Continuous keyboard movement, diagonal normalization, stop | ✔ | A, gameplay probe |
| Camera follow | ✔ smooth (response 9/s) | A |
| Side-scroller ignores vertical | ✔ | A |
| Equipment change while moving | ✔ movement continues | A, case J |
| Mouse joystick: release outside world | ✔ stops | A |
| Drag starting on UI does not move | ✔ | A |
| Multi-touch second-finger equipment, pointer cancel | ◐ existing suite only | existing `verify.mjs`, not re-run on a device |
| Non-drag touch movement alternative | ✘ absent (F5) | R |
| Hat hide on north / restore on south, notice | ✔ | A |
| Idle-missing notice lifecycle | ✘ stale while walking (F8) | A + M |
| 1/2/4/8-direction and irregular rigs | ◐ unit tests only (12 pass) | A, motion.test.mjs |
| Reduced motion | ◐ not honoured; Pause exists | A |
| Theme persistence and first paint | ◐ persists; dark flash (F11) | A |
| Frame pacing | ◐ headless p50 16.7 ms, p95 16.8 ms, max 50 ms; not GPU-representative | A |
| DPR 1 / 1.25 / 1.5 / 2 sprite integrity | ✘ uneven at 1.25 (F9) | A |
| Physical touch, screen reader, OS zoom, virtual keyboard, safe areas | ✘ not tested | n/a |
| Long, Unicode and RTL names; failed asset load | ✘ no safe hook without editing source | n/a |

## 3. Control family × state (production need → prototype → Bronze)

**Prototype:** a works · b shown but unconnected · c absent · d out of scope.
**Bronze:** e CSS recipe · f Svelte component · g showcase only · h nothing.

The production evidence is in the Studio inventory below.

| Family | Production states needed | Prototype | Bronze | Audit verdict |
| --- | --- | --- | --- | --- |
| Buttons/links/icon buttons | default, hover, pressed, disabled, busy text, danger, cost suffix, focus | a (pressed, disabled) | e (busy only in g; no cost or link) | **Keep** visuals; add busy and cost recipes |
| Text/search/password/textarea | default, disabled, long, maxlength | a (no password) | e, f Field (readonly, invalid) | **Keep**; F13 box-sizing |
| Number/unit/Auto/joined | px suffix, Auto toggle → manual on type, joined mirror | b (readonly Auto: diverges) | e (`bu-unit`, `bu-joined`); g shows a third Auto behaviour | **Improve**: unify Auto semantics |
| Select | toolbar-quiet, boxed, disabled, disabled options | a | e (base-select) | **Improve** (F10) |
| File | visible, hidden-behind-button, size error | c | e, g | Insufficient evidence |
| Colour picker | native picker over swatch | c | e (separate input only) | **Improve** (needs overlay variant) |
| Checkbox/switch | gating actions, disabled | c | e | **Keep** |
| Radio/choice groups | icon cards, disabled "added" chips, pressed chips | a (presets, compass) | e; f ChoiceGroup is text-only | **Improve** |
| Tabs | segmented (5+ places), icon tab bar, chips with counts, roving creator tabs | a (pressed buttons, not tablist) | e (underline only) | **Improve**: segmented recipe |
| Rows/tiles/thumbnails | selected ≠ worn, hover secondary action, pending ring | a (single pressed state) | e (single pressed) | **Improve**: worn state |
| Swatches/ramps | radio ramps, "Any", follows | b | e (`aria-pressed` swatch, image ramp) | **Improve** semantics |
| Disclosure/code/table/request data | disclosure, kv, file list, ledger, nested request fields | c | e; RequestFields only in g | Insufficient evidence |
| Badges/notices | pills, counts, notice with action, neutral tone | b (coverage note) | e, f Notice (title required) | **Improve** |
| Progress/jobs/queue | ring, bar, steps with error, queue states | c | e (no ring or error step) | **Improve** / insufficient |
| Tooltips/popovers/toasts | help tooltip, menu popover, API popover, toast, banner | a (own popovers, toast) | e, f Help | **Improve** focus (F3); Help a11y (H) |
| Modals/sheets/confirmations | sheet shell, phone/landscape sheets, busy lock, inline confirm | b (one info dialog) | e, f Dialog (no shell; F12) | **Improve** |
| Validation/errors | summary + disabled submit | c | e, f (ahead of production) | Keep in Bronze; prototype absent |
| Empty states | 8 production empty states | a (one) | g | Insufficient evidence |

## 4. Bronze UI package checks

| Check | Result |
| --- | --- |
| Installed 0.2.0 equals `d811d35` byte-for-byte; exports resolve; `.d.ts` present | ✔ H (ran) |
| Hostile host without `base.css` (Chromium, WebKit) | ✘ box-sizing and font leaks (F13), H (ran) |
| Busy Dialog repeated Escape | ✘ closes on third press (F12), H (ran) |
| Forced colours, reduced transparency, `@supports` fallbacks | ✔ H (ran) + A (prototype) |
| Showcase tabs × dark/light × 1440/390, no horizontal scroll | ✔ A + M |
| Showcase fidelity to the product | ✘ (F14) M + R |
| Docs vs source | ✘ drift (F15) H + R |
| Firefox | ✘ not launchable in this environment |
| Package `npm test` | Not run: it writes into the live checkout's `.evidence/` |

## 5. Studio inventory: corrections to `round-7-theme/control-inventory.md`

From the read-only inventory helper, spot-checked:
- Export now has six targets in two groups. The `.engine` class no longer exists.
- Production does use a native radio (`ExportSheet.svelte:94`).
- Bronze now ships info tone and readonly/invalid recipes.
- Most `studio.css` line references have drifted by 2–4 lines.
- Still correct: there is no `:active` recipe, no range slider, and no readonly or `aria-invalid` in production.
