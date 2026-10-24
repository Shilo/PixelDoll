# Production input parity verification

2026-10-23. Compared the approved [round-six prototype](../design/2026-10-22-redesign/round-6-prototype/main.js) with the real Studio, independently of the earlier workflow migration tests. This record covers behavior and offline regression checks; it does **not** certify complete visual parity.

## Six focused browser cases

[experience-parity.spec.ts](../../app/test/e2e/experience-parity.spec.ts) passed **6/6 together in 32.5 seconds** against the normal development server at `http://127.0.0.1:5207`, using managed Chromium and isolated browser storage.

| Case | Verified behavior |
| --- | --- |
| Screen and overlay focus | Selection starts focused; Enter opens a focused world; Escape dismisses an open prompt before returning to Characters. Creator fields retain native editing, and Cancel restores its opener. |
| Preview keyboard | Releasing one chord key recomputes facing; opposite keys cancel; releasing all keys retains facing. Requested clip, pause preference and stationary position survive. Stale key repeats cannot restart input after focus changes. |
| Moves and Side-scroller | Selecting a move preserves paused Preview. Missing coverage retains the selected clip/facing as a still. Side-scroller starts with a declared horizontal facing, while returning to Preview preserves its requested facing. |
| Resize | Resizing releases held movement without teleporting the actor. An explicit view change still resets world position. |
| Selection wheel | Three real local projects, created through offline ZIP import, exercise wrapping. Tests cover line/page normalization, the 40px threshold, 180ms cooldown/expiry, burst rejection, direction reversal, and native Shift/Ctrl/horizontal gestures and open menus. |
| Two-finger equipment | Real CDP touch input keeps the first finger moving while a second equips Wizard hat. A second-finger drag exceeding 8px does not activate equipment. |

All PixelLab traffic was blocked. No real credentials, paid requests or external project writes were used. Focused configuration includes both the existing experience suite and these six cases; final production browser verification is recorded separately.

## Native versus fallback touch proof

A separate probe used the same current component and identical real touch sequence in two fresh contexts. For the native-only context, a browser route removed exactly the four added document listener registrations from the locally served compiled component response. Repository source and other handlers were unchanged.

| Input handling | Wizard hat equipped after second-finger tap | First-finger joystick remained active |
| --- | --- | --- |
| Native only; four fallback listeners disabled | No | Yes |
| Fallback enabled | Yes | Yes |

The corrected CDP sequence ends the **second finger** with `touchEnd` containing that finger's point; it does not supply the remaining owner. An earlier diagnostic used the wrong ending point and was not accepted as proof. The corrected comparison demonstrates why the fallback is retained. It checks target identity, disabled state, movement distance and cancellation, and suppresses the matching compatibility click.

Local browser evidence: `app/test-results-migration/parity-all-verified/` and `app/test-results-migration/parity-touch-verified/` (ignored test artifacts).

## Offline checks and source challenge

- Full Vitest suite: **79 files passed; 770 tests passed, one existing test skipped; 50.74 seconds**. Executables were explicitly verified as **Node 24.22.1** and **npm 11.19.1**. The pinned runtime was prepended to PATH; workspace TEMP/TMP avoided Windows cache-rename problems. No escalation was needed for this unit run.
- Svelte/TypeScript checks: zero errors and zero warnings. Changed-file whitespace checks passed.
- Final source review covered input cleanup, native control guards, playback preference, wheel accumulation, painted-frame fitting, renderer caches, sky invalidation and reflection pivot placement. No additional blocking source regression was found.
- The painted union is used only for stable fitting across poses. Rendering and export retain their full compositor frames and original pixels. Missing or malformed bounds fall back conservatively; the reflection mask changes only a separate copy, leaving actor pixels unchanged.

Relevant sources: [WorldStage](../../app/src/studio/experience/WorldStage.svelte), [Experience](../../app/src/studio/experience/Experience.svelte), [Moves](../../app/src/studio/Moves.svelte), [painted bounds](../../app/src/studio/experience/bounds.ts), [ground and fitting](../../app/src/studio/experience/ground.ts). See the [broader integration record](production-experience-2026-10-23.md) for separately scoped production checks.
