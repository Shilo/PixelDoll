# Startup profile against the bundle size warning, November 9, 2026

The 535 KB startup chunk recorded on the board card no longer exists. The on-demand sheets and paid pipelines (`aa9d8601`, `4af0241b`, October 25) already cut it to **452 KB minified (157 KB gzip)**, and `npm run build` no longer prints Vite's 500 KB warning. `chunkSizeWarningLimit` is still unset, so the warning stays visible if the chunk grows again. Profiling shows that startup time is dominated by the serial request chain, not by the chunk's size, so no further lazy loading was added. Instead, the build now emits `modulepreload` hints for the startup chunks, which cuts time to a mounted Studio by about 11 to 16 percent on throttled profiles without changing first paint, chunk sizes or what runs in a frame.

## Build sizes

`npm run build` at `f4a0b0fa`, Node 25.0.0 locally (sizes are what Vite reports, gzip and brotli recomputed at maximum level):

| File | Minified | gzip | brotli |
| --- | ---: | ---: | ---: |
| `bootstrap-*.js` (startup chunk) | 452.4 KB | 157.0 KB | 133.4 KB |
| `bootstrap-*.css` | 88.2 KB | 17.3 KB | 15.2 KB |
| `ExportSheet-*.js` (lazy) | 103.0 KB | 35.2 KB | 30.9 KB |
| `fit-*.js` (lazy) | 60.2 KB | 19.6 KB | 17.5 KB |
| `create-*.js` (lazy) | 51.0 KB | 17.9 KB | 16.0 KB |

All other chunks are under 35 KB. Startup loads six scripts (about 162 KB transferred): `appearance.js`, `install.js`, the entry, the preload helper, `startup-update` (two small chunks) and `bootstrap` (two chunks, one 350 bytes).

## What the startup chunk contains

A throwaway Vite config in the scratchpad reused `app/vite.config.ts` and read each module's rendered (pre-minification) length from `generateBundle`; no dependency was added. The startup chunk holds 268 modules:

| Group | Rendered KB |
| --- | ---: |
| `svelte` runtime | 167.4 |
| `src/lib/items` (75.0 in `items.ts`) | 90.7 |
| `src/studio/experience` | 69.9 |
| `src/lib/pixellab` (40.2 in `queue.ts`) | 58.2 |
| `src/studio/state.svelte.ts` | 56.2 |
| `@floating-ui/*` | 44.1 |
| `@lucide/svelte` icons | 42.3 |
| Share (`SharePopover`, `shareMedia.ts`, `gifenc`) | 47.4 |
| PWA (`pwa.ts`, `PwaRuntime`, `PwaNotice`) | 20.9 |
| `ApiPeek` | 17.4 |

Export and engine writers, dev-only pages (`src/ui/`), self-tests and the shared-design sheets (`DesignSaveSheet`, `DesignPreview`, `FitDesignSheet`) are already separate lazy chunks. The only sizable code clearly not needed for first paint is Share's GIF encoding (`shareMedia.ts` plus `gifenc`, about 30 KB rendered, roughly 8 KB gzip). `ApiPeek` and the PWA runtime are part of always-visible toolbar and update UI.

## Startup timing before the change

A Playwright script launched Chromium (Playwright 1.65.0) against `vite preview` of the production build on `127.0.0.1`. Each run used a fresh context with the HTTP cache disabled, `pixeldoll.agentKey` set to `off`, the welcome dismissed and every `*.pixellab.ai` request aborted, so no token or generation was involved. "Mounted" is when `#startup-message` is removed after `mount(App)`. Long tasks are those that started before mount. Values are medians of 7 runs at 1280 x 800 on an i7-13700K.

| Profile | FCP | Mounted (range) | LCP | Startup chunk fetch | Long tasks (max) | Script time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Unthrottled | 32 ms | 82 ms (78 to 99) | 92 ms | 11 ms | 0 | 36 ms |
| 4x CPU, Fast 4G (150 ms, 9 Mbps) | 568 ms | 1,313 ms (1,281 to 1,333) | 1,328 ms | 341 ms | 196 ms (149 ms) | 105 ms |
| 6x CPU, Slow 4G (563 ms, 1.6 Mbps) | 1,848 ms | 4,337 ms (4,298 to 4,383) | 4,356 ms | 1,521 ms | 348 ms (264 ms) | 203 ms |

Script time is Chrome's `ScriptDuration` through mount plus 1.5 seconds. FCP is the static "Opening your workspace" message in `index.html`, so first paint never waits for the startup chunk.

A Slow 4G waterfall shows where the 4.3 seconds go: the document arrives at about 0.85 s, then four serial round trips of about 0.59 s each (`appearance.js`, the entry, `startup-update`, then `bootstrap`). The startup chunk request starts at about 2.68 s and finishes at about 4.2 s, then evaluation and mount take about 0.4 s. At this profile each 10 KB of gzip costs about 60 ms of transfer.

## Lazy loading: not worth it

The chunk is already 48 KB under the warning, and the one clean lazy-loading candidate (Share's GIF encoding, about 8 KB gzip) would save about 50 ms (about 1 percent) on Slow 4G and nothing measurable on faster profiles, within the run-to-run range above.

## Change: preload the startup chunks

`main.ts` reaches the startup code only through awaited dynamic imports (`startup-update` first, then `bootstrap`), so the browser discovered each chunk one round trip after the previous one. A small build-only plugin in `app/vite.config.ts` (`startupPreload`) adds `<link rel="modulepreload">` for the entry chunk's dynamic imports and their static imports: both `startup-update` chunks and both `bootstrap` chunks. The entry's static import (the preload helper) already had Vite's own hint. Lazy sheets are not preloaded.

`modulepreload` only fetches and compiles. Evaluation still happens when `main.ts` imports each chunk, so the frame guard and the awaited `startup-update` order are unchanged. The links go at the end of `<body>`: a first attempt in `<head>` mounted just as fast but competed with the parser-blocking `install.js`, delaying the static startup message's first paint from about 0.57 s to 0.74 s on Fast 4G and from 1.85 s to 2.44 s on Slow 4G.

### Before and after

The same script ran two interleaved rounds (before, after, before, after) of 7 runs per profile. "Before" was the same build with the four hints removed from a copy of `index.html`, served by a second preview. Values are medians per round.

| Profile | FCP before | FCP after | Mounted before (range) | Mounted after (range) |
| --- | ---: | ---: | ---: | ---: |
| Unthrottled | 32 ms | 28 to 36 ms | 92 ms (89 to 143) | 79 to 80 ms (71 to 175) |
| 4x CPU, Fast 4G | 568 to 596 ms | 588 ms | 1,306 to 1,393 ms (1,286 to 1,546) | 1,165 to 1,166 ms (1,126 to 1,230) |
| 6x CPU, Slow 4G | 1,856 to 1,876 ms | 1,864 to 1,872 ms | 4,638 to 4,719 ms (4,432 to 4,895) | 3,889 to 3,941 ms (3,690 to 4,125) |

The first unthrottled "before" round was disturbed by other machine load (median 631 ms, range up to 3.6 s) and is excluded. Throttled ranges do not overlap, so the gain is beyond the noise: about 0.15 to 0.23 s on Fast 4G and 0.7 to 0.8 s on Slow 4G. In the Slow 4G waterfall the startup chunk request now starts at about 1.83 s (with `install.js`'s round trip) instead of 2.68 s, and finishes at about 3.36 s instead of 4.0 s. Long tasks and script time are unchanged, as expected for a network-only change.

The remaining chain is the document, the parser-blocking `appearance.js`, then the entry and the preloaded chunks in parallel. Moving the theme script or the `startup-update` await is a separate design decision and was not attempted.

Incidental finding, not changed: the waterfall shows `fixtures/s2/fixture.json` and `fixtures/s2/layers/body/base/main/walk.png` each fetched five times concurrently right after mount. Those fetches come after the Studio is visible, so they do not affect the numbers above.

## Verification

- Framed page (same-origin host page with an iframe, as in `auth.spec.ts`): the frame shows only the "Open PixelDoll in its own tab" link and fetched all four preloaded chunks, but the bootstrap CSS was never requested and no `pixeldoll` IndexedDB database was created. A top-level load of the same build requested the CSS and created the database. So the preloaded bootstrap is fetched, not evaluated, in a frame.
- `npm run build`: dist guard clean; the PWA worker's precache list still includes `index.html` and every chunk.
- `npm run check`: 0 errors, 0 warnings.
- `npm test`: 171 of 172 files passed. `test/unit/item-trial.test.ts` ("target palettes change only the edit or transfer palette condition...") failed while other agents had uncommitted edits in `src/lib` and `src/studio`. Vitest does not load `vite.config.ts`, so this change cannot affect it.
- End-to-end: `npm run e2e -- pwa pwa-startup experience-parity auth` passed 61 of 61 in the final run. Two earlier runs during heavy concurrent machine load had timeouts: 3 PWA update tests in the first run, then 1 (`updates in an already-used tab ...`, 90 s test timeout) in a `pwa pwa-startup` rerun. Each failing test then passed on its own (the last one three times with `--repeat-each 3`), and two further full `pwa pwa-startup` runs with the hints passed 38 of 38 each.
