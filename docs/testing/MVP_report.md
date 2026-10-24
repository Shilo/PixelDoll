# MVP report: PixelDoll Studio (B6, 2026-10-21)

Scope: the first real app UI on top of the M1–M5 libraries. Route `#/` (the old research Home moved to `#/dev`; `#/m1`–`#/m5`
and `#/selftest` are unchanged). Look A only (PLAN D9): native minimal, system font, Lucide icons (`@lucide/svelte` 1.61.0),
dark by default with a persisted light switch. No pixel fonts or pixel icons.

## 1. What was built (`app/src/studio/`, 24 files)

| Area | Files | Notes |
|---|---|---|
| Shell, size classes, keyboard, clock | `Studio.svelte`, `state.svelte.ts` | expanded ≥ 1024 (sidebar + stage + inspector), medium 600–1023 (stage + inspector, wardrobe as drawer), compact phone (stage 44 dvh + panel + floating tab bar + job accessory), landscape (stage left, segmented column). One playback clock. Keys: Space, `,` `.`, `1`–`8`, `0`, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+Alt+I |
| Toolbar | `Toolbar.svelte` | wardrobe toggle, logo, character switcher (native `popover` menu: characters, New character…, PixelLab key, Activity, Welcome, Developer pages), undo/redo with labels, job ring, balance (`1,356 gens`) or Connect, theme switch, Export (primary), inspector toggle |
| Wardrobe | `Wardrobe.svelte`, `GroupIcon.svelte`, `Thumb.svelte` | 8 user groups over the 16 slots (D1 §4.1), + per group, items with cropped integer-scaled thumbnails, wear check, generating rows with progress ring, Outfits (save current, apply, delete, "Current" badge), random look |
| Stage | `Stage.svelte`, `Sprite.svelte` | integer **device-pixel** zoom (backing store k device px per sprite px, CSS size = cell·k/DPR, so 1.25/1.5 DPR stays crisp), fit by default, checker squares = 8 sprite px, plain background toggle, floating bar: play/pause, move picker, S/E/N/W segmented, all-directions grid, zoom (desktop) |
| Inspector | `Inspector.svelte`, `ItemPane.svelte`, `Colors.svelte`, `Moves.svelte`, `GenCard.svelte` | Item: status badge (Clean / Needs a look / Made for another body / Demo), item alone in 4 directions (union crop, scaled), Wear/Take off, Try again, Remove (confirm), colors, layer order (forward/backward, all or this direction, reset), "When worn, hide" chips, Details (QA metrics, prompt, extractor, cost, coverage gaps, route). Colors: the **real exact ramp swap** (`lib/dress` `variantRampOf` + `recolor`), each swatch drawn as its ramp steps, any-color picker, Random, Reset. Moves: animated thumbnails + playlist details |
| Phone | `PhonePanel.svelte` | slot chips, tiles (None / items / generating / New), selected item row with ⓘ → item sheet |
| Sheets (native `<dialog>`) | `Sheet.svelte` + `ConnectSheet`, `CreateSheet`, `NewItemSheet`, `ExportSheet`, `ActivitySheet` | centered on desktop, bottom sheet with grabber on phones, trailing panel in landscape; Esc and backdrop close |
| Create character | `create.ts`, `CreateSheet.svelte` | describe + skin + build → **Create · 24 gens** → steps (Drawing / Animating idle and walk n/6 / Finding joints n/34 / Saving) → review (walk in 4 directions) → Start dressing up. Pipeline: `create-character-v3` 48 px → one managed `skeleton-v3` call per (idle, walk) × (S, E, N) (S4 truncation guard) → frames placed with the S2 pad (x+8, y+16) → `buildRig` → `estimate-skeleton` per unique cell (reuses M2's ledger cache) → anchors → `projects/rig-<hash>` (same record layout as M2). Seeded, so a reload re-attaches to the ledger instead of paying again |
| New item | `itemRoute.ts`, `NewItemSheet.svelte` | one `ItemRoute` interface (plan / draft / run / accept / spent) → B4's `lib/items/run.ts`. "Where does it go?" group chips, "What is it?", idea chips, color hint, Details (name, exact slot, call plan) → **Make · N gens** from `planItem` + `planGens` (28 gens on the skeleton route for idle+walk × 3 dirs). The demo explains that items need your own character and offers "Copy the demo body" (writes the fixture into IndexedDB as an editable rig) |
| Item review | `GenCard.svelte` | progress from the ledger, then the preview (draft worn, 4 directions, animated), QA reasons in words, Keep it / Try again · N gens / Discard |
| Export | `ExportSheet.svelte` | Godot / Unity / Phaser / PNG + JSON cards (remembered), "Includes …", warnings, Details (baked composites toggle, file list); the zip is built when the sheet opens so the button names its size (`Download zip · 158 KB`) |
| Activity | `ActivitySheet.svelte` | balance, paused-queue notice with action, Generating / Waiting / Recent with time and cost, Stop/Cancel, session spend; Details: parallel calls, clear finished, raw ledger table |
| First run | `Welcome.svelte` | demo character walking on the hero stage, "Create your character" (primary), "Try the demo", 4-step strip; shown until dismissed (localStorage), reachable from the menu |
| Model helpers + self-test | `model.ts` (registered in `lib/selftests.ts` as `studio/model`) | groups, `itemCell`, `cropAll`, `place`, base prompt, health, plain-language QA reasons |
| Tokens | `studio.css` | colors as tokens on `:root` (dark) and `[data-theme="light"]`; `prefers-contrast: more` and `prefers-reduced-motion` variants; touch density via `pointer: coarse`; a future theme (Paper) is one more `[data-theme]` block |

Data: the bundled S2 demo opens with no key (`fixture:s2`, dress state in its side record); own characters are IndexedDB
`rig-*` projects. Every edit (wear, color, outfits, layer order, hides) is one undo entry (dress-state snapshot) and is
autosaved 400 ms later through `lib/dress/project.ts saveDress` (re-reads the record, so M3/M4 writes survive).

## 2. Tests

| # | What | Result |
|---|---|---|
| 1 | `npm run check` | 0 errors, 0 warnings (svelte-check 209 files + tsc) |
| 2 | `npm run build` | ok, 355 KB JS / 123 KB gz, 34 KB CSS (Lucide tree-shaken per icon) |
| 3 | `npm run selftest` | all pass, incl. new `studio/model` (frame placement for 48/64/68/80 canvases, crop, names, groups) |
| 4 | `node app/scripts/e2e-studio.mjs` (Playwright, demo, no key) | wear swaps the slot item · undo/redo (button + Ctrl+Shift+Z) · recolor changes stage pixels · save outfit marked Current · keys `2` / `0` · theme switch · **outfit, colors, presets and theme survive a reload** · export downloads `adventurer-godot.pixeldoll.zip` (192 KB, has `manifest.json`, `godot/`, `layers/head/hat_wizard/`) · no page errors |
| 5 | `node app/scripts/shoot-mvp.mjs` | 110 screenshots: 11 screens × 5 devices × dark/light (below) |
| 6 | Live create-character in the built-in browser (isolated origin, see §4) | **done end-to-end**: "a sturdy young dwarf with a friendly face", tan, stocky → base 2 gens + 6 skeleton-v3 calls (3 gens each) + 34 skeletons (3.4 gens) ≈ 23.4 gens, ~11 min wall time (PixelLab was busy with B4's 20+ jobs); 0 rig warnings; frozen as `rig-1e5fa1d4809a`, opened in the Studio |
| 7 | Live New item on that character | **done end-to-end**: Head → "iron knight helmet" → Make · 28 gens (B4's skeleton route: 1 dress call + 6 pose calls) → design call passed → B4's gates re-rolled call 3 (G2 key kept 0.94–0.96) and calls 5/6 (G10 misregistered 1 px) automatically → review (worn in 4 directions, "Needs a look: some body pixels were changed") → Keep it → auto-worn, recolored to gold in all directions → Export Godot `Download zip · 68 KB` |
| 8 | Live spend (ledger of the isolated origin) | character 23.4 gens (base 2 + 6 × 3 + 34 × 0.1); helmet 49 gens instead of 28: ≈ 9 from legitimate auto re-rolls, ≈ 12–15 from the duplicate-runner bug (§3 #12), the rest from re-rolls that the duplicates triggered. Total ≈ 72 gens. Timings: base 185 s, skeleton-v3 per direction 93–282 s, pose calls 70–184 s |
| 9 | Dev routes after the change | `#/dev`, `#/m1`, `#/m4`, `#/m5`, `#/selftest` render; browser self-tests "all self-tests passed"; no page errors |

Screenshot judging (every PNG looked at): desktop 1440 × 900 and 1024 × 768 @1.25 DPR, tablet 768 × 1024 @2, phone
375 × 812 @2, phone landscape 812 × 375 @2, dark and light. Files: `docs/testing/img/mvp_<theme>_<screen>_<device>.png`
with screens `welcome, studio, alldirs, colours, moves, item, export, create, newitem, connect, activity`.
Live run: `mvp_live_1_creating.png`, `mvp_live_2_created_review.jpg`, `mvp_live_3_studio_new_character.jpg`,
`mvp_live_4_new_item_28gens.jpg`, `mvp_live_5_item_generating.jpg`,
`mvp_live_6_phone_generating_before_fix.jpg`, `mvp_live_7_item_review.jpg`, `mvp_live_8_item_kept.jpg`, `mvp_live_9_gold_alldirs.jpg`,
`mvp_live_10_export.jpg` (the browser pane captures at 800 × 500, so these are low-res).

## 3. Bugs found and fixed while testing

1. **Theme switch reverted the outfit.** The Studio's init ran in an `$effect` that read `ui.theme`, so toggling the theme
   re-opened the project from storage and the pending autosave was lost. Init now runs in `onMount` (found by the e2e reload step).
2. **Manifest edits did not re-render** components holding `$derived(store.project.manifest)` (in-place mutation of `$state.raw`
   data keeps the same reference). Each edit now swaps in a new top-level project object.
3. Tablet (medium): the canvas bar was wider than the stage (zoom group pushed the background button outside, the move picker
   collapsed to "W…"). Zoom/background now only on the expanded layout; the move picker has a minimum width; 36 px direction buttons on touch.
4. Inspector direction strip wrapped W onto a second row and showed the item at 1× (tiny). Now one row, union-cropped and scaled up to 6×.
5. Move thumbnails were the whole 64 px cell shrunk to 32 px on 2× phones; now a fixed 56 px window shown 1:1 (no per-frame jitter).
6. New item on the demo rendered an empty footer bar; the footer is now omitted there.
7. Colors header wrapped into three lines in the 300 px inspector; shortened and kept the actions on one row.
8. Svelte a11y warnings: `role="img"` moved from `<canvas>` to a wrapper span; radios no longer carry `aria-pressed`; the tab bar is a `div[role=tablist]`.
9. After connecting a key from "Create", the sheet closed and hid the progress; it now returns to the progress view.
10. The New item price used a flat 10 gens/call; it now asks B4's `planItem`/`planGens` (skeleton route: 28 gens, not 70).
11. Export file name used the fixture's internal name (`s2_adventurer`); it now uses the character name.
12. **Duplicate item runners (cost real gens).** Re-mounting the Studio (HMR during development, but any remount) called
    `loadGens()` again, which replaced the drafts with their stored copies and started a second `runItem` on the same draft;
    the runners re-rolled the same calls independently (call 3 ran 7×) and one switched the key to magenta. I cancelled the
    strays, re-pointed the draft at the green results by hand (logged in the draft) and accepted it. Fix: drafts load once per
    page and a module-level set allows one runner per draft id; `resumeCreate()` is guarded the same way.
13. The review said "Every frame passed the checks" before any QA existed (after a reload); it now says "Checking the frames…"
    and Keep it waits for QA.
14. Phone: the generating tile looked selected like "None", and the job accessory duplicated the progress card right above it;
    the tile now has its own selection style and the accessory hides while that card is on screen.
15. Default character name was the first two words ("Sturdy young"); it is now the noun of the first phrase ("Dwarf").
16. A brand-new character showed "Nothing selected"; the inspector now says "Your character is ready" with "Add your first item".

## 4. Known gaps and risks

- **Multi-tab queue (pre-existing, `lib/pixellab/queue.ts`)**: no cross-tab lock. A second tab with a key submits the other
  tab's `queued` records (double spend) and its `load()` rewrites their `submitting` records to `lost`. For the live run I used
  a separate dev server (`npx vite --port 5174`, own IndexedDB) because B4 had 26 M3 jobs queued in the shared origin.
  Fix: Web Locks leader + periodic ledger sync for followers.
- Undo covers the dress state only. Generations cannot be undone; Remove is permanent (with a confirm), no 8 s undo toast yet.
  "Try again" opens New item prefilled; it does not keep versions of one item.
- Character names are guessed from the description ("Dwarf"); rename is not built. The live test character is still called "Sturdy young" (made before the fix).
- No "Add a move" (run/attack need the base and every item animated again; S3/S4 route exists in the libs).
- Time estimates are fixed formulas, not ledger medians; no "Notify me when done"; no offline banner.
- Color material names are hue words from k-means ("Orange", "Yellow"), sometimes odd (a dark outline ramp named Yellow).
- Thumbnails/sprites recompute per frame on the main thread; fine for ≤ 8 items, not profiled beyond.
- Phone landscape is tight (as in D2); sheets become a trailing panel and need scrolling for Create.
- The browser-pane screenshots of the live run are 800 × 500 captures; the Playwright set is full resolution but uses the demo.
- The live character ("Sturdy young", `rig-1e5fa1d4809a`, with the gold iron helmet) lives in the built-in browser's IndexedDB
  for origin `http://localhost:5174` (the isolated test server, now stopped), not in the shared `:5173` origin.
